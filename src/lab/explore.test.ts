import { describe, expect, it } from 'vitest'
import { createSim } from './sim'
import { randomGenome, type Genome } from './genetics'
import { towerAt } from './world'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('sim — exploration (creatures roam, not pile on one tower)', () => {
  it('a curious creature visits many different towers over time', () => {
    const s = createSim(2026)
    s.settings.lodNear = 200 // full AI during this exploration soak
    s.settings.aiBatchSize = 8
    const c = s.spawnCreature(GEN({ curiosity: 0.95 }), 0, 0)
    c.chem.hunger = 0.9 // not hungry — free to roam
    c.chem.pleasure = 0.9 // not bored — free to roam
    const visited = new Set<string>()
    for (let i = 0; i < 600; i++) {
      s.tick()
      const at = towerAt(c.pos.x, c.pos.z)
      if (at) visited.add(at.id)
      if (c.goalTowerId) visited.add(c.goalTowerId)
    }
    // should wander to at least 4 distinct towers, not just one or two
    expect(visited.size).toBeGreaterThanOrEqual(4)
  })

  it('creatures mark towers as seen and prefer new ones (curiosity)', () => {
    const s = createSim(2027)
    const c = s.spawnCreature(GEN({ curiosity: 0.95 }), 0, 0)
    s.tick()
    // after wandering a bit, the seen set grows
    for (let i = 0; i < 300; i++) s.tick()
    expect(Object.keys(c.memory.seenPlaces).length).toBeGreaterThanOrEqual(2)
  })

  it('children inherit the parents genome (gene crossover on birth)', () => {
    const s = createSim(2028)
    const a = s.spawnCreature(GEN({ aggression: 0.9, curiosity: 0.9 }), -36, 0) // at homes
    const b = s.spawnCreature(GEN({ aggression: 0.9, curiosity: 0.9 }), -43, 0)
    a.partnerId = b.id
    b.partnerId = a.id
    a.chem.bond = 1
    b.chem.bond = 1
    a.age = 700 // old enough to procreate
    b.age = 700
    const before = s.creatures.length
    for (let i = 0; i < 60; i++) s.tick()
    expect(s.creatures.length).toBeGreaterThan(before)
    const child = s.creatures[s.creatures.length - 1]
    // child's genome came from the parents: aggression is high, not random-low
    expect(child.genome.aggression).toBeGreaterThan(0.5)
    expect(child.genome.curiosity).toBeGreaterThan(0.5)
  })
})
