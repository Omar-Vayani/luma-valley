/**
 * emotions — the expressive emotional spectrum.
 *
 * Beyond the raw chemistry (chem.ts) and the derived display mood (emotion.ts),
 * creatures carry a small set of *social* emotions that modulate the utility
 * mind's action scores and respond to events:
 *
 *   positive: joy, curiosity, loyalty, affection (deep attachment),
 *             forgiveness
 *   negative: envy, resentment, paranoia, spite
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
  | 'envy'
  | 'resentment'
  | 'paranoia'
  | 'spite'

export type EmotionState = Record<EmotionKey, number>

export const EMOTION_KEYS: EmotionKey[] = [
  'joy', 'curiosity', 'loyalty', 'affection', 'forgiveness',
  'envy', 'resentment', 'paranoia', 'spite',
]

const DECAY = 0.004

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

export function createEmotions(): EmotionState {
  const e = {} as EmotionState
  for (const k of EMOTION_KEYS) e[k] = 0
  return e
}

/** Emotions fade toward zero each tick (a grudge cools, joy settles). */
export function tickEmotions(e: EmotionState): void {
  for (const k of EMOTION_KEYS) e[k] = clamp01(e[k] - DECAY)
}

/** Raise (or lower, with a negative amount) one emotion. */
export function applyEmotionFeedback(e: EmotionState, kind: EmotionKey, amount: number): void {
  e[kind] = clamp01(e[kind] + amount)
}
