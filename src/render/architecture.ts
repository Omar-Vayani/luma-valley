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
import type { Solid } from '../game/collision'
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
  floor: THREE.MeshLambertMaterial
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
    floor: lambert('#b39468'),
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

// ---------------------------------------------------------------- shells

export interface BuiltPlace {
  group: THREE.Group
  /** panes and lanterns that should light up after dark */
  glow: THREE.Mesh[]
  /**
   * Where a lamp hangs, for the point-light pool. Indoor ones burn during the
   * day as well — a room with a roof on it is dark at noon, and the sun is not
   * going to help.
   */
  lamps: Lamp[]
  /** solid things, in the building's own local space */
  solids: Solid[]
}

export interface Lamp {
  pos: THREE.Vector3
  indoor: boolean
}

export interface ShellSpec {
  /** across the front */
  w: number
  /** front to back */
  d: number
  /** to the eaves */
  wall: number
  roof: 'gable' | 'hip' | 'flat'
  rise: number
  /** width of the doorway in the front wall; 0 for no way in */
  door: number
  walls: THREE.Material
  gable?: THREE.Material
  roofMat: THREE.Material
  frame?: boolean
  windows?: number
  /** a second storey, for the grander places */
  upper?: boolean
}

const WALL_T = 0.28

/**
 * Four walls with a gap for the door, a floor you can stand on, a roof over
 * it, and the solids that stop you walking through any of it.
 *
 * Buildings used to be a single circle of collision with no inside at all.
 * Making the walls real is what lets you step into the tavern, and it is also
 * what stops you strolling diagonally through the bank.
 */
function buildShell(kit: Kit, g: THREE.Group, spec: ShellSpec, out: BuiltPlace): void {
  const { w, d, wall } = spec
  const half = { w: w / 2, d: d / 2 }
  const total = spec.upper ? wall * 2 : wall

  // footing and floor
  box(g, kit.paleStone, w + 0.7, 0.42, d + 0.7, 0, 0.21, 0)
  const floor = box(g, kit.floor, w - 0.1, 0.1, d - 0.1, 0, 0.44, 0)
  floor.castShadow = false
  floor.receiveShadow = true

  const solid = (x: number, z: number, r: number): void => {
    out.solids.push({ x, z, r, height: total + 0.6, kind: 'wall' })
  }
  /** A wall run, with collision along it. */
  const run = (x1: number, z1: number, x2: number, z2: number): void => {
    const len = Math.hypot(x2 - x1, z2 - z1)
    if (len < 0.05) return
    const cx = (x1 + x2) / 2
    const cz = (z1 + z2) / 2
    const angle = Math.atan2(x2 - x1, z2 - z1)
    const panel = new THREE.Mesh(new THREE.BoxGeometry(WALL_T, total, len), spec.walls)
    panel.position.set(cx, 0.44 + total / 2, cz)
    panel.rotation.y = angle
    panel.castShadow = true
    panel.receiveShadow = true
    g.add(panel)
    const steps = Math.max(1, Math.ceil(len / 0.9))
    for (let i = 0; i <= steps; i++) {
      const f = i / steps
      solid(x1 + (x2 - x1) * f, z1 + (z2 - z1) * f, WALL_T * 0.8)
    }
  }

  // back and sides
  run(-half.w, -half.d, half.w, -half.d)
  run(-half.w, -half.d, -half.w, half.d)
  run(half.w, -half.d, half.w, half.d)

  // front, with the doorway left open
  if (spec.door > 0) {
    const gap = spec.door / 2
    run(-half.w, half.d, -gap, half.d)
    run(gap, half.d, half.w, half.d)
    // lintel over the opening, so the wall reads as continuous
    box(g, spec.walls, spec.door + 0.2, total - 2.15, WALL_T, 0, 0.44 + 2.15 + (total - 2.15) / 2, half.d)
    box(g, kit.darkTimber, spec.door + 0.4, 0.22, WALL_T + 0.1, 0, 0.44 + 2.2, half.d)
    for (const side of [-1, 1]) {
      box(g, kit.darkTimber, 0.18, 2.2, WALL_T + 0.08, side * (gap + 0.09), 0.44 + 1.1, half.d)
    }
    // step up to the door
    box(g, kit.paleStone, spec.door + 0.9, 0.22, 0.9, 0, 0.33, half.d + 0.55)
  } else {
    run(-half.w, half.d, half.w, half.d)
  }

  if (spec.frame !== false) {
    timberFrame(g, kit.darkTimber, w + 0.02, total, d + 0.02, 0.44)
  }

  const eaves = 0.44 + total
  if (spec.roof === 'gable') {
    gableRoof(g, spec.roofMat, spec.gable ?? spec.walls, w + 0.3, d + 0.3, spec.rise, eaves, 0.55)
  } else if (spec.roof === 'hip') {
    hipRoof(g, spec.roofMat, w + 1.4, d + 1.4, spec.rise, eaves)
  } else {
    const slab = box(g, spec.roofMat, w + 1.1, 0.3, d + 1.1, 0, eaves + 0.15, 0)
    slab.castShadow = true
  }

  if (spec.windows) {
    windows(g, kit, out, w, d, Math.min(2.0, 0.44 + wall * 0.55), spec.windows)
    if (spec.upper) windows(g, kit, out, w, d, 0.44 + wall + wall * 0.5, spec.windows)
  }
}

/** A lamp on a bracket, inside or out. */
function lantern(
  kit: Kit, parent: THREE.Object3D, out: BuiltPlace,
  x: number, y: number, z: number, indoor = true,
): void {
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.26), kit.glow)
  lamp.position.set(x, y, z)
  parent.add(lamp)
  out.glow.push(lamp)
  out.lamps.push({ pos: new THREE.Vector3(x, y, z), indoor })
}

/** A table with legs, which is most interiors. */
function table(kit: Kit, parent: THREE.Object3D, x: number, z: number, w = 1.6, d = 0.9): void {
  box(parent, kit.timber, w, 0.1, d, x, 1.24, z)
  for (const dx of [-w / 2 + 0.14, w / 2 - 0.14]) {
    for (const dz of [-d / 2 + 0.12, d / 2 - 0.12]) {
      box(parent, kit.darkTimber, 0.11, 0.7, 0.11, x + dx, 0.89, z + dz)
    }
  }
}

function stool(kit: Kit, parent: THREE.Object3D, x: number, z: number): void {
  box(parent, kit.timber, 0.36, 0.08, 0.36, x, 0.94, z)
  for (const dx of [-0.13, 0.13]) {
    for (const dz of [-0.13, 0.13]) {
      box(parent, kit.darkTimber, 0.06, 0.46, 0.06, x + dx, 0.71, z + dz)
    }
  }
}

function shelves(kit: Kit, parent: THREE.Object3D, x: number, z: number, w: number, ry = 0): void {
  const rack = new THREE.Group()
  rack.position.set(x, 0, z)
  rack.rotation.y = ry
  for (let i = 0; i < 3; i++) {
    box(rack, kit.timber, w, 0.07, 0.4, 0, 1.0 + i * 0.55, 0)
  }
  for (const dx of [-w / 2 + 0.08, w / 2 - 0.08]) {
    box(rack, kit.darkTimber, 0.1, 1.8, 0.4, dx, 1.34, 0)
  }
  // things on the shelves
  for (let i = 0; i < 7; i++) {
    const shelf = i % 3
    box(rack, i % 2 ? kit.thatch : kit.cloth, 0.2, 0.26, 0.2,
      -w / 2 + 0.35 + (i % 4) * (w / 5), 1.16 + shelf * 0.55, 0)
  }
  parent.add(rack)
}

function bed(kit: Kit, parent: THREE.Object3D, x: number, z: number, ry = 0): void {
  const b = new THREE.Group()
  b.position.set(x, 0, z)
  b.rotation.y = ry
  box(b, kit.darkTimber, 1.1, 0.32, 2.0, 0, 0.66, 0)
  box(b, kit.plaster, 1.0, 0.18, 1.8, 0, 0.9, 0.05)
  box(b, kit.cloth, 1.02, 0.1, 1.1, 0, 1.0, -0.3)
  box(b, kit.darkTimber, 1.15, 0.6, 0.12, 0, 1.1, -1.0)
  parent.add(b)
}

function hearth(kit: Kit, parent: THREE.Object3D, out: BuiltPlace, x: number, z: number): void {
  box(parent, kit.stone, 1.5, 1.2, 0.6, x, 1.04, z)
  box(parent, kit.stone, 1.7, 0.16, 0.7, x, 1.7, z)
  const fire = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 0), kit.glow)
  fire.position.set(x, 0.78, z + 0.24)
  parent.add(fire)
  out.glow.push(fire)
  out.lamps.push({ pos: new THREE.Vector3(x, 0.9, z + 0.3), indoor: true })
}

// ---------------------------------------------------------------- buildings

function buildHouse(kit: Kit, t: Tower, out: BuiltPlace): void {
  const g = out.group
  const w = 8
  const d = 7
  buildShell(kit, g, {
    w, d, wall: 3.1, roof: 'gable', rise: 2.6, door: 1.5,
    walls: kit.plaster, gable: kit.plasterWarm, roofMat: kit.roof, windows: 2,
  }, out)

  // a chimney, and something burning at the bottom of it
  const ch = box(g, kit.stone, 1.0, 4.4, 1.0, w / 2 - 1.4, 2.6, -d / 2 + 1.3)
  ch.castShadow = true
  box(g, kit.stone, 1.2, 0.22, 1.2, w / 2 - 1.4, 4.9, -d / 2 + 1.3)

  // inside: a bed, a hearth, a table to eat at
  hearth(kit, g, out, w / 2 - 1.4, -d / 2 + 0.9)
  bed(kit, g, -w / 2 + 1.0, -d / 2 + 1.6, 0)
  table(kit, g, -0.4, 0.9, 1.4, 0.8)
  stool(kit, g, -1.4, 0.9)
  stool(kit, g, 0.7, 0.9)
  shelves(kit, g, -w / 2 + 0.5, 1.6, 1.6, Math.PI / 2)
  signboard(g, kit, t.color, d)
  out.lamps.push({ pos: new THREE.Vector3(0, 2.6, d / 2 + 0.6), indoor: false })
}

function buildShop(kit: Kit, t: Tower, out: BuiltPlace): void {
  const g = out.group
  const w = 9
  const d = 8
  buildShell(kit, g, {
    w, d, wall: 3.4, roof: 'gable', rise: 2.4, door: 1.6,
    walls: kit.plasterWarm, gable: kit.plaster, roofMat: kit.roofAlt, windows: 2,
  }, out)

  // a serving counter across the room, and stock behind it
  box(g, kit.timber, w - 2.4, 0.9, 0.7, 0, 0.89, 1.1)
  box(g, kit.darkTimber, w - 2.2, 0.14, 0.9, 0, 1.36, 1.1)
  shelves(kit, g, 0, -d / 2 + 0.7, w - 3, 0)
  for (let i = 0; i < 3; i++) {
    cyl(g, kit.timber, 0.34, 0.4, 0.85, 8, -w / 2 + 1.1 + i * 0.95, 0.87, -1.2)
  }
  lantern(kit, g, out, 0, 3.0, 0)

  // an awning and a stall out front, so trade is visible from the road
  const awning = new THREE.Mesh(new THREE.BoxGeometry(w - 1.5, 0.14, 2.2), kit.cloth)
  awning.position.set(0, 3.2, d / 2 + 1.2)
  awning.rotation.x = -0.2
  awning.castShadow = true
  g.add(awning)
  for (const dx of [-(w / 2 - 1), w / 2 - 1]) {
    box(g, kit.timber, 0.15, 2.6, 0.15, dx, 1.5, d / 2 + 2.1)
    out.solids.push({ x: dx, z: d / 2 + 2.1, r: 0.22, height: 2.6, kind: 'post' })
  }
  box(g, kit.timber, w - 2.4, 0.24, 1.1, 0, 1.15, d / 2 + 1.5)
  signboard(g, kit, t.color, d)
  out.lamps.push({ pos: new THREE.Vector3(-1.2, 3.0, d / 2 + 1.6), indoor: false })
}

function buildHall(kit: Kit, t: Tower, out: BuiltPlace): void {
  const g = out.group
  const w = 13
  const d = 11
  buildShell(kit, g, {
    w, d, wall: 3.6, roof: 'hip', rise: 3.4, door: 2.2,
    walls: kit.plaster, roofMat: kit.roof, windows: 3, upper: true,
  }, out)

  // a porch with columns, which is what makes a building look civic
  for (const x of [-2.6, 2.6]) {
    const col = cyl(g, kit.paleStone, 0.34, 0.4, 4.0, 8, x, 2.0, d / 2 + 1.8)
    col.castShadow = true
    out.solids.push({ x, z: d / 2 + 1.8, r: 0.5, height: 4, kind: 'column' })
  }
  const porch = box(g, kit.roofAlt, 7.4, 0.34, 4.0, 0, 4.15, d / 2 + 1.2)
  porch.castShadow = true
  box(g, kit.paleStone, 8.0, 0.22, 1.3, 0, 0.42, d / 2 + 3.3)

  // inside: a long table, benches, a fire, and a board of notices
  table(kit, g, 0, -1.2, 6.0, 1.6)
  for (let i = -2; i <= 2; i++) {
    stool(kit, g, i * 1.3, -2.4)
    stool(kit, g, i * 1.3, 0)
  }
  hearth(kit, g, out, -w / 2 + 1.3, -d / 2 + 1.2)
  shelves(kit, g, w / 2 - 0.6, -1, 4, -Math.PI / 2)
  lantern(kit, g, out, 0, 3.4, -1)
  lantern(kit, g, out, 0, 3.4, 3)
  signboard(g, kit, t.color, d + 2)
}

function buildMarket(kit: Kit, t: Tower, out: BuiltPlace): void {
  const g = out.group
  const w = 9
  const d = 7
  const lockup = new THREE.Group()
  lockup.position.z = -3
  g.add(lockup)
  const inner: BuiltPlace = { group: lockup, glow: out.glow, lamps: [], solids: [] }
  buildShell(kit, lockup, {
    w, d, wall: 3.2, roof: 'gable', rise: 2.2, door: 1.6,
    walls: kit.plasterWarm, gable: kit.plasterWarm, roofMat: kit.roof, windows: 2,
  }, inner)
  for (const s of inner.solids) out.solids.push({ ...s, z: s.z - 3 })
  for (const l of inner.lamps) {
    out.lamps.push({ pos: l.pos.clone().add(new THREE.Vector3(0, 0, -3)), indoor: l.indoor })
  }
  shelves(kit, lockup, 0, -d / 2 + 0.7, w - 3, 0)
  box(lockup, kit.timber, w - 2.6, 0.9, 0.7, 0, 0.89, 1.2)

  const stallColors = [kit.cloth, kit.clothAlt, kit.cloth]
  for (let i = 0; i < 3; i++) {
    const sx = -5 + i * 5
    const sz = 4.2
    for (const dx of [-1.9, 1.9]) {
      for (const dz of [-1.2, 1.2]) {
        box(g, kit.timber, 0.14, 2.4, 0.14, sx + dx, 1.2, sz + dz)
      }
      out.solids.push({ x: sx + dx, z: sz, r: 0.2, height: 2.4, kind: 'post' })
    }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.13, 3.0), stallColors[i])
    canopy.position.set(sx, 2.55, sz)
    canopy.rotation.x = 0.1
    canopy.castShadow = true
    g.add(canopy)
    box(g, kit.timber, 4.0, 0.22, 1.6, sx, 1.1, sz - 0.4)
    out.solids.push({ x: sx, z: sz - 0.4, r: 1.1, height: 1.1, kind: 'counter' })
    box(g, kit.darkTimber, 0.7, 0.7, 0.7, sx - 1.2, 1.55, sz - 0.4)
    box(g, kit.darkTimber, 0.6, 0.6, 0.6, sx + 1.1, 1.5, sz - 0.5)
    cyl(g, kit.thatch, 0.36, 0.42, 0.7, 7, sx + 0.1, 1.55, sz - 0.45)
    lantern(kit, g, out, sx + 1.8, 2.35, sz + 1.2, false)
  }
  signboard(g, kit, t.color, d)
}

function buildYard(kit: Kit, t: Tower, out: BuiltPlace): void {
  const g = out.group
  const w = 9
  const d = 6
  // an open-fronted shed: three walls and a roof
  buildShell(kit, g, {
    w, d, wall: 3.2, roof: 'flat', rise: 0.4, door: 5.5,
    walls: kit.darkTimber, roofMat: kit.roofAlt, frame: false, windows: 1,
  }, out)

  table(kit, g, -1.6, -1.2, 3.0, 1.1)
  cyl(g, kit.metal, 0.5, 0.62, 0.8, 6, 2.4, 0.84, -1.2).castShadow = true
  box(g, kit.metal, 1.3, 0.5, 0.55, 2.4, 1.49, -1.2)
  out.solids.push({ x: 2.4, z: -1.2, r: 0.7, height: 1.3, kind: 'anvil' })
  shelves(kit, g, -w / 2 + 0.6, 0.6, 2.2, Math.PI / 2)

  for (let i = 0; i < 6; i++) {
    const log = cyl(g, kit.darkTimber, 0.24, 0.24, 2.4, 7, -4.2 + (i % 3) * 0.5, 0.66 + Math.floor(i / 3) * 0.46, 5.2)
    log.rotation.z = Math.PI / 2
    log.castShadow = true
  }
  out.solids.push({ x: -3.7, z: 5.2, r: 1.4, height: 1.2, kind: 'logs' })
  for (let i = 0; i < 3; i++) {
    cyl(g, kit.timber, 0.42, 0.48, 1.0, 8, 3.2 + i * 1.1, 0.9, 4.6).castShadow = true
    out.solids.push({ x: 3.2 + i * 1.1, z: 4.6, r: 0.5, height: 1.0, kind: 'barrel' })
  }

  cyl(g, kit.metal, 0.4, 0.28, 0.5, 8, 0, 1.15, 5.4)
  for (const dx of [-0.25, 0.25]) box(g, kit.metal, 0.08, 0.9, 0.08, dx, 0.85, 5.4)
  const fire = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), kit.glow)
  fire.position.set(0, 1.4, 5.4)
  g.add(fire)
  out.glow.push(fire)
  out.lamps.push({ pos: new THREE.Vector3(0, 1.6, 5.4), indoor: false })
  signboard(g, kit, t.color, d)
}

function buildField(kit: Kit, t: Tower, out: BuiltPlace): void {
  const g = out.group
  const barn = new THREE.Group()
  barn.position.set(-1, 0, -5)
  g.add(barn)
  const inner: BuiltPlace = { group: barn, glow: out.glow, lamps: [], solids: [] }
  buildShell(kit, barn, {
    w: 9, d: 7, wall: 4.0, roof: 'gable', rise: 3.0, door: 2.6,
    walls: kit.darkTimber, gable: kit.darkTimber, roofMat: kit.roof, frame: false, windows: 1,
  }, inner)
  for (const s of inner.solids) out.solids.push({ ...s, x: s.x - 1, z: s.z - 5 })
  for (const l of inner.lamps) {
    out.lamps.push({ pos: l.pos.clone().add(new THREE.Vector3(-1, 0, -5)), indoor: l.indoor })
  }
  for (let i = 0; i < 6; i++) {
    cyl(barn, kit.thatch, 0.42, 0.5, 0.9, 7, -2.5 + (i % 3) * 1.2, 0.9, -1.5 + Math.floor(i / 3) * 1.2)
  }

  for (let i = 0; i < 7; i++) {
    const row = box(g, kit.soil, 15, 0.18, 1.0, 0, 0.09, 1 + i * 1.6)
    row.receiveShadow = true
  }
  // a scarecrow, because a field needs a silhouette
  box(g, kit.timber, 0.16, 2.4, 0.16, 5.5, 1.2, 4)
  box(g, kit.timber, 1.8, 0.14, 0.14, 5.5, 1.9, 4)
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), kit.thatch)
  head.position.set(5.5, 2.5, 4)
  head.castShadow = true
  g.add(head)
  box(g, kit.cloth, 1.1, 1.0, 0.2, 5.5, 1.6, 4)
  signboard(g, kit, t.color, 7)
}

function buildGrove(kit: Kit, t: Tower, out: BuiltPlace): void {
  const g = out.group
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    const bx = Math.cos(a) * 3.8
    const bz = Math.sin(a) * 3.8
    const bench = new THREE.Group()
    box(bench, kit.timber, 2.2, 0.16, 0.5, 0, 0.5, 0)
    box(bench, kit.darkTimber, 0.2, 0.5, 0.4, -0.9, 0.25, 0)
    box(bench, kit.darkTimber, 0.2, 0.5, 0.4, 0.9, 0.25, 0)
    bench.position.set(bx, 0, bz)
    bench.rotation.y = -a
    g.add(bench)
    out.solids.push({ x: bx, z: bz, r: 0.8, height: 0.6, kind: 'bench' })
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    cyl(g, kit.stone, 0.26, 0.3, 0.3, 6, Math.cos(a) * 1.3, 0.15, Math.sin(a) * 1.3)
  }
  const fire = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), kit.glow)
  fire.position.set(0, 0.35, 0)
  g.add(fire)
  out.glow.push(fire)
  out.lamps.push({ pos: new THREE.Vector3(0, 0.7, 0), indoor: false })
  signboard(g, kit, t.color, 3)
}

function buildGraveyard(kit: Kit, t: Tower, out: BuiltPlace): void {
  const g = out.group
  const r = 8
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2
    if (a > 3.6 && a < 4.3) continue // the gap the gate stands in
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const seg = box(g, kit.stone, 1.3, 0.9, 0.5, x, 0.45, z)
    seg.rotation.y = -a
    seg.castShadow = true
    out.solids.push({ x, z, r: 0.6, height: 0.9, kind: 'wall' })
  }
  for (const dx of [-1.3, 1.3]) {
    box(g, kit.paleStone, 0.5, 2.8, 0.5, dx, 1.4, r - 0.6)
    out.solids.push({ x: dx, z: r - 0.6, r: 0.4, height: 2.8, kind: 'gatepost' })
  }
  box(g, kit.darkTimber, 3.4, 0.26, 0.32, 0, 2.7, r - 0.6)
  signboard(g, kit, t.color, r)
  lantern(kit, g, out, 0, 2.4, r - 0.6, false)
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
  lamps: Lamp[]
  /** obstacles the player and creatures should not walk through */
  colliders: Solid[]
}

/** Every building in the register, placed on the terrain and merged. */
export function buildVillage(kit: Kit): VillageBuild {
  const root = new THREE.Group()
  root.name = 'village'
  const glow: THREE.Mesh[] = []
  const lamps: Lamp[] = []
  const colliders: Solid[] = []

  for (const t of TOWERS) {
    const place: BuiltPlace = { group: new THREE.Group(), glow: [], lamps: [], solids: [] }
    const builder = BUILDERS[t.kind] ?? buildHouse
    builder(kit, t, place)

    place.group.position.set(t.x, heightAt(t.x, t.z), t.z)
    place.group.rotation.y = t.facing
    place.group.updateMatrixWorld(true)

    for (const m of place.glow) glow.push(m)
    for (const l of place.lamps) {
      lamps.push({ pos: l.pos.clone().applyMatrix4(place.group.matrixWorld), indoor: l.indoor })
    }

    // every wall, post and counter, rotated into the world
    const sin = Math.sin(t.facing)
    const cos = Math.cos(t.facing)
    for (const solid of place.solids) {
      colliders.push({
        ...solid,
        x: t.x + solid.x * cos + solid.z * sin,
        z: t.z - solid.x * sin + solid.z * cos,
      })
    }
    root.add(place.group)
  }

  addOutbuildings(kit, root, glow, lamps, colliders)
  addDressing(kit, root)
  addPlaza(kit, root, glow, lamps, colliders)
  addRoadLamps(kit, root, glow, lamps)
  addBridge(kit, root)
  addLandmarks(kit, root, glow, lamps, colliders)

  return { group: root, glow, lamps, colliders }
}


/**
 * The buildings that are not institutions.
 *
 * A settlement is not only the places with a counter in it. These are the
 * ones that explain the shape of the valley: a mill that outlived its river,
 * a granary the flood taught them to build on stilts, a toll house nobody
 * collects a toll at any more, a cottage left standing empty since the Quiet
 * Split. Each is a story you can walk into rather than read.
 */
interface Outbuilding {
  name: string
  x: number
  z: number
  facing: number
  spec: (kit: Kit) => ShellSpec
  dress?: (kit: Kit, g: THREE.Group, out: BuiltPlace) => void
}

const OUTBUILDINGS: Outbuilding[] = [
  {
    // the mill that outlived its river, beside the broken millstone
    name: 'mill', x: -94, z: -30, facing: 2.4,
    spec: (kit) => ({
      w: 7, d: 7, wall: 5.6, roof: 'gable', rise: 2.4, door: 1.4,
      walls: kit.paleStone, gable: kit.darkTimber, roofMat: kit.roofAlt, windows: 1, frame: false,
    }),
    dress: (kit, g, out) => {
      // the wheel, stopped, on the side the water used to run
      const wheel = new THREE.Group()
      wheel.position.set(-4.2, 2.4, 0)
      wheel.rotation.z = 0.1
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2
        const spoke = box(wheel, kit.darkTimber, 0.16, 4.4, 0.16, 0, 0, 0)
        spoke.rotation.z = a
        const paddle = box(wheel, kit.timber, 0.9, 0.5, 0.16, Math.cos(a) * 2.2, Math.sin(a) * 2.2, 0)
        paddle.rotation.z = a
      }
      g.add(wheel)
      out.solids.push({ x: -4.2, z: 0, r: 1.2, height: 5, kind: 'wheel' })
      table(kit, g, 0, -1, 1.6, 1)
      for (let i = 0; i < 4; i++) {
        cyl(g, kit.thatch, 0.4, 0.46, 0.85, 7, -1.6 + i * 1.1, 0.87, 1.4)
      }
    },
  },
  {
    // built up on stilts after the flood, and still built that way
    name: 'granary', x: -68, z: 22, facing: 1.4,
    spec: (kit) => ({
      w: 6, d: 5.5, wall: 3.2, roof: 'gable', rise: 2.2, door: 1.3,
      walls: kit.timber, gable: kit.timber, roofMat: kit.thatch, windows: 0, frame: false,
    }),
    dress: (kit, g, out) => {
      for (const dx of [-2.2, 2.2]) {
        for (const dz of [-2, 2]) {
          box(g, kit.stone, 0.5, 1.4, 0.5, dx, -0.7, dz)
          // the mushroom caps that stop rats climbing the legs
          cyl(g, kit.paleStone, 0.62, 0.42, 0.22, 8, dx, 0.05, dz)
          out.solids.push({ x: dx, z: dz, r: 0.45, height: 1.4, kind: 'stilt' })
        }
      }
      for (let i = 0; i < 5; i++) {
        cyl(g, kit.thatch, 0.38, 0.44, 0.8, 7, -1.6 + (i % 3) * 1.4, 0.94, -1.2 + Math.floor(i / 3) * 1.6)
      }
    },
  },
  {
    // where a toll was collected, in the years the bridge needed paying for
    name: 'tollhouse', x: 112, z: -26, facing: 1.9,
    spec: (kit) => ({
      w: 4.5, d: 4.5, wall: 2.9, roof: 'hip', rise: 1.7, door: 1.2,
      walls: kit.paleStone, roofMat: kit.roof, windows: 1, frame: false,
    }),
    dress: (kit, g, out) => {
      box(g, kit.darkTimber, 0.2, 1.1, 4.5, 3.4, 0.9, 0)
      out.solids.push({ x: 3.4, z: 0, r: 0.4, height: 1.1, kind: 'barrier' })
      stool(kit, g, 0, 0)
    },
  },
  {
    // empty since the Quiet Split, and nobody has quite claimed it
    name: 'ruin', x: -84, z: -58, facing: 0.7,
    spec: (kit) => ({
      w: 7, d: 6, wall: 2.6, roof: 'flat', rise: 0.2, door: 1.5,
      walls: kit.stone, roofMat: kit.darkTimber, windows: 0, frame: false,
    }),
    dress: (kit, g) => {
      // the roof has mostly gone: a few rafters over an open room
      for (let i = -3; i <= 3; i++) {
        const beam = box(g, kit.darkTimber, 0.18, 0.18, 7, i * 1.1, 3.2, 0)
        beam.rotation.z = 0.04 * i
      }
      box(g, kit.stone, 1.4, 1.0, 0.6, 2.4, 0.94, -2.4)
      table(kit, g, -1, 0, 1.4, 0.8)
    },
  },
  {
    // the charcoal burner works where nobody has to smell it
    name: 'charcoal', x: -58, z: -96, facing: 2.9,
    spec: (kit) => ({
      w: 4.2, d: 4, wall: 2.4, roof: 'gable', rise: 1.5, door: 1.2,
      walls: kit.darkTimber, gable: kit.darkTimber, roofMat: kit.thatch, windows: 1, frame: false,
    }),
    dress: (kit, g, out) => {
      // the earth kiln, smoking quietly
      const mound = cyl(g, kit.soil, 1.1, 2.1, 1.9, 10, 4.5, 0.95, 1)
      mound.castShadow = true
      out.solids.push({ x: 4.5, z: 1, r: 2, height: 2, kind: 'kiln' })
      for (let i = 0; i < 6; i++) {
        const log = cyl(g, kit.darkTimber, 0.2, 0.2, 2, 6, -3 + (i % 3) * 0.45, 0.2 + Math.floor(i / 3) * 0.42, 2)
        log.rotation.z = Math.PI / 2
      }
    },
  },
  {
    // for whoever eventually tries the lake again
    name: 'boathouse', x: 106, z: 60, facing: 0.5,
    spec: (kit) => ({
      w: 6.5, d: 7, wall: 3.0, roof: 'gable', rise: 2.0, door: 3.4,
      walls: kit.timber, gable: kit.timber, roofMat: kit.roofAlt, windows: 1, frame: false,
    }),
    dress: (kit, g, out) => {
      // a jetty out toward the water
      for (let i = 0; i < 6; i++) {
        box(g, kit.darkTimber, 2.4, 0.14, 0.9, 0, 0.4, 4.4 + i * 0.95)
        if (i % 2 === 0) {
          for (const dx of [-1, 1]) box(g, kit.darkTimber, 0.16, 1.2, 0.16, dx, -0.2, 4.4 + i * 0.95)
        }
      }
      out.solids.push({ x: 0, z: 8, r: 0.6, height: 0.5, kind: 'jetty' })
      // an upturned hull, patched and never used
      const hull = cyl(g, kit.timber, 0.6, 0.9, 3.4, 7, -2, 0.9, 1)
      hull.rotation.z = Math.PI / 2
      hull.rotation.y = 0.2
    },
  },
  {
    // the schoolhouse annexe: where the chronicle is kept
    name: 'archive', x: -34, z: 44, facing: 0.4,
    spec: (kit) => ({
      w: 6, d: 5.5, wall: 3.2, roof: 'hip', rise: 1.9, door: 1.4,
      walls: kit.plaster, roofMat: kit.roofAlt, windows: 2,
    }),
    dress: (kit, g, out) => {
      shelves(kit, g, -2.4, 0, 4, Math.PI / 2)
      shelves(kit, g, 2.4, 0, 4, -Math.PI / 2)
      table(kit, g, 0, 0.6, 1.6, 0.9)
      stool(kit, g, 0, 1.6)
      lantern(kit, g, out, 0, 3.0, 0)
    },
  },
  {
    // beehives at the bitter orchard, which is what the orchard is actually for
    name: 'apiary', x: -110, z: 50, facing: 1.1,
    spec: (kit) => ({
      w: 3.6, d: 3.4, wall: 2.2, roof: 'gable', rise: 1.3, door: 1.1,
      walls: kit.timber, gable: kit.timber, roofMat: kit.thatch, windows: 0, frame: false,
    }),
    dress: (kit, g, out) => {
      for (let i = 0; i < 5; i++) {
        const x = -4 - (i % 3) * 1.6
        const z = 1 + Math.floor(i / 3) * 1.8
        for (let tier = 0; tier < 3; tier++) {
          cyl(g, kit.thatch, 0.42 - tier * 0.08, 0.5 - tier * 0.08, 0.32, 9, x, 0.5 + tier * 0.32, z)
        }
        out.solids.push({ x, z, r: 0.5, height: 1.4, kind: 'hive' })
      }
    },
  },
]

function addOutbuildings(
  kit: Kit, root: THREE.Group, glow: THREE.Mesh[], lamps: Lamp[], colliders: Solid[],
): void {
  for (const b of OUTBUILDINGS) {
    const place: BuiltPlace = { group: new THREE.Group(), glow: [], lamps: [], solids: [] }
    buildShell(kit, place.group, b.spec(kit), place)
    b.dress?.(kit, place.group, place)

    place.group.position.set(b.x, heightAt(b.x, b.z), b.z)
    place.group.rotation.y = b.facing
    place.group.updateMatrixWorld(true)

    for (const m of place.glow) glow.push(m)
    for (const l of place.lamps) {
      lamps.push({ pos: l.pos.clone().applyMatrix4(place.group.matrixWorld), indoor: l.indoor })
    }
    const sin = Math.sin(b.facing)
    const cos = Math.cos(b.facing)
    for (const solid of place.solids) {
      colliders.push({
        ...solid,
        x: b.x + solid.x * cos + solid.z * sin,
        z: b.z - solid.x * sin + solid.z * cos,
      })
    }
    root.add(place.group)
  }
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
  kit: Kit, root: THREE.Group, glow: THREE.Mesh[], lamps: Lamp[],
  colliders: Solid[],
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
  colliders.push({ x: 0, z: 0, r: 1.9, height: 1.2, kind: 'well' })

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
  colliders.push({ x: 4.5, z: 3.2, r: 1.2, height: 2.4, kind: 'board' })

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
    lamps.push({ pos: new THREE.Vector3(px, y + 3.6, pz), indoor: false })
    g.add(pole)
  }

  root.add(g)
}

/** Lamp posts down the main roads, so the village reads at night. */
function addRoadLamps(kit: Kit, root: THREE.Group, glow: THREE.Mesh[], lamps: Lamp[]): void {
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
        lamps.push({ pos: new THREE.Vector3(x + 0.6, y + 3.25, z), indoor: false })
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
  kit: Kit, root: THREE.Group, glow: THREE.Mesh[], lamps: Lamp[],
  colliders: Solid[],
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
      lamps.push({ pos: flame.position.clone(), indoor: false })
    }
    if (l.kind === 'ruin' || l.kind === 'arch' || l.kind === 'tree' || l.kind === 'mill') {
      colliders.push({ x: l.x, z: l.z, r: l.kind === 'tree' ? 2 : 3, height: 6, kind: l.kind })
    }
  }
}
