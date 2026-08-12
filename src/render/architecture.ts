/**
 * architecture — everything in the valley that somebody built.
 *
 * All of it is generated in code from a small kit of parts (posts, planks,
 * plaster panels, tiled roofs) so the settlement shares one look with the
 * scattered nature models: flat-shaded, untextured, readable at a glance.
 * Each building is merged down to one mesh per material before it goes in the
 * scene, so eighteen buildings and their fences cost a couple of dozen draws.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { TOWERS, type Tower, type TowerKind } from '../lab/world'
import { heightAt, BRIDGE, distToRoad, ROADS } from '../world/terrain'
import { LANDMARKS, type Landmark } from '../world/lore'

// ---------------------------------------------------------------- materials

export interface Kit {
  plaster: THREE.MeshLambertMaterial
  plasterWarm: THREE.MeshLambertMaterial
  timber: THREE.MeshLambertMaterial
  darkTimber: THREE.MeshLambertMaterial
  stone: THREE.MeshLambertMaterial
  paleStone: THREE.MeshLambertMaterial
  roof: THREE.MeshLambertMaterial
  roofAlt: THREE.MeshLambertMaterial
  thatch: THREE.MeshLambertMaterial
  cloth: THREE.MeshLambertMaterial
  clothAlt: THREE.MeshLambertMaterial
  metal: THREE.MeshLambertMaterial
  glow: THREE.MeshStandardMaterial
  soil: THREE.MeshLambertMaterial
  leaf: THREE.MeshLambertMaterial
}

function lambert(color: string): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: true })
}

export function makeKit(): Kit {
  return {
    plaster: lambert('#d9cdb4'),
    plasterWarm: lambert('#e2c9a2'),
    timber: lambert('#8a5e3b'),
    darkTimber: lambert('#5d3d28'),
    stone: lambert('#8d8a82'),
    paleStone: lambert('#b3ada0'),
    roof: lambert('#8e4436'),
    roofAlt: lambert('#5d6b74'),
    thatch: lambert('#b99a56'),
    cloth: lambert('#b8503f'),
    clothAlt: lambert('#3f6f8f'),
    metal: lambert('#5a5f66'),
    glow: new THREE.MeshStandardMaterial({
      color: '#ffd9a0',
      emissive: new THREE.Color('#ffb14a'),
      emissiveIntensity: 0,
      flatShading: true,
    }),
    soil: lambert('#6b4f34'),
    leaf: lambert('#4f7a3a'),
  }
}

// ---------------------------------------------------------------- kit parts

function box(
  parent: THREE.Object3D, mat: THREE.Material,
  w: number, h: number, d: number,
  x: number, y: number, z: number, ry = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  mesh.position.set(x, y, z)
  mesh.rotation.y = ry
  parent.add(mesh)
  return mesh
}

function cyl(
  parent: THREE.Object3D, mat: THREE.Material,
  rt: number, rb: number, h: number, seg: number,
  x: number, y: number, z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat)
  mesh.position.set(x, y, z)
  parent.add(mesh)
  return mesh
}

/** A gabled roof: two sloped slabs plus the triangular ends. */
function gableRoof(
  parent: THREE.Object3D, mat: THREE.Material, gableMat: THREE.Material,
  w: number, d: number, rise: number, y: number, overhang = 0.45,
): void {
  const W = w + overhang * 2
  const D = d + overhang * 2
  const slope = Math.hypot(W / 2, rise)
  const angle = Math.atan2(rise, W / 2)
  for (const side of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(slope, 0.22, D), mat)
    slab.position.set((side * W) / 4, y + rise / 2, 0)
    slab.rotation.z = -side * angle
    slab.castShadow = true
    slab.receiveShadow = true
    parent.add(slab)
  }
  // the triangular gable ends, drawn as a thin extruded triangle
  const shape = new THREE.Shape()
  shape.moveTo(-w / 2, 0)
  shape.lineTo(w / 2, 0)
  shape.lineTo(0, rise)
  shape.closePath()
  for (const side of [-1, 1]) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false })
    const end = new THREE.Mesh(geo, gableMat)
    end.position.set(0, y, (side * d) / 2 - (side < 0 ? 0 : 0.16) + (side < 0 ? -0.0 : 0))
    end.castShadow = true
    parent.add(end)
  }
}

/** A shallow hipped roof, for the grander buildings. */
function hipRoof(
  parent: THREE.Object3D, mat: THREE.Material,
  w: number, d: number, rise: number, y: number,
): void {
  const geo = new THREE.CylinderGeometry(0.001, Math.max(w, d) * 0.72, rise, 4)
  const roof = new THREE.Mesh(geo, mat)
  roof.rotation.y = Math.PI / 4
  roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d))
  roof.position.set(0, y + rise / 2, 0)
  roof.castShadow = true
  roof.receiveShadow = true
  parent.add(roof)
}

/** Half-timbered wall panels: the beams that make a village look like one. */
function timberFrame(
  parent: THREE.Object3D, mat: THREE.Material,
  w: number, h: number, d: number, y: number,
): void {
  const t = 0.16
  for (const dz of [-d / 2, d / 2]) {
    box(parent, mat, w + 0.04, t, t, 0, y + h - t / 2, dz)
    box(parent, mat, w + 0.04, t, t, 0, y + t / 2, dz)
    const posts = Math.max(2, Math.round(w / 2))
    for (let i = 0; i <= posts; i++) {
      const x = -w / 2 + (w * i) / posts
      box(parent, mat, t, h, t, x, y + h / 2, dz)
    }
  }
  for (const dx of [-w / 2, w / 2]) {
    box(parent, mat, t, t, d + 0.04, dx, y + h - t / 2, 0)
    box(parent, mat, t, t, d + 0.04, dx, y + t / 2, 0)
    const posts = Math.max(2, Math.round(d / 2))
    for (let i = 0; i <= posts; i++) {
      const z = -d / 2 + (d * i) / posts
      box(parent, mat, t, h, t, dx, y + h / 2, z)
    }
  }
}

interface WindowSpec {
  glow: THREE.Mesh[]
}

function windows(
  parent: THREE.Object3D, kit: Kit, out: WindowSpec,
  w: number, d: number, y: number, count: number,
): void {
  const make = (x: number, z: number, ry: number) => {
    const frame = box(parent, kit.darkTimber, 0.9, 1.0, 0.12, x, y, z, ry)
    frame.castShadow = false
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.78, 0.08), kit.glow)
    pane.position.set(x, y, z)
    pane.rotation.y = ry
    pane.translateZ(0.06)
    parent.add(pane)
    out.glow.push(pane)
  }
  for (let i = 0; i < count; i++) {
    const f = (i + 1) / (count + 1)
    make(-w / 2 + w * f, d / 2 + 0.03, 0)
    make(-w / 2 + w * f, -d / 2 - 0.03, Math.PI)
  }
  const side = Math.max(1, Math.floor(count / 2))
  for (let i = 0; i < side; i++) {
    const f = (i + 1) / (side + 1)
    make(w / 2 + 0.03, -d / 2 + d * f, Math.PI / 2)
    make(-w / 2 - 0.03, -d / 2 + d * f, -Math.PI / 2)
  }
}

function door(parent: THREE.Object3D, kit: Kit, w: number, d: number): void {
  const frame = box(parent, kit.darkTimber, 1.3, 2.1, 0.16, 0, 1.05, d / 2 + 0.02)
  frame.castShadow = false
  box(parent, kit.timber, 1.05, 1.9, 0.1, 0, 1.0, d / 2 + 0.1)
  // step
  box(parent, kit.paleStone, 1.8, 0.16, 0.7, 0, 0.08, d / 2 + 0.42)
  void w
}

/** A hanging sign, painted in the building's own colour. */
function signboard(parent: THREE.Object3D, kit: Kit, color: string, d: number): void {
  const post = box(parent, kit.darkTimber, 0.14, 1.0, 0.14, 1.5, 2.9, d / 2 + 0.3)
  post.castShadow = true
  box(parent, kit.darkTimber, 1.0, 0.12, 0.12, 1.05, 3.3, d / 2 + 0.3)
  const plank = box(parent, kit.timber, 1.15, 0.8, 0.1, 0.75, 2.85, d / 2 + 0.3)
  plank.castShadow = true
  const emblem = new THREE.Mesh(
    new THREE.CircleGeometry(0.26, 12),
    new THREE.MeshLambertMaterial({ color, flatShading: true }),
  )
  emblem.position.set(0.75, 2.85, d / 2 + 0.36)
  parent.add(emblem)
}

// ---------------------------------------------------------------- buildings

export interface BuiltPlace {
  group: THREE.Group
  /** panes and lanterns that should light up after dark */
  glow: THREE.Mesh[]
  /** where a lamp should hang, for the point-light pool */
  lamps: THREE.Vector3[]
}

function buildHouse(kit: Kit, t: Tower, out: BuiltPlace): void {
  const g = out.group
  const w = 6.2
  const d = 5.4
  const h = 3.1
  box(g, kit.paleStone, w + 0.5, 0.5, d + 0.5, 0, 0.25, 0)
  box(g, kit.plaster, w, h, d, 0, 0.5 + h / 2, 0)
  timberFrame(g, kit.darkTimber, w, h, d, 0.5)
  gableRoof(g, kit.roof, kit.plasterWarm, w, d, 2.4, 0.5 + h)
  door(g, kit, w, d)
  windows(g, kit, out, w, d, 2.0, 2)
  // chimney with a cap
  const ch = box(g, kit.stone, 0.9, 3.2, 0.9, w / 2 - 1.2, 0.5 + h + 0.8, -d / 2 + 1.2)
  ch.castShadow = true
  box(g, kit.stone, 1.1, 0.2, 1.1, w / 2 - 1.2, 0.5 + h + 2.5, -d / 2 + 1.2)
  signboard(g, kit, t.color, d)
  out.lamps.push(new THREE.Vector3(0, 2.6, d / 2 + 0.5))
}

function buildShop(kit: Kit, t: Tower, out: BuiltPlace): void {
  const g = out.group
  const w = 7
  const d = 6
  const h = 3.4
  box(g, kit.paleStone, w + 0.6, 0.5, d + 0.6, 0, 0.25, 0)
  box(g, kit.plasterWarm, w, h, d, 0, 0.5 + h / 2, 0)
  timberFrame(g, kit.darkTimber, w, h, d, 0.5)
  gableRoof(g, kit.roofAlt, kit.plaster, w, d, 2.1, 0.5 + h)
  door(g, kit, w, d)
  windows(g, kit, out, w, d, 2.1, 2)
  // shop counter under a striped awning
  const awning = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 2.0), kit.cloth)
  awning.position.set(-1.2, 3.0, d / 2 + 1.0)
  awning.rotation.x = -0.22
  awning.castShadow = true
  g.add(awning)
  box(g, kit.timber, 0.14, 2.4, 0.14, -3.1, 1.2, d / 2 + 1.8)
  box(g, kit.timber, 0.14, 2.4, 0.14, 0.7, 1.2, d / 2 + 1.8)
  box(g, kit.timber, 4.2, 0.24, 1.1, -1.2, 1.1, d / 2 + 1.2)
  signboard(g, kit, t.color, d)
  out.lamps.push(new THREE.Vector3(-1.2, 2.8, d / 2 + 1.6))
}

function buildHall(kit: Kit, t: Tower, out: BuiltPlace): void {
  const g = out.group
  const w = 10
  const d = 8
  const h = 5.2
  box(g, kit.stone, w + 1.0, 0.7, d + 1.0, 0, 0.35, 0)
  box(g, kit.plaster, w, h, d, 0, 0.7 + h / 2, 0)
  timberFrame(g, kit.darkTimber, w, h, d, 0.7)
  hipRoof(g, kit.roof, w + 1.6, d + 1.6, 3.2, 0.7 + h)
  // a porch with columns, which is what makes a building look civic
  for (const x of [-2.2, 2.2]) {
    cyl(g, kit.paleStone, 0.32, 0.36, 3.4, 8, x, 1.7, d / 2 + 1.4).castShadow = true
  }
  const porch = box(g, kit.roofAlt, 6.2, 0.3, 3.4, 0, 3.55, d / 2 + 1.0)
  porch.castShadow = true
  box(g, kit.darkTimber, 1.8, 2.6, 0.18, 0, 2.0, d / 2 + 0.02)
  box(g, kit.paleStone, 6.6, 0.2, 1.2, 0, 0.8, d / 2 + 2.4)
  box(g, kit.paleStone, 7.0, 0.2, 1.2, 0, 0.6, d / 2 + 3.2)
  windows(g, kit, out, w, d, 3.0, 3)
  signboard(g, kit, t.color, d + 2)
  out.lamps.push(new THREE.Vector3(-2.6, 3.2, d / 2 + 1.4))
  out.lamps.push(new THREE.Vector3(2.6, 3.2, d / 2 + 1.4))
}

function buildMarket(kit: Kit, t: Tower, out: BuiltPlace): void {
  const g = out.group
  // a small lock-up at the back, and stalls in front of it
  const w = 6
  const d = 5
  const h = 3
  const lockup = new THREE.Group()
  lockup.position.z = -2.5
  g.add(lockup)
  box(lockup, kit.paleStone, w + 0.5, 0.4, d + 0.5, 0, 0.2, 0)
  box(lockup, kit.plasterWarm, w, h, d, 0, 0.4 + h / 2, 0)
  timberFrame(lockup, kit.darkTimber, w, h, d, 0.4)
  gableRoof(lockup, kit.roof, kit.plasterWarm, w, d, 1.9, 0.4 + h)
  windows(lockup, kit, out, w, d, 2.0, 2)
  box(lockup, kit.darkTimber, 1.3, 2.1, 0.14, 0, 1.45, d / 2 + 0.02)

  const stallColors = [kit.cloth, kit.clothAlt, kit.cloth]
  for (let i = 0; i < 3; i++) {
    const sx = -4.6 + i * 4.6
    const sz = 3.2
    for (const dx of [-1.7, 1.7]) {
      for (const dz of [-1.1, 1.1]) {
        box(g, kit.timber, 0.13, 2.3, 0.13, sx + dx, 1.15, sz + dz)
      }
    }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.12, 2.8), stallColors[i])
    canopy.position.set(sx, 2.45, sz)
    canopy.rotation.x = 0.1
    canopy.castShadow = true
    g.add(canopy)
    box(g, kit.timber, 3.7, 0.2, 1.5, sx, 1.05, sz - 0.4)
    // produce: a couple of crates and a sack
    box(g, kit.darkTimber, 0.7, 0.7, 0.7, sx - 1.1, 1.5, sz - 0.4)
    box(g, kit.darkTimber, 0.6, 0.6, 0.6, sx + 1.0, 1.45, sz - 0.5)
    cyl(g, kit.thatch, 0.36, 0.42, 0.7, 7, sx + 0.1, 1.5, sz - 0.45)
    out.lamps.push(new THREE.Vector3(sx, 2.4, sz))
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.26), kit.glow)
    lamp.position.set(sx + 1.7, 2.25, sz + 1.1)
    g.add(lamp)
    out.glow.push(lamp)
  }
  signboard(g, kit, t.color, d)
}

function buildYard(kit: Kit, t: Tower, out: BuiltPlace): void {
  const g = out.group
  // open shed
  const w = 7
  const d = 5
  for (const dx of [-w / 2, w / 2]) {
    for (const dz of [-d / 2, d / 2]) {
      box(g, kit.timber, 0.26, 3.0, 0.26, dx, 1.5, dz - 1.5)
    }
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.24, d + 1.2), kit.roofAlt)
  roof.position.set(0, 3.2, -1.5)
  roof.rotation.x = 0.14
  roof.castShadow = true
  g.add(roof)
  box(g, kit.darkTimber, w, 2.4, 0.3, 0, 1.2, -d / 2 - 1.5)

  // workbench, anvil, log pile, barrels
  box(g, kit.timber, 3.0, 0.24, 1.2, -1.4, 1.0, -1.4)
  for (const dx of [-2.6, -0.2]) box(g, kit.darkTimber, 0.2, 1.0, 0.2, dx, 0.5, -1.4)
  cyl(g, kit.metal, 0.5, 0.62, 0.8, 6, 2.0, 0.4, -1.2).castShadow = true
  box(g, kit.metal, 1.3, 0.5, 0.55, 2.0, 1.05, -1.2)
  for (let i = 0; i < 5; i++) {
    const log = cyl(g, kit.darkTimber, 0.24, 0.24, 2.4, 7, -3.2 + (i % 3) * 0.5, 0.24 + Math.floor(i / 3) * 0.46, 2.2)
    log.rotation.z = Math.PI / 2
    log.castShadow = true
  }
  for (let i = 0; i < 3; i++) {
    cyl(g, kit.timber, 0.42, 0.48, 1.0, 8, 3.0 + i * 1.1, 0.5, 1.8).castShadow = true
  }
  // a brazier that burns after dark
  cyl(g, kit.metal, 0.4, 0.28, 0.5, 8, 0, 0.75, 2.6)
  for (const dx of [-0.25, 0.25]) box(g, kit.metal, 0.08, 0.9, 0.08, dx, 0.45, 2.6)
  const fire = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), kit.glow)
  fire.position.set(0, 1.0, 2.6)
  g.add(fire)
  out.glow.push(fire)
  out.lamps.push(new THREE.Vector3(0, 1.2, 2.6))
  signboard(g, kit, t.color, d)
}

function buildField(kit: Kit, t: Tower, out: BuiltPlace): void {
  const g = out.group
  // a barn
  const w = 8
  const d = 6
  const h = 3.6
  box(g, kit.darkTimber, w, h, d, -1, h / 2, -4)
  gableRoof(g, kit.roof, kit.darkTimber, w, d, 2.6, h)
  box(g, kit.timber, 2.6, 2.8, 0.2, -1, 1.4, -4 + d / 2 + 0.02)
  windows(g, kit, out, w, d, 2.4, 1)
  g.children[g.children.length - 1].position.z -= 4

  // ploughed rows
  for (let i = 0; i < 7; i++) {
    const row = box(g, kit.soil, 14, 0.16, 0.9, 0, 0.08, 1 + i * 1.5)
    row.receiveShadow = true
  }
  // a scarecrow, because a field needs a silhouette
  box(g, kit.timber, 0.16, 2.4, 0.16, 5, 1.2, 4)
  box(g, kit.timber, 1.8, 0.14, 0.14, 5, 1.9, 4)
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), kit.thatch)
  head.position.set(5, 2.5, 4)
  head.castShadow = true
  g.add(head)
  box(g, kit.cloth, 1.1, 1.0, 0.2, 5, 1.6, 4)
  signboard(g, kit, t.color, d)
}

function buildGrove(kit: Kit, t: Tower, out: BuiltPlace): void {
  const g = out.group
  // a ring of benches around a fire circle
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    const bx = Math.cos(a) * 3.6
    const bz = Math.sin(a) * 3.6
    const bench = new THREE.Group()
    box(bench, kit.timber, 2.2, 0.16, 0.5, 0, 0.5, 0)
    box(bench, kit.darkTimber, 0.2, 0.5, 0.4, -0.9, 0.25, 0)
    box(bench, kit.darkTimber, 0.2, 0.5, 0.4, 0.9, 0.25, 0)
    bench.position.set(bx, 0, bz)
    bench.rotation.y = -a
    g.add(bench)
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    cyl(g, kit.stone, 0.26, 0.3, 0.3, 6, Math.cos(a) * 1.3, 0.15, Math.sin(a) * 1.3)
  }
  const fire = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), kit.glow)
  fire.position.set(0, 0.35, 0)
  g.add(fire)
  out.glow.push(fire)
  out.lamps.push(new THREE.Vector3(0, 0.7, 0))
  signboard(g, kit, t.color, 3)
}

function buildGraveyard(kit: Kit, t: Tower, out: BuiltPlace): void {
  const g = out.group
  // low wall with a gate
  const r = 7.5
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2
    if (a > 3.6 && a < 4.3) continue // the gap the gate stands in
    const seg = box(g, kit.stone, 1.3, 0.8, 0.5, Math.cos(a) * r, 0.4, Math.sin(a) * r)
    seg.rotation.y = -a
    seg.castShadow = true
  }
  for (const dx of [-1.2, 1.2]) {
    box(g, kit.paleStone, 0.5, 2.6, 0.5, dx, 1.3, r - 0.6)
  }
  box(g, kit.darkTimber, 3.2, 0.24, 0.3, 0, 2.5, r - 0.6)
  signboard(g, kit, t.color, r)
  out.lamps.push(new THREE.Vector3(0, 2.4, r - 0.6))
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.4, 0.28), kit.glow)
  lamp.position.set(0, 2.3, r - 0.6)
  g.add(lamp)
  out.glow.push(lamp)
}

const BUILDERS: Record<TowerKind, (kit: Kit, t: Tower, out: BuiltPlace) => void> = {
  house: buildHouse,
  shop: buildShop,
  hall: buildHall,
  market: buildMarket,
  yard: buildYard,
  field: buildField,
  grove: buildGrove,
  graveyard: buildGraveyard,
  stone: buildGrove,
}

// ---------------------------------------------------------------- merging

/**
 * Flatten a group into one mesh per material. Buildings are static, so this
 * turns a hundred little boxes into a handful of draw calls.
 */
export function mergeByMaterial(group: THREE.Object3D, keep: Set<THREE.Object3D>): THREE.Group {
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>()
  const kept: THREE.Object3D[] = []
  group.updateMatrixWorld(true)

  group.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    if (keep.has(mesh)) {
      kept.push(mesh)
      return
    }
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    const geo = mesh.geometry.clone()
    geo.applyMatrix4(mesh.matrixWorld)
    for (const attr of Object.keys(geo.attributes)) {
      if (attr !== 'position' && attr !== 'normal') geo.deleteAttribute(attr)
    }
    if (!geo.attributes.normal) geo.computeVertexNormals()
    const list = buckets.get(mat) ?? []
    list.push(geo.index ? geo.toNonIndexed() : geo)
    buckets.set(mat, list)
  })

  const out = new THREE.Group()
  for (const [mat, geos] of buckets) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)
    if (!merged) continue
    const mesh = new THREE.Mesh(merged, mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    out.add(mesh)
  }
  for (const k of kept) {
    k.updateMatrixWorld(true)
    const clone = k.clone()
    clone.position.setFromMatrixPosition(k.matrixWorld)
    clone.quaternion.setFromRotationMatrix(k.matrixWorld)
    out.add(clone)
  }
  return out
}

// ---------------------------------------------------------------- the village

export interface VillageBuild {
  group: THREE.Group
  glow: THREE.Mesh[]
  lamps: THREE.Vector3[]
  /** obstacles the player and creatures should not walk through */
  colliders: { x: number; z: number; r: number }[]
}

/** Every building in the register, placed on the terrain and merged. */
export function buildVillage(kit: Kit): VillageBuild {
  const root = new THREE.Group()
  root.name = 'village'
  const glow: THREE.Mesh[] = []
  const lamps: THREE.Vector3[] = []
  const colliders: { x: number; z: number; r: number }[] = []

  for (const t of TOWERS) {
    const place: BuiltPlace = { group: new THREE.Group(), glow: [], lamps: [] }
    const builder = BUILDERS[t.kind] ?? buildHouse
    builder(kit, t, place)

    place.group.position.set(t.x, heightAt(t.x, t.z), t.z)
    place.group.rotation.y = t.facing
    place.group.updateMatrixWorld(true)

    for (const m of place.glow) {
      const world = new THREE.Vector3()
      m.getWorldPosition(world)
      glow.push(m)
    }
    for (const l of place.lamps) {
      lamps.push(l.clone().applyMatrix4(place.group.matrixWorld))
    }

    // a building blocks movement, but a grove or a field does not
    if (t.kind !== 'grove' && t.kind !== 'field' && t.kind !== 'graveyard') {
      colliders.push({ x: t.x, z: t.z, r: t.radius * 0.62 })
    }
    root.add(place.group)
  }

  addDressing(kit, root)
  addPlaza(kit, root, glow, lamps, colliders)
  addRoadLamps(kit, root, glow, lamps)
  addBridge(kit, root)
  addLandmarks(kit, root, glow, lamps, colliders)

  return { group: root, glow, lamps, colliders }
}

/**
 * The clutter that makes a settlement look inhabited rather than sited:
 * barrels by a shop wall, a cart in a yard, a garden fence and a washing line
 * outside a cottage, sacks of grain at the barn. Deterministic per building,
 * so it is the same village every time you load it.
 */
function addDressing(kit: Kit, root: THREE.Group): void {
  const g = new THREE.Group()

  for (const t of TOWERS) {
    const place = new THREE.Group()
    place.position.set(t.x, heightAt(t.x, t.z), t.z)
    place.rotation.y = t.facing
    const seed = t.x * 31 + t.z * 17
    const rnd = (n: number): number => {
      const s = Math.sin(seed * (n + 1) * 12.9898) * 43758.5453
      return s - Math.floor(s)
    }

    if (t.kind === 'house') {
      // a low garden fence along the front, and a washing line at the side
      for (let i = -3; i <= 3; i++) {
        box(place, kit.timber, 0.13, 0.9, 0.13, i * 1.1, 0.45, 4.4)
        if (i < 3) box(place, kit.timber, 1.1, 0.09, 0.07, i * 1.1 + 0.55, 0.66, 4.4)
      }
      for (const dx of [-4.4, 4.4]) box(place, kit.darkTimber, 0.16, 2.4, 0.16, dx, 1.2, -1)
      box(place, kit.paleStone, 8.6, 0.05, 0.05, 0, 2.3, -1)
      for (let i = 0; i < 4; i++) {
        const cloth = box(place, i % 2 ? kit.cloth : kit.clothAlt, 0.8, 0.9, 0.04, -3 + i * 2, 1.8, -1)
        cloth.rotation.y = (rnd(i) - 0.5) * 0.3
      }
      // a woodpile and a planter
      for (let i = 0; i < 4; i++) {
        const logMesh = cyl(place, kit.darkTimber, 0.16, 0.16, 1.4, 6, -3.6, 0.18 + Math.floor(i / 2) * 0.34, 1.2 + (i % 2) * 0.36)
        logMesh.rotation.z = Math.PI / 2
      }
      box(place, kit.timber, 1.3, 0.4, 0.6, 2.6, 0.2, 3.6)
      box(place, kit.leaf, 1.1, 0.25, 0.45, 2.6, 0.5, 3.6)
    }

    if (t.kind === 'shop' || t.kind === 'market') {
      for (let i = 0; i < 3; i++) {
        cyl(place, kit.timber, 0.36, 0.42, 0.9, 8, -4 - i * 0.9, 0.45, -2 + rnd(i) * 1.4)
      }
      box(place, kit.darkTimber, 0.8, 0.8, 0.8, 4.2, 0.4, -1.6)
      box(place, kit.darkTimber, 0.7, 0.7, 0.7, 4.4, 1.15, -1.5)
    }

    if (t.kind === 'hall') {
      for (const dx of [-5.4, 5.4]) {
        box(place, kit.paleStone, 0.9, 0.5, 0.9, dx, 0.25, 6.2)
        box(place, kit.leaf, 0.8, 0.4, 0.8, dx, 0.66, 6.2)
      }
      // a bench either side of the door
      for (const dx of [-3.6, 3.6]) {
        box(place, kit.timber, 1.8, 0.14, 0.45, dx, 0.5, 5.4)
        box(place, kit.darkTimber, 0.16, 0.5, 0.4, dx - 0.7, 0.25, 5.4)
        box(place, kit.darkTimber, 0.16, 0.5, 0.4, dx + 0.7, 0.25, 5.4)
      }
    }

    if (t.kind === 'yard') {
      // a handcart
      const cart = new THREE.Group()
      cart.position.set(-4.5, 0, 3.4)
      cart.rotation.y = 0.6
      box(cart, kit.timber, 2.2, 0.16, 1.3, 0, 0.7, 0)
      box(cart, kit.timber, 2.2, 0.5, 0.1, 0, 0.95, -0.6)
      box(cart, kit.timber, 2.2, 0.5, 0.1, 0, 0.95, 0.6)
      for (const dz of [-0.7, 0.7]) {
        const wheel = cyl(cart, kit.darkTimber, 0.5, 0.5, 0.12, 10, 0.4, 0.5, dz)
        wheel.rotation.x = Math.PI / 2
      }
      box(cart, kit.timber, 1.6, 0.1, 0.1, -1.7, 0.75, 0)
      g.add(cart.clone())
      cart.position.set(t.x - 4.5, heightAt(t.x, t.z), t.z + 3.4)
      place.add(cart)
    }

    if (t.kind === 'field') {
      for (let i = 0; i < 5; i++) {
        cyl(place, kit.thatch, 0.42, 0.5, 0.9, 7, 4 + (i % 2) * 1.1, 0.45, -6 + Math.floor(i / 2) * 1.2)
      }
      // fence around the ploughed rows
      for (let i = -7; i <= 7; i++) {
        box(place, kit.timber, 0.12, 0.85, 0.12, i * 1.2, 0.42, 10.5)
        box(place, kit.timber, 1.2, 0.08, 0.06, i * 1.2 + 0.6, 0.62, 10.5)
      }
    }

    if (t.kind === 'graveyard') {
      for (let i = 0; i < 7; i++) {
        const a = rnd(i) * Math.PI * 2
        const r = 2 + rnd(i + 9) * 4
        const stone = box(place, kit.paleStone, 0.5, 0.8, 0.16, Math.cos(a) * r, 0.4, Math.sin(a) * r)
        stone.rotation.y = a
        stone.rotation.z = (rnd(i + 3) - 0.5) * 0.16
      }
    }

    g.add(place)
  }

  root.add(g)
}

/** The well, the notice board, and the crossroads dressing. */
function addPlaza(
  kit: Kit, root: THREE.Group, glow: THREE.Mesh[], lamps: THREE.Vector3[],
  colliders: { x: number; z: number; r: number }[],
): void {
  const g = new THREE.Group()
  const y = heightAt(0, 0)
  g.position.set(0, y, 0)

  // the well: a drum of stone with a coping, a shingled roof, and a bucket
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.62, 0.95, 14, 1, true), kit.stone)
  drum.position.y = 0.48
  drum.castShadow = true
  drum.receiveShadow = true
  ;(drum.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide
  g.add(drum)
  const coping = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 1.72, 0.2, 14), kit.paleStone)
  coping.position.y = 1.0
  coping.castShadow = true
  g.add(coping)
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(1.42, 16),
    new THREE.MeshLambertMaterial({ color: '#1d3a4a', flatShading: true }),
  )
  water.rotation.x = -Math.PI / 2
  water.position.y = 0.6
  g.add(water)
  for (const dx of [-1.5, 1.5]) box(g, kit.darkTimber, 0.18, 2.4, 0.18, dx, 2.2, 0)
  gableRoof(g, kit.roof, kit.darkTimber, 3.6, 2.2, 0.9, 3.3, 0.3)
  box(g, kit.darkTimber, 0.14, 0.14, 1.5, 0, 3.15, 0)
  const bucket = cyl(g, kit.timber, 0.3, 0.26, 0.42, 8, 0, 2.3, 0)
  bucket.castShadow = true
  box(g, kit.metal, 0.03, 0.85, 0.03, 0, 2.75, 0)
  colliders.push({ x: 0, z: 0, r: 1.9 })

  // the notice board, where Haven posts what it needs
  const board = new THREE.Group()
  board.position.set(4.5, 0, 3.2)
  board.rotation.y = -0.6
  for (const dx of [-1.1, 1.1]) box(board, kit.darkTimber, 0.18, 2.2, 0.18, dx, 1.1, 0)
  box(board, kit.timber, 2.6, 1.5, 0.14, 0, 1.7, 0)
  box(board, kit.roof, 2.9, 0.14, 0.5, 0, 2.55, 0.06)
  for (let i = 0; i < 4; i++) {
    const note = box(board, kit.plaster, 0.42, 0.5, 0.04, -0.85 + i * 0.56, 1.7 + (i % 2) * 0.18, 0.09)
    note.rotation.z = (i - 1.5) * 0.06
  }
  g.add(board)
  colliders.push({ x: 4.5, z: 3.2, r: 1.2 })

  // banners on poles at the four road mouths
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    const px = Math.cos(a) * 12.5
    const pz = Math.sin(a) * 12.5
    const pole = new THREE.Group()
    pole.position.set(px, heightAt(px, pz) - y, pz)
    box(pole, kit.darkTimber, 0.17, 3.8, 0.17, 0, 1.9, 0)
    const banner = box(pole, i % 2 ? kit.cloth : kit.clothAlt, 0.05, 1.5, 0.85, 0.08, 2.7, 0)
    banner.castShadow = true
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.38, 0.28), kit.glow)
    lamp.position.set(0, 3.6, 0)
    pole.add(lamp)
    glow.push(lamp)
    lamps.push(new THREE.Vector3(px, y + 3.6, pz))
    g.add(pole)
  }

  root.add(g)
}

/** Lamp posts down the main roads, so the village reads at night. */
function addRoadLamps(kit: Kit, root: THREE.Group, glow: THREE.Mesh[], lamps: THREE.Vector3[]): void {
  const g = new THREE.Group()
  for (const road of ROADS.slice(0, 5)) {
    for (let i = 0; i < road.length - 1; i++) {
      const a = road[i]
      const b = road[i + 1]
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      const steps = Math.floor(len / 26)
      for (let s = 1; s <= steps; s++) {
        const f = s / (steps + 1)
        const x = a.x + (b.x - a.x) * f + (b.z - a.z) / len * 5.2
        const z = a.z + (b.z - a.z) * f - (b.x - a.x) / len * 5.2
        if (Math.hypot(x, z) > 130) continue
        if (distToRoad(x, z) < 4.2) continue
        const y = heightAt(x, z)
        const post = new THREE.Group()
        post.position.set(x, y, z)
        box(post, kit.darkTimber, 0.18, 3.6, 0.18, 0, 1.8, 0)
        box(post, kit.darkTimber, 0.7, 0.14, 0.14, 0.3, 3.5, 0)
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.46, 0.34), kit.glow)
        lamp.position.set(0.6, 3.25, 0)
        post.add(lamp)
        glow.push(lamp)
        lamps.push(new THREE.Vector3(x + 0.6, y + 3.25, z))
        g.add(post)
      }
    }
  }
  root.add(g)
}

/** The Old Bridge: three spans, and the only dry crossing of the Coldrun. */
function addBridge(kit: Kit, root: THREE.Group): void {
  const g = new THREE.Group()
  const y = 1.6
  g.position.set(BRIDGE.x, y, BRIDGE.z)
  g.rotation.y = BRIDGE.angle

  const span = BRIDGE.span
  const deck = box(g, kit.paleStone, span, 0.7, 6.4, 0, 0, 0)
  deck.receiveShadow = true
  for (const side of [-1, 1]) {
    for (let i = 0; i < 10; i++) {
      box(g, kit.stone, span / 10 - 0.15, 0.9, 0.5, -span / 2 + span / 20 + (i * span) / 10, 0.75, side * 3.1)
    }
  }
  for (const px of [-span / 4, span / 4]) {
    const pier = box(g, kit.stone, 3.0, 8, 5.2, px, -4.2, 0)
    pier.castShadow = true
  }
  // the arches, as chamfered blocks under the deck
  for (const px of [-span / 2 + 2, 0, span / 2 - 2]) {
    const arch = cyl(g, kit.paleStone, 2.4, 2.4, 5.0, 10, px, -1.4, 0)
    arch.rotation.x = Math.PI / 2
    arch.scale.set(1, 1, 0.55)
  }
  root.add(g)
}

// ---------------------------------------------------------------- landmarks

function landmarkMesh(kit: Kit, l: Landmark): THREE.Group {
  const g = new THREE.Group()
  switch (l.kind) {
    case 'stones': {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2
        const r = 7
        const h = 3.2 + (i % 3) * 0.9
        const s = box(g, kit.stone, 1.1, h, 0.7, Math.cos(a) * r, h / 2, Math.sin(a) * r)
        s.rotation.y = -a + (i % 2 ? 0.1 : -0.12)
        s.rotation.z = (i % 3 === 0 ? 0.06 : -0.04)
        s.castShadow = true
      }
      break
    }
    case 'ruin': {
      // a burned stump of a tower with a stair that ends in air
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2
        if (a > 2.6 && a < 3.9) continue
        const h = 2.4 + Math.sin(i * 1.7) * 1.4
        const s = box(g, kit.stone, 1.4, h, 1.0, Math.cos(a) * 4.2, h / 2, Math.sin(a) * 4.2)
        s.rotation.y = -a
        s.castShadow = true
      }
      for (let i = 0; i < 7; i++) {
        const a = 0.4 + i * 0.42
        const r = 3.2
        box(g, kit.paleStone, 1.4, 0.34, 0.9, Math.cos(a) * r, 0.4 + i * 0.55, Math.sin(a) * r).castShadow = true
      }
      box(g, kit.darkTimber, 0.4, 3.0, 0.4, 0, 1.5, 0)
      break
    }
    case 'wreck': {
      for (let i = 0; i < 9; i++) {
        const rib = box(g, kit.darkTimber, 0.22, 2.2 - Math.abs(i - 4) * 0.22, 0.22, -3.6 + i * 0.9, 0.8, 0)
        rib.rotation.z = (i - 4) * 0.06
        rib.rotation.x = 0.18
      }
      const keel = box(g, kit.darkTimber, 8.4, 0.3, 0.6, 0, 0.2, 0)
      keel.rotation.z = 0.05
      break
    }
    case 'waystone': {
      const s = box(g, kit.paleStone, 1.0, 2.6, 0.8, 0, 1.3, 0)
      s.rotation.z = 0.16
      s.castShadow = true
      box(g, kit.stone, 2.0, 0.4, 1.6, 0, 0.2, 0)
      break
    }
    case 'cairn': {
      let y = 0
      for (let i = 0; i < 14; i++) {
        const r = 1.5 * (1 - i / 16)
        const s = cyl(g, kit.stone, r * 0.8, r, 0.34, 7, (Math.random() - 0.5) * 0.2, y + 0.17, (Math.random() - 0.5) * 0.2)
        s.castShadow = true
        y += 0.3
      }
      break
    }
    case 'arch': {
      for (const dx of [-3, 3]) {
        box(g, kit.stone, 1.6, 7.0, 1.6, dx, 3.5, 0).castShadow = true
      }
      box(g, kit.stone, 8.0, 1.4, 1.6, 0, 7.6, 0).castShadow = true
      box(g, kit.paleStone, 9.0, 0.5, 2.0, 0, 8.5, 0)
      break
    }
    case 'orchard': {
      for (let i = 0; i < 12; i++) {
        const x = (i % 4) * 5 - 7.5
        const z = Math.floor(i / 4) * 5 - 5
        cyl(g, kit.darkTimber, 0.24, 0.34, 2.2, 6, x, 1.1, z).castShadow = true
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7, 0), kit.leaf)
        crown.position.set(x, 3.0, z)
        crown.castShadow = true
        g.add(crown)
      }
      break
    }
    case 'tree': {
      cyl(g, kit.darkTimber, 1.5, 2.1, 6.0, 9, 0, 3.0, 0).castShadow = true
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(4.6, 1), kit.leaf)
      crown.position.set(0, 7.4, 0)
      crown.castShadow = true
      g.add(crown)
      // the hollow: a dark slab cut into the trunk
      box(g, kit.darkTimber, 1.2, 2.4, 0.4, 0, 1.4, 1.7)
      break
    }
    case 'mill': {
      const stone = cyl(g, kit.paleStone, 2.4, 2.4, 0.6, 14, 0, 0.3, 0)
      stone.rotation.z = 0.22
      stone.castShadow = true
      cyl(g, kit.stone, 0.5, 0.5, 0.9, 8, 0, 0.5, 0)
      box(g, kit.darkTimber, 3.4, 0.3, 0.3, 1.4, 0.9, 0.4)
      break
    }
    case 'shrine': {
      for (const dx of [-1.1, 1.1]) box(g, kit.stone, 0.7, 2.4, 0.7, dx, 1.2, 0)
      box(g, kit.stone, 3.2, 0.5, 1.2, 0, 2.6, 0)
      box(g, kit.paleStone, 1.6, 0.5, 1.0, 0, 0.9, 0)
      break
    }
    case 'well':
    case 'bridge':
      // these are built with the village
      break
  }
  return g
}

function addLandmarks(
  kit: Kit, root: THREE.Group, glow: THREE.Mesh[], lamps: THREE.Vector3[],
  colliders: { x: number; z: number; r: number }[],
): void {
  for (const l of LANDMARKS) {
    if (l.kind === 'well' || l.kind === 'bridge') continue
    const g = landmarkMesh(kit, l)
    g.position.set(l.x, heightAt(l.x, l.z), l.z)
    root.add(g)
    if (l.kind === 'shrine') {
      const flame = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), kit.glow)
      flame.position.set(l.x, heightAt(l.x, l.z) + 1.35, l.z)
      root.add(flame)
      glow.push(flame)
      lamps.push(flame.position.clone())
    }
    if (l.kind === 'ruin' || l.kind === 'arch' || l.kind === 'tree' || l.kind === 'mill') {
      colliders.push({ x: l.x, z: l.z, r: l.kind === 'tree' ? 2 : 3 })
    }
  }
}
