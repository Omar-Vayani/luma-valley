/**
 * drives — human tendencies for NPC AI.
 * Importance (rank/status), Approval (praise/fear of shame), Ego Defense,
 * Tribalism (gangs, fear of outsiders), Conformity, Reciprocity,
 * Loss Aversion, Greed/Hoarding, Curiosity, Legacy (lasting influence).
 * Each drive is a 0..1 hunger that grows when unsatisfied and shapes the
 * utility mind's weights.
 */
import type { ChemState } from './chem'

export type DriveKey =
  | 'importance'
  | 'approval'
  | 'ego'
  | 'tribalism'
  | 'conformity'
  | 'reciprocity'
  | 'lossAversion'
  | 'greed'
  | 'curiosity'
  | 'legacy'

export type Drives = Record<DriveKey, number>

export const DRIVE_KEYS: DriveKey[] = [
  'importance', 'approval', 'ego', 'tribalism', 'conformity',
  'reciprocity', 'lossAversion', 'greed', 'curiosity', 'legacy',
]

export const driveTitles: Record<DriveKey, string> = {
  importance: 'wants respect & status',
  approval: 'craves praise, fears shame',
  ego: 'protects pride, holds grudges',
  tribalism: 'joins gangs, fears outsiders',
  conformity: 'copies the crowd',
  reciprocity: 'rewards allies, punishes enemies',
  lossAversion: 'protects what is theirs',
  greed: 'hoards surplus resources',
  curiosity: 'investigates the unknown',
  legacy: 'wants a lasting mark',
}

export function createDrives(): Drives {
  return {
    importance: 0.3,
    approval: 0.3,
    ego: 0.3,
    tribalism: 0.3,
    conformity: 0.3,
    reciprocity: 0.3,
    lossAversion: 0.3,
    greed: 0.3,
    curiosity: 0.3,
    legacy: 0.3,
  }
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

/**
 * Drives drift toward the personality: genes define the set point,
 * needs push the urgent ones up. Satisfying a drive lowers it (temporarily).
 */
export function tickDrives(d: Drives, chem: ChemState, g: { aggression: number; sociability: number; greed: number; curiosity: number; lovePropensity: number }): void {
  const targets: Record<DriveKey, number> = {
    importance: 0.4 + g.aggression * 0.4,
    approval: 0.5 - g.aggression * 0.2 + g.sociability * 0.2,
    ego: 0.5 + g.aggression * 0.4,
    tribalism: 0.4 + g.aggression * 0.5,
    conformity: 0.6 - g.curiosity * 0.3,
    reciprocity: 0.5 + g.lovePropensity * 0.2,
    lossAversion: 0.3 + (1 - g.aggression) * 0.2 + chem.fear * 0.3,
    greed: 0.3 + g.greed * 0.5,
    curiosity: 0.3 + g.curiosity * 0.5,
    legacy: 0.3 + g.sociability * 0.2 + g.aggression * 0.2,
  }
  for (const k of DRIVE_KEYS) {
    d[k] = clamp01(d[k] + (targets[k] - d[k]) * 0.005)
  }
  // hungry belly raises the urgent survival-adjacent drives
  d.lossAversion = clamp01(d.lossAversion + (chem.hunger < 0.4 ? 0.01 : 0))
}

/** Social events feed the social drives. */
export function applySocialFeedback(d: Drives, kind: 'praise' | 'shame' | 'defeat' | 'victory' | 'gift' | 'theft'): void {
  switch (kind) {
    case 'praise':
      d.approval = clamp01(d.approval + 0.12)
      d.ego = clamp01(d.ego + 0.08)
      break
    case 'shame':
      d.ego = clamp01(d.ego - 0.15)
      d.approval = clamp01(d.approval + 0.05) // wants approval more
      break
    case 'victory':
      d.importance = clamp01(d.importance + 0.12)
      d.ego = clamp01(d.ego + 0.1)
      break
    case 'defeat':
      d.ego = clamp01(d.ego - 0.12)
      d.reciprocity = clamp01(d.reciprocity + 0.1) // holds the grudge
      break
    case 'gift':
      d.reciprocity = clamp01(d.reciprocity + 0.1)
      break
    case 'theft':
      d.lossAversion = clamp01(d.lossAversion + 0.15)
      d.reciprocity = clamp01(d.reciprocity + 0.12)
      break
  }
}
