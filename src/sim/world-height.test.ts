import { describe, expect, it } from 'vitest'
import { World } from './world'

describe('procedural terrain height', () => {
  it('changes continuously across noise-cell boundaries', () => {
    const world = new World(42)
    let largestStep = 0
    for (let x = -39; x < 39; x += 0.01) {
      largestStep = Math.max(largestStep, Math.abs(world.height(x + 0.01, 7.25) - world.height(x, 7.25)))
    }
    expect(largestStep).toBeLessThan(0.01)
  })
})
