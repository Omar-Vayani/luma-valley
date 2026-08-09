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
  addiction: Record<string, number> // substance -> 0..1 dependence
  lastDose: Record<string, number> // tick index of last dose (withdrawal timer)
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
    addiction: {},
    lastDose: {},
  }
}

const DECAY = {
  hunger: 0.004,
  thirst: 0.005,
  energy: 0.003,
  social: 0.002,
  pleasure: 0.0015,
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

export function tickChem(c: ChemState, tick = 1): void {
  c.hunger = clamp01(c.hunger - DECAY.hunger)
  c.thirst = clamp01(c.thirst - DECAY.thirst)
  c.energy = clamp01(c.energy - DECAY.energy)
  c.social = clamp01(c.social - DECAY.social)
  c.pleasure = clamp01(c.pleasure - DECAY.pleasure)
  c.intoxication = clamp01(c.intoxication - 0.01)
  c.bond = clamp01(c.bond - 0.0005)
  c.grief = clamp01(c.grief - 0.004) // mourning heals slowly

  // withdrawal: addicted creatures panic when deprived (timer via lastDose)
  for (const sub of Object.keys(c.addiction)) {
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
  const dose = 0.08 + genome.addictionProne * 0.25
  c.addiction.drink = clamp01((c.addiction.drink ?? 0) + dose)
  c.lastDose.drink = tick
}

export function applySleep(c: ChemState): void {
  c.energy = clamp01(c.energy + 0.5)
  c.fear = clamp01(c.fear - 0.1)
}

export function applySocial(c: ChemState): void {
  c.social = clamp01(c.social + 0.4)
  c.pleasure = clamp01(c.pleasure + 0.12)
  c.bond = clamp01(c.bond + 0.03)
}
