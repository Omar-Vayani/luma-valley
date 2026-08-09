import { describe, expect, it } from 'vitest'
import { createSim } from './sim'
import { randomGenome, type Genome } from './genetics'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('behavior — action suitability emerges from needs + genes', () => {
  it('a hungry poor thief steals; a hungry non-thief works instead', () => {
    const thiefSim = createSim(1)
    const thief = thiefSim.spawnCreature(GEN({ theft: 0.95 }), 0, 0)
    const rich = thiefSim.spawnCreature(GEN(), 1, 0)
    rich.wallet = 10
    thief.wallet = 0
    thief.chem.hunger = 0.2
    thiefSim.tick()
    expect(rich.wallet).toBeLessThan(10) // thief stole

    const honestSim = createSim(2)
    const honest = honestSim.spawnCreature(GEN({ theft: 0.1 }), 0, 0)
    const rich2 = honestSim.spawnCreature(GEN(), 1, 0)
    rich2.wallet = 10
    honest.wallet = 0
    honest.chem.hunger = 0.2
    honest.learnTower('work') // knows the honest way to earn
    honestSim.tick()
    expect(rich2.wallet).toBe(10) // honest did not steal
  })

  it('a broke hungry creature goes to the work tower to earn food money', () => {
    const s = createSim(3)
    const c = s.spawnCreature(GEN(), 10, 10)
    c.wallet = 0
    c.chem.hunger = 0.2
    c.learnTower('work') // has explored and knows where work is
    s.tick()
    expect(c.goalTowerId).toBe('work')
  })

  it('a creature with money goes to the food tower when hungry', () => {
    const s = createSim(4)
    const c = s.spawnCreature(GEN(), 10, 10)
    c.wallet = 20
    c.chem.hunger = 0.2
    c.learnTower('food')
    s.tick()
    expect(c.goalTowerId).toBe('food')
  })

  it('a weak creature trains at the gym/play to gain strength', () => {
    const s = createSim(5)
    const c = s.spawnCreature(GEN(), 0, 44) // at gym tower
    c.chem.strength = 0.1
    c.chem.hunger = 0.9
    c.chem.pleasure = 0.9
    for (let i = 0; i < 5; i++) s.tick()
    expect(c.action).toBe('play')
    expect(c.chem.strength).toBeGreaterThan(0.15)
  })

  it('an addiction-prone sad creature buys a drink (combined behavior)', () => {
    const s = createSim(6)
    const c = s.spawnCreature(GEN({ addictionProne: 0.95 }), -38, 38) // at tavern
    c.wallet = 20
    c.chem.pleasure = 0.1 // sad/bored
    for (let i = 0; i < 5; i++) s.tick()
    // the creature chose the tavern to escape sadness and built dependence
    expect(c.chem.addiction.brew ?? 0).toBeGreaterThan(0)
    expect(c.wallet).toBeLessThan(20) // paid for the drink
  })
})

describe('behavior — gratitude', () => {
  it('a gifted creature is grateful to the observer', () => {
    const s = createSim(7)
    const c = s.spawnCreature(GEN(), 0, 0)
    s.gift(c.id, 5)
    expect(c.gratitude[0]).toBeGreaterThan(0)
  })

  it('a grateful wealthy creature shares coins with a poor friend', () => {
    const s = createSim(8)
    const giver = s.spawnCreature(GEN({ sociability: 0.8 }), 0, 0)
    const friend = s.spawnCreature(GEN(), 1, 0)
    giver.wallet = 15
    friend.wallet = 0
    giver.gratitude[friend.id] = 0.8
    s.tick()
    expect(friend.wallet).toBeGreaterThan(0)
    expect(giver.wallet).toBeLessThan(15)
  })
})
