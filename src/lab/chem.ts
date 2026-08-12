/**
 * chem — the needs/chemistry of a ball-creature.
 * Values are 0..1 where 1 = "full / good". hunger 1 = full, energy 1 = rested.
 * Needs decay each tick; actions restore them. Addiction + withdrawal live here.
 */
import type { Genome } from './genetics'

export interface ChemState {
  hunger: number
  thirst: number
  energy: number
  social: number
  pleasure: number
  fear: number
  health: number
  intoxication: number
  bond: number // attachment to a partner
  grief: number // mourning after a partner/friend dies (0..1, heals slowly)
  strength: number // physical power, built by play/exercise (0..1)
  /** physical ease — warmth, shelter, not being footsore */
  comfort: number
  /** time alone; crowded creatures need space, isolated ones don't */
  privacy: number
  /** a reason to get up: work, family, mastery, status */
  purpose: number
  addiction: Record<string, number> // substance -> 0..1 dependence
  lastDose: Record<string, number> // tick index of last dose (withdrawal timer)
  /**
   * substance -> 0..1 tolerance. Separate from dependence on purpose: it
   * blunts the payoff of a dose without creating the craving, and it fades
   * more slowly, which is what makes going back to something hit so hard.
   */
  tolerance?: Record<string, number>
}

export function createChem(): ChemState {
  return {
    hunger: 1,
    thirst: 1,
    energy: 1,
    social: 1,
    pleasure: 0.6,
    fear: 0.1,
    health: 1,
    intoxication: 0,
    bond: 0,
    grief: 0,
    strength: 0.3,
    comfort: 0.7,
    privacy: 0.7,
    purpose: 0.5,
    addiction: {},
    lastDose: {},
    tolerance: {},
  }
}

const DECAY = {
  hunger: 0.0005, // very slow — creatures live long, complex lives, and the
  thirst: 0.00055, // player has TIME to watch, interact, and teach them
  energy: 0.00035,
  social: 0.0003,
  pleasure: 0.00025,
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

export function tickChem(c: ChemState, tick = 1): void {
  c.hunger = clamp01(c.hunger - DECAY.hunger)
  c.thirst = clamp01(c.thirst - DECAY.thirst)
  c.energy = clamp01(c.energy - DECAY.energy)
  c.social = clamp01(c.social - DECAY.social)
  c.pleasure = clamp01(c.pleasure - DECAY.pleasure)
  // slower-moving quality-of-life needs
  c.comfort = clamp01(c.comfort - 0.0002)
  c.purpose = clamp01(c.purpose - 0.00018)
  // privacy recovers by default; crowding (applied elsewhere) drains it
  c.privacy = clamp01(c.privacy + 0.0002)
  c.intoxication = clamp01(c.intoxication - 0.008)
  c.bond = clamp01(c.bond - 0.0003)
  c.grief = clamp01(c.grief - 0.004) // mourning heals slowly
  c.strength = clamp01(c.strength - 0.0003)

  // starvation: an empty belly slowly damages health — food is not optional
  // (slow enough that a creature with money can cross the world to the food tower)
  if (c.hunger < 0.05) {
    c.health = clamp01(c.health - 0.0015)
  }

  // Withdrawal from anything not covered by `substances.ts` — medicine, in
  // practice. The four real substances have their own comedown curve there.
  for (const sub of Object.keys(c.addiction)) {
    if (sub === 'brew' || sub === 'herb' || sub === 'spark' || sub === 'tonic') continue
    const since = tick - (c.lastDose[sub] ?? -9999)
    if (c.addiction[sub] > 0.35 && since > 240) {
      c.fear = clamp01(c.fear + (c.addiction[sub] - 0.35) * 0.25)
      c.health = clamp01(c.health - 0.002)
    }
  }
  c.fear = clamp01(c.fear - 0.002)
}

export function applyFood(c: ChemState): void {
  c.hunger = clamp01(c.hunger + 0.45)
  c.pleasure = clamp01(c.pleasure + 0.1)
  c.health = clamp01(c.health + 0.02)
}

export function applyMedicine(c: ChemState, genome: Genome, tick = 1): void {
  c.health = clamp01(c.health + 0.4)
  const dose = 0.12 + genome.addictionProne * 0.3
  c.addiction.medicine = clamp01((c.addiction.medicine ?? 0) + dose)
  c.lastDose.medicine = tick
}

export function applyDrink(c: ChemState, genome: Genome, tick = 1): void {
  c.pleasure = clamp01(c.pleasure + 0.35)
  c.intoxication = clamp01(c.intoxication + 0.3)
  c.social = clamp01(c.social + 0.15)
  // the same key the tavern and `substances.ts` use, so one habit is tracked
  // in one place rather than two that never meet
  const dose = 0.08 + genome.addictionProne * 0.25
  c.addiction.brew = clamp01((c.addiction.brew ?? 0) + dose)
  c.lastDose.drink = tick
}

export function applySleep(c: ChemState): void {
  c.energy = clamp01(c.energy + 0.5)
  c.fear = clamp01(c.fear - 0.1)
  c.comfort = clamp01(c.comfort + 0.25)
  c.privacy = clamp01(c.privacy + 0.2)
}

/** Standing in a crowd wears on a creature that wants space. */
export function applyCrowding(c: ChemState, neighbors: number): void {
  if (neighbors <= 1) {
    c.privacy = clamp01(c.privacy + 0.002)
    return
  }
  c.privacy = clamp01(c.privacy - 0.002 * (neighbors - 1))
}

/** Doing meaningful work, teaching, or providing for kin restores purpose. */
export function applyPurpose(c: ChemState, amount = 0.1): void {
  c.purpose = clamp01(c.purpose + amount)
}

/** Shelter, warm clothing, and rest restore comfort. */
export function applyComfort(c: ChemState, amount = 0.1): void {
  c.comfort = clamp01(c.comfort + amount)
}

export function applySocial(c: ChemState): void {
  c.social = clamp01(c.social + 0.4)
  c.pleasure = clamp01(c.pleasure + 0.12)
  c.bond = clamp01(c.bond + 0.03)
}

export function applyPlay(c: ChemState): void {
  c.pleasure = clamp01(c.pleasure + 0.18)
  c.social = clamp01(c.social + 0.1)
  c.strength = clamp01(c.strength + 0.12) // real exercise: visible strength gain
  c.energy = clamp01(c.energy - 0.01) // exercise costs a little energy
}
