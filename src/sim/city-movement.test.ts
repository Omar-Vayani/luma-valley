import { describe, expect, it } from 'vitest'
import { Game } from './game'
import { World } from './world'

describe('grounded city movement', () => {
  it('keeps ordinary citizen travel at a readable walking pace', () => {
    const game = new Game(410)
    game.spawnInitial(1)
    const citizen = game.creatures[0]
    let fastestStep = 0
    let previous = { ...citizen.pos }

    for (let i = 0; i < 60; i++) {
      game.tick()
      fastestStep = Math.max(fastestStep, Math.hypot(citizen.pos.x - previous.x, citizen.pos.z - previous.z))
      previous = { ...citizen.pos }
    }

    expect(fastestStep).toBeLessThanOrEqual(0.32)
  })

  it('restores personal space when citizens overlap', () => {
    const game = new Game(411)
    game.spawnInitial(2)
    game.creatures[0].pos = { x: 0, z: 0 }
    game.creatures[1].pos = { x: 0, z: 0 }

    game.tick()

    const [a, b] = game.creatures
    expect(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)).toBeGreaterThanOrEqual(1.15)
  })

  it('slides along a box wall instead of snapping through it', () => {
    const world = new World(12, 40)
    world.addBoxCollider(2, 0, 0.25, 4)

    const next = world.moveWithCollisions({ x: 0, z: -2 }, { x: 3, z: 3 }, 0.45)

    expect(next.x).toBeLessThanOrEqual(1.31)
    expect(next.z).toBeGreaterThan(-2)
  })

  it('leaves a real doorway traversable between wall segments', () => {
    const world = new World(13, 40)
    world.addBoxCollider(-2, 0, 1.1, 0.2)
    world.addBoxCollider(2, 0, 1.1, 0.2)

    const next = world.moveWithCollisions({ x: 0, z: -1 }, { x: 0, z: 2 }, 0.45)

    expect(next.z).toBeGreaterThan(0.5)
  })
})
