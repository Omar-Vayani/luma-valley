/**
 * ground — the valley floor, and the water in it.
 *
 * The terrain mesh is generated directly from `sim/terrain.heightAt`, so what
 * you walk on and what you see are the same surface by construction. It is
 * built non-indexed with one flat colour per triangle: that is the whole of
 * the art direction, and it costs nothing.
 */
import * as THREE from 'three'
import { HALF, POND, WATER_LEVEL, heightAt, normalAt, surfaceAt } from '../sim/terrain'

/** One colour per surface, with a little variation so it is not a flat wash. */
const COLOURS: Record<string, [string, string]> = {
  grass: ['#6f9e52', '#5f8c47'],
  dirt: ['#9a8460', '#8d7855'],
  stone: ['#8e8a80', '#807c73'],
  wood: ['#8a6a45', '#7d5f3d'],
  water: ['#4a7f8c', '#3d6d79'],
}

const ROCK = new THREE.Color('#7b776e')
const SNOW = new THREE.Color('#e6ecef')

function hash2(x: number, z: number): number {
  const n = Math.sin(x * 43.3 + z * 71.7) * 3571.19
  return n - Math.floor(n)
}

export function buildTerrain(cell = 2.5): THREE.Mesh {
  const steps = Math.ceil((HALF * 2) / cell)
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []

  const colour = new THREE.Color()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const ab = new THREE.Vector3()
  const ac = new THREE.Vector3()
  const n = new THREE.Vector3()

  const pushTriangle = (
    x0: number, z0: number, x1: number, z1: number, x2: number, z2: number,
  ): void => {
    a.set(x0, heightAt(x0, z0), z0)
    b.set(x1, heightAt(x1, z1), z1)
    c.set(x2, heightAt(x2, z2), z2)
    ab.subVectors(b, a)
    ac.subVectors(c, a)
    n.crossVectors(ab, ac).normalize()

    const cx = (x0 + x1 + x2) / 3
    const cz = (z0 + z1 + z2) / 3
    const cy = (a.y + b.y + c.y) / 3

    // steep ground shows the rock under the turf, and the tops go white
    const slope = 1 - Math.abs(n.y)
    const kind = surfaceAt(cx, cz)
    const pair = COLOURS[kind] ?? COLOURS.grass
    colour.set(hash2(Math.floor(cx), Math.floor(cz)) > 0.5 ? pair[0] : pair[1])
    if (slope > 0.34) colour.lerp(ROCK, Math.min(1, (slope - 0.34) * 3))
    if (cy > 26) colour.lerp(SNOW, Math.min(1, (cy - 26) / 12))

    for (const v of [a, b, c]) {
      positions.push(v.x, v.y, v.z)
      normals.push(n.x, n.y, n.z)
      colors.push(colour.r, colour.g, colour.b)
    }
  }

  for (let iz = 0; iz < steps; iz++) {
    for (let ix = 0; ix < steps; ix++) {
      const x0 = -HALF + ix * cell
      const z0 = -HALF + iz * cell
      const x1 = x0 + cell
      const z1 = z0 + cell
      // alternate the diagonal so the faceting does not read as a grid
      if ((ix + iz) % 2 === 0) {
        pushTriangle(x0, z0, x0, z1, x1, z1)
        pushTriangle(x0, z0, x1, z1, x1, z0)
      } else {
        pushTriangle(x0, z0, x0, z1, x1, z0)
        pushTriangle(x1, z0, x0, z1, x1, z1)
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.computeBoundingSphere()

  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }))
  mesh.name = 'terrain'
  mesh.receiveShadow = true
  return mesh
}

/**
 * The pond. A disc a little wider than the dish in the terrain, gently
 * rippling — no reflections, nothing expensive, just something that reads as
 * water at a glance and is calm to look at.
 */
export class Water {
  readonly mesh: THREE.Mesh
  private material: THREE.MeshLambertMaterial

  constructor() {
    const geo = new THREE.CircleGeometry(POND.radius + 1.5, 40)
    geo.rotateX(-Math.PI / 2)
    this.material = new THREE.MeshLambertMaterial({
      color: '#4f93a6',
      transparent: true,
      opacity: 0.82,
    })
    this.mesh = new THREE.Mesh(geo, this.material)
    this.mesh.position.set(POND.x, WATER_LEVEL, POND.z)
    this.mesh.name = 'water'
    this.mesh.receiveShadow = false
  }

  update(time: number): void {
    this.mesh.position.y = WATER_LEVEL + Math.sin(time * 0.5) * 0.015
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}

/** Where the ground's normal points, for planting things flush with it. */
export function groundNormal(x: number, z: number): THREE.Vector3 {
  const n = normalAt(x, z)
  return new THREE.Vector3(n[0], n[1], n[2])
}
