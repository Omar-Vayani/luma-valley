import { describe, expect, it } from 'vitest'
import { hairStyle } from './hair'
import { randomGenome, type Genome } from './genetics'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('hair — genetic visual identity', () => {
  it('every genome maps to a valid hair style', () => {
    const g = GEN()
    const h = hairStyle(g)
    expect(['spiky', 'tuft', 'buzz', 'long', 'curly', 'bald']).toContain(h.style)
    expect(h.color.startsWith('#')).toBe(true)
    expect(h.size).toBeGreaterThan(0)
  })

  it('aggressive creatures tend to have spiky hair', () => {
    const g = GEN({ aggression: 0.98 })
    const h = hairStyle(g)
    expect(h.style).toBe('spiky')
  })

  it('sociable creatures tend to have curly hair', () => {
    const g = GEN({ sociability: 0.98, aggression: 0.02 })
    const h = hairStyle(g)
    expect(h.style).toBe('curly')
  })

  it('children of spiky parents are likely spiky (heritable look)', () => {
    // both parents spiky-aggressive → child genome high aggression → spiky
    const parentGenome: Genome = { ...GEN(), aggression: 0.97, curiosity: 0.2, lovePropensity: 0.3, sociability: 0.3 }
    const h = hairStyle(parentGenome)
    expect(h.style).toBe('spiky')
  })

  it('hair color comes from the creature id hue (distinct per ball)', () => {
    const g1 = GEN()
    const g2 = GEN()
    const h1 = hairStyle(g1, 3)
    const h2 = hairStyle(g2, 9)
    expect(h1.color).not.toBe(h2.color)
  })
})
