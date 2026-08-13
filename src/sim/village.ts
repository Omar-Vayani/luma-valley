/**
 * village — the hamlet, described once.
 *
 * This module is the single description of every built thing in the valley:
 * where it stands, how big it is, where its door is, what is inside it and
 * what of it is solid. The renderer builds meshes from this, the collision
 * grid is filled from this, and the creatures navigate by this. Because there
 * is only one description, a wall cannot be drawn somewhere you can walk
 * through, and a door cannot be drawn somewhere a creature will not fit.
 *
 * Everything is timber. Sawn plank walls on a low stone footing, shingle
 * roofs, exposed corner posts — the colours of a wood-built place rather than
 * the plaster-and-tile village this replaced.
 */
import { heightAt } from './terrain'
import { box, circle, type Solid } from './collision'

/** Every door in the valley is this wide. There are no exceptions. */
export const DOOR_WIDTH = 1.2
export const DOOR_HEIGHT = 2.15
export const WALL_THICKNESS = 0.22

export type BuildingKind = 'longhouse' | 'cottage' | 'barn' | 'store'

export interface Building {
  id: string
  name: string
  kind: BuildingKind
  /** centre of the footprint */
  x: number
  z: number
  /** full outer size along the building's own axes */
  width: number
  depth: number
  /** yaw: the door faces this way */
  rot: number
  wallHeight: number
  /** ground height under the centre — the floor sits here, level */
  floorY: number
}

export interface Place {
  id: string
  kind: 'food' | 'water' | 'bed' | 'fire' | 'toy' | 'shelter'
  x: number
  z: number
  /** which building it belongs to, if any */
  building?: string
  /** food places are eaten down and grow back */
  amount?: number
}

export interface VillageModel {
  buildings: Building[]
  places: Place[]
  /** everything solid, ready to be filed into the grid */
  solids: Solid[]
  /** decorative, non-solid dressing the renderer draws */
  dressing: Array<{ kind: string; x: number; z: number; rot: number; scale: number }>
}

/** Unit vector the building's door faces. */
export function facing(b: Building): { x: number; z: number } {
  return { x: Math.sin(b.rot), z: Math.cos(b.rot) }
}

/** The spot outside the door where somebody waits to go in. */
export function doorOutside(b: Building): { x: number; z: number } {
  const f = facing(b)
  const out = b.depth / 2 + 1.5
  return { x: b.x + f.x * out, z: b.z + f.z * out }
}

/** The spot just inside the door. */
export function doorInside(b: Building): { x: number; z: number } {
  const f = facing(b)
  const inn = b.depth / 2 - 1.3
  return { x: b.x + f.x * inn, z: b.z + f.z * inn }
}

/**
 * The middle of the opening itself.
 *
 * Walking from outside the door straight to inside it is not good enough: a
 * body allowed to arrive anywhere within half a metre of the outside step can
 * start its next leg well off the centre line, clip the door cheek, and spend
 * the rest of the day sliding along the front of the house. Aiming at the
 * threshold first lines them up with the gap.
 */
export function doorThreshold(b: Building): { x: number; z: number } {
  const f = facing(b)
  const at = b.depth / 2
  return { x: b.x + f.x * at, z: b.z + f.z * at }
}

/**
 * World → the building's own frame. Must be the exact inverse of `toWorld`;
 * when it was not, furniture computed in local coordinates reported itself as
 * being outside the building it was standing in.
 */
export function toLocal(b: Building, x: number, z: number): { lx: number; lz: number } {
  const cos = Math.cos(b.rot)
  const sin = Math.sin(b.rot)
  const dx = x - b.x
  const dz = z - b.z
  return { lx: dx * cos - dz * sin, lz: dx * sin + dz * cos }
}

/** Is this point inside the walls of this building? */
export function isInside(b: Building, x: number, z: number, margin = 0): boolean {
  const { lx, lz } = toLocal(b, x, z)
  return (
    Math.abs(lx) < b.width / 2 - WALL_THICKNESS + margin &&
    Math.abs(lz) < b.depth / 2 - WALL_THICKNESS + margin
  )
}

/** Local → world for a point in the building's own frame. */
export function toWorld(b: Building, lx: number, lz: number): { x: number; z: number } {
  const cos = Math.cos(b.rot)
  const sin = Math.sin(b.rot)
  return { x: b.x + lx * cos + lz * sin, z: b.z - lx * sin + lz * cos }
}

/**
 * The solid parts of one building: four walls, with the front wall split
 * either side of the doorway. The split is computed from `DOOR_WIDTH`, so a
 * building can never end up with a door the width of its own frontage.
 */
export function buildingSolids(b: Building): Solid[] {
  const hw = b.width / 2
  const hd = b.depth / 2
  const t = WALL_THICKNESS
  const h = b.wallHeight
  const out: Solid[] = []
  const cos = Math.cos(b.rot)
  const sin = Math.sin(b.rot)
  const place = (lx: number, lz: number, halfW: number, halfD: number): void => {
    if (halfW <= 0.01 || halfD <= 0.01) return
    out.push(box(b.x + lx * cos + lz * sin, b.z - lx * sin + lz * cos, halfW, halfD, -b.rot, h, 'wall'))
  }

  // back wall (away from the door) and the two sides, full length
  place(0, -hd + t / 2, hw, t / 2)
  place(-hw + t / 2, 0, t / 2, hd)
  place(hw - t / 2, 0, t / 2, hd)

  // front wall, in two pieces around the doorway
  const cheek = (b.width - DOOR_WIDTH) / 2
  if (cheek > 0.05) {
    const halfCheek = cheek / 2
    place(-hw + halfCheek, hd - t / 2, halfCheek, t / 2)
    place(hw - halfCheek, hd - t / 2, halfCheek, t / 2)
  }
  return out
}

/** Where the bed, the hearth and the table go inside a building. */
export function furnitureOf(b: Building): Array<{ kind: 'bed' | 'hearth' | 'table'; x: number; z: number; rot: number }> {
  const hw = b.width / 2
  const hd = b.depth / 2
  const out: Array<{ kind: 'bed' | 'hearth' | 'table'; x: number; z: number; rot: number }> = []
  const bed = toWorld(b, -hw + 1.1, -hd + 1.35)
  out.push({ kind: 'bed', x: bed.x, z: bed.z, rot: b.rot })
  const hearth = toWorld(b, hw - 0.95, -hd + 1.0)
  out.push({ kind: 'hearth', x: hearth.x, z: hearth.z, rot: b.rot })
  if (b.kind === 'longhouse') {
    const table = toWorld(b, 0, 0)
    out.push({ kind: 'table', x: table.x, z: table.z, rot: b.rot })
  }
  return out
}

// ---------------------------------------------------------------- the layout

interface Plot {
  id: string
  name: string
  kind: BuildingKind
  /** distance from the green's centre, and the bearing to stand on */
  radius: number
  bearing: number
  width: number
  depth: number
}

/**
 * Six buildings around a green. Each faces the middle, so the hamlet reads as
 * a place people arranged rather than a scatter of boxes.
 */
const PLOTS: Plot[] = [
  { id: 'longhouse', name: 'The Longhouse', kind: 'longhouse', radius: 20, bearing: 0, width: 9, depth: 6.5 },
  { id: 'cottage-east', name: "Sable's Cottage", kind: 'cottage', radius: 17, bearing: Math.PI * 0.34, width: 5.4, depth: 4.8 },
  { id: 'cottage-south', name: "Pip's Cottage", kind: 'cottage', radius: 18, bearing: Math.PI * 0.68, width: 5.4, depth: 4.8 },
  { id: 'store', name: 'The Store', kind: 'store', radius: 19, bearing: Math.PI, width: 6, depth: 5 },
  { id: 'cottage-west', name: "Moss's Cottage", kind: 'cottage', radius: 18, bearing: Math.PI * 1.32, width: 5.4, depth: 4.8 },
  { id: 'barn', name: 'The Barn', kind: 'barn', radius: 21, bearing: Math.PI * 1.66, width: 7.5, depth: 6 },
]

/**
 * Is this spot already spoken for? Anything within a building's footprint, or
 * standing in the corridor somebody walks along to reach its door, is
 * refused. The old village grew a berry bush directly in front of a cottage
 * door, which was enough to seal a Luma inside it.
 */
function occupied(buildings: Building[], x: number, z: number, r: number): boolean {
  for (const b of buildings) {
    const { lx, lz } = toLocal(b, x, z)
    if (Math.abs(lx) < b.width / 2 + r + 0.5 && Math.abs(lz) < b.depth / 2 + r + 0.5) return true

    // the approach: a corridor as wide as the door plus elbow room, running
    // from the threshold out into the green
    const f = facing(b)
    const start = { x: b.x + f.x * (b.depth / 2), z: b.z + f.z * (b.depth / 2) }
    for (let i = 0; i <= 5; i++) {
      const t = i / 5
      const px = start.x + f.x * t * 4.5
      const pz = start.z + f.z * t * 4.5
      if (Math.hypot(px - x, pz - z) < r + 1.3) return true
    }
  }
  return false
}

/**
 * Put a thing down near where it was wanted, but somewhere it actually fits.
 * Returns null if there is nowhere, which is better than overlapping.
 */
function findSpot(
  buildings: Building[], taken: Array<{ x: number; z: number; r: number }>,
  x: number, z: number, r: number,
): { x: number; z: number } | null {
  for (let attempt = 0; attempt < 24; attempt++) {
    // spiral outwards from the wanted spot
    const angle = attempt * 2.399963
    const step = attempt === 0 ? 0 : 1 + attempt * 0.45
    const px = x + Math.sin(angle) * step
    const pz = z + Math.cos(angle) * step
    if (occupied(buildings, px, pz, r)) continue
    if (taken.some((t) => Math.hypot(t.x - px, t.z - pz) < t.r + r + 0.4)) continue
    // not on top of the well or the fire either
    if (Math.hypot(px, pz) < 2.4) continue
    return { x: px, z: pz }
  }
  return null
}

/**
 * A standing spot next to a piece of furniture: a metre and a bit towards the
 * middle of the room, which is somewhere a creature can actually get to.
 */
function approachSpot(b: Building, x: number, z: number): { x: number; z: number } {
  const dx = b.x - x
  const dz = b.z - z
  const d = Math.hypot(dx, dz) || 1
  return { x: x + (dx / d) * 1.25, z: z + (dz / d) * 1.25 }
}

export function buildVillage(): VillageModel {
  const buildings: Building[] = PLOTS.map((p) => {
    const x = Math.sin(p.bearing) * p.radius
    const z = Math.cos(p.bearing) * p.radius
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      x,
      z,
      width: p.width,
      depth: p.depth,
      // face the green: the door looks back towards the middle
      rot: Math.atan2(-x, -z),
      wallHeight: p.kind === 'longhouse' || p.kind === 'barn' ? 3.1 : 2.6,
      floorY: heightAt(x, z),
    }
  })

  const solids: Solid[] = []
  const places: Place[] = []
  const dressing: VillageModel['dressing'] = []

  for (const b of buildings) {
    solids.push(...buildingSolids(b))
    for (const f of furnitureOf(b)) {
      if (f.kind === 'bed') {
        // The waypoint is beside the bed, not on it. Aiming a creature at the
        // middle of a solid object means it can never arrive, so it presses
        // into the side of it until the stuck-detector drags it outdoors.
        const beside = approachSpot(b, f.x, f.z)
        places.push({ id: `bed-${b.id}`, kind: 'bed', x: beside.x, z: beside.z, building: b.id })
        solids.push(box(f.x, f.z, 0.55, 0.95, -b.rot, 0.55, 'bed'))
      } else if (f.kind === 'hearth') {
        const beside = approachSpot(b, f.x, f.z)
        places.push({ id: `fire-${b.id}`, kind: 'fire', x: beside.x, z: beside.z, building: b.id })
        solids.push(circle(f.x, f.z, 0.5, 0.7, 'hearth'))
      } else {
        solids.push(box(f.x, f.z, 1.5, 0.55, -b.rot, 0.8, 'table'))
      }
    }
    // a shelter waypoint just inside the door, so "go inside" has a target
    const inn = doorInside(b)
    places.push({ id: `shelter-${b.id}`, kind: 'shelter', x: inn.x, z: inn.z, building: b.id })
  }

  // --- the middle of the green -------------------------------------------
  // the well: water, and the thing everybody walks around
  places.push({ id: 'well', kind: 'water', x: 0, z: 0 })
  solids.push(circle(0, 0, 0.95, 1.1, 'well'))
  dressing.push({ kind: 'well', x: 0, z: 0, rot: 0, scale: 1 })

  // the fire pit: warmth, and somewhere to gather in the evening
  places.push({ id: 'firepit', kind: 'fire', x: 5.5, z: -4.5 })
  solids.push(circle(5.5, -4.5, 0.8, 0.5, 'firepit'))
  dressing.push({ kind: 'firepit', x: 5.5, z: -4.5, rot: 0, scale: 1 })

  // log benches round the fire, which are also where you sit
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4
    const x = 5.5 + Math.sin(a) * 2.6
    const z = -4.5 + Math.cos(a) * 2.6
    dressing.push({ kind: 'bench', x, z, rot: -a, scale: 1 })
    solids.push(box(x, z, 0.9, 0.22, -a, 0.45, 'bench'))
  }

  // everything placed loose on the green goes through the guard, so a door
  // can never end up blocked by the scenery
  const taken: Array<{ x: number; z: number; r: number }> = [
    { x: 0, z: 0, r: 1.6 },
    { x: 5.5, z: -4.5, r: 3.6 },
  ]
  const put = (
    x: number, z: number, r: number,
    onPlaced: (px: number, pz: number) => void,
  ): void => {
    const spot = findSpot(buildings, taken, x, z, r)
    if (!spot) return
    taken.push({ x: spot.x, z: spot.z, r })
    onPlaced(spot.x, spot.z)
  }

  // --- things to eat -------------------------------------------------------
  // berry bushes at the edge of the green, deliberately few and deliberately
  // obvious, because feeding a Luma by hand is how you teach it anything
  const berrySpots: Array<[number, number]> = [
    [-9, 11], [11, 9], [-13, -8], [9, -12], [15, 2], [-3, 15],
  ]
  berrySpots.forEach(([x, z], i) => {
    put(x, z, 0.5, (px, pz) => {
      places.push({ id: `berries-${i}`, kind: 'food', x: px, z: pz, amount: 1 })
      dressing.push({ kind: 'berrybush', x: px, z: pz, rot: i * 1.1, scale: 1 })
      solids.push(circle(px, pz, 0.5, 0.9, 'bush'))
    })
  })

  // --- something to play with ---------------------------------------------
  put(-4.5, 4.5, 0.4, (px, pz) => {
    places.push({ id: 'toy-ball', kind: 'toy', x: px, z: pz })
    dressing.push({ kind: 'ball', x: px, z: pz, rot: 0, scale: 1 })
  })

  // --- dressing that is also solid ----------------------------------------
  for (const [x, z, rot] of [[-16, 4, 0.4], [13, -6, 1.2], [-8, -15, 2.1]] as const) {
    put(x, z, 1.1, (px, pz) => {
      dressing.push({ kind: 'woodpile', x: px, z: pz, rot, scale: 1 })
      solids.push(box(px, pz, 0.9, 0.5, rot, 0.8, 'woodpile'))
    })
  }
  for (const [x, z] of [[-19, 1], [16, 5], [3, -17], [-6, -13]] as const) {
    put(x, z, 0.4, (px, pz) => {
      dressing.push({ kind: 'barrel', x: px, z: pz, rot: px * 0.7, scale: 1 })
      solids.push(circle(px, pz, 0.36, 0.95, 'barrel'))
    })
  }
  for (const [x, z, rot] of [[-12, 8, 0.9], [10, 13, -0.6]] as const) {
    put(x, z, 1.3, (px, pz) => {
      dressing.push({ kind: 'rack', x: px, z: pz, rot, scale: 1 })
      solids.push(box(px, pz, 1.2, 0.14, rot, 1.7, 'rack'))
    })
  }

  return { buildings, places, solids, dressing }
}

/** The building a point is inside, if any. */
export function buildingAt(model: VillageModel, x: number, z: number): Building | null {
  for (const b of model.buildings) {
    if (isInside(b, x, z, 0.2)) return b
  }
  return null
}
