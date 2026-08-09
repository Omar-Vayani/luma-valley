import { describe, expect, it } from 'vitest'
import { createCreature } from './creature'
import { randomGenome, type Genome } from './genetics'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('creature — the ball with eyes', () => {
  it('spawns alive with a name, wallet and full needs', () => {
    const c = createCreature(1, 'Bobo', GEN())
    expect(c.alive).toBe(true)
    expect(c.name).toBe('Bobo')
    expect(c.wallet).toBeGreaterThanOrEqual(0)
    expect(c.chem.hunger).toBeCloseTo(1)
    expect(c.pos.x).toBeGreaterThanOrEqual(-30)
  })

  it('takes damage and dies at zero health', () => {
    const c = createCreature(1, 'Bobo', GEN())
    c.chem.health = 0.1
    c.hurt(0.2)
    expect(c.chem.health).toBe(0)
    expect(c.alive).toBe(false)
  })

  it('pays money and cannot spend what it lacks', () => {
    const c = createCreature(1, 'Bobo', GEN())
    c.wallet = 5
    expect(c.pay(3)).toBe(true)
    expect(c.wallet).toBe(2)
    expect(c.pay(10)).toBe(false)
    expect(c.wallet).toBe(2)
  })

  it('deposits and withdraws from the bank', () => {
    const c = createCreature(1, 'Bobo', GEN())
    c.wallet = 10
    c.deposit(6)
    expect(c.wallet).toBe(4)
    expect(c.banked).toBe(6)
    c.withdraw(2)
    expect(c.banked).toBe(4)
    expect(c.wallet).toBe(6)
  })

  it('earns money from work', () => {
    const c = createCreature(1, 'Bobo', GEN())
    c.work(3)
    expect(c.wallet).toBe(3)
  })

  it('gets sleepy and can sleep to restore energy', () => {
    const c = createCreature(1, 'Bobo', GEN())
    c.chem.energy = 0.2
    c.sleep()
    expect(c.chem.energy).toBeGreaterThan(0.5)
  })

  it('eats to restore hunger', () => {
    const c = createCreature(1, 'Bobo', GEN())
    c.chem.hunger = 0.2
    c.eat()
    expect(c.chem.hunger).toBeGreaterThan(0.5)
  })

  it('bonds with another creature when socializing', () => {
    const a = createCreature(1, 'A', GEN({ sociability: 0.9 }))
    const b = createCreature(2, 'B', GEN({ sociability: 0.9 }))
    a.socialize(b)
    expect(a.bonds[2]).toBeGreaterThan(0)
    expect(b.bonds[1]).toBeGreaterThan(0)
  })

  it('sets a partner when bond is strong', () => {
    const a = createCreature(1, 'A', GEN({ lovePropensity: 0.9 }))
    const b = createCreature(2, 'B', GEN({ lovePropensity: 0.9 }))
    for (let i = 0; i < 10; i++) a.socialize(b)
    a.tryPair(b)
    expect(a.partnerId).toBe(2)
    expect(b.partnerId).toBe(1)
  })

  it('carries a name label the renderer can float above the ball', () => {
    const c = createCreature(3, 'Nana', GEN())
    expect(typeof c.name).toBe('string')
  })
})
