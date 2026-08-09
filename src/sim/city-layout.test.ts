import { describe, expect, it } from 'vitest'
import { CITY_BUILDINGS, CITY_DOOR_WIDTH, CITY_WALL_BOUND, FILLER_BUILDINGS, avoidCityObstacles, buildingForPlace, buildingNavigationPoint, doorwayPoint, wallBoxes } from './city-layout'
import { World } from './world'

function worldFor(building: (typeof CITY_BUILDINGS)[number]): World {
  const world = new World(91, 100)
  for (const wall of wallBoxes(building)) world.addBoxCollider(wall.x, wall.z, wall.hx, wall.hz)
  return world
}

describe('walk-in city buildings', () => {
  it('gives every structure a comfortably wide doorway', () => {
    expect(CITY_BUILDINGS.every((building) => building.doorWidth >= CITY_DOOR_WIDTH)).toBe(true)
    expect(CITY_DOOR_WIDTH).toBeGreaterThanOrEqual(2.6)
  })

  it.each(CITY_BUILDINGS)('$id doorway crosses from outside to inside', (building) => {
    const world = worldFor(building)
    const outside = doorwayPoint(building, 2)
    const inside = doorwayPoint(building, -2)
    const next = world.moveWithCollisions(outside, { x: inside.x - outside.x, z: inside.z - outside.z }, 0.45)
    expect(Math.hypot(next.x - inside.x, next.z - inside.z)).toBeLessThan(0.25)
  })

  it.each(CITY_BUILDINGS)('$id routes citizens around solid walls and through its doorway', (building) => {
    const world = worldFor(building)
    let pos = building.entrance === 'n'
      ? { x: building.x, z: building.z - building.depth / 2 - 8 }
      : building.entrance === 's'
        ? { x: building.x, z: building.z + building.depth / 2 + 8 }
        : building.entrance === 'e'
          ? { x: building.x - building.width / 2 - 8, z: building.z }
          : { x: building.x + building.width / 2 + 8, z: building.z }
    for (let step = 0; step < 800 && Math.hypot(pos.x - building.x, pos.z - building.z) > 1.6; step++) {
      const target = buildingNavigationPoint(building, pos)
      const dx = target.x - pos.x
      const dz = target.z - pos.z
      const distance = Math.hypot(dx, dz)
      pos = world.moveWithCollisions(pos, { x: dx / distance * .22, z: dz / distance * .22 }, .5)
    }
    expect(Math.hypot(pos.x - building.x, pos.z - building.z)).toBeLessThanOrEqual(1.6)
  })

  it.each(CITY_BUILDINGS)('$id routes from the arrival street around the full city', (building) => {
    const world = new World(92, 100)
    for (const structure of [...CITY_BUILDINGS, ...FILLER_BUILDINGS]) {
      for (const wall of wallBoxes(structure)) world.addBoxCollider(wall.x, wall.z, wall.hx, wall.hz)
    }
    let pos = { x: 0, z: -14 }
    for (let step = 0; step < 2400 && Math.hypot(pos.x - building.x, pos.z - building.z) > 1.6; step++) {
      const buildingTarget = buildingNavigationPoint(building, pos)
      const target = avoidCityObstacles(pos, buildingTarget, building.id)
      const dx = target.x - pos.x
      const dz = target.z - pos.z
      const distance = Math.hypot(dx, dz)
      if (distance < .001) break
      pos = world.moveWithCollisions(pos, { x: dx / distance * .22, z: dz / distance * .22 }, .5)
    }
    expect(Math.hypot(pos.x - building.x, pos.z - building.z)).toBeLessThanOrEqual(1.6)
  })

  it.each(CITY_BUILDINGS)('$id walls remain solid', (building) => {
    const world = worldFor(building)
    const wall = wallBoxes(building)[0]
    expect(world.collides({ x: wall.x, z: wall.z }, 0.45)).toBe(true)
  })
})

describe('nomad-city service map', () => {
  const WALLED_SERVICES = ['homes', 'tavern', 'apothecary', 'watch', 'back-alley', 'hospital', 'restaurant'] as const

  it('gives every walled service a real building and open-air places none', () => {
    for (const id of WALLED_SERVICES) expect(buildingForPlace(id)).toBeDefined()
    expect(buildingForPlace('park')).toBeUndefined()
    expect(buildingForPlace('market')).toBeUndefined()
  })

  it('keeps every building inside the city wall', () => {
    for (const building of [...CITY_BUILDINGS, ...FILLER_BUILDINGS]) {
      expect(Math.abs(building.x) + building.width / 2).toBeLessThanOrEqual(CITY_WALL_BOUND)
      expect(Math.abs(building.z) + building.depth / 2).toBeLessThanOrEqual(CITY_WALL_BOUND)
    }
  })

  it('never overlaps building footprints', () => {
    const all = [...CITY_BUILDINGS, ...FILLER_BUILDINGS]
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]
        const b = all[j]
        const overlapX = Math.abs(a.x - b.x) < (a.width + b.width) / 2 - 0.01
        const overlapZ = Math.abs(a.z - b.z) < (a.depth + b.depth) / 2 - 0.01
        expect(overlapX && overlapZ).toBe(false)
      }
    }
  })

  it('leaves every service doorway open and unblocked', () => {
    const all = [...CITY_BUILDINGS, ...FILLER_BUILDINGS]
    for (const building of CITY_BUILDINGS) {
      const door = doorwayPoint(building, 0.4)
      const blocked = all.some(
        (other) =>
          other.id !== building.id &&
          Math.abs(door.x - other.x) < other.width / 2 &&
          Math.abs(door.z - other.z) < other.depth / 2,
      )
      expect(blocked).toBe(false)
    }
  })

  it('places the medical district and kitchen on readable lanes', () => {
    const apothecary = buildingForPlace('apothecary')!
    const hospital = buildingForPlace('hospital')!
    const restaurant = buildingForPlace('restaurant')!
    expect(hospital.x).toBeGreaterThan(apothecary.x)
    expect(restaurant.z).toBeLessThan(0)
    expect(restaurant.x).toBeGreaterThan(-10)
  })

  it('adds hospital and restaurant only where the arrival street still reaches every building', () => {
    const world = new World(92, 100)
    for (const structure of [...CITY_BUILDINGS, ...FILLER_BUILDINGS]) {
      for (const wall of wallBoxes(structure)) world.addBoxCollider(wall.x, wall.z, wall.hx, wall.hz)
    }
    for (const building of CITY_BUILDINGS.filter((b) => b.placeId === 'hospital' || b.placeId === 'restaurant')) {
      let pos = { x: 0, z: -14 }
      for (let step = 0; step < 2400 && Math.hypot(pos.x - building.x, pos.z - building.z) > 1.6; step++) {
        const buildingTarget = buildingNavigationPoint(building, pos)
        const target = avoidCityObstacles(pos, buildingTarget, building.id)
        const dx = target.x - pos.x
        const dz = target.z - pos.z
        const distance = Math.hypot(dx, dz)
        if (distance < 0.001) break
        pos = world.moveWithCollisions(pos, { x: (dx / distance) * 0.22, z: (dz / distance) * 0.22 }, 0.5)
      }
      expect(Math.hypot(pos.x - building.x, pos.z - building.z)).toBeLessThanOrEqual(1.6)
    }
  })
})
