import { describe, expect, it } from 'vitest'
import { createSim } from './sim'
import { randomGenome, type Genome } from './genetics'
import { AGE_LIMIT_BASE, procreationCost, agingDamage, isAgeProtected, canProcreate } from './lifecycle'
import { findTower, type TowerId } from './world'

/** A tower’s position, so moving a building never breaks a test. */
const at = (id: TowerId) => findTower(id)!

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('lifecycle — sleep suspension, population control, player bonds', () => {
  it('a sleeping creature has its brain suspended (0 inference work)', () => {
    const s = createSim(1)
    const c = s.spawnCreature(GEN(), 0, 0)
    c.sleeping = true
    c.chem.energy = 0.1 // deep sleep — won't wake on its own yet
    c.brainPrefs = [0.5, 0.5, 0.5]
    // tick while asleep: brain prefs untouched, no decide movement
    const posBefore = { ...c.pos }
    s.tick()
    expect(c.pos.x).toBe(posBefore.x)
    expect(c.brainPrefs).toEqual([0.5, 0.5, 0.5]) // not recomputed while asleep
    expect(c.sleeping).toBe(true)
  })

  it('a creature wakes when a creature approaches (proximity event)', () => {
    const s = createSim(2)
    const sleeper = s.spawnCreature(GEN({ fearfulness: 0.9 }), 0, 0)
    const visitor = s.spawnCreature(GEN(), 4, 0)
    sleeper.sleeping = true
    sleeper.chem.energy = 0.5
    // visitor walks close over a few ticks → sleeper wakes
    for (let i = 0; i < 30; i++) {
      s.tick()
      visitor.pos.x -= 0.3
    }
    // proximity wakes the sleeper
    expect(sleeper.sleeping).toBe(false)
  })

  it('creatures age and eventually die of old age', () => {
    const s = createSim(3)
    const c = s.spawnCreature(GEN(), 0, 0)
    c.age = AGE_LIMIT_BASE + 1 // just past the limit
    c.chem.health = 1
    s.tick()
    // aging damage starts near/at the limit
    expect(agingDamage(c.age, 0)).toBeGreaterThan(0)
  })

  it('player-bonded creatures are exempt from aging death', () => {
    const s = createSim(4)
    const c = s.spawnCreature(GEN(), 0, 0)
    c.age = AGE_LIMIT_BASE + 500 // way past the limit
    c.playerBond = 0.9 // deeply bonded to the player
    expect(isAgeProtected(c.age, c.playerBond)).toBe(true)
    const wild = s.spawnCreature(GEN(), 5, 5)
    wild.age = AGE_LIMIT_BASE + 500
    wild.playerBond = 0
    expect(isAgeProtected(wild.age, wild.playerBond)).toBe(false)
  })

  it('procreation costs energy — not free', () => {
    expect(procreationCost(0.5)).toBeGreaterThan(0)
    // lower energy = higher proportional cost pressure
    expect(procreationCost(0.2)).toBeGreaterThan(procreationCost(0.9))
  })

  it('procreation is gated on both parents having reserves', () => {
    // the gate itself blocks when either parent is exhausted
    expect(canProcreate(0.1, 0.9, 700)).toBe(false)
    expect(canProcreate(0.9, 0.1, 700)).toBe(false)
    expect(canProcreate(0.5, 0.5, 700)).toBe(true)
    // and the sim respects it while both are still exhausted
    const s = createSim(5)
    const a = s.spawnCreature(GEN(), at('homes').x, at('homes').z) // at homes
    const b = s.spawnCreature(GEN(), at('homes').x + 1, at('homes').z + 0)
    a.partnerId = b.id
    b.partnerId = a.id
    a.chem.bond = 1
    b.chem.bond = 1
    a.age = 700
    b.age = 700
    a.chem.energy = 0.1
    b.chem.energy = 0.1 // BOTH exhausted
    const before = s.creatures.length
    s.tick()
    expect(s.creatures.length).toBe(before) // no birth: both drained
  })

  it('well-fed parents can procreate (energy cost paid)', () => {
    const s = createSim(6)
    const a = s.spawnCreature(GEN(), at('homes').x, at('homes').z) // at homes
    const b = s.spawnCreature(GEN(), at('homes').x + 1, at('homes').z + 0)
    a.partnerId = b.id
    b.partnerId = a.id
    a.chem.bond = 1
    b.chem.bond = 1
    a.age = 700
    b.age = 700
    a.chem.energy = 0.9
    b.chem.energy = 0.9
    a.chem.health = 1
    b.chem.health = 1
    const before = s.creatures.length
    for (let i = 0; i < 80; i++) s.tick()
    expect(s.creatures.length).toBeGreaterThan(before) // birth happened
  })
})
