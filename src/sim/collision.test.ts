import { describe, expect, it } from 'vitest'
import { Game } from './game'
import { Creature } from './creature'
import { mulberry32 } from './rng'

describe('collision physics', () => {
  it('player circle is pushed out of a rock collider', () => {
    const g = new Game(5)
    g.world.addCollider(10, 10, 2)
    const inside = g.world.resolveCollision({ x: 10, z: 10 }, 0.5)
    expect(Math.hypot(inside.x - 10, inside.z - 10)).toBeCloseTo(2.5, 1)
    const near = g.world.resolveCollision({ x: 11.5, z: 10 }, 0.5)
    expect(Math.hypot(near.x - 10, near.z - 10)).toBeGreaterThanOrEqual(2.5)
    // far away: untouched
    const far = g.world.resolveCollision({ x: 0, z: 0 }, 0.5)
    expect(far.x).toBe(0)
    expect(far.z).toBe(0)
  })

  it('creature cannot walk through a structure wall', () => {
    const g = new Game(6)
    g.spawnInitial(1)
    const c = g.creatures[0]
    // a ring of rock around the origin: the creature cannot enter the center
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2
      g.world.addCollider(Math.cos(ang) * 6, Math.sin(ang) * 6, 1.2)
    }
    c.pos = { x: 10, z: 0 }
    c.facing = Math.PI // heading -x into the ring
    for (let i = 0; i < 120; i++) g.tick()
    // never got through the ring into the center
    expect(Math.hypot(c.pos.x, c.pos.z)).toBeGreaterThan(4)
  })

  it('spawnInitial avoids colliders', () => {
    const g = new Game(7)
    g.world.addCollider(0, 0, 30)
    g.spawnInitial(3)
    for (const c of g.creatures) {
      expect(Math.hypot(c.pos.x, c.pos.z)).toBeGreaterThan(30)
    }
  })

  it('collides() detects overlap', () => {
    const g = new Game(8)
    g.world.addCollider(3, 3, 1)
    expect(g.world.collides({ x: 3.5, z: 3 }, 0.5)).toBe(true)
    expect(g.world.collides({ x: 10, z: 10 }, 0.5)).toBe(false)
  })

  it('structure colliders register in the world', () => {
    const g = new Game(9)
    const before = g.world.state.colliders.length
    g.world.addCollider(-10, 14, 2)
    g.world.addCollider(-10, 11, 2)
    expect(g.world.state.colliders.length).toBe(before + 2)
    void Creature
    void mulberry32
  })
})
