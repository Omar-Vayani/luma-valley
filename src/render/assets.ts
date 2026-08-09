import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Kenney Cube Pets. The ordering remains stable so saved species genes do too. */
export const SPECIES = ['cat', 'dog', 'fox', 'bunny', 'panda', 'penguin', 'pig', 'deer', 'bee', 'cow'] as const
export type SpeciesName = (typeof SPECIES)[number]

/** A deliberately small, readable set from the nature pack. */
export const NATURE_PROPS = ['CommonTree', 'BirchTree', 'PineTree', 'Willow', 'Rock', 'Bush', 'BushBerries', 'Grass', 'TreeStump', 'WoodLog'] as const
export type NatureName = (typeof NATURE_PROPS)[number]

export function cleanModelStem(name: string): string {
  return name.replace(/^.*\//, '').replace(/\.(obj|mtl)$/i, '')
}

export function natureModelUrls(name: string): { obj: string; mtl: string } {
  const stem = cleanModelStem(name)
  return { obj: `/models/nature/${stem}.obj`, mtl: `/models/nature/${stem}.mtl` }
}

export function hasRenderableGeometry(root: THREE.Object3D): boolean {
  let valid = false
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    const position = mesh.geometry?.getAttribute('position')
    if (mesh.isMesh && position && position.count >= 3) valid = true
  })
  return valid
}

/** Scale to a known height, center horizontally, and put the lowest vertex at y=0. */
export function normalizeModel(root: THREE.Group, targetHeight: number): THREE.Group {
  root.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(root)
  const size = bounds.getSize(new THREE.Vector3())
  if (bounds.isEmpty() || !Number.isFinite(size.y) || size.y <= 1e-4) throw new Error('Model has no usable bounds')
  const scale = targetHeight / size.y
  root.scale.multiplyScalar(scale)
  root.updateMatrixWorld(true)
  const scaled = new THREE.Box3().setFromObject(root)
  const center = scaled.getCenter(new THREE.Vector3())
  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= scaled.min.y
  root.updateMatrixWorld(true)
  return root
}

/** Bake a static OBJ hierarchy into one vertex-coloured mesh.
 * Repeated scenery previously expanded to nearly 1,000 mobile draw calls. */
export function collapseStaticModel(root: THREE.Group): THREE.Group {
  root.updateMatrixWorld(true)
  const inverseRoot = root.matrixWorld.clone().invert()
  const parts: THREE.BufferGeometry[] = []
  root.traverse((object) => {
    const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>
    if (!mesh.isMesh || !mesh.geometry?.getAttribute('position')) return
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
    geometry.applyMatrix4(inverseRoot.clone().multiply(mesh.matrixWorld))
    for (const attribute of Object.keys(geometry.attributes)) {
      if (!['position', 'normal'].includes(attribute)) geometry.deleteAttribute(attribute)
    }
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material & { color?: THREE.Color }
    const color = material.color?.clone() ?? new THREE.Color(0xb7c89a)
    const count = geometry.getAttribute('position').count
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) color.toArray(colors, i * 3)
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    parts.push(geometry)
  })
  if (!parts.length) throw new Error('Static model has no geometry to collapse')
  const geometry = mergeGeometries(parts, false)
  if (!geometry) throw new Error('Static model geometry could not be merged')
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }))
  mesh.castShadow = true
  mesh.receiveShadow = true
  const group = new THREE.Group()
  group.add(mesh)
  return group
}

function prepareMeshes(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false // small animated models can have stale imported bounds
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    mesh.material = materials.map((material) => material.clone())
  })
}

async function fetchModelText(url: string): Promise<string> {
  const response = await fetch(url)
  const type = response.headers.get('content-type')?.toLowerCase() ?? ''
  const text = await response.text()
  if (!response.ok || type.includes('text/html') || /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text)) {
    throw new Error(`Not a model response: ${url}`)
  }
  return text
}

export class AssetManager {
  private gltf = new GLTFLoader()
  private models = new Map<SpeciesName, THREE.Group>()
  private petLoads = new Map<SpeciesName, Promise<THREE.Group>>()
  private objCache = new Map<string, THREE.Group>()

  async preload(onProgress?: (done: number, total: number) => void): Promise<void> {
    let done = 0
    await Promise.all(SPECIES.map(async (species) => {
      try {
        await this.ensurePet(species)
      } catch (error) {
        console.warn(`Pet model ${species} unavailable; procedural fallback will be used`, error)
      } finally {
        onProgress?.(++done, SPECIES.length)
      }
    }))
  }

  private loadPet(species: SpeciesName): Promise<THREE.Group> {
    return new Promise((resolve, reject) => {
      this.gltf.load(`/models/pets/${species}.glb`, ({ scene }) => {
        try {
          if (!hasRenderableGeometry(scene)) throw new Error('GLB contains no renderable geometry')
          prepareMeshes(scene)
          resolve(normalizeModel(scene, 1.65))
        } catch (error) { reject(error) }
      }, undefined, reject)
    })
  }

  private ensurePet(species: SpeciesName): Promise<THREE.Group> {
    const cached = this.models.get(species)
    if (cached) return Promise.resolve(cached)
    const pending = this.petLoads.get(species)
    if (pending) return pending
    const load = this.loadPet(species)
      .then((model) => {
        this.models.set(species, model)
        return model
      })
      .finally(() => this.petLoads.delete(species))
    this.petLoads.set(species, load)
    return load
  }

  async creatureModel(species: number): Promise<THREE.Group> {
    const name = SPECIES[((species % SPECIES.length) + SPECIES.length) % SPECIES.length]
    const source = await this.ensurePet(name)
    const instance = cloneSkeleton(source) as THREE.Group
    prepareMeshes(instance)
    return instance
  }

  /** Subtle genome tint, retaining the pets' intentionally varied materials. */
  tint(group: THREE.Group, hue: number, dark = false, strength = 0.22): void {
    group.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials) {
        const mat = material as THREE.MeshStandardMaterial
        if (!mat.color) continue
        if (dark) mat.color.lerp(new THREE.Color(0x160f22), 0.82)
        else mat.color.lerp(new THREE.Color().setHSL(hue, 0.58, 0.68), strength)
        if (mat.emissive) {
          mat.emissive.copy(mat.color)
          mat.emissiveIntensity = dark ? 0.04 : 0.1
        }
      }
    })
  }

  /** Load one exact OBJ+MTL pair. Missing/HTML fallback responses are rejected. */
  async loadProp(name: string): Promise<THREE.Group> {
    const stem = cleanModelStem(name)
    const cached = this.objCache.get(stem)
    if (cached) return cached.clone(true)
    const urls = natureModelUrls(stem)
    const objText = await fetchModelText(urls.obj)
    const objLoader = new OBJLoader()
    try {
      const mtlText = await fetchModelText(urls.mtl)
      const materials = new MTLLoader().parse(mtlText, '/models/nature/')
      materials.preload()
      objLoader.setMaterials(materials)
    } catch {
      // Geometry is still useful when a matching material file is absent.
    }
    const parsed = objLoader.parse(objText)
    if (!hasRenderableGeometry(parsed)) throw new Error(`OBJ contains no renderable geometry: ${urls.obj}`)
    const group = collapseStaticModel(parsed)
    normalizeModel(group, /tree|willow/i.test(stem) ? 5.2 : /grass|bush/i.test(stem) ? 0.9 : 1.25)
    this.objCache.set(stem, group)
    return group.clone(true)
  }

  async loadKenneyNature(name: string): Promise<THREE.Group> {
    const stem = cleanModelStem(name)
    const key = `kenney-nature/${stem}`
    const cached = this.objCache.get(key)
    if (cached) return cached.clone(true)
    const base = '/models/kenney-nature/'
    const objText = await fetchModelText(`${base}${stem}.obj`)
    const objLoader = new OBJLoader()
    try {
      const mtlText = await fetchModelText(`${base}${stem}.mtl`)
      const materials = new MTLLoader().parse(mtlText, base)
      materials.preload()
      objLoader.setMaterials(materials)
    } catch {
      // The CC0 geometry remains useful with a neutral material fallback.
    }
    const parsed = objLoader.parse(objText)
    if (!hasRenderableGeometry(parsed)) throw new Error(`Kenney OBJ contains no renderable geometry: ${stem}`)
    const group = collapseStaticModel(parsed)
    this.objCache.set(key, group)
    return group.clone(true)
  }

  prop(name: string, variant = 1): Promise<THREE.Group> {
    return this.loadProp(`${cleanModelStem(name).replace(/_\d+$/, '')}_${variant}`)
  }
}

export function speciesFromGene(speciesGene: number): number {
  return Math.floor(speciesGene * SPECIES.length) % SPECIES.length
}
