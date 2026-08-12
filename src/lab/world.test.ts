import { describe, expect, it } from 'vitest'
import { TOWERS, findTower, doorwayOf, TOWER_IDS, WORLD_SIZE, WORLD_HALF, type TowerId } from './world'

describe('world — the places that make up Haven', () => {
  it('has the service buildings plus individual houses', () => {
    expect(TOWER_IDS).toEqual([
      'food', 'bank', 'pharmacy', 'clinic', 'homes', 'tools',
      'tavern', 'play', 'work', 'den', 'school', 'graveyard', 'farm', 'park',
      'house1', 'house2', 'house3', 'house4',
    ])
    expect(TOWERS.length).toBe(18)
    expect(findTower('clinic')?.label).toBe('Infirmary')
    expect(findTower('house1')?.icon).toBe('🏡')
  })

  it('every tower has a label, icon, colour, position, radius, shape and a facing', () => {
    for (const t of TOWERS) {
      expect(t.label.length).toBeGreaterThan(0)
      expect(t.icon.length).toBeGreaterThan(0)
      expect(t.color.startsWith('#')).toBe(true)
      expect(typeof t.x).toBe('number')
      expect(typeof t.z).toBe('number')
      expect(t.radius).toBeGreaterThan(1)
      expect(t.kind.length).toBeGreaterThan(0)
      expect(Number.isFinite(t.facing)).toBe(true)
    }
  })

  it('every building is somewhere a creature can actually walk to', () => {
    // the sim clamps walkers to WORLD_HALF - 1.5; a building outside that
    // would be a destination nobody could ever reach
    const reach = WORLD_HALF - 1.5
    for (const t of TOWERS) {
      expect(Math.abs(t.x)).toBeLessThanOrEqual(reach)
      expect(Math.abs(t.z)).toBeLessThanOrEqual(reach)
      const door = doorwayOf(t)
      expect(Math.hypot(door.x - t.x, door.z - t.z)).toBeGreaterThan(t.radius)
    }
  })

  it('buildings are inset from the edges, with room to walk around each one', () => {
    const half = WORLD_SIZE / 2
    for (const t of TOWERS) {
      expect(Math.abs(t.x) + t.radius).toBeLessThan(half - 2)
      expect(Math.abs(t.z) + t.radius).toBeLessThan(half - 2)
    }
  })

  it('findTower returns the right tower by id', () => {
    expect(findTower('bank')?.label).toBe('Coinhouse')
    expect(findTower('food')?.icon).toBe('🍞')
    expect(findTower('unknown-id' as TowerId)).toBeUndefined()
  })

  it('no two footprints overlap — every building has its own ground', () => {
    for (let i = 0; i < TOWERS.length; i++) {
      for (let j = i + 1; j < TOWERS.length; j++) {
        const a = TOWERS[i]
        const b = TOWERS[j]
        const dist = Math.hypot(a.x - b.x, a.z - b.z)
        expect(dist).toBeGreaterThan(a.radius + b.radius + 2)
      }
    }
  })

  it('leaves the plaza itself open', () => {
    for (const t of TOWERS) {
      expect(Math.hypot(t.x, t.z)).toBeGreaterThan(t.radius + 10)
    }
  })
})
