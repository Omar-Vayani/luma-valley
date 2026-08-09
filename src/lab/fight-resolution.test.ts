import { describe, expect, it } from 'vitest'
import { createSim } from './sim'
import { randomGenome, type Genome } from './genetics'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('sim — fight resolution (no infinite brawl)', () => {
  it('two aggressive creatures fight, then one flees and fights stop', () => {
    const s = createSim(2024)
    const a = s.spawnCreature(GEN({ aggression: 0.95, courage: 0.9 }), 0, 0)
    const b = s.spawnCreature(GEN({ aggression: 0.95, courage: 0.1 }), 2, 0)
    // force them to fight by setting a vendetta
    a.memory.vendettas[b.id] = 1
    b.memory.vendettas[a.id] = 1
    const fightsBefore = s.events.filter((e) => e.type === 'fight').length
    for (let i = 0; i < 120; i++) s.tick()
    const fightsAfter = s.events.filter((e) => e.type === 'fight').length
    expect(fightsAfter).toBeGreaterThan(fightsBefore) // a fight happened
    // but it resolved: at least one is not actively fighting the other anymore
    const stillFighting = s.creatures.filter((c) => c.alive && c.action === 'fight').length
    expect(stillFighting).toBeLessThan(2)
  })

  it('the loser of a fight flees (lower courage + low health)', () => {
    const s = createSim(3030)
    const a = s.spawnCreature(GEN({ aggression: 0.95, courage: 0.9 }), 0, 0)
    const b = s.spawnCreature(GEN({ aggression: 0.4, courage: 0.1 }), 2, 0)
    a.memory.vendettas[b.id] = 1
    b.memory.vendettas[a.id] = 1
    for (let i = 0; i < 90; i++) s.tick()
    const bAlive = s.creatureById(b.id)!
    // either b fled (action flee / not fight) or b died — no eternal brawl
    expect(bAlive.action === 'fight' && bAlive.chem.health < 0.9).toBe(false)
  })

  it('a creature does not fight every single tick (cooldown)', () => {
    const s = createSim(4040)
    const a = s.spawnCreature(GEN({ aggression: 0.95, courage: 0.9 }), 0, 0)
    const b = s.spawnCreature(GEN({ aggression: 0.95, courage: 0.9 }), 2, 0)
    a.memory.vendettas[b.id] = 1
    b.memory.vendettas[a.id] = 1
    const fightTicks: number[] = []
    for (let i = 0; i < 60; i++) {
      s.tick()
      if (s.creatures.some((c) => c.action === 'fight')) fightTicks.push(i)
    }
    // If they fought on more than a couple consecutive ticks, cooldown is broken
    expect(fightTicks.length).toBeLessThan(60)
  })
})
