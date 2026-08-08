/**
 * mind — the modern cognition layer (beyond 1996 Creatures):
 * - episodic memory: creatures remember *specific* events and places
 * - curiosity: intrinsic motivation to explore the unknown
 * - social bonds: per-creature affinity (friends vs rivals)
 * - emotional contagion: fear spreads between bonded creatures
 */
import { clamp, type RNG } from './rng'

export interface Vec2 {
  x: number
  z: number
}

export type EpisodeKind = 'food' | 'water' | 'scare' | 'friend' | 'player-kind' | 'player-cruel'

export interface Episode {
  id: number
  kind: EpisodeKind
  pos: Vec2
  entityId: number | null
  valence: number // -1 (bad) .. +1 (good)
  intensity: number // 0..1
  tick: number
}

export interface MindState {
  episodes: Episode[]
  affinity: Record<number, number> // creatureId -> -1..1
  curiosity: number // 0..1 (genetic-ish, drifts)
  nextEpId: number
  lastExploreTick: number
}

export function createMind(): MindState {
  return { episodes: [], affinity: {}, curiosity: 0.5, nextEpId: 1, lastExploreTick: 0 }
}

export function remember(mind: MindState, kind: EpisodeKind, pos: Vec2, valence: number, intensity: number, tick: number): Episode {
  const ep: Episode = { id: mind.nextEpId++, kind, pos: { ...pos }, entityId: null, valence, intensity, tick }
  mind.episodes.push(ep)
  if (mind.episodes.length > 10) mind.episodes.shift()
  return ep
}

export function rememberEntity(mind: MindState, kind: EpisodeKind, entityId: number, valence: number, intensity: number, tick: number): void {
  const ep: Episode = { id: mind.nextEpId++, kind, pos: { x: 0, z: 0 }, entityId, valence, intensity, tick }
  mind.episodes.push(ep)
  if (mind.episodes.length > 10) mind.episodes.shift()
}

/** Fear spike when a remembered bad place/being is near. */
export function dreadAt(mind: MindState, pos: Vec2, radius = 7): number {
  let dread = 0
  for (const ep of mind.episodes) {
    if (ep.valence < -0.3) {
      const d = Math.hypot(ep.pos.x - pos.x, ep.pos.z - pos.z)
      if (d < radius) dread = Math.max(dread, ep.intensity * (1 - d / radius))
    }
  }
  return dread
}

/** Attraction toward remembered good places. */
export function drawAt(mind: MindState, pos: Vec2, radius = 10): Vec2 | null {
  let best: Vec2 | null = null
  let bestScore = 0
  for (const ep of mind.episodes) {
    if (ep.valence > 0.3) {
      const d = Math.hypot(ep.pos.x - pos.x, ep.pos.z - pos.z)
      if (d < radius) {
        const score = ep.intensity * (1 - d / radius)
        if (score > bestScore) {
          bestScore = score
          best = ep.pos
        }
      }
    }
  }
  return best
}

/** Intrinsic motivation: when curiosity is high and no urgent need, explore. */
export function wantsToExplore(mind: MindState, tick: number, rng: RNG, healthy: boolean): boolean {
  if (!healthy) return false
  if (mind.lastExploreTick > 0 && tick - mind.lastExploreTick < 120) return false
  const chance = mind.curiosity * 0.1
  if (rng() < chance) {
    mind.lastExploreTick = tick
    return true
  }
  return false
}

/** Social bond updates; friends share fear (emotional contagion). */
export function updateAffinity(mind: MindState, otherId: number, delta: number): void {
  mind.affinity[otherId] = clamp((mind.affinity[otherId] ?? 0) + delta, -1, 1)
}

export function affinityFor(mind: MindState, otherId: number): number {
  return mind.affinity[otherId] ?? 0
}

/** A bonded creature's fear bleeds into this one. */
export function contagion(mind: MindState, otherId: number, otherFear: number): number {
  const bond = affinityFor(mind, otherId)
  if (bond < 0.1) return 0
  return otherFear * bond * 0.35
}
