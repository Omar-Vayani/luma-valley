/**
 * status — standing in the settlement, and what it opens or closes.
 *
 * Status is not a stat anyone assigns. It is what the place adds up to: how
 * much others respect you, whether you hold a role, what you own, and what
 * people believe you have done. It then changes real access — the price you
 * are quoted, whether somebody helps you, and who gets the empty house.
 */
import type { Creature } from './creature'
import type { Culture } from './norms'
import { friendship } from './socialbond'
import { clamp01 } from './util'

export interface Standing {
  /** 0..1 overall standing in Haven */
  score: number
  respect: number
  wealth: number
  contribution: number
  disgrace: number
}

/**
 * Work out where a creature stands. Wealth counts, but so does being needed:
 * a poor healer everybody relies on outranks a rich stranger.
 */
export function standingOf(c: Creature, culture: Culture, peers: Creature[]): Standing {
  const respect = clamp01(culture.influence[c.id] ?? 0)

  const wallets = peers.filter((p) => p.alive).map((p) => p.wallet + p.banked)
  const richest = Math.max(1, ...wallets)
  const wealth = clamp01((c.wallet + c.banked) / richest)

  const contribution = clamp01(
    (c.job ? 0.45 : 0) +
    Math.min(0.25, c.education * 0.08) +
    (c.householdId != null ? 0.15 : 0) +
    c.chem.purpose * 0.15,
  )

  // what people think you have done wrong, averaged over those who know you
  let thief = 0
  let aggressor = 0
  let raters = 0
  for (const peer of peers) {
    if (peer.id === c.id || !peer.alive) continue
    const rep = peer.reputation[c.id]
    if (!rep) continue
    thief += rep.thief
    aggressor += rep.aggressor
    raters++
  }
  const disgrace = raters > 0 ? clamp01((thief + aggressor) / (raters * 2)) : 0

  const score = clamp01(respect * 0.35 + wealth * 0.2 + contribution * 0.35 - disgrace * 0.5)
  return { score, respect, wealth, contribution, disgrace }
}

/** A well-regarded customer is quoted a friendlier price than a disgraced one. */
export function priceMultiplierFor(standing: Standing): number {
  return 1 - standing.score * 0.15 + standing.disgrace * 0.35
}

/**
 * Will this creature go out of its way for that one? Standing matters, but so
 * does the relationship: a friend outweighs a stranger with a fine reputation.
 */
export function willingToHelp(helper: Creature, asker: Creature, askerStanding: Standing): number {
  const edge = helper.social[asker.id]
  const personal = edge ? friendship(edge) : 0
  const kin = helper.householdId != null && helper.householdId === asker.householdId
  return clamp01(
    personal * 0.4 +
    askerStanding.score * 0.3 +
    helper.genome.sociability * 0.15 +
    helper.genome.loyalty * 0.15 +
    (kin ? 0.3 : 0) -
    askerStanding.disgrace * 0.4,
  )
}

/**
 * When a home falls empty, the settlement does not draw lots for it. Standing
 * decides — which is exactly the kind of inequality the vision asks for.
 */
export function rankForHousing(candidates: Creature[], culture: Culture, peers: Creature[]): Creature[] {
  return [...candidates].sort(
    (a, b) => standingOf(b, culture, peers).score - standingOf(a, culture, peers).score,
  )
}

/** A short phrase for the inspector, so standing is legible rather than numeric. */
export function describeStanding(s: Standing): string {
  if (s.disgrace > 0.45) return 'widely distrusted'
  if (s.score > 0.7) return 'looked up to'
  if (s.score > 0.5) return 'well regarded'
  if (s.score > 0.3) return 'ordinary standing'
  if (s.contribution < 0.2) return 'an outsider here'
  return 'little regarded'
}
