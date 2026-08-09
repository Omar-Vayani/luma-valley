import * as THREE from 'three'
import type { World } from '../sim/world'
import { CITY_WALL_BOUND } from '../sim/city-layout'

export interface World3D {
  group: THREE.Group
  sky: THREE.Mesh
  sun: THREE.DirectionalLight
  ambient: THREE.HemisphereLight
  plants: THREE.Group
  stream: THREE.Group
  shimmer: (time: number) => void
  update: (dayTime: number) => void
}

const DAY = new THREE.Color('#79766e')
const DUSK = new THREE.Color('#6e5141')
const NIGHT = new THREE.Color('#171b1d')

/** The old city is deliberately level: one collision/rendering plane everywhere. */
export function terrainY(_world: World, _x: number, _z: number): number {
  return 0
}

function addWall(group: THREE.Group, x: number, z: number, sx: number, sz: number, material: THREE.Material): void {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 4.8, sz), material)
  wall.position.set(x, 2.4, z)
  wall.castShadow = true
  wall.receiveShadow = true
  group.add(wall)
}

export function buildWorld3D(world: World): World3D {
  const group = new THREE.Group()
  const stone = new THREE.MeshLambertMaterial({ color: '#514d45' })
  const paving = new THREE.MeshLambertMaterial({ color: '#58564f' })
  const road = new THREE.MeshLambertMaterial({ color: '#747067' })

  const groundGeometry = new THREE.PlaneGeometry(world.state.size * 2, world.state.size * 2)
  groundGeometry.rotateX(-Math.PI / 2)
  const ground = new THREE.Mesh(groundGeometry, stone)
  ground.receiveShadow = true
  group.add(ground)

  const plaza = new THREE.Mesh(new THREE.CircleGeometry(17, 40), paving)
  plaza.rotation.x = -Math.PI / 2
  plaza.position.y = 0.018
  plaza.receiveShadow = true
  group.add(plaza)
  // A block-readable street grid: broad avenues, narrow alleys, and district spurs.
  for (const [sx, sz, x, z] of [
    [9, 138, 0, 0], [138, 9, 0, 0],
    [7, 82, -32, -6], [7, 76, 32, -2],
    [52, 6, -28, 18], [48, 6, 28, 26],
    [42, 6, -28, -28], [42, 6, 28, -28],
    [28, 5, -49, -4],
  ] as const) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), road)
    strip.rotation.x = -Math.PI / 2
    strip.position.set(x, 0.025, z)
    strip.receiveShadow = true
    group.add(strip)
  }

  // The wall is the real playable boundary. Gatehouses are closed landmarks rather than exits into void.
  for (const [x, z, sx, sz] of [
    [0, -CITY_WALL_BOUND, CITY_WALL_BOUND * 2, 2], [0, CITY_WALL_BOUND, CITY_WALL_BOUND * 2, 2],
    [-CITY_WALL_BOUND, 0, 2, CITY_WALL_BOUND * 2], [CITY_WALL_BOUND, 0, 2, CITY_WALL_BOUND * 2],
  ] as const) addWall(group, x, z, sx, sz, stone)
  for (const [x, z, horizontal] of [[0, -CITY_WALL_BOUND, true], [0, CITY_WALL_BOUND, true], [-CITY_WALL_BOUND, 0, false], [CITY_WALL_BOUND, 0, false]] as const) {
    if (horizontal) {
      addWall(group, x - 5, z, 2, 2, stone); addWall(group, x + 5, z, 2, 2, stone)
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(12, 1.5, 2), stone); lintel.position.set(x, 5.25, z); lintel.castShadow = true; group.add(lintel)
    } else {
      addWall(group, x, z - 5, 2, 2, stone); addWall(group, x, z + 5, 2, 2, stone)
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 12), stone); lintel.position.set(x, 5.25, z); lintel.castShadow = true; group.add(lintel)
    }
  }
  const towerGeo = new THREE.CylinderGeometry(3, 3.6, 7, 8)
  for (const [x, z] of [[-CITY_WALL_BOUND, -CITY_WALL_BOUND], [CITY_WALL_BOUND, -CITY_WALL_BOUND], [-CITY_WALL_BOUND, CITY_WALL_BOUND], [CITY_WALL_BOUND, CITY_WALL_BOUND]] as const) {
    const tower = new THREE.Mesh(towerGeo, stone)
    tower.position.set(x, 3.5, z)
    tower.castShadow = true
    tower.receiveShadow = true
    group.add(tower)
  }

  const plants = new THREE.Group()
  const stream = new THREE.Group()
  group.add(plants, stream)
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 20, 12), new THREE.MeshBasicMaterial({ color: DAY, side: THREE.BackSide, fog: false }))
  group.add(sky)
  const ambient = new THREE.HemisphereLight(0xa5a49b, 0x252c27, 1.1)
  const sun = new THREE.DirectionalLight(0xffc77a, 1.45)
  sun.position.set(34, 48, 18)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -72, right: 72, top: 72, bottom: -72, near: 1, far: 150 })
  group.add(ambient, sun)

  return {
    group, sky, sun, ambient, plants, stream,
    shimmer: () => undefined,
    update(dayTime: number) {
      const angle = (dayTime - 0.25) * Math.PI * 2
      const height = Math.sin(angle)
      const darkness = THREE.MathUtils.clamp(0.25 - height, 0, 1)
      const dusk = THREE.MathUtils.clamp(1 - Math.abs(height) * 4, 0, 1)
      ;(sky.material as THREE.MeshBasicMaterial).color.copy(DAY).lerp(DUSK, dusk * 0.65).lerp(NIGHT, darkness * 0.82)
      sun.position.set(Math.cos(angle) * 52, Math.max(7, height * 52), Math.sin(angle) * 32)
      sun.intensity = THREE.MathUtils.lerp(1.45, 0.25, darkness)
      ambient.intensity = THREE.MathUtils.lerp(1.1, 0.48, darkness)
    },
  }
}

/** Retained for the existing renderer contract; city rendering has no berry bushes. */
export function updatePlantBush(_group: THREE.Group, _plantId: number, _berries: number, _pos: { x: number; z: number }, _height: number): void {}
