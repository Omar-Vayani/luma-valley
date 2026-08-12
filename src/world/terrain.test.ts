import { describe, expect, it } from 'vitest'
import {
  LAKE, RIVER, ROADS, TERRAIN_HALF, WATER_LEVEL,
  clampToTerrain, distToRoad, heightAt, isUnderwater, plazaStrength, regionAt,
  roadStrength, slopeAt, surfaceAt,
} from './terrain'
import { LANDMARKS } from './lore'
import { TOWERS } from '../lab/world'

describe('terrain — one valley, the same every time', () => {
  it('is deterministic', () => {
    for (const [x, z] of [[0, 0], [37.5, -82.25], [-140, 96], [200, -200]]) {
      expect(heightAt(x, z)).toBe(heightAt(x, z))
    }
  })

  it('gives the settlement flat, dry ground to stand on', () => {
    for (const t of TOWERS) {
      const h = heightAt(t.x, t.z)
      expect(h, `${t.label} is underwater`).toBeGreaterThan(WATER_LEVEL + 0.5)
      expect(h, `${t.label} is up a mountain`).toBeLessThan(12)
      expect(slopeAt(t.x, t.z), `${t.label} is on a slope`).toBeLessThan(0.3)
    }
  })

  it('keeps the plaza level and paved', () => {
    expect(plazaStrength(0, 0)).toBeCloseTo(1, 1)
    expect(plazaStrength(40, 0)).toBe(0)
    expect(surfaceAt(0, 0)).toBe('road')
    // level enough that the well does not sit in a dip
    const centre = heightAt(0, 0)
    for (const [x, z] of [[6, 0], [0, 6], [-6, 0], [0, -6]]) {
      expect(Math.abs(heightAt(x, z) - centre)).toBeLessThan(0.7)
    }
  })

  it('runs roads across walkable ground rather than cutting through mountains', () => {
    for (const road of ROADS) {
      for (const p of road) {
        expect(roadStrength(p.x, p.z)).toBeGreaterThan(0.8)
        // a road that needed a hundred-metre cutting is a road in the wrong place
        expect(slopeAt(p.x, p.z), `road point ${p.x},${p.z} is a cliff`).toBeLessThan(0.62)
      }
    }
  })

  it('puts water where the map says there is water, and nowhere near the village', () => {
    expect(isUnderwater(LAKE.x, LAKE.z)).toBe(true)
    for (const p of RIVER.slice(2, -1)) {
      expect(isUnderwater(p.x, p.z), `the Coldrun is dry at ${p.x},${p.z}`).toBe(true)
    }
    // the settlement's own ground, where creatures roam, stays dry
    for (let x = -88; x <= 88; x += 8) {
      for (let z = -88; z <= 88; z += 8) {
        expect(isUnderwater(x, z), `flooded at ${x},${z}`).toBe(false)
      }
    }
  })

  it('gives every landmark level footing', () => {
    for (const l of LANDMARKS) {
      if (l.kind === 'wreck') continue // this one is meant to be in the shallows
      expect(slopeAt(l.x, l.z), `${l.name} is on a slope`).toBeLessThan(0.36)
    }
  })

  it('closes the valley with mountains instead of an edge', () => {
    for (const [x, z] of [[0, -210], [210, 0], [-210, 0], [0, 210]]) {
      expect(heightAt(x, z)).toBeGreaterThan(40)
    }
    expect(heightAt(0, 0)).toBeLessThan(6)
  })

  it('names the places you walk through', () => {
    expect(regionAt(0, 0)?.id).toBe('plaza')
    expect(regionAt(LAKE.x, LAKE.z)?.id).toBe('lake')
    expect(regionAt(0, 0)?.name).toBe('Haven Plaza')
  })

  it('keeps you inside the world', () => {
    expect(clampToTerrain(9999)).toBeLessThan(TERRAIN_HALF)
    expect(clampToTerrain(-9999)).toBeGreaterThan(-TERRAIN_HALF)
  })

  it('measures distance to the nearest road', () => {
    expect(distToRoad(0, 0)).toBeLessThan(1)
    expect(distToRoad(-60, 60)).toBeGreaterThan(8)
  })

  it('describes the ground it draws', () => {
    // walk in from the lake until the ground comes up out of the water
    let shore = LAKE.x - LAKE.r - 12
    while (heightAt(shore, LAKE.z) > WATER_LEVEL + 1.3 && shore < LAKE.x) shore += 0.5
    expect(surfaceAt(shore, LAKE.z)).toBe('sand')
    expect(surfaceAt(-30, 52)).toBe('meadow')
    expect(surfaceAt(-86, 18)).toBe('farm')
  })
})
