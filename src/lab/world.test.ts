import { describe, expect, it } from 'vitest'
import { TOWERS, findTower, TOWER_IDS, WORLD_SIZE, type TowerId } from './world'

describe('world — simple labeled towers', () => {
  it('has the eight labeled service towers', () => {
    expect(TOWER_IDS).toEqual(['food', 'bank', 'pharmacy', 'homes', 'tools', 'tavern', 'gang', 'play'])
    expect(TOWERS.length).toBe(8)
  })

  it('every tower has a label, icon, color, position and interaction radius', () => {
    for (const t of TOWERS) {
      expect(t.label.length).toBeGreaterThan(0)
      expect(t.icon.length).toBeGreaterThan(0)
      expect(t.color.startsWith('#')).toBe(true)
      expect(typeof t.x).toBe('number')
      expect(typeof t.z).toBe('number')
      expect(t.radius).toBeGreaterThan(1)
    }
  })

  it('towers sit inside the world bounds', () => {
    const half = WORLD_SIZE / 2
    for (const t of TOWERS) {
      expect(Math.abs(t.x)).toBeLessThan(half)
      expect(Math.abs(t.z)).toBeLessThan(half)
    }
  })

  it('findTower returns the right tower by id', () => {
    expect(findTower('bank')?.label).toBe('bank')
    expect(findTower('food')?.icon).toBe('🍞')
    expect(findTower('unknown-id' as TowerId)).toBeUndefined()
  })

  it('towers are distinct spots (not stacked)', () => {
    for (let i = 0; i < TOWERS.length; i++) {
      for (let j = i + 1; j < TOWERS.length; j++) {
        const a = TOWERS[i]
        const b = TOWERS[j]
        const dist = Math.hypot(a.x - b.x, a.z - b.z)
        expect(dist).toBeGreaterThan(8)
      }
    }
  })
})
