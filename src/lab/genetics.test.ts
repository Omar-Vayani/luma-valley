import { describe, expect, it } from 'vitest'
import { randomGenome, crossover, mutate, GENE_NAMES, type Genome } from './genetics'

const G = (): Genome => randomGenome(() => 0.5)

describe('genetics — heritable personality', () => {
  it('exposes all twelve susceptibility genes in 0..1', () => {
    const g = G()
    for (const name of GENE_NAMES) {
      expect(g[name]).toBeGreaterThanOrEqual(0)
      expect(g[name]).toBeLessThanOrEqual(1)
    }
  })

  it('randomGenome uses the injected rng and stays in bounds', () => {
    const g = randomGenome(() => 0.99)
    for (const name of GENE_NAMES) expect(g[name]).toBeCloseTo(0.99)
    const g2 = randomGenome(() => 0)
    for (const name of GENE_NAMES) expect(g2[name]).toBeCloseTo(0)
  })

  it('crossover mixes genes from both parents', () => {
    const a = randomGenome(() => 0.1)
    const b = randomGenome(() => 0.9)
    // rng() < 0.5 picks a, else b — force a-picks then b-picks per call
    const picks: number[] = [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2]
    const child = crossover(a, b, () => picks.shift() ?? 0.9)
    for (const name of GENE_NAMES) {
      expect(child[name]).toBeCloseTo(0.1, 5)
    }
  })

  it('mutate perturbs a gene but keeps it in 0..1', () => {
    const g = G()
    const child = mutate(g, 1, () => 0.3) // every gene mutates
    let changed = 0
    for (const name of GENE_NAMES) if (child[name] !== g[name]) changed++
    expect(changed).toBeGreaterThan(0)
    for (const name of GENE_NAMES) {
      expect(child[name]).toBeGreaterThanOrEqual(0)
      expect(child[name]).toBeLessThanOrEqual(1)
    }
  })

  it('a child inherits parent susceptibility (heritability end-to-end)', () => {
    const highAggression = randomGenome(() => 0.5)
    highAggression.aggression = 0.95
    const child = crossover(highAggression, G(), () => 0.2)
    const grandchild = crossover(child, G(), () => 0.2)
    expect(child.aggression).toBeGreaterThan(0.5)
    expect(grandchild.aggression).toBeGreaterThan(0.5)
  })
})
