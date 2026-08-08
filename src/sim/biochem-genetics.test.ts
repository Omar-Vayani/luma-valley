import { describe, expect, it } from 'vitest'
import { applyFood, chemTick, emptyChemicals, FOOD_EFFECTS, DEFAULT_CHEM_CONFIG, spike } from './biochem'
import { crossover, describeGenome, geneValue, randomGenome } from './genetics'
import { mulberry32 } from './rng'

describe('biochem', () => {
  it('synthesis raises drives over time', () => {
    const c = emptyChemicals()
    for (let i = 0; i < 100; i++) chemTick(c, DEFAULT_CHEM_CONFIG)
    expect(c.hunger).toBeGreaterThan(0.1)
    expect(c.thirst).toBeGreaterThan(0.1)
  })

  it('clamps at max', () => {
    const c = emptyChemicals()
    for (let i = 0; i < 10000; i++) chemTick(c, DEFAULT_CHEM_CONFIG)
    expect(c.hunger).toBeLessThanOrEqual(1.0001)
    expect(c.thirst).toBeLessThanOrEqual(1.0001)
  })

  it('pleasure half-life decays toward zero', () => {
    const c = emptyChemicals()
    spike(c, 'pleasure', 1)
    expect(c.pleasure).toBe(1)
    for (let i = 0; i < 12; i++) chemTick(c, DEFAULT_CHEM_CONFIG)
    expect(c.pleasure).toBeLessThan(0.6)
    expect(c.pleasure).toBeGreaterThan(0.1)
  })

  it('eating food reduces hunger and spikes pleasure', () => {
    const c = emptyChemicals()
    c.hunger = 0.9
    applyFood(c, FOOD_EFFECTS.berry)
    expect(c.hunger).toBeLessThan(0.5)
    expect(c.pleasure).toBeGreaterThan(0.3)
  })

  it('poison mushroom damages health and causes pain', () => {
    const c = emptyChemicals()
    c.health = 0.8
    applyFood(c, FOOD_EFFECTS.mushroom)
    expect(c.pain).toBeGreaterThan(0.1)
    expect(c.health).toBeLessThan(0.8)
  })
})

describe('genetics', () => {
  it('random genome has expected gene count', () => {
    const g = randomGenome(mulberry32(3), 24)
    expect(g.genes.length).toBe(24)
  })

  it('crossover mixes parents', () => {
    const a = randomGenome(mulberry32(1), 30)
    const b = randomGenome(mulberry32(2), 30)
    const child = crossover(a, b, mulberry32(4), 0)
    expect(child.genes.length).toBe(30)
    // with mutation 0, every gene comes from one of the parents
    for (let i = 0; i < 30; i++) {
      const g = child.genes[i]
      const sameAsA = a.genes[i].value === g.value && a.genes[i].kind === g.kind
      const sameAsB = b.genes[i].value === g.value && b.genes[i].kind === g.kind
      expect(sameAsA || sameAsB).toBe(true)
    }
  })

  it('mutation perturbs but stays bounded', () => {
    const a = randomGenome(mulberry32(5), 20)
    const child = crossover(a, a, mulberry32(6), 1.0)
    let changed = 0
    for (let i = 0; i < 20; i++) {
      expect(child.genes[i].value).toBeGreaterThanOrEqual(0)
      expect(child.genes[i].value).toBeLessThanOrEqual(1)
      if (child.genes[i].value !== a.genes[i].value) changed++
    }
    expect(changed).toBeGreaterThan(0)
  })

  it('describeGenome produces sane derived traits', () => {
    const g = randomGenome(mulberry32(11), 24)
    const d = describeGenome(g)
    expect(d.size).toBeGreaterThanOrEqual(0.8)
    expect(d.size).toBeLessThanOrEqual(1.3)
    expect(d.lifespan).toBeGreaterThanOrEqual(1200)
    expect(d.lifespan).toBeLessThanOrEqual(3000)
    expect(d.curiosity).toBeGreaterThanOrEqual(0)
    expect(d.curiosity).toBeLessThanOrEqual(1)
    expect(d.lr).toBeGreaterThan(0.02)
  })

  it('geneValue falls back for missing genes', () => {
    const g = { genes: [] }
    expect(geneValue(g, 'temper', 'curiosity', 0.7)).toBe(0.7)
  })
})
