/**
 * substances — several addictive drugs with distinct personalities.
 * Renamed so the lab feels like its own world: brew (booze), herb (weed),
 * spark (crack), tonic (stimulant medicine).
 * Each has its own effect profile and its own addiction + withdrawal path.
 */
import type { ChemState } from './chem'

export type SubstanceId = 'brew' | 'herb' | 'spark' | 'tonic'

export interface SubstanceDef {
  id: SubstanceId
  name: string
  effect: string
  fun: number // pleasure payoff
  risk: number // how fast dependence builds
  energy: number // energy change
  fear: number // fear change
  social: number // social change
  health: number // health change (negative = poison)
}

export const SUBSTANCES: SubstanceDef[] = [
  { id: 'brew', name: 'brew', effect: 'warm cheer', fun: 0.35, risk: 0.12, energy: -0.05, fear: -0.1, social: 0.15, health: -0.01 },
  { id: 'herb', name: 'herb', effect: 'mellow calm', fun: 0.3, risk: 0.06, energy: -0.1, fear: -0.25, social: -0.15, health: -0.005 },
  { id: 'spark', name: 'spark', effect: 'intense rush', fun: 0.55, risk: 0.3, energy: 0.3, fear: 0.15, social: -0.05, health: -0.03 },
  { id: 'tonic', name: 'tonic', effect: 'focused drive', fun: 0.2, risk: 0.18, energy: 0.25, fear: -0.05, social: -0.1, health: -0.01 },
]

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

/** Apply a dose: pleasure rush + substance-specific effects + addiction build. */
export function doseSubstance(chem: ChemState, id: SubstanceId, addictionProne: number, tick = 1): void {
  const s = SUBSTANCES.find((d) => d.id === id)
  if (!s) return
  chem.pleasure = clamp01(chem.pleasure + s.fun)
  chem.energy = clamp01(chem.energy + s.energy)
  chem.fear = clamp01(chem.fear + s.fear)
  chem.social = clamp01(chem.social + s.social)
  chem.health = clamp01(chem.health + s.health)
  chem.addiction[id] = clamp01((chem.addiction[id] ?? 0) + s.risk * (0.5 + addictionProne))
  chem.lastDose[id] = tick
}

/**
 * Per-tick decay + withdrawal. Addicted creatures crave when deprived:
 * rising fear, dropping pleasure, slow health damage.
 */
export function tickSubstances(chem: ChemState, tick = 1): void {
  for (const def of SUBSTANCES) {
    const level = chem.addiction[def.id] ?? 0
    if (level <= 0) continue
    // addiction slowly fades
    chem.addiction[def.id] = clamp01(level - 0.0006)
    const lastDose = chem.lastDose[def.id] ?? -9999
    const since = tick - lastDose
    if (level > 0.3 && since > 120) {
      // withdrawal: craving panic + health damage
      chem.fear = clamp01(chem.fear + (level - 0.3) * 0.12)
      chem.pleasure = clamp01(chem.pleasure - 0.02)
      chem.health = clamp01(chem.health - (level - 0.3) * 0.004)
    }
  }
}

export function addictionLevel(chem: ChemState, id: SubstanceId): number {
  return chem.addiction[id] ?? 0
}
