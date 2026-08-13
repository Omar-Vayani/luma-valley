/**
 * buildings — the hamlet, in timber.
 *
 * Every mesh in here is generated from the same `Building` record that the
 * collision grid was filled from, in the same local coordinate frame. A wall
 * cannot be drawn in a place you can walk through, and the doorway you can see
 * is the doorway you can fit through, because both are computed from
 * `DOOR_WIDTH`.
 *
 * The style is wood: sawn plank walls on a low stone footing, corner posts,
 * a shingled roof with a real overhang, and a lintel over the door. Warm
 * browns rather than the plaster and red tile this replaced.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  DOOR_HEIGHT, DOOR_WIDTH, WALL_THICKNESS, furnitureOf,
  type Building, type VillageModel,
} from '../sim/village'
import { heightAt } from '../sim/terrain'

// ---------------------------------------------------------------- materials

/** Wood, in the range wood comes in. */
const PLANK = ['#b78a5e', '#ae8155', '#bd9165', '#a97c50']
const BEAM = '#7d5a36'
const POST = '#6d4e30'
const SHINGLE = ['#8b6a45', '#79593a']
const FOOTING = '#9a958c'
const DOORWAY = '#4a3524'

function mat(color: string): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: true })
}

interface Kit {
  plank: THREE.MeshLambertMaterial[]
  beam: THREE.MeshLambertMaterial
  post: THREE.MeshLambertMaterial
  shingle: THREE.MeshLambertMaterial[]
  footing: THREE.MeshLambertMaterial
  doorway: THREE.MeshLambertMaterial
  gable: THREE.MeshLambertMaterial
  glow: THREE.MeshBasicMaterial
}

function makeKit(): Kit {
  return {
    plank: PLANK.map(mat),
    beam: mat(BEAM),
    post: mat(POST),
    shingle: SHINGLE.map(mat),
    footing: mat(FOOTING),
    doorway: mat(DOORWAY),
    // its own material, so an extruded triangle never shares a merge bucket
    // with a wall full of boxes
    gable: mat(PLANK[1]),
    glow: new THREE.MeshBasicMaterial({ color: '#ffca7a', transparent: true, opacity: 0 }),
  }
}

function boxMesh(
  parent: THREE.Object3D, material: THREE.Material,
  w: number, h: number, d: number, x: number, y: number, z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

/**
 * A wall built out of stacked planks, so it reads as timber rather than as a
 * painted slab. Planks are inset very slightly at alternating depths — enough
 * to catch the light, not enough to cost anything.
 */
function plankWall(
  parent: THREE.Object3D, kit: Kit,
  width: number, height: number, thickness: number,
  x: number, y: number, z: number, alongX: boolean,
): void {
  const courses = Math.max(2, Math.round(height / 0.34))
  const courseHeight = height / courses
  for (let i = 0; i < courses; i++) {
    const material = kit.plank[(i + Math.round(Math.abs(x + z))) % kit.plank.length]
    // Courses meet flush. Leaving a gap between them to suggest a plank line
    // sounds harmless and is not: a wall of slats a couple of centimetres
    // apart is a wall you can see straight through, and the whole hamlet
    // looked like it was made of drying racks. The line comes from the
    // alternating depth instead, which catches the light without a hole.
    const relief = (i % 2) * 0.014
    const w = alongX ? width : thickness - relief
    const d = alongX ? thickness - relief : width
    const cy = y - height / 2 + courseHeight * (i + 0.5)
    boxMesh(parent, material, w, courseHeight, d, x, cy, z)
  }
}

// ---------------------------------------------------------------- a building

/**
 * One building. Built in its own local frame and then rotated and placed,
 * which is exactly what `buildingSolids` does, so the two cannot drift.
 */
export function buildOne(b: Building, kit: Kit): THREE.Group {
  const group = new THREE.Group()
  group.name = b.id
  const hw = b.width / 2
  const hd = b.depth / 2
  const t = WALL_THICKNESS
  const h = b.wallHeight

  // --- footing: a low stone plinth so nothing appears to float -------------
  // It is sunk to below the lowest corner of ground under the building, so a
  // building standing on a slight slope is bedded into the hill instead of
  // hovering over the low side of it.
  let lowestCorner = 0
  for (const [lx, lz] of [[hw, hd], [-hw, hd], [hw, -hd], [-hw, -hd]] as const) {
    const wx = b.x + lx * Math.cos(b.rot) + lz * Math.sin(b.rot)
    const wz = b.z - lx * Math.sin(b.rot) + lz * Math.cos(b.rot)
    lowestCorner = Math.min(lowestCorner, heightAt(wx, wz) - b.floorY)
  }
  const footingTop = 0.16
  const footingBottom = lowestCorner - 0.2
  boxMesh(
    group, kit.footing,
    b.width + 0.34, footingTop - footingBottom, b.depth + 0.34,
    0, (footingTop + footingBottom) / 2, 0,
  )

  // --- floor ---------------------------------------------------------------
  boxMesh(group, kit.plank[1], b.width - t, 0.08, b.depth - t, 0, 0.04, 0)

  // --- walls ---------------------------------------------------------------
  // back and sides run the full length; the front is split around the door
  plankWall(group, kit, b.width, h, t, 0, h / 2, -hd + t / 2, true)
  plankWall(group, kit, b.depth, h, t, -hw + t / 2, h / 2, 0, false)
  plankWall(group, kit, b.depth, h, t, hw - t / 2, h / 2, 0, false)

  const cheek = (b.width - DOOR_WIDTH) / 2
  const doorHeight = Math.min(DOOR_HEIGHT, h - 0.25)
  if (cheek > 0.05) {
    plankWall(group, kit, cheek, h, t, -hw + cheek / 2, h / 2, hd - t / 2, true)
    plankWall(group, kit, cheek, h, t, hw - cheek / 2, h / 2, hd - t / 2, true)
    // the lintel closes the wall above the opening
    plankWall(group, kit, DOOR_WIDTH, h - doorHeight, t, 0, doorHeight + (h - doorHeight) / 2, hd - t / 2, true)
  }

  // --- the doorway itself --------------------------------------------------
  // A recessed dark panel plus a frame. The frame is offset outwards from the
  // wall face rather than sharing a plane with it; two surfaces at exactly the
  // same depth is what made the old door frames flicker as you walked.
  const face = hd - t / 2
  boxMesh(group, kit.doorway, DOOR_WIDTH, doorHeight, 0.06, 0, doorHeight / 2, face - t / 2 - 0.02)
  const jamb = 0.1
  boxMesh(group, kit.beam, jamb, doorHeight + jamb, 0.14, -(DOOR_WIDTH + jamb) / 2, doorHeight / 2, face + t / 2 + 0.04)
  boxMesh(group, kit.beam, jamb, doorHeight + jamb, 0.14, (DOOR_WIDTH + jamb) / 2, doorHeight / 2, face + t / 2 + 0.04)
  boxMesh(group, kit.beam, DOOR_WIDTH + jamb * 2, jamb, 0.14, 0, doorHeight + jamb / 2, face + t / 2 + 0.04)

  // --- corner posts --------------------------------------------------------
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
    boxMesh(group, kit.post, 0.17, h + 0.1, 0.17, sx * (hw - 0.07), (h + 0.1) / 2, sz * (hd - 0.07))
  }

  // --- roof ----------------------------------------------------------------
  const overhang = 0.45
  const ridge = b.kind === 'barn' ? 1.5 : 1.15
  const roof = new THREE.Group()
  roof.position.y = h
  group.add(roof)

  const slopeLength = Math.hypot(hd + overhang, ridge)
  const pitch = Math.atan2(ridge, hd + overhang)
  for (const side of [-1, 1]) {
    const panel = new THREE.Group()
    const shingles = Math.max(3, Math.round(slopeLength / 0.4))
    for (let i = 0; i < shingles; i++) {
      const along = -slopeLength / 2 + (slopeLength / shingles) * (i + 0.5)
      const material = kit.shingle[i % kit.shingle.length]
      boxMesh(
        panel, material,
        b.width + overhang * 2, 0.08, (slopeLength / shingles) * 1.02,
        0, (i % 2) * 0.012, along,
      )
    }
    panel.rotation.x = side * pitch
    panel.position.set(0, ridge / 2, (side * (hd + overhang)) / 2)
    roof.add(panel)
  }

  // gable ends, filling the triangle under the ridge
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape()
    shape.moveTo(-hw, 0)
    shape.lineTo(hw, 0)
    shape.lineTo(0, ridge)
    shape.closePath()
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false })
    const gable = new THREE.Mesh(geo, kit.gable)
    gable.position.set(0, 0, side * hd - (side > 0 ? 0 : 0.12))
    gable.castShadow = true
    roof.add(gable)
  }

  // ridge beam
  boxMesh(roof, kit.beam, b.width + overhang * 2 + 0.1, 0.13, 0.16, 0, ridge, 0)

  // --- a window on each side, lit after dark -------------------------------
  const windows: THREE.Mesh[] = []
  for (const side of [-1, 1]) {
    const wx = side * (hw - t / 2)
    const frame = boxMesh(group, kit.beam, 0.1, 0.72, 0.86, wx, h * 0.58, 0)
    frame.castShadow = false
    const pane = boxMesh(group, kit.glow, 0.06, 0.56, 0.7, wx + side * 0.03, h * 0.58, 0)
    pane.name = 'window'
    pane.castShadow = false
    windows.push(pane)
  }

  // --- furniture -----------------------------------------------------------
  for (const f of furnitureOf(b)) {
    // furniture is positioned in world space by the model; bring it back into
    // this building's frame rather than recomputing it and risking a mismatch
    const cos = Math.cos(b.rot)
    const sin = Math.sin(b.rot)
    const dx = f.x - b.x
    const dz = f.z - b.z
    const lx = dx * cos - dz * sin
    const lz = dx * sin + dz * cos

    if (f.kind === 'bed') {
      boxMesh(group, kit.plank[3], 1.1, 0.32, 1.9, lx, 0.24, lz)
      boxMesh(group, mat('#c9bda4'), 0.98, 0.16, 1.5, lx, 0.46, lz - 0.1)
      boxMesh(group, mat('#dcd3bd'), 0.9, 0.14, 0.34, lx, 0.5, lz + 0.62)
    } else if (f.kind === 'hearth') {
      boxMesh(group, kit.footing, 1.0, 0.34, 1.0, lx, 0.17, lz)
      const embers = boxMesh(group, mat('#c4652c'), 0.5, 0.12, 0.5, lx, 0.38, lz)
      embers.name = 'embers'
      // chimney breast up the wall
      boxMesh(group, kit.footing, 0.9, h - 0.34, 0.35, lx, 0.34 + (h - 0.34) / 2, lz - 0.4)
    } else {
      boxMesh(group, kit.plank[0], 3, 0.12, 1.1, lx, 0.76, lz)
      for (const [ox, oz] of [[-1.3, -0.4], [1.3, -0.4], [-1.3, 0.4], [1.3, 0.4]] as const) {
        boxMesh(group, kit.post, 0.12, 0.76, 0.12, lx + ox, 0.38, lz + oz)
      }
    }
  }

  group.position.set(b.x, b.floorY, b.z)
  group.rotation.y = b.rot
  group.userData.windows = windows
  return group
}

/**
 * Collapse a built thing into one mesh per material.
 *
 * A building is described as a couple of hundred planks, posts and shingles
 * because that is the honest way to describe it, but drawing it that way costs
 * a draw call each and the whole hamlet came to nearly eight hundred. Baking
 * each material's geometry into a single buffer takes that to a handful, and
 * is why the architecture no longer hitches as you walk past it.
 *
 * Anything named is left alone, because the frame still needs to find it.
 */
function mergeByMaterial(group: THREE.Group): THREE.Group {
  const merged = new THREE.Group()
  merged.name = group.name
  merged.position.copy(group.position)
  merged.rotation.copy(group.rotation)
  merged.scale.copy(group.scale)
  merged.userData = group.userData

  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>()
  group.updateMatrixWorld(true)
  const toGroup = new THREE.Matrix4().copy(group.matrixWorld).invert()

  const keep: THREE.Object3D[] = []
  const visit = (object: THREE.Object3D): void => {
    // a named thing — a window pane, a flame, the berries on a bush — is one
    // the frame animates, so it and everything under it are left alone
    if (object !== group && object.name) {
      keep.push(object)
      return
    }
    if (object instanceof THREE.Mesh) {
      const material = object.material as THREE.Material
      const geometry = object.geometry.clone()
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toGroup, object.matrixWorld))
      const list = buckets.get(material)
      if (list) list.push(geometry)
      else buckets.set(material, [geometry])
    }
    for (const child of object.children) visit(child)
  }
  visit(group)

  for (const [material, geometries] of buckets) {
    const combined = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false)
    if (combined) {
      const mesh = new THREE.Mesh(combined, material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      merged.add(mesh)
      if (geometries.length > 1) for (const g of geometries) g.dispose()
      continue
    }
    // `mergeGeometries` returns null when the buffers do not have matching
    // attributes, which happens the moment an extruded shape shares a material
    // with a pile of boxes. Dropping the bucket on the floor is not an option:
    // it silently deleted every fourth plank of every wall, and the hamlet
    // came out full of horizontal slots you could see the sky through.
    for (const geometry of geometries) {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      merged.add(mesh)
    }
  }

  for (const object of keep) {
    // re-hang the named meshes off the merged group, in the same place
    object.matrix.copy(new THREE.Matrix4().multiplyMatrices(toGroup, object.matrixWorld))
    object.matrix.decompose(object.position, object.quaternion, object.scale)
    merged.add(object)
  }

  return merged
}

// ---------------------------------------------------------------- dressing

function buildDressing(kind: string, kit: Kit): THREE.Group {
  const g = new THREE.Group()
  switch (kind) {
    case 'well': {
      boxMesh(g, kit.footing, 1.7, 0.7, 1.7, 0, 0.35, 0)
      boxMesh(g, mat('#2c3238'), 1.2, 0.06, 1.2, 0, 0.68, 0)
      for (const side of [-1, 1]) {
        boxMesh(g, kit.post, 0.14, 1.5, 0.14, side * 0.7, 1.4, 0)
      }
      boxMesh(g, kit.beam, 1.7, 0.14, 0.14, 0, 2.15, 0)
      boxMesh(g, kit.shingle[0], 2.1, 0.1, 1.5, 0, 2.28, 0)
      boxMesh(g, kit.plank[1], 0.42, 0.36, 0.42, 0, 1.75, 0)
      break
    }
    case 'firepit': {
      boxMesh(g, kit.footing, 1.5, 0.24, 1.5, 0, 0.12, 0)
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        const log = boxMesh(g, kit.beam, 0.14, 0.14, 0.9, Math.sin(a) * 0.25, 0.3, Math.cos(a) * 0.25)
        log.rotation.set(0.5, a, 0)
      }
      const flame = boxMesh(g, new THREE.MeshBasicMaterial({ color: '#ff9b42' }), 0.4, 0.5, 0.4, 0, 0.5, 0)
      flame.name = 'flame'
      flame.castShadow = false
      break
    }
    case 'bench': {
      boxMesh(g, kit.plank[0], 1.8, 0.14, 0.44, 0, 0.42, 0)
      for (const side of [-1, 1]) {
        boxMesh(g, kit.post, 0.14, 0.42, 0.34, side * 0.7, 0.21, 0)
      }
      break
    }
    case 'woodpile': {
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 4; i++) {
          const log = boxMesh(
            g, kit.beam, 0.16, 0.16, 1.7,
            -0.3 + i * 0.2, 0.1 + row * 0.19, (row % 2) * 0.05,
          )
          log.rotation.z = Math.PI / 2
          log.rotation.y = 0
        }
      }
      break
    }
    case 'barrel': {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.3, 0.85, 10),
        kit.plank[3],
      )
      barrel.position.y = 0.425
      barrel.castShadow = true
      g.add(barrel)
      for (const y of [0.2, 0.65]) {
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.025, 6, 12), kit.beam)
        hoop.rotation.x = Math.PI / 2
        hoop.position.y = y
        g.add(hoop)
      }
      break
    }
    case 'rack': {
      for (const side of [-1, 1]) {
        boxMesh(g, kit.post, 0.12, 1.7, 0.12, side * 1.1, 0.85, 0)
      }
      boxMesh(g, kit.beam, 2.4, 0.1, 0.1, 0, 1.65, 0)
      for (let i = 0; i < 3; i++) {
        boxMesh(g, mat('#d8cfba'), 0.5, 0.7, 0.04, -0.7 + i * 0.7, 1.25, 0)
      }
      break
    }
    case 'berrybush': {
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), mat('#4c7a3f'))
      bush.position.y = 0.55
      bush.scale.set(1, 0.85, 1)
      bush.castShadow = true
      g.add(bush)
      const berries = new THREE.Group()
      berries.name = 'berries'
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2
        const berry = new THREE.Mesh(
          new THREE.SphereGeometry(0.075, 6, 5),
          new THREE.MeshLambertMaterial({ color: '#b83a55' }),
        )
        berry.position.set(Math.sin(a) * 0.5, 0.5 + Math.cos(i * 2.3) * 0.22, Math.cos(a) * 0.5)
        berries.add(berry)
      }
      g.add(berries)
      break
    }
    case 'ball': {
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), mat('#d9a441'))
      ball.position.y = 0.28
      ball.castShadow = true
      g.add(ball)
      break
    }
    default:
      break
  }
  return g
}

// ---------------------------------------------------------------- the village

export interface VillageView {
  group: THREE.Group
  /** window panes, brightened after dark */
  windows: THREE.MeshBasicMaterial[]
  /** fire and ember meshes, flickered each frame */
  fires: THREE.Mesh[]
  /** berry clusters, hidden as the bushes are eaten down */
  berries: Map<string, THREE.Group>
  dispose(): void
}

export function buildVillageView(model: VillageModel): VillageView {
  const kit = makeKit()
  const group = new THREE.Group()
  group.name = 'village'
  const windows: THREE.MeshBasicMaterial[] = []
  const fires: THREE.Mesh[] = []
  const berries = new Map<string, THREE.Group>()

  for (const b of model.buildings) {
    const mesh = mergeByMaterial(buildOne(b, kit))
    group.add(mesh)
    for (const pane of (mesh.userData.windows as THREE.Mesh[]) ?? []) {
      windows.push(pane.material as THREE.MeshBasicMaterial)
    }
    mesh.traverse((o) => {
      if (o.name === 'embers' && o instanceof THREE.Mesh) fires.push(o)
    })
  }

  for (const d of model.dressing) {
    const mesh = mergeByMaterial(buildDressing(d.kind, kit))
    // planted on the ground, every time, from the same height function the
    // player walks on — this is why nothing floats
    mesh.position.set(d.x, heightAt(d.x, d.z), d.z)
    mesh.rotation.y = d.rot
    mesh.scale.setScalar(d.scale)
    group.add(mesh)

    mesh.traverse((o) => {
      if (o.name === 'flame' && o instanceof THREE.Mesh) fires.push(o)
    })
    if (d.kind === 'berrybush') {
      const cluster = mesh.getObjectByName('berries')
      const place = model.places.find(
        (p) => p.kind === 'food' && Math.hypot(p.x - d.x, p.z - d.z) < 0.01,
      )
      if (cluster && place) berries.set(place.id, cluster as THREE.Group)
    }
  }

  return {
    group,
    windows,
    fires,
    berries,
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose()
      })
      group.clear()
    },
  }
}
