/**
 * How it feels to move and to point at things — the two bits of the game that
 * are not the simulation and are not the picture, and which were both wrong
 * in the previous build.
 */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createSim } from '../lab/sim'
import { heightAt, WATER_LEVEL } from '../world/terrain'
import { LAKE } from '../world/terrain'
import { PlayerController } from './controller'
import { CollisionGrid } from './collision'
import { pickGaze, pickTarget, promptFor, REACH } from './targeting'
import { createProgress } from './progress'

const STILL = {
  forward: 0, strafe: 0, jump: false, sprint: false, crouch: false, lookX: 0, lookY: 0,
}

function step(c: PlayerController, seconds: number, inputs = STILL): void {
  const dt = 1 / 60
  for (let i = 0; i < seconds * 60; i++) c.update(dt, inputs)
}

describe('controller — standing, walking, jumping, swimming', () => {
  it('settles onto the ground and stays there', () => {
    const c = new PlayerController(0, 20)
    step(c, 1)
    expect(c.onGround).toBe(true)
    expect(c.position.y).toBeCloseTo(heightAt(c.position.x, c.position.z), 3)
  })

  it('walks forward at a human pace', () => {
    const c = new PlayerController(0, 20)
    step(c, 0.5)
    const from = c.position.clone()
    step(c, 1, { ...STILL, forward: 1 })
    const travelled = Math.hypot(c.position.x - from.x, c.position.z - from.z)
    expect(travelled).toBeGreaterThan(3.5)
    expect(travelled).toBeLessThan(6)
  })

  it('sprints faster than it walks, and crouches slower', () => {
    const measure = (inputs: typeof STILL): number => {
      const c = new PlayerController(0, 20)
      step(c, 0.5)
      const from = c.position.clone()
      step(c, 1, inputs)
      return Math.hypot(c.position.x - from.x, c.position.z - from.z)
    }
    const walk = measure({ ...STILL, forward: 1 })
    const sprint = measure({ ...STILL, forward: 1, sprint: true })
    const crouch = measure({ ...STILL, forward: 1, crouch: true })
    expect(sprint).toBeGreaterThan(walk * 1.3)
    expect(crouch).toBeLessThan(walk * 0.7)
  })

  it('crouching lowers your eyes', () => {
    const c = new PlayerController(0, 20)
    step(c, 0.5)
    const standing = c.eye
    step(c, 0.6, { ...STILL, crouch: true })
    expect(c.eye).toBeLessThan(standing - 0.4)
  })

  it('jumps about a metre and comes back down', () => {
    const c = new PlayerController(0, 20)
    step(c, 0.5)
    const floor = c.position.y
    let peak = floor
    const dt = 1 / 60
    for (let i = 0; i < 60; i++) {
      c.update(dt, { ...STILL, jump: i < 3 })
      peak = Math.max(peak, c.position.y)
    }
    expect(peak - floor).toBeGreaterThan(0.7)
    expect(peak - floor).toBeLessThan(1.6)
    step(c, 1.5)
    expect(c.onGround).toBe(true)
  })

  it('is stopped by a building instead of walking through it', () => {
    const c = new PlayerController(0, 20)
    const grid = new CollisionGrid()
    grid.add({ x: 0, z: 14, r: 4, height: 6 })
    c.setWorld(grid)
    c.yaw = Math.PI // facing +z, toward the obstacle
    step(c, 3, { ...STILL, forward: 1 })
    expect(Math.hypot(c.position.x - 0, c.position.z - 14)).toBeGreaterThan(3.8)
  })

  it('swims rather than walking on the bottom of the lake', () => {
    const c = new PlayerController(LAKE.x, LAKE.z)
    step(c, 2)
    expect(c.swimming).toBe(true)
    expect(c.position.y).toBeGreaterThan(WATER_LEVEL - 1.2)
  })

  it('keeps your feet on the hill when you walk up one', () => {
    const c = new PlayerController(0, 150)
    step(c, 0.5)
    c.lookTowards(0, 220)
    step(c, 5, { ...STILL, forward: 1 })
    // never floating, never sunk into the ground
    expect(Math.abs(c.position.y - heightAt(c.position.x, c.position.z))).toBeLessThan(0.35)
  })

  it('turns to face a point on the ground', () => {
    const c = new PlayerController(0, 20)
    c.lookTowards(0, 0)
    const forward = c.forwardVector(new THREE.Vector3())
    expect(forward.z).toBeLessThan(-0.9)
    c.lookTowards(0, 40)
    expect(c.forwardVector(new THREE.Vector3()).z).toBeGreaterThan(0.9)
  })

  it('stays inside the valley', () => {
    const c = new PlayerController(0, 20)
    c.lookTowards(0, 9999)
    step(c, 90, { ...STILL, forward: 1, sprint: true })
    expect(Math.abs(c.position.z)).toBeLessThan(220)
  })
})

describe('targeting — the crosshair picks what you point at', () => {
  function twoNeighbours() {
    const sim = createSim(5)
    const a = sim.spawnCreature(undefined, -1.5, 24)
    const b = sim.spawnCreature(undefined, 1.5, 24)
    return { sim, a, b }
  }

  const ctx = (sim: ReturnType<typeof createSim>, eye: THREE.Vector3, dir: THREE.Vector3) => ({
    sim,
    progress: createProgress(),
    nodes: [],
    eye,
    dir,
    tick: 0,
    holding: null,
  })

  it('takes the one you are looking at, not the one that is closest', () => {
    const { sim, a, b } = twoNeighbours()
    // stand nearer to A, but look at B
    const eye = new THREE.Vector3(a.pos.x + 0.5, heightAt(a.pos.x, a.pos.z) + 1.68, a.pos.z + 1.2)
    const toB = new THREE.Vector3(b.pos.x - eye.x, heightAt(b.pos.x, b.pos.z) + 1 - eye.y, b.pos.z - eye.z)
    toB.normalize()

    const hit = pickTarget(ctx(sim, eye, toB))
    expect(hit?.kind).toBe('creature')
    expect(hit?.kind === 'creature' && hit.id).toBe(b.id)
    expect(Math.hypot(a.pos.x - eye.x, a.pos.z - eye.z))
      .toBeLessThan(Math.hypot(b.pos.x - eye.x, b.pos.z - eye.z))
  })

  it('and swaps as soon as you look the other way', () => {
    const { sim, a, b } = twoNeighbours()
    const eye = new THREE.Vector3(0, heightAt(0, 24) + 1.68, 26.5)
    const aim = (c: typeof a): THREE.Vector3 =>
      new THREE.Vector3(c.pos.x - eye.x, heightAt(c.pos.x, c.pos.z) + 1 - eye.y, c.pos.z - eye.z).normalize()

    const first = pickTarget(ctx(sim, eye, aim(a)))
    const second = pickTarget(ctx(sim, eye, aim(b)))
    expect(first?.kind === 'creature' && first.id).toBe(a.id)
    expect(second?.kind === 'creature' && second.id).toBe(b.id)
  })

  it('sees nothing when you look at the sky', () => {
    const { sim, a } = twoNeighbours()
    const eye = new THREE.Vector3(a.pos.x, heightAt(a.pos.x, a.pos.z) + 1.68, a.pos.z + 2)
    const up = new THREE.Vector3(0, 1, 0)
    expect(pickTarget(ctx(sim, eye, up))).toBeNull()
  })

  it('will not reach through a wall of distance', () => {
    const { sim, a } = twoNeighbours()
    const eye = new THREE.Vector3(a.pos.x, heightAt(a.pos.x, a.pos.z) + 1.68, a.pos.z + REACH + 6)
    const dir = new THREE.Vector3(0, 0, -1)
    const hit = pickTarget(ctx(sim, eye, dir))
    expect(hit?.kind).not.toBe('creature')
    // but you can still read their name from across the square
    expect(pickGaze(sim, eye, dir)).toBe(a.id)
  })

  it('says what pressing the key would do', () => {
    const { sim, a } = twoNeighbours()
    const eye = new THREE.Vector3(a.pos.x, heightAt(a.pos.x, a.pos.z) + 1.68, a.pos.z + 2)
    const dir = new THREE.Vector3(0, -0.25, -1).normalize()
    const hit = pickTarget(ctx(sim, eye, dir))
    expect(hit).toBeTruthy()
    expect(promptFor(hit!, null)).toContain(a.name)
  })
})
