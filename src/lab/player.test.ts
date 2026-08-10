import { describe, expect, it } from 'vitest'
import { createPlayer, movePlayer, hurtPlayer, healPlayer, equipItem, playerCanFight, isPlayerAlive } from './player'

describe('player — a distinct character, not a creature', () => {
  it('creates a player with health, position, inventory, and equipment', () => {
    const p = createPlayer(0, 0)
    expect(p.health).toBe(1)
    expect(p.inventory.items).toEqual({})
    expect(p.weapon).toBeNull()
    expect(p.alive).toBe(true)
  })

  it('player moves freely inside the world', () => {
    const p = createPlayer(0, 0)
    movePlayer(p, 5, -3)
    expect(p.pos.x).toBeCloseTo(5)
    expect(p.pos.z).toBeCloseTo(-3)
  })

  it('player can be hurt and healed', () => {
    const p = createPlayer(0, 0)
    hurtPlayer(p, 0.4)
    expect(p.health).toBeCloseTo(0.6)
    healPlayer(p, 0.5)
    expect(p.health).toBeCloseTo(1)
  })

  it('player can equip items', () => {
    const p = createPlayer(0, 0)
    p.inventory.items.stick = 1
    expect(equipItem(p, 'stick')).toBe(true)
    expect(p.weapon).toBe('stick')
    expect(p.inventory.items.stick ?? 0).toBe(0) // consumed on equip
  })

  it('cannot equip what you do not own', () => {
    const p = createPlayer(0, 0)
    expect(equipItem(p, 'stick')).toBe(false)
    expect(p.weapon).toBeNull()
  })

  it('player can fight (has combat power)', () => {
    const p = createPlayer(0, 0)
    expect(playerCanFight(p)).toBe(true)
  })

  it('a player with zero health is not alive', () => {
    const p = createPlayer(0, 0)
    hurtPlayer(p, 1)
    expect(isPlayerAlive(p)).toBe(false)
  })
})
