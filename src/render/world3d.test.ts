import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { World } from '../sim/world'
import { buildWorld3D, terrainY } from './world3d'

describe('authoritative terrain height', () => {
  it('uses the same height function for every rendered terrain vertex', () => {
    const world = new World(42)
    const rendered = buildWorld3D(world)
    const terrain = rendered.group.children[0] as THREE.Mesh<THREE.BufferGeometry>
    const positions = terrain.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let index = 0; index < positions.count; index += 97) {
      expect(positions.getY(index)).toBeCloseTo(terrainY(world, positions.getX(index), positions.getZ(index)), 5)
    }
  })

  it('keeps den and stream deformation finite and continuous', () => {
    const world = new World(123456789)
    const samples = [world.state.den, ...world.state.waterPoints]
    for (const sample of samples) expect(Number.isFinite(terrainY(world, sample.x, sample.z))).toBe(true)
    for (let index = 1; index < world.state.waterPoints.length; index++) {
      const before = world.state.waterPoints[index - 1]
      const after = world.state.waterPoints[index]
      expect(Math.abs(terrainY(world, before.x, before.z) - terrainY(world, after.x, after.z))).toBeLessThan(4)
    }
  })
})
