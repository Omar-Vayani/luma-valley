import { describe, expect, it } from 'vitest'
import { scoreActions, chooseAction } from './mind'
import { createSim } from './sim'
import { randomGenome, type Genome } from './genetics'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('mind — utility scoring (creatures rationalise, not preprogrammed)', () => {
  it('a hungry broke creature rates work above everything', () => {
    const s = createSim(1)
    const c = s.spawnCreature(GEN({ theft: 0.1 }), 10, 10)
    c.wallet = 0
    c.chem.hunger = 0.2
    c.learnTower('work') // knows where work is (already explored)
    c.learnTower('food')
    const scores = scoreActions(s, c)
    expect(scores.work).toBeGreaterThan(scores.wander)
    expect(scores.work).toBeGreaterThan(scores.food)
    expect(scores.work).toBeGreaterThan(scores.play)
  })

  it('a hungry rich creature rates buying food highest', () => {
    const s = createSim(2)
    const c = s.spawnCreature(GEN({ theft: 0.1 }), 10, 10)
    c.wallet = 20
    c.chem.hunger = 0.2
    c.learnTower('food')
    const scores = scoreActions(s, c)
    expect(scores.food).toBeGreaterThan(scores.work)
    expect(scores.food).toBeGreaterThan(scores.wander)
  })

  it('a desperate thief rates stealing above working', () => {
    const s = createSim(3)
    const thief = s.spawnCreature(GEN({ theft: 0.95, greed: 0.9 }), 0, 0)
    const rich = s.spawnCreature(GEN(), 1, 0)
    rich.wallet = 10
    thief.wallet = 0
    thief.chem.hunger = 0.2
    thief.learnTower('work')
    const scores = scoreActions(s, thief)
    expect(scores.steal).toBeGreaterThan(scores.work)
  })

  it('an honest creature rates work above stealing even when poor', () => {
    const s = createSim(4)
    const honest = s.spawnCreature(GEN({ theft: 0.1 }), 0, 0)
    honest.learnTower('work')
    const rich = s.spawnCreature(GEN(), 1, 0)
    rich.wallet = 10
    honest.wallet = 0
    honest.chem.hunger = 0.2
    const scores = scoreActions(s, honest)
    expect(scores.work).toBeGreaterThan(scores.steal)
  })

  it('a sad addict rates drinking above work', () => {
    const s = createSim(5)
    const c = s.spawnCreature(GEN({ addictionProne: 0.95 }), -28, 28) // at tavern
    c.wallet = 20
    c.chem.pleasure = 0.1
    const scores = scoreActions(s, c)
    expect(scores.drink).toBeGreaterThan(scores.work)
  })

  it('a weak creature rates gym/play above wandering', () => {
    const s = createSim(6)
    const c = s.spawnCreature(GEN(), 0, 32) // at play/gym
    c.chem.strength = 0.1
    c.chem.pleasure = 0.9
    c.chem.hunger = 0.9
    const scores = scoreActions(s, c)
    expect(scores.play).toBeGreaterThan(scores.wander)
  })

  it('choice includes noise — identical creatures do not always pick identically (free will)', () => {
    const s = createSim(7)
    const c = s.spawnCreature(GEN(), 5, 5)
    c.wallet = 6 // exactly enough for food; pleasure and strength mid
    c.chem.hunger = 0.6
    c.chem.pleasure = 0.5
    c.chem.strength = 0.5
    const picks = new Set<string>()
    for (let i = 0; i < 60; i++) {
      const a = chooseAction(scoreActions(s, c), s.rng)
      picks.add(a)
    }
    expect(picks.size).toBeGreaterThan(1)
  })
})
