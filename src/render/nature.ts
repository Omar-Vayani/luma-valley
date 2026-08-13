/**
 * nature — the trees, rocks and undergrowth around the hamlet.
 *
 * Two rules, both of which are bugs the old valley had.
 *
 * **Everything is planted, not placed.** A prop's Y comes from the same
 * `heightAt` the player walks on, and its geometry is shifted so its own
 * lowest vertex sits at zero. Models in these packs are not all authored with
 * their base at the origin, which is exactly why things used to hover.
 *
 * **Anything you can bump into is registered.** The same pass that draws a
 * trunk hands its radius to the collision grid, so there is no such thing as a
 * tree you can walk through.
 */
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { HALF, VILLAGE, heightAt, isUnderwater, slopeAt } from '../sim/terrain'
import { circle, type Solid } from '../sim/collision'
import { mulberry32 } from '../sim/rng'
import { buildVillage, isInside } from '../sim/village'

const BASE = 'models/nature/'

export type PropKind = 'pine' | 'tree' | 'birch' | 'bush' | 'rock' | 'stump' | 'log' | 'grass' | 'flower'

const FILES: Record<PropKind, string[]> = {
  pine: ['PineTree_1', 'PineTree_3', 'PineTree_5'],
  tree: ['CommonTree_1', 'CommonTree_3', 'CommonTree_5'],
  birch: ['BirchTree_1', 'BirchTree_3'],
  bush: ['Bush_1', 'Bush_2'],
  rock: ['Rock_1', 'Rock_3', 'Rock_5'],
  stump: ['TreeStump', 'TreeStump_Moss'],
  log: ['WoodLog', 'WoodLog_Moss'],
  grass: ['Grass', 'Grass_2', 'Grass_Short'],
  flower: ['Flowers'],
}

/**
 * What each kind is like to walk into. Undergrowth you walk through.
 *
 * The trunk radii are wider than the trunks. That is deliberate: these models
 * carry their foliage low, and a radius that only fenced off the wood let you
 * stand with your head inside the canopy, which fills the screen with a solid
 * brown cone and is the single most disorienting thing that used to happen in
 * the woods.
 */
const SOLIDITY: Partial<Record<PropKind, { r: number; height: number }>> = {
  pine: { r: 0.8, height: 8 },
  tree: { r: 0.85, height: 7 },
  birch: { r: 0.6, height: 8 },
  rock: { r: 0.68, height: 1.3 },
  stump: { r: 0.4, height: 0.8 },
  log: { r: 0.38, height: 0.7 },
}

export interface Prop {
  kind: PropKind
  variant: number
  x: number
  z: number
  rot: number
  scale: number
}

// ---------------------------------------------------------------- loading

const cache = new Map<string, THREE.BufferGeometry>()

/**
 * These packs are painted very dark — foliage lands around 8% lightness,
 * which reads as black under a sane exposure. Lift it with a gamma knee so
 * the hues survive.
 */
function lift(c: THREE.Color): THREE.Color {
  const out = c.clone().convertLinearToSRGB()
  // a gamma knee rather than a multiplier, so the darkest greens come up
  // without the mid tones blowing out and losing their hue
  out.r = Math.pow(out.r, 0.45)
  out.g = Math.pow(out.g, 0.45)
  out.b = Math.pow(out.b, 0.45)
  // and a floor, because a black bush is a hole in the valley rather than a
  // bush, and the fill light is not enough to rescue it on its own
  const floor = 0.16
  out.r = floor + out.r * (1 - floor)
  out.g = floor + out.g * (1 - floor)
  out.b = floor + out.b * (1 - floor)
  return out.convertSRGBToLinear()
}

async function loadOne(name: string): Promise<THREE.BufferGeometry | null> {
  const cached = cache.get(name)
  if (cached) return cached
  try {
    const materials = await new MTLLoader().setPath(BASE).loadAsync(`${name}.mtl`)
    materials.preload()
    const obj = await new OBJLoader().setMaterials(materials).setPath(BASE).loadAsync(`${name}.obj`)

    // bake each sub-mesh's material colour into vertex colours, then merge, so
    // a whole forest can be one instanced draw call
    const parts: THREE.BufferGeometry[] = []
    obj.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const geo = child.geometry.clone() as THREE.BufferGeometry
      geo.applyMatrix4(child.matrixWorld)
      const source = Array.isArray(child.material) ? child.material[0] : child.material
      const colour = lift((source as THREE.MeshPhongMaterial).color ?? new THREE.Color('#888'))
      const count = geo.attributes.position.count
      const colours = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        colours[i * 3] = colour.r
        colours[i * 3 + 1] = colour.g
        colours[i * 3 + 2] = colour.b
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colours, 3))
      geo.deleteAttribute('uv')
      geo.deleteAttribute('normal')
      geo.computeVertexNormals()
      parts.push(geo)
    })
    if (parts.length === 0) return null
    const merged = mergeGeometries(parts, false)
    if (!merged) return null

    // Sit the model's own base at y = 0. Without this a model authored with
    // its origin at the centre of its bounding box floats by half its height.
    merged.computeBoundingBox()
    const box = merged.boundingBox
    if (box) merged.translate(0, -box.min.y, 0)
    merged.computeBoundingSphere()

    cache.set(name, merged)
    return merged
  } catch {
    return null
  }
}

export type PropGeometries = Partial<Record<PropKind, THREE.BufferGeometry[]>>

export async function loadPropGeometries(): Promise<PropGeometries> {
  const out: PropGeometries = {}
  await Promise.all(
    (Object.keys(FILES) as PropKind[]).map(async (kind) => {
      const loaded = await Promise.all(FILES[kind].map(loadOne))
      const usable = loaded.filter((g): g is THREE.BufferGeometry => g != null)
      if (usable.length > 0) out[kind] = usable
    }),
  )
  return out
}

// ---------------------------------------------------------------- scattering

/**
 * Where things grow. Deterministic from the seed, thinned near the hamlet so
 * the green stays open, and never in the water or on a cliff.
 */
export function scatter(seed = 1): Prop[] {
  const rand = mulberry32(seed)
  const props: Prop[] = []
  // Nothing grows through a floor. The ring the hamlet stands on is wide
  // enough that the outer buildings poke past it, and grass was coming up
  // inside the longhouse.
  const buildings = buildVillage().buildings
  const indoors = (x: number, z: number): boolean =>
    buildings.some((b) => isInside(b, x, z, 1))

  const tryPlace = (kind: PropKind, x: number, z: number, scale: number): void => {
    if (Math.hypot(x, z) > HALF - 8) return
    if (isUnderwater(x, z)) return
    if (slopeAt(x, z) > 0.42) return
    if (indoors(x, z)) return
    const fromVillage = Math.hypot(x - VILLAGE.x, z - VILLAGE.z)
    // keep the green clear, and thin the treeline as it approaches
    if (fromVillage < VILLAGE.radius * 0.8) return
    if (fromVillage < VILLAGE.radius * 1.5 && rand() < 0.7) return
    props.push({
      kind,
      variant: Math.floor(rand() * FILES[kind].length),
      x,
      z,
      rot: rand() * Math.PI * 2,
      scale,
    })
  }

  // woodland: clumps rather than an even sprinkle, which is what makes a
  // treeline look grown rather than generated
  for (let clump = 0; clump < 95; clump++) {
    const angle = rand() * Math.PI * 2
    const radius = 30 + rand() * (HALF - 46)
    const cx = Math.sin(angle) * radius
    const cz = Math.cos(angle) * radius
    const kind: PropKind = rand() < 0.45 ? 'pine' : rand() < 0.7 ? 'tree' : 'birch'
    const count = 2 + Math.floor(rand() * 4)
    for (let i = 0; i < count; i++) {
      tryPlace(
        kind,
        cx + (rand() - 0.5) * 16,
        cz + (rand() - 0.5) * 16,
        0.85 + rand() * 0.5,
      )
    }
  }

  for (let i = 0; i < 90; i++) {
    const angle = rand() * Math.PI * 2
    const radius = 24 + rand() * (HALF - 36)
    tryPlace('rock', Math.sin(angle) * radius, Math.cos(angle) * radius, 0.6 + rand() * 0.8)
  }
  for (let i = 0; i < 55; i++) {
    const angle = rand() * Math.PI * 2
    const radius = 24 + rand() * (HALF - 40)
    tryPlace(rand() < 0.5 ? 'stump' : 'log', Math.sin(angle) * radius, Math.cos(angle) * radius, 0.8 + rand() * 0.5)
  }
  for (let i = 0; i < 190; i++) {
    const angle = rand() * Math.PI * 2
    const radius = 22 + rand() * (HALF - 34)
    tryPlace('bush', Math.sin(angle) * radius, Math.cos(angle) * radius, 0.7 + rand() * 0.6)
  }
  // ground cover comes closer in, because it is walk-through
  for (let i = 0; i < 750; i++) {
    const angle = rand() * Math.PI * 2
    const radius = 12 + rand() * (HALF - 24)
    const x = Math.sin(angle) * radius
    const z = Math.cos(angle) * radius
    if (Math.hypot(x, z) > HALF - 8 || isUnderwater(x, z) || slopeAt(x, z) > 0.42) continue
    if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.radius * 0.62) continue
    if (indoors(x, z)) continue
    props.push({
      kind: rand() < 0.8 ? 'grass' : 'flower',
      variant: 0,
      x,
      z,
      rot: rand() * Math.PI * 2,
      scale: 0.7 + rand() * 0.6,
    })
  }

  return props
}

/** Every prop that a body would bump into. */
export function propSolids(props: Prop[]): Solid[] {
  const out: Solid[] = []
  for (const p of props) {
    const rule = SOLIDITY[p.kind]
    if (!rule) continue
    out.push(circle(p.x, p.z, rule.r * p.scale, rule.height * p.scale, p.kind))
  }
  return out
}

// ---------------------------------------------------------------- drawing

export class NatureView {
  readonly group = new THREE.Group()
  private meshes: THREE.InstancedMesh[] = []

  constructor(props: Prop[], geometries: PropGeometries, groundCover: number) {
    this.group.name = 'nature'
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })

    // one InstancedMesh per (kind, variant). The undergrowth is thinned with
    // the seeded generator rather than Math.random, so the same valley looks
    // the same every time it is loaded at the same settings.
    const thin = mulberry32(0x51ee)
    const buckets = new Map<string, Prop[]>()
    for (const p of props) {
      if ((p.kind === 'grass' || p.kind === 'flower') && thin() > groundCover) continue
      const key = `${p.kind}:${p.variant}`
      const list = buckets.get(key)
      if (list) list.push(p)
      else buckets.set(key, [p])
    }

    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)

    for (const [key, list] of buckets) {
      const [kind, variantText] = key.split(':')
      const variants = geometries[kind as PropKind]
      if (!variants || variants.length === 0) continue
      const geometry = variants[Math.min(variants.length - 1, Number(variantText))]

      const mesh = new THREE.InstancedMesh(geometry, material, list.length)
      const small = kind === 'grass' || kind === 'flower'
      mesh.castShadow = !small
      mesh.receiveShadow = !small
      mesh.name = kind

      list.forEach((p, i) => {
        position.set(p.x, heightAt(p.x, p.z), p.z)
        quaternion.setFromAxisAngle(up, p.rot)
        scale.setScalar(p.scale)
        matrix.compose(position, quaternion, scale)
        mesh.setMatrixAt(i, matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.frustumCulled = true
      this.group.add(mesh)
      this.meshes.push(mesh)
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose()
    this.group.clear()
    this.meshes = []
  }
}
