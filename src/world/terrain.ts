/**
 * terrain — the shape of the valley Haven was built in.
 *
 * One deterministic height function, shared by the renderer (which tessellates
 * it), the player controller (which walks on it), and the scatter pass (which
 * decides where a tree can stand). No seed: this is *the* valley, the same one
 * every time, so its geography can carry a history.
 *
 * The composition, outward from the plaza:
 *   basin      a flat-ish bowl the settlement sits in
 *   hills      rolling ground, farmland to the west, woods to the north
 *   rim        mountains that close the valley and hide the world's edge
 *   water      the Coldrun river, cutting south-east into Mirror Lake
 */

export const TERRAIN_HALF = 220
export const TERRAIN_SIZE = TERRAIN_HALF * 2

/** Everything below this is underwater. The water plane is drawn here. */
export const WATER_LEVEL = -1.8

/** How far from the plaza the ground stays comfortably flat. */
export const BASIN_RADIUS = 86

// ---------------------------------------------------------------- noise

function hash2(ix: number, iy: number): number {
  let h = ix * 374761393 + iy * 668265263
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/** Value noise in -1..1. Cheap, and chunky in a way low-poly terrain likes. */
function noise2(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = smootherstep(x - ix)
  const fy = smootherstep(y - iy)
  const a = hash2(ix, iy)
  const b = hash2(ix + 1, iy)
  const c = hash2(ix, iy + 1)
  const d = hash2(ix + 1, iy + 1)
  const top = a + (b - a) * fx
  const bot = c + (d - c) * fx
  return (top + (bot - top) * fy) * 2 - 1
}

/** Fractal noise in roughly -1..1. */
function fbm(x: number, y: number, octaves: number): number {
  let sum = 0
  let amp = 1
  let norm = 0
  let fx = x
  let fy = y
  for (let i = 0; i < octaves; i++) {
    sum += noise2(fx, fy) * amp
    norm += amp
    amp *= 0.5
    fx *= 2.03
    fy *= 1.97
  }
  return sum / norm
}

/** Sharp-crested noise, for mountain ridges. */
function ridge(x: number, y: number, octaves: number): number {
  let sum = 0
  let amp = 1
  let norm = 0
  let fx = x
  let fy = y
  for (let i = 0; i < octaves; i++) {
    sum += (1 - Math.abs(noise2(fx, fy))) * amp
    norm += amp
    amp *= 0.5
    fx *= 2.11
    fy *= 2.03
  }
  return sum / norm
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// ---------------------------------------------------------------- geography

export interface Point {
  x: number
  z: number
}

/**
 * The Coldrun: out of the north gorge, down the eastern side of the valley,
 * into Mirror Lake. It runs wide of the settlement on purpose — Haven was
 * built back from the water after the flood the chronicles still name.
 */
export const RIVER: Point[] = [
  { x: -44, z: -214 },
  { x: -8, z: -180 },
  { x: 30, z: -152 },
  { x: 66, z: -134 },
  { x: 96, z: -118 },
  { x: 112, z: -92 },
  { x: 120, z: -58 },
  { x: 122, z: -18 },
  { x: 126, z: 20 },
  { x: 140, z: 52 },
  { x: 156, z: 80 },
]

/** Mirror Lake, east of the settlement, fed by the Coldrun. */
export const LAKE = { x: 168, z: 96, r: 70 }

/**
 * Roads. The plaza is the hub; the ways out of the valley are named on the
 * map and matter for arrivals — travellers walk in along the South Road.
 */
export const ROADS: Point[][] = [
  // north way: plaza past the coinhouse and out through the gorge
  [{ x: 0, z: 0 }, { x: -4, z: -42 }, { x: -12, z: -86 }, { x: -26, z: -140 }, { x: -38, z: -178 }],
  // south road: the way travellers arrive
  [{ x: 0, z: 0 }, { x: 2, z: 46 }, { x: 10, z: 92 }, { x: 18, z: 140 }, { x: 24, z: 176 }],
  // east lane: out past the grove, over the Coldrun at the Old Bridge
  [{ x: 0, z: 0 }, { x: 40, z: -6 }, { x: 80, z: -18 }, { x: 112, z: -30 }, { x: 150, z: -40 }, { x: 180, z: -44 }],
  // west track: out to the fields and the standing stones
  [{ x: 0, z: 0 }, { x: -42, z: -2 }, { x: -84, z: 4 }, { x: -130, z: -14 }, { x: -180, z: -50 }],
  // the hearths lane, curling north-west off the plaza
  [{ x: 0, z: 0 }, { x: -22, z: -16 }, { x: -42, z: -26 }, { x: -58, z: -32 }, { x: -72, z: -44 }],
  // the workyard lane, south-east
  [{ x: 4, z: 6 }, { x: 26, z: 28 }, { x: 42, z: 50 }, { x: 46, z: 66 }],
  // grove path to the resting ground
  [{ x: 26, z: 26 }, { x: 46, z: 54 }, { x: 64, z: 78 }],
  // the hollow path, off the east lane into the old grove
  [{ x: 80, z: -18 }, { x: 74, z: -34 }, { x: 70, z: -46 }],
  // the lake shore path, off the east lane past the bridge
  [{ x: 150, z: -40 }, { x: 156, z: -8 }, { x: 146, z: 24 }],
]

/** Where the east lane crosses the Coldrun — the Old Bridge stands here. */
export const BRIDGE = { x: 121, z: -31, angle: 1.83, span: 30 }

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0
  t = Math.min(1, Math.max(0, t))
  const cx = ax + dx * t
  const cz = az + dz * t
  return Math.hypot(px - cx, pz - cz)
}

function distToPath(path: Point[], x: number, z: number): number {
  let best = Infinity
  for (let i = 0; i < path.length - 1; i++) {
    const d = distToSegment(x, z, path[i].x, path[i].z, path[i + 1].x, path[i + 1].z)
    if (d < best) best = d
  }
  return best
}

/** Distance to the nearest road centre line. */
export function distToRoad(x: number, z: number): number {
  let best = Infinity
  for (const r of ROADS) {
    const d = distToPath(r, x, z)
    if (d < best) best = d
  }
  return best
}

/** 1 on the packed dirt of a road, falling to 0 on the verge. */
export function roadStrength(x: number, z: number): number {
  return 1 - smoothstep(2.1, 4.0, distToRoad(x, z))
}

/** The paved square around the well, where five ways meet. */
export function plazaStrength(x: number, z: number): number {
  return 1 - smoothstep(11, 15.5, Math.hypot(x, z))
}

/** Distance to the river's centre line. */
export function distToRiver(x: number, z: number): number {
  return distToPath(RIVER, x, z)
}

/** How wide the Coldrun runs here — narrow in the gorge, broad near the lake. */
function riverWidth(z: number): number {
  return lerp(5.5, 13, smoothstep(-160, 40, z))
}

// ---------------------------------------------------------------- height

/**
 * Ground height at a world position. This is the authority: the mesh, the
 * player's feet, and every scattered prop all read it.
 */
/**
 * Where each landmark needs level ground, and how much of it. Kept here rather
 * than read from `lore.ts` so the height field has no dependency on the
 * storytelling — the numbers are about standing up, not about meaning.
 */
const LANDMARK_PADS: { id: string; x: number; z: number; r: number }[] = [
  { id: 'stones', x: -178, z: -58, r: 12 },
  { id: 'watchtower', x: -124, z: 128, r: 9 },
  { id: 'wreck', x: 118, z: 62, r: 7 },
  { id: 'waystone', x: 20, z: 138, r: 5 },
  { id: 'cairn', x: -70, z: -114, r: 5 },
  { id: 'arch', x: -32, z: -138, r: 10 },
  { id: 'orchard', x: -104, z: 44, r: 14 },
  { id: 'hollowtree', x: 78, z: -52, r: 7 },
  { id: 'mill', x: -98, z: -34, r: 6 },
  { id: 'shrine', x: -140, z: 74, r: 5 },
]

/**
 * Ground height before the landmarks are given somewhere level to stand.
 * Split out so a pad can ask what the height *would* be at its own centre
 * without asking itself.
 */
function baseHeight(x: number, z: number): number {
  // rolling country
  let h = fbm(x * 0.0052, z * 0.0052, 4) * 26 + fbm(x * 0.016, z * 0.016, 3) * 4.5

  // the rim: mountains rising toward the edge of the world, so the valley
  // reads as enclosed rather than as a map that simply stops
  const edge = Math.max(Math.abs(x), Math.abs(z)) / TERRAIN_HALF
  const rimAmount = smoothstep(0.5, 1.0, edge)
  if (rimAmount > 0) {
    const peaks = ridge(x * 0.009, z * 0.009, 4)
    h += rimAmount * rimAmount * (72 + peaks * 96)
  }

  // the basin the settlement sits in — flattened, with a little character left
  const dc = Math.hypot(x, z)
  const basin = 1 - smoothstep(BASIN_RADIUS, 178, dc)
  if (basin > 0) {
    const gentle = fbm(x * 0.014, z * 0.014, 3) * 2.1 + fbm(x * 0.05, z * 0.05, 2) * 0.5
    h = lerp(h, gentle, basin * basin * (3 - 2 * basin))
  }

  // Beacon Hill: the lookout south-west, where the watchtower burned
  const bh = Math.hypot(x + 124, z - 128)
  h += (1 - smoothstep(0, 64, bh)) * 44

  // the Fieldworks terrace: farmland wants to be flat
  const farm = 1 - smoothstep(26, 54, Math.hypot(x + 86, z - 18))
  if (farm > 0) h = lerp(h, 1.2, farm * 0.92)

  // the Founders' plateau, so the standing stones have somewhere to stand
  const stones = 1 - smoothstep(14, 40, Math.hypot(x + 178, z + 58))
  if (stones > 0) h = lerp(h, 26, stones * 0.9)

  // Mirror Lake basin
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z)
  const lake = 1 - smoothstep(LAKE.r * 0.45, LAKE.r * 1.05, ld)
  if (lake > 0) h = lerp(h, -9.5, lake * lake)

  // the Coldrun, carved through whatever it crosses
  const rd = distToRiver(x, z)
  const w = riverWidth(z)
  if (rd < w + 20) {
    const channel = 1 - smoothstep(w * 0.5, w + 16, rd)
    h = lerp(h, -5.2, channel * channel * (3 - 2 * channel))
  }

  // Roads are cut and filled flat, the way roads are — but only across ground
  // a road would plausibly be built on. Without the taper, the way out of the
  // valley carves a hundred-metre slot straight through the rim. They keep a
  // little of the ground's own roll, or they read as painted stripes.
  const road = roadStrength(x, z)
  if (road > 0) {
    const buildable = 1 - smoothstep(16, 38, h)
    const along = fbm(x * 0.01, z * 0.01, 2) * 1.4
    h = lerp(h, along, road * 0.74 * buildable)
  }

  // the market square is levelled, the way a market square is
  const plaza = plazaStrength(x, z)
  if (plaza > 0) h = lerp(h, 0.15, plaza * 0.95)

  return h
}

/** Cached ground height at each landmark, so its pad can level to itself. */
const padHeights = new Map<string, number>()

/**
 * Ground height at a world position. This is the authority: the mesh, the
 * player's feet, and every scattered prop all read it.
 */
export function heightAt(x: number, z: number): number {
  let h = baseHeight(x, z)

  // Give every landmark a level footing. Without this the standing stones lean
  // out of a hillside and the arch has one leg in the air.
  for (const l of LANDMARK_PADS) {
    const d = Math.hypot(l.x - x, l.z - z)
    if (d > l.r * 1.9) continue
    let base = padHeights.get(l.id)
    if (base === undefined) {
      base = baseHeight(l.x, l.z)
      padHeights.set(l.id, base)
    }
    h = lerp(h, base, (1 - smoothstep(l.r, l.r * 1.9, d)) * 0.92)
  }

  return h
}

/** Surface normal, from finite differences on the height field. */
export function normalAt(x: number, z: number, out?: { x: number; y: number; z: number }) {
  const e = 0.9
  const hl = heightAt(x - e, z)
  const hr = heightAt(x + e, z)
  const hd = heightAt(x, z - e)
  const hu = heightAt(x, z + e)
  const nx = hl - hr
  const nz = hd - hu
  const ny = 2 * e
  const len = Math.hypot(nx, ny, nz) || 1
  const n = out ?? { x: 0, y: 0, z: 0 }
  n.x = nx / len
  n.y = ny / len
  n.z = nz / len
  return n
}

/** 0 on the flat, 1 on a cliff. */
export function slopeAt(x: number, z: number): number {
  return 1 - normalAt(x, z).y
}

export function isUnderwater(x: number, z: number): boolean {
  return heightAt(x, z) < WATER_LEVEL
}

/** Water depth at a point, 0 on dry land. */
export function waterDepth(x: number, z: number): number {
  return Math.max(0, WATER_LEVEL - heightAt(x, z))
}

// ---------------------------------------------------------------- surface

export type SurfaceKind =
  | 'road'
  | 'sand'
  | 'grass'
  | 'meadow'
  | 'farm'
  | 'forest'
  | 'rock'
  | 'snow'
  | 'marsh'

/**
 * What the ground is made of here. Drives terrain colour, footstep sound,
 * and what the scatter pass is willing to plant.
 */
export function surfaceAt(x: number, z: number, h = heightAt(x, z)): SurfaceKind {
  if (plazaStrength(x, z) > 0.4) return 'road'
  if (roadStrength(x, z) > 0.55) return 'road'
  if (h < WATER_LEVEL + 1.4) return 'sand'
  const slope = slopeAt(x, z)
  if (h > 46 && slope < 0.55) return 'snow'
  if (slope > 0.42 || h > 34) return 'rock'
  if (Math.hypot(x + 86, z - 18) < 42 && h < 6) return 'farm'
  if (distToRiver(x, z) < riverWidth(z) + 9 && h < 2) return 'marsh'
  const dc = Math.hypot(x, z)
  if (dc < BASIN_RADIUS + 24) return 'meadow'
  // the northern woods and the eastern birchwood read as forest floor
  const wood = fbm(x * 0.011 + 40, z * 0.011 - 17, 3)
  return wood > 0.02 ? 'forest' : 'grass'
}

/** True where something the size of a building or a tree can stand. */
export function isBuildable(x: number, z: number): boolean {
  const h = heightAt(x, z)
  if (h < WATER_LEVEL + 0.8) return false
  return slopeAt(x, z) < 0.34
}

// ---------------------------------------------------------------- regions

export interface Region {
  id: string
  name: string
  x: number
  z: number
  r: number
}

/**
 * Named places. Entering one titles the screen, the way a good open world
 * tells you where you are without a map.
 */
export const REGIONS: Region[] = [
  { id: 'plaza', name: 'Haven Plaza', x: 0, z: 0, r: 24 },
  { id: 'market', name: 'Market Row', x: -26, z: -18, r: 20 },
  { id: 'hearths', name: 'The Hearths', x: -58, z: -32, r: 32 },
  { id: 'workyard', name: 'The Workyard', x: 46, z: 64, r: 28 },
  { id: 'fields', name: 'Fieldworks', x: -86, z: 18, r: 46 },
  { id: 'grove', name: 'Rest Grove', x: 64, z: 80, r: 24 },
  { id: 'oldgrove', name: 'The Old Grove', x: 74, z: -48, r: 34 },
  { id: 'bridge', name: 'The Old Bridge', x: 121, z: -31, r: 20 },
  { id: 'lake', name: 'Mirror Lake', x: 168, z: 96, r: 76 },
  { id: 'beacon', name: 'Beacon Hill', x: -124, z: 128, r: 62 },
  { id: 'stones', name: 'The Founders\u2019 Stones', x: -178, z: -58, r: 40 },
  { id: 'gorge', name: 'Coldrun Gorge', x: -20, z: -170, r: 56 },
  { id: 'northwood', name: 'The Northwood', x: -70, z: -114, r: 58 },
  { id: 'southroad', name: 'The South Road', x: 16, z: 142, r: 48 },
]

export function regionAt(x: number, z: number): Region | null {
  let best: Region | null = null
  let bestScore = Infinity
  for (const r of REGIONS) {
    const d = Math.hypot(r.x - x, r.z - z)
    if (d > r.r) continue
    const score = d / r.r
    if (score < bestScore) {
      bestScore = score
      best = r
    }
  }
  return best
}

/** Keep a walker inside the playable valley. */
export function clampToTerrain(v: number): number {
  const limit = TERRAIN_HALF - 6
  return Math.max(-limit, Math.min(limit, v))
}
