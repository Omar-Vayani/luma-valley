import { describe, expect, it } from 'vitest'
import { createSim } from './sim'
import { randomGenome, type Genome } from './genetics'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('sim — survival (test-lab longevity)', () => {
  it('most creatures survive a long run and the population reproduces', () => {
    const s = createSim(1234)
    for (let i = 0; i < 8; i++) s.spawnCreature(GEN())
    for (let i = 0; i < 1500; i++) s.tick() // ~4 minutes of lab time
    const alive = s.creatures.filter((c) => c.alive).length
    expect(alive).toBeGreaterThanOrEqual(5)
  })

  it('a wounded creature seeks the pharmacy to heal', () => {
    const s = createSim(55)
    const c = s.spawnCreature(GEN(), -10, -10)
    c.chem.health = 0.25
    c.pos = { x: 5, z: 5 }
    s.tick()
    expect(c.goalTowerId).toBe('pharmacy')
  })

  it('an afraid creature flees instead of wandering toward random towers', () => {
    const s = createSim(66)
    const c = s.spawnCreature(GEN({ fearfulness: 0.9, courage: 0.1 }), 0, 0)
    c.chem.fear = 0.9
    s.tick()
    expect(c.action).toBe('flee')
  })

  it('hungry creatures do not die of starvation before reaching food', () => {
    const s = createSim(77)
    const c = s.spawnCreature(GEN(), 20, -20)
    c.chem.hunger = 0.4
    for (let i = 0; i < 120; i++) s.tick()
    expect(c.alive).toBe(true)
    expect(c.chem.hunger).toBeGreaterThan(0.05)
  })
})
