import { describe, expect, it } from 'vitest'
import { CITY_BUILDINGS, CITY_DOOR_WIDTH, FILLER_BUILDINGS, avoidCityObstacles, buildingNavigationPoint, doorwayPoint, wallBoxes } from './city-layout'
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
