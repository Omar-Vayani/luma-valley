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
import { deriveEmotion } from '../lab/emotion'
import { hairStyle } from '../lab/hair'

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

  // camera control
  private camTarget = new THREE.Vector3(0, 0, 0)
  private camTilt = 1.0 // radians
  private camDist = 40

  // pointer state (pan + pinch + tap)
  private pointers = new Map<number, { x: number; y: number }>()
  private panLast: { x: number; y: number } | null = null
  private pinchStart = 0
  private downTime = 0
  private downPos: { x: number; y: number } | null = null
  private moved = false
  private tapBuffer: { x: number; y: number; t: number }[] = []

  private rigs: CreatureRig[] = []
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

    // warm sky + haze so the horizon is never black
    this.scene.background = new THREE.Color('#cfc4a6')
    this.scene.fog = new THREE.Fog('#cfc4a6', 70, 150)

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

    // events
    this.setupPointerEvents()
    this.updateCamera(0)
    this.last = performance.now()
    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
    ;(window as unknown as Record<string, unknown>).__lab = { view: this, sim }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  // ── towers: classic houses — cube walls, slanted triangle roof, gable ends,
  //    windows, a door, and a hanging sign with the label. Simple shapes.
  //    graveyard / den / school get their own themed builds. ──
  private buildTower(t: Tower): void {
    const group = new THREE.Group()
    const color = new THREE.Color(t.color)

    if (t.id === 'graveyard') {
      this.buildGraveyard(group)
    } else if (t.id === 'den') {
      this.buildDen(group)
    } else if (t.id === 'school') {
      this.buildSchool(group)
    } else {
      this.buildHouse(group, t, color)
    }

    // hanging sign with the label — big, readable, above the door
    const label = makeTextSprite(`${t.icon} ${t.label}`, { color: '#1c1a14', bg: '#fff4d8', size: 44 })
    label.position.set(0, 7.4, 0)
    group.add(label)

    group.position.set(t.x, 0, t.z)
    this.scene.add(group)
    this.towerMeshes.push(group)
  }

  /** The standard tower: cube walls, slanted triangle roof, windows, door. */
  private buildHouse(group: THREE.Group, t: Tower, color: THREE.Color): void {
    const wallMat = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.8), roughness: 0.9 })
    const roofMat = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(1.25), roughness: 0.55 })

    // cube walls
    const walls = new THREE.Mesh(new THREE.BoxGeometry(6.5, 4, 6.5), wallMat)
    walls.position.y = 2
    group.add(walls)

    // slanted triangle roof: two planes + triangular gable ends + ridge
    const roof = new THREE.Group()
    const slope = 0.75
    const half = 3.45
    const roofH = half * slope // rise
    // two roof planes
    const plane = (rotX: number, y: number): THREE.Mesh => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(7.4, Math.hypot(half, roofH)), roofMat)
      p.rotation.x = rotX
      p.position.y = y
      return p
    }
    roof.add(plane(Math.PI / 2 - Math.atan(slope), roofH / 2))
    roof.add(plane(-(Math.PI / 2 - Math.atan(slope)), roofH / 2))
    // gable triangles (fill the open front/back)
    const gable = (rotY: number): THREE.Mesh => {
      const shape = new THREE.Shape()
      shape.moveTo(-half, 0)
      shape.lineTo(half, 0)
      shape.lineTo(0, roofH)
      shape.closePath()
      const g = new THREE.Mesh(new THREE.ShapeGeometry(shape), roofMat)
      g.rotation.y = rotY
      g.position.y = 4
      return g
    }
    roof.add(gable(0))
    roof.add(gable(Math.PI))
    roof.position.y = 0
    group.add(roof)

    // ridge cap
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.3, 0.3), roofMat)
    ridge.position.y = 4 + roofH
    group.add(ridge)

    // windows (dark squares on the walls)
    const winMat = new THREE.MeshStandardMaterial({ color: 0x241d14, roughness: 0.4 })
    for (const [wx, wz] of [[-2.3, 0], [2.3, 0], [0, -2.3], [0, 2.3]] as const) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.08), winMat)
      win.position.set(wx, 2.6, wz)
      group.add(win)
    }

    // door
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 0.1), new THREE.MeshStandardMaterial({ color: 0x3a2a18 }))
    door.position.set(0, 1, 2.3)
    group.add(door)

    // special decoration per tower
    if (t.id === 'homes') {
      // beds: little raised rectangles
      for (let i = 0; i < 3; i++) {
        const bed = new THREE.Group()
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 1), new THREE.MeshStandardMaterial({ color: 0x6a4a2a }))
        frame.position.y = 0.5
        const mat = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 1), new THREE.MeshStandardMaterial({ color: 0xcfc4a6 }))
        mat.position.y = 0.75
        bed.add(frame)
        bed.add(mat)
        bed.position.set(-2.6 + i * 2.6, 0, -2.9)
        group.add(bed)
      }
    } else if (t.id === 'play') {
      // gym/play: a swing set + rings
      const postMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a })
      const swing = new THREE.Group()
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 0.3), postMat)
      p1.position.set(-1.8, 1.5, 0)
      const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 0.3), postMat)
      p2.position.set(1.8, 1.5, 0)
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.25, 0.25), postMat)
      bar.position.y = 3
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 0.5), new THREE.MeshStandardMaterial({ color: 0xd9a13d }))
      seat.position.y = 1.3
      swing.add(p1, p2, bar, seat)
      group.add(swing)
      for (const [rx, rz] of [[-2.6, -1.8], [2.6, -1.8]] as const) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.1, 8, 12), new THREE.MeshStandardMaterial({ color: 0xe0b46a }))
        ring.position.set(rx, 1.6, rz)
        group.add(ring)
      }
    } else if (t.id === 'work') {
      // work tower: an anvil + stacked crates (factory look)
      const anvil = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x666 }))
      anvil.position.set(-1.5, 0.3, -1.2)
      group.add(anvil)
      for (let i = 0; i < 2; i++) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: 0x8a6a40 }))
        crate.position.set(1.6, 0.45 + i * 0.95, 1.4)
        group.add(crate)
      }
    }
  }

  /** Graveyard: dark stone chapel + tombstones + fence around the plot. */
  private buildGraveyard(group: THREE.Group): void {
    const stone = new THREE.MeshStandardMaterial({ color: 0x7a7a86, roughness: 0.95 })
    const darkRoof = new THREE.MeshStandardMaterial({ color: 0x3a3a42, roughness: 0.9 })
    const darkTrim = new THREE.MeshStandardMaterial({ color: 0x2e2e34, roughness: 0.9 })

    // walls + flat dark roof (with overhang)
    const walls = new THREE.Mesh(new THREE.BoxGeometry(6.5, 4, 6.5), stone)
    walls.position.y = 2
    group.add(walls)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.4, 7.6), darkRoof)
    roof.position.y = 4.2
    group.add(roof)

    // door (dark)
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 0.1), darkTrim)
    door.position.set(0, 1, 2.3)
    group.add(door)

    // tombstones: rounded-top slabs + a couple with a carved cross
    const tombMat = new THREE.MeshStandardMaterial({ color: 0xb4b4be, roughness: 0.85 })
    const makeTomb = (x: number, z: number, rounded: boolean): void => {
      const tomb = new THREE.Group()
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.22), tombMat)
      slab.position.y = 0.375
      tomb.add(slab)
      if (rounded) {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), tombMat)
        cap.scale.y = 0.72
        cap.position.y = 0.75
        tomb.add(cap)
      } else {
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.07), tombMat)
        v.position.set(0, 0.55, 0.14)
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.07), tombMat)
        h.position.set(0, 0.62, 0.14)
        tomb.add(v, h)
      }
      tomb.position.set(x, 0, z)
      group.add(tomb)
    }
    makeTomb(-2.2, -2.3, true)
    makeTomb(0.5, -2.5, false)
    makeTomb(2.6, -1.7, true)
    makeTomb(-1.0, 2.0, false)

    // fence: thin posts + two rails around the plot
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.9 })
    const R = 6.2
    const posts = 12
    for (let i = 0; i < posts; i++) {
      const a = (i / posts) * Math.PI * 2
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.1, 0.16), fenceMat)
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
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), fenceMat)
        rail.position.set(mx * R, ry, mz * R)
        rail.rotation.y = rotY
        group.add(rail)
      }
    }
  }

  /** Den: shady low hideout — dark green walls, hanging herbs, amber window. */
  private buildDen(group: THREE.Group): void {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3d4a2e, roughness: 0.95 })
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a3320, roughness: 0.85 })

    // low walls + a low-pitched slanted roof
    const walls = new THREE.Mesh(new THREE.BoxGeometry(6.5, 3.2, 6.5), wallMat)
    walls.position.y = 1.6
    group.add(walls)
    const slope = 0.45
    const half = 3.45
    const roofH = half * slope
    const wallTop = 3.2
    const plane = (rotX: number, y: number): THREE.Mesh => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(7.4, Math.hypot(half, roofH)), roofMat)
      p.rotation.x = rotX
      p.position.y = y
      return p
    }
    group.add(plane(Math.PI / 2 - Math.atan(slope), roofH / 2 + wallTop))
    group.add(plane(-(Math.PI / 2 - Math.atan(slope)), roofH / 2 + wallTop))
    const gable = (rotY: number): THREE.Mesh => {
      const shape = new THREE.Shape()
      shape.moveTo(-half, 0)
      shape.lineTo(half, 0)
      shape.lineTo(0, roofH)
      shape.closePath()
      const g = new THREE.Mesh(new THREE.ShapeGeometry(shape), roofMat)
      g.rotation.y = rotY
      g.position.y = wallTop
      return g
    }
    group.add(gable(0))
    group.add(gable(Math.PI))
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.25, 0.25), roofMat)
    ridge.position.y = wallTop + roofH
    group.add(ridge)

    // glowing amber window
    const amber = new THREE.MeshStandardMaterial({ color: 0xffb24d, emissive: 0xffa93d, emissiveIntensity: 1.6, roughness: 0.3 })
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.08), amber)
    win.position.set(0, 2.2, 2.3)
    group.add(win)

    // door (dark wood)
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.1), new THREE.MeshStandardMaterial({ color: 0x241c12 }))
    door.position.set(0, 0.9, 2.3)
    group.add(door)

    // hanging herbs dangling from under the roof edge
    const herbMat = new THREE.MeshStandardMaterial({ color: 0x4f9a3d, roughness: 0.7 })
    const herbMat2 = new THREE.MeshStandardMaterial({ color: 0x6abf4f, roughness: 0.7 })
    const hang = (x: number, z: number, len: number, r: number, mat: THREE.Material): void => {
      const herb = new THREE.Group()
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.06, len, 0.06), herbMat)
      stem.position.y = -len / 2
      const bulb = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.8, 6), mat)
      bulb.rotation.x = Math.PI
      bulb.position.y = -len - r * 0.9
      herb.add(stem, bulb)
      herb.position.set(x, wallTop + 0.1, z)
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
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xa8b6c9, roughness: 0.9 })
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x5a6a80, roughness: 0.6 })

    const walls = new THREE.Mesh(new THREE.BoxGeometry(6.5, 4, 6.5), wallMat)
    walls.position.y = 2
    group.add(walls)

    // flat roof with a slight overhang
    const roof = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.35, 7.6), roofMat)
    roof.position.y = 4.15
    group.add(roof)

    // small bell on the ridge: post + sphere + cone clapper
    const bellMat = new THREE.MeshStandardMaterial({ color: 0xd8b04a, roughness: 0.4, metalness: 0.3 })
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.8, 0.14), bellMat)
    post.position.y = 4.65
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), bellMat)
    bell.position.y = 5.0
    const bellTop = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.22, 8), bellMat)
    bellTop.position.y = 5.4
    group.add(post, bell, bellTop)

    // windows (light panes)
    const winMat = new THREE.MeshStandardMaterial({ color: 0xdfe8f2, roughness: 0.3 })
    for (const [wx, wz] of [[-2.3, 0], [2.3, 0], [0, -2.3]] as const) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.08), winMat)
      win.position.set(wx, 2.6, wz)
      group.add(win)
    }

    // door
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 0.1), new THREE.MeshStandardMaterial({ color: 0x4a3a28 }))
    door.position.set(0, 1, 2.3)
    group.add(door)

    // book icon at the door: two open pages
    const bookMat = new THREE.MeshStandardMaterial({ color: 0xf0e8d0, roughness: 0.7 })
    const book = new THREE.Group()
    const pageL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.34), bookMat)
    pageL.rotation.z = 0.35
    pageL.position.set(-0.24, 0, 0)
    const pageR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.34), bookMat)
    pageR.rotation.z = -0.35
    pageR.position.set(0.24, 0, 0)
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.34), new THREE.MeshStandardMaterial({ color: 0x8a4a2a }))
    book.add(pageL, pageR, spine)
    book.position.set(0, 2.35, 2.42)
    group.add(book)
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

    const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff })
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
    const makeEye = (x: number, z: number): THREE.Mesh => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.39, 12, 10), eyeWhite)
      eye.position.set(x, 1.95, z)
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), pupilMat)
      pupil.position.set(0, 0, 0.2)
      eye.add(pupil)
      group.add(eye)
      return eye
    }
    const leftEye = makeEye(-0.55, 1.0)
    const rightEye = makeEye(0.55, 1.0)

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

  // ── main loop ──
  private loop(now: number): void {
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now

    if (!this.paused) {
      this.simAccum += dt * this.speed
      let guard = 0
      while (this.simAccum >= STEP && guard++ < 8) {
        this.sim.tick()
        this.simAccum -= STEP
      }
      if (guard >= 8) this.simAccum = 0
    }

    this.consumeEvents()
    this.syncNewCreatures()
    this.syncDrops()
    this.syncGraves()
    this.syncRigs(dt)
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
          this.camDist = Math.min(130, Math.max(20, this.camDist / ratio))
          this.pinchStart = d
        }
      } else if (this.panLast) {
        this.panBy(dx, dy)
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

    // wheel zoom for desktop
    el.addEventListener('wheel', (e) => {
      e.preventDefault()
      this.camDist = Math.min(130, Math.max(20, this.camDist + e.deltaY * 0.03))
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

    // creature hit?
    let best: { id: number; dist: number; x: number; z: number } | null = null
    for (const rig of this.rigs) {
      if (!rig.creature.alive) continue
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
    this.camDist = 40
  }
}
