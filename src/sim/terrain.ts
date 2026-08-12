/**
 * terrain — the shape of the valley.
 *
 * One pure height function, shared by everything. The renderer tessellates it,
 * the player walks on it, creatures stand on it and every prop is planted with
 * it. Nothing else is allowed to have an opinion about where the ground is,
 * which is the only way to be sure nothing ends up floating above it.
 *
 * The valley is deliberately small and deliberately calm: a flat green bowl
 * with a hamlet in it, a pond off to one side, and hills all the way round
 * that rise gently enough to look like somewhere rather than a wall.
 */

export const HALF = 110
export const SIZE = HALF * 2

/** Where the hamlet sits. The ground is flattened here. */
export const VILLAGE = { x: 0, z: 0, radius: 34 }

/** The pond, east of the green. */
export const POND = { x: 44, z: 20, radius: 15 }
export const WATER_LEVEL = -0.55

function hash(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return n - Math.floor(n)
}

/** Value noise, smooth enough that a hillside has no steps in it. */
function noise(x: number, z: number): number {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const xf = x - xi
  const zf = z - zi
  const u = xf * xf * (3 - 2 * xf)
  const v = zf * zf * (3 - 2 * zf)
  const a = hash(xi, zi)
  const b = hash(xi + 1, zi)
  const c = hash(xi, zi + 1)
  const d = hash(xi + 1, zi + 1)
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Height of the ground at a point. The single source of truth. */
export function heightAt(x: number, z: number): number {
  // rolling ground
  let h = noise(x * 0.021, z * 0.021) * 5.2
  h += noise(x * 0.052, z * 0.052) * 1.7
  h += noise(x * 0.13, z * 0.13) * 0.45
  h -= 3.4

  // the rim: hills that close the valley in, rising from 70 m out
  const fromCentre = Math.hypot(x, z)
  const rim = smoothstep(66, HALF - 6, fromCentre)
  h += rim * rim * 46

  // the green: flattened towards zero so the hamlet sits level and nothing leans
  const flat = 1 - smoothstep(VILLAGE.radius * 0.55, VILLAGE.radius * 1.35, Math.hypot(x - VILLAGE.x, z - VILLAGE.z))
  h *= 1 - flat

  // the pond: a shallow dish
  const pond = 1 - smoothstep(POND.radius * 0.2, POND.radius, Math.hypot(x - POND.x, z - POND.z))
  h -= pond * 2.3

  return h
}

/** Surface normal, from finite differences on the height function. */
export function normalAt(x: number, z: number, out: [number, number, number] = [0, 1, 0]): [number, number, number] {
  const e = 0.6
  const hx = heightAt(x + e, z) - heightAt(x - e, z)
  const hz = heightAt(x, z + e) - heightAt(x, z - e)
  const nx = -hx
  const nz = -hz
  const ny = 2 * e
  const len = Math.hypot(nx, ny, nz) || 1
  out[0] = nx / len
  out[1] = ny / len
  out[2] = nz / len
  return out
}

/** How steep it is here, 0 flat .. 1 sheer. */
export function slopeAt(x: number, z: number): number {
  const n = normalAt(x, z)
  return 1 - n[1]
}

export function isUnderwater(x: number, z: number): boolean {
  return heightAt(x, z) < WATER_LEVEL
}

export function waterDepth(x: number, z: number): number {
  return Math.max(0, WATER_LEVEL - heightAt(x, z))
}

export type Surface = 'grass' | 'dirt' | 'stone' | 'water' | 'wood'

export function surfaceAt(x: number, z: number): Surface {
  if (isUnderwater(x, z)) return 'water'
  const fromCentre = Math.hypot(x - VILLAGE.x, z - VILLAGE.z)
  // A paved centre and a worn ring around the well, then grass. The bare
  // ground used to run the full flattened radius, which made the whole
  // settlement a thirty-metre patch of brown.
  if (fromCentre < 6.5) return 'stone'
  if (fromCentre < 13) return 'dirt'
  return 'grass'
}

/** Keep a coordinate inside the valley. */
export function clampToValley(v: number): number {
  return Math.max(-HALF + 4, Math.min(HALF - 4, v))
}

/** Somewhere a creature can reasonably stand: on land, not on a steep face. */
export function isWalkable(x: number, z: number): boolean {
  if (Math.abs(x) > HALF - 6 || Math.abs(z) > HALF - 6) return false
  if (isUnderwater(x, z)) return false
  return slopeAt(x, z) < 0.34
}
