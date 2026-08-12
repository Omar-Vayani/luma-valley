/**
 * scatter-view — drawing several thousand trees without paying for them.
 *
 * Everything scattered is instanced, and instances are grouped into chunks of
 * the map so the GPU can throw away the ones behind you and the quality preset
 * can stop drawing the far ones entirely. Foliage sways: one sine in the
 * vertex shader, phase-shifted by world position, which is the cheapest thing
 * in rendering that makes a still image look alive.
 */
import * as THREE from 'three'
import type { Prop, PropKind, ResourceNode, ScatterResult } from '../world/scatter'
import type { PropGeometrySet } from './assets'
import type { PlayerProgress } from '../game/progress'
import { nodeReady } from '../game/gather'

/** How much each kind moves in the wind, and whether it casts a shadow. */
const SWAY: Record<PropKind, number> = {
  pine: 0.10, pineSnow: 0.08, tree: 0.14, treeAutumn: 0.14, birch: 0.18, willow: 0.24,
  deadTree: 0.06, bush: 0.16, berryBush: 0.16, rock: 0, mossRock: 0, snowRock: 0,
  stump: 0, log: 0, grass: 0.3, flower: 0.26, plant: 0.24, wheat: 0.3, corn: 0.22, lily: 0.05,
}

const SHADOWS: Record<PropKind, boolean> = {
  pine: true, pineSnow: true, tree: true, treeAutumn: true, birch: true, willow: true,
  deadTree: true, bush: true, berryBush: true, rock: true, mossRock: true, snowRock: true,
  stump: true, log: true, grass: false, flower: false, plant: false, wheat: false,
  corn: false, lily: false,
}

/** Thin, planar foliage has to be drawn from both sides or half of it is black. */
const THIN: Partial<Record<PropKind, boolean>> = {
  grass: true, flower: true, plant: true, wheat: true, corn: true, lily: true,
  bush: true, berryBush: true,
}

const CHUNK = 110

function chunkKey(x: number, z: number): string {
  return `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`
}

interface Batch {
  mesh: THREE.InstancedMesh
  centre: THREE.Vector3
  radius: number
}

/** One material per sway strength, shared across every batch that uses it. */
class WindMaterials {
  private cache = new Map<number, THREE.MeshLambertMaterial>()
  readonly uniforms = { uTime: { value: 0 }, uWind: { value: 1 } }

  get(sway: number, doubleSided = false): THREE.MeshLambertMaterial {
    const key = Math.round(sway * 100) * 2 + (doubleSided ? 1 : 0)
    const existing = this.cache.get(key)
    if (existing) return existing

    const mat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    })
    if (sway > 0) {
      const { uniforms } = this
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = uniforms.uTime
        shader.uniforms.uWind = uniforms.uWind
        shader.uniforms.uSway = { value: sway }
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
             uniform float uTime;
             uniform float uWind;
             uniform float uSway;`,
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
             #ifdef USE_INSTANCING
               vec3 instOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
             #else
               vec3 instOrigin = vec3(0.0);
             #endif
             float bendHeight = max(transformed.y, 0.0);
             float phase = instOrigin.x * 0.11 + instOrigin.z * 0.083 + uTime * 1.15;
             float gust = 0.7 + 0.3 * sin(uTime * 0.31 + instOrigin.x * 0.013);
             float amount = uSway * uWind * gust * bendHeight;
             transformed.x += sin(phase) * amount;
             transformed.z += cos(phase * 0.83 + 1.7) * amount * 0.65;`,
          )
      }
      mat.customProgramCacheKey = () => `wind-${key}`
    }
    this.cache.set(key, mat)
    return mat
  }
}

export class ScatterView {
  readonly group = new THREE.Group()
  private batches: Batch[] = []
  private materials = new WindMaterials()
  private nodeSlots = new Map<string, { mesh: THREE.InstancedMesh; index: number; matrix: THREE.Matrix4 }>()
  private nodeList: ResourceNode[] = []
  private lastNodeCheck = -1
  private drawDistance = 340

  constructor(scatter: ScatterResult, geo: PropGeometrySet) {
    this.group.name = 'scatter'
    this.nodeList = scatter.nodes
    this.buildProps(scatter.props, geo)
    this.buildNodes(scatter.nodes, geo)
  }

  private buildProps(props: Prop[], geo: PropGeometrySet): void {
    const groups = new Map<string, Prop[]>()
    for (const p of props) {
      const key = `${p.kind}|${p.variant}|${chunkKey(p.x, p.z)}`
      const list = groups.get(key)
      if (list) list.push(p)
      else groups.set(key, [p])
    }

    const matrix = new THREE.Matrix4()
    const quat = new THREE.Quaternion()
    const pos = new THREE.Vector3()
    const scale = new THREE.Vector3()

    for (const [key, list] of groups) {
      const [kind, variantRaw] = key.split('|')
      const propKind = kind as PropKind
      const variant = Number(variantRaw)
      const geometry = geo.geometries.get(propKind)?.[variant]
      if (!geometry) continue

      const mesh = new THREE.InstancedMesh(
        geometry, this.materials.get(SWAY[propKind] ?? 0, THIN[propKind] ?? false), list.length,
      )
      mesh.castShadow = SHADOWS[propKind] ?? false
      mesh.receiveShadow = true

      let cx = 0
      let cz = 0
      for (let i = 0; i < list.length; i++) {
        const p = list[i]
        pos.set(p.x, p.y, p.z)
        quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot)
        scale.setScalar(p.scale)
        matrix.compose(pos, quat, scale)
        mesh.setMatrixAt(i, matrix)
        cx += p.x
        cz += p.z
      }
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()

      const centre = new THREE.Vector3(cx / list.length, 0, cz / list.length)
      this.batches.push({ mesh, centre, radius: CHUNK })
      this.group.add(mesh)
    }
  }

  private buildNodes(nodes: ResourceNode[], geo: PropGeometrySet): void {
    const groups = new Map<string, ResourceNode[]>()
    for (const n of nodes) {
      const key = `${n.prop}|${n.variant}|${chunkKey(n.x, n.z)}`
      const list = groups.get(key)
      if (list) list.push(n)
      else groups.set(key, [n])
    }

    const matrix = new THREE.Matrix4()
    const quat = new THREE.Quaternion()
    const pos = new THREE.Vector3()
    const scale = new THREE.Vector3()

    for (const [key, list] of groups) {
      const [kind, variantRaw] = key.split('|')
      const propKind = kind as PropKind
      const variant = Number(variantRaw)
      const geometry = geo.geometries.get(propKind)?.[variant]
      if (!geometry) continue

      const mesh = new THREE.InstancedMesh(
        geometry, this.materials.get(SWAY[propKind] ?? 0, THIN[propKind] ?? false), list.length,
      )
      mesh.castShadow = SHADOWS[propKind] ?? false
      mesh.receiveShadow = true

      let cx = 0
      let cz = 0
      for (let i = 0; i < list.length; i++) {
        const n = list[i]
        pos.set(n.x, n.y, n.z)
        quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), n.rot)
        scale.setScalar(n.scale)
        matrix.compose(pos, quat, scale)
        mesh.setMatrixAt(i, matrix)
        this.nodeSlots.set(n.id, { mesh, index: i, matrix: matrix.clone() })
        cx += n.x
        cz += n.z
      }
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
      this.batches.push({ mesh, centre: new THREE.Vector3(cx / list.length, 0, cz / list.length), radius: CHUNK })
      this.group.add(mesh)
    }
  }

  setDrawDistance(d: number): void {
    this.drawDistance = d
  }

  setWind(strength: number): void {
    this.materials.uniforms.uWind.value = strength
  }

  /** A picked-over bush should look picked over. */
  refreshNodes(progress: PlayerProgress, tick: number, force = false): void {
    if (!force && tick === this.lastNodeCheck) return
    this.lastNodeCheck = tick
    const hidden = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001)
    const touched = new Set<THREE.InstancedMesh>()
    for (const n of this.nodeList) {
      const slot = this.nodeSlots.get(n.id)
      if (!slot) continue
      const ready = nodeReady(progress, n.id, tick)
      slot.mesh.setMatrixAt(slot.index, ready ? slot.matrix : hidden)
      touched.add(slot.mesh)
    }
    for (const mesh of touched) mesh.instanceMatrix.needsUpdate = true
  }

  update(elapsed: number, camera: THREE.Vector3): void {
    this.materials.uniforms.uTime.value = elapsed
    const cutoff = this.drawDistance
    for (const b of this.batches) {
      const d = Math.hypot(b.centre.x - camera.x, b.centre.z - camera.z)
      b.mesh.visible = d - b.radius < cutoff
    }
  }

  dispose(): void {
    for (const b of this.batches) {
      b.mesh.dispose()
    }
    this.group.clear()
  }
}
