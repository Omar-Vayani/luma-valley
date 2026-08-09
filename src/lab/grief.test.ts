import { describe, expect, it } from 'vitest'
import { createSim } from './sim'
import { randomGenome, type Genome } from './genetics'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('sim — grief and mourning', () => {
  it('when a partner dies, the survivor enters grief (depression)', () => {
    const s = createSim(9)
    const a = s.spawnCreature(GEN({ lovePropensity: 0.95 }), 0, 0)
    const b = s.spawnCreature(GEN({ lovePropensity: 0.95 }), 2, 0)
    a.partnerId = b.id
    b.partnerId = a.id
    a.chem.bond = 1
    b.chem.bond = 1
    b.hurt(2) // kill b
    expect(b.alive).toBe(false)
    s.tick()
    expect(a.chem.grief).toBeGreaterThan(0)
  })

  it('grief slowly heals over time', () => {
    const s = createSim(10)
    const a = s.spawnCreature(GEN(), 0, 0)
    const b = s.spawnCreature(GEN(), 2, 0)
    a.partnerId = b.id
    b.partnerId = a.id
    b.hurt(2)
    s.tick()
    const grief = a.chem.grief
    for (let i = 0; i < 100; i++) s.tick()
    expect(a.chem.grief).toBeLessThan(grief)
  })

  it('a mourning survivor is visibly sad (emotion)', () => {
    const s = createSim(11)
    const a = s.spawnCreature(GEN(), 0, 0)
    const b = s.spawnCreature(GEN(), 2, 0)
    a.partnerId = b.id
    b.partnerId = a.id
    b.hurt(2)
    s.tick()
    expect(a.chem.grief).toBeGreaterThan(0.5)
  })
})
