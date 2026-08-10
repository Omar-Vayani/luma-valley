/**
 * vengeance — revenge and the actions related to it.
 * Creatures hold grudges after being wronged (robbed, attacked, partner
 * killed). A strong grudge makes revenge a top priority: they hunt the
 * culprit, ambush them, rally gangmates (gang revenge), or scheme from afar.
 * Revenge styles come from personality: brave creatures fight, loyal ones
 * bring the gang, cowardly ones sabotage.
 */

export const VENGEANCE = ['ambush', 'hunt', 'gang-revenge', 'scheme'] as const
export type VengeanceStyle = (typeof VENGEANCE)[number]

export interface Grudge {
  targetId: number
  intensity: number // 0..1
  since: number
}

export interface VengeanceState {
  grudges: Record<number, Grudge>
}

export function createVengeance(): VengeanceState {
  return { grudges: {} }
}

/** The creature was wronged by `targetId` — add to the grudge. */
export function recordWrong(v: VengeanceState, targetId: number, intensity: number, since = 0): void {
  const g = v.grudges[targetId]
  if (g) {
    g.intensity = Math.min(1, g.intensity + intensity)
    g.since = since
  } else {
    v.grudges[targetId] = { targetId, intensity: Math.min(1, intensity), since }
  }
}

/** How strong the urge for revenge against this target is. */
export function revengeScore(v: VengeanceState, targetId: number): number {
  return v.grudges[targetId]?.intensity ?? 0
}

/** The style of revenge a creature prefers, from its personality. */
export function revengeStyleFor(v: VengeanceState, targetId: number, g: { aggression: number; loyalty: number; courage: number }): VengeanceStyle {
  const score = revengeScore(v, targetId)
  if (score <= 0) return 'scheme'
  if (g.loyalty > 0.7 && score > 0.4) return 'gang-revenge'
  if (g.aggression > 0.6 && g.courage > 0.5) return 'ambush'
  if (g.aggression > 0.4) return 'hunt'
  return 'scheme'
}

export function planRevenge(v: VengeanceState, targetId: number, g: { aggression: number; loyalty: number; courage: number }): VengeanceStyle {
  return revengeStyleFor(v, targetId, g)
}

export function isGangRevenge(style: VengeanceStyle): boolean {
  return style === 'gang-revenge'
}

/** The grudge is settled — the revenge was delivered. */
export function settleRevenge(v: VengeanceState, targetId: number): boolean {
  if (!v.grudges[targetId]) return false
  delete v.grudges[targetId]
  return true
}

/** Decay all grudges slowly (grudges fade, revenge cools). */
export function decayGrudges(v: VengeanceState, rate = 0.001): void {
  for (const id of Object.keys(v.grudges)) {
    const g = v.grudges[Number(id)]
    g.intensity = Math.max(0, g.intensity - rate)
    if (g.intensity < 0.02) delete v.grudges[Number(id)]
  }
}
