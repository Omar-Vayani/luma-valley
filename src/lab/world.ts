/**
 * world — the simple square world: a flat ground with labeled towers.
 * No buildings, no interiors. A tower is a square you walk to and use.
 * Organized 3x3 grid around an open plaza so towers are easy to find.
 */
export const WORLD_SIZE = 96
export const WORLD_HALF = WORLD_SIZE / 2

export type TowerId = 'food' | 'bank' | 'pharmacy' | 'homes' | 'tools' | 'tavern' | 'gang' | 'play' | 'work' | 'den' | 'school' | 'graveyard'

export interface Tower {
  id: TowerId
  label: string
  icon: string
  color: string
  x: number
  z: number
  radius: number // interaction radius
}

export const TOWER_IDS: TowerId[] = ['food', 'bank', 'pharmacy', 'homes', 'tools', 'tavern', 'play', 'work', 'den', 'school', 'graveyard']

/**
 * Pure data registry shared by sim, renderer, and QA.
 * Grid: ring of towers around a center plaza (0,0 stays open).
 *   food        bank       pharmacy
 *   homes       [plaza]    tools
 *   tavern      play       den
 *   school      work       graveyard
 */
export const TOWERS: Tower[] = [
  { id: 'food', label: 'food', icon: '🍞', color: '#c98a3d', x: -32, z: -32, radius: 5 },
  { id: 'bank', label: 'bank', icon: '🏦', color: '#3d7ac9', x: 0, z: -32, radius: 5 },
  { id: 'pharmacy', label: 'pharmacy', icon: '💊', color: '#4fae8a', x: 32, z: -32, radius: 5 },
  { id: 'homes', label: 'homes', icon: '🏠', color: '#9a7bc9', x: -32, z: 0, radius: 6 },
  { id: 'tools', label: 'tools', icon: '🪓', color: '#c96f3d', x: 32, z: 0, radius: 5 },
  { id: 'tavern', label: 'tavern', icon: '🍺', color: '#c93d6a', x: -32, z: 32, radius: 5 },
  { id: 'play', label: 'gym', icon: '🏋️', color: '#d9a13d', x: 0, z: 32, radius: 5 },
  { id: 'work', label: 'work', icon: '⚒️', color: '#b5794a', x: 0, z: 44, radius: 5 },
  { id: 'den', label: 'den', icon: '🌿', color: '#7a9a5a', x: 32, z: 32, radius: 5 },
  { id: 'school', label: 'school', icon: '🎓', color: '#c96f9a', x: -32, z: 44, radius: 5 },
  { id: 'graveyard', label: 'graveyard', icon: '🪦', color: '#8a8a96', x: 32, z: 44, radius: 6 },
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
