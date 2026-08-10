/**
 * labview — the Three.js test-lab renderer.
 * Observer camera (pan/pinch/tap), square towers with labels, ball creatures
 * with emotion-driven faces, and visible events (fights, hearts, coins, Zzz).
 * Everything is procedural — no assets, few colors.
 */
import * as THREE from 'three'
import { TOWERS, WORLD_HALF, type Tower } from '../lab/world'
import type { Sim, SimEvent } from '../lab/sim'
import type { Creature } from '../lab/creature'
import type { Player } from '../lab/player'
import { deriveEmotion } from '../lab/emotion'
import { hairStyle } from '../lab/hair'
import { SoundEngine } from '../lab/audio'
import { refreshBrain, clampCoord } from '../lab/sim'

export interface LabViewCallbacks {
  onTapCreature: (id: number, x: number, z: number) => void
  onTapWorld: (x: number, z: number) => void
}

interface CreatureRig {
  creature: Creature
  group: THREE.Group
  body: THREE.Mesh
  leftEye: THREE.Mesh
  rightEye: THREE.Mesh
  leftIris: THREE.Mesh
  rightIris: THREE.Mesh
  leftBrow: THREE.Mesh
  rightBrow: THREE.Mesh
  mouth: THREE.Mesh
  sleepZ: THREE.Sprite
  nameLabel: THREE.Sprite
  stick: THREE.Mesh
  hair: THREE.Group
  emotionBadge: THREE.Mesh
  emotionBadgeGroup: THREE.Group
  phase: number
  targetX: number
  targetZ: number
  swing: number
}

/** The player's human-like rig — taller than a creature, NOT a ball. */
interface PlayerRig {
  group: THREE.Group
  legL: THREE.Mesh
  legR: THREE.Mesh
  armL: THREE.Mesh
  armR: THREE.Mesh
  body: THREE.Mesh
  head: THREE.Mesh
  stick: THREE.Mesh
  nameLabel: THREE.Sprite
  phase: number
  lastX: number
  lastZ: number
}

const TICK_RATE = 6
const STEP = 1 / TICK_RATE
const GROUND_Y = 0

function makeTextSprite(text: string, opts: { size?: number; color?: string; bg?: string; radius?: number } = {}): THREE.Sprite {
  const size = opts.size ?? 64
  // canvas must be taller than the font or the glyphs get clipped to a sliver
  const canvas = document.createElement('canvas')
  canvas.width = size * 8
  canvas.height = size * 3
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (opts.bg) {
    ctx.fillStyle = opts.bg
    const r = (opts.radius ?? 12) * 4
    ctx.beginPath()
    ctx.roundRect(12, 12, canvas.width - 24, canvas.height - 24, r)
    ctx.fill()
  }
  ctx.fillStyle = opts.color ?? '#fff8e8'
  ctx.font = `800 ${size * 2.2}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(mat)
  // world-space size: wider + taller so labels stay readable at zoomed-out view
  sprite.scale.set(size / 14, size / 42, 1)
  return sprite
}

// ── building primitives: boxes/roofs/windows/doors/signs — shared by every tower ──
type MatOpts = Partial<THREE.MeshStandardMaterialParameters>

function mkMat(color: THREE.ColorRepresentation, opts: MatOpts = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts })
}

function mkBox(w: number, h: number, d: number, m: THREE.Material | THREE.ColorRepresentation): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m instanceof THREE.Material ? m : mkMat(m))
}

function mkCyl(rt: number, rb: number, h: number, seg: number, m: THREE.Material | THREE.ColorRepresentation): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m instanceof THREE.Material ? m : mkMat(m))
}

function mkSphere(r: number, m: THREE.Material | THREE.ColorRepresentation): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), m instanceof THREE.Material ? m : mkMat(m))
}

interface RoofSpec {
  wallTop: number // top of the walls
  halfDepth: number // eave half-depth (walls + overhang)
  halfWidth: number // gable half-width (walls + overhang)
  roofH: number // ridge rise above wallTop
  mat: THREE.Material
  ridgeMat: THREE.Material
}

/** Gabled roof: two sloped planes + gable triangles + ridge cap, overhanging the walls. */
function addGableRoof(group: THREE.Group, s: RoofSpec): void {
  const slopeLen = Math.hypot(s.halfDepth, s.roofH)
  const rot = Math.atan2(s.halfDepth, s.roofH)
  const planeW = s.halfWidth * 2 + 0.4
  for (const dir of [-1, 1] as const) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(planeW, slopeLen), s.mat)
    p.rotation.x = dir === 1 ? -rot : rot
    p.position.set(0, s.wallTop + s.roofH / 2, dir * (s.halfDepth / 2))
    group.add(p)
  }
  const shape = new THREE.Shape()
  shape.moveTo(-s.halfWidth, 0)
  shape.lineTo(s.halfWidth, 0)
  shape.lineTo(0, s.roofH)
  shape.closePath()
  const gGeo = new THREE.ShapeGeometry(shape)
  for (const dir of [-1, 1] as const) {
    const g = new THREE.Mesh(gGeo, s.mat)
    g.rotation.y = dir === 1 ? 0 : Math.PI
    g.position.set(0, s.wallTop, dir * s.halfDepth)
    group.add(g)
  }
  const ridge = mkBox(planeW, 0.3, 0.3, s.ridgeMat)
  ridge.position.y = s.wallTop + s.roofH
  group.add(ridge)
}

/** Flat roof slab with a small overhang all around. */
function addFlatRoof(group: THREE.Group, wallTop: number, size: number, thickness: number, m: THREE.Material | THREE.ColorRepresentation): void {
  const roof = mkBox(size + 1.0, thickness, size + 1.0, m)
  roof.position.y = wallTop + thickness / 2
  group.add(roof)
}

/** Framed window flush on a wall face at (x,y,z) with outward normal (nx,nz). */
function addWindow(group: THREE.Group, x: number, y: number, z: number, nx: number, nz: number, paneMat: THREE.Material, frameMat: THREE.Material): void {
  const g = new THREE.Group()
  // rotate so the group's local +z is the wall's outward normal
  if (nx !== 0) {
    g.rotation.y = nx > 0 ? Math.PI / 2 : -Math.PI / 2
  } else if (nz < 0) {
    g.rotation.y = Math.PI
  }
  const frame = mkBox(1.16, 1.16, 0.08, frameMat)
  frame.position.z = 0.09
  const pane = mkBox(0.92, 0.92, 0.06, paneMat)
  pane.position.z = 0.16
  const mull = mkBox(0.09, 0.92, 0.1, frameMat)
  mull.position.z = 0.12
  const sill = mkBox(1.26, 0.1, 0.16, frameMat)
  sill.position.set(0, -0.6, 0.12)
  g.add(frame, pane, mull, sill)
  g.position.set(x, y, z)
  group.add(g)
}

/** Door with frame posts, lintel, handle and a stone step in front. z is the wall face. */
function addDoor(group: THREE.Group, x: number, z: number, doorMat: THREE.Material, trimMat: THREE.Material, w = 1.2, h = 2.0): void {
  const postL = mkBox(0.16, h + 0.26, 0.14, trimMat)
  postL.position.set(x - w / 2 - 0.08, h / 2 + 0.13, z)
  const postR = mkBox(0.16, h + 0.26, 0.14, trimMat)
  postR.position.set(x + w / 2 + 0.08, h / 2 + 0.13, z)
  const lintel = mkBox(w + 0.32, 0.16, 0.14, trimMat)
  lintel.position.set(x, h + 0.21, z)
  const door = mkBox(w, h, 0.12, doorMat)
  door.position.set(x, h / 2, z + 0.16)
  const knob = mkBox(0.09, 0.09, 0.12, 0xd8b04a)
  knob.position.set(x + w / 2 - 0.22, h / 2 - 0.25, z + 0.26)
  const step = mkBox(w + 0.55, 0.14, 0.6, 0xaeaeae)
  step.position.set(x, 0.07, z + 0.52)
  group.add(postL, postR, lintel, door, knob, step)
}

/** Chimney box + cap on a roof; baseY is where it meets the roof surface. */
function addChimney(group: THREE.Group, x: number, z: number, baseY: number, smoke: boolean): void {
  const chimney = mkBox(0.75, 1.4, 0.75, 0x8a4a3a)
  chimney.position.set(x, baseY + 0.7, z)
  group.add(chimney)
  const cap = mkBox(0.92, 0.14, 0.92, 0x6e3a2e)
  cap.position.set(x, baseY + 1.42, z)
  group.add(cap)
  if (smoke) {
    const smokeMat = mkMat(0xffffff, { transparent: true, opacity: 0.5, roughness: 1 })
    for (let i = 0; i < 3; i++) {
      const puff = mkSphere(0.18 + i * 0.06, smokeMat)
      puff.position.set(x + i * 0.1, baseY + 1.6 + i * 0.34, z + (i % 2 === 0 ? -0.06 : 0.08))
      group.add(puff)
    }
  }
}

/** Wooden hanging sign on two posts — the physical counterpart of the floating label. */
function addSign(group: THREE.Group, x: number, z: number): void {
  const wood = mkMat(0x6e4a2e, { roughness: 0.9 })
  const boardMat = mkMat(0xd9c08a, { roughness: 0.8 })
  const postL = mkBox(0.12, 1.6, 0.12, wood)
  postL.position.set(x - 0.42, 0.8, z)
  const postR = mkBox(0.12, 1.6, 0.12, wood)
  postR.position.set(x + 0.42, 0.8, z)
  const cross = mkBox(0.96, 0.1, 0.1, wood)
  cross.position.set(x, 1.5, z)
  const armL = mkBox(0.06, 0.34, 0.06, wood)
  armL.position.set(x - 0.35, 1.28, z)
  const armR = mkBox(0.06, 0.34, 0.06, wood)
  armR.position.set(x + 0.35, 1.28, z)
  const board = mkBox(1.02, 0.56, 0.08, boardMat)
  board.position.set(x, 0.95, z + 0.06)
  group.add(postL, postR, cross, armL, armR, board)
}

export class LabView {
  sim: Sim
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private callbacks: LabViewCallbacks
  private raf = 0
  private last = 0
  private simAccum = 0
  paused = false
  speed = 1

  // ── first-person mode: the player IS a creature ──
  // The camera follows the player creature from just behind/above its head,
  // so the rig stays visible while the view looks along creature.facing.
  /** The player creature id, or null = observer camera. */
  playerId: number | null = null
  /** Up/down look angle (radians). */
  fpPitch = 0
  /** Camera distance behind the player creature (pinch / wheel adjustable). */
  fpDist = 2.4
  /** Normalized -1..1 joystick vector; App writes it, the loop consumes it. */
  joystick = { x: 0, y: 0 }
  pointerLocked = false
  private keys = new Set<string>()
  private onKeyDown = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase()
    if (k === 'w' || k === 'a' || k === 's' || k === 'd') {
      if (!e.repeat) this.keys.add(k)
      e.preventDefault()
    }
  }
  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase())
  }
  private onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement
  }
  private onLockedMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked || this.playerId === null) return
    this.playerLook(e.movementX * 0.0022, e.movementY * 0.0022)
  }

  // camera control
  private camTarget = new THREE.Vector3(0, 0, 0)
  private camTilt = 1.0 // radians
  private camDist = 90

  // sound: every experience makes a sound (mood-shifted)
  readonly sound = new SoundEngine()

  // pointer state (pan + pinch + tap)
  private pointers = new Map<number, { x: number; y: number }>()
  private panLast: { x: number; y: number } | null = null
  private pinchStart = 0
  private downTime = 0
  private downPos: { x: number; y: number } | null = null
  private moved = false
  private tapBuffer: { x: number; y: number; t: number }[] = []

  private rigs: CreatureRig[] = []
  private playerRig: PlayerRig | null = null
  private knownIds = new Set<number>()
  private towerMeshes: THREE.Object3D[] = []
  private dropMarkers: { drop: { kind: string; x: number; z: number }; mesh: THREE.Object3D }[] = []
  private graveMarkers: { id: number; mesh: THREE.Object3D }[] = []
  private particles: { mesh: THREE.Mesh | THREE.Sprite; life: number; max: number; vy: number; vx: number; vz: number }[] = []

  private raycaster = new THREE.Raycaster()
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

  constructor(container: HTMLElement, sim: Sim, callbacks: LabViewCallbacks) {
    this.sim = sim
    this.callbacks = callbacks

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 300)

    // warm sky, no fog — the whole open world stays crisp and visible
    this.scene.background = new THREE.Color('#cfc4a6')

    // ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2),
      new THREE.MeshStandardMaterial({ color: 0x6b7f6b, roughness: 1 })
    )
    ground.rotation.x = -Math.PI / 2
    this.scene.add(ground)
    const grid = new THREE.GridHelper(WORLD_HALF * 2, 24, 0x4a5a4a, 0x4a5a4a)
    grid.position.y = 0.02
    this.scene.add(grid)

    // lighting
    const hemi = new THREE.HemisphereLight(0xffffff, 0x3a3a2a, 1.0)
    this.scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.4)
    sun.position.set(20, 40, 10)
    this.scene.add(sun)

    // towers
    for (const t of TOWERS) this.buildTower(t)

    // creatures
    for (const c of sim.creatures) {
      this.knownIds.add(c.id)
      this.addCreature(c)
    }
    // the player — a distinct human-like visitor, not a creature
    this.playerRig = this.buildPlayerRig(sim.player)

    // events
    this.setupPointerEvents()
    document.addEventListener('keydown', this.onKeyDown)
    document.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    document.addEventListener('mousemove', this.onLockedMouseMove)
    this.updateCamera(0)
    this.last = performance.now()
    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
    ;(window as unknown as Record<string, unknown>).__lab = { view: this, sim }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    document.removeEventListener('keydown', this.onKeyDown)
    document.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    document.removeEventListener('mousemove', this.onLockedMouseMove)
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  // ── towers: houses with real gabled roofs, chimneys, framed windows, doors
  //    with steps, and a wooden sign post beside the door. graveyard / den /
  //    school / farm / park get their own themed builds. ──
  private buildTower(t: Tower): void {
    const group = new THREE.Group()
    const color = new THREE.Color(t.color)

    if (t.id === 'graveyard') {
      this.buildGraveyard(group)
    } else if (t.id === 'den') {
      this.buildDen(group)
    } else if (t.id === 'school') {
      this.buildSchool(group)
    } else if (t.id === 'farm') {
      this.buildFarm(group)
    } else if (t.id === 'park') {
      this.buildPark(group)
    } else {
      this.buildHouse(group, t, color)
    }

    // wooden sign on a post beside the door (physical, in addition to the label)
    addSign(group, 2.6, 3.7)

    // hanging label — big, readable, above the building
    const labelY = t.id === 'farm' ? 8.8 : 7.6
    const label = makeTextSprite(`${t.icon} ${t.label}`, { color: '#1c1a14', bg: '#fff4d8', size: 44 })
    label.position.set(0, labelY, 0)
    group.add(label)

    group.position.set(t.x, 0, t.z)
    this.scene.add(group)
    this.towerMeshes.push(group)
  }

  /** The standard tower: gabled house with overhanging roof, chimney, framed windows, door + step. */
  private buildHouse(group: THREE.Group, t: Tower, color: THREE.Color): void {
    const wallMat = mkMat(color.clone().multiplyScalar(0.8), { roughness: 0.95 })
    const trimMat = mkMat(color.clone().multiplyScalar(1.18), { roughness: 0.8 })
    const roofMat = mkMat(color.clone().multiplyScalar(1.3), { roughness: 0.55 })
    const ridgeMat = mkMat(color.clone().multiplyScalar(0.85), { roughness: 0.6 })

    // cube walls + corner trim posts
    const walls = mkBox(6.5, 4, 6.5, wallMat)
    walls.position.y = 2
    group.add(walls)
    for (const [cx, cz] of [[-3.24, -3.24], [3.24, -3.24], [-3.24, 3.24], [3.24, 3.24]] as const) {
      const corner = mkBox(0.24, 4.1, 0.24, trimMat)
      corner.position.set(cx, 2.05, cz)
      group.add(corner)
    }

    // gabled roof with a proper overhang past the walls
    addGableRoof(group, { wallTop: 4, halfDepth: 3.65, halfWidth: 3.6, roofH: 2.3, mat: roofMat, ridgeMat })

    // chimney on the roof slope (some towers puff smoke)
    const smoke = t.id === 'food' || t.id === 'homes' || t.id === 'tools' || t.id === 'tavern' || t.id === 'work'
    const chimneyY = 4 + 2.3 * (1 - 1.7 / 3.65)
    addChimney(group, 2.2, -1.7, chimneyY, smoke)

    // framed windows flush on all four walls
    const paneMat = mkMat(0x2e2618, { roughness: 0.4 })
    const frameMat = mkMat(0xe8dcc0, { roughness: 0.6 })
    addWindow(group, -2.2, 2.7, 3.25, 0, 1, paneMat, frameMat)
    addWindow(group, 2.2, 2.7, 3.25, 0, 1, paneMat, frameMat)
    addWindow(group, -2.2, 2.7, -3.25, 0, -1, paneMat, frameMat)
    addWindow(group, 2.2, 2.7, -3.25, 0, -1, paneMat, frameMat)
    addWindow(group, 3.25, 2.7, 0, 1, 0, paneMat, frameMat)
    addWindow(group, -3.25, 2.7, 0, -1, 0, paneMat, frameMat)

    // door with frame, handle and stone step
    const doorMat = mkMat(0x3a2a18, { roughness: 0.7 })
    addDoor(group, 0, 3.25, doorMat, trimMat)

    // yard decorations — each business gets something out front (outside the walls)
    if (t.id === 'food') {
      // produce crates + barrel by the door
      for (let i = 0; i < 3; i++) {
        const crate = mkBox(0.7, 0.7, 0.7, 0x8a6a40)
        crate.position.set(-3.6, 0.35 + i * 0.72, 2.6)
        group.add(crate)
      }
      const barrel = mkCyl(0.42, 0.42, 0.95, 10, 0x9a7a4a)
      barrel.position.set(-3.2, 0.475, 1.2)
      group.add(barrel)
    } else if (t.id === 'bank') {
      // columns flanking the entrance + a stack of gold coins
      for (const sx of [-1.35, 1.35] as const) {
        const col = mkCyl(0.28, 0.34, 3.4, 12, 0xe8e2d0)
        col.position.set(sx, 1.7, 3.45)
        group.add(col)
      }
      for (let i = 0; i < 3; i++) {
        const coin = mkCyl(0.5, 0.5, 0.14, 16, 0xd9a13d)
        coin.position.set(3.7, 0.07 + i * 0.15, 2.8)
        group.add(coin)
      }
    } else if (t.id === 'pharmacy') {
      // white cross over the door + potted plant
      const crossMat = mkMat(0xf4f4f4)
      const v = mkBox(0.3, 1.0, 0.06, crossMat)
      v.position.set(0, 2.7, 3.33)
      const hbar = mkBox(0.6, 0.3, 0.06, crossMat)
      hbar.position.set(0, 2.7, 3.33)
      group.add(v, hbar)
      const pot = mkCyl(0.3, 0.22, 0.4, 8, 0x9a4a3a)
      pot.position.set(-3.4, 0.2, 2.9)
      const bush = mkSphere(0.32, 0x4fae5a)
      bush.position.set(-3.4, 0.62, 2.9)
      group.add(pot, bush)
    } else if (t.id === 'homes') {
      // beds: little raised rectangles in the side yard
      for (let i = 0; i < 3; i++) {
        const bed = new THREE.Group()
        const frame = mkBox(1.7, 0.3, 1, 0x6a4a2a)
        frame.position.y = 0.5
        const matt = mkBox(1.7, 0.18, 1, 0xcfc4a6)
        matt.position.y = 0.75
        bed.add(frame, matt)
        bed.position.set(-3.7, 0, -2.6 + i * 2.6)
        group.add(bed)
      }
    } else if (t.id === 'tools') {
      // log pile + anvil
      for (let i = 0; i < 3; i++) {
        const log = mkCyl(0.34, 0.34, 0.9, 10, 0x9a6a3a)
        log.rotation.x = Math.PI / 2
        log.position.set(-3.5, 0.34, -2.8 + i * 0.95)
        group.add(log)
      }
      const anvil = mkCyl(0.5, 0.7, 0.6, 8, 0x666)
      anvil.position.set(-3.6, 0.3, 1.4)
      group.add(anvil)
    } else if (t.id === 'tavern') {
      // barrels by the door + a mug on the porch
      for (let i = 0; i < 2; i++) {
        const barrel = mkCyl(0.45, 0.45, 1.0, 10, 0x7a4a2a)
        barrel.position.set(-2.9 + i * 1.5, 0.5, 3.9)
        group.add(barrel)
      }
      const mug = mkCyl(0.22, 0.18, 0.5, 8, 0xd9b04a)
      mug.position.set(-2.6, 0.75, 3.3)
      group.add(mug)
    } else if (t.id === 'play') {
      // gym/play: a swing set on the lawn + rings mounted on the side wall
      const postMat = mkMat(0x8a7a5a)
      const swing = new THREE.Group()
      const p1 = mkBox(0.3, 3, 0.3, postMat)
      p1.position.set(-1.8, 1.5, 0)
      const p2 = mkBox(0.3, 3, 0.3, postMat)
      p2.position.set(1.8, 1.5, 0)
      const bar = mkBox(3.9, 0.25, 0.25, postMat)
      bar.position.y = 3
      const seat = mkBox(0.8, 0.15, 0.5, 0xd9a13d)
      seat.position.y = 1.3
      swing.add(p1, p2, bar, seat)
      swing.position.set(3.1, 0, 4.0)
      group.add(swing)
      const rbar = mkBox(0.16, 0.16, 1.7, postMat)
      rbar.position.set(3.62, 2.2, 0)
      group.add(rbar)
      for (const rz of [-0.5, 0.5] as const) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.09, 8, 12), mkMat(0xe0b46a))
        ring.position.set(3.62, 1.35, rz)
        group.add(ring)
      }
    } else if (t.id === 'work') {
      // work tower: anvil + stacked crates in the side yard (factory look)
      const anvil = mkCyl(0.5, 0.7, 0.6, 8, 0x666)
      anvil.position.set(-3.6, 0.3, -2.2)
      group.add(anvil)
      for (let i = 0; i < 2; i++) {
        const crate = mkBox(0.9, 0.9, 0.9, 0x8a6a40)
        crate.position.set(-3.9, 0.45 + i * 0.95, 1.2)
        group.add(crate)
      }
    }
  }

  /** Graveyard: dark stone chapel + tombstones + fence around the plot. */
  private buildGraveyard(group: THREE.Group): void {
    const stone = mkMat(0x7a7a86, { roughness: 0.95 })
    const darkRoof = mkMat(0x3a3a42, { roughness: 0.9 })
    const darkTrim = mkMat(0x2e2e34, { roughness: 0.9 })

    // walls + flat dark roof (with overhang)
    const walls = mkBox(6.5, 4, 6.5, stone)
    walls.position.y = 2
    group.add(walls)
    addFlatRoof(group, 4, 6.5, 0.4, darkRoof)

    // small chimney at the back of the roof
    addChimney(group, 2.4, -2.2, 4.6, false)

    // door (dark) with a stone step
    addDoor(group, 0, 3.25, darkTrim, stone)

    // dark stained windows, framed in stone
    const paneMat = mkMat(0x1a1a22, { roughness: 0.5 })
    addWindow(group, -2.2, 2.6, 3.25, 0, 1, paneMat, stone)
    addWindow(group, 2.2, 2.6, 3.25, 0, 1, paneMat, stone)
    addWindow(group, 0, 2.6, -3.25, 0, -1, paneMat, stone)

    // tombstones scattered around the plot (outside the walls)
    const tombMat = mkMat(0xb4b4be, { roughness: 0.85 })
    const makeTomb = (x: number, z: number, rounded: boolean): void => {
      const tomb = new THREE.Group()
      const slab = mkBox(0.75, 0.75, 0.22, tombMat)
      slab.position.y = 0.375
      tomb.add(slab)
      if (rounded) {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), tombMat)
        cap.scale.y = 0.72
        cap.position.y = 0.75
        tomb.add(cap)
      } else {
        const v = mkBox(0.12, 0.5, 0.07, tombMat)
        v.position.set(0, 0.55, 0.14)
        const h = mkBox(0.34, 0.12, 0.07, tombMat)
        h.position.set(0, 0.62, 0.14)
        tomb.add(v, h)
      }
      tomb.position.set(x, 0, z)
      group.add(tomb)
    }
    makeTomb(-4.4, -4.0, true)
    makeTomb(0.8, -5.2, false)
    makeTomb(4.6, -3.2, true)
    makeTomb(-4.8, 2.6, false)
    makeTomb(3.4, 4.6, true)
    makeTomb(-1.2, 5.0, false)

    // fence: thin posts + two rails around the plot
    const fenceMat = mkMat(0x4a4a52, { roughness: 0.9 })
    const R = 6.2
    const posts = 12
    for (let i = 0; i < posts; i++) {
      const a = (i / posts) * Math.PI * 2
      const post = mkBox(0.16, 1.1, 0.16, fenceMat)
      post.position.set(Math.cos(a) * R, 0.55, Math.sin(a) * R)
      group.add(post)
    }
    for (let i = 0; i < posts; i++) {
      const a0 = (i / posts) * Math.PI * 2
      const a1 = ((i + 1) / posts) * Math.PI * 2
      const dx = Math.cos(a1) - Math.cos(a0)
      const dz = Math.sin(a1) - Math.sin(a0)
      const len = Math.hypot(dx, dz) * R
      const mx = (Math.cos(a0) + Math.cos(a1)) / 2
      const mz = (Math.sin(a0) + Math.sin(a1)) / 2
      const rotY = -Math.atan2(dz, dx)
      for (const ry of [0.5, 0.95]) {
        const rail = mkBox(len, 0.08, 0.08, fenceMat)
        rail.position.set(mx * R, ry, mz * R)
        rail.rotation.y = rotY
        group.add(rail)
      }
    }
  }

  /** Den: shady low hideout — dark green walls, hanging herbs, amber window. */
  private buildDen(group: THREE.Group): void {
    const wallMat = mkMat(0x3d4a2e, { roughness: 0.95 })
    const roofMat = mkMat(0x2a3320, { roughness: 0.85 })
    const trimMat = mkMat(0x5a6a3a, { roughness: 0.8 })

    // low walls + a low-pitched gabled roof
    const walls = mkBox(6.5, 3.2, 6.5, wallMat)
    walls.position.y = 1.6
    group.add(walls)
    addGableRoof(group, { wallTop: 3.2, halfDepth: 3.55, halfWidth: 3.5, roofH: 1.5, mat: roofMat, ridgeMat: roofMat })

    // small chimney — no smoke, a hideout stays quiet
    addChimney(group, 2.3, -1.6, 3.2 + 1.5 * (1 - 1.6 / 3.55), false)

    // glowing amber window above the door, with a frame
    const amber = mkMat(0xffb24d, { emissive: 0xffa93d, emissiveIntensity: 1.6, roughness: 0.3 })
    addWindow(group, 0, 2.5, 3.25, 0, 1, amber, trimMat)

    // door (dark wood) + step
    addDoor(group, 0, 3.25, mkMat(0x241c12), trimMat, 1.2, 1.8)

    // hanging herbs dangling from under the roof edge
    const herbMat = mkMat(0x4f9a3d, { roughness: 0.7 })
    const herbMat2 = mkMat(0x6abf4f, { roughness: 0.7 })
    const hang = (x: number, z: number, len: number, r: number, mat: THREE.Material): void => {
      const herb = new THREE.Group()
      const stem = mkBox(0.06, len, 0.06, herbMat)
      stem.position.y = -len / 2
      const bulb = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.8, 6), mat)
      bulb.rotation.x = Math.PI
      bulb.position.y = -len - r * 0.9
      herb.add(stem, bulb)
      herb.position.set(x, 3.3, z)
      group.add(herb)
    }
    hang(-2.4, -2.5, 0.5, 0.22, herbMat)
    hang(-1.5, -2.6, 0.65, 0.28, herbMat2)
    hang(2.3, -2.5, 0.45, 0.2, herbMat)
    hang(2.9, -1.8, 0.6, 0.26, herbMat2)
    hang(-2.8, 1.9, 0.55, 0.24, herbMat)
  }

  /** School: light blue-gray hall with a flat roof, a bell, and a book at the door. */
  private buildSchool(group: THREE.Group): void {
    const wallMat = mkMat(0xa8b6c9, { roughness: 0.9 })
    const roofMat = mkMat(0x5a6a80, { roughness: 0.6 })
    const trimMat = mkMat(0xd8dfe8, { roughness: 0.7 })

    const walls = mkBox(6.5, 4, 6.5, wallMat)
    walls.position.y = 2
    group.add(walls)

    // flat roof with a slight overhang
    addFlatRoof(group, 4, 6.5, 0.35, roofMat)

    // chimney at the back
    addChimney(group, 2.4, -2.4, 4.5, false)

    // small bell on the roof: post + sphere + cone clapper
    const bellMat = mkMat(0xd8b04a, { roughness: 0.4, metalness: 0.3 })
    const post = mkBox(0.14, 0.8, 0.14, bellMat)
    post.position.y = 4.65
    const bell = mkSphere(0.34, bellMat)
    bell.position.y = 5.0
    const bellTop = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.22, 8), bellMat)
    bellTop.position.y = 5.4
    group.add(post, bell, bellTop)

    // windows (light panes, framed)
    const winMat = mkMat(0xdfe8f2, { roughness: 0.3 })
    const frameMat = mkMat(0x4a5a70, { roughness: 0.6 })
    addWindow(group, -2.2, 2.7, 3.25, 0, 1, winMat, frameMat)
    addWindow(group, 2.2, 2.7, 3.25, 0, 1, winMat, frameMat)
    addWindow(group, -2.2, 2.7, -3.25, 0, -1, winMat, frameMat)
    addWindow(group, 2.2, 2.7, -3.25, 0, -1, winMat, frameMat)
    addWindow(group, 3.25, 2.7, 0, 1, 0, winMat, frameMat)
    addWindow(group, -3.25, 2.7, 0, -1, 0, winMat, frameMat)

    // door + step
    addDoor(group, 0, 3.25, mkMat(0x4a3a28), trimMat)

    // book icon over the door: two open pages
    const bookMat = mkMat(0xf0e8d0, { roughness: 0.7 })
    const book = new THREE.Group()
    const pageL = mkBox(0.5, 0.06, 0.34, bookMat)
    pageL.rotation.z = 0.35
    pageL.position.set(-0.24, 0, 0)
    const pageR = mkBox(0.5, 0.06, 0.34, bookMat)
    pageR.rotation.z = -0.35
    pageR.position.set(0.24, 0, 0)
    const spine = mkBox(0.06, 0.1, 0.34, 0x8a4a2a)
    book.add(pageL, pageR, spine)
    book.position.set(0, 2.3, 3.44)
    group.add(book)
  }

  /** Farm: wide red barn with a dark gabled roof, hay bales and crop rows. */
  private buildFarm(group: THREE.Group): void {
    const wallMat = mkMat(0x9c4a38, { roughness: 0.9 })
    const roofMat = mkMat(0x4a3626, { roughness: 0.6 })
    const trimMat = mkMat(0x6e3a2e, { roughness: 0.8 })

    // wide barn walls
    const walls = mkBox(9, 4.5, 6.5, wallMat)
    walls.position.y = 2.25
    group.add(walls)

    // dark gabled roof with overhang
    addGableRoof(group, { wallTop: 4.5, halfDepth: 3.6, halfWidth: 4.75, roofH: 2.2, mat: roofMat, ridgeMat: roofMat })

    // chimney + smoke
    addChimney(group, 2.6, -1.7, 4.5 + 2.2 * (1 - 1.7 / 3.6), true)

    // big barn door + step
    addDoor(group, 0, 3.25, mkMat(0x5a3524), trimMat, 1.8, 2.4)

    // windows: loft window in the front gable + side windows
    const paneMat = mkMat(0x2e2618, { roughness: 0.4 })
    addWindow(group, 0, 5.5, 3.62, 0, 1, paneMat, trimMat)
    addWindow(group, 3.25, 2.5, 0, 1, 0, paneMat, trimMat)
    addWindow(group, -3.25, 2.5, 0, -1, 0, paneMat, trimMat)

    // hay bales stacked beside the barn
    const hayMat = mkMat(0xd9b94a, { roughness: 0.9 })
    const bale = (x: number, y: number, z: number): void => {
      const b = mkCyl(0.45, 0.45, 0.9, 10, hayMat)
      b.rotation.x = Math.PI / 2
      b.position.set(x, y, z)
      group.add(b)
    }
    bale(-3.5, 0.45, 4.3)
    bale(-2.4, 0.45, 4.5)
    bale(-2.95, 1.35, 4.4)

    // crop rows behind the barn
    const cropA = mkMat(0x6fae4a, { roughness: 0.9 })
    const cropB = mkMat(0x8fae5f, { roughness: 0.9 })
    for (let i = 0; i < 6; i++) {
      const row = mkBox(0.45, 0.1, 2.8, i % 2 === 0 ? cropA : cropB)
      row.position.set(-3.9 + i * 1.56, 0.05, -4.6)
      group.add(row)
    }
  }

  /** Park: open pavilion, a pond with pebbles, and two trees. */
  private buildPark(group: THREE.Group): void {
    const postMat = mkMat(0x8a7a5a, { roughness: 0.85 })
    const roofMat = mkMat(0x3d7a5a, { roughness: 0.7 })

    // pavilion: 4 posts + flat roof with a finial
    for (const [px, pz] of [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3], [2.3, 2.3]] as const) {
      const post = mkBox(0.26, 3, 0.26, postMat)
      post.position.set(px, 1.5, pz)
      group.add(post)
    }
    addFlatRoof(group, 3, 5.2, 0.3, roofMat)
    const finial = mkSphere(0.18, 0xd9a13d)
    finial.position.y = 3.5
    group.add(finial)

    // pond: blue circles on the ground + a pebble ring
    const pondOuter = new THREE.Mesh(new THREE.CircleGeometry(2.6, 28), mkMat(0x3a7a9a, { roughness: 0.9 }))
    pondOuter.rotation.x = -Math.PI / 2
    pondOuter.position.set(4.3, 0.02, -2.9)
    group.add(pondOuter)
    const pond = new THREE.Mesh(new THREE.CircleGeometry(2.25, 28), mkMat(0x4faeae, { roughness: 0.35 }))
    pond.rotation.x = -Math.PI / 2
    pond.position.set(4.3, 0.04, -2.9)
    group.add(pond)
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      const pebble = mkSphere(0.11, 0x9a9aa4)
      pebble.scale.y = 0.5
      pebble.position.set(4.3 + Math.cos(a) * 2.7, 0.05, -2.9 + Math.sin(a) * 2.7)
      group.add(pebble)
    }

    // two trees: brown trunk + layered green canopy
    const trunkMat = mkMat(0x6e4a2e, { roughness: 0.9 })
    const leafMat = mkMat(0x4fae5a, { roughness: 0.8 })
    const leafMat2 = mkMat(0x3d8f4a, { roughness: 0.8 })
    const tree = (x: number, z: number, scale: number): void => {
      const g = new THREE.Group()
      const trunk = mkCyl(0.24 * scale, 0.32 * scale, 1.7 * scale, 10, trunkMat)
      trunk.position.y = 0.85 * scale
      g.add(trunk)
      const c1 = mkSphere(1.05 * scale, leafMat)
      c1.position.y = 2.35 * scale
      const c2 = mkSphere(0.7 * scale, leafMat2)
      c2.position.set(0.45 * scale, 2.9 * scale, 0.2 * scale)
      const c3 = mkSphere(0.6 * scale, leafMat2)
      c3.position.set(-0.4 * scale, 2.7 * scale, -0.3 * scale)
      g.add(c1, c2, c3)
      g.position.set(x, 0, z)
      group.add(g)
    }
    tree(-4.3, -2.6, 1)
    tree(-3.4, 3.1, 1.25)
  }

  // ── creatures: big ball + eyes + brows + mouth + carried stick + emotion badge ──
  private addCreature(c: Creature): void {
    const group = new THREE.Group()
    const hue = (c.id * 47) % 360
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(1.45, 24, 20),
      new THREE.MeshStandardMaterial({ color: `hsl(${hue} 40% 70%)`, roughness: 0.55 })
    )
    body.position.y = 1.45
    group.add(body)

    const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 })
    const irisMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(`hsl(${(hue + 180) % 360}, 70%, 45%)`), roughness: 0.2 })
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x120d08, roughness: 0.1 })
    // proper eyeballs: white sclera + colored iris + black pupil; the iris
    // color is genetic (derived from the creature's own hue family), and the
    // pupil points where the creature is looking (facing direction).
    const makeEye = (x: number, z: number): THREE.Mesh => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 12), eyeWhite)
      eye.position.set(x, 1.95, z)
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), irisMat)
      iris.position.set(0, 0, 0.12)
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), pupilMat)
      pupil.position.set(0, 0, 0.3)
      iris.add(pupil)
      eye.add(iris)
      group.add(eye)
      return eye
    }
    const leftEye = makeEye(-0.55, 1.0)
    const rightEye = makeEye(0.55, 1.0)
    // store the iris so we can aim it (look where the creature is going)
    const leftIris = leftEye.children[0] as THREE.Mesh
    const rightIris = rightEye.children[0] as THREE.Mesh

    const browMat = new THREE.MeshStandardMaterial({ color: 0x2a2418 })
    const makeBrow = (x: number): THREE.Mesh => {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.12), browMat)
      brow.position.set(x, 2.45, 1.0)
      group.add(brow)
      return brow
    }
    const leftBrow = makeBrow(-0.55)
    const rightBrow = makeBrow(0.55)

    // mouth: a small flattened box that the emotion shapes (smile / frown / O)
    const mouth = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.12, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x2a2418 })
    )
    mouth.position.set(0, 1.45, 1.5)
    group.add(mouth)

    // genetics-based hair — each ball looks different, children inherit
    const hair = this.buildHair(c, hue)
    group.add(hair)

    // carried stick: a simple baton on the creature's side (visible when equipped)
    const stick = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x76502f, roughness: 0.9 })
    )
    stick.position.set(1.9, 1.45, 0)
    stick.rotation.z = Math.PI / 2
    stick.visible = false
    group.add(stick)

    // sleeping Zzz
    const sleepZ = makeTextSprite('💤', { size: 34 })
    sleepZ.position.set(1.6, 3.4, 0.2)
    sleepZ.visible = false
    group.add(sleepZ)

    // name label (small, toggle via opacity)
    const nameLabel = makeTextSprite(c.name, { size: 24, color: '#fff', bg: 'rgba(20,20,16,0.7)', radius: 10 })
    nameLabel.position.set(0, 4.2, 0)
    group.add(nameLabel)

    // emotion badge: a tiny disc above the head that shows the mood color to everyone
    const emotionBadgeGroup = new THREE.Group()
    const badgeRing = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 20),
      new THREE.MeshBasicMaterial({ color: 0x1a1a16, side: THREE.DoubleSide, depthTest: false })
    )
    const emotionBadge = new THREE.Mesh(
      new THREE.CircleGeometry(0.35, 20),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false })
    )
    emotionBadgeGroup.add(badgeRing, emotionBadge)
    emotionBadgeGroup.position.set(0, 5.2, 0)
    group.add(emotionBadgeGroup)

    group.position.set(c.pos.x, GROUND_Y, c.pos.z)
    this.scene.add(group)

    this.rigs.push({
      creature: c,
      group,
      body,
      leftEye,
      rightEye,
      leftIris,
      rightIris,
      leftBrow,
      rightBrow,
      mouth,
      sleepZ,
      nameLabel,
      stick,
      hair,
      emotionBadge,
      emotionBadgeGroup,
      phase: Math.random() * Math.PI * 2,
      targetX: c.pos.x,
      targetZ: c.pos.z,
      swing: 0,
    })
  }

  /** Simple genetic hair: spiky cones, a tuft, curls, long strands, buzz, or bald. */
  private buildHair(c: Creature, idHue: number): THREE.Group {
    const g = new THREE.Group()
    const h = hairStyle(c.genome, idHue)
    const mat = new THREE.MeshStandardMaterial({ color: h.color, roughness: 0.8 })
    const topY = 1.85
    const S = 1.38 // body grew from radius 1.05 → 1.45
    const size = (0.55 + h.size * 0.3) * S

    switch (h.style) {
      case 'spiky': {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.14 * S, (0.5 * h.size + 0.3) * S, 5), mat)
          spike.position.set(Math.cos(a) * 0.62 * S, topY + 0.35 * S, Math.sin(a) * 0.62 * S)
          spike.rotation.x = Math.cos(a) * 0.5
          spike.rotation.z = -Math.sin(a) * 0.5
          g.add(spike)
        }
        break
      }
      case 'tuft': {
        const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.28 * S, 0.6 * size, 6), mat)
        tuft.position.set(0, topY + 0.4 * S, 0)
        g.add(tuft)
        break
      }
      case 'curly': {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2
          const curl = new THREE.Mesh(new THREE.SphereGeometry(0.2 * S, 8, 6), mat)
          curl.position.set(Math.cos(a) * 0.76 * S, topY + 0.22 * S, Math.sin(a) * 0.76 * S)
          g.add(curl)
        }
        break
      }
      case 'long': {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2
          const strand = new THREE.Mesh(new THREE.BoxGeometry(0.12 * S, 0.85 * S, 0.12 * S), mat)
          strand.position.set(Math.cos(a) * 0.74 * S, topY - 0.12 * S, Math.sin(a) * 0.74 * S)
          g.add(strand)
        }
        break
      }
      case 'buzz': {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(1.06 * S, 16, 8), mat)
        cap.scale.y = 0.55
        cap.position.y = topY - 0.18 * S
        g.add(cap)
        break
      }
      default: // bald: a tiny sheen on top
        break
    }
    return g
  }

  /**
   * The player's body: a small human-like figure built from primitives —
   * dark pants + warm jacket + skin-tone head with a hat and a backpack.
   * Forward is local +z, so rotation.y = facing points it where it walks.
   */
  private buildPlayerRig(p: Player): PlayerRig {
    const group = new THREE.Group()

    const pantsMat = mkMat(0x3a352c, { roughness: 0.9 })
    const jacketMat = mkMat(0xb06a3a, { roughness: 0.85 })
    const skinMat = mkMat(0xe8b088, { roughness: 0.7 })
    const hairMat = mkMat(0x4a3524, { roughness: 0.9 })
    const packMat = mkMat(0x5a6a4a, { roughness: 0.9 })
    const eyeMat = mkMat(0x241c12, { roughness: 0.3 })

    // legs — swing while walking
    const legL = mkBox(0.26, 0.85, 0.26, pantsMat)
    legL.position.set(-0.17, 0.42, 0)
    const legR = mkBox(0.26, 0.85, 0.26, pantsMat)
    legR.position.set(0.17, 0.42, 0)
    group.add(legL, legR)

    // torso — taller than any creature
    const body = mkBox(0.72, 0.9, 0.42, jacketMat)
    body.position.set(0, 1.32, 0)
    group.add(body)

    // arms
    const armL = mkBox(0.18, 0.72, 0.18, jacketMat)
    armL.position.set(-0.47, 1.34, 0)
    const armR = mkBox(0.18, 0.72, 0.18, jacketMat)
    armR.position.set(0.47, 1.34, 0)
    group.add(armL, armR)

    // head — warm skin tone, eyes, and a little hat
    const head = mkSphere(0.34, skinMat)
    head.position.set(0, 2.02, 0)
    group.add(head)
    const eyeL = mkSphere(0.045, eyeMat)
    eyeL.position.set(-0.13, 2.06, 0.3)
    const eyeR = mkSphere(0.045, eyeMat)
    eyeR.position.set(0.13, 2.06, 0.3)
    group.add(eyeL, eyeR)
    const hat = mkBox(0.56, 0.16, 0.56, hairMat)
    hat.position.set(0, 2.34, 0)
    const brim = mkBox(0.62, 0.07, 0.2, hairMat)
    brim.position.set(0, 2.28, 0.22)
    group.add(hat, brim)

    // backpack (visible from behind)
    const pack = mkBox(0.5, 0.62, 0.26, packMat)
    pack.position.set(0, 1.38, -0.36)
    group.add(pack)

    // carried stick — appears when a weapon is equipped
    const stick = mkBox(0.14, 0.14, 1.5, mkMat(0x76502f, { roughness: 0.9 }))
    stick.position.set(0.5, 1.0, 0.24)
    stick.rotation.z = 0.5
    stick.visible = false
    group.add(stick)

    // floating name tag
    const nameLabel = makeTextSprite(`🧍 ${p.name}`, { size: 22, color: '#fff', bg: 'rgba(20,20,16,0.7)', radius: 10 })
    nameLabel.position.set(0, 2.9, 0)
    group.add(nameLabel)

    group.rotation.y = p.facing
    group.position.set(p.pos.x, 0, p.pos.z)
    this.scene.add(group)
    return { group, legL, legR, armL, armR, body, head, stick, nameLabel, phase: Math.random() * Math.PI * 2, lastX: p.pos.x, lastZ: p.pos.z }
  }

  /** Keep the player figure in sync with sim.player — legs swing while walking. */
  private syncPlayer(dt: number): void {
    const rig = this.playerRig
    const p = this.sim.player
    if (!rig || !p) return
    const t = performance.now() / 1000

    rig.group.position.x += (p.pos.x - rig.group.position.x) * 0.35
    rig.group.position.z += (p.pos.z - rig.group.position.z) * 0.35
    const dx = rig.group.position.x - rig.lastX
    const dz = rig.group.position.z - rig.lastZ
    rig.lastX = rig.group.position.x
    rig.lastZ = rig.group.position.z
    const speed = Math.hypot(dx, dz) / Math.max(dt, 0.001)
    const moving = p.alive && speed > 0.4

    rig.group.rotation.y = p.facing
    if (!p.alive) {
      // the visitor collapsed — lay the figure down
      rig.group.rotation.x = Math.PI / 2
      rig.group.position.y = 0.14
      rig.stick.visible = false
      rig.legL.rotation.x = 0
      rig.legR.rotation.x = 0
    } else {
      rig.group.rotation.x = 0
      const swing = moving ? Math.sin(t * 11 + rig.phase) * 0.62 : 0
      rig.legL.rotation.x = swing
      rig.legR.rotation.x = -swing
      rig.armL.rotation.x = -swing * 0.55
      rig.armR.rotation.x = swing * 0.55
      rig.group.position.y = moving ? Math.abs(Math.sin(t * 11 + rig.phase)) * 0.08 : 0
      rig.stick.visible = p.weapon === 'stick'
    }
    rig.nameLabel.material.opacity = 0.85
  }

  // ── events → particles ──
  private syncNewCreatures(): void {
    for (const c of this.sim.creatures) {
      if (!this.knownIds.has(c.id)) {
        this.knownIds.add(c.id)
        this.addCreature(c)
      }
    }
    // prune dead rigs (creature removed from sim never happens here, but guard)
    for (let i = this.rigs.length - 1; i >= 0; i--) {
      if (!this.sim.creatureById(this.rigs[i].creature.id)) {
        this.scene.remove(this.rigs[i].group)
        this.rigs.splice(i, 1)
      }
    }
  }

  /** Keep ground markers for every live drop; remove the ones creatures ate. */
  private syncDrops(): void {
    const live = new Set(this.sim.drops.map((d) => `${d.kind}:${d.x.toFixed(2)}:${d.z.toFixed(2)}`))
    for (let i = this.dropMarkers.length - 1; i >= 0; i--) {
      const m = this.dropMarkers[i]
      const key = `${m.drop.kind}:${m.drop.x.toFixed(2)}:${m.drop.z.toFixed(2)}`
      if (!live.has(key)) {
        this.scene.remove(m.mesh)
        this.dropMarkers.splice(i, 1)
      }
    }
    for (const d of this.sim.drops) {
      const key = `${d.kind}:${d.x.toFixed(2)}:${d.z.toFixed(2)}`
      if (this.dropMarkers.some((m) => `${m.drop.kind}:${m.drop.x.toFixed(2)}:${m.drop.z.toFixed(2)}` === key)) continue
      const mesh = d.kind === 'food'
        ? makeTextSprite('🍞', { size: 26 })
        : makeTextSprite('🪙', { size: 24 })
      mesh.position.set(d.x, 0.5, d.z)
      this.scene.add(mesh)
      this.dropMarkers.push({ drop: { kind: d.kind, x: d.x, z: d.z }, mesh })
    }
  }

  /** Keep a tiny gray slab at every grave so buried creatures stay visible. */
  private syncGraves(): void {
    const live = new Set(this.sim.graves.map((g) => g.creatureId))
    for (let i = this.graveMarkers.length - 1; i >= 0; i--) {
      if (!live.has(this.graveMarkers[i].id)) {
        this.scene.remove(this.graveMarkers[i].mesh)
        this.graveMarkers.splice(i, 1)
      }
    }
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x9a9aa4, roughness: 0.85 })
    for (const g of this.sim.graves) {
      if (this.graveMarkers.some((m) => m.id === g.creatureId)) continue
      const mesh = new THREE.Group()
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.14, 0.5), slabMat)
      slab.position.y = 0.07
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.12), slabMat)
      head.position.y = 0.29
      mesh.add(slab, head)
      mesh.position.set(g.x, 0, g.z)
      this.scene.add(mesh)
      this.graveMarkers.push({ id: g.creatureId, mesh })
    }
  }

  private consumeEvents(): void {
    for (const ev of this.sim.events) {
      this.spawnEvent(ev)
      // every experience makes a sound, mood-shifted by the actor
      const actor = this.sim.creatures.find((c) => c.id === ev.aId)
      this.sound.playEvent(ev.type, {
        pleasure: actor?.chem.pleasure ?? 0.5,
        grief: actor?.chem.grief ?? 0,
        fear: actor?.chem.fear ?? 0,
      }, ev.type === 'love' || ev.type === 'birth' || ev.type === 'death' ? 1.4 : 1)
    }
    this.sim.events.length = 0
  }

  private spawnEvent(ev: SimEvent): void {
    const x = ev.x
    const z = ev.z
    switch (ev.type) {
      case 'fight': {
        for (let i = 0; i < 6; i++) {
          this.spawnParticle(
            new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff4a3a })),
            x + (Math.random() - 0.5) * 1.6, 1.2, z + (Math.random() - 0.5) * 1.6,
            (Math.random() - 0.5) * 3, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.5
          )
        }
        break
      }
      case 'steal': {
        const coin = makeTextSprite('🪙', { size: 26 })
        coin.position.set(x, 1.6, z)
        this.spawnParticle(coin, x, 1.6, z, 0, 4, 0, 0.7)
        break
      }
      case 'love': {
        for (let i = 0; i < 4; i++) {
          const heart = makeTextSprite('❤️', { size: 24 })
          heart.position.set(x + (Math.random() - 0.5) * 0.6, 1.8, z + (Math.random() - 0.5) * 0.6)
          this.spawnParticle(heart, x + (Math.random() - 0.5) * 0.6, 1.8, z + (Math.random() - 0.5) * 0.6, 0, 2.2, 0, 0.9)
        }
        break
      }
      case 'birth': {
        for (let i = 0; i < 5; i++) {
          const star = makeTextSprite('✨', { size: 24 })
          star.position.set(x + (Math.random() - 0.5), 1.5, z + (Math.random() - 0.5))
          this.spawnParticle(star, x + (Math.random() - 0.5), 1.5, z + (Math.random() - 0.5), 0, 2, 0, 0.9)
        }
        break
      }
      case 'death': {
        const xmark = makeTextSprite('✖️', { size: 30 })
        xmark.position.set(x, 1.4, z)
        this.spawnParticle(xmark, x, 1.4, z, 0, 1.6, 0, 1.4)
        break
      }
      case 'drink': {
        const mug = makeTextSprite('🍺', { size: 26 })
        mug.position.set(x, 1.5, z)
        this.spawnParticle(mug, x, 1.5, z, 0, 2.4, 0, 0.8)
        break
      }
      case 'medicine': {
        const pill = makeTextSprite('💊', { size: 24 })
        pill.position.set(x, 1.5, z)
        this.spawnParticle(pill, x, 1.5, z, 0, 2.4, 0, 0.8)
        break
      }
      case 'flinch': {
        const bang = makeTextSprite('!', { size: 30, color: '#fff' })
        bang.position.set(x, 1.6, z)
        this.spawnParticle(bang, x, 1.6, z, 0, 2.8, 0, 0.6)
        break
      }
      case 'comfort': {
        for (let i = 0; i < 4; i++) {
          const heart = makeTextSprite('🫂', { size: 24 })
          heart.position.set(x + (Math.random() - 0.5) * 0.6, 1.8, z + (Math.random() - 0.5) * 0.6)
          this.spawnParticle(heart, x + (Math.random() - 0.5) * 0.6, 1.8, z + (Math.random() - 0.5) * 0.6, 0, 2.2, 0, 0.9)
        }
        break
      }
      case 'heal': {
        const spark = makeTextSprite('✨', { size: 28 })
        spark.position.set(x, 1.6, z)
        this.spawnParticle(spark, x, 1.6, z, 0, 2.6, 0, 0.8)
        break
      }
      case 'gift': {
        const coin = makeTextSprite('💝', { size: 28 })
        coin.position.set(x, 1.6, z)
        this.spawnParticle(coin, x, 1.6, z, 0, 2.6, 0, 0.9)
        break
      }
      case 'scare': {
        const ghost = makeTextSprite('👻', { size: 30 })
        ghost.position.set(x, 1.8, z)
        this.spawnParticle(ghost, x, 1.8, z, 0, 2.2, 0, 1.0)
        break
      }
      case 'rob': {
        const hand = makeTextSprite('🫳', { size: 28 })
        hand.position.set(x, 1.6, z)
        this.spawnParticle(hand, x, 1.6, z, 0, 2.4, 0, 0.8)
        break
      }
      case 'play': {
        const ball = makeTextSprite('⚽', { size: 26 })
        ball.position.set(x, 1.6, z)
        this.spawnParticle(ball, x, 1.6, z, 0, 2.6, 0, 0.8)
        break
      }
      case 'drop': {
        // food/coin piles are drawn persistently in syncDrops; sparkle to confirm
        const spark = makeTextSprite('✦', { size: 22, color: '#fff4d8' })
        spark.position.set(x, 1.0, z)
        this.spawnParticle(spark, x, 1.0, z, 0, 1.6, 0, 0.8)
        break
      }
      case 'hit': {
        const bam = makeTextSprite('💥', { size: 30 })
        bam.position.set(x, 1.6, z)
        this.spawnParticle(bam, x, 1.6, z, 0, 2.6, 0, 0.7)
        break
      }
      case 'joinGang': {
        const sword = makeTextSprite('⚔️', { size: 30 })
        sword.position.set(x, 1.6, z)
        this.spawnParticle(sword, x, 1.6, z, 0, 2.4, 0, 0.8)
        break
      }
      default:
        break
    }
  }

  private spawnParticle(mesh: THREE.Object3D, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number): void {
    mesh.position.set(x, y, z)
    this.scene.add(mesh)
    this.particles.push({ mesh: mesh as THREE.Mesh | THREE.Sprite, life, max: life, vy, vx, vz })
  }

  // Throttled async brain inference: refresh one creature's preferences each
  // frame so tfjs work is spread out (no frame spikes, mobile-friendly).
  private lastBrainRefresh = 0
  private brainCursor = 0
  private refreshBrains(now: number): void {
    const creatures = this.sim.creatures
    if (creatures.length === 0 || now - this.lastBrainRefresh < 500) return
    this.lastBrainRefresh = now
    const c = creatures[this.brainCursor % creatures.length]
    this.brainCursor++
    if (c.alive) void refreshBrain(this.sim, c)
  }

  // ── main loop ──
  private loop(now: number): void {
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now

    if (!this.paused) {
      this.simAccum += dt * this.speed
      let guard = 0
      while (this.simAccum >= STEP && guard++ < 6) {
        this.simAccum -= STEP
        this.sim.tick() // sync tick; brain learning refreshes async below
      }
      if (guard >= 6) this.simAccum = 0
    }

    // player input (joystick / WASD) applies every frame, paused or not
    this.applyPlayerInput(dt)
    this.refreshBrains(now)
    this.consumeEvents()
    this.syncNewCreatures()
    this.syncDrops()
    this.syncGraves()
    this.syncRigs(dt)
    this.syncPlayer(dt)
    this.updateParticles(dt)
    this.updateCamera(dt)

    this.renderer.render(this.scene, this.camera)
  }

  private syncRigs(dt: number): void {
    const t = performance.now() / 1000
    for (const rig of this.rigs) {
      const c = rig.creature
      const emo = deriveEmotion(c.chem, c.genome)
      const body = rig.body.material as THREE.MeshStandardMaterial
      body.color.lerp(new THREE.Color(emo.color), 1 - Math.pow(0.001, dt))

      // position — slower follow while hauling a corpse
      rig.targetX = c.pos.x
      rig.targetZ = c.pos.z
      const hauling = c.action === 'carry' || c.action === 'bury'
      const follow = hauling ? 0.16 : 0.35
      rig.group.position.x += (rig.targetX - rig.group.position.x) * follow
      rig.group.position.z += (rig.targetZ - rig.group.position.z) * follow

      // carried stick: visible when the creature owns a weapon, swings during fights,
      // flicks once when darting off with stolen goods
      rig.stick.visible = c.weapon === 'stick'
      if (c.action === 'fight') rig.swing = 1
      if (c.action === 'steal' && rig.stick.visible) rig.swing = 1
      if (rig.swing > 0) {
        rig.swing = Math.max(0, rig.swing - dt * 3)
        rig.stick.rotation.z = Math.PI / 2 + Math.sin((1 - rig.swing) * Math.PI) * 1.4
      } else {
        rig.stick.rotation.z = Math.PI / 2
      }

      // bob / hop / lunge / tremble / sleep / dead
      const baseY = 0
      let y = baseY
      if (!c.alive) {
        y = baseY + 0.05
        rig.group.rotation.x = 0.15
        rig.group.rotation.z = 0
      } else if (c.sleeping) {
        y = baseY + 0.02
        rig.group.rotation.x = 0.9
        rig.sleepZ.visible = true
      } else if (c.action === 'fight') {
        // lunge: fast y-bob + a slight tilt into the facing direction
        rig.group.rotation.x = 0
        rig.group.rotation.z = 0
        rig.sleepZ.visible = false
        const lunge = Math.sin(t * 15 + rig.phase)
        y = baseY + Math.abs(lunge) * 0.3
        rig.group.rotation.x = lunge * 0.18 * Math.cos(c.facing)
        rig.group.rotation.z = -lunge * 0.18 * Math.sin(c.facing)
      } else if (c.action === 'steal') {
        // dart: quick sideways hop perpendicular to the facing direction
        rig.group.rotation.x = 0
        rig.group.rotation.z = 0
        rig.sleepZ.visible = false
        const dart = Math.sin(t * 20 + rig.phase)
        y = baseY + Math.abs(dart) * 0.2
        rig.group.position.x += dart * 0.3 * -Math.sin(c.facing)
        rig.group.position.z += dart * 0.3 * Math.cos(c.facing)
      } else if (hauling) {
        // carrying a corpse: hunched low, no bounce
        rig.group.rotation.x = 0
        rig.group.rotation.z = 0
        rig.sleepZ.visible = false
        y = baseY - 0.3
      } else {
        rig.group.rotation.x = 0
        rig.sleepZ.visible = false
        const speedFactor = 0.4 + c.chem.energy * 0.5
        if (emo.type === 'afraid') {
          y = baseY + Math.abs(Math.sin(t * 22 + rig.phase)) * 0.18
          rig.group.position.x += Math.sin(t * 30 + rig.phase) * 0.015
        } else if (emo.type === 'happy') {
          y = baseY + Math.abs(Math.sin(t * 8 + rig.phase)) * 0.5
        } else {
          y = baseY + Math.abs(Math.sin(t * speedFactor * 4 + rig.phase)) * 0.09
        }
      }
      rig.group.position.y = y

      // face: brows + eye size + mouth
      this.applyFace(rig, emo.type, emo.intensity)

      // eyeballs: the iris looks where the creature is going (facing),
      // plus a tiny wander so the eyes feel alive
      const lookX = Math.sin(c.facing) * 0.14 + Math.sin(t * 0.7 + rig.phase) * 0.02
      const lookZ = Math.cos(c.facing) * 0.14 + Math.cos(t * 0.5 + rig.phase) * 0.02
      rig.leftIris.position.set(lookX, 0, 0.12 + lookZ * 0.5)
      rig.rightIris.position.set(lookX, 0, 0.12 + lookZ * 0.5)

      // emotion badge: tint the disc with the mood color, keep it facing the camera
      ;(rig.emotionBadge.material as THREE.MeshBasicMaterial).color.set(emo.color)
      rig.emotionBadgeGroup.lookAt(this.camera.position)

      // name label subtle
      rig.nameLabel.material.opacity = 0.85
    }
  }

  private applyFace(rig: CreatureRig, emo: string, intensity: number): void {
    const tilt = Math.max(0.2, intensity)
    const scale = 1 + (intensity - 0.5) * 0.2
    rig.leftEye.scale.setScalar(scale)
    rig.rightEye.scale.setScalar(scale)

    const mouth = rig.mouth
    switch (emo) {
      case 'happy':
        rig.leftBrow.rotation.z = -0.35 * tilt
        rig.rightBrow.rotation.z = 0.35 * tilt
        rig.leftBrow.position.y = 2.53
        rig.rightBrow.position.y = 2.53
        mouth.scale.set(1.2, 0.5, 1) // wide smile
        mouth.position.y = 1.38
        break
      case 'angry':
        rig.leftBrow.rotation.z = 0.5 * tilt
        rig.rightBrow.rotation.z = -0.5 * tilt
        rig.leftBrow.position.y = 2.45
        rig.rightBrow.position.y = 2.45
        mouth.scale.set(1.1, 0.5, 1) // gritted
        mouth.position.y = 1.4
        break
      case 'afraid':
        rig.leftBrow.rotation.z = -0.2
        rig.rightBrow.rotation.z = 0.2
        rig.leftBrow.position.y = 2.65
        rig.rightBrow.position.y = 2.65
        mouth.scale.set(0.7, 1.4, 1) // small O
        mouth.position.y = 1.38
        break
      case 'sad':
        rig.leftBrow.rotation.z = 0.22
        rig.rightBrow.rotation.z = -0.22
        rig.leftBrow.position.y = 2.38
        rig.rightBrow.position.y = 2.38
        mouth.scale.set(0.9, 0.5, 1) // small frown
        mouth.rotation.x = 0.5
        mouth.position.y = 1.3
        break
      case 'sleepy':
        rig.leftBrow.rotation.z = 0.1
        rig.rightBrow.rotation.z = -0.1
        rig.leftBrow.position.y = 2.45
        rig.rightBrow.position.y = 2.45
        rig.leftEye.scale.y = 0.35
        rig.rightEye.scale.y = 0.35
        mouth.scale.set(0.8, 0.4, 1)
        mouth.rotation.x = 0
        mouth.position.y = 1.4
        break
      case 'loving':
        rig.leftBrow.rotation.z = -0.25
        rig.rightBrow.rotation.z = 0.25
        rig.leftBrow.position.y = 2.55
        rig.rightBrow.position.y = 2.55
        mouth.scale.set(1.1, 0.6, 1) // warm smile
        mouth.position.y = 1.4
        break
      default: // content
        rig.leftBrow.rotation.z = 0
        rig.rightBrow.rotation.z = 0
        rig.leftBrow.position.y = 2.45
        rig.rightBrow.position.y = 2.45
        mouth.scale.set(1, 0.6, 1)
        mouth.rotation.x = 0
        mouth.position.y = 1.45
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.life -= dt
      if (p.life <= 0) {
        this.scene.remove(p.mesh)
        this.particles.splice(i, 1)
        continue
      }
      p.mesh.position.y += p.vy * dt
      p.mesh.position.x += p.vx * dt
      p.mesh.position.z += p.vz * dt
      p.vy -= 2.5 * dt
      const mat = (p.mesh as THREE.Sprite).material as THREE.SpriteMaterial | undefined
      if (mat && 'opacity' in mat) mat.opacity = Math.max(0, p.life / p.max)
    }
  }

  // ── camera ──
  private updateCamera(dt: number): void {
    // first-person: follow the PLAYER (a distinct human character) from just
    // behind their head, looking along facing with fpPitch — the figure stays
    // visible below the frame center.
    if (this.playerId !== null) {
      const p = this.sim.player
      if (p && p.alive) {
        const f = p.facing
        const sin = Math.sin(f)
        const cos = Math.cos(f)
        const target = new THREE.Vector3(
          p.pos.x - sin * this.fpDist,
          1.7,
          p.pos.z - cos * this.fpDist
        )
        this.camera.position.lerp(target, 1 - Math.pow(0.001, dt))
        const look = target
          .clone()
          .add(new THREE.Vector3(sin * Math.cos(this.fpPitch), Math.sin(this.fpPitch), cos * Math.cos(this.fpPitch)))
        this.camera.lookAt(look)
        return
      }
      // player dead → drop back to the observer camera
      this.playerId = null
    }
    const look = new THREE.Vector3(this.camTarget.x, 0, this.camTarget.z)
    const offset = new THREE.Vector3(0, Math.sin(this.camTilt), Math.cos(this.camTilt)).multiplyScalar(this.camDist)
    const pos = look.clone().add(offset)
    this.camera.position.lerp(pos, 1 - Math.pow(0.001, dt))
    this.camera.lookAt(look)
  }

  // ── pointer controls ──
  private setupPointerEvents(): void {
    const el = this.renderer.domElement
    el.style.touchAction = 'none'
    el.addEventListener('pointerdown', (e) => {
      this.sound.unlock() // first touch unlocks audio (browser autoplay rule)
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      this.downPos = { x: e.clientX, y: e.clientY }
      this.downTime = performance.now()
      this.moved = false
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]
        this.pinchStart = Math.hypot(a.x - b.x, a.y - b.y)
      }
      el.setPointerCapture(e.pointerId)
    })
    el.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return
      const prev = this.pointers.get(e.pointerId)!
      const dx = e.clientX - prev.x
      const dy = e.clientY - prev.y
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (Math.hypot(dx, dy) > 3) this.moved = true

      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (this.pinchStart > 0) {
          const ratio = d / this.pinchStart
          if (this.playerId !== null) {
            // in first-person, pinch pulls the camera closer / further
            this.fpDist = Math.min(8, Math.max(1.2, this.fpDist / ratio))
          } else {
            this.camDist = Math.min(220, Math.max(24, this.camDist / ratio))
          }
          this.pinchStart = d
        }
      } else if (this.panLast) {
        if (this.playerId !== null) this.fpLook(dx, dy)
        else this.panBy(dx, dy)
      }
      this.panLast = { x: e.clientX, y: e.clientY }
    })
    const endPointer = (e: PointerEvent): void => {
      if (this.pointers.size === 2) this.pinchStart = 0
      this.pointers.delete(e.pointerId)
      this.panLast = null
      if (this.pointers.size === 0) {
        const dt = performance.now() - this.downTime
        if (!this.moved && dt < 350 && this.downPos) {
          this.tapBuffer.push({ x: this.downPos.x, y: this.downPos.y, t: performance.now() })
        }
        this.downPos = null
      }
    }
    el.addEventListener('pointerup', endPointer)
    el.addEventListener('pointercancel', endPointer)

    // wheel zoom for desktop (first-person: camera distance)
    el.addEventListener('wheel', (e) => {
      e.preventDefault()
      if (this.playerId !== null) {
        this.fpDist = Math.min(8, Math.max(1.2, this.fpDist + e.deltaY * 0.01))
      } else {
        this.camDist = Math.min(220, Math.max(24, this.camDist + e.deltaY * 0.03))
      }
    }, { passive: false })

    // process taps after each frame
    const tapLoop = (): void => {
      requestAnimationFrame(tapLoop)
      const now = performance.now()
      while (this.tapBuffer.length > 0) {
        const tap = this.tapBuffer[0]
        if (now - tap.t > 120) this.tapBuffer.shift()
        else break
      }
      if (this.tapBuffer.length > 0 && now - this.tapBuffer[0].t < 80) {
        const tap = this.tapBuffer.shift()!
        this.handleTap(tap.x, tap.y)
      }
    }
    requestAnimationFrame(tapLoop)
  }

  private panBy(dx: number, dy: number): void {
    const scale = this.camDist / 400
    this.camTarget.x -= dx * scale
    this.camTarget.z += dy * scale
    const max = WORLD_HALF - 8
    this.camTarget.x = Math.min(max, Math.max(-max, this.camTarget.x))
    this.camTarget.z = Math.min(max, Math.max(-max, this.camTarget.z))
  }

  private handleTap(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera)

    // creature hit? (never the player creature itself — tools act on others)
    let best: { id: number; dist: number; x: number; z: number } | null = null
    for (const rig of this.rigs) {
      if (!rig.creature.alive || rig.creature.id === this.playerId) continue
      const p = new THREE.Vector3(rig.group.position.x, 1.2, rig.group.position.z)
      const ray = this.raycaster.ray
      const t0 = ray.distanceToPoint(p)
      if (t0 < 1.9) {
        const dx = rig.group.position.x - this.camera.position.x
        const dz = rig.group.position.z - this.camera.position.z
        const d = Math.hypot(dx, dz)
        if (!best || d < best.dist) best = { id: rig.creature.id, dist: d, x: rig.group.position.x, z: rig.group.position.z }
      }
    }
    if (best) {
      this.callbacks.onTapCreature(best.id, best.x, best.z)
      return
    }

    // ground hit
    const ground = new THREE.Vector3()
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, ground)
    if (hit) this.callbacks.onTapWorld(ground.x, ground.z)
  }

  setPaused(p: boolean): void {
    this.paused = p
  }

  setSpeed(s: number): void {
    this.speed = s
  }

  resetCamera(): void {
    this.camTarget.set(0, 0, 0)
    this.camDist = 90
  }

  // ── first-person mode ──

  /** Enter/exit first-person mode. Any non-null id enters; null = observer. */
  setFirstPerson(playerCreatureId: number | null): void {
    this.playerId = playerCreatureId
    this.fpPitch = 0
    this.joystick = { x: 0, y: 0 }
    this.keys.clear()
    if (this.pointerLocked) this.exitPointerLock()
    if (playerCreatureId === null) return
    const p = this.sim.player
    if (p) this.camTarget.set(p.pos.x, 0, p.pos.z)
    // snap the camera behind the player's head for an instant handover
    const f = p?.facing ?? 0
    const sin = Math.sin(f)
    const cos = Math.cos(f)
    const px = (p?.pos.x ?? 0) - sin * this.fpDist
    const pz = (p?.pos.z ?? 0) - cos * this.fpDist
    this.camera.position.set(px, 1.7, pz)
    this.camera.lookAt(px + sin, 1.7, pz + cos)
  }

  /**
   * Move the player (a distinct character, not a creature) by (dx, dz) world
   * units directly, clamped to the world walls. Facing is untouched — the
   * look controls own it, so strafing never fights the camera.
   */
  playerMove(dx: number, dz: number): void {
    const p = this.sim.player
    if (!p || !p.alive) return
    p.pos.x = clampCoord(p.pos.x + dx)
    p.pos.z = clampCoord(p.pos.z + dz)
  }

  /** Turn the first-person view: yaw changes player.facing, pitch is fpPitch. */
  playerLook(yaw: number, pitch: number): void {
    const p = this.sim.player
    if (p) p.facing -= yaw
    this.fpPitch = Math.min(1.2, Math.max(-1.2, this.fpPitch - pitch))
  }

  /** Raycast a tap at screen coordinates (used by the touch look zone). */
  tapAt(clientX: number, clientY: number): void {
    this.handleTap(clientX, clientY)
  }

  /** Request pointer lock on the canvas; drag-look stays as the fallback. */
  requestPointerLock(): void {
    const el = this.renderer.domElement
    if (typeof el.requestPointerLock !== 'function') return
    try {
      const p = el.requestPointerLock() as unknown as Promise<void> | void
      if (p && typeof (p as Promise<void>).catch === 'function') {
        void (p as Promise<void>).catch(() => undefined)
      }
    } catch {
      // unsupported — the drag-look fallback already covers desktop mice
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock()
  }

  /** Drag-look (touch / mouse fallback): dx yaws, dy pitches. */
  private fpLook(dx: number, dy: number): void {
    this.playerLook(dx * 0.008, dy * 0.008)
  }

  /** Consume the joystick vector + WASD keys into player movement each frame. */
  private applyPlayerInput(dt: number): void {
    const p = this.sim.player
    if (!p || !p.alive) return
    const jx = this.joystick.x
    const jy = this.joystick.y
    let mx = 0
    let mz = 0
    const mag = Math.hypot(jx, jy)
    if (mag > 0.08) {
      // joystick is facing-relative: up = forward, right = strafe right
      const sin = Math.sin(p.facing)
      const cos = Math.cos(p.facing)
      mx = sin * jy + cos * jx
      mz = cos * jy - sin * jx
    }
    if (this.pointerLocked) {
      const sin = Math.sin(p.facing)
      const cos = Math.cos(p.facing)
      if (this.keys.has('w')) { mx += sin; mz += cos }
      if (this.keys.has('s')) { mx -= sin; mz -= cos }
      if (this.keys.has('d')) { mx += cos; mz -= sin }
      if (this.keys.has('a')) { mx -= cos; mz += sin }
    }
    const len = Math.hypot(mx, mz)
    if (len > 0.001) {
      // speed scales with joystick deflection, capped at full speed
      const step = 6.5 * dt * Math.min(1, len)
      this.playerMove((mx / len) * step, (mz / len) * step)
    }
  }
}
