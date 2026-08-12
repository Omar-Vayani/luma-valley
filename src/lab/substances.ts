/**
 * substances — what the Luma take, and what it does to them.
 *
 * Four of them, and each behaves the way its real-world equivalent does rather
 * than the way a stat buff does:
 *
 *   brew    drink. Cheap, social, legal, forgiving. Dulls fear, dulls judgement.
 *   herb    a smoked leaf. Calming, isolating, mildly disapproved of.
 *   spark   a hard stimulant. Enormous rush, fast dependence, visible ruin.
 *   tonic   a bought focus. Legal, useful, and quietly habit-forming.
 *
 * The parts that make it behave like a habit rather than a potion:
 *
 *   tolerance    the same dose gives less each time, so use escalates
 *   intoxication a state with consequences — slower, braver, worse at judging
 *   withdrawal   craving that outbids ordinary needs, and hurts
 *   recovery     dependence fades while abstinent, but the tolerance lingers,
 *                which is what makes relapse land so hard
 */
import type { ChemState } from './chem'

export type SubstanceId = 'brew' | 'herb' | 'spark' | 'tonic'

export interface SubstanceDef {
  id: SubstanceId
  name: string
  effect: string
  /** pleasure payoff at zero tolerance */
  fun: number
  /** how fast dependence builds per dose */
  risk: number
  /** how fast tolerance builds per dose */
  tolerance: number
  energy: number
  fear: number
  social: number
  health: number
  /** how strongly a dose clouds judgement */
  intoxicating: number
  /** ticks of comedown before withdrawal starts to bite */
  grace: number
  /** 0..1 — how much the settlement minds */
  disapproval: number
}

export const SUBSTANCES: SubstanceDef[] = [
  {
    id: 'brew', name: 'amber brew', effect: 'warm cheer, dulled judgement',
    fun: 0.34, risk: 0.055, tolerance: 0.035, energy: -0.05, fear: -0.14,
    social: 0.16, health: -0.008, intoxicating: 0.3, grace: 420, disapproval: 0.15,
  },
  {
    id: 'herb', name: 'dreamleaf', effect: 'mellow calm, and somewhere else to be',
    fun: 0.3, risk: 0.04, tolerance: 0.03, energy: -0.12, fear: -0.3,
    social: -0.14, health: -0.004, intoxicating: 0.34, grace: 520, disapproval: 0.45,
  },
  {
    id: 'spark', name: 'sparkdust', effect: 'an hour of certainty, then the floor',
    fun: 0.62, risk: 0.17, tolerance: 0.11, energy: 0.34, fear: 0.12,
    social: -0.06, health: -0.035, intoxicating: 0.45, grace: 240, disapproval: 0.9,
  },
  {
    id: 'tonic', name: 'focus tonic', effect: 'a working day borrowed from tomorrow',
    fun: 0.2, risk: 0.075, tolerance: 0.05, energy: 0.28, fear: -0.05,
    social: -0.08, health: -0.012, intoxicating: 0.12, grace: 360, disapproval: 0.2,
  },
]

const BY_ID = new Map(SUBSTANCES.map((s) => [s.id, s]))

export function substanceDef(id: string): SubstanceDef | undefined {
  return BY_ID.get(id as SubstanceId)
}

export function isSubstance(id: string): id is SubstanceId {
  return BY_ID.has(id as SubstanceId)
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

/**
 * Take a dose.
 *
 * The payoff is divided by tolerance, so the tenth drink does far less than
 * the first while costing the same coin and the same liver. That single
 * division is most of what makes a habit look like a habit from outside.
 */
export function doseSubstance(
  chem: ChemState, id: SubstanceId, addictionProne: number, tick = 1,
): void {
  const s = BY_ID.get(id)
  if (!s) return

  const tolerance = chem.tolerance?.[id] ?? 0
  const payoff = 1 / (1 + tolerance * 2.4)

  chem.pleasure = clamp01(chem.pleasure + s.fun * payoff)
  chem.energy = clamp01(chem.energy + s.energy)
  chem.fear = clamp01(chem.fear + s.fear * payoff)
  chem.social = clamp01(chem.social + s.social)
  // the damage does not get a discount for tolerance
  chem.health = clamp01(chem.health + s.health * (1 + tolerance))
  chem.intoxication = clamp01(chem.intoxication + s.intoxicating)

  const prone = 0.5 + addictionProne
  chem.addiction[id] = clamp01((chem.addiction[id] ?? 0) + s.risk * prone)
  if (!chem.tolerance) chem.tolerance = {}
  chem.tolerance[id] = clamp01(tolerance + s.tolerance * prone)
  chem.lastDose[id] = tick
}

export interface WithdrawalState {
  /** the substance being craved most, if any */
  id: SubstanceId | null
  /** 0..1 — how badly */
  severity: number
}

/**
 * Per-tick decay, comedown and withdrawal.
 *
 * Dependence fades while abstinent and tolerance fades more slowly still, so
 * somebody who dries out is left more sensitive to the drug than they were
 * dependent on it — which is exactly the shape of a relapse.
 */
export function tickSubstances(chem: ChemState, tick = 1): WithdrawalState {
  chem.intoxication = clamp01(chem.intoxication - 0.006)
  if (!chem.tolerance) chem.tolerance = {}

  let worst: SubstanceId | null = null
  let severity = 0

  for (const def of SUBSTANCES) {
    const level = chem.addiction[def.id] ?? 0
    const tol = chem.tolerance[def.id] ?? 0
    if (level <= 0 && tol <= 0) continue

    const since = tick - (chem.lastDose[def.id] ?? -99999)

    if (level > 0) {
      // dependence eases off, but only while genuinely abstinent
      if (since > def.grace) chem.addiction[def.id] = clamp01(level - 0.00035)
      if (level > 0.25 && since > def.grace) {
        const bite = (level - 0.25) * (1 + Math.min(2, (since - def.grace) / def.grace))
        chem.fear = clamp01(chem.fear + bite * 0.05)
        chem.pleasure = clamp01(chem.pleasure - bite * 0.02)
        chem.energy = clamp01(chem.energy - bite * 0.008)
        chem.health = clamp01(chem.health - bite * 0.0018)
        if (bite > severity) {
          severity = bite
          worst = def.id
        }
      }
    }
    if (tol > 0 && since > def.grace * 2) {
      chem.tolerance[def.id] = clamp01(tol - 0.00012)
    }
  }

  return { id: worst, severity: Math.min(1, severity) }
}

export function addictionLevel(chem: ChemState, id: SubstanceId): number {
  return chem.addiction[id] ?? 0
}

export function toleranceLevel(chem: ChemState, id: SubstanceId): number {
  return chem.tolerance?.[id] ?? 0
}

/** The worst dependence this creature has, and to what. */
export function worstHabit(chem: ChemState): { id: SubstanceId; level: number } | null {
  let best: { id: SubstanceId; level: number } | null = null
  for (const def of SUBSTANCES) {
    const level = chem.addiction[def.id] ?? 0
    if (level > 0.15 && (!best || level > best.level)) best = { id: def.id, level }
  }
  return best
}

/**
 * How drunk or high somebody looks to somebody else, and how much the
 * settlement minds seeing it. Being visibly on spark costs far more standing
 * than being visibly on beer, which is the whole social difference between them.
 */
export function visibleImpairment(chem: ChemState): number {
  return clamp01(chem.intoxication * 1.3)
}

export function disapprovalOf(id: SubstanceId): number {
  return BY_ID.get(id)?.disapproval ?? 0
}

/**
 * What being intoxicated does to a decision, as multipliers the mind applies:
 * braver, more social, worse at anything that needs care, and less able to
 * weigh what happens next.
 */
export interface Impairment {
  /** movement and work speed */
  slowness: number
  /** how much less the consequences count */
  recklessness: number
  /** appetite for company */
  sociability: number
  /** how noisy the choice becomes */
  confusion: number
}

export function impairmentOf(chem: ChemState): Impairment {
  const x = chem.intoxication
  if (x <= 0.02) {
    return { slowness: 0, recklessness: 0, sociability: 0, confusion: 0 }
  }
  return {
    slowness: Math.min(0.45, x * 0.55),
    recklessness: Math.min(0.8, x * 0.9),
    sociability: Math.min(0.6, x * 0.7),
    confusion: Math.min(0.7, x * 0.8),
  }
}
