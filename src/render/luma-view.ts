/**
 * luma-view — how a Luma is drawn, and how it moves.
 *
 * A rig of flat-shaded parts on a real joint hierarchy: pelvis, spine, chest,
 * neck, head, two-segment arms and two-segment legs. Nothing is keyframed —
 * every pose is computed from what the simulation already knows, so the
 * animation cannot say something the mind is not doing.
 *
 * Two things in here are worth knowing about.
 *
 * **Knees bend backwards.** A knee is a hinge that only folds one way, and
 * with the shin hanging down the −Y axis and the face looking down +Z, that
 * fold is a *positive* rotation about X. The previous rig negated it, so from
 * the knee down every leg swung forwards into the shin above it, which is the
 * single most obviously wrong thing about the way they used to walk.
 *
 * **The sim runs slower than the screen.** Positions are followed with a
 * damped spring and the gait is measured from the path actually drawn, not
 * from the simulated one, so a walk cycle stays smooth between sim steps.
 */
import * as THREE from 'three'
import type { Creature } from '../sim/creature'
import { heightAt } from '../sim/terrain'

// ---------------------------------------------------------------- palette

/** Luma are not people. The palette says so without being garish. */
const COATS = [
  '#c9a227', '#8fb339', '#5aa9a3', '#6d8cc4', '#a97bbd',
  '#d08a5a', '#b8615e', '#7d9b76', '#c2a37a', '#8a86a8',
]

const SMOCKS = ['#e6dbc4', '#cfd9d3', '#e0cdb8', '#d4d2e0', '#dcd6c2', '#e5cfc4']

function pick<T>(list: T[], v: number): T {
  return list[Math.min(list.length - 1, Math.max(0, Math.floor(v * list.length)))]
}

interface Look {
  coat: THREE.Color
  smock: THREE.Color
  height: number
  build: number
}

function lookOf(c: Creature): Look {
  return {
    coat: new THREE.Color(pick(COATS, c.genome.hue)),
    smock: new THREE.Color(pick(SMOCKS, (c.genome.curiosity * 0.7 + c.genome.hue * 0.3) % 1)),
    height: 1.15 + c.genome.size * 0.28,
    build: 0.9 + c.genome.size * 0.18,
  }
}

// ---------------------------------------------------------------- geometry

/** A tapered box, which is most of a body. */
function taper(top: number, bottom: number, height: number, depth: number, depthTop = depth): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 4, 1)
  geo.rotateY(Math.PI / 4)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const upper = y > 0
    const w = upper ? top : bottom
    const d = upper ? depthTop : depth
    pos.setX(i, Math.sign(pos.getX(i)) * (w / 2))
    pos.setZ(i, Math.sign(pos.getZ(i)) * (d / 2))
    pos.setY(i, y * height)
  }
  geo.computeVertexNormals()
  return geo
}

const GEO = {
  head: taper(0.30, 0.25, 0.28, 0.30, 0.28),
  muzzle: taper(0.15, 0.13, 0.10, 0.16, 0.12),
  ear: taper(0.07, 0.10, 0.24, 0.05),
  neck: taper(0.13, 0.16, 0.10, 0.13),
  chest: taper(0.40, 0.34, 0.30, 0.26, 0.28),
  belly: taper(0.34, 0.32, 0.18, 0.24),
  pelvis: taper(0.32, 0.29, 0.14, 0.24),
  upperArm: taper(0.10, 0.09, 0.22, 0.10),
  foreArm: taper(0.09, 0.08, 0.20, 0.09),
  hand: new THREE.BoxGeometry(0.10, 0.10, 0.09),
  thigh: taper(0.14, 0.12, 0.26, 0.15),
  shin: taper(0.11, 0.09, 0.26, 0.11),
  foot: new THREE.BoxGeometry(0.13, 0.07, 0.22),
  tail: taper(0.09, 0.05, 0.26, 0.09),
  eye: new THREE.SphereGeometry(0.055, 10, 7),
  pupil: new THREE.SphereGeometry(0.030, 8, 6),
  nose: new THREE.BoxGeometry(0.05, 0.035, 0.03),
}

// limb origins go at the joint, so rotation happens where it should
for (const [name, h] of [
  ['upperArm', 0.22], ['foreArm', 0.20], ['thigh', 0.26], ['shin', 0.26], ['ear', 0.24],
] as const) {
  GEO[name].translate(0, -h / 2, 0)
}
GEO.neck.translate(0, 0.05, 0)
GEO.chest.translate(0, 0.15, 0)
GEO.belly.translate(0, 0.09, 0)
GEO.pelvis.translate(0, 0.07, 0)
GEO.head.translate(0, 0.14, 0)
GEO.tail.translate(0, -0.13, 0)

const WHITE = new THREE.MeshLambertMaterial({ color: '#faf7f0', flatShading: true })
const DARK = new THREE.MeshLambertMaterial({ color: '#241d1a' })

// ---------------------------------------------------------------- the rig

interface Rig {
  root: THREE.Group
  body: THREE.Group
  pelvis: THREE.Group
  spine: THREE.Group
  chest: THREE.Group
  neck: THREE.Group
  head: THREE.Group
  muzzle: THREE.Mesh
  earL: THREE.Group
  earR: THREE.Group
  eyeL: THREE.Group
  eyeR: THREE.Group
  pupilL: THREE.Mesh
  pupilR: THREE.Mesh
  shoulderL: THREE.Group
  shoulderR: THREE.Group
  elbowL: THREE.Group
  elbowR: THREE.Group
  hipL: THREE.Group
  hipR: THREE.Group
  kneeL: THREE.Group
  kneeR: THREE.Group
  ankleL: THREE.Group
  ankleR: THREE.Group
  tail: THREE.Group
  coatMat: THREE.MeshLambertMaterial

  phase: number
  renderX: number
  renderZ: number
  lastX: number
  lastZ: number
  speed: number
  groundY: number
  blink: number
  blinkTimer: number
  scale: number

  label: Label | null
  bubble: Label | null
  bubbleText: string
  bubbleUntil: number
  ring: THREE.Mesh
  /** the "!" that appears over a frightened Luma */
  alarm: THREE.Sprite | null
}

function joint(parent: THREE.Object3D, x: number, y: number, z = 0): THREE.Group {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  parent.add(g)
  return g
}

function limb(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = true
  parent.add(mesh)
  return mesh
}

// ---------------------------------------------------------------- labels

interface Label {
  sprite: THREE.Sprite
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  texture: THREE.CanvasTexture
  key: string
}

function makeLabel(width: number, height: number): Label | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, transparent: true, depthTest: false, depthWrite: false,
  }))
  sprite.renderOrder = 900
  return { sprite, canvas, ctx, texture, key: '' }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawName(label: Label, name: string, mood: string): void {
  const key = `${name}|${mood}`
  if (label.key === key) return
  label.key = key
  const { ctx, canvas } = label
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = '600 40px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const w = Math.min(canvas.width - 16, ctx.measureText(name).width + 46)
  const h = 54
  const x = (canvas.width - w) / 2
  const y = (canvas.height - h) / 2
  ctx.fillStyle = 'rgba(24, 26, 30, 0.55)'
  roundRect(ctx, x, y, w, h, 16)
  ctx.fill()
  ctx.strokeStyle = mood
  ctx.lineWidth = 2
  roundRect(ctx, x, y, w, h, 16)
  ctx.stroke()
  ctx.fillStyle = '#f4f0e6'
  ctx.fillText(name, canvas.width / 2, y + h / 2 + 1)
  label.texture.needsUpdate = true
}

function drawBubble(label: Label, text: string): void {
  if (label.key === text) return
  label.key = text
  const { ctx, canvas } = label
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = '500 34px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > canvas.width - 96 && line) {
      lines.push(line)
      line = word
    } else line = test
  }
  if (line) lines.push(line)

  const lh = 40
  const h = lines.length * lh + 30
  const w = Math.min(canvas.width - 16, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 54)
  const x = (canvas.width - w) / 2
  const y = canvas.height - h - 26

  ctx.fillStyle = 'rgba(250, 247, 240, 0.95)'
  roundRect(ctx, x, y, w, h, 18)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(canvas.width / 2 - 13, y + h)
  ctx.lineTo(canvas.width / 2 + 13, y + h)
  ctx.lineTo(canvas.width / 2, y + h + 20)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#1d1c22'
  lines.forEach((l, i) => ctx.fillText(l, canvas.width / 2, y + 22 + i * lh))
  label.texture.needsUpdate = true
}

/** The alarm mark that appears over a frightened Luma. */
function makeAlarm(): THREE.Sprite | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.font = '700 52px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffd35c'
  ctx.strokeStyle = 'rgba(30,22,10,0.8)'
  ctx.lineWidth = 5
  ctx.strokeText('!', 32, 34)
  ctx.fillText('!', 32, 34)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, transparent: true, depthTest: false, depthWrite: false,
  }))
  sprite.renderOrder = 950
  sprite.scale.set(0.5, 0.5, 1)
  sprite.visible = false
  return sprite
}

// ---------------------------------------------------------------- the view

export interface LumaViewOptions {
  showNames: boolean
}

export class LumaView {
  readonly group = new THREE.Group()
  private rigs = new Map<number, Rig>()
  private ringGeo: THREE.RingGeometry
  private ringMat: THREE.MeshBasicMaterial

  constructor() {
    this.group.name = 'luma'
    this.ringGeo = new THREE.RingGeometry(0.38, 0.48, 24)
    this.ringGeo.rotateX(-Math.PI / 2)
    this.ringMat = new THREE.MeshBasicMaterial({
      color: '#ffd89a', transparent: true, opacity: 0.8, depthWrite: false,
    })
  }

  private build(c: Creature): Rig {
    const look = lookOf(c)
    const coatMat = new THREE.MeshLambertMaterial({ color: look.coat, flatShading: true })
    const smockMat = new THREE.MeshLambertMaterial({ color: look.smock, flatShading: true })
    const shinMat = new THREE.MeshLambertMaterial({
      color: look.coat.clone().multiplyScalar(0.68),
      flatShading: true,
    })

    const root = new THREE.Group()
    const body = new THREE.Group()
    root.add(body)

    // --- spine --------------------------------------------------------------
    const pelvis = joint(body, 0, 0.62, 0)
    limb(pelvis, GEO.pelvis, coatMat)
    const spine = joint(pelvis, 0, 0.12, 0)
    limb(spine, GEO.belly, smockMat)
    const chest = joint(spine, 0, 0.17, 0)
    limb(chest, GEO.chest, smockMat)

    // --- head ---------------------------------------------------------------
    const neck = joint(chest, 0, 0.28, 0.01)
    limb(neck, GEO.neck, coatMat)
    const head = joint(neck, 0, 0.10, 0)
    limb(head, GEO.head, coatMat)
    const muzzle = limb(head, GEO.muzzle, coatMat)
    muzzle.position.set(0, 0.10, 0.15)
    const nose = limb(head, GEO.nose, DARK)
    nose.position.set(0, 0.12, 0.225)

    const earL = joint(head, -0.10, 0.27, -0.02)
    const earR = joint(head, 0.10, 0.27, -0.02)
    limb(earL, GEO.ear, coatMat)
    limb(earR, GEO.ear, coatMat)
    // ears start upright, which is the neutral pose they are animated from
    earL.rotation.set(0, 0, 0.12)
    earR.rotation.set(0, 0, -0.12)
    earL.userData.isEar = true
    earL.userData.side = -1
    earR.userData.isEar = true
    earR.userData.side = 1

    const makeEye = (side: number) => {
      const g = joint(head, side * 0.105, 0.165, 0.125)
      const white = new THREE.Mesh(GEO.eye, WHITE)
      white.scale.set(1, 1, 0.6)
      g.add(white)
      const pupil = new THREE.Mesh(GEO.pupil, DARK)
      pupil.position.z = 0.036
      g.add(pupil)
      return { g, pupil }
    }
    const eyeLeft = makeEye(-1)
    const eyeRight = makeEye(1)

    // --- arms ---------------------------------------------------------------
    const shoulderL = joint(chest, -0.21 * look.build, 0.24, 0)
    const shoulderR = joint(chest, 0.21 * look.build, 0.24, 0)
    limb(shoulderL, GEO.upperArm, coatMat)
    limb(shoulderR, GEO.upperArm, coatMat)
    const elbowL = joint(shoulderL, 0, -0.22, 0)
    const elbowR = joint(shoulderR, 0, -0.22, 0)
    limb(elbowL, GEO.foreArm, coatMat)
    limb(elbowR, GEO.foreArm, coatMat)
    for (const e of [elbowL, elbowR]) {
      const hand = limb(e, GEO.hand, coatMat)
      hand.position.y = -0.22
    }

    // --- legs ---------------------------------------------------------------
    const hipL = joint(pelvis, -0.095, -0.02, 0)
    const hipR = joint(pelvis, 0.095, -0.02, 0)
    limb(hipL, GEO.thigh, coatMat)
    limb(hipR, GEO.thigh, coatMat)
    const kneeL = joint(hipL, 0, -0.26, 0)
    const kneeR = joint(hipR, 0, -0.26, 0)
    // The shin is a shade darker than the thigh. The knee does bend, but with
    // the whole leg one flat colour the break is nearly impossible to read at
    // any distance, and the walk looks like a pendulum swinging from the hip.
    limb(kneeL, GEO.shin, shinMat)
    limb(kneeR, GEO.shin, shinMat)
    const ankleL = joint(kneeL, 0, -0.26, 0)
    const ankleR = joint(kneeR, 0, -0.26, 0)
    // tagged so the rig can be checked from a test without guessing which
    // anonymous Group is which
    kneeL.userData.isKnee = true
    kneeR.userData.isKnee = true
    ankleL.userData.isAnkle = true
    ankleR.userData.isAnkle = true
    const footL = limb(ankleL, GEO.foot, DARK)
    const footR = limb(ankleR, GEO.foot, DARK)
    footL.position.set(0, -0.03, 0.045)
    footR.position.set(0, -0.03, 0.045)

    // --- tail ---------------------------------------------------------------
    const tail = joint(pelvis, 0, 0.02, -0.13)
    limb(tail, GEO.tail, coatMat)
    tail.rotation.x = 0.7

    const ring = new THREE.Mesh(this.ringGeo, this.ringMat)
    ring.position.y = 0.03
    ring.visible = false
    root.add(ring)

    const scale = look.height / 1.3
    root.scale.setScalar(scale)

    const label = makeLabel(512, 128)
    if (label) {
      label.sprite.position.y = 1.75
      label.sprite.scale.set(1.7, 0.42, 1)
      root.add(label.sprite)
    }
    const bubble = makeLabel(512, 256)
    if (bubble) {
      bubble.sprite.position.y = 2.15
      bubble.sprite.scale.set(2.4, 1.2, 1)
      bubble.sprite.visible = false
      root.add(bubble.sprite)
    }
    const alarm = makeAlarm()
    if (alarm) {
      alarm.position.y = 1.95
      root.add(alarm)
    }

    this.group.add(root)

    return {
      root, body, pelvis, spine, chest, neck, head, muzzle,
      earL, earR,
      eyeL: eyeLeft.g, eyeR: eyeRight.g, pupilL: eyeLeft.pupil, pupilR: eyeRight.pupil,
      shoulderL, shoulderR, elbowL, elbowR,
      hipL, hipR, kneeL, kneeR, ankleL, ankleR, tail,
      coatMat,
      phase: (c.id * 2.399963) % (Math.PI * 2),
      renderX: c.x, renderZ: c.z, lastX: c.x, lastZ: c.z,
      speed: 0,
      groundY: heightAt(c.x, c.z),
      blink: 0,
      blinkTimer: 1 + (c.id % 7) * 0.5,
      scale,
      label, bubble, bubbleText: '', bubbleUntil: 0,
      ring, alarm,
    }
  }

  sync(
    creatures: Creature[],
    dt: number,
    now: number,
    camera: THREE.Camera,
    opts: LumaViewOptions,
    lookedAt: number | null,
    talkingTo: number | null,
  ): void {
    const camPos = new THREE.Vector3()
    camera.getWorldPosition(camPos)
    const seen = new Set<number>()

    for (const c of creatures) {
      seen.add(c.id)
      let rig = this.rigs.get(c.id)
      if (!rig) {
        rig = this.build(c)
        this.rigs.set(c.id, rig)
      }
      this.pose(rig, c, dt, now, camPos, opts, lookedAt, talkingTo)
    }

    for (const [id, rig] of this.rigs) {
      if (seen.has(id)) continue
      this.group.remove(rig.root)
      rig.label?.texture.dispose()
      rig.bubble?.texture.dispose()
      this.rigs.delete(id)
    }
  }

  private pose(
    rig: Rig, c: Creature, dt: number, now: number, camPos: THREE.Vector3,
    opts: LumaViewOptions, lookedAt: number | null, talkingTo: number | null,
  ): void {
    // --- follow the simulated position smoothly -----------------------------
    const jump = Math.hypot(c.x - rig.renderX, c.z - rig.renderZ)
    if (jump > 3) {
      rig.renderX = c.x
      rig.renderZ = c.z
    } else {
      const follow = Math.min(1, dt * 12)
      rig.renderX += (c.x - rig.renderX) * follow
      rig.renderZ += (c.z - rig.renderZ) * follow
    }

    const travelled = Math.hypot(rig.renderX - rig.lastX, rig.renderZ - rig.lastZ)
    rig.lastX = rig.renderX
    rig.lastZ = rig.renderZ
    const instant = travelled / Math.max(dt, 1 / 240)
    rig.speed += (Math.min(instant, 8) - rig.speed) * Math.min(1, dt * 7)
    if (rig.speed < 0.05) rig.speed = 0

    const ground = heightAt(rig.renderX, rig.renderZ)
    rig.groundY += (ground - rig.groundY) * Math.min(1, dt * 10)
    rig.root.position.set(rig.renderX, rig.groundY, rig.renderZ)

    let diff = ((c.facing - rig.root.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI
    if (diff < -Math.PI) diff += Math.PI * 2
    rig.root.rotation.y += diff * Math.min(1, dt * 7)

    const dist = camPos.distanceTo(rig.root.position)
    const near = dist < 45

    const fear = c.drives.fear
    const tired = c.drives.fatigue
    const content = 1 - Math.min(1, c.drives.hunger + c.drives.thirst + c.drives.loneliness)

    // --- asleep -------------------------------------------------------------
    if (c.asleep) {
      const breath = Math.sin(now * 0.8 + rig.phase) * 0.015
      rig.body.position.set(0, -0.34 + breath, 0)
      rig.body.rotation.set(0, 0.2, 0.1)
      rig.pelvis.rotation.set(0, 0, 0)
      rig.spine.rotation.set(0.35, 0, 0)
      rig.hipL.rotation.set(1.5, 0, 0.2)
      rig.hipR.rotation.set(1.35, 0, -0.15)
      rig.kneeL.rotation.set(1.5, 0, 0)
      rig.kneeR.rotation.set(1.4, 0, 0)
      rig.ankleL.rotation.set(-0.5, 0, 0)
      rig.ankleR.rotation.set(-0.5, 0, 0)
      rig.shoulderL.rotation.set(0.5, 0, 0.5)
      rig.shoulderR.rotation.set(0.4, 0, -0.5)
      rig.elbowL.rotation.set(-0.9, 0, 0)
      rig.elbowR.rotation.set(-0.9, 0, 0)
      rig.neck.rotation.set(0.5, 0.25, 0)
      rig.earL.rotation.set(0.5, 0, 0.5)
      rig.earR.rotation.set(0.5, 0, -0.5)
      rig.eyeL.scale.y = 0.08
      rig.eyeR.scale.y = 0.08
      rig.tail.rotation.set(1.1, 0, 0)
      this.updateOverlays(rig, c, near && opts.showNames, now, dist, lookedAt, talkingTo)
      return
    }

    // --- the walk -----------------------------------------------------------
    const stride = 0.62 * rig.scale
    const walking = rig.speed > 0.12
    if (walking) rig.phase += (rig.speed / stride) * Math.PI * dt
    else rig.phase += dt * 0.7
    if (rig.phase > Math.PI * 4) rig.phase -= Math.PI * 4

    const p = rig.phase
    const gait = Math.min(1.4, rig.speed / 1.6)
    const amp = walking ? Math.min(0.7, 0.22 + gait * 0.36) : 0

    const cower = c.posture === 'cower' ? 1 : 0
    const crouch = fear * 0.12 + cower * 0.2
    const slump = tired * 0.2 + (1 - content) * 0.08

    // --- body ---------------------------------------------------------------
    const bob = walking ? Math.abs(Math.sin(p)) * 0.03 * (0.5 + gait) : 0
    const breathe = Math.sin(now * 1.4 + rig.phase) * 0.005
    rig.body.position.set(0, bob + breathe - crouch, 0)
    rig.body.rotation.set(0, 0, 0)

    rig.pelvis.rotation.set(0, walking ? -Math.sin(p) * amp * 0.22 : 0, 0)
    rig.spine.rotation.set(
      slump * 0.3 + gait * 0.06 + cower * 0.35,
      walking ? Math.sin(p) * amp * 0.13 : Math.sin(now * 0.5 + rig.phase) * 0.02,
      0,
    )
    rig.chest.rotation.set(slump * 0.12, 0, 0)

    // --- legs ---------------------------------------------------------------
    // The hip swings the whole leg fore and aft. The knee then folds the shin
    // *backwards* — a positive X rotation, because the shin hangs down −Y and
    // the Luma faces +Z. It only ever folds one way, exactly like a knee.
    const swingL = Math.sin(p) * amp
    const swingR = Math.sin(p + Math.PI) * amp
    rig.hipL.rotation.x = swingL
    rig.hipR.rotation.x = swingR

    // The knee folds while the leg is swinging *forward* and straightens as it
    // takes weight, which is the half of the cycle it happens in. Folding it
    // on the other half — which is what this did — is still a backwards-only
    // hinge, but it reads as the shin kicking out in front at the wrong
    // moment, and everyone who watched it said the knees looked inverted.
    //
    // `-sin(p)` is positive exactly while the hip angle is negative, so the
    // fold and the forward swing are the same half of the stride.
    const foldL = Math.max(0, -Math.sin(p + 0.4)) * amp * 1.7
    const foldR = Math.max(0, -Math.sin(p + Math.PI + 0.4)) * amp * 1.7
    const restBend = walking ? 0.06 : 0.04
    rig.kneeL.rotation.x = foldL + restBend + crouch * 1.6
    rig.kneeR.rotation.x = foldR + restBend + crouch * 1.6

    // the ankle keeps the sole roughly level with the ground
    rig.ankleL.rotation.x = -swingL * 0.4 - foldL * 0.55 - crouch * 0.9
    rig.ankleR.rotation.x = -swingR * 0.4 - foldR * 0.55 - crouch * 0.9

    // --- arms ---------------------------------------------------------------
    // Kept close to the body. They used to counter-swing hard and carry a deep
    // resting bend at the elbow, which on a creature this size put a forearm
    // out in front at nearly sixty degrees — and every person shown the walk
    // read that jutting forearm as a leg kicking forwards.
    const armRest = 0.06 + slump * 0.1 + fear * 0.22
    rig.shoulderL.rotation.x = -swingL * 0.32 - armRest
    rig.shoulderR.rotation.x = -swingR * 0.32 - armRest
    rig.shoulderL.rotation.z = 0.12 + fear * 0.25
    rig.shoulderR.rotation.z = -0.12 - fear * 0.25
    rig.elbowL.rotation.x = -0.12 - Math.max(0, swingL) * 0.18
    rig.elbowR.rotation.x = -0.12 - Math.max(0, swingR) * 0.18

    // --- tail ---------------------------------------------------------------
    const wag = content * 0.5 - fear * 0.6
    rig.tail.rotation.set(
      0.7 + fear * 0.9 - content * 0.3,
      Math.sin(now * (3 + content * 5) + rig.phase) * (0.1 + Math.max(0, wag) * 0.5),
      0,
    )

    // --- ears: the clearest thing on the body ------------------------------
    // flat back when frightened, up and forward when attending to you
    const attentive = c.listening ? 1 : 0
    const earBack = fear * 1.3
    rig.earL.rotation.set(-attentive * 0.25 + earBack, 0, 0.12 + earBack * 0.8)
    rig.earR.rotation.set(-attentive * 0.25 + earBack, 0, -0.12 - earBack * 0.8)

    // --- head ---------------------------------------------------------------
    let pitch = -rig.spine.rotation.x * 0.7 + slump * 0.25 + cower * 0.3
    let yaw = 0
    if (c.listening || c.attending === -1) {
      // look at whoever is talking to them
      const toCam = Math.atan2(camPos.x - rig.renderX, camPos.z - rig.renderZ)
      yaw = wrapAngle(toCam - rig.root.rotation.y)
      pitch += 0.05
    }
    yaw = THREE.MathUtils.clamp(yaw, -1.3, 1.3)
    rig.neck.rotation.set(pitch * 0.45, yaw * 0.45, 0)
    rig.head.rotation.set(pitch * 0.55, yaw * 0.55, Math.sin(now * 0.7 + rig.phase) * 0.012)

    // --- face ---------------------------------------------------------------
    rig.blinkTimer -= dt
    if (rig.blinkTimer <= 0) {
      rig.blink = 0.12
      rig.blinkTimer = 2.5 + Math.random() * 4
    }
    rig.blink = Math.max(0, rig.blink - dt)
    const lid = rig.blink > 0 ? 0.1 : 1
    // eyes go wide with fear, narrow when sleepy
    const openness = 1 + fear * 0.35 - tired * 0.3
    rig.eyeL.scale.set(1, lid * openness, 1)
    rig.eyeR.scale.set(1, lid * openness, 1)
    const gaze = THREE.MathUtils.clamp(yaw * 0.03, -0.02, 0.02)
    rig.pupilL.position.x = gaze
    rig.pupilR.position.x = gaze

    // --- what they are doing ------------------------------------------------
    switch (c.posture) {
      case 'eat':
      case 'drink': {
        const nibble = Math.sin(now * 6 + rig.phase) * 0.16
        rig.neck.rotation.x = 0.75 + nibble
        rig.head.rotation.x = 0.4 + nibble
        rig.shoulderL.rotation.x = -0.5
        rig.shoulderR.rotation.x = -0.5
        break
      }
      case 'play': {
        const hop = Math.abs(Math.sin(now * 4 + rig.phase))
        rig.body.position.y += hop * 0.09
        rig.shoulderL.rotation.x = -1.8 + Math.sin(now * 5) * 0.4
        rig.shoulderR.rotation.x = -1.8 - Math.sin(now * 5) * 0.4
        break
      }
      case 'sit': {
        rig.body.position.y -= 0.22
        rig.hipL.rotation.x = 1.1
        rig.hipR.rotation.x = 1.1
        rig.kneeL.rotation.x = 1.3
        rig.kneeR.rotation.x = 1.3
        rig.ankleL.rotation.x = -0.4
        rig.ankleR.rotation.x = -0.4
        break
      }
      default:
        break
    }

    this.updateOverlays(rig, c, near && opts.showNames, now, dist, lookedAt, talkingTo)
  }

  private updateOverlays(
    rig: Rig, c: Creature, showName: boolean, now: number, dist: number,
    lookedAt: number | null, talkingTo: number | null,
  ): void {
    const selected = talkingTo === c.id
    const looked = lookedAt === c.id
    rig.ring.visible = selected || looked
    if (rig.ring.visible) {
      const mat = rig.ring.material as THREE.MeshBasicMaterial
      mat.color.set(selected ? '#ffd89a' : '#a8dcff')
      mat.opacity = 0.45 + Math.sin(now * 3) * 0.15
    }

    if (rig.label) {
      const visible = showName && dist < 24
      rig.label.sprite.visible = visible
      if (visible) {
        drawName(rig.label, c.name, moodColour(c))
        const s = Math.max(1, dist / 18)
        rig.label.sprite.scale.set(1.7 * s, 0.42 * s, 1)
      }
    }

    if (rig.bubble) {
      if (c.said && c.said !== rig.bubbleText) {
        rig.bubbleText = c.said
        rig.bubbleUntil = now + 4
        drawBubble(rig.bubble, c.said)
      }
      const visible = now < rig.bubbleUntil && dist < 30
      rig.bubble.sprite.visible = visible
      if (visible) {
        const s = Math.max(1, dist / 16)
        rig.bubble.sprite.scale.set(2.4 * s, 1.2 * s, 1)
      }
    }

    if (rig.alarm) {
      // Fear has to be legible from across the green, or being frightening is
      // something that only happens in the numbers.
      const show = c.alarm > 0.35
      rig.alarm.visible = show
      if (show) {
        const bounce = Math.abs(Math.sin(now * 6)) * 0.1
        rig.alarm.position.y = 1.95 + bounce
        const s = (0.45 + c.alarm * 0.25) * Math.max(1, dist / 14)
        rig.alarm.scale.set(s, s, 1)
      }
    }
  }

  /** World position of a Luma's head, for the interaction prompt. */
  headPosition(id: number, out: THREE.Vector3): boolean {
    const rig = this.rigs.get(id)
    if (!rig) return false
    rig.head.getWorldPosition(out)
    return true
  }

  dispose(): void {
    for (const rig of this.rigs.values()) {
      rig.label?.texture.dispose()
      rig.bubble?.texture.dispose()
    }
    this.rigs.clear()
    this.group.clear()
  }
}

function wrapAngle(a: number): number {
  let x = (a + Math.PI) % (Math.PI * 2)
  if (x < 0) x += Math.PI * 2
  return x - Math.PI
}

/** A colour for the mood ring around a name. */
export function moodColour(c: Creature): string {
  if (c.drives.fear > 0.4) return '#ff9a6a'
  if (c.drives.pain > 0.3) return '#ff7a7a'
  if (c.asleep) return '#8f9bd0'
  if (c.drives.hunger > 0.6 || c.drives.thirst > 0.6) return '#e0c06a'
  if (c.trust > 0.6) return '#8fdca8'
  return '#cbd3dd'
}
