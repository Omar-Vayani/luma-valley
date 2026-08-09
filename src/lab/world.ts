/**
 * world — the simple square world: a flat ground with labeled towers.
 * No buildings, no interiors. A tower is a square you walk to and use.
 * Organized 3x3 grid around an open plaza so towers are easy to find.
 */
export const WORLD_SIZE = 96
export const WORLD_HALF = WORLD_SIZE / 2

export type TowerId = 'food' | 'bank' | 'pharmacy' | 'homes' | 'tools' | 'tavern' | 'gang' | 'play' | 'work'

export interface Tower {
  id: TowerId
  label: string
  icon: string
  color: string
  x: number
  z: number
  radius: number // interaction radius
}

export const TOWER_IDS: TowerId[] = ['food', 'bank', 'pharmacy', 'homes', 'tools', 'tavern', 'gang', 'play', 'work']

/**
 * Pure data registry shared by sim, renderer, and QA.
 * Grid: ring of towers around a center plaza (0,0 stays open).
 *   food        bank       pharmacy
 *   homes       [plaza]    tools
 *   tavern      gang       play
 *   work        (south)    work
 */
export const TOWERS: Tower[] = [
  { id: 'food', label: 'food', icon: '🍞', color: '#c98a3d', x: -28, z: -28, radius: 5 },
  { id: 'bank', label: 'bank', icon: '🏦', color: '#3d7ac9', x: 0, z: -32, radius: 5 },
  { id: 'pharmacy', label: 'pharmacy', icon: '💊', color: '#4fae8a', x: 28, z: -28, radius: 5 },
  { id: 'homes', label: 'homes', icon: '🏠', color: '#9a7bc9', x: -32, z: 0, radius: 6 },
  { id: 'tools', label: 'tools', icon: '🪓', color: '#c96f3d', x: 32, z: 0, radius: 5 },
  { id: 'tavern', label: 'tavern', icon: '🍺', color: '#c93d6a', x: -28, z: 28, radius: 5 },
  { id: 'gang', label: 'gang', icon: '⚔️', color: '#5a5a68', x: 0, z: 32, radius: 5 },
  { id: 'play', label: 'play', icon: '🎪', color: '#d9a13d', x: 28, z: 28, radius: 5 },
  { id: 'work', label: 'work', icon: '⚒️', color: '#b5794a', x: 0, z: 44, radius: 5 },
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
