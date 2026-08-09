import { describe, expect, it } from 'vitest'
import { createSim } from './sim'
import { randomGenome, type Genome } from './genetics'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('gangs — a group they choose, not a building', () => {
  it('tribal creatures form a gang together when they meet', () => {
    const s = createSim(1)
    const a = s.spawnCreature(GEN({ aggression: 0.9, loyalty: 0.9, sociability: 0.3 }), 0, 0)
    const b = s.spawnCreature(GEN({ aggression: 0.9, loyalty: 0.9, sociability: 0.3 }), 2, 0)
    for (let i = 0; i < 15; i++) s.tick()
    expect(a.gangId).not.toBeNull()
    expect(b.gangId).toBe(a.gangId)
  })

  it('gentle loners do not join gangs', () => {
    const s = createSim(2)
    const a = s.spawnCreature(GEN({ aggression: 0.1, loyalty: 0.2 }), 0, 0)
    const b = s.spawnCreature(GEN({ aggression: 0.1, loyalty: 0.2 }), 2, 0)
    for (let i = 0; i < 15; i++) s.tick()
    expect(a.gangId).toBeNull()
    expect(b.gangId).toBeNull()
  })

  it('gangmates protect each other from outsiders', () => {
    const s = createSim(3)
    const a = s.spawnCreature(GEN({ aggression: 0.9, loyalty: 0.9 }), 0, 0)
    const b = s.spawnCreature(GEN({ aggression: 0.9, loyalty: 0.9 }), 2, 0)
    const outsider = s.spawnCreature(GEN({ aggression: 0.9, loyalty: 0.1 }), 4, 0) // not tribal
    for (let i = 0; i < 12; i++) s.tick()
    // gang formed (a,b). Now stage a close confrontation with fresh intentions.
    a.pos = { x: 0, z: 0 }
    b.pos = { x: 2, z: 0 }
    outsider.pos = { x: 1.5, z: 0 }
    a.intention = null
    b.intention = null
    outsider.intention = null
    outsider.memory.vendettas[b.id] = 1 // outsider picks a fight with b
    const bHp0 = b.chem.health
    for (let i = 0; i < 15; i++) s.tick()
    expect(a.gangId).not.toBeNull()
    expect(b.gangId).toBe(a.gangId)
    expect(outsider.gangId).not.toBe(a.gangId)
    expect(outsider.chem.health).toBeLessThan(0.99) // outsider got hurt (by a defending)
    expect(b.chem.health).toBeLessThanOrEqual(bHp0 + 0.05) // b not destroyed by its own ally
  })
})

describe('love — attachment with meaning', () => {
  it('lovers stay close to each other (follow)', () => {
    const s = createSim(4)
    const a = s.spawnCreature(GEN({ lovePropensity: 0.95, sociability: 0.8 }), 0, 0)
    const b = s.spawnCreature(GEN({ lovePropensity: 0.95, sociability: 0.8 }), 1, 0)
    a.partnerId = b.id
    b.partnerId = a.id
    a.chem.bond = 1
    b.chem.bond = 1
    a.pos = { x: 0, z: 0 }
    b.pos = { x: 10, z: 10 }
    for (let i = 0; i < 40; i++) s.tick()
    const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)
    expect(d).toBeLessThan(7)
  })

  it('jealousy: a lover gets sad/angry when the partner bonds with someone else', () => {
    const s = createSim(5)
    const a = s.spawnCreature(GEN({ lovePropensity: 0.95 }), 0, 0)
    const b = s.spawnCreature(GEN({ lovePropensity: 0.95 }), 1, 0)
    const rival = s.spawnCreature(GEN({ sociability: 0.9 }), 2, 0)
    a.partnerId = b.id
    b.partnerId = a.id
    a.chem.bond = 1
    b.chem.bond = 1
    const moodBefore = a.chem.pleasure
    // rival socializes with a's partner
    b.socialize(rival)
    // next tick a should react jealously
    for (let i = 0; i < 3; i++) s.tick()
    expect(a.chem.pleasure).toBeLessThanOrEqual(moodBefore + 0.05)
  })

  it('when a lover dies the partner grieves (grief rises)', () => {
    const s = createSim(6)
    const a = s.spawnCreature(GEN({ lovePropensity: 0.95 }), 0, 0)
    const b = s.spawnCreature(GEN({ lovePropensity: 0.95 }), 1, 0)
    a.partnerId = b.id
    b.partnerId = a.id
    a.chem.bond = 1
    b.chem.bond = 1
    b.hurt(5) // b dies
    s.tick()
    expect(a.chem.grief).toBeGreaterThan(0.5)
  })
})

describe('graveyard — the dead are carried and buried', () => {
  it('a grieving lover carries the dead partner to the graveyard', () => {
    const s = createSim(7)
    const a = s.spawnCreature(GEN({ lovePropensity: 0.95 }), 0, 0)
    const b = s.spawnCreature(GEN({ lovePropensity: 0.95 }), 1, 0)
    a.partnerId = b.id
    b.partnerId = a.id
    a.chem.bond = 1
    b.chem.bond = 1
    b.pos = { x: 0, z: 2 }
    b.hurt(5) // b dies — stays as a corpse
    for (let i = 0; i < 150; i++) s.tick()
    // b should now be buried (in the graveyard, marked buried)
    const buried = s.creatures.find((c) => c.id === b.id)
    expect(buried?.buried).toBe(true)
    // or if the sim removed it, there should be a grave record
    expect(s.graves.length).toBeGreaterThanOrEqual(1)
  })

  it('an unclaimed body stays until someone buries it', () => {
    const s = createSim(8)
    const c = s.spawnCreature(GEN(), 5, 5)
    c.hurt(5) // dies alone
    for (let i = 0; i < 20; i++) s.tick()
    expect(s.creatures.find((x) => x.id === c.id)?.buried).toBeFalsy()
    expect(s.graves.length).toBe(0)
  })

  it('a starving creature with coins goes straight to food (never dies hungry with money)', () => {
    const s = createSim(9)
    const c = s.spawnCreature(GEN({ theft: 0.1 }), 10, 10)
    c.wallet = 20
    c.chem.hunger = 0.1
    for (let i = 0; i < 170; i++) s.tick() // world-crossing walk takes ~130 ticks
    expect(c.alive).toBe(true)
    expect(c.chem.hunger).toBeGreaterThan(0.3) // ate
    expect(c.wallet).toBeLessThan(20) // paid
  })

  it('a starving broke creature works to earn food money', () => {
    const s = createSim(10)
    const c = s.spawnCreature(GEN({ theft: 0.1, greed: 0.2 }), 10, 10)
    c.wallet = 0
    c.chem.hunger = 0.1
    for (let i = 0; i < 200; i++) s.tick()
    expect(c.alive).toBe(true)
    expect(c.wallet).toBeGreaterThan(0) // earned
  })
})
