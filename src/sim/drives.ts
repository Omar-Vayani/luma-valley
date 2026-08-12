/**
 * drives — the chemistry a Luma is trying to quiet down.
 *
 * This is the part of the design taken most directly from Creatures (1996):
 * behaviour is not scripted, it is whatever turned out to reduce a drive last
 * time. Each drive rises on its own clock and falls when the right thing
 * happens. The brain never sees "you are hungry, go eat" — it sees eight
 * numbers, and it learns which action makes them smaller.
 *
 * Keep this list short. Every drive added is another dimension the brain has
 * to learn in, and eight is already enough to produce a personality.
 */
import { clamp01 } from './rng'

export const DRIVE_KEYS = [
  'hunger', 'thirst', 'fatigue', 'loneliness', 'boredom', 'fear', 'pain', 'cold',
] as const

export type DriveKey = (typeof DRIVE_KEYS)[number]

export type Drives = Record<DriveKey, number>

/** Human-readable, for the neural interface. */
export const DRIVE_LABEL: Record<DriveKey, string> = {
  hunger: 'Hunger',
  thirst: 'Thirst',
  fatigue: 'Fatigue',
  loneliness: 'Loneliness',
  boredom: 'Boredom',
  fear: 'Fear',
  pain: 'Pain',
  cold: 'Cold',
}

/** How a Luma would put it, which is not the same as the label. */
export const DRIVE_FEELING: Record<DriveKey, string> = {
  hunger: 'hungry',
  thirst: 'thirsty',
  fatigue: 'tired',
  loneliness: 'lonely',
  boredom: 'bored',
  fear: 'frightened',
  pain: 'hurting',
  cold: 'cold',
}

/**
 * How fast each drive climbs, per second, at a metabolism of 1. Fear and pain
 * are not on a clock — they are events — so they only decay.
 */
const RISE: Drives = {
  hunger: 0.0045,
  thirst: 0.0060,
  fatigue: 0.0030,
  loneliness: 0.0055,
  boredom: 0.0090,
  fear: 0,
  pain: 0,
  cold: 0,
}

/** How fast each drive falls on its own, per second. */
const DECAY: Drives = {
  hunger: 0,
  thirst: 0,
  fatigue: 0,
  loneliness: 0,
  boredom: 0,
  fear: 0.030,
  pain: 0.045,
  cold: 0.020,
}

/**
 * How much each drive contributes to overall discomfort. This weighting is
 * the reward function: an action is "good" exactly insofar as it lowers this
 * number. Fear and pain dominate, which is why a frightened Luma stops caring
 * about being bored.
 */
const WEIGHT: Drives = {
  hunger: 1.0,
  thirst: 1.1,
  fatigue: 0.8,
  loneliness: 0.7,
  boredom: 0.45,
  fear: 1.8,
  pain: 2.2,
  cold: 0.8,
}

export function createDrives(seedNoise: (key: DriveKey) => number = () => 0): Drives {
  const d = {} as Drives
  for (const k of DRIVE_KEYS) {
    d[k] = k === 'fear' || k === 'pain' || k === 'cold' ? 0 : clamp01(0.15 + seedNoise(k) * 0.25)
  }
  return d
}

/** Raise the clock-driven drives and let the event-driven ones settle. */
export function tickDrives(d: Drives, dt: number, metabolism: number): void {
  for (const k of DRIVE_KEYS) {
    if (RISE[k] > 0) d[k] = clamp01(d[k] + RISE[k] * metabolism * dt)
    if (DECAY[k] > 0) d[k] = clamp01(d[k] - DECAY[k] * dt)
  }
}

export function relieve(d: Drives, key: DriveKey, amount: number): void {
  d[key] = clamp01(d[key] - amount)
}

export function aggravate(d: Drives, key: DriveKey, amount: number): void {
  d[key] = clamp01(d[key] + amount)
}

/**
 * One number for how badly things are going. The brain's whole job is to make
 * this go down; the difference between two samples of it is the reward.
 */
export function discomfort(d: Drives): number {
  let total = 0
  let weight = 0
  for (const k of DRIVE_KEYS) {
    total += d[k] * WEIGHT[k]
    weight += WEIGHT[k]
  }
  return total / weight
}

/** The drive shouting loudest right now, which is what a Luma will mention. */
export function loudestDrive(d: Drives): { key: DriveKey; value: number } {
  let key: DriveKey = 'boredom'
  let best = -1
  for (const k of DRIVE_KEYS) {
    const v = d[k] * WEIGHT[k]
    if (v > best) {
      best = v
      key = k
    }
  }
  return { key, value: d[key] }
}
