/**
 * courtship — how love starts, strains, ends, and sometimes returns.
 *
 * Nothing here is guaranteed or identical between creatures. Attraction has
 * to be built through shared time, compatibility has to hold up, and trust
 * has to survive whatever happens next. Rejection is a real outcome; so is
 * reconciliation after a breakup.
 */
import type { Creature } from './creature'
import {
  romanticInterest, geneticCompatibility, applySocialEvent, edgeTo, friendship,
} from './socialbond'
import { isMature } from './lifecycle'
import { clamp01 } from './util'

/** Minimum mutual interest before anyone risks asking. */
export const COURT_THRESHOLD = 0.38
/** Resentment point at which a partnership stops working. */
export const BREAKUP_RESENTMENT = 0.62

export type CourtOutcome = 'not-ready' | 'rejected' | 'courting' | 'partnered'

/**
 * One courtship step between two unattached, mature creatures.
 * Interest has to be mutual; the shy and the incompatible drift apart.
 */
export function courtStep(a: Creature, b: Creature): CourtOutcome {
  if (!isMature(a.stage) || !isMature(b.stage)) return 'not-ready'
  if (a.partnerId !== null || b.partnerId !== null) return 'not-ready'
  if (a.chem.grief > 0.4 || b.chem.grief > 0.4) return 'not-ready'

  const compat = geneticCompatibility(a.genome, b.genome)

  // interest grows from proximity and compatibility, not from a dice roll
  applySocialEvent(a.social, b.id, 'flirt', 0.5 * compat * (0.4 + a.genome.lovePropensity))
  applySocialEvent(b.social, a.id, 'flirt', 0.5 * compat * (0.4 + b.genome.lovePropensity))

  const edgeA = edgeTo(a.social, b.id)
  const edgeB = edgeTo(b.social, a.id)
  const interestA = romanticInterest(edgeA, a.genome.lovePropensity)
  const interestB = romanticInterest(edgeB, b.genome.lovePropensity)

  if (interestA >= COURT_THRESHOLD && interestB >= COURT_THRESHOLD) {
    a.partnerId = b.id
    b.partnerId = a.id
    a.chem.bond = clamp01(a.chem.bond + 0.35)
    b.chem.bond = clamp01(b.chem.bond + 0.35)
    a.emotions.joy = clamp01(a.emotions.joy + 0.3)
    b.emotions.joy = clamp01(b.emotions.joy + 0.3)
    a.emotions.hope = clamp01(a.emotions.hope + 0.25)
    b.emotions.hope = clamp01(b.emotions.hope + 0.25)
    return 'partnered'
  }

  // one-sided interest: the hopeful one gets turned down and feels it
  if (interestA >= COURT_THRESHOLD && interestB < COURT_THRESHOLD * 0.6) {
    applySocialEvent(a.social, b.id, 'reject', 1)
    a.emotions.shame = clamp01(a.emotions.shame + 0.15)
    a.emotions.hope = clamp01(a.emotions.hope - 0.2)
    a.chem.pleasure = clamp01(a.chem.pleasure - 0.1)
    return 'rejected'
  }
  return 'courting'
}

export type PartnershipState = 'steady' | 'strained' | 'ended'

/**
 * Does this partnership still hold? Resentment, fear, and collapsed affection
 * end it; jealousy and neglect strain it first, so the player can see it coming.
 */
export function partnershipStep(a: Creature, b: Creature): PartnershipState {
  if (a.partnerId !== b.id || b.partnerId !== a.id) return 'ended'
  const edgeA = edgeTo(a.social, b.id)
  const edgeB = edgeTo(b.social, a.id)

  const brokenA = edgeA.resentment > BREAKUP_RESENTMENT || edgeA.fear > 0.7
  const brokenB = edgeB.resentment > BREAKUP_RESENTMENT || edgeB.fear > 0.7
  if (brokenA || brokenB) {
    separate(a, b)
    return 'ended'
  }

  const strained = a.jealousy > 0.5 || b.jealousy > 0.5 || edgeA.resentment > 0.35 || edgeB.resentment > 0.35
  if (!strained) {
    // ordinary good days quietly deepen the bond
    applySocialEvent(a.social, b.id, 'talk', 0.4)
    applySocialEvent(b.social, a.id, 'talk', 0.4)
    a.chem.bond = clamp01(a.chem.bond + 0.002)
    b.chem.bond = clamp01(b.chem.bond + 0.002)
    return 'steady'
  }
  return 'strained'
}

/** End a partnership. Both carry it; neither forgets immediately. */
export function separate(a: Creature, b: Creature): void {
  a.partnerId = null
  b.partnerId = null
  a.chem.bond = clamp01(a.chem.bond - 0.4)
  b.chem.bond = clamp01(b.chem.bond - 0.4)
  for (const [self, other] of [[a, b], [b, a]] as const) {
    self.emotions.frustration = clamp01(self.emotions.frustration + 0.25)
    self.emotions.hope = clamp01(self.emotions.hope - 0.2)
    self.chem.pleasure = clamp01(self.chem.pleasure - 0.15)
    applySocialEvent(self.social, other.id, 'reject', 0.8)
  }
}

/**
 * Reconciliation: an apology or repeated kindness can rebuild what broke.
 * Forgiveness is a trait, not a certainty — some creatures never come back.
 */
export function reconcileStep(a: Creature, b: Creature): boolean {
  const edgeA = edgeTo(a.social, b.id)
  const willingness =
    a.emotions.forgiveness * 0.4 +
    a.genome.loyalty * 0.3 +
    friendship(edgeA) * 0.3 -
    edgeA.resentment * 0.5
  if (willingness < 0.2) return false
  applySocialEvent(a.social, b.id, 'forgive', 1)
  applySocialEvent(b.social, a.id, 'forgive', 0.6)
  a.emotions.resentment = clamp01(a.emotions.resentment - 0.2)
  a.emotions.hope = clamp01(a.emotions.hope + 0.15)
  return true
}

/** Who, if anyone, is this creature quietly interested in right now? */
export function crushOf(c: Creature, candidates: Creature[]): Creature | null {
  if (c.partnerId !== null || !isMature(c.stage)) return null
  let best: Creature | null = null
  let bestScore = 0.25
  for (const other of candidates) {
    if (other.id === c.id || !other.alive || other.partnerId !== null) continue
    if (!isMature(other.stage)) continue
    const edge = c.social[other.id]
    if (!edge) continue
    const score = romanticInterest(edge, c.genome.lovePropensity)
    if (score > bestScore) {
      bestScore = score
      best = other
    }
  }
  return best
}
