/**
 * world — the simple square world: a flat ground with labeled towers.
 * No buildings, no interiors. A tower is a square you walk to and use.
 */
export const WORLD_SIZE = 60
export const WORLD_HALF = WORLD_SIZE / 2

export type TowerId = 'food' | 'bank' | 'pharmacy' | 'homes' | 'tools' | 'tavern' | 'gang'

export interface Tower {
  id: TowerId
  label: string
  icon: string
  color: string
  x: number
  z: number
  radius: number // interaction radius
}

export const TOWER_IDS: TowerId[] = ['food', 'bank', 'pharmacy', 'homes', 'tools', 'tavern', 'gang']

/** Pure data registry shared by sim, renderer, and QA. */
export const TOWERS: Tower[] = [
  { id: 'food', label: 'food', icon: '🍞', color: '#c98a3d', x: -18, z: -14, radius: 4 },
  { id: 'bank', label: 'bank', icon: '🏦', color: '#3d7ac9', x: 0, z: -20, radius: 4 },
  { id: 'pharmacy', label: 'pharmacy', icon: '💊', color: '#4fae8a', x: 18, z: -14, radius: 4 },
  { id: 'homes', label: 'homes', icon: '🏠', color: '#9a7bc9', x: -20, z: 14, radius: 5 },
  { id: 'tools', label: 'tools', icon: '🪓', color: '#c96f3d', x: 0, z: 18, radius: 4 },
  { id: 'tavern', label: 'tavern', icon: '🍺', color: '#c93d6a', x: 20, z: 12, radius: 4 },
  { id: 'gang', label: 'gang', icon: '⚔️', color: '#5a5a68', x: -4, z: 4, radius: 5 },
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
