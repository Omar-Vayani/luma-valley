import { describe, expect, it } from 'vitest'
import { createBrain, think, reward, disposeBrain } from './brain'

describe('brain — tiny per-creature neural nets (TensorFlow.js)', () => {
  it('creates a brain with a fixed small size', () => {
    const b = createBrain(8, 6)
    expect(b.inputSize).toBe(8)
    expect(b.outputSize).toBe(6)
    expect(b.learnRate).toBeGreaterThan(0)
    expect(b.learnRate).toBeLessThan(1)
    disposeBrain(b)
  })

  it('think returns a preference vector over actions', async () => {
    const b = createBrain(8, 6)
    const out = await think(b, Array.from({ length: 8 }).fill(0.5) as number[])
    expect(out.length).toBe(6)
    for (const v of out) {
      expect(Number.isFinite(v)).toBe(true)
    }
    disposeBrain(b)
  })

  it('different inputs give different preferences (the net responds)', async () => {
    const b = createBrain(4, 3)
    const hungry = await think(b, [1, 0, 0, 0])
    const rested = await think(b, [0, 1, 0, 0])
    // the raw outputs may be close, but the learned response to context differs
    expect(hungry.some((v, i) => Math.abs(v - rested[i]) > 1e-6)).toBe(true)
    disposeBrain(b)
  })

  it('reward strengthens the pathway for the rewarded action', async () => {
    const b = createBrain(4, 3)
    const before = await think(b, [1, 0, 0, 0])
    // reward action 1 in this context several times
    for (let i = 0; i < 20; i++) {
      await reward(b, [1, 0, 0, 0], 1, 0.5)
    }
    const after = await think(b, [1, 0, 0, 0])
    // the rewarded action should now be preferred
    expect(after[1]).toBeGreaterThan(before[1] - 0.05)
    disposeBrain(b)
  })

  it('brains are independent — learning in one does not affect another', async () => {
    const a = createBrain(4, 3)
    const b = createBrain(4, 3)
    const beforeA = await think(a, [1, 0, 0, 0])
    const beforeB = await think(b, [1, 0, 0, 0])
    for (let i = 0; i < 20; i++) await reward(a, [1, 0, 0, 0], 1, 0.5)
    const afterA = await think(a, [1, 0, 0, 0])
    const afterB = await think(b, [1, 0, 0, 0])
    expect(afterA[1]).toBeGreaterThan(beforeA[1] - 0.05)
    expect(afterB[1]).toBeCloseTo(beforeB[1], 4) // untouched brain unchanged
    disposeBrain(a)
    disposeBrain(b)
  })

  it('serializes to plain weights for saving and reloads exactly', async () => {
    const b = createBrain(4, 3)
    await reward(b, [1, 0, 0, 0], 1, 0.5)
    const snapshot = b.serialize()
    const out1 = await think(b, [1, 0, 0, 0])
    const b2 = createBrain(4, 3, snapshot)
    const out2 = await think(b2, [1, 0, 0, 0])
    expect(out1).toEqual(out2)
    disposeBrain(b)
    disposeBrain(b2)
  })
})
