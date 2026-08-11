/**
 * beliefs — what a creature THINKS is true, with confidence and provenance.
 *
 * Beliefs are separate from facts-in-the-world: a creature can be wrong, can
 * hold a belief it was told rather than saw, and can revise it when evidence
 * contradicts it. Confidence decays slowly so untested beliefs soften.
 *
 * Habits are the behavioral twin: repeating an action strengthens a bias
 * toward repeating it again, independent of momentary utility.
 */
import { clamp01 } from './util'

export type BeliefSource = 'seen' | 'told' | 'inferred' | 'guessed'

export interface Belief {
  /** stable key, e.g. "place:food:hasFood" or "who:3:thief" */
  key: string
  /** the believed value in -1..1 (negative = believes the opposite) */
  value: number
  /** 0..1 how sure the creature is */
  confidence: number
  source: BeliefSource
  /** tick of the last update — old untested beliefs fade */
  updated: number
  /** how many times evidence supported it */
  support: number
}

export type BeliefStore = Record<string, Belief>

const BELIEF_CAP = 48
const CONFIDENCE_DECAY = 0.0008

/** How much weight a source carries when forming/updating a belief. */
const SOURCE_WEIGHT: Record<BeliefSource, number> = {
  seen: 1,
  told: 0.45,
  inferred: 0.6,
  guessed: 0.25,
}

export function createBeliefs(): BeliefStore {
  return {}
}

export function getBelief(store: BeliefStore, key: string): Belief | undefined {
  return store[key]
}

/** What the creature currently thinks, 0 if it has no opinion. */
export function believedValue(store: BeliefStore, key: string): number {
  const b = store[key]
  if (!b) return 0
  return b.value * b.confidence
}

/** True only when the creature is reasonably sure of a positive belief. */
export function believes(store: BeliefStore, key: string, threshold = 0.4): boolean {
  const b = store[key]
  return !!b && b.value > 0 && b.confidence >= threshold
}

/**
 * Record evidence for a belief. Direct sight overwrites hearsay; contradicting
 * evidence first erodes confidence, and only flips the belief once confidence
 * collapses — so creatures change their minds, but not instantly.
 */
export function observeEvidence(
  store: BeliefStore,
  key: string,
  value: number,
  source: BeliefSource,
  tick: number,
): Belief {
  const weight = SOURCE_WEIGHT[source]
  const existing = store[key]
  if (!existing) {
    const fresh: Belief = {
      key,
      value: Math.max(-1, Math.min(1, value)),
      confidence: clamp01(0.3 * weight + 0.2),
      source,
      updated: tick,
      support: 1,
    }
    store[key] = fresh
    prune(store)
    return fresh
  }

  const agrees = Math.sign(existing.value) === Math.sign(value) || existing.value === 0
  if (agrees) {
    existing.value = Math.max(-1, Math.min(1, existing.value + value * 0.25 * weight))
    existing.confidence = clamp01(existing.confidence + 0.18 * weight)
    existing.support++
  } else {
    // contradiction: shake confidence first, flip only when it bottoms out
    existing.confidence = clamp01(existing.confidence - 0.3 * weight)
    if (existing.confidence < 0.16) {
      existing.value = Math.max(-1, Math.min(1, value))
      existing.confidence = clamp01(0.25 * weight)
      existing.support = 1
    }
  }
  // seeing something yourself upgrades the provenance
  if (source === 'seen') existing.source = 'seen'
  existing.updated = tick
  return existing
}

/** Untested beliefs soften over time (mild forgetting, not deletion). */
export function tickBeliefs(store: BeliefStore, tick: number): void {
  for (const key of Object.keys(store)) {
    const b = store[key]
    const stale = tick - b.updated
    if (stale > 200) b.confidence = clamp01(b.confidence - CONFIDENCE_DECAY)
    if (b.confidence <= 0.02) delete store[key]
  }
}

function prune(store: BeliefStore): void {
  const keys = Object.keys(store)
  if (keys.length <= BELIEF_CAP) return
  keys.sort((a, b) => store[a].confidence - store[b].confidence)
  const drop = keys.length - BELIEF_CAP
  for (let i = 0; i < drop; i++) delete store[keys[i]]
}

// ── generalization ────────────────────────────────────────────────────────

/**
 * Generalize from specific experiences: several agreeing beliefs sharing a
 * prefix produce a weaker category belief ("shops tend to have stock").
 */
export function generalize(store: BeliefStore, prefix: string, categoryKey: string, tick: number): void {
  const matches = Object.values(store).filter((b) => b.key.startsWith(prefix) && b.confidence > 0.3)
  if (matches.length < 2) return
  const avg = matches.reduce((sum, b) => sum + b.value, 0) / matches.length
  observeEvidence(store, categoryKey, avg, 'inferred', tick)
}

// ── habits ────────────────────────────────────────────────────────────────

export type HabitStore = Record<string, number>

const HABIT_GAIN = 0.06
const HABIT_DECAY = 0.0015
const HABIT_CAP = 16

export function createHabits(): HabitStore {
  return {}
}

/** Doing something makes doing it again slightly more likely. */
export function reinforceHabit(habits: HabitStore, action: string, amount = HABIT_GAIN): void {
  habits[action] = clamp01((habits[action] ?? 0) + amount)
  const keys = Object.keys(habits)
  if (keys.length > HABIT_CAP) {
    keys.sort((a, b) => habits[a] - habits[b])
    delete habits[keys[0]]
  }
}

/** Habits fade when the behavior stops. */
export function tickHabits(habits: HabitStore): void {
  for (const key of Object.keys(habits)) {
    habits[key] = clamp01(habits[key] - HABIT_DECAY)
    if (habits[key] <= 0.01) delete habits[key]
  }
}

/** The utility bonus a habit contributes to its action (small but real). */
export function habitBias(habits: HabitStore, action: string): number {
  return (habits[action] ?? 0) * 0.35
}

// ── deception ─────────────────────────────────────────────────────────────

export interface DeceptionCheck {
  /** true when the speaker intends to mislead */
  lying: boolean
  /** 0..1 how convincing the lie is */
  plausibility: number
}

/**
 * Would this creature lie right now? Low honesty pressure comes from need,
 * spite, greed, and low trust toward the listener; loyalty and affection
 * push the other way. Lying is a choice, not a personality label.
 */
export function decideToLie(
  speaker: {
    genome: { theft: number; loyalty: number; aggression: number }
    emotions: { spite: number; resentment: number }
    chem: { hunger: number; fear: number }
  },
  trustInListener: number,
  stakes: number,
): DeceptionCheck {
  const temptation =
    speaker.genome.theft * 0.45 +
    speaker.emotions.spite * 0.3 +
    speaker.emotions.resentment * 0.2 +
    (1 - speaker.chem.hunger) * 0.25 * stakes +
    speaker.chem.fear * 0.15
  const restraint = speaker.genome.loyalty * 0.5 + Math.max(0, trustInListener) * 0.4
  const lying = temptation - restraint > 0.25
  const plausibility = clamp01(0.35 + speaker.genome.theft * 0.4 - speaker.chem.fear * 0.2)
  return { lying, plausibility }
}

/**
 * Does the listener catch the lie? Suspicion, familiarity, and contradicting
 * beliefs help; a plausible liar and high affection hurt.
 */
export function detectLie(
  listener: {
    genome: { learning: number };
    emotions: { paranoia: number }
  },
  edge: { suspicion: number; familiarity: number; affection: number },
  plausibility: number,
  contradictsBelief: boolean,
): boolean {
  const skill =
    listener.genome.learning * 0.35 +
    listener.emotions.paranoia * 0.3 +
    edge.suspicion * 0.35 +
    edge.familiarity * 0.2 +
    (contradictsBelief ? 0.35 : 0)
  const cover = plausibility * 0.6 + edge.affection * 0.25
  return skill > cover
}
