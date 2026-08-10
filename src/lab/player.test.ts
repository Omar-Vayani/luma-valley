import { describe, expect, it } from 'vitest'
import { createPlayer, movePlayer, hurtPlayer, healPlayer, equipItem, playerCanFight, isPlayerAlive, eatPlayer } from './player'
import { addItem } from './inventory'
import { createSim } from './sim'
import { randomGenome, type Genome } from './genetics'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

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

describe('player — hunger and food', () => {
  it('starts with a full-ish hunger meter', () => {
    const p = createPlayer(0, 0)
    expect(p.hunger).toBeGreaterThan(0.5)
    expect(p.hunger).toBeLessThanOrEqual(1)
  })

  it('eating restores hunger and a little health', () => {
    const p = createPlayer(0, 0)
    p.hunger = 0.2
    hurtPlayer(p, 0.3)
    eatPlayer(p, 0.5)
    expect(p.hunger).toBeGreaterThan(0.6)
    expect(p.health).toBeGreaterThan(0.7)
  })

  it('hunger never exceeds 1', () => {
    const p = createPlayer(0, 0)
    eatPlayer(p, 0.9)
    expect(p.hunger).toBe(1)
  })
})

describe('sim — the player is a distinct character in the world', () => {
  it('createSim spawns a player who is NOT a creature', () => {
    const s = createSim(5)
    expect(s.player).toBeTruthy()
    expect(s.player.alive).toBe(true)
    expect(s.player.health).toBe(1)
    expect(s.creatures.find((c) => c.id === 0)).toBeUndefined()
  })

  it('playerUseItem eats bread from inventory and restores hunger', () => {
    const s = createSim(5)
    addItem(s.player.inventory, 'bread', 1)
    s.player.hunger = 0.2
    s.playerUseItem('bread')
    expect(s.player.inventory.items.bread ?? 0).toBe(0)
    expect(s.player.hunger).toBeGreaterThan(0.6)
  })

  it('playerUseItem consumes medicine to heal', () => {
    const s = createSim(5)
    addItem(s.player.inventory, 'medicine', 1)
    hurtPlayer(s.player, 0.6)
    s.playerUseItem('medicine')
    expect(s.player.inventory.items.medicine ?? 0).toBe(0)
    expect(s.player.health).toBeGreaterThan(0.7)
  })

  it('playerUseItem with a stick equips it as a weapon', () => {
    const s = createSim(5)
    addItem(s.player.inventory, 'stick', 1)
    s.playerUseItem('stick')
    expect(s.player.weapon).toBe('stick')
  })

  it('playerEquip equips a weapon from the inventory', () => {
    const s = createSim(5)
    addItem(s.player.inventory, 'stick', 1)
    expect(s.playerEquip('stick')).toBe(true)
    expect(s.player.weapon).toBe('stick')
  })

  it('playerFight hurts a nearby creature and the creature may retaliate', () => {
    const s = createSim(5)
    const c = s.spawnCreature(GEN({ aggression: 0.9 }), 1, 0)
    const before = c.chem.health
    s.player.pos = { x: 0, z: 0 }
    s.playerFight(c.id)
    expect(c.chem.health).toBeLessThan(before)
    // retaliation can hurt the player too
    expect(s.events.some((e) => e.type === 'fight')).toBe(true)
  })

  it('playerSocialize bonds with the nearest creature in range', () => {
    const s = createSim(5)
    const c = s.spawnCreature(GEN(), 1, 0)
    s.player.pos = { x: 0, z: 0 }
    s.playerSocialize()
    expect(c.bonds[0]).toBeGreaterThan(0) // the creature bonds with the player (id 0)
    expect(s.player.bondWith).toContain(c.id)
  })

  it('a starving player loses health, and eating stops it', () => {
    const s = createSim(5)
    s.player.hunger = 0.05
    for (let i = 0; i < 10; i++) s.tick()
    expect(s.player.health).toBeLessThan(1)
    addItem(s.player.inventory, 'bread', 1)
    s.playerUseItem('bread')
    expect(s.player.hunger).toBeGreaterThan(0.5)
  })

  it('the player picks up dropped food and money directly', () => {
    const s = createSim(5)
    s.dropFood(1, 0)
    s.dropMoney(1.1, 0, 5)
    s.player.pos = { x: 0, z: 0 }
    for (let i = 0; i < 3; i++) s.tick()
    expect(s.player.inventory.items.bread ?? 0).toBeGreaterThan(0)
    expect(s.player.wallet).toBeGreaterThanOrEqual(5)
  })
})
