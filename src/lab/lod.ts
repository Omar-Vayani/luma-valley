/**
 * lod — simulation level-of-detail + time-sliced AI.
 *
 * Distant / sleeping creatures update less often. Expensive mind re-scores are
 * batched so we never fully decide for every creature every tick. Chemistry
 * and aging still advance (possibly at reduced cadence) so needs stay honest.
 */
import type { Creature } from './creature'
import type { GameSettings } from './settings'
import { dist } from './util'

export type LodBand = 'near' | 'mid' | 'far' | 'sleep'

export interface LodState {
  /** Round-robin cursor into the creature list for AI batches. */
  aiCursor: number
  /** Per-creature last full-decide tick. */
  lastDecide: Record<number, number>
  /** Accumulated frame-time samples (ms) for the perf HUD. */
  samples: number[]
  lastCpuMs: number
}

export function createLodState(): LodState {
  return { aiCursor: 0, lastDecide: {}, samples: [], lastCpuMs: 0 }
}

export function bandFor(
  c: Creature,
  focusX: number,
  focusZ: number,
  settings: GameSettings,
): LodBand {
  if (c.sleeping) return 'sleep'
  const d = dist(c.pos.x, c.pos.z, focusX, focusZ)
  if (d <= settings.lodNear) return 'near'
  if (d <= settings.lodFar) return 'mid'
  return 'far'
}

/**
 * Should this creature run a full decide() this tick?
 * Near: every tick (subject to batch). Mid: every 3. Far/sleep: every 8.
 */
export function shouldFullDecide(
  _c: Creature,
  band: LodBand,
  tick: number,
  lastDecide: number,
): boolean {
  const age = tick - lastDecide
  if (band === 'near') return age >= 1
  if (band === 'mid') return age >= 3
  return age >= 8
}

/**
 * Chemistry tick stride — far/sleep creatures still need decay, just slower cadence
 * with multiplied dt so totals stay roughly correct.
 */
export function chemStride(band: LodBand): { every: number; dt: number } {
  if (band === 'near') return { every: 1, dt: 1 }
  if (band === 'mid') return { every: 2, dt: 2 }
  if (band === 'sleep') return { every: 4, dt: 4 }
  return { every: 4, dt: 4 }
}

/**
 * Pick up to `batchSize` creatures that are due for a full AI decide,
 * advancing the round-robin cursor so everyone gets a turn.
 */
export function pickAiBatch(
  creatures: Creature[],
  focusX: number,
  focusZ: number,
  settings: GameSettings,
  lod: LodState,
  tick: number,
): Creature[] {
  const alive = creatures.filter((c) => c.alive)
  if (alive.length === 0) return []
  const out: Creature[] = []
  const n = alive.length
  let scanned = 0
  while (out.length < settings.aiBatchSize && scanned < n) {
    const idx = lod.aiCursor % n
    lod.aiCursor = idx + 1
    scanned++
    const c = alive[idx]
    const band = bandFor(c, focusX, focusZ, settings)
    const last = lod.lastDecide[c.id] ?? -999
    if (shouldFullDecide(c, band, tick, last)) {
      out.push(c)
    }
  }
  return out
}

export function markDecided(lod: LodState, id: number, tick: number): void {
  lod.lastDecide[id] = tick
}

export function recordFrameTime(lod: LodState, ms: number): void {
  lod.lastCpuMs = ms
  lod.samples.push(ms)
  if (lod.samples.length > 60) lod.samples.shift()
}

export function avgFrameMs(lod: LodState): number {
  if (lod.samples.length === 0) return 0
  return lod.samples.reduce((a, b) => a + b, 0) / lod.samples.length
}

/** Rough per-creature cost estimate for the perf inspector. */
export function estimateCreatureCostKb(c: Creature): number {
  // structured estimate — memories, relationships, brain weights
  const mem = (c.memory.episodes.length * 0.08) + Object.keys(c.reputation).length * 0.04
  const brain = (c.brain.w1.length + c.brain.w2.length) * 0.004
  const vocab = c.language.vocab.size * 0.02
  const bonds = Object.keys(c.bonds).length * 0.02
  return Math.round((8 + mem + brain + vocab + bonds) * 10) / 10 // ~KB
}
