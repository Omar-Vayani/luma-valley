import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'

/**
 * assets — loads the Quaternius creature glTFs and nature OBJs.
 * Species gene → model; materials tinted by genome hue.
 */

export const SPECIES = [
  'Chicken',
  'Penguin',
  'Panda',
  'Pig',
  'Bee',
  'Mushroom',
  'Deer',
  'Crab',
  'Cactus',
  'Ghost',
] as const

export type SpeciesName = (typeof SPECIES)[number]

export const NATURE_PROPS = [
  'CommonTree',
  'BirchTree',
  'PineTree',
  'Willow',
  'Rock',
  'Bush',
  'BushBerries',
  'Plant',
  'Grass',
  'TreeStump',
  'WoodLog',
  'PalmTree',
  'Corn',
] as const

export type NatureName = (typeof NATURE_PROPS)[number]

export class AssetManager {
  private gltf = new GLTFLoader()
  private obj = new OBJLoader()
  private mtl = new MTLLoader()
  private models = new Map<string, THREE.Group>()
  private objCache = new Map<string, THREE.Group>()

  preload(onProgress?: (done: number, total: number) => void): Promise<void> {
    const jobs: Promise<void>[] = []
    let done = 0
    const total = SPECIES.length + NATURE_PROPS.length * 4
    for (const s of SPECIES) {
      jobs.push(
        this.loadGltf(`models/monsters/${s}.gltf`).then((g) => {
          this.models.set(s, g)
          done++
          onProgress?.(done, total)
        }),
      )
    }
    for (const n of NATURE_PROPS) {
      // OBJ variants have suffixes; try _1.._4
      const tries = [`${n}_1`, `${n}_2`, `${n}_3`, `${n}_4`, n].slice(0, 4)
      const first = tries.find((t) => t === n) ?? tries[0]
      // store a placeholder; actual OBJ loaded on first use (see loadProp)
      void first
      done += 0
    }
    void done
    return Promise.all(jobs).then(() => undefined)
  }

  private loadGltf(url: string): Promise<THREE.Group> {
    if (this.models.has(url)) return Promise.resolve(this.models.get(url)!)
    return new Promise((resolve, reject) => {
      this.gltf.load(url, (gltf) => resolve(gltf.scene), undefined, reject)
    })
  }

  async creatureModel(species: number): Promise<THREE.Group> {
    const name = SPECIES[species % SPECIES.length]
    const src = this.models.get(name)
    if (src) return src.clone(true)
    const g = await this.loadGltf(`models/monsters/${name}.gltf`)
    this.models.set(name, g)
    return g.clone(true)
  }

  /** Tint all materials of a loaded model toward a hue (genome color). */
  tint(group: THREE.Group, hue: number, dark = false): void {
    group.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh && mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const m of mats) {
          const mat = m as THREE.MeshStandardMaterial
          if (mat.map) continue // keep textured models
          if (dark) mat.color.setHSL(hue, 0.25, 0.12)
          else mat.color.setHSL(hue, 0.55, 0.62)
          if (mat.emissive) mat.emissive.setHSL(hue, 0.6, dark ? 0.05 : 0.08)
        }
      }
    })
  }

  /** Load an OBJ prop (with its MTL if present) once, then clone. */
  async loadProp(name: string): Promise<THREE.Group> {
    if (this.objCache.has(name)) return this.objCache.get(name)!.clone(true)
    const base = name.replace(/_\d+$/, '')
    // try the specific file, else the base
    const candidates = [`models/nature/${name}.obj`, `models/nature/${base}.obj`]
    let loaded = false
    let group = new THREE.Group()
    for (const url of candidates) {
      try {
        const objText = await (await fetch(url)).text()
        const mtlText = await (await fetch(`models/nature/${base}.mtl`)).text().catch(() => null)
        if (mtlText) {
          const mtl = this.mtl.parse(mtlText, '')
          this.obj.setMaterials(mtl)
        }
        const parsed = this.obj.parse(objText)
        group = parsed
        loaded = true
        break
      } catch {
        /* try next */
      }
    }
    if (!loaded) {
      // fallback: simple cone as a stand-in
      group.add(new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 5), new THREE.MeshLambertMaterial({ color: 0x6a9f4a })))
    }
    this.objCache.set(name, group)
    return group.clone(true)
  }

  async prop(name: string, variant = 1): Promise<THREE.Group> {
    const key = `${name}_${variant}`
    return this.loadProp(key)
  }
}

export function speciesFromGene(speciesGene: number): number {
  return Math.floor(speciesGene * SPECIES.length) % SPECIES.length
}
