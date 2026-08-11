/**
 * world — the simple square world: a flat ground with labeled towers.
 * Big and open: 180 units with all buildings inset well inside the
 * boundaries (no edge/corner placements) in two clean rings around
 * the center plaza, so it never feels like a prison.
 */
export const WORLD_SIZE = 180
export const WORLD_HALF = WORLD_SIZE / 2

export type TowerId =
  | 'food' | 'bank' | 'pharmacy' | 'clinic' | 'homes' | 'tools'
  | 'tavern' | 'play' | 'work' | 'den' | 'school' | 'graveyard'
  | 'farm' | 'park'
  // individual houses in the homes quarter — households live in these
  | 'house1' | 'house2' | 'house3' | 'house4'

export interface Tower {
  id: TowerId
  label: string
  icon: string
  color: string
  x: number
  z: number
  radius: number // interaction radius
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
 * Compact Haven settlement: shops, clinic, homes, tavern, work, commons.
 * Inner ring (~28-36 out): everyday needs + social/labor.
 * Outer ring (~52 out): farm, school, work, graveyard, park, clinic.
 */
export const TOWERS: Tower[] = [
  // inner ring — everyday needs (north)
  { id: 'food', label: 'market', icon: '🍞', color: '#c98a3d', x: -28, z: -28, radius: 5 },
  { id: 'bank', label: 'bank', icon: '🏦', color: '#3d7ac9', x: 0, z: -36, radius: 5 },
  { id: 'pharmacy', label: 'pharmacy', icon: '💊', color: '#4fae8a', x: 28, z: -28, radius: 5 },
  // inner ring — mid (east/west)
  { id: 'homes', label: 'homes', icon: '🏠', color: '#9a7bc9', x: -36, z: 0, radius: 6 },
  { id: 'tools', label: 'tools', icon: '🪓', color: '#c96f3d', x: 36, z: 0, radius: 5 },
  // inner ring — social & labor (south)
  { id: 'tavern', label: 'tavern', icon: '🍺', color: '#c93d6a', x: -28, z: 28, radius: 5 },
  { id: 'play', label: 'gym', icon: '🏋️', color: '#d9a13d', x: 0, z: 36, radius: 5 },
  { id: 'den', label: 'den', icon: '🌿', color: '#7a9a5a', x: 28, z: 28, radius: 5 },
  // outer ring — evenly spread, inset from the boundaries
  { id: 'work', label: 'work', icon: '⚒️', color: '#b5794a', x: 0, z: 52, radius: 5 },
  { id: 'school', label: 'school', icon: '🎓', color: '#c96f9a', x: -36, z: 52, radius: 5 },
  { id: 'graveyard', label: 'graveyard', icon: '🪦', color: '#8a8a96', x: 36, z: 52, radius: 6 },
  { id: 'farm', label: 'farm', icon: '🌾', color: '#8fae4f', x: -52, z: 0, radius: 5 },
  { id: 'park', label: 'park', icon: '🌳', color: '#4fae8a', x: 52, z: 0, radius: 5 },
  // clinic — treatment beyond pharmacy self-serve medicine
  { id: 'clinic', label: 'clinic', icon: '✚', color: '#e8f0f2', x: 52, z: -36, radius: 5 },
  // the homes quarter: separate dwellings clustered around the commons hall,
  // close enough to be a neighbourhood, far enough to be someone's own place
  { id: 'house1', label: 'house', icon: '🏡', color: '#8f7bb5', x: -50, z: -16, radius: 4 },
  { id: 'house2', label: 'house', icon: '🏡', color: '#a07bb5', x: -52, z: 14, radius: 4 },
  { id: 'house3', label: 'house', icon: '🏡', color: '#8f8bc9', x: -30, z: -16, radius: 4 },
  { id: 'house4', label: 'house', icon: '🏡', color: '#9a8bd4', x: -30, z: 16, radius: 4 },
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
