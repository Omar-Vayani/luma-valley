import { describe, expect, it } from 'vitest'
import { CollisionGrid, box, circle } from './collision'
import {
  DOOR_WIDTH, buildVillage, buildingSolids, doorInside, doorOutside, furnitureOf, isInside,
} from './village'
import { heightAt, isWalkable } from './terrain'

const village = buildVillage()

describe('buildings', () => {
  it('gives every building a door of exactly one width', () => {
    for (const b of village.buildings) {
      // the front wall is two cheeks either side of the doorway; the gap
      // between them is the door, and it must be the same everywhere
      const solids = buildingSolids(b)
      expect(solids.length).toBe(5)
      const cheek = (b.width - DOOR_WIDTH) / 2
      expect(cheek).toBeGreaterThan(1)
      expect(DOOR_WIDTH).toBeCloseTo(1.2, 5)
    }
  })

  it('never builds a wall wider than the building it belongs to', () => {
    for (const b of village.buildings) {
      for (const s of buildingSolids(b)) {
        expect(s.shape).toBe('box')
        if (s.shape !== 'box') continue
        expect(s.hw * 2).toBeLessThanOrEqual(b.width + 0.01)
        expect(s.hd * 2).toBeLessThanOrEqual(b.depth + 0.01)
      }
    }
  })

  it('faces every door towards the green', () => {
    for (const b of village.buildings) {
      const out = doorOutside(b)
      const inn = doorInside(b)
      // the outside step is nearer the middle of the green than the inside one
      expect(Math.hypot(out.x, out.z)).toBeLessThan(Math.hypot(inn.x, inn.z))
      expect(isInside(b, inn.x, inn.z)).toBe(true)
      expect(isInside(b, out.x, out.z)).toBe(false)
    }
  })

  it('keeps the buildings apart', () => {
    for (let i = 0; i < village.buildings.length; i++) {
      for (let j = i + 1; j < village.buildings.length; j++) {
        const a = village.buildings[i]
        const b = village.buildings[j]
        const gap = Math.hypot(a.x - b.x, a.z - b.z)
        const spans = Math.hypot(a.width, a.depth) / 2 + Math.hypot(b.width, b.depth) / 2
        expect(gap).toBeGreaterThan(spans)
      }
    }
  })

  it('stands every building on ground that is actually level', () => {
    for (const b of village.buildings) {
      const corners = [
        [b.width / 2, b.depth / 2], [-b.width / 2, b.depth / 2],
        [b.width / 2, -b.depth / 2], [-b.width / 2, -b.depth / 2],
      ]
      for (const [lx, lz] of corners) {
        const x = b.x + lx * Math.cos(b.rot) + lz * Math.sin(b.rot)
        const z = b.z - lx * Math.sin(b.rot) + lz * Math.cos(b.rot)
        // no corner may hang more than a footing's depth off the ground
        expect(Math.abs(heightAt(x, z) - b.floorY)).toBeLessThan(0.35)
      }
    }
  })

  it('puts the furniture inside the walls', () => {
    for (const b of village.buildings) {
      for (const f of furnitureOf(b)) {
        expect(isInside(b, f.x, f.z)).toBe(true)
      }
    }
  })

  it('leaves the doorway walkable', () => {
    const grid = new CollisionGrid(120)
    grid.addAll(village.solids)
    for (const b of village.buildings) {
      const inn = doorInside(b)
      const out = doorOutside(b)
      // a person 0.42 m across has to be able to walk in through the door
      expect(grid.lineClear(out.x, out.z, inn.x, inn.z, 0.4)).toBe(true)
    }
  })

  it('does not leave a gap in any other wall', () => {
    const grid = new CollisionGrid(120)
    grid.addAll(village.solids)
    for (const b of village.buildings) {
      // walking at the back wall from outside must not get you in
      const backX = b.x - Math.sin(b.rot) * (b.depth / 2 + 1.2)
      const backZ = b.z - Math.cos(b.rot) * (b.depth / 2 + 1.2)
      expect(grid.lineClear(backX, backZ, b.x, b.z, 0.4)).toBe(false)
    }
  })
})

describe('the village as a whole', () => {
  it('gives everything somewhere solid to stand on', () => {
    for (const d of village.dressing) {
      expect(isWalkable(d.x, d.z) || Math.hypot(d.x, d.z) < 25).toBe(true)
    }
  })

  it('has the places creatures need', () => {
    const kinds = new Set(village.places.map((p) => p.kind))
    for (const need of ['food', 'water', 'bed', 'fire', 'toy', 'shelter']) {
      expect(kinds.has(need as never)).toBe(true)
    }
  })

  it('leaves the middle of the green open to walk across', () => {
    const grid = new CollisionGrid(120)
    grid.addAll(village.solids)
    // the well is in the middle, so cross just beside it
    expect(grid.lineClear(-14, 3.5, 14, 3.5, 0.4)).toBe(true)
  })
})

describe('collision shapes', () => {
  it('pushes a body out of a circle', () => {
    const grid = new CollisionGrid(50)
    grid.add(circle(0, 0, 1, 2, 'rock'))
    const pos = { x: 0.2, z: 0 }
    expect(grid.resolve(pos, 0.4, 0)).toBe(true)
    expect(Math.hypot(pos.x, pos.z)).toBeGreaterThanOrEqual(1.39)
  })

  it('pushes a body out of a box along its shortest way out', () => {
    const grid = new CollisionGrid(50)
    grid.add(box(0, 0, 4, 0.2, 0, 3, 'wall'))
    const pos = { x: 1, z: 0.05 }
    expect(grid.resolve(pos, 0.4, 0)).toBe(true)
    // out through the face, not along the wall
    expect(Math.abs(pos.z)).toBeGreaterThanOrEqual(0.59)
    expect(pos.x).toBeCloseTo(1, 5)
  })

  it('respects a rotated box', () => {
    const grid = new CollisionGrid(50)
    grid.add(box(0, 0, 4, 0.2, Math.PI / 2, 3, 'wall'))
    const pos = { x: 0.05, z: 1 }
    expect(grid.resolve(pos, 0.4, 0)).toBe(true)
    expect(Math.abs(pos.x)).toBeGreaterThanOrEqual(0.59)
  })

  it('lets you step over something low', () => {
    const grid = new CollisionGrid(50)
    grid.add(circle(0, 0, 1, 0.5, 'kerb'))
    const pos = { x: 0.2, z: 0 }
    expect(grid.resolve(pos, 0.4, 0.8)).toBe(false)
  })

  it('settles a body squeezed between two things instead of jittering', () => {
    const grid = new CollisionGrid(50)
    grid.add(circle(-1, 0, 1, 2, 'a'))
    grid.add(circle(1, 0, 1, 2, 'b'))
    const pos = { x: 0, z: 0 }
    grid.resolve(pos, 0.3, 0)
    const first = { ...pos }
    grid.resolve(pos, 0.3, 0)
    expect(Math.hypot(pos.x - first.x, pos.z - first.z)).toBeLessThan(0.5)
  })
})
