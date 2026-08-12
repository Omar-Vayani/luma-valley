/**
 * assets — turning the low-poly model packs into something we can draw
 * thousands of.
 *
 * Every nature model is flat-shaded and coloured by material rather than by
 * texture, which is exactly the case where you can bake the material colours
 * into vertex colours, merge the sub-meshes, and end up with one geometry per
 * model that an InstancedMesh can throw around for free.
 *
 * Nothing man-made is loaded here: buildings, fences, lanterns and the rest
 * are built in code so the whole valley shares one look.
 */
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { PropKind } from '../world/scatter'

const BASE = 'models/nature/'

/**
 * Which files back each scattered kind. Deliberately a handful of variants
 * each: enough that a forest does not look stamped, few enough that first
 * load stays quick.
 */
export const PROP_FILES: Record<PropKind, string[]> = {
  pine: ['PineTree_1', 'PineTree_3', 'PineTree_5'],
  pineSnow: ['PineTree_Snow_2', 'PineTree_Snow_4'],
  tree: ['CommonTree_1', 'CommonTree_3', 'CommonTree_5'],
  treeAutumn: ['CommonTree_Autumn_2', 'CommonTree_Autumn_4'],
  birch: ['BirchTree_1', 'BirchTree_3', 'BirchTree_5'],
  willow: ['Willow_2', 'Willow_4'],
  deadTree: ['CommonTree_Dead_2', 'CommonTree_Dead_4'],
  bush: ['Bush_1', 'Bush_2'],
  berryBush: ['BushBerries_1', 'BushBerries_2'],
  rock: ['Rock_1', 'Rock_3', 'Rock_5', 'Rock_7'],
  mossRock: ['Rock_Moss_1', 'Rock_Moss_4', 'Rock_Moss_6'],
  snowRock: ['Rock_Snow_2', 'Rock_Snow_5'],
  stump: ['TreeStump', 'TreeStump_Moss'],
  log: ['WoodLog', 'WoodLog_Moss'],
  grass: ['Grass', 'Grass_2', 'Grass_Short'],
  flower: ['Flowers'],
  plant: ['Plant_1', 'Plant_3', 'Plant_5'],
  wheat: ['Wheat'],
  corn: ['Corn_1', 'Corn_2'],
  lily: ['Lilypad'],
}

/** How many variants of each kind actually exist, for the scatter pass. */
export const PROP_VARIANT_COUNT = Object.fromEntries(
  Object.entries(PROP_FILES).map(([k, v]) => [k, v.length]),
) as Record<PropKind, number>

const geometryCache = new Map<string, THREE.BufferGeometry>()

/**
 * MTLLoader has already taken the authored Kd into linear space. Go back to
 * display space to reason about it, because these packs are painted very dark
 * — foliage lands around 8% lightness, which reads as black under a sane
 * exposure — then lift it with a gamma knee rather than a multiplier, so the
 * near-blacks come up without the pale birches turning into snowballs.
 */
function paletteColor(mat: THREE.MeshPhongMaterial | undefined): THREE.Color {
  const color = (mat?.color ?? new THREE.Color(0xbbbbbb)).clone().convertLinearToSRGB()
  const hsl = { h: 0, s: 0, l: 0 }
  color.getHSL(hsl)
  color.setHSL(
    hsl.h,
    Math.min(1, hsl.s * 1.15 + 0.05),
    Math.min(0.86, 0.1 + Math.pow(hsl.l, 0.62) * 0.66),
  )
  return color.convertSRGBToLinear()
}

/**
 * Load one OBJ+MTL pair and reduce it to a single geometry whose vertex
 * colours carry what the materials used to say.
 */
async function loadBaked(name: string): Promise<THREE.BufferGeometry> {
  const cached = geometryCache.get(name)
  if (cached) return cached

  const mtlLoader = new MTLLoader().setPath(BASE)
  const materials = await mtlLoader.loadAsync(`${name}.mtl`)
  materials.preload()
  const objLoader = new OBJLoader().setMaterials(materials).setPath(BASE)
  const group = await objLoader.loadAsync(`${name}.obj`)

  const parts: THREE.BufferGeometry[] = []
  group.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    let geo = mesh.geometry.clone()
    geo.applyMatrix4(mesh.matrixWorld)
    // strip anything that would stop a merge, then paint the material colour on
    const wanted = new Set(['position', 'normal'])
    for (const attr of Object.keys(geo.attributes)) {
      if (!wanted.has(attr)) geo.deleteAttribute(attr)
    }
    if (!geo.attributes.normal) geo.computeVertexNormals()
    if (geo.index) geo = geo.toNonIndexed()

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const count = geo.attributes.position.count
    const colors = new Float32Array(count * 3)

    // A model with a trunk and a canopy arrives as one mesh with two material
    // groups. Colouring the whole thing from material[0] is how every tree in
    // the valley ended up the colour of bark.
    const groups = geo.groups.length
      ? geo.groups
      : [{ start: 0, count, materialIndex: 0 }]
    for (const group of groups) {
      const mat = materials[group.materialIndex ?? 0] ?? materials[0]
      const color = paletteColor(mat as THREE.MeshPhongMaterial | undefined)
      const end = Math.min(count, group.start + group.count)
      for (let i = group.start; i < end; i++) {
        colors[i * 3] = color.r
        colors[i * 3 + 1] = color.g
        colors[i * 3 + 2] = color.b
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.clearGroups()
    parts.push(geo)
  })

  if (!parts.length) throw new Error(`no geometry in ${name}`)
  const merged = parts.length === 1 ? parts[0] : (mergeGeometries(parts, false) ?? parts[0])
  merged.computeBoundingSphere()
  merged.computeBoundingBox()

  // the packs are authored at wildly different scales; normalise on height so
  // a "tree" is a tree whichever file it came from
  const box = merged.boundingBox
  if (box) {
    const height = box.max.y - box.min.y
    if (height > 0) {
      const target = TARGET_HEIGHT[name] ?? 1
      merged.scale(target / height, target / height, target / height)
      merged.translate(0, -box.min.y * (target / height), 0)
      merged.computeBoundingSphere()
      merged.computeBoundingBox()
    }
  }

  geometryCache.set(name, merged)
  return merged
}

/** Real-world heights in metres, so the valley has a sense of scale. */
const TARGET_HEIGHT: Record<string, number> = {}
function setHeights(names: string[], h: number): void {
  for (const n of names) TARGET_HEIGHT[n] = h
}
setHeights(PROP_FILES.pine, 11)
setHeights(PROP_FILES.pineSnow, 10)
setHeights(PROP_FILES.tree, 8.5)
setHeights(PROP_FILES.treeAutumn, 8)
setHeights(PROP_FILES.birch, 9.5)
setHeights(PROP_FILES.willow, 7.5)
setHeights(PROP_FILES.deadTree, 7)
setHeights(PROP_FILES.bush, 1.5)
setHeights(PROP_FILES.berryBush, 1.4)
setHeights(PROP_FILES.rock, 1.6)
setHeights(PROP_FILES.mossRock, 1.5)
setHeights(PROP_FILES.snowRock, 1.7)
setHeights(PROP_FILES.stump, 0.9)
setHeights(PROP_FILES.log, 0.9)
setHeights(PROP_FILES.grass, 0.7)
setHeights(PROP_FILES.flower, 0.6)
setHeights(PROP_FILES.plant, 1.1)
setHeights(PROP_FILES.wheat, 1.3)
setHeights(PROP_FILES.corn, 1.9)
setHeights(PROP_FILES.lily, 0.12)

export interface PropGeometrySet {
  /** kind -> variant -> geometry */
  geometries: Map<PropKind, THREE.BufferGeometry[]>
}

/**
 * Load every scattered model. Reports progress so the loading screen can say
 * something more honest than a spinner.
 */
export async function loadPropGeometries(
  onProgress?: (loaded: number, total: number) => void,
): Promise<PropGeometrySet> {
  const jobs: { kind: PropKind; index: number; name: string }[] = []
  for (const [kind, names] of Object.entries(PROP_FILES) as [PropKind, string[]][]) {
    names.forEach((name, index) => jobs.push({ kind, index, name }))
  }

  const geometries = new Map<PropKind, THREE.BufferGeometry[]>()
  for (const [kind, names] of Object.entries(PROP_FILES) as [PropKind, string[]][]) {
    geometries.set(kind, new Array(names.length))
  }

  let done = 0
  const CONCURRENCY = 8
  let cursor = 0
  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++
      if (i >= jobs.length) return
      const job = jobs[i]
      try {
        const geo = await loadBaked(job.name)
        geometries.get(job.kind)![job.index] = geo
      } catch {
        // a missing model should cost one bush, not the whole valley
        geometries.get(job.kind)![job.index] = fallbackGeometry()
      }
      done++
      onProgress?.(done, jobs.length)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return { geometries }
}

let fallback: THREE.BufferGeometry | null = null
function fallbackGeometry(): THREE.BufferGeometry {
  if (!fallback) {
    fallback = new THREE.ConeGeometry(0.5, 1.4, 6)
    fallback.translate(0, 0.7, 0)
    const count = fallback.attributes.position.count
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      colors[i * 3] = 0.25
      colors[i * 3 + 1] = 0.4
      colors[i * 3 + 2] = 0.2
    }
    fallback.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  }
  return fallback
}
