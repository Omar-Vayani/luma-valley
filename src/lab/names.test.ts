import { describe, expect, it } from 'vitest'
import { createNamePool, pickName, NAME_PARTS } from './names'

describe('names — every creature gets a unique name', () => {
  it('picks a readable two-part name', () => {
    const pool = createNamePool()
    const n = pickName(pool, 0.5)
    expect(typeof n).toBe('string')
    expect(n.length).toBeGreaterThan(1)
    expect(n).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+$/) // two-part CamelCase e.g. VelVee
  })

  it('never returns a duplicate name across many picks', () => {
    const pool = createNamePool()
    const seen = new Set<string>()
    for (let i = 0; i < 400; i++) {
      const n = pickName(pool, (i * 37 % 100) / 100)
      expect(seen.has(n)).toBe(false)
      seen.add(n)
    }
    expect(seen.size).toBe(400)
  })

  it('name parts are actually usable words', () => {
    expect(NAME_PARTS.first.length).toBeGreaterThan(5)
    expect(NAME_PARTS.last.length).toBeGreaterThan(5)
    for (const p of NAME_PARTS.first) expect(p.length).toBeGreaterThan(1)
  })

  it('reports how many names have been used', () => {
    const pool = createNamePool()
    pickName(pool, 0.1)
    pickName(pool, 0.9)
    expect(pool.usedCount).toBe(2)
  })
})
