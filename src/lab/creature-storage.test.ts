import { describe, expect, it } from 'vitest'
import { createStorage, saveCreatureState, loadCreatureState, estimateBytes, CREATURE_STORAGE_BYTES } from './creature-storage'

describe('creature storage — each creature has up to 3MB to learn', () => {
  it('has a 3MB per-creature budget', () => {
    expect(CREATURE_STORAGE_BYTES).toBe(3 * 1024 * 1024)
  })

  it('estimates the byte size of a learned state blob', () => {
    const blob = { brain: [0.1, 0.2, 0.3], vocab: ['ba', 'di'], memory: 'hello world' }
    expect(estimateBytes(blob)).toBeGreaterThan(10)
    expect(estimateBytes(blob)).toBeLessThan(CREATURE_STORAGE_BYTES)
  })

  it('saves and loads a creature state round-trip', () => {
    const storage = createStorage('luma-lab')
    const state = { brain: { w1: [1, 2, 3], b1: [0], w2: [4, 5], b2: [6] }, vocab: [{ concept: 'food', word: 'ba', strength: 0.9 }] }
    saveCreatureState(storage, 42, state)
    const loaded = loadCreatureState(storage, 42)
    expect(loaded).toEqual(state)
  })

  it('returns null for a creature with no saved state', () => {
    const storage = createStorage('luma-lab')
    expect(loadCreatureState(storage, 999)).toBeNull()
  })

  it('tracks storage usage per creature', () => {
    const storage = createStorage('luma-lab')
    const state = { brain: Array.from({ length: 500 }).fill(0.5), vocab: [] }
    saveCreatureState(storage, 7, state)
    const usage = storage.usage(7)
    expect(usage).toBeGreaterThan(0)
    expect(usage).toBeLessThanOrEqual(CREATURE_STORAGE_BYTES)
  })
})
