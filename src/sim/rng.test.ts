import { describe, expect, it } from 'vitest'
import { clamp, hashSeed, int, mulberry32, pick, range } from './rng'

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = Array.from({ length: 10 }, () => a())
    const seqB = Array.from({ length: 10 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('differs across seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })

  it('produces values in [0, 1)', () => {
    const r = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('range stays inside bounds', () => {
    const r = mulberry32(5)
    for (let i = 0; i < 500; i++) {
      const v = range(r, -2, 3)
      expect(v).toBeGreaterThanOrEqual(-2)
      expect(v).toBeLessThan(3)
    }
  })

  it('int returns integers inside [min, max]', () => {
    const r = mulberry32(9)
    for (let i = 0; i < 200; i++) {
      const v = int(r, 1, 4)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(4)
    }
  })

  it('pick returns an element of the array', () => {
    const r = mulberry32(11)
    const arr = ['a', 'b', 'c']
    for (let i = 0; i < 100; i++) {
      expect(arr).toContain(pick(r, arr))
    }
  })

  it('clamp bounds values', () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(-1, 0, 1)).toBe(0)
    expect(clamp(0.5, 0, 1)).toBe(0.5)
  })

  it('hashSeed is stable and non-trivial', () => {
    const h1 = hashSeed('luma-valley')
    expect(hashSeed('luma-valley')).toBe(h1)
    expect(hashSeed('luma-valley2')).not.toBe(h1)
  })
})
