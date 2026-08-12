import { describe, expect, it } from 'vitest'
import { createChem, tickChem, applyFood, applyMedicine, applyDrink } from './chem'
import { deriveEmotion } from './emotion'
import { randomGenome, type Genome } from './genetics'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('chem — needs', () => {
  it('starts with full needs and decays over ticks', () => {
    const c = createChem()
    expect(c.hunger).toBeCloseTo(1)
    tickChem(c)
    expect(c.hunger).toBeLessThan(1)
    expect(c.energy).toBeLessThan(1)
    expect(c.social).toBeLessThan(1)
  })

  it('food satiates hunger and raises health slightly', () => {
    const c = createChem()
    c.hunger = 0.3
    applyFood(c)
    expect(c.hunger).toBeGreaterThan(0.3)
    expect(c.health).toBeGreaterThan(0.5)
  })

  it('medicine heals but raises addiction when prone', () => {
    const c = createChem()
    c.health = 0.2
    applyMedicine(c, { addictionProne: 0.9 } as Genome)
    expect(c.health).toBeGreaterThan(0.2)
    expect(c.addiction.medicine).toBeGreaterThan(0)
  })

  it('drink gives pleasure and intoxication, and can addict', () => {
    const c = createChem()
    applyDrink(c, { addictionProne: 0.8 } as Genome)
    expect(c.pleasure).toBeGreaterThan(0.5)
    expect(c.intoxication).toBeGreaterThan(0)
    // one habit, tracked under one key, wherever the drink came from
    expect(c.addiction.brew).toBeGreaterThan(0)
    expect(c.addiction.drink).toBeUndefined()
  })

  it('withdrawal spikes fear when an addict is deprived', () => {
    const c = createChem()
    c.addiction.medicine = 0.9
    const before = c.fear
    tickChem(c)
    expect(c.fear).toBeGreaterThan(before + 0.1)
  })
})

describe('emotion — visible mood', () => {
  it('is content when needs are met', () => {
    const e = deriveEmotion(createChem(), GEN())
    expect(e.type).toBe('content')
  })

  it('is angry when hungry and aggressive', () => {
    const c = createChem()
    c.hunger = 0.05
    const e = deriveEmotion(c, GEN({ aggression: 0.95, fearfulness: 0.1 }))
    expect(e.type).toBe('angry')
  })

  it('is afraid when fear is high and fearfulness is high', () => {
    const c = createChem()
    c.fear = 0.9
    const e = deriveEmotion(c, GEN({ fearfulness: 0.9, courage: 0.1 }))
    expect(e.type).toBe('afraid')
  })

  it('is happy when pleasure is high and needs are met', () => {
    const c = createChem()
    c.pleasure = 0.9
    const e = deriveEmotion(c, GEN())
    expect(e.type).toBe('happy')
  })

  it('is sleepy when energy is low', () => {
    const c = createChem()
    c.energy = 0.1
    const e = deriveEmotion(c, GEN())
    expect(e.type).toBe('sleepy')
  })

  it('is sad when social need is very low', () => {
    const c = createChem()
    c.social = 0.1
    const e = deriveEmotion(c, GEN({ sociability: 0.9 }))
    expect(e.type).toBe('sad')
  })

  it('is loving when a bond is high', () => {
    const c = createChem()
    c.bond = 0.9
    const e = deriveEmotion(c, GEN({ lovePropensity: 0.9 }))
    expect(e.type).toBe('loving')
  })

  it('carries a color hint the renderer can read', () => {
    const e = deriveEmotion(createChem(), GEN())
    expect(typeof e.color).toBe('string')
    expect(e.color.startsWith('#')).toBe(true)
  })
})
