import { describe, expect, it } from 'vitest'
import { createSim } from './sim'
import { WORLD_HALF } from './world'
import { randomGenome, type Genome } from './genetics'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('sim — world drops (bread and money actually work)', () => {
  it('dropFood places a food pile the renderer can see', () => {
    const s = createSim(1)
    s.dropFood(3, 4)
    expect(s.drops.length).toBe(1)
    expect(s.drops[0].kind).toBe('food')
    expect(s.drops[0].x).toBe(3)
    expect(s.drops[0].z).toBe(4)
  })

  it('a hungry creature walks to and eats a food pile', () => {
    const s = createSim(2)
    const c = s.spawnCreature(GEN(), -6, -6)
    c.chem.hunger = 0.1
    c.wallet = 0 // broke — the free drop is the only way to eat
    s.dropFood(4, 0)
    for (let i = 0; i < 300; i++) s.tick()
    // ate: hunger rose well above what decay would allow from 0.1
    expect(c.chem.hunger).toBeGreaterThan(0.2)
    expect(s.drops.filter((d) => d.kind === 'food').length).toBe(0) // eaten
  })

  it('a creature picks up a money pile', () => {
    const s = createSim(3)
    const c = s.spawnCreature(GEN({ greed: 0.95 }), -6, -6)
    c.wallet = 3 // modest — a hoarder wants the free pile
    s.dropMoney(6, 6, 5)
    for (let i = 0; i < 250; i++) s.tick()
    // the pile is gone (collected) and the creature is alive
    expect(s.drops.filter((d) => d.kind === 'money').length).toBe(0)
    expect(c.alive).toBe(true)
  })

  it('creatures never leave the world bounds, even while fleeing', () => {
    const s = createSim(10)
    const a = s.spawnCreature(GEN({ fearfulness: 0.9, courage: 0.1 }), 46, 46)
    const b = s.spawnCreature(GEN({ aggression: 0.95 }), 45, 45)
    a.memory.vendettas[b.id] = 1
    b.memory.vendettas[a.id] = 1
    for (let i = 0; i < 300; i++) s.tick()
    // the wall is the edge of the world, not an arbitrary inner circle:
    // travellers arrive near the boundary and must still be inside it
    const wall = WORLD_HALF - 1.5
    for (const c of s.creatures) {
      expect(Math.abs(c.pos.x)).toBeLessThanOrEqual(wall)
      expect(Math.abs(c.pos.z)).toBeLessThanOrEqual(wall)
    }
  })
})

describe('sim — malice and benevolence tools', () => {
  it('comfort lowers fear and raises pleasure', () => {
    const s = createSim(4)
    const c = s.spawnCreature(GEN(), 0, 0)
    c.chem.fear = 0.8
    s.comfort(c.id)
    expect(c.chem.fear).toBeLessThan(0.7)
    expect(c.chem.pleasure).toBeGreaterThan(0.5)
  })

  it('heal restores health', () => {
    const s = createSim(5)
    const c = s.spawnCreature(GEN(), 0, 0)
    c.chem.health = 0.3
    s.heal(c.id)
    expect(c.chem.health).toBeGreaterThan(0.5)
  })

  it('gift transfers money to a creature', () => {
    const s = createSim(6)
    const c = s.spawnCreature(GEN(), 0, 0)
    s.gift(c.id, 8)
    expect(c.wallet).toBeGreaterThanOrEqual(8)
  })

  it('scare spikes fear and leaves a fear memory', () => {
    const s = createSim(7)
    const c = s.spawnCreature(GEN(), 0, 0)
    s.scare(c.id)
    expect(c.chem.fear).toBeGreaterThan(0.6)
  })

  it('rob takes money from a creature and teaches the bank lesson', () => {
    const s = createSim(8)
    const c = s.spawnCreature(GEN(), 0, 0)
    c.wallet = 10
    s.rob(c.id)
    expect(c.wallet).toBeLessThan(10)
    expect(c.memory.facts.bankIsSafe).toBeGreaterThan(0)
  })

  it('hit deals damage and wounds visibly', () => {
    const s = createSim(9)
    const c = s.spawnCreature(GEN(), 0, 0)
    c.chem.health = 0.8
    s.hit(c.id)
    expect(c.chem.health).toBeLessThan(0.7)
  })
})
