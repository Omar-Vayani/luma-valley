/**
 * world — the simple square world: a flat ground with labeled towers.
 * No buildings, no interiors. A tower is a square you walk to and use.
 * Organized grid around an open plaza so towers are easy to find.
 * Expanded to 120 units with 13 towers (added farm + park).
 */
export const WORLD_SIZE = 120
export const WORLD_HALF = WORLD_SIZE / 2

export type TowerId =
  | 'food' | 'bank' | 'pharmacy' | 'homes' | 'tools'
  | 'tavern' | 'play' | 'work' | 'den' | 'school' | 'graveyard'
  | 'farm' | 'park'

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
  'food', 'bank', 'pharmacy', 'homes', 'tools',
  'tavern', 'play', 'work', 'den', 'school', 'graveyard', 'farm', 'park',
]

/**
 * Pure data registry shared by sim, renderer, and QA.
 * 13 towers in a 3-ring layout around the center plaza (0,0 stays open).
 *   Ring 1 (north):     food        bank       pharmacy
 *   Ring 1 (mid):       homes       [plaza]    tools
 *   Ring 2 (south):     tavern      gym        den
 *   Ring 3 (outer):     farm  school  work  graveyard  park
 */
export const TOWERS: Tower[] = [
  // ring 1 — everyday needs
  { id: 'food', label: 'food', icon: '🍞', color: '#c98a3d', x: -38, z: -38, radius: 5 },
  { id: 'bank', label: 'bank', icon: '🏦', color: '#3d7ac9', x: 0, z: -44, radius: 5 },
  { id: 'pharmacy', label: 'pharmacy', icon: '💊', color: '#4fae8a', x: 38, z: -38, radius: 5 },
  { id: 'homes', label: 'homes', icon: '🏠', color: '#9a7bc9', x: -44, z: 0, radius: 6 },
  { id: 'tools', label: 'tools', icon: '🪓', color: '#c96f3d', x: 44, z: 0, radius: 5 },
  // ring 2 — social & labor
  { id: 'tavern', label: 'tavern', icon: '🍺', color: '#c93d6a', x: -38, z: 38, radius: 5 },
  { id: 'play', label: 'gym', icon: '🏋️', color: '#d9a13d', x: 0, z: 44, radius: 5 },
  { id: 'den', label: 'den', icon: '🌿', color: '#7a9a5a', x: 38, z: 38, radius: 5 },
  // ring 3 — outer ring (spread out so no overlaps)
  { id: 'work', label: 'work', icon: '⚒️', color: '#b5794a', x: 0, z: 58, radius: 5 },
  { id: 'school', label: 'school', icon: '🎓', color: '#c96f9a', x: -58, z: 22, radius: 5 },
  { id: 'graveyard', label: 'graveyard', icon: '🪦', color: '#8a8a96', x: 58, z: 22, radius: 6 },
  { id: 'farm', label: 'farm', icon: '🌾', color: '#8fae4f', x: -58, z: -22, radius: 5 },
  { id: 'park', label: 'park', icon: '🌳', color: '#4fae8a', x: 58, z: -22, radius: 5 },
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
