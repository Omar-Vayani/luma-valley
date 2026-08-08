import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * structures — loads and places the Quaternius village house, dungeon
 * cave dressing, and graveyard corner from converted GLB/glTF assets.
 */
const loader = new GLTFLoader()

function load(url: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => loader.load(url, (g) => resolve(g.scene), undefined, reject))
}

function place(group: THREE.Group, scene: THREE.Scene, x: number, y: number, z: number, ry = 0, s = 1): void {
  const g = group.clone(true)
  g.position.set(x, y, z)
  g.rotation.y = ry
  g.scale.setScalar(s)
  scene.add(g)
}

/** Terrain ground Y at a world point (matches world3d terrain). */
export function groundY(world: { height: (x: number, z: number) => number }, x: number, z: number): number {
  return world.height(x, z) * 6 - 2.5
}

/** Build a cozy stone cottage from village modular pieces. */
export async function buildStoneHouse(scene: THREE.Scene, cx: number, cz: number, gy: (x: number, z: number) => number): Promise<void> {
  try {
    const [wall, doorWall, roof, door] = await Promise.all([
      load('models/village/Wall_Plaster_Straight.gltf'),
      load('models/village/Wall_Plaster_Door_Flat.gltf'),
      load('models/village/Roof_RoundTiles_4x6.gltf'),
      load('models/village/Door_2_Flat.gltf'),
    ])
    const y = (x: number, z: number) => gy(x, z)
    // north + south walls
    place(wall, scene, cx, y(cx, cz + 3), cz + 3, 0)
    place(wall, scene, cx + 4, y(cx + 4, cz + 3), cz + 3, 0)
    place(wall, scene, cx, y(cx, cz - 3), cz - 3, 0)
    place(wall, scene, cx + 4, y(cx + 4, cz - 3), cz - 3, 0)
    // east wall with door
    place(doorWall, scene, cx + 4.2, y(cx + 4.2, cz - 1.5), cz - 1.5, Math.PI / 2)
    // west wall
    place(wall, scene, cx - 0.2, y(cx - 0.2, cz - 1.5), cz - 1.5, Math.PI / 2)
    place(wall, scene, cx - 0.2, y(cx - 0.2, cz + 1.5), cz + 1.5, Math.PI / 2)
    // roof
    place(roof, scene, cx + 2, y(cx + 2, cz) + 2.6, cz, 0)
    place(roof, scene, cx + 2, y(cx + 2, cz) + 2.6, cz, Math.PI, 1)
    // door
    place(door, scene, cx + 4.3, y(cx + 4.3, cz - 1.5), cz - 1.5, Math.PI / 2)
  } catch (e) {
    console.warn('village house failed to load', e)
  }
}

/** Dress the cave mouth with dungeon pieces. */
export async function buildDungeonDressing(scene: THREE.Scene, caveX: number, caveZ: number, gy: (x: number, z: number) => number): Promise<void> {
  try {
    const [gate, column, chest, potion, banner] = await Promise.all([
      load('models/village/dungeon-gate.glb'),
      load('models/village/column.glb'),
      load('models/village/chest.glb'),
      load('models/village/potion.glb'),
      load('models/village/banner.glb'),
    ])
    const y = (x: number, z: number) => gy(x, z)
    place(gate, scene, caveX - 1, y(caveX - 1, caveZ), caveZ, Math.PI / 2, 1.6)
    place(column, scene, caveX + 3, y(caveX + 3, caveZ + 2), caveZ + 2, 0, 2)
    place(column, scene, caveX - 4, y(caveX - 4, caveZ - 2), caveZ - 2, 0, 2)
    place(chest, scene, caveX - 5, y(caveX - 5, caveZ - 4), caveZ - 4, 0.5)
    place(potion, scene, caveX - 5.5, y(caveX - 5.5, caveZ - 3.6) + 0.3, caveZ - 3.6, 0)
    place(banner, scene, caveX + 1, y(caveX + 1, caveZ + 3), caveZ + 3, 0, 1.2)
  } catch (e) {
    console.warn('dungeon dressing failed', e)
  }
}

/** A spooky graveyard corner — the Shadow's lair. */
export async function buildGraveyard(scene: THREE.Scene, gx: number, gz: number, gy: (x: number, z: number) => number): Promise<void> {
  try {
    const [coffin, candle, fence, altar, gate] = await Promise.all([
      load('models/village/coffin.glb'),
      load('models/village/candle.glb'),
      load('models/village/fence.glb'),
      load('models/village/altar-stone.glb'),
      load('models/village/grave-gate.glb'),
    ])
    const y = (x: number, z: number) => gy(x, z)
    place(coffin, scene, gx, y(gx, gz), gz, 0.4)
    place(candle, scene, gx + 1.5, y(gx + 1.5, gz + 0.5), gz + 0.5, 0)
    place(candle, scene, gx - 1.5, y(gx - 1.5, gz - 0.5), gz - 0.5, 0)
    place(fence, scene, gx + 2.5, y(gx + 2.5, gz + 2), gz + 2, Math.PI / 2, 1.4)
    place(fence, scene, gx - 2.5, y(gx - 2.5, gz - 2), gz - 2, 0, 1.4)
    place(altar, scene, gx + 3, y(gx + 3, gz - 2), gz - 2, 0)
    place(gate, scene, gx, y(gx, gz + 3), gz + 3, 0, 1.4)
    const glow = new THREE.PointLight(0x6a8fd8, 0.7, 8)
    glow.position.set(gx, y(gx, gz) + 1.2, gz)
    scene.add(glow)
  } catch (e) {
    console.warn('graveyard failed to load', e)
  }
}
