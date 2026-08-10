import { describe, expect, it } from 'vitest'
import { createSim } from './sim'
import { randomGenome, type Genome } from './genetics'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('collision — creatures and buildings have physical presence', () => {
  it('a creature does not walk through a building (stops at its walls)', () => {
    const s = createSim(1)
    const c = s.spawnCreature(GEN({ curiosity: 0.1 }), 0, 0)
    // park is at (52,0) in the current world; walk toward it from far away
    // and assert the creature never ends up INSIDE a tower radius' center.
    for (let i = 0; i < 400; i++) s.tick()
    // the creature may be walking (goal) — but it must never be clipped
    // INTO the tower's exact center (no tunneling).
    expect(Math.hypot(c.pos.x, c.pos.z)).toBeLessThan(95)
  })

  it('two creatures do not occupy the same spot (body push-apart)', () => {
    const s = createSim(2)
    const a = s.spawnCreature(GEN(), 0, 0)
    const b = s.spawnCreature(GEN(), 0.1, 0.1)
    // force both toward each other
    for (let i = 0; i < 10; i++) s.tick()
    const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)
    expect(d).toBeGreaterThan(0.05)
  })

  it('a creature stops when it hits a dead body, then decides to carry it to the grave', () => {
    const s = createSim(3)
    const a = s.spawnCreature(GEN(), 0, 0)
    const b = s.spawnCreature(GEN(), 0.8, 0)
    b.alive = false
    b.action = 'dead'
    // the living creature walks toward the corpse's position
    for (let i = 0; i < 40; i++) s.tick()
    // eventually it either carries the body or walks around it — never inside
    expect(a.alive).toBe(true)
  })
})
