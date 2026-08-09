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
  sleepZ: THREE.Sprite
  nameLabel: THREE.Sprite
  phase: number
  targetX: number
  targetZ: number
}

const TICK_RATE = 6
const STEP = 1 / TICK_RATE
const GROUND_Y = 0

function makeTextSprite(text: string, opts: { size?: number; color?: string; bg?: string; radius?: number } = {}): THREE.Sprite {
  const size = opts.size ?? 64
  const canvas = document.createElement('canvas')
  canvas.width = size * 4
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (opts.bg) {
    ctx.fillStyle = opts.bg
    const r = (opts.radius ?? 12) * 4
    ctx.beginPath()
    ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, r)
    ctx.fill()
  }
  ctx.fillStyle = opts.color ?? '#fff8e8'
  ctx.font = `700 ${size * 2.4}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(size / 40, size / 160, 1)
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

  // ── towers ──
  private buildTower(t: Tower): void {
    const group = new THREE.Group()
    const color = new THREE.Color(t.color)
    // square base
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(5, 1.2, 5),
      new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
    )
    base.position.y = 0.6
    group.add(base)
    // tower column
    const column = new THREE.Mesh(
      new THREE.BoxGeometry(3, 6, 3),
      new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.75), roughness: 0.9 })
    )
    column.position.y = 4.2
    group.add(column)
    // roof
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 0.8, 4.2),
      new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(1.2), roughness: 0.6 })
    )
    roof.position.y = 8.0
    group.add(roof)
    // label + icon
    const label = makeTextSprite(`${t.icon} ${t.label}`, { color: '#1c1a14', bg: '#fff4d8' })
    label.position.set(0, 9.2, 0)
    group.add(label)
    group.position.set(t.x, 0, t.z)
    this.scene.add(group)
    this.towerMeshes.push(group)
  }

  // ── creatures: ball + eyes + brows ──
  private addCreature(c: Creature): void {
    const group = new THREE.Group()
    const hue = (c.id * 47) % 360
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 20, 16),
      new THREE.MeshStandardMaterial({ color: `hsl(${hue} 40% 70%)`, roughness: 0.6 })
    )
    body.position.y = 0.55
    group.add(body)

    const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff })
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
    const makeEye = (x: number, z: number): THREE.Mesh => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), eyeWhite)
      eye.position.set(x, 0.78, z)
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), pupilMat)
      pupil.position.set(0, 0, 0.12)
      eye.add(pupil)
      group.add(eye)
      return eye
    }
    const leftEye = makeEye(-0.22, 0.42)
    const rightEye = makeEye(0.22, 0.42)

    const browMat = new THREE.MeshStandardMaterial({ color: 0x2a2418 })
    const makeBrow = (x: number): THREE.Mesh => {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.05), browMat)
      brow.position.set(x, 1.02, 0.42)
      group.add(brow)
      return brow
    }
    const leftBrow = makeBrow(-0.22)
    const rightBrow = makeBrow(0.22)

    // sleeping Zzz
    const sleepZ = makeTextSprite('💤', { size: 28 })
    sleepZ.position.set(0.7, 1.9, 0.2)
    sleepZ.visible = false
    group.add(sleepZ)

    // name label (small, toggle via opacity)
    const nameLabel = makeTextSprite(c.name, { size: 20, color: '#fff', bg: 'rgba(20,20,16,0.7)', radius: 10 })
    nameLabel.position.set(0, 2.3, 0)
    group.add(nameLabel)

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
      sleepZ,
      nameLabel,
      phase: Math.random() * Math.PI * 2,
      targetX: c.pos.x,
      targetZ: c.pos.z,
    })
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

      // position
      rig.targetX = c.pos.x
      rig.targetZ = c.pos.z
      rig.group.position.x += (rig.targetX - rig.group.position.x) * 0.35
      rig.group.position.z += (rig.targetZ - rig.group.position.z) * 0.35

      // bob / hop / tremble / sleep / dead
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
      } else {
        rig.group.rotation.x = 0
        rig.sleepZ.visible = false
        const speedFactor = 0.4 + c.chem.energy * 0.5
        if (emo.type === 'afraid') {
          y = baseY + Math.abs(Math.sin(t * 22 + rig.phase)) * 0.12
          rig.group.position.x += Math.sin(t * 30 + rig.phase) * 0.012
        } else if (emo.type === 'happy') {
          y = baseY + Math.abs(Math.sin(t * 8 + rig.phase)) * 0.35
        } else {
          y = baseY + Math.abs(Math.sin(t * speedFactor * 4 + rig.phase)) * 0.06
        }
      }
      rig.group.position.y = y

      // face: brows + eye size
      this.applyFace(rig, emo.type, emo.intensity)

      // name label subtle
      rig.nameLabel.material.opacity = 0.85
    }
  }

  private applyFace(rig: CreatureRig, emo: string, intensity: number): void {
    const tilt = Math.max(0.2, intensity)
    const scale = 1 + (intensity - 0.5) * 0.2
    rig.leftEye.scale.setScalar(scale)
    rig.rightEye.scale.setScalar(scale)
    rig.leftEye.position.z = 0.42 + (0.55 - scale) * 0.6
    rig.rightEye.position.z = 0.42 + (0.55 - scale) * 0.6

    switch (emo) {
      case 'happy':
        rig.leftBrow.rotation.z = -0.35 * tilt
        rig.rightBrow.rotation.z = 0.35 * tilt
        rig.leftBrow.position.y = 1.06
        rig.rightBrow.position.y = 1.06
        break
      case 'angry':
        rig.leftBrow.rotation.z = 0.5 * tilt
        rig.rightBrow.rotation.z = -0.5 * tilt
        rig.leftBrow.position.y = 1.0
        rig.rightBrow.position.y = 1.0
        break
      case 'afraid':
        rig.leftBrow.rotation.z = -0.2
        rig.rightBrow.rotation.z = 0.2
        rig.leftBrow.position.y = 1.14
        rig.rightBrow.position.y = 1.14
        break
      case 'sad':
        rig.leftBrow.rotation.z = 0.22
        rig.rightBrow.rotation.z = -0.22
        rig.leftBrow.position.y = 0.96
        rig.rightBrow.position.y = 0.96
        break
      case 'sleepy':
        rig.leftBrow.rotation.z = 0.1
        rig.rightBrow.rotation.z = -0.1
        rig.leftBrow.position.y = 1.0
        rig.rightBrow.position.y = 1.0
        rig.leftEye.scale.y = 0.35
        rig.rightEye.scale.y = 0.35
        break
      case 'loving':
        rig.leftBrow.rotation.z = -0.25
        rig.rightBrow.rotation.z = 0.25
        rig.leftBrow.position.y = 1.08
        rig.rightBrow.position.y = 1.08
        break
      default: // content
        rig.leftBrow.rotation.z = 0
        rig.rightBrow.rotation.z = 0
        rig.leftBrow.position.y = 1.02
        rig.rightBrow.position.y = 1.02
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
          this.camDist = Math.min(75, Math.max(14, this.camDist / ratio))
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
      this.camDist = Math.min(75, Math.max(14, this.camDist + e.deltaY * 0.03))
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
      const p = new THREE.Vector3(rig.group.position.x, 0.55, rig.group.position.z)
      const ray = this.raycaster.ray
      const t0 = ray.distanceToPoint(p)
      if (t0 < 1.4) {
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
