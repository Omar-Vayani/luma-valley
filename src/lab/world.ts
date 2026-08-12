/**
 * world — the places that make up Haven.
 *
 * This is the settlement register: every location a Luma can decide to walk
 * to, with the interaction radius the sim uses. The surrounding valley (hills,
 * river, lake, ruins) lives in `src/world/terrain.ts`; nothing here knows
 * about height, because the simulation is happily two-dimensional.
 *
 * Haven is laid out like a real hamlet rather than a ring of kiosks: a plaza
 * at the crossroads, shops along Market Row, the hearths on their own lane to
 * the north-west, loud trades (smithy, workyard) downwind to the south-east,
 * and the fields, groves and resting ground out at the edges.
 */
export const WORLD_SIZE = 180
export const WORLD_HALF = WORLD_SIZE / 2

export type TowerId =
  | 'food' | 'bank' | 'pharmacy' | 'clinic' | 'homes' | 'tools'
  | 'tavern' | 'play' | 'work' | 'den' | 'school' | 'graveyard'
  | 'farm' | 'park'
  // individual houses in the hearths quarter — households live in these
  | 'house1' | 'house2' | 'house3' | 'house4'

/** Architectural archetype — the renderer builds a different shape for each. */
export type TowerKind =
  | 'market' | 'hall' | 'shop' | 'house' | 'yard' | 'field'
  | 'grove' | 'graveyard' | 'stone'

export interface Tower {
  id: TowerId
  label: string
  icon: string
  color: string
  x: number
  z: number
  radius: number // interaction radius
  /** What kind of building stands here. */
  kind: TowerKind
  /** Which way the front door faces, radians, 0 = +Z. */
  facing: number
}

export const TOWER_IDS: TowerId[] = [
  'food', 'bank', 'pharmacy', 'clinic', 'homes', 'tools',
  'tavern', 'play', 'work', 'den', 'school', 'graveyard', 'farm', 'park',
  'house1', 'house2', 'house3', 'house4',
]

/** The individual dwellings a household can claim. */
export const HOUSE_IDS: TowerId[] = ['house1', 'house2', 'house3', 'house4']

/**
 * Pure data registry shared by sim, renderer, and QA.
 * Coordinates are metres from the plaza well, which is the origin.
 */
export const TOWERS: Tower[] = [
  // --- the plaza and Market Row -------------------------------------------
  { id: 'food', label: 'Market Row', icon: '🍞', color: '#c98a3d', x: -26, z: -18, radius: 6, kind: 'market', facing: 2.2 },
  { id: 'bank', label: 'Coinhouse', icon: '🪙', color: '#4f7fc9', x: 2, z: -36, radius: 6, kind: 'hall', facing: 0 },
  { id: 'pharmacy', label: 'Apothecary', icon: '⚗️', color: '#4fae8a', x: 26, z: -26, radius: 5, kind: 'shop', facing: 3.6 },
  { id: 'tools', label: 'Smithy', icon: '🔨', color: '#c96f3d', x: 34, z: 4, radius: 5, kind: 'shop', facing: 4.7 },
  { id: 'tavern', label: 'The Lantern', icon: '🍺', color: '#c93d6a', x: -26, z: 24, radius: 6, kind: 'hall', facing: 1.0 },
  { id: 'play', label: 'The Green', icon: '🎪', color: '#d9a13d', x: 26, z: 26, radius: 6, kind: 'yard', facing: 4.0 },

  // --- the hearths, north-west on their own lane ---------------------------
  { id: 'homes', label: 'Commons Hall', icon: '🏛️', color: '#9a7bc9', x: -58, z: -32, radius: 7, kind: 'hall', facing: 1.9 },
  { id: 'house1', label: 'Willow Cottage', icon: '🏡', color: '#8f7bb5', x: -46, z: -48, radius: 4, kind: 'house', facing: 2.6 },
  { id: 'house2', label: 'Stonestep', icon: '🏡', color: '#a07bb5', x: -72, z: -44, radius: 4, kind: 'house', facing: 1.2 },
  { id: 'house3', label: 'Redgate', icon: '🏡', color: '#8f8bc9', x: -74, z: -12, radius: 4, kind: 'house', facing: 1.6 },
  { id: 'house4', label: 'Millrow', icon: '🏡', color: '#9a8bd4', x: -44, z: -14, radius: 4, kind: 'house', facing: 3.4 },

  // --- learning, care, and the loud trades ---------------------------------
  { id: 'school', label: 'Schoolhouse', icon: '📚', color: '#c96f9a', x: -46, z: 36, radius: 6, kind: 'hall', facing: 0.6 },
  { id: 'clinic', label: 'Infirmary', icon: '✚', color: '#e8f0f2', x: 46, z: -42, radius: 6, kind: 'hall', facing: 3.9 },
  { id: 'work', label: 'Workyard', icon: '⚒️', color: '#b5794a', x: 46, z: 64, radius: 6, kind: 'yard', facing: 3.6 },

  // --- the edges: fields, groves, and the resting ground -------------------
  { id: 'farm', label: 'Fieldworks', icon: '🌾', color: '#8fae4f', x: -80, z: 16, radius: 7, kind: 'field', facing: 1.5 },
  { id: 'den', label: 'The Hollow', icon: '🌿', color: '#7a9a5a', x: 64, z: -34, radius: 5, kind: 'grove', facing: 2.9 },
  { id: 'park', label: 'The Old Grove', icon: '🌳', color: '#4fae8a', x: 74, z: -48, radius: 7, kind: 'grove', facing: 3.1 },
  { id: 'graveyard', label: 'Rest Grove', icon: '🪦', color: '#8a8a96', x: 64, z: 80, radius: 7, kind: 'graveyard', facing: 3.9 },
]

export function findTower(id: TowerId): Tower | undefined {
  return TOWERS.find((t) => t.id === id)
}

export function nearestTower(x: number, z: number): Tower {
  let best = TOWERS[0]
  let bestDist = Infinity
  for (const t of TOWERS) {
    const d = Math.hypot(t.x - x, t.z - z)
    if (d < bestDist) {
      bestDist = d
      best = t
    }
  }
  return best
}

export function towerAt(x: number, z: number): Tower | undefined {
  return TOWERS.find((t) => Math.hypot(t.x - x, t.z - z) <= t.radius)
}

/**
 * A point just outside a building's footprint, on the side its door faces.
 * Walkers head here rather than to the centre of the wall.
 */
export function doorwayOf(t: Tower): { x: number; z: number } {
  return {
    x: t.x + Math.sin(t.facing) * (t.radius + 0.4),
    z: t.z + Math.cos(t.facing) * (t.radius + 0.4),
  }
}
