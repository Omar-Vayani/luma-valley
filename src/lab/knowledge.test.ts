import { describe, expect, it } from 'vitest'
import { createSim } from './sim'
import { randomGenome, type Genome } from './genetics'
import { findTower, type TowerId } from './world'

/** A tower’s position, so moving a building never breaks a test. */
const at = (id: TowerId) => findTower(id)!

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('knowledge — creatures learn by exploring, not omniscience', () => {
  it('a creature starts knowing nothing about far buildings', () => {
    const s = createSim(1)
    const c = s.spawnCreature(GEN({ curiosity: 0.2 }), 0, 0)
    expect(c.knowledge).toBeDefined()
    // far towers are unknown
    expect(c.knowsTower('graveyard')).toBe(false)
    expect(c.knowsTower('den')).toBe(false)
  })

  it('seeing a nearby tower teaches the creature where it is', () => {
    const s = createSim(2)
    const c = s.spawnCreature(GEN({ curiosity: 0.2 }), 0, 0)
    // food tower is at -32,-32 — put the creature near it
    c.pos = { x: at('food').x, z: at('food').z }
    s.tick()
    expect(c.knowsTower('food')).toBe(true)
  })

  it('an idle creature with nothing urgent wanders to explore (curious types keep moving)', () => {
    const s = createSim(4)
    const c = s.spawnCreature(GEN({ curiosity: 0.9 }), 5, 5)
    c.wallet = 20
    c.chem.hunger = 0.9
    c.chem.energy = 0.9
    c.chem.pleasure = 0.9
    c.chem.social = 0.9
    c.chem.health = 1
    let moved = 0
    let lastPos = { ...c.pos }
    for (let i = 0; i < 200; i++) {
      s.tick()
      if (Math.hypot(c.pos.x - lastPos.x, c.pos.z - lastPos.z) > 0.1) {
        moved++
        lastPos = { ...c.pos }
      }
    }
    expect(moved).toBeGreaterThan(40) // kept exploring, not stuck
  })

  it('a creature that knows where food is goes there when hungry; one that does not, explores first', () => {
    const s = createSim(5)
    const knower = s.spawnCreature(GEN({ curiosity: 0.2 }), at('food').x, at('food').z) // at/near food, learns it
    const ignoramus = s.spawnCreature(GEN({ curiosity: 0.2 }), 30, 30) // far, doesn't know food
    s.tick() // knower learns food
    knower.chem.hunger = 0.3
    ignoramus.chem.hunger = 0.3
    for (let i = 0; i < 12; i++) s.tick() // let commitments lapse
    // the knower is at the food tower and eats (hunger recovers)
    expect(knower.chem.hunger).toBeGreaterThan(0.3)
    // ignoramus does NOT know where food is — it wanders/explores instead of teleporting
    expect(ignoramus.action).not.toContain('food')
  })
})

describe('bank — creatures withdraw what they saved', () => {
  it('a creature with money in the bank withdraws when it needs food but is broke', () => {
    const s = createSim(6)
    const c = s.spawnCreature(GEN({ curiosity: 0.2 }), -3, -40) // near bank (0,-44), learns it
    c.wallet = 1 // can't afford bread
    c.banked = 10 // but has savings
    c.chem.hunger = 0.3
    for (let i = 0; i < 5; i++) s.tick()
    // hungry + broke but has savings → withdrew from the bank
    expect(c.banked).toBeLessThan(10)
    expect(c.wallet).toBeGreaterThan(1)
  })

  it('a creature withdraws at the bank when it arrives there broke', () => {
    const s = createSim(7)
    const c = s.spawnCreature(GEN({ curiosity: 0.2 }), at('bank').x, at('bank').z) // AT the bank
    c.wallet = 1
    c.banked = 10
    c.chem.hunger = 0.3
    for (let i = 0; i < 12; i++) s.tick() // withdrawal happens on arrival
    expect(c.banked).toBeLessThan(10) // withdrew
    expect(c.wallet).toBeGreaterThan(1) // has money now
  })
})

describe('burial — anyone can carry the dead', () => {
  it('a stranger (not a lover) carries a dead body to the graveyard', () => {
    const s = createSim(8)
    const dead = s.spawnCreature(GEN(), 5, 5)
    s.spawnCreature(GEN({ lovePropensity: 0.2, sociability: 0.3 }), 6, 5) // stranger, no bond
    dead.hurt(5) // dies
    for (let i = 0; i < 160; i++) s.tick()
    expect(s.graves.length).toBeGreaterThanOrEqual(1)
    expect(dead.buried).toBe(true)
  })
})

describe('booze — substances are an escape, not a death sentence', () => {
  it('a happy, healthy creature does NOT run to the tavern', () => {
    const s = createSim(9)
    const c = s.spawnCreature(GEN({ addictionProne: 0.95 }), at('tavern').x, at('tavern').z) // AT the tavern
    c.wallet = 50
    c.chem.hunger = 0.9
    c.chem.pleasure = 0.9 // happy
    c.chem.energy = 0.9
    c.chem.social = 0.9
    c.chem.health = 1
    for (let i = 0; i < 5; i++) s.tick()
    expect(c.chem.addiction.brew ?? 0).toBe(0) // no need to drink
  })

  it('a sad creature drinks at the tavern, but does not abandon survival', () => {
    const s = createSim(10)
    const c = s.spawnCreature(GEN({ addictionProne: 0.95 }), at('tavern').x, at('tavern').z) // AT the tavern
    c.wallet = 50
    c.chem.pleasure = 0.05 // very sad
    c.chem.hunger = 0.5
    c.chem.energy = 0.8
    c.chem.health = 1
    for (let i = 0; i < 10; i++) s.tick()
    expect(c.chem.addiction.brew ?? 0).toBeGreaterThan(0) // drank to escape
    expect(c.alive).toBe(true)
  })
})
