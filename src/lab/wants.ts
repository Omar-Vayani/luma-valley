/**
 * wants — Sims-style desires. Each creature carries one current want derived
 * from its own state (a hungry one wants food, a bored one wants play). Doing
 * the thing the want points at advances progress; completing it grants a
 * happiness spike and the want is replaced. Wants age out so a creature never
 * stays stuck on an impossible goal.
 */

export const WANT_TYPES = ['food', 'play', 'social', 'sleep', 'comfort', 'learn'] as const
export type WantType = (typeof WANT_TYPES)[number]

export interface Want {
  type: WantType
  progress: number // 0..1 toward completion
  age: number // ticks since created
  fulfilled: boolean
}

export const WANT_EXPIRE = 600 // ticks before a want is dropped and replaced

export function createWant(type: WantType): Want {
  return { type, progress: 0, age: 0, fulfilled: false }
}

/** Pick the want that best matches the creature's current needs. */
export function wantForState(s: { hunger: number; energy: number; social: number; pleasure: number }): WantType {
  if (s.hunger < 0.35) return 'food'
  if (s.energy < 0.3) return 'sleep'
  if (s.pleasure < 0.3) return 'play'
  if (s.social < 0.35) return 'social'
  if (s.hunger < 0.6) return 'food'
  return 'comfort'
}

/** Advance progress on a want when the creature does the matching action. */
export function wantProgress(w: Want, action: string): void {
  const match =
    (w.type === 'food' && action === 'eat') ||
    (w.type === 'play' && action === 'play') ||
    (w.type === 'social' && (action === 'social' || action === 'chat' || action === 'love')) ||
    (w.type === 'sleep' && action === 'sleep') ||
    (w.type === 'comfort' && (action === 'idle' || action === 'comfort')) ||
    (w.type === 'learn' && (action === 'learn' || action === 'school'))
  if (match) w.progress = Math.min(1, w.progress + 0.25)
}

/** Tick a want: age it, complete it when done. */
export function tickWant(w: Want): void {
  w.age++
  if (w.progress >= 1) w.fulfilled = true
}

/** Fulfill a want (called when the player or sim completes it). */
export function fulfillWant(w: Want, amount = 1): void {
  w.progress = Math.min(1, w.progress + amount)
  if (w.progress >= 1) w.fulfilled = true
}

/** A want that aged too long is expired. */
export function wantExpired(w: Want): boolean {
  return w.age > WANT_EXPIRE
}

/** Replace an expired or fulfilled want with a fresh one from current state. */
export function refreshWant(w: Want, s: { hunger: number; energy: number; social: number; pleasure: number }): Want {
  if (w.fulfilled || wantExpired(w) || w.progress < 0.05) return createWant(wantForState(s))
  return w
}
