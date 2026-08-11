/**
 * chatter — compact creature↔creature communication.
 *
 * Meaning travels as SemanticMessage; natural language is rendered only when
 * the player is close enough to overhear (or inspects the participants). This
 * keeps society-wide talk cheap while still producing readable scenes.
 *
 * Also home to PROMISES: commitments creatures remember, keep, or break.
 */
import type { Creature } from './creature'
import type { IntentKind } from './dialogue'
import { applySocialEvent } from './socialbond'
import { observeEvidence } from './beliefs'
import { decideToLie, detectLie } from './beliefs'
import { edgeTo } from './socialbond'
import { trustTowards } from './reputation'
import { getWord } from './language'
import { clamp01 } from './util'

export interface ChatterMessage {
  kind: IntentKind
  fromId: number
  toId: number
  topic?: string
  /** claim value in -1..1 for belief-forming statements */
  claim?: number
  truthful: boolean
  tick: number
}

export interface Promise_ {
  id: number
  promiserId: number
  promiseeId: number
  /** what was promised, e.g. 'food' | 'help' | 'coin' */
  about: string
  dueTick: number
  kept: boolean | null // null = still open
  madeTick: number
}

export interface ChatterState {
  /** short rolling log for the inspector / overheard rendering */
  recent: ChatterMessage[]
  promises: Promise_[]
  nextPromiseId: number
}

export function createChatter(): ChatterState {
  return { recent: [], promises: [], nextPromiseId: 1 }
}

const LOG_CAP = 60
const EARSHOT = 12

/** Which intent does this creature want to express right now? */
export function pickIntent(c: Creature, other: Creature): IntentKind {
  if (c.chem.hunger < 0.3) return 'request_food'
  if (c.chem.health < 0.4) return 'request_help'
  if (c.chem.fear > 0.55) return 'warn'
  if ((c.social[other.id]?.resentment ?? 0) > 0.45) return 'accuse'
  if ((c.social[other.id]?.attraction ?? 0) > 0.45 && c.partnerId === null) return 'flirt'
  if (c.emotions.guilt > 0.4) return 'apologize'
  if (c.emotions.joy > 0.4 && c.genome.sociability > 0.5) return 'greet'
  if (Object.keys(c.reputation).length > 0 && c.genome.sociability > 0.6) return 'gossip'
  if (c.wallet > 8 && other.wallet < 3) return 'offer_gift'
  return 'talk_small'
}

/**
 * One creature speaks to another. Returns the message so the caller can decide
 * whether to render natural language for the player.
 */
export function speak(
  state: ChatterState,
  speaker: Creature,
  listener: Creature,
  kind: IntentKind,
  tick: number,
  topic?: string,
): ChatterMessage {
  const trust = trustTowards(speaker, listener.id)
  const stakes = kind === 'request_food' || kind === 'request_trade' ? 1 : 0.4
  const lie = decideToLie(speaker, trust, stakes)
  const truthful = !lie.lying

  const msg: ChatterMessage = {
    kind,
    fromId: speaker.id,
    toId: listener.id,
    topic,
    claim: kind === 'warn' ? -0.6 : kind === 'gossip' ? -0.4 : undefined,
    truthful,
    tick,
  }

  // listener reacts: belief update gated by trust + lie detection
  const edge = edgeTo(listener.social, speaker.id)
  const caught = lie.lying && detectLie(listener, edge, lie.plausibility, false)
  if (caught) {
    applySocialEvent(listener.social, speaker.id, 'betray', 0.5)
    listener.emotions.resentment = clamp01(listener.emotions.resentment + 0.15)
    listener.emotions.paranoia = clamp01(listener.emotions.paranoia + 0.1)
  } else {
    applySocialEvent(listener.social, speaker.id, 'talk', 1)
    applySocialEvent(speaker.social, listener.id, 'talk', 1)
    if (msg.claim !== undefined && topic) {
      const believedClaim = truthful ? msg.claim : -msg.claim
      observeEvidence(listener.beliefs, topic, believedClaim * (0.4 + Math.max(0, trust) * 0.6), 'told', tick)
    }
  }

  // social needs are met by talking at all
  speaker.chem.social = clamp01(speaker.chem.social + 0.05)
  listener.chem.social = clamp01(listener.chem.social + 0.05)

  state.recent.push(msg)
  if (state.recent.length > LOG_CAP) state.recent.splice(0, state.recent.length - LOG_CAP)
  return msg
}

/** True when the player is close enough that this exchange deserves words. */
export function inEarshot(
  playerX: number,
  playerZ: number,
  a: Creature,
  b: Creature,
  range = EARSHOT,
): boolean {
  const da = Math.hypot(a.pos.x - playerX, a.pos.z - playerZ)
  const db = Math.hypot(b.pos.x - playerX, b.pos.z - playerZ)
  return Math.min(da, db) <= range
}

/** Render an overheard exchange into a short natural-language line. */
export function renderOverheard(speaker: Creature, listener: Creature, msg: ChatterMessage): string {
  const w = (concept: string) => getWord(speaker.language, concept)
  switch (msg.kind) {
    case 'greet':
      return `${speaker.name} greets ${listener.name}.`
    case 'request_food':
      return `${speaker.name}: "${w('food') ?? 'Food'}… please, ${listener.name}."`
    case 'request_help':
      return `${speaker.name}: "${w('help') ?? 'Help'} me, ${listener.name}."`
    case 'warn':
      return `${speaker.name} warns ${listener.name} about ${msg.topic ?? 'something'}.`
    case 'gossip':
      return `${speaker.name} murmurs to ${listener.name} about ${msg.topic ?? 'someone'}.`
    case 'flirt':
      return `${speaker.name} says something soft to ${listener.name}.`
    case 'accuse':
      return `${speaker.name}: "You wronged me, ${listener.name}."`
    case 'apologize':
      return `${speaker.name} apologizes to ${listener.name}.`
    case 'offer_gift':
      return `${speaker.name} offers ${listener.name} something.`
    case 'promise':
      return `${speaker.name} promises ${listener.name} ${msg.topic ?? 'something'}.`
    default:
      return `${speaker.name} and ${listener.name} talk quietly.`
  }
}

// ── promises ──────────────────────────────────────────────────────────────

export function makePromise(
  state: ChatterState,
  promiser: Creature,
  promisee: Creature,
  about: string,
  tick: number,
  withinTicks = 400,
): Promise_ {
  const p: Promise_ = {
    id: state.nextPromiseId++,
    promiserId: promiser.id,
    promiseeId: promisee.id,
    about,
    dueTick: tick + withinTicks,
    kept: null,
    madeTick: tick,
  }
  state.promises.push(p)
  applySocialEvent(promisee.social, promiser.id, 'talk', 0.5)
  return p
}

/** Mark a promise kept — gratitude and trust follow. */
export function keepPromise(state: ChatterState, id: number, promiser: Creature, promisee: Creature): void {
  const p = state.promises.find((x) => x.id === id)
  if (!p || p.kept !== null) return
  p.kept = true
  applySocialEvent(promisee.social, promiser.id, 'help', 1)
  promiser.emotions.pride = clamp01(promiser.emotions.pride + 0.15)
  promisee.emotions.gratitude = clamp01(promisee.emotions.gratitude + 0.2)
}

/**
 * Overdue promises break themselves; the promisee remembers.
 * Returns the broken ones so the caller can tell that story.
 */
export function tickPromises(
  state: ChatterState,
  tick: number,
  byId: (id: number) => Creature | undefined,
): { promise: Promise_; promiser?: Creature; promisee?: Creature }[] {
  const broken: { promise: Promise_; promiser?: Creature; promisee?: Creature }[] = []
  for (const p of state.promises) {
    if (p.kept !== null || tick < p.dueTick) continue
    p.kept = false
    const promiser = byId(p.promiserId)
    const promisee = byId(p.promiseeId)
    if (promisee && promiser) {
      applySocialEvent(promisee.social, promiser.id, 'betray', 0.5)
      promisee.emotions.resentment = clamp01(promisee.emotions.resentment + 0.2)
      promiser.emotions.guilt = clamp01(promiser.emotions.guilt + 0.25)
    }
    broken.push({ promise: p, promiser, promisee })
  }
  // keep the ledger small: drop resolved promises older than a while
  if (state.promises.length > 40) {
    state.promises = state.promises.filter((p) => p.kept === null || tick - p.madeTick < 800).slice(-40)
  }
  return broken
}

/** Open promises made TO this creature (used by the inspector). */
export function promisesTo(state: ChatterState, id: number): Promise_[] {
  return state.promises.filter((p) => p.promiseeId === id && p.kept === null)
}
