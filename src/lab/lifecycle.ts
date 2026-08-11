/**
 * lifecycle — sleep suspension, population control, player bonds, and
 * per-creature persistent storage budget.
 *
 * - Sleep state: sleeping creatures skip ALL brain/decision work (0 CPU/GPU).
 * - Population control: age limits + procreation energy cost + resource scarcity.
 * - Player bonds: bonded companions are exempt from natural aging death.
 * - Storage: each creature may use up to 3MB of persistent storage for its
 *   learned state (brain weights, vocabulary, memories) — vast capacity.
 */

export const AGE_LIMIT_BASE = 3000 // ticks until natural aging begins
export const AGE_LIMIT_SPREAD = 1500 // genetic variation
export const PLAYER_BOND_THRESHOLD = 0.55 // bonds above this shield from aging
export const CREATURE_STORAGE_BYTES = 3 * 1024 * 1024 // 3MB per creature

/** Life stages: childhood shapes learning, elders slow down. */
export type LifeStage = 'child' | 'adolescent' | 'adult' | 'elder'

export const CHILD_UNTIL = 400
export const ADOLESCENT_UNTIL = 600
export const ELDER_FROM = 2600

export function lifeStageFor(age: number): LifeStage {
  if (age < CHILD_UNTIL) return 'child'
  if (age < ADOLESCENT_UNTIL) return 'adolescent'
  if (age < ELDER_FROM) return 'adult'
  return 'elder'
}

/** Children learn faster; elders learn slower but keep what they know. */
export function learningRateFor(stage: LifeStage): number {
  switch (stage) {
    case 'child': return 1.6
    case 'adolescent': return 1.25
    case 'adult': return 1
    case 'elder': return 0.7
  }
}

/** Only mature creatures work, court, and reproduce. */
export function isMature(stage: LifeStage): boolean {
  return stage === 'adult' || stage === 'elder'
}

/** Physical capability multiplier (children weak, elders fading). */
export function vigorFor(stage: LifeStage): number {
  switch (stage) {
    case 'child': return 0.5
    case 'adolescent': return 0.8
    case 'adult': return 1
    case 'elder': return 0.7
  }
}

/** How much aging damage a creature takes at a given age (0 = none yet). */
export function agingDamage(age: number, playerBond: number): number {
  if (isAgeProtected(age, playerBond)) return 0
  if (age <= AGE_LIMIT_BASE) return 0
  const over = age - AGE_LIMIT_BASE
  return Math.min(0.01, over / 300000) // slow ramp: ~0.01/tick max
}

/** Player-bonded creatures never die of natural age. */
export function isAgeProtected(_age: number, playerBond: number): boolean {
  return playerBond >= PLAYER_BOND_THRESHOLD
}

/** The energy cost of procreation — scales with how drained the parent is. */
export function procreationCost(energy: number): number {
  // exhausted parents pay proportionally more (hard to create life when empty)
  return 0.25 + (1 - energy) * 0.3
}

/** Whether two paired creatures can afford a birth right now. */
export function canProcreate(energyA: number, energyB: number, age: number): boolean {
  if (energyA < 0.35 || energyB < 0.35) return false // both need reserves
  if (age < 600) return false // too young
  return true
}

/** The genetic age limit for a creature (some live longer than others). */
export function ageLimitFor(rand: number): number {
  return AGE_LIMIT_BASE + Math.floor(rand * AGE_LIMIT_SPREAD)
}
