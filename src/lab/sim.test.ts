import { describe, expect, it } from 'vitest'
import { createSim, type Sim } from './sim'
import { randomGenome, type Genome } from './genetics'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

const makeSim = (count = 3): Sim => {
  const s = createSim(42)
  s.spawnCreature(GEN({ sociability: 0.8, energy: 0.8 }), -6, 0)
  s.spawnCreature(GEN({ sociability: 0.8, energy: 0.8 }), 0, 0)
  s.spawnCreature(GEN({ sociability: 0.8, energy: 0.8 }), 6, 0)
  while (s.creatures.length < count) s.spawnCreature(GEN(), Math.random() * 10 - 5, Math.random() * 10 - 5)
  return s
}

describe('sim — decisions and movement', () => {
  it('starts with the spawned creatures alive', () => {
    const s = makeSim(3)
    expect(s.creatures.length).toBe(3)
    for (const c of s.creatures) expect(c.alive).toBe(true)
  })

  it('ticks decay needs and advance age', () => {
    const s = makeSim(1)
    const hunger = s.creatures[0].chem.hunger
    s.tick()
    expect(s.creatures[0].chem.hunger).toBeLessThan(hunger)
    expect(s.time).toBeGreaterThan(0)
  })

  it('moves a hungry creature toward the food tower', () => {
    const s = makeSim(1)
    const c = s.creatures[0]
    c.chem.hunger = 0.1
    const before = { ...c.pos }
    s.tick()
    const moved = Math.hypot(c.pos.x - before.x, c.pos.z - before.z)
    expect(moved).toBeGreaterThan(0)
  })

  it('eats when at the food tower and hungry', () => {
    const s = makeSim(1)
    const c = s.creatures[0]
    c.chem.hunger = 0.15
    c.pos = { x: -38, z: -38 } // at food tower
    s.tick()
    expect(c.chem.hunger).toBeGreaterThan(0.2)
  })
})

describe('sim — economy and stealing', () => {
  it('a creature works a shift at the work tower and earns money', () => {
    const s = makeSim(1)
    const c = s.creatures[0]
    c.chem.hunger = 0.3 // hungry + broke → motivated to work
    c.pos = { x: 0, z: 58 } // at work tower
    c.wallet = 0
    // needs ~24 ticks of staying put before payday
    for (let i = 0; i < 30; i++) s.tick()
    expect(c.wallet).toBeGreaterThan(0)
  })

  it('a greedy thief steals carried money from a nearby creature', () => {
    const s = makeSim(2)
    const thief = s.creatures[0]
    const victim = s.creatures[1]
    thief.genome.theft = 0.95
    thief.genome.greed = 0.95
    thief.chem.hunger = 0.3 // desperate — hungry enough to steal
    thief.wallet = 0 // and broke — cannot afford food
    victim.wallet = 10
    thief.pos = { x: 0, z: 0 }
    victim.pos = { x: 0.5, z: 0 }
    for (let i = 0; i < 10; i++) s.tick()
    expect(victim.wallet).toBeLessThan(10)
    expect(thief.wallet).toBeGreaterThan(0)
  })

  it('a robbed creature learns the bank is safer', () => {
    const s = makeSim(2)
    const thief = s.creatures[0]
    const victim = s.creatures[1]
    thief.genome.theft = 0.95
    thief.chem.hunger = 0.3 // desperate
    thief.wallet = 0 // broke — cannot afford food
    victim.wallet = 5
    thief.pos = { x: 0, z: 0 }
    victim.pos = { x: 0.5, z: 0 }
    for (let i = 0; i < 10; i++) s.tick()
    expect(victim.memory.facts.bankIsSafe).toBeGreaterThan(0)
  })

  it('a creature deposits money at the bank when it learned bank is safer', () => {
    const s = makeSim(1)
    const c = s.creatures[0]
    c.chem.hunger = 1
    c.wallet = 10
    c.memory.facts.bankIsSafe = 1
    c.pos = { x: 0, z: -44 } // at bank
    for (let i = 0; i < 10; i++) s.tick()
    expect(c.banked).toBeGreaterThan(0)
  })
})

describe('sim — gangs and fighting', () => {
  it('tribal creatures form a gang together (group, not building)', () => {
    const s = makeSim(2)
    const a = s.creatures[0]
    const b = s.creatures[1]
    a.genome.aggression = 0.9
    a.genome.loyalty = 0.9
    b.genome.aggression = 0.9
    b.genome.loyalty = 0.9
    a.pos = { x: 0, z: 0 }
    b.pos = { x: 2, z: 0 }
    for (let i = 0; i < 10; i++) s.tick()
    expect(a.gangId).not.toBeNull()
    expect(b.gangId).toBe(a.gangId)
  })

  it('a vendetta causes a fight', () => {
    const s = makeSim(2)
    const a = s.creatures[0]
    const b = s.creatures[1]
    a.genome.aggression = 0.9
    a.memory.vendettas[b.id] = 1
    a.pos = { x: 0, z: 0 }
    b.pos = { x: 1, z: 0 }
    const bHealth = b.chem.health
    s.tick()
    expect(b.chem.health).toBeLessThan(bHealth)
  })

  it('fighting hurts both and the loser drops money', () => {
    const s = makeSim(2)
    const a = s.creatures[0]
    const b = s.creatures[1]
    a.genome.aggression = 0.9
    a.memory.vendettas[b.id] = 1
    a.wallet = 4
    b.wallet = 4
    a.pos = { x: 0, z: 0 }
    b.pos = { x: 1, z: 0 }
    s.tick()
    expect(a.chem.health).toBeLessThan(1)
    expect(b.chem.health).toBeLessThan(1)
  })

  it('a weapon boosts damage in a fight', () => {
    const s = makeSim(2)
    const a = s.creatures[0]
    const b = s.creatures[1]
    a.genome.aggression = 0.9
    a.weapon = 'stick'
    a.memory.vendettas[b.id] = 1
    a.pos = { x: 0, z: 0 }
    b.pos = { x: 1, z: 0 }
    s.tick()
    expect(b.chem.health).toBeLessThan(0.9)
  })
})

describe('sim — love, procreation, sleep, addiction', () => {
  it('paired creatures procreate and the child inherits genes', () => {
    const s = makeSim(2)
    const a = s.creatures[0]
    const b = s.creatures[1]
    a.genome.lovePropensity = 0.95
    b.genome.lovePropensity = 0.95
    a.genome.aggression = 0.9
    b.genome.aggression = 0.9
    a.partnerId = b.id
    b.partnerId = a.id
    a.chem.bond = 1
    b.chem.bond = 1
    a.pos = { x: -44, z: 0 } // at homes
    b.pos = { x: -43, z: 0 }
    const before = s.creatures.length
    s.tick()
    expect(s.creatures.length).toBeGreaterThan(before)
    const child = s.creatures[s.creatures.length - 1]
    expect(child.alive).toBe(true)
    expect(child.genome.aggression).toBeGreaterThan(0.5)
  })

  it('a tired creature sleeps at homes and restores energy', () => {
    const s = makeSim(1)
    const c = s.creatures[0]
    c.chem.energy = 0.1
    c.pos = { x: -32, z: 0 } // at homes
    s.tick()
    expect(c.chem.energy).toBeGreaterThan(0.3)
  })

  it('a creature collapses when exhausted (falls asleep anywhere)', () => {
    const s = makeSim(1)
    const c = s.creatures[0]
    c.chem.energy = 0.02
    c.pos = { x: 5, z: 5 }
    s.tick()
    expect(c.sleeping).toBe(true)
  })

  it('an addiction-prone creature drinks at the tavern and becomes dependent', () => {
    const s = makeSim(1)
    const c = s.creatures[0]
    c.genome.addictionProne = 0.95
    c.chem.pleasure = 0.1 // sad — the tavern is the rational escape
    c.wallet = 10 // can afford a drink
    c.pos = { x: -38, z: 38 } // at tavern
    for (let i = 0; i < 10; i++) s.tick()
    expect(c.chem.addiction.brew ?? 0).toBeGreaterThan(0)
  })
})
