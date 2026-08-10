import { describe, expect, it } from 'vitest'
import { createChem, tickChem, applyPlay } from './chem'
import { randomGenome, type Genome } from './genetics'
import { createSim } from './sim'
import { TOWERS, TOWER_IDS } from './world'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('sim pace — creatures get free time', () => {
  it('a full-fed creature stays above half hunger for a long stretch', () => {
    const c = createChem()
    for (let i = 0; i < 400; i++) tickChem(c) // ~66s of lab time
    expect(c.hunger).toBeGreaterThan(0.5)
    expect(c.energy).toBeGreaterThan(0.5)
  })

  it('needs decay slowly enough that a creature can socialize before starving', () => {
    const c = createChem()
    for (let i = 0; i < 300; i++) tickChem(c) // 50s
    expect(c.hunger).toBeGreaterThan(0.6)
    expect(c.social).toBeGreaterThan(0.6)
  })
})

describe('play/exercise tower — strength and joy', () => {
  it('world has a play tower', () => {
    expect(TOWER_IDS).toContain('play')
    const play = TOWERS.find((t) => t.id === 'play')
    expect(play).toBeDefined()
    expect(play?.label).toBe('gym')
  })

  it('playing raises pleasure and strength', () => {
    const c = createChem()
    c.pleasure = 0.2
    c.strength = 0.2
    applyPlay(c)
    expect(c.pleasure).toBeGreaterThan(0.3)
    expect(c.strength).toBeGreaterThan(0.3)
  })

  it('a creature at the play tower plays instead of starving', () => {
    const s = createSim(99)
    const c = s.spawnCreature(GEN(), 0, 36) // at play tower (gym)
    c.chem.hunger = 0.4
    c.chem.pleasure = 0.2 // bored → seeks play
    c.pos = { x: 0, z: 36 }
    c.learnTower('play')
    s.tick()
    expect(c.action).toBe('play')
    expect(c.chem.strength).toBeGreaterThan(0)
  })

  it('strength helps win fights (higher damage)', () => {
    const s = createSim(101)
    const strong = s.spawnCreature(GEN({ aggression: 0.9 }), 0, 0)
    const weak = s.spawnCreature(GEN({ aggression: 0.9 }), 2, 0)
    strong.chem.strength = 1
    weak.chem.strength = 0
    strong.memory.vendettas[weak.id] = 1
    weak.memory.vendettas[strong.id] = 1
    const weakHealthBefore = weak.chem.health
    s.tick()
    expect(weak.chem.health).toBeLessThan(weakHealthBefore - 0.05)
  })
})
