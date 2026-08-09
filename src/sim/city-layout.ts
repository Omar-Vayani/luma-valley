import type { CityPlaceId } from './city'

export const CITY_WORLD_SIZE = 96
export const CITY_WALL_BOUND = 70
export const CITY_DOOR_WIDTH = 2.8

export type EntranceSide = 'n' | 's' | 'e' | 'w'

export interface BuildingFootprint {
  id: string
  placeId?: CityPlaceId
  x: number
  z: number
  width: number
  depth: number
  height: number
  entrance: EntranceSide
  doorWidth: number
  color: 'sand' | 'brick' | 'stone' | 'plaster'
}

export interface BoxFootprint {
  x: number
  z: number
  hx: number
  hz: number
}

export const CITY_BUILDINGS: BuildingFootprint[] = [
  { id: 'tavern', placeId: 'tavern', x: -32, z: -28, width: 11, depth: 9, height: 5.8, entrance: 's', doorWidth: CITY_DOOR_WIDTH, color: 'brick' },
  { id: 'apothecary', placeId: 'apothecary', x: 32, z: -28, width: 10, depth: 8, height: 5.4, entrance: 's', doorWidth: CITY_DOOR_WIDTH, color: 'plaster' },
  { id: 'lantern-home', placeId: 'homes', x: 32, z: 26, width: 10, depth: 8, height: 5.2, entrance: 's', doorWidth: CITY_DOOR_WIDTH, color: 'sand' },
  { id: 'watch-hall', placeId: 'watch', x: 0, z: 34, width: 11, depth: 8, height: 6.4, entrance: 's', doorWidth: CITY_DOOR_WIDTH, color: 'stone' },
  { id: 'moth-den', placeId: 'back-alley', x: -50, z: -4, width: 8, depth: 7, height: 4.8, entrance: 'e', doorWidth: CITY_DOOR_WIDTH, color: 'stone' },
]

export const FILLER_BUILDINGS: BuildingFootprint[] = [
  { id: 'row-s1', x: -17, z: -32, width: 10, depth: 8, height: 5.4, entrance: 'n', doorWidth: CITY_DOOR_WIDTH, color: 'sand' },
  { id: 'row-s2', x: 17, z: -32, width: 10, depth: 8, height: 5.8, entrance: 'n', doorWidth: CITY_DOOR_WIDTH, color: 'brick' },
  { id: 'row-mid1', x: -17, z: -9, width: 10, depth: 8, height: 5.1, entrance: 's', doorWidth: CITY_DOOR_WIDTH, color: 'plaster' },
  { id: 'row-mid2', x: 17, z: -9, width: 10, depth: 8, height: 5.5, entrance: 's', doorWidth: CITY_DOOR_WIDTH, color: 'sand' },
  { id: 'row-n1', x: -16, z: 12, width: 9, depth: 8, height: 5.6, entrance: 's', doorWidth: CITY_DOOR_WIDTH, color: 'brick' },
  { id: 'row-n2', x: 16, z: 12, width: 9, depth: 8, height: 5.2, entrance: 's', doorWidth: CITY_DOOR_WIDTH, color: 'plaster' },
  { id: 'north-row-a', x: -45, z: 30, width: 9, depth: 8, height: 5.1, entrance: 's', doorWidth: CITY_DOOR_WIDTH, color: 'sand' },
  { id: 'north-row-b', x: -33, z: 35, width: 9, depth: 8, height: 6.2, entrance: 's', doorWidth: CITY_DOOR_WIDTH, color: 'brick' },
  { id: 'north-row-c', x: 45, z: 34, width: 9, depth: 8, height: 5.5, entrance: 's', doorWidth: CITY_DOOR_WIDTH, color: 'plaster' },
  { id: 'south-row-a', x: -47, z: -36, width: 9, depth: 8, height: 5.4, entrance: 'n', doorWidth: CITY_DOOR_WIDTH, color: 'stone' },
  { id: 'south-row-b', x: -16, z: -42, width: 10, depth: 8, height: 5.8, entrance: 'n', doorWidth: CITY_DOOR_WIDTH, color: 'sand' },
  { id: 'south-row-c', x: 16, z: -42, width: 10, depth: 8, height: 5.2, entrance: 'n', doorWidth: CITY_DOOR_WIDTH, color: 'brick' },
  { id: 'south-row-d', x: 47, z: -36, width: 9, depth: 8, height: 6, entrance: 'n', doorWidth: CITY_DOOR_WIDTH, color: 'plaster' },
  { id: 'east-row-a', x: 50, z: -16, width: 8, depth: 9, height: 5.4, entrance: 'w', doorWidth: CITY_DOOR_WIDTH, color: 'sand' },
  { id: 'east-row-b', x: 50, z: 10, width: 8, depth: 9, height: 5.8, entrance: 'w', doorWidth: CITY_DOOR_WIDTH, color: 'brick' },
]

export function wallBoxes(building: BuildingFootprint, thickness = 0.38): BoxFootprint[] {
  const { x, z, width: w, depth: d, entrance, doorWidth } = building
  const boxes: BoxFootprint[] = []
  const side = (length: number, alongX: boolean, coordinate: number): void => {
    if (alongX) boxes.push({ x, z: coordinate, hx: length / 2, hz: thickness / 2 })
    else boxes.push({ x: coordinate, z, hx: thickness / 2, hz: length / 2 })
  }
  if (entrance !== 'n') side(w, true, z + d / 2)
  if (entrance !== 's') side(w, true, z - d / 2)
  if (entrance !== 'e') side(d, false, x + w / 2)
  if (entrance !== 'w') side(d, false, x - w / 2)

  const horizontalDoor = entrance === 'n' || entrance === 's'
  const span = (horizontalDoor ? w : d) - doorWidth
  const segment = span / 2
  const offset = doorWidth / 2 + segment / 2
  if (horizontalDoor) {
    const doorZ = z + (entrance === 'n' ? d / 2 : -d / 2)
    boxes.push({ x: x - offset, z: doorZ, hx: segment / 2, hz: thickness / 2 })
    boxes.push({ x: x + offset, z: doorZ, hx: segment / 2, hz: thickness / 2 })
  } else {
    const doorX = x + (entrance === 'e' ? w / 2 : -w / 2)
    boxes.push({ x: doorX, z: z - offset, hx: thickness / 2, hz: segment / 2 })
    boxes.push({ x: doorX, z: z + offset, hx: thickness / 2, hz: segment / 2 })
  }
  return boxes
}

export function doorwayPoint(building: BuildingFootprint, offset = 0): { x: number; z: number } {
  if (building.entrance === 'n') return { x: building.x, z: building.z + building.depth / 2 + offset }
  if (building.entrance === 's') return { x: building.x, z: building.z - building.depth / 2 - offset }
  if (building.entrance === 'e') return { x: building.x + building.width / 2 + offset, z: building.z }
  return { x: building.x - building.width / 2 - offset, z: building.z }
}

export function avoidCityObstacles(pos: { x: number; z: number }, target: { x: number; z: number }, ignoreBuildingId?: string): { x: number; z: number } {
  const buildings = [...CITY_BUILDINGS, ...FILLER_BUILDINGS].filter((building) => building.id !== ignoreBuildingId)
  const containing = buildings.find((building) => Math.abs(pos.x - building.x) < building.width / 2 - .45
    && Math.abs(pos.z - building.z) < building.depth / 2 - .45)
  if (containing) return doorwayPoint(containing, 1.1)

  const crosses = (a: { x: number; z: number }, b: { x: number; z: number }, building: BuildingFootprint, margin: number): boolean => {
    for (let step = 1; step < 48; step++) {
      const t = step / 48
      const x = a.x + (b.x - a.x) * t
      const z = a.z + (b.z - a.z) * t
      if (Math.abs(x - building.x) < building.width / 2 + margin
        && Math.abs(z - building.z) < building.depth / 2 + margin) return true
    }
    return false
  }

  const blocker = buildings
    .filter((building) => crosses(pos, target, building, .55))
    .sort((a, b) => Math.hypot(pos.x - a.x, pos.z - a.z) - Math.hypot(pos.x - b.x, pos.z - b.z))[0]
  if (!blocker) return target

  const margin = 2.2
  const corners = [
    { x: blocker.x - blocker.width / 2 - margin, z: blocker.z - blocker.depth / 2 - margin },
    { x: blocker.x - blocker.width / 2 - margin, z: blocker.z + blocker.depth / 2 + margin },
    { x: blocker.x + blocker.width / 2 + margin, z: blocker.z - blocker.depth / 2 - margin },
    { x: blocker.x + blocker.width / 2 + margin, z: blocker.z + blocker.depth / 2 + margin },
  ]
  const visible = corners.filter((corner) => !crosses(pos, corner, blocker, .55))
  const throughCorners = visible.filter((corner) => !crosses(corner, target, blocker, .55))
  const candidates = throughCorners.length > 0 ? throughCorners : visible.length > 0 ? visible : corners
  return candidates.sort((a, b) => {
    const score = (corner: { x: number; z: number }): number => Math.hypot(pos.x - corner.x, pos.z - corner.z) + Math.hypot(target.x - corner.x, target.z - corner.z)
    return score(a) - score(b)
  })[0]
}

export function buildingNavigationPoint(building: BuildingFootprint, pos: { x: number; z: number }, clearance = 1.1): { x: number; z: number } {
  const inside = Math.abs(pos.x - building.x) < building.width / 2 - 0.45
    && Math.abs(pos.z - building.z) < building.depth / 2 - 0.45
  if (inside) return { x: building.x, z: building.z }

  const outsideDoor = doorwayPoint(building, clearance)
  if (Math.hypot(pos.x - outsideDoor.x, pos.z - outsideDoor.z) <= 1.25) {
    return doorwayPoint(building, -clearance)
  }

  const west = building.x - building.width / 2 - clearance
  const east = building.x + building.width / 2 + clearance
  const south = building.z - building.depth / 2 - clearance
  const north = building.z + building.depth / 2 + clearance

  if (building.entrance === 's') {
    if (pos.z <= south) return outsideDoor
    const sideX = pos.x < building.x ? west : east
    return Math.abs(pos.x - building.x) < building.width / 2 + clearance * 0.7
      ? { x: sideX, z: Math.max(pos.z, north) }
      : { x: sideX, z: south }
  }
  if (building.entrance === 'n') {
    if (pos.z >= north) return outsideDoor
    const sideX = pos.x < building.x ? west : east
    return Math.abs(pos.x - building.x) < building.width / 2 + clearance * 0.7
      ? { x: sideX, z: Math.min(pos.z, south) }
      : { x: sideX, z: north }
  }
  if (building.entrance === 'e') {
    if (pos.x >= east) return outsideDoor
    const sideZ = pos.z < building.z ? south : north
    return Math.abs(pos.z - building.z) < building.depth / 2 + clearance * 0.7
      ? { x: Math.min(pos.x, west), z: sideZ }
      : { x: east, z: sideZ }
  }
  if (pos.x <= west) return outsideDoor
  const sideZ = pos.z < building.z ? south : north
  return Math.abs(pos.z - building.z) < building.depth / 2 + clearance * 0.7
    ? { x: Math.max(pos.x, east), z: sideZ }
    : { x: west, z: sideZ }
}

export function buildingForPlace(placeId: CityPlaceId): BuildingFootprint | undefined {
  return CITY_BUILDINGS.find((building) => building.placeId === placeId)
}
