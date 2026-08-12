/**
 * scatter — where everything that grows or lies about ends up.
 *
 * Deterministic: the same valley, tree for tree, on every machine and every
 * load, which means a landmark description can say "the leaning pine" and be
 * telling the truth. Rendering instances these; gameplay harvests the subset
 * marked as resource nodes.
 */
import { mulberry32 } from '../lab/rng'
import { TOWERS } from '../lab/world'
import {
  TERRAIN_HALF, WATER_LEVEL, LAKE, heightAt, slopeAt, surfaceAt,
  distToRoad, distToRiver, isUnderwater, type SurfaceKind,
} from './terrain'
import { LANDMARKS } from './lore'

export type PropKind =
  | 'pine' | 'pineSnow' | 'tree' | 'treeAutumn' | 'birch' | 'willow' | 'deadTree'
  | 'bush' | 'berryBush' | 'rock' | 'mossRock' | 'snowRock'
  | 'stump' | 'log' | 'grass' | 'flower' | 'plant' | 'wheat' | 'corn' | 'lily'

export interface Prop {
  kind: PropKind
  /** which model variant of that kind */
  variant: number
  x: number
  y: number
  z: number
  rot: number
  scale: number
}

export type ResourceKind = 'berry' | 'wood' | 'stone' | 'herb' | 'grain' | 'fish'

export interface ResourceNode {
  id: string
  kind: ResourceKind
  x: number
  y: number
  z: number
  rot: number
  scale: number
  /** the prop drawn for it, so the world and the gameplay agree */
  prop: PropKind
  variant: number
}

export interface ScatterResult {
  props: Prop[]
  nodes: ResourceNode[]
}

/**
 * How many model files each kind can pick from. Must match the manifest in
 * `src/render/assets.ts` — few enough variants that first load stays quick,
 * enough that a forest does not look stamped.
 */
export const PROP_VARIANTS: Record<PropKind, number> = {
  pine: 3, pineSnow: 2, tree: 3, treeAutumn: 2, birch: 3, willow: 2, deadTree: 2,
  bush: 2, berryBush: 2, rock: 4, mossRock: 3, snowRock: 2,
  stump: 2, log: 2, grass: 3, flower: 1, plant: 3, wheat: 1, corn: 2, lily: 1,
}

/** Keep the ground clear where the settlement needs it. */
function blockedBySettlement(x: number, z: number): boolean {
  for (const t of TOWERS) {
    const pad = t.kind === 'grove' || t.kind === 'graveyard' ? 3 : t.radius * 0.4 + 3
    if (Math.hypot(t.x - x, t.z - z) < t.radius + pad) return true
  }
  for (const l of LANDMARKS) {
    if (Math.hypot(l.x - x, l.z - z) < l.radius * 0.5 + 3) return true
  }
  return false
}

interface Pick {
  kind: PropKind
  weight: number
  /** trees refuse steep ground; pebbles do not care */
  maxSlope?: number
  minScale?: number
  maxScale?: number
}

/** What grows on each kind of ground, and how often. */
const PALETTE: Record<SurfaceKind, { density: number; picks: Pick[] }> = {
  road: { density: 0, picks: [] },
  sand: {
    density: 0.1,
    picks: [
      { kind: 'rock', weight: 3, maxScale: 0.8 },
      { kind: 'grass', weight: 2 },
      { kind: 'log', weight: 1 },
    ],
  },
  marsh: {
    density: 0.4,
    picks: [
      { kind: 'plant', weight: 5 },
      { kind: 'willow', weight: 2, maxSlope: 0.3 },
      { kind: 'grass', weight: 4 },
      { kind: 'mossRock', weight: 1 },
    ],
  },
  meadow: {
    density: 0.16,
    picks: [
      { kind: 'flower', weight: 5 },
      { kind: 'grass', weight: 6 },
      { kind: 'bush', weight: 2 },
      { kind: 'tree', weight: 1.4, maxSlope: 0.3 },
      { kind: 'berryBush', weight: 1.2 },
      { kind: 'rock', weight: 0.8, maxScale: 0.7 },
    ],
  },
  grass: {
    density: 0.3,
    picks: [
      { kind: 'tree', weight: 3, maxSlope: 0.32 },
      { kind: 'birch', weight: 2, maxSlope: 0.32 },
      { kind: 'bush', weight: 3 },
      { kind: 'grass', weight: 4 },
      { kind: 'flower', weight: 1.5 },
      { kind: 'berryBush', weight: 1.2 },
      { kind: 'rock', weight: 1 },
      { kind: 'stump', weight: 0.5 },
    ],
  },
  farm: {
    density: 0.5,
    picks: [
      { kind: 'wheat', weight: 8 },
      { kind: 'corn', weight: 3 },
      { kind: 'plant', weight: 1 },
    ],
  },
  forest: {
    density: 0.62,
    picks: [
      { kind: 'pine', weight: 6, maxSlope: 0.38 },
      { kind: 'tree', weight: 4, maxSlope: 0.36 },
      { kind: 'birch', weight: 2.5, maxSlope: 0.36 },
      { kind: 'treeAutumn', weight: 1.2, maxSlope: 0.36 },
      { kind: 'bush', weight: 2.5 },
      { kind: 'mossRock', weight: 1.5 },
      { kind: 'stump', weight: 1 },
      { kind: 'log', weight: 1.2 },
      { kind: 'berryBush', weight: 1 },
      { kind: 'plant', weight: 1.5 },
      { kind: 'deadTree', weight: 0.6, maxSlope: 0.36 },
    ],
  },
  rock: {
    density: 0.24,
    picks: [
      { kind: 'rock', weight: 6 },
      { kind: 'mossRock', weight: 2 },
      { kind: 'deadTree', weight: 0.8, maxSlope: 0.45 },
      { kind: 'pine', weight: 1.2, maxSlope: 0.42 },
    ],
  },
  snow: {
    density: 0.2,
    picks: [
      { kind: 'snowRock', weight: 5 },
      { kind: 'pineSnow', weight: 3, maxSlope: 0.42 },
    ],
  },
}

/**
 * Trees have regional character: pine country to the north, birch out by the
 * old grove, and a band of turned leaves on the southern slopes.
 */
function regionalSwap(kind: PropKind, x: number, z: number): PropKind {
  if (kind === 'tree' || kind === 'pine' || kind === 'birch') {
    if (z < -70) return kind === 'birch' ? 'pine' : kind
    if (x > 40 && z < 20) return kind === 'pine' ? 'birch' : kind
    if (z > 110 && x < 0) return kind === 'pine' ? 'treeAutumn' : kind
  }
  return kind
}

function choosePick(picks: Pick[], r: number): Pick | null {
  let total = 0
  for (const p of picks) total += p.weight
  if (total <= 0) return null
  let t = r * total
  for (const p of picks) {
    t -= p.weight
    if (t <= 0) return p
  }
  return picks[picks.length - 1]
}

/**
 * Build the whole valley's vegetation and loose scenery.
 * Roughly five thousand instances — nothing for a modern GPU, once instanced.
 */
export function buildScatter(): ScatterResult {
  const rng = mulberry32(0x1a5eed)
  const props: Prop[] = []
  const nodes: ResourceNode[] = []
  let nodeId = 0

  const step = 4.6
  const limit = TERRAIN_HALF - 8
  for (let gx = -limit; gx <= limit; gx += step) {
    for (let gz = -limit; gz <= limit; gz += step) {
      const x = gx + (rng() - 0.5) * step * 1.5
      const z = gz + (rng() - 0.5) * step * 1.5
      const h = heightAt(x, z)

      if (h < WATER_LEVEL) {
        // lily pads in the shallows, and nothing else out on the water
        if (h > WATER_LEVEL - 1.1 && rng() < 0.14) {
          props.push({
            kind: 'lily', variant: Math.floor(rng() * PROP_VARIANTS.lily),
            x, y: WATER_LEVEL + 0.02, z, rot: rng() * Math.PI * 2, scale: 0.8 + rng() * 0.6,
          })
        }
        continue
      }

      const road = distToRoad(x, z)
      if (road < 4.2) continue
      if (blockedBySettlement(x, z)) continue

      const surface = surfaceAt(x, z, h)
      const palette = PALETTE[surface]
      if (!palette || palette.density <= 0) continue
      // thin out near roads so the verge stays walkable
      const verge = Math.min(1, (road - 4.2) / 4)
      if (rng() > palette.density * verge) continue

      const pick = choosePick(palette.picks, rng())
      if (!pick) continue
      const slope = slopeAt(x, z)
      if (pick.maxSlope != null && slope > pick.maxSlope) continue

      const kind = regionalSwap(pick.kind, x, z)
      const variant = Math.floor(rng() * PROP_VARIANTS[kind])
      const min = pick.minScale ?? 0.8
      const max = pick.maxScale ?? 1.25
      const scale = min + rng() * (max - min)
      const rot = rng() * Math.PI * 2

      // some of what grows here is worth picking
      const asNode = resourceFor(kind, x, z, rng)
      if (asNode) {
        nodes.push({
          id: `n${nodeId++}`, kind: asNode, x, y: h, z, rot, scale,
          prop: kind, variant,
        })
      } else {
        props.push({ kind, variant, x, y: h, z, rot, scale })
      }
    }
  }

  scatterGroundCover(props, rng)
  scatterShoreline(props, nodes, rng, () => nodeId++)
  return { props, nodes }
}

/** Which scattered things double as something you can gather. */
function resourceFor(kind: PropKind, x: number, z: number, rng: () => number): ResourceKind | null {
  if (kind === 'berryBush') return 'berry'
  if (kind === 'log') return 'wood'
  if (kind === 'stump' && rng() < 0.5) return 'wood'
  if ((kind === 'rock' || kind === 'mossRock') && rng() < 0.35) return 'stone'
  if (kind === 'plant' && rng() < 0.55) return 'herb'
  if (kind === 'wheat' && Math.hypot(x + 86, z - 18) < 40 && rng() < 0.3) return 'grain'
  return null
}

/** A denser, cheaper pass of grass tufts and flowers around the settlement. */
function scatterGroundCover(props: Prop[], rng: () => number): void {
  const step = 2.1
  const limit = 148
  for (let gx = -limit; gx <= limit; gx += step) {
    for (let gz = -limit; gz <= limit; gz += step) {
      const x = gx + (rng() - 0.5) * step * 1.6
      const z = gz + (rng() - 0.5) * step * 1.6
      const h = heightAt(x, z)
      if (h < WATER_LEVEL + 0.4) continue
      if (distToRoad(x, z) < 3.6) continue
      if (slopeAt(x, z) > 0.36) continue
      const surface = surfaceAt(x, z, h)
      if (surface === 'road' || surface === 'snow' || surface === 'rock' || surface === 'farm') continue
      if (blockedBySettlement(x, z)) continue
      const r = rng()
      if (r > 0.34) continue
      const flower = r < 0.05
      props.push({
        kind: flower ? 'flower' : 'grass',
        variant: flower ? 0 : Math.floor(rng() * PROP_VARIANTS.grass),
        x, y: h, z, rot: rng() * Math.PI * 2,
        scale: 0.7 + rng() * 0.7,
      })
    }
  }
}

/** Reeds, driftwood and fishing spots along the lake and the Coldrun. */
function scatterShoreline(
  props: Prop[], nodes: ResourceNode[], rng: () => number, nextId: () => number,
): void {
  // ring the lake
  for (let a = 0; a < Math.PI * 2; a += 0.012) {
    const r = LAKE.r + 1 + rng() * 5
    const x = LAKE.x + Math.cos(a) * r
    const z = LAKE.z + Math.sin(a) * r
    if (Math.abs(x) > TERRAIN_HALF - 6 || Math.abs(z) > TERRAIN_HALF - 6) continue
    const h = heightAt(x, z)
    if (h < WATER_LEVEL - 0.2 || h > WATER_LEVEL + 2.4) continue
    if (distToRoad(x, z) < 4.2) continue
    const roll = rng()
    if (roll < 0.3) {
      props.push({
        kind: 'plant', variant: Math.floor(rng() * PROP_VARIANTS.plant),
        x, y: h, z, rot: rng() * Math.PI * 2, scale: 0.9 + rng() * 0.6,
      })
    } else if (roll < 0.36) {
      nodes.push({
        id: `n${nextId()}`, kind: 'fish', x, y: h, z, rot: rng() * Math.PI * 2,
        scale: 1, prop: 'plant', variant: 0,
      })
    }
  }
  // and the riverbank
  for (let t = -200; t < 90; t += 3.5) {
    for (const side of [-1, 1]) {
      const z = t
      let x = 0
      // walk outward from the centre line until we leave the water
      for (let probe = 4; probe < 30; probe += 1.2) {
        const px = probeRiverX(z) + side * probe
        if (!isUnderwater(px, z)) {
          x = px
          break
        }
      }
      if (!x) continue
      const h = heightAt(x, z)
      if (h > WATER_LEVEL + 2) continue
      if (distToRoad(x, z) < 4.2) continue
      const roll = rng()
      if (roll < 0.35) {
        props.push({
          kind: 'plant', variant: Math.floor(rng() * PROP_VARIANTS.plant),
          x, y: h, z, rot: rng() * Math.PI * 2, scale: 0.8 + rng() * 0.5,
        })
      } else if (roll < 0.42) {
        nodes.push({
          id: `n${nextId()}`, kind: 'fish', x, y: h, z, rot: 0, scale: 1,
          prop: 'plant', variant: 0,
        })
      }
    }
  }
}

/** Rough x of the river centre at a given z, by sampling the carve. */
function probeRiverX(z: number): number {
  let best = 0
  let bestD = Infinity
  for (let x = -60; x <= 200; x += 4) {
    const d = distToRiver(x, z)
    if (d < bestD) {
      bestD = d
      best = x
    }
  }
  return best
}

let cached: ScatterResult | null = null

/** The valley's scenery, built once per session. */
export function worldScatter(): ScatterResult {
  if (!cached) cached = buildScatter()
  return cached
}
