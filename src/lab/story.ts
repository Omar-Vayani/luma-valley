/**
 * story — the events worth noticing, and why they happened.
 *
 * The simulation constantly produces small changes; almost none of them are
 * worth the player's attention. This module keeps only the moments that
 * changed something socially, records the reason the actor chose it, and
 * ranks them so a quiet moment can still surface the best story available.
 *
 * Nothing here invents anything: every entry is written by the system that
 * actually performed the act, from state that exists.
 */
import type { Creature } from './creature'

export type StoryKind =
  | 'theft'
  | 'betrayal'
  | 'violence'
  | 'generosity'
  | 'birth'
  | 'death'
  | 'partnership'
  | 'separation'
  | 'grief'
  | 'work'
  | 'shortage'
  | 'refusal'
  | 'debt'
  | 'promise'
  | 'broken-promise'
  | 'mentorship'
  | 'mediation'
  | 'manipulation'
  | 'alliance'
  | 'arrival'
  | 'reconciliation'

export interface StoryEvent {
  id: number
  tick: number
  kind: StoryKind
  actorId?: number
  actorName?: string
  targetId?: number
  targetName?: string
  /** what happened, in one plain sentence */
  text: string
  /** why the actor did it, captured at the moment of the act */
  because?: string
  /** 0..1 — how much this mattered to the settlement */
  significance: number
  /** how many times this same thing has happened between these two */
  repeats?: number
}

export interface StoryLog {
  events: StoryEvent[]
  nextId: number
  /** tick the player last reviewed the feed */
  lastSeenTick: number
}

const CAP = 120

/** Baseline importance per kind, before per-event adjustment. */
const BASE_SIGNIFICANCE: Record<StoryKind, number> = {
  death: 0.95,
  birth: 0.85,
  betrayal: 0.8,
  partnership: 0.75,
  separation: 0.7,
  violence: 0.65,
  mediation: 0.6,
  theft: 0.6,
  shortage: 0.6,
  grief: 0.55,
  mentorship: 0.5,
  alliance: 0.5,
  reconciliation: 0.5,
  manipulation: 0.5,
  'broken-promise': 0.5,
  refusal: 0.4,
  debt: 0.4,
  arrival: 0.4,
  generosity: 0.35,
  promise: 0.3,
  work: 0.15,
}

export function createStoryLog(): StoryLog {
  return { events: [], nextId: 1, lastSeenTick: 0 }
}

export interface StoryInput {
  kind: StoryKind
  tick: number
  actor?: Creature
  target?: Creature
  text: string
  because?: string
  /** nudge the baseline importance for this particular event */
  weight?: number
}

/** How long the same pair doing the same thing counts as one running story. */
const REPEAT_WINDOW = 2500

/**
 * Record a notable moment. Routine actions must not come through here.
 *
 * The fifth theft by the same creature from the same victim is not five
 * pieces of news, it is one story getting worse — so repeats fold into the
 * existing entry and make it weightier rather than flooding the feed.
 */
export function recordStory(log: StoryLog, input: StoryInput): StoryEvent {
  const base = BASE_SIGNIFICANCE[input.kind] ?? 0.3

  if (input.actor && input.target) {
    const existing = log.events.find((e) =>
      e.kind === input.kind &&
      e.actorId === input.actor?.id &&
      e.targetId === input.target?.id &&
      input.tick - e.tick < REPEAT_WINDOW)
    if (existing) {
      existing.repeats = (existing.repeats ?? 1) + 1
      existing.tick = input.tick
      existing.because = input.because ?? existing.because
      existing.text = repeatedText(input, existing.repeats)
      existing.significance = Math.min(1, existing.significance + 0.08)
      return existing
    }
  }

  const event: StoryEvent = {
    id: log.nextId++,
    tick: input.tick,
    kind: input.kind,
    actorId: input.actor?.id,
    actorName: input.actor?.name,
    targetId: input.target?.id,
    targetName: input.target?.name,
    text: input.text,
    because: input.because,
    significance: Math.max(0, Math.min(1, base * (input.weight ?? 1))),
  }
  log.events.push(event)
  if (log.events.length > CAP) {
    // drop the least significant of the oldest half, never the recent tail
    const half = log.events.slice(0, Math.floor(log.events.length / 2))
    const weakest = half.reduce((a, b) => (a.significance <= b.significance ? a : b))
    log.events = log.events.filter((e) => e !== weakest)
  }
  return event
}

/** A running story, phrased as the pattern it has become. */
function repeatedText(input: StoryInput, repeats: number): string {
  const a = input.actor?.name ?? 'someone'
  const b = input.target?.name ?? 'someone'
  switch (input.kind) {
    case 'theft':
      return `${a} has now robbed ${b} ${repeats} times`
    case 'betrayal':
      return `${a} keeps betraying ${b} — ${repeats} times now`
    case 'violence':
      return `${a} has attacked ${b} ${repeats} times`
    case 'generosity':
      return `${a} keeps giving to ${b} (${repeats} times)`
    case 'mentorship':
      return `${a} has been teaching ${b} (${repeats} lessons)`
    case 'manipulation':
      return `${a} keeps working on ${b} with warm words`
    default:
      return `${input.text} (×${repeats})`
  }
}

/**
 * The best stories right now: significance, freshened by recency, and thinned
 * so one kind of event cannot fill the whole feed. News is what is new.
 */
export function topStories(log: StoryLog, now: number, limit = 6): StoryEvent[] {
  const ranked = [...log.events].sort((a, b) => scoreFor(b, now) - scoreFor(a, now))
  const chosen: StoryEvent[] = []
  const seenKind = new Map<StoryKind, number>()
  // first pass: at most two of any one kind, so the feed stays varied
  for (const e of ranked) {
    const used = seenKind.get(e.kind) ?? 0
    if (used >= 2) continue
    seenKind.set(e.kind, used + 1)
    chosen.push(e)
    if (chosen.length >= limit) return chosen
  }
  // second pass: fill any remaining space with whatever is left
  for (const e of ranked) {
    if (chosen.includes(e)) continue
    chosen.push(e)
    if (chosen.length >= limit) break
  }
  return chosen
}

function scoreFor(e: StoryEvent, now: number): number {
  const age = Math.max(0, now - e.tick)
  const recency = 1 / (1 + age / 600)
  return e.significance * 0.65 + recency * 0.35
}

/** Everything that shaped one individual, oldest first. */
export function lifeStory(log: StoryLog, creatureId: number, limit = 8): StoryEvent[] {
  return log.events
    .filter((e) => e.actorId === creatureId || e.targetId === creatureId)
    .sort((a, b) => b.significance - a.significance)
    .slice(0, limit)
    .sort((a, b) => a.tick - b.tick)
}

/** What changed since the player last looked. */
export function storiesSince(log: StoryLog, tick: number, limit = 8): StoryEvent[] {
  return log.events
    .filter((e) => e.tick > tick)
    .sort((a, b) => b.significance - a.significance)
    .slice(0, limit)
    .sort((a, b) => a.tick - b.tick)
}

export function markSeen(log: StoryLog, tick: number): void {
  log.lastSeenTick = tick
}

/**
 * Why is this creature doing this, in a few words?
 *
 * Read straight off the state that drove the decision, so the explanation
 * cannot drift away from the behaviour it describes.
 */
export function explain(c: Creature, action?: string): string {
  if (c.chem.hunger < 0.2) return 'starving'
  if (c.chem.health < 0.35) return 'badly hurt'
  if (c.chem.grief > 0.45) return 'grieving'
  if (c.chem.fear > 0.6) return 'frightened'
  if (c.jealousy > 0.55) return 'jealous'
  if (c.emotions.resentment > 0.5) return 'holding a grudge'
  if (c.emotions.spite > 0.45) return 'feeling spiteful'
  if (c.emotions.guilt > 0.45) return 'guilty about something'
  if (c.chem.hunger < 0.4 && c.wallet < 3) return 'hungry and broke'
  if (c.chem.social < 0.3) return 'lonely'
  if (c.chem.purpose < 0.3) return 'looking for a purpose'
  if (c.emotions.envy > 0.4) return 'envious'
  if (c.emotions.affection > 0.4) return 'fond of them'
  if (c.emotions.gratitude > 0.4) return 'grateful'
  if (action === 'work' && c.job) return `doing the ${c.job}'s work`
  // no pressing need: then it comes down to who they are
  if (action === 'steal') {
    if (c.genome.theft > 0.65) return 'takes what they want'
    if (c.drives.greed > 0.55) return 'wanted more than they had'
    return 'saw an easy opportunity'
  }
  if (action === 'fight') {
    if (c.genome.aggression > 0.65) return 'quick to anger'
    return 'settling something'
  }
  if (c.genome.curiosity > 0.7) return 'curious'
  if (c.genome.sociability > 0.7) return 'sociable by nature'
  return 'nothing pressing — just their way'
}

/** Compact one-line rendering for feeds. */
export function formatStory(e: StoryEvent): string {
  return e.because ? `${e.text} (${e.because})` : e.text
}
