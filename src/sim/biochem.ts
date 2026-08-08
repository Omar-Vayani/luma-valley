import { clamp } from './rng'

/**
 * Biochemistry — blood chemicals with synthesis, reactions and half-life,
 * plus the immune/health system. Drives are chemicals; actions consume them;
 * eating/drinking/sleeping/socializing produce reactions.
 */

export const CHEMICALS = [
  'hunger',
  'thirst',
  'fatigue',
  'boredom',
  'loneliness',
  'fear',
  'pleasure',
  'pain',
  'health',
] as const

export type ChemicalName = (typeof CHEMICALS)[number]

export type ChemicalState = Record<ChemicalName, number>

export function emptyChemicals(): ChemicalState {
  const c = {} as ChemicalState
  for (const k of CHEMICALS) c[k] = 0
  return c
}

export interface ChemConfig {
  /** synthesis per tick when at floor */
  synth: Partial<Record<ChemicalName, number>>
  /** half-life ticks — chemical decays toward 0 */
  halfLife: Partial<Record<ChemicalName, number>>
  /** clamps */
  max: Partial<Record<ChemicalName, number>>
}

export const DEFAULT_CHEM_CONFIG: ChemConfig = {
  synth: {
    hunger: 0.0016,
    thirst: 0.0014,
    fatigue: 0.0010,
    boredom: 0.0008,
    loneliness: 0.0009,
    fear: 0,
    pleasure: 0,
    pain: 0,
    health: 0,
  },
  halfLife: {
    hunger: 0,
    thirst: 0,
    fatigue: 0,
    boredom: 0,
    loneliness: 0,
    fear: 40,
    pleasure: 12,
    pain: 18,
    health: 0,
  },
  max: {
    hunger: 1,
    thirst: 1,
    fatigue: 1,
    boredom: 1,
    loneliness: 1,
    fear: 1,
    pleasure: 1,
    pain: 1,
    health: 1,
  },
}

export function chemTick(c: ChemicalState, cfg: ChemConfig): void {
  for (const k of CHEMICALS) {
    const synth = cfg.synth[k] ?? 0
    if (synth) c[k] += synth
    const hl = cfg.halfLife[k] ?? 0
    if (hl > 0) c[k] -= c[k] * (1 - Math.pow(0.5, 1 / hl))
    const max = cfg.max[k] ?? 1
    c[k] = clamp(c[k], 0, max)
  }
}

/** Spike a chemical (pleasure/pain/health etc.). */
export function spike(c: ChemicalState, name: ChemicalName, amount: number): void {
  const max = DEFAULT_CHEM_CONFIG.max[name] ?? 1
  c[name] = clamp(c[name] + amount, 0, max)
}

export interface FoodEffect {
  hunger: number
  thirst: number
  pleasure: number
  pain: number
  health: number
}

export const FOOD_EFFECTS: Record<string, FoodEffect> = {
  berry: { hunger: 0.55, thirst: 0.15, pleasure: 0.35, pain: 0, health: 0.02 },
  mushroom: { hunger: 0.35, thirst: 0.05, pleasure: 0.1, pain: 0.15, health: -0.05 },
  water: { hunger: 0, thirst: 0.6, pleasure: 0.15, pain: 0, health: 0.01 },
}

export function applyFood(c: ChemicalState, effect: FoodEffect): void {
  c.hunger = clamp(c.hunger - effect.hunger, 0, 1)
  c.thirst = clamp(c.thirst - effect.thirst, 0, 1)
  c.pleasure = clamp(c.pleasure + effect.pleasure, 0, 1)
  c.pain = clamp(c.pain + effect.pain, 0, 1)
  c.health = clamp(c.health + effect.health, 0, 1)
}

/** Sleeping: fatigue recovers, wounds heal slowly. */
export function sleepTick(c: ChemicalState, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    c.fatigue = clamp(c.fatigue - 0.02, 0, 1)
    if (c.health < 1) c.health = clamp(c.health + 0.0005, 0, 1)
  }
}

/** Social/play reduces boredom/loneliness and raises pleasure. */
export function socialTick(c: ChemicalState): void {
  c.boredom = clamp(c.boredom - 0.03, 0, 1)
  c.loneliness = clamp(c.loneliness - 0.04, 0, 1)
  c.pleasure = clamp(c.pleasure + 0.08, 0, 1)
}
