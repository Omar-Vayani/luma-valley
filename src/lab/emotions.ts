/**
 * emotions — the expressive emotional spectrum.
 *
 * Beyond the raw chemistry (chem.ts) and the derived display mood (emotion.ts),
 * creatures carry social/self-conscious emotions that modulate the utility
 * mind's action scores, colour dialogue, and respond to events:
 *
 *   positive: joy, curiosity, loyalty, affection, forgiveness, pride,
 *             gratitude, hope
 *   negative: envy, resentment, paranoia, spite, shame, guilt, frustration
 *
 * Every value is 0..1, decays slowly each tick, and is plain JSON-safe so
 * saves round-trip trivially.
 */
export type EmotionKey =
  | 'joy'
  | 'curiosity'
  | 'loyalty'
  | 'affection'
  | 'forgiveness'
  | 'pride'
  | 'gratitude'
  | 'hope'
  | 'envy'
  | 'resentment'
  | 'paranoia'
  | 'spite'
  | 'shame'
  | 'guilt'
  | 'frustration'

export type EmotionState = Record<EmotionKey, number>

export const EMOTION_KEYS: EmotionKey[] = [
  'joy', 'curiosity', 'loyalty', 'affection', 'forgiveness', 'pride', 'gratitude', 'hope',
  'envy', 'resentment', 'paranoia', 'spite', 'shame', 'guilt', 'frustration',
]

/** Emotions that fade fast vs those that linger (grudges outlive good moods). */
const DECAY_RATES: Partial<Record<EmotionKey, number>> = {
  joy: 0.005,
  frustration: 0.006,
  hope: 0.003,
  pride: 0.003,
  gratitude: 0.002,
  guilt: 0.0015,
  shame: 0.0015,
  resentment: 0.001,
  spite: 0.002,
}
const DECAY = 0.004

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

export function createEmotions(): EmotionState {
  const e = {} as EmotionState
  for (const k of EMOTION_KEYS) e[k] = 0
  return e
}

/** Emotions fade toward zero each tick (a grudge cools, joy settles). */
export function tickEmotions(e: EmotionState): void {
  for (const k of EMOTION_KEYS) e[k] = clamp01(e[k] - (DECAY_RATES[k] ?? DECAY))
}

/** Raise (or lower, with a negative amount) one emotion. */
export function applyEmotionFeedback(e: EmotionState, kind: EmotionKey, amount: number): void {
  e[kind] = clamp01(e[kind] + amount)
}

/**
 * Appraisal: an event is interpreted against expectation and responsibility,
 * producing the self-conscious emotions the vision asks for.
 *
 * - `outcome` -1..1 (bad → good)
 * - `expected` -1..1 what the creature anticipated
 * - `selfCaused` 0..1 how responsible the creature feels
 * - `harmedOther` 0..1 whether someone else paid the price
 */
export function appraise(
  e: EmotionState,
  outcome: number,
  expected: number,
  selfCaused: number,
  harmedOther = 0,
): void {
  const surprise = outcome - expected
  if (outcome > 0) {
    applyEmotionFeedback(e, 'joy', Math.min(0.3, outcome * 0.25))
    if (selfCaused > 0.5) applyEmotionFeedback(e, 'pride', outcome * 0.2 * selfCaused)
    if (surprise > 0.2) applyEmotionFeedback(e, 'hope', surprise * 0.2)
  } else if (outcome < 0) {
    applyEmotionFeedback(e, 'frustration', Math.min(0.3, -outcome * 0.3))
    applyEmotionFeedback(e, 'hope', outcome * 0.1) // hope erodes
    if (selfCaused > 0.5) applyEmotionFeedback(e, 'shame', -outcome * 0.2 * selfCaused)
  }
  if (harmedOther > 0.3 && selfCaused > 0.4) {
    applyEmotionFeedback(e, 'guilt', harmedOther * selfCaused * 0.3)
  }
}

/** Risk appetite shift from the current emotional mix (−0.4..+0.4). */
export function emotionalRiskBias(e: EmotionState): number {
  const bold = e.pride * 0.3 + e.hope * 0.25 + e.spite * 0.2 + e.frustration * 0.15
  const timid = e.shame * 0.3 + e.guilt * 0.2 + e.paranoia * 0.35
  return Math.max(-0.4, Math.min(0.4, bold - timid))
}
