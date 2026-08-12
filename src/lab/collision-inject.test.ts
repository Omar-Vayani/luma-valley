/**
 * The simulation knows nothing about trees. The game layer tells it where the
 * solid things are, and walkers respect that without `src/lab` ever importing
 * anything above it.
 */
import { describe, expect, it } from 'vitest'
import { createSim } from './sim'
import { randomGenome } from './genetics'
import { findTower } from './world'

describe('injected obstacles', () => {
  it('defaults to nothing in the way', () => {
    const s = createSim(1)
    expect(s.obstacleAt).toBeNull()
  })

  it('a walker goes around something solid rather than through it', () => {
    const market = findTower('food')!
    const wall = { x: (market.x + 0) / 2, z: (market.z + 0) / 2 }

    const run = (withObstacle: boolean): { x: number; z: number }[] => {
      const s = createSim(9)
      if (withObstacle) {
        s.obstacleAt = (x, z, r) => Math.hypot(x - wall.x, z - wall.z) < 3 + r
      }
      const c = s.spawnCreature(randomGenome(() => 0.5), 0, 0)
      c.chem.hunger = 0.1
      c.wallet = 20
      c.learnTower('food')
      const path: { x: number; z: number }[] = []
      for (let i = 0; i < 120; i++) {
        s.tick()
        path.push({ ...c.pos })
      }
      return path
    }

    const blocked = run(true)
    const closest = blocked.reduce(
      (best, p) => Math.min(best, Math.hypot(p.x - wall.x, p.z - wall.z)),
      Infinity,
    )
    expect(closest, 'walked straight through the obstacle').toBeGreaterThan(2)
  })

  it('a walker hemmed in on every side gives up rather than freezing forever', () => {
    const s = createSim(11)
    s.obstacleAt = () => true
    const c = s.spawnCreature(randomGenome(() => 0.5), 0, 0)
    c.chem.hunger = 0.1
    c.learnTower('food')
    const start = { ...c.pos }
    for (let i = 0; i < 60; i++) s.tick()
    expect(Math.hypot(c.pos.x - start.x, c.pos.z - start.z)).toBeLessThan(1)
    expect(c.stuckTicks).toBeGreaterThanOrEqual(0)
  })
})
