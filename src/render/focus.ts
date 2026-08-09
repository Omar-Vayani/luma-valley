import type { CityPlaceId } from '../sim/city'

export interface FocusCandidate {
  kind: 'creature' | 'place'
  id: number | CityPlaceId
  name: string
  x: number
  z: number
}

export interface FocusTarget extends FocusCandidate {
  distance: number
}

export function pickFocusTarget(
  player: { x: number; z: number },
  forward: { x: number; z: number },
  candidates: FocusCandidate[],
  aimOverride?: FocusCandidate | null,
): FocusTarget | null {
  const withDistance = (candidate: FocusCandidate): FocusTarget => ({
    ...candidate,
    distance: Math.hypot(candidate.x - player.x, candidate.z - player.z),
  })
  if (aimOverride) {
    const aimed = withDistance(aimOverride)
    if (aimed.distance <= 10) return aimed
  }

  const forwardLength = Math.hypot(forward.x, forward.z) || 1
  const fx = forward.x / forwardLength
  const fz = forward.z / forwardLength
  let best: FocusTarget | null = null
  let bestScore = Number.POSITIVE_INFINITY
  let nearbyCreature: FocusTarget | null = null

  for (const candidate of candidates) {
    const target = withDistance(candidate)
    const limit = candidate.kind === 'creature' ? 7 : 8
    if (target.distance > limit || target.distance < 0.01) continue
    const dot = ((candidate.x - player.x) * fx + (candidate.z - player.z) * fz) / target.distance
    if (candidate.kind === 'creature' && target.distance <= 3.2 && (!nearbyCreature || target.distance < nearbyCreature.distance)) nearbyCreature = target
    if (dot < 0.3) continue
    const score = target.distance + (1 - dot) * 5 - (candidate.kind === 'creature' ? 0.8 : 0)
    if (score < bestScore) {
      best = target
      bestScore = score
    }
  }
  return best ?? nearbyCreature
}
