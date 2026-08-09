import * as THREE from 'three'
import { CITY_PLACES, type CityPlace, type CityPlaceId } from '../sim/city'
import { CITY_BUILDINGS, FILLER_BUILDINGS, buildingForPlace, doorwayPoint, wallBoxes, type BoxFootprint, type BuildingFootprint } from '../sim/city-layout'
import { collapseStaticModel } from './assets'

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const MAT = {
  sand: new THREE.MeshLambertMaterial({ color: 0x9c7b52 }),
  brick: new THREE.MeshLambertMaterial({ color: 0x68483c }),
  stone: new THREE.MeshLambertMaterial({ color: 0x55524c }),
  road: new THREE.MeshLambertMaterial({ color: 0x6f6252 }),
  plaster: new THREE.MeshLambertMaterial({ color: 0xb6aa8e }),
  timber: new THREE.MeshLambertMaterial({ color: 0x3e2d22 }),
  roof: new THREE.MeshLambertMaterial({ color: 0x29282a }),
  dark: new THREE.MeshLambertMaterial({ color: 0x17191a }),
  amber: new THREE.MeshLambertMaterial({ color: 0xe6a14a }),
  green: new THREE.MeshLambertMaterial({ color: 0x526646 }),
  water: new THREE.MeshLambertMaterial({ color: 0x5b8190 }),
  purple: new THREE.MeshLambertMaterial({ color: 0x71547d }),
  cloth: new THREE.MeshLambertMaterial({ color: 0x9e503e }),
  red: new THREE.MeshLambertMaterial({ color: 0x8c2f2a }),
}

function box(parent: THREE.Object3D, size: [number, number, number], pos: [number, number, number], material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(UNIT_BOX, material)
  mesh.scale.set(...size)
  mesh.position.set(...pos)
  mesh.castShadow = size[1] > 1
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function cylinder(parent: THREE.Object3D, radius: number, height: number, pos: [number, number, number], material: THREE.Material, segments = 10): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material)
  mesh.position.set(...pos)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function labelSprite(title: string, purpose: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 112
  const context = canvas.getContext('2d')!
  context.fillStyle = 'rgba(30,27,24,.9)'
  context.fillRect(6, 6, 500, 100)
  context.strokeStyle = '#d7bd84'
  context.lineWidth = 3
  context.strokeRect(6, 6, 500, 100)
  context.fillStyle = '#fff2d0'
  context.textAlign = 'center'
  context.font = '700 27px Georgia,serif'
  context.fillText(title, 256, 45)
  context.fillStyle = '#cfc4aa'
  context.font = '18px system-ui,sans-serif'
  context.fillText(purpose, 256, 78)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }))
  sprite.scale.set(7.2, 1.58, 1)
  sprite.renderOrder = 4
  return sprite
}

function marker(place: CityPlace, root: THREE.Group, interactions: THREE.Object3D[]): void {
  const building = buildingForPlace(place.id)
  const point = building ? doorwayPoint(building, 1.6) : place.pos
  const post = box(root, [.16, 2.1, .16], [point.x, 1.05, point.z], MAT.timber)
  const plate = box(root, [2.2, .58, .14], [point.x, 2.05, point.z], MAT.dark)
  const label = labelSprite(place.name, place.purpose)
  label.position.set(point.x, building ? building.height + 1.25 : 3.15, point.z)
  for (const object of [post, plate, label]) object.userData.placeId = place.id
  interactions.push(post, plate, label)
}

function buildBuilding(root: THREE.Group, building: BuildingFootprint): BoxFootprint[] {
  const material = MAT[building.color]
  for (const wall of wallBoxes(building)) {
    box(root, [wall.hx * 2, building.height, wall.hz * 2], [wall.x, building.height / 2, wall.z], material)
  }
  const door = doorwayPoint(building)
  const horizontal = building.entrance === 'n' || building.entrance === 's'
  box(root, horizontal ? [building.doorWidth, building.height - 2.8, .4] : [.4, building.height - 2.8, building.doorWidth], [door.x, 2.8 + (building.height - 2.8) / 2, door.z], material)
  box(root, [building.width - .7, .16, building.depth - .7], [building.x, .08, building.z], MAT.stone)
  box(root, [building.width + .5, .5, building.depth + .5], [building.x, building.height + .25, building.z], MAT.roof)

  // Chunky one-unit details make every facade and doorway readable at phone scale.
  const trimY = 1.45
  if (horizontal) {
    box(root, [.18, 2.9, .42], [door.x - building.doorWidth / 2, trimY, door.z], MAT.timber)
    box(root, [.18, 2.9, .42], [door.x + building.doorWidth / 2, trimY, door.z], MAT.timber)
    box(root, [1.05, 1.15, .12], [building.x - building.width * .28, 2.6, door.z - (building.entrance === 's' ? .22 : -.22)], MAT.amber)
    box(root, [1.05, 1.15, .12], [building.x + building.width * .28, 2.6, door.z - (building.entrance === 's' ? .22 : -.22)], MAT.amber)
  } else {
    box(root, [.42, 2.9, .18], [door.x, trimY, door.z - building.doorWidth / 2], MAT.timber)
    box(root, [.42, 2.9, .18], [door.x, trimY, door.z + building.doorWidth / 2], MAT.timber)
    box(root, [.12, 1.15, 1.05], [door.x - (building.entrance === 'e' ? .22 : -.22), 2.6, building.z - building.depth * .28], MAT.amber)
    box(root, [.12, 1.15, 1.05], [door.x - (building.entrance === 'e' ? .22 : -.22), 2.6, building.z + building.depth * .28], MAT.amber)
  }

  // A simple usable interior: table, benches, warm hearth and district colour.
  const glow: Partial<Record<CityPlaceId, THREE.Material>> = {
    tavern: MAT.amber,
    apothecary: MAT.green,
    homes: MAT.timber,
    watch: MAT.amber,
    'back-alley': MAT.purple,
    hospital: MAT.red,
    restaurant: MAT.amber,
  }
  box(root, [2.5, .18, 1.1], [building.x, 1.05, building.z], MAT.timber)
  box(root, [.18, 1, .18], [building.x - .9, .5, building.z], MAT.timber)
  box(root, [.18, 1, .18], [building.x + .9, .5, building.z], MAT.timber)
  const interiorGlow = building.placeId ? glow[building.placeId] : undefined
  box(root, [1.4, .85, .35], [building.x, .55, building.z + building.depth / 2 - .55], interiorGlow ?? MAT.amber)
  advertisePurpose(root, building)
  return wallBoxes(building)
}

/**
 * Every service building visibly advertises its purpose with chunky,
 * period-appropriate props and sign motifs — no glass, neon, or branding.
 */
function advertisePurpose(root: THREE.Group, building: BuildingFootprint): void {
  const door = doorwayPoint(building)
  const horizontal = building.entrance === 'n' || building.entrance === 's'
  // Beside-the-door anchors read at phone scale without blocking the doorway.
  const left = horizontal ? { x: building.x - 2.0, z: door.z } : { x: door.x, z: building.z - 2.0 }
  const right = horizontal ? { x: building.x + 2.0, z: door.z } : { x: door.x, z: building.z + 2.0 }
  const face = horizontal ? { x: building.x, z: door.z - (building.entrance === 's' ? 0.3 : -0.3) } : { x: door.x - (building.entrance === 'e' ? 0.3 : -0.3), z: building.z }

  switch (building.placeId) {
    case 'tavern': {
      // Barrels and a tankard sign: ale and smoke on the tap wall.
      cylinder(root, .5, .95, [left.x, .48, left.z], MAT.timber)
      cylinder(root, .52, .1, [left.x, 1.0, left.z], MAT.amber)
      cylinder(root, .09, 1.8, [right.x, .9, right.z], MAT.timber)
      box(root, [.95, .6, .14], [right.x, 1.9, right.z], MAT.dark)
      box(root, [.42, .46, .1], [right.x, 2.0, right.z], MAT.amber)
      box(root, [.2, .3, .08], [right.x + .28, 1.98, right.z], MAT.timber)
      break
    }
    case 'apothecary': {
      // Bottles and a mortar: the clinic shutter keeps medicine at hand.
      cylinder(root, .3, .85, [left.x - .3, .43, left.z], MAT.green)
      cylinder(root, .26, .7, [left.x + .3, .35, left.z], MAT.amber)
      box(root, [.26, .18, .26], [left.x - .3, .95, left.z], MAT.timber)
      box(root, [.22, .16, .22], [left.x + .3, .78, left.z], MAT.timber)
      cylinder(root, .44, .3, [right.x, .15, right.z], MAT.stone)
      cylinder(root, .07, .95, [right.x + .12, .85, right.z], MAT.timber, 6)
      break
    }
    case 'homes': {
      // Bedroll and awning: a pay-bed alcove under the eaves.
      box(root, [building.doorWidth + .9, .12, .75], [face.x, 3.05, face.z], MAT.cloth)
      box(root, [1.05, .3, .5], [right.x, .35, right.z], MAT.timber)
      box(root, [.55, .26, .26], [right.x + .2, .4, right.z], MAT.cloth)
      break
    }
    case 'watch': {
      // Scales and coins: the weigh-house exchange advertises itself.
      cylinder(root, .09, 1.5, [face.x, .75, face.z], MAT.timber)
      box(root, [1.5, .12, .12], [face.x, 1.5, face.z], MAT.timber)
      box(root, [.42, .1, .42], [face.x - .75, 1.32, face.z], MAT.amber)
      box(root, [.42, .1, .42], [face.x + .75, 1.32, face.z], MAT.amber)
      for (let i = 0; i < 3; i++) cylinder(root, .22, .12, [left.x, .14 + i * .24, left.z], MAT.amber, 8)
      break
    }
    case 'back-alley': {
      // A dark hatch and a small purple vial: substances, no sign of authority.
      box(root, [.85, 1.15, .14], [right.x, .72, right.z], MAT.dark)
      box(root, [.95, .16, .18], [right.x, 1.4, right.z], MAT.purple)
      cylinder(root, .14, .5, [right.x - .4, .25, right.z + .15], MAT.purple, 6)
      break
    }
    case 'hospital': {
      // Remedy cabinet and a carved red cross on the clinic wall.
      box(root, [.85, 1.7, .5], [left.x, .85, left.z], MAT.timber)
      box(root, [.62, 1.4, .55], [left.x + .06, .9, left.z + .06], MAT.dark)
      box(root, [.34, 1.15, .12], [face.x, 3.4, face.z], MAT.red)
      box(root, [1.15, .34, .12], [face.x, 3.4, face.z], MAT.red)
      break
    }
    case 'restaurant': {
      // Bread oven with loaves and a roof chimney: meals, not groceries.
      box(root, [1.5, 1.1, 1.1], [left.x, .55, left.z], MAT.stone)
      box(root, [1.05, .85, 1.14], [left.x, .42, left.z + .12], MAT.dark)
      for (const ox of [-.4, 0, .4]) box(root, [.42, .3, .42], [left.x + ox, 1.28, left.z], MAT.amber)
      box(root, [.7, 1.7, .7], [building.x + building.width * .32, building.height + .85, building.z - building.depth * .34], MAT.dark)
      break
    }
    default:
      break
  }
}

function stall(root: THREE.Group, x: number, z: number, cloth: THREE.Material): void {
  box(root, [3.2, .2, 2.2], [x, 2.35, z], cloth)
  box(root, [3, .18, 1.6], [x, .9, z], MAT.timber)
  for (const sx of [-1.35, 1.35]) box(root, [.14, 2.3, .14], [x + sx, 1.15, z], MAT.timber)
  for (const ox of [-.8, 0, .8]) box(root, [.48, .42, .48], [x + ox, 1.2, z], ox === 0 ? MAT.amber : MAT.green)
}

function tree(root: THREE.Group, x: number, z: number): void {
  box(root, [.42, 2.5, .42], [x, 1.25, z], MAT.timber)
  const crown = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.2, 6), MAT.green)
  crown.position.set(x, 3.45, z)
  crown.castShadow = true
  root.add(crown)
}

function streetLife(root: THREE.Group): void {
  // Dense but deliberate props: market stalls, park, carts, crates, wells and lamps.
  stall(root, -33, 18, MAT.cloth)
  stall(root, -28, 18, MAT.green)
  stall(root, -23, 18, MAT.amber)
  // A welcoming first street: stalls frame the arriving creatures without blocking them.
  stall(root, -9, -27, MAT.cloth)
  stall(root, 9, -27, MAT.green)
  stall(root, -11, -14, MAT.amber)
  stall(root, 11, -14, MAT.cloth)
  box(root, [3.8, .4, 2], [-28, .35, 12.5], MAT.timber)
  for (const x of [-29.4, -26.6]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.72, .72, .22, 12), MAT.dark)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(x, .72, 11.45)
    root.add(wheel)
  }

  for (const [x, z] of [[-7, -29], [7, -29], [-7, -22], [7, -22]] as const) tree(root, x, z)
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.7, .65, 12), MAT.stone)
  fountain.position.set(0, .33, -28)
  root.add(fountain)
  const water = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, .08, 18), MAT.water)
  water.position.set(0, .7, -28)
  root.add(water)

  for (const [x, z, r] of [[-12, 7, 0], [12, 7, Math.PI], [-12, -9, 0], [12, -9, Math.PI]] as const) {
    const bench = new THREE.Group()
    box(bench, [2.6, .22, .7], [0, .65, 0], MAT.timber)
    box(bench, [2.6, .9, .18], [0, 1.1, .3], MAT.timber)
    bench.position.set(x, 0, z)
    bench.rotation.y = r
    root.add(bench)
  }

  for (const [x, z] of [[-17, 5], [17, 5], [-17, -14], [17, -14], [-17, 27], [17, 27], [0, 15]] as const) {
    box(root, [.16, 3.4, .16], [x, 1.7, z], MAT.timber)
    box(root, [.52, .52, .52], [x, 3.35, z], MAT.amber)
  }

  for (const [x, z] of [[-21, 9], [-18.8, 9], [22, 17], [24, 17], [-43, -11], [39, -11]] as const) {
    box(root, [1.25, 1.05, 1.25], [x, .53, z], MAT.timber)
  }

  // Layered stone pavers, curb blocks and a street arch break up the broad ground plane.
  for (let z = -50, i = 0; z <= 18; z += 4, i++) {
    box(root, [4.4, .06, 2.65], [i % 2 === 0 ? -2.3 : 2.3, .035, z], i % 3 === 0 ? MAT.stone : MAT.road)
    box(root, [.42, .25, 2.2], [-5.35, .13, z], MAT.stone)
    box(root, [.42, .25, 2.2], [5.35, .13, z], MAT.stone)
  }
  // East medical lane and south kitchen lane read as real roads off the
  // arrival street, so hospital and restaurant sit on the city grid.
  for (const [x, z] of [[40, -18], [40, -24], [40, -30], [8, -38], [16, -37.5], [24, -38]] as const) {
    box(root, [3.4, .06, 2.4], [x, .035, z], MAT.stone)
  }
  box(root, [.65, 4.8, .65], [-6.2, 2.4, -37], MAT.timber)
  box(root, [.65, 4.8, .65], [6.2, 2.4, -37], MAT.timber)
  box(root, [13, .55, .65], [0, 4.65, -37], MAT.timber)
  for (const x of [-4, 0, 4]) {
    const banner = box(root, [2.3, .8, .08], [x, 4.05, -36.62], x === 0 ? MAT.amber : MAT.cloth)
    banner.rotation.z = x === 0 ? 0 : x < 0 ? -.08 : .08
  }
}

export interface CityBuild {
  group: THREE.Group
  interactionMeshes: THREE.Object3D[]
  colliders: BoxFootprint[]
}

export function buildCityStructures(): CityBuild {
  const staticRoot = new THREE.Group()
  const interactionRoot = new THREE.Group()
  const interactions: THREE.Object3D[] = []
  const colliders: BoxFootprint[] = []

  for (const building of [...CITY_BUILDINGS, ...FILLER_BUILDINGS]) colliders.push(...buildBuilding(staticRoot, building))
  streetLife(staticRoot)
  for (const place of CITY_PLACES) marker(place, interactionRoot, interactions)

  const group = new THREE.Group()
  group.add(collapseStaticModel(staticRoot), interactionRoot)
  return { group, interactionMeshes: interactions, colliders }
}

export function cityPlaceById(id: string): CityPlace | undefined {
  return CITY_PLACES.find((place) => place.id === id)
}

/** Sign-motif token used to draw and verify each building's purpose props. */
export function purposeMotif(placeId: CityPlaceId): string {
  switch (placeId) {
    case 'market': return 'vending-stalls'
    case 'tavern': return 'barrel-tankard'
    case 'park': return 'fountain-trees'
    case 'apothecary': return 'shutters-bottle'
    case 'homes': return 'bedroll-awning'
    case 'watch': return 'scales-coins'
    case 'back-alley': return 'substance-hatch'
    case 'hospital': return 'remedy-cabinet-cross'
    case 'restaurant': return 'bread-oven'
    default: return ''
  }
}

export function cityPlaceName(id: CityPlaceId): string {
  return cityPlaceById(id)?.name ?? id
}
