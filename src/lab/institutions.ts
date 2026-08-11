/**
 * institutions — each place keeps its own money, and keeps its own hours.
 *
 * Until now the settlement had one shared purse and every door was open
 * forever. Both hid consequences: a shop could pay wages it had never earned,
 * and nobody's day had a shape. Now the coins a customer spends sit in that
 * building's till, wages come out of it, and a place that has taken nothing
 * cannot pay its worker.
 */
import type { TowerId } from './world'

export interface Institution {
  tower: TowerId
  /** coins taken today, minus wages paid out */
  till: number
  /** fraction of the day this place is open, as [start, end) in 0..1 */
  opens: number
  closes: number
}

export type Institutions = Record<string, Institution>

/** Ticks in one full day/night cycle at the default six ticks per second. */
export const DAY_LENGTH = 1200

const HOURS: { tower: TowerId; opens: number; closes: number; float: number }[] = [
  // the market keeps the longest hours: going hungry because a door shut is
  // a frustration, not a story
  { tower: 'food', opens: 0.12, closes: 0.94, float: 6 },
  { tower: 'tavern', opens: 0.45, closes: 0.98, float: 4 },
  { tower: 'pharmacy', opens: 0.22, closes: 0.8, float: 4 },
  { tower: 'bank', opens: 0.25, closes: 0.75, float: 8 },
  { tower: 'school', opens: 0.25, closes: 0.7, float: 4 },
  { tower: 'tools', opens: 0.25, closes: 0.8, float: 4 },
  { tower: 'work', opens: 0.18, closes: 0.85, float: 6 },
  { tower: 'farm', opens: 0.15, closes: 0.85, float: 6 },
  // the clinic never closes; nor do homes, the park, or the graveyard
]

export function createInstitutions(): Institutions {
  const out: Institutions = {}
  for (const h of HOURS) {
    out[h.tower] = { tower: h.tower, till: h.float, opens: h.opens, closes: h.closes }
  }
  return out
}

/**
 * Where we are in the day, 0 at dawn through 1 at the end of night.
 * A new world opens in the middle of the morning rather than before sunrise,
 * so the first thing a player sees is a settlement already at work.
 */
const DAY_OFFSET = 0.5

export function timeOfDay(tick: number): number {
  return ((tick / DAY_LENGTH) + DAY_OFFSET) % 1
}

export function isNight(tick: number): boolean {
  const t = timeOfDay(tick)
  return t < 0.12 || t > 0.9
}

/** Is this place open right now? Anything without listed hours always is. */
export function isOpen(institutions: Institutions, tower: string, tick: number): boolean {
  const inst = institutions[tower]
  if (!inst) return true
  const t = timeOfDay(tick)
  return t >= inst.opens && t < inst.closes
}

/** How long until it opens again, in ticks (0 when it is open now). */
export function ticksUntilOpen(institutions: Institutions, tower: string, tick: number): number {
  const inst = institutions[tower]
  if (!inst) return 0
  if (isOpen(institutions, tower, tick)) return 0
  const t = timeOfDay(tick)
  const wait = t < inst.opens ? inst.opens - t : 1 - t + inst.opens
  return Math.round(wait * DAY_LENGTH)
}

/** A customer pays; the money stays in this building's till. */
export function takePayment(institutions: Institutions, tower: string, amount: number): void {
  const inst = institutions[tower]
  if (!inst) return
  inst.till += amount
}

/**
 * Pay a worker out of the till. A place that has taken nothing pays nothing —
 * which is how a failing shop becomes a worker's problem.
 */
export function payFromTill(institutions: Institutions, tower: string, wage: number): number {
  const inst = institutions[tower]
  if (!inst) return wage // places with no till (odd jobs) pay from thin air
  const paid = Math.min(wage, Math.max(0, Math.floor(inst.till)))
  inst.till -= paid
  return paid
}

export function tillOf(institutions: Institutions, tower: string): number {
  return Math.round(institutions[tower]?.till ?? 0)
}

/** Trade slowly brings a little custom in from the road. */
export function tickInstitutions(institutions: Institutions, tick: number): void {
  if (tick % 240 !== 0) return
  for (const inst of Object.values(institutions)) {
    inst.till += 2
  }
}

/** For the society panel: which doors are shut at this hour. */
export function closedNow(institutions: Institutions, tick: number): string[] {
  return Object.values(institutions)
    .filter((inst) => !isOpen(institutions, inst.tower, tick))
    .map((inst) => inst.tower)
}
