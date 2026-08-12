/**
 * luma — the people of the valley, and how they move.
 *
 * A Luma is built to human proportions out of flat-shaded parts on a real
 * hierarchy: pelvis, spine, chest, neck, head, and two-segment arms and legs
 * so that elbows and knees actually bend. They are not humans — the ears are
 * a little high, the heads a little large, the palette is not ours — but they
 * are close enough that you read a posture as a mood without being told.
 *
 * Nothing is keyframed. Every pose is computed from what the simulation
 * already knows: how fast they are walking, what they are doing, how they
 * feel, how old they are, whether they have had a drink. That means the
 * animation cannot drift out of sync with the mind driving it.
 *
 * The other half of this file is about smoothness. The simulation moves
 * bodies six times a second; the screen redraws sixty. Reading `c.pos`
 * straight into the transform is what made everybody look like they were
 * teleporting, and made the measured speed spike wildly between frames, which
 * in turn made the legs blur. Positions are followed with a critically damped
 * spring, and gait is measured from the *rendered* path, not the simulated one.
 */
import * as THREE from 'three'
import type { Creature } from '../lab/creature'
import { deriveEmotion } from '../lab/emotion'
import { hairStyle } from '../lab/hair'
import { impairmentOf } from '../lab/substances'
import { heightAt } from '../world/terrain'

// ---------------------------------------------------------------- palette

/** Skin, in the range a person's skin comes in, indexed by a genome value. */
const SKIN_TONES = [
  '#f0cdb0', '#e5b895', '#d99e75', '#c68642', '#a9663c',
  '#8d5524', '#6f4021', '#54301a',
]

const HAIR_TONES = [
  '#1b1512', '#2e2119', '#4a2f1d', '#6b4423', '#8a6234',
  '#b08a4a', '#c9a86a', '#8d8d8d', '#d8d3c8',
]

/** Clothing. Dyed cloth in a valley without industry: earthy, but not drab. */
const SHIRT_TONES = [
  '#7d8f6a', '#8a6f52', '#6d7f95', '#9a6b62', '#7b6b8f',
  '#b0a074', '#5f7a72', '#a8785a', '#6b6f7d', '#94825f',
]

const TROUSER_TONES = ['#4a4438', '#3f4550', '#5a4a3c', '#454b42', '#57493f', '#3d3a36']

/** Roles that show on the body, so a trade is legible across the square. */
const JOB_LOOK: Record<string, { apron: string; hat?: string }> = {
  shopkeep: { apron: '#c9b18a' },
  healer: { apron: '#e4e9e6' },
  bartender: { apron: '#8a5a3c' },
  farmer: { apron: '#9a8a5a', hat: '#c9b077' },
  porter: { apron: '#7a6a58' },
  teacher: { apron: '#5f6a8a' },
}

function pick<T>(list: T[], value: number): T {
  return list[Math.min(list.length - 1, Math.max(0, Math.floor(value * list.length)))]
}

/** Everything about how one Luma looks, derived from the genome so it breeds. */
function appearanceOf(c: Creature): {
  skin: THREE.Color
  hair: THREE.Color
  shirt: THREE.Color
  trousers: THREE.Color
  height: number
  build: number
} {
  const g = c.genome
  const skinPick = (g.resilience * 0.6 + g.longevity * 0.4) % 1
  const hairPick = (g.curiosity * 0.7 + g.emotionality * 0.3) % 1
  const shirtPick = (g.sociability * 0.55 + g.courage * 0.45) % 1
  const trouserPick = (g.loyalty * 0.6 + g.energy * 0.4) % 1
  return {
    skin: new THREE.Color(pick(SKIN_TONES, skinPick)),
    hair: new THREE.Color(pick(HAIR_TONES, hairPick)),
    shirt: new THREE.Color(pick(SHIRT_TONES, shirtPick)),
    trousers: new THREE.Color(pick(TROUSER_TONES, trouserPick)),
    // adults stand between about 1.60 m and 1.88 m
    height: 1.6 + (g.size ?? 0.5) * 0.28,
    // narrow to broad across the shoulders
    build: 0.86 + (g.size ?? 0.5) * 0.2 + (g.energy ?? 0.5) * 0.06,
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
    pos.setX(i, Math.sign(pos.getX(i)) * (w / 2) * Math.SQRT2 * 0.7071)
    pos.setZ(i, Math.sign(pos.getZ(i)) * (d / 2) * Math.SQRT2 * 0.7071)
    pos.setY(i, y * height)
  }
  geo.computeVertexNormals()
  return geo
}

const GEO = {
  head: taper(0.205, 0.175, 0.24, 0.2, 0.195),
  jaw: taper(0.16, 0.12, 0.062, 0.17, 0.18),
  neck: taper(0.095, 0.115, 0.09, 0.095),
  chest: taper(0.46, 0.37, 0.32, 0.23, 0.25),
  belly: taper(0.37, 0.33, 0.2, 0.21, 0.23),
  pelvis: taper(0.34, 0.31, 0.15, 0.22),
  upperArm: taper(0.115, 0.1, 0.3, 0.115),
  foreArm: taper(0.1, 0.085, 0.27, 0.1),
  thigh: taper(0.165, 0.13, 0.44, 0.175),
  shin: taper(0.125, 0.1, 0.42, 0.125),
  hand: new THREE.BoxGeometry(0.095, 0.12, 0.055),
  foot: new THREE.BoxGeometry(0.12, 0.075, 0.26),
  ear: new THREE.BoxGeometry(0.03, 0.075, 0.05),
  eye: new THREE.SphereGeometry(0.032, 7, 5),
  pupil: new THREE.SphereGeometry(0.018, 6, 4),
  brow: new THREE.BoxGeometry(0.055, 0.014, 0.02),
  nose: taper(0.02, 0.045, 0.06, 0.06, 0.03),
  mouth: new THREE.BoxGeometry(0.05, 0.012, 0.015),
  hairCap: new THREE.SphereGeometry(0.108, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.62),
  hairTuft: taper(0.05, 0.03, 0.1, 0.05),
  held: new THREE.BoxGeometry(0.15, 0.15, 0.15),
}
// origins at the top of each limb, so rotation happens at the joint
for (const [name, h] of [
  ['upperArm', 0.3], ['foreArm', 0.27], ['thigh', 0.44], ['shin', 0.42],
] as const) {
  GEO[name].translate(0, -h / 2, 0)
}
GEO.neck.translate(0, 0.045, 0)
GEO.chest.translate(0, 0.15, 0)
GEO.belly.translate(0, 0.1, 0)
GEO.pelvis.translate(0, 0.07, 0)
GEO.head.translate(0, 0.117, 0)
GEO.nose.rotateX(Math.PI)

const WHITE = new THREE.MeshLambertMaterial({ color: '#f6f3ec', flatShading: true })
const DARK = new THREE.MeshLambertMaterial({ color: '#221c18' })

// ---------------------------------------------------------------- the rig

interface Rig {
  id: number
  root: THREE.Group
  /** the whole body, for bob and crouch */
  body: THREE.Group
  pelvis: THREE.Group
  spine: THREE.Group
  chest: THREE.Group
  neck: THREE.Group
  head: THREE.Group
  jaw: THREE.Mesh
  mouth: THREE.Mesh
  eyeL: THREE.Group
  eyeR: THREE.Group
  pupilL: THREE.Mesh
  pupilR: THREE.Mesh
  browL: THREE.Mesh
  browR: THREE.Mesh
  shoulderL: THREE.Group
  shoulderR: THREE.Group
  elbowL: THREE.Group
  elbowR: THREE.Group
  hipL: THREE.Group
  hipR: THREE.Group
  kneeL: THREE.Group
  kneeR: THREE.Group
  footL: THREE.Mesh
  footR: THREE.Mesh
  held: THREE.Mesh
  skinMat: THREE.MeshLambertMaterial
  shirtMat: THREE.MeshLambertMaterial
  apron: THREE.Mesh | null
  hat: THREE.Mesh | null
  jobShown: string | null

  phase: number
  /** the position actually drawn, chasing the simulated one */
  renderX: number
  renderZ: number
  lastX: number
  lastZ: number
  /** metres per second along the rendered path */
  speed: number
  groundY: number
  blink: number
  blinkTimer: number
  glanceX: number
  glanceTimer: number
  scale: number
  label: Label | null
  bubble: Label | null
  bubbleUntil: number
  bubbleText: string
  ring: THREE.Mesh
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
  text: string
}

function makeLabel(width = 512, height = 128): Label | null {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }),
  )
  sprite.renderOrder = 900
  return { sprite, canvas, ctx, texture, text: '' }
}

function drawLabel(label: Label, text: string, accent: string, sub?: string): void {
  const key = `${text}|${sub ?? ''}|${accent}`
  if (label.text === key) return
  label.text = key
  const { ctx, canvas } = label
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = '600 44px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const w = Math.min(canvas.width - 20, ctx.measureText(text).width + 52)
  const h = sub ? 88 : 60
  const x = (canvas.width - w) / 2
  const y = (canvas.height - h) / 2

  ctx.fillStyle = 'rgba(14, 16, 22, 0.7)'
  roundRect(ctx, x, y, w, h, 14)
  ctx.fill()
  ctx.strokeStyle = accent
  ctx.lineWidth = 2.5
  roundRect(ctx, x, y, w, h, 14)
  ctx.stroke()

  ctx.fillStyle = '#f3efe6'
  ctx.fillText(text, canvas.width / 2, y + (sub ? 28 : h / 2))
  if (sub) {
    ctx.font = '400 28px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = 'rgba(233, 226, 212, 0.72)'
    ctx.fillText(sub, canvas.width / 2, y + 62)
  }
  label.texture.needsUpdate = true
}

function drawBubble(label: Label, text: string): void {
  if (label.text === text) return
  label.text = text
  const { ctx, canvas } = label
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = '500 34px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > canvas.width - 90 && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  const lh = 42
  const h = lines.length * lh + 34
  const w = Math.min(canvas.width - 16, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 56)
  const x = (canvas.width - w) / 2
  const y = canvas.height - h - 24

  ctx.fillStyle = 'rgba(248, 245, 238, 0.95)'
  roundRect(ctx, x, y, w, h, 18)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(canvas.width / 2 - 14, y + h)
  ctx.lineTo(canvas.width / 2 + 14, y + h)
  ctx.lineTo(canvas.width / 2, y + h + 22)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#1a1a20'
  lines.forEach((l, i) => ctx.fillText(l, canvas.width / 2, y + 24 + i * lh))
  label.texture.needsUpdate = true
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

// ---------------------------------------------------------------- the view

export interface LumaViewOptions {
  showLabels: boolean
}

export class LumaView {
  readonly group = new THREE.Group()
  private rigs = new Map<number, Rig>()
  private ringGeo: THREE.RingGeometry
  private ringMat: THREE.MeshBasicMaterial

  constructor() {
    this.group.name = 'luma'
    this.ringGeo = new THREE.RingGeometry(0.44, 0.56, 24)
    this.ringGeo.rotateX(-Math.PI / 2)
    this.ringMat = new THREE.MeshBasicMaterial({
      color: '#ffd27a', transparent: true, opacity: 0.85, depthWrite: false,
    })
  }

  private build(c: Creature): Rig {
    const look = appearanceOf(c)
    const skinMat = new THREE.MeshLambertMaterial({ color: look.skin, flatShading: true })
    const shirtMat = new THREE.MeshLambertMaterial({ color: look.shirt, flatShading: true })
    const trouserMat = new THREE.MeshLambertMaterial({ color: look.trousers, flatShading: true })
    const hairMat = new THREE.MeshLambertMaterial({ color: look.hair, flatShading: true })
    const shoeMat = new THREE.MeshLambertMaterial({ color: '#3a3029', flatShading: true })

    const root = new THREE.Group()
    const body = new THREE.Group()
    root.add(body)

    // --- pelvis and spine ---------------------------------------------------
    const pelvis = joint(body, 0, 0.92, 0)
    limb(pelvis, GEO.pelvis, trouserMat)
    const spine = joint(pelvis, 0, 0.13, 0)
    limb(spine, GEO.belly, shirtMat)
    const chest = joint(spine, 0, 0.2, 0)
    limb(chest, GEO.chest, shirtMat)

    // --- neck and head ------------------------------------------------------
    const neck = joint(chest, 0, 0.3, 0)
    limb(neck, GEO.neck, skinMat)
    const head = joint(neck, 0, 0.09, 0)
    limb(head, GEO.head, skinMat)
    const jaw = limb(head, GEO.jaw, skinMat)
    jaw.position.set(0, 0.035, 0.012)

    for (const side of [-1, 1]) {
      const ear = limb(head, GEO.ear, skinMat)
      ear.position.set(side * 0.102, 0.118, -0.005)
    }

    const makeEye = (side: number) => {
      const g = joint(head, side * 0.058, 0.142, 0.094)
      const white = new THREE.Mesh(GEO.eye, WHITE)
      white.scale.set(1, 0.95, 0.6)
      g.add(white)
      const pupil = new THREE.Mesh(GEO.pupil, DARK)
      pupil.position.z = 0.022
      g.add(pupil)
      return { g, pupil }
    }
    const eyeLeft = makeEye(-1)
    const eyeRight = makeEye(1)

    const makeBrow = (side: number) => {
      const brow = limb(head, GEO.brow, hairMat)
      brow.position.set(side * 0.058, 0.186, 0.091)
      return brow
    }
    const browL = makeBrow(-1)
    const browR = makeBrow(1)

    const nose = limb(head, GEO.nose, skinMat)
    nose.position.set(0, 0.117, 0.099)
    const mouth = limb(head, GEO.mouth, DARK)
    mouth.position.set(0, 0.058, 0.1)

    // --- hair ---------------------------------------------------------------
    const style = hairStyle(c.genome, c.id * 7)
    if (style.style !== 'bald') {
      const cap = limb(head, GEO.hairCap, hairMat)
      cap.position.set(0, 0.138, -0.004)
      cap.scale.set(1.08, style.style === 'buzz' ? 0.78 : 1, 1.1)
      if (style.style === 'long') {
        const back = limb(head, taper(0.2, 0.17, 0.24, 0.06), hairMat)
        back.position.set(0, 0.02, -0.095)
      }
      if (style.style === 'spiky') {
        for (let i = 0; i < 4; i++) {
          const tuft = limb(head, GEO.hairTuft, hairMat)
          tuft.position.set((i - 1.5) * 0.06, 0.235, -0.01)
          tuft.rotation.z = (i - 1.5) * 0.22
        }
      }
    }

    // --- arms ---------------------------------------------------------------
    const shoulderL = joint(chest, -0.245 * look.build, 0.27, 0)
    const shoulderR = joint(chest, 0.245 * look.build, 0.27, 0)
    limb(shoulderL, GEO.upperArm, shirtMat)
    limb(shoulderR, GEO.upperArm, shirtMat)
    const elbowL = joint(shoulderL, 0, -0.3, 0)
    const elbowR = joint(shoulderR, 0, -0.3, 0)
    limb(elbowL, GEO.foreArm, skinMat)
    limb(elbowR, GEO.foreArm, skinMat)
    for (const e of [elbowL, elbowR]) {
      const hand = limb(e, GEO.hand, skinMat)
      hand.position.y = -0.31
    }

    // --- legs ---------------------------------------------------------------
    const hipL = joint(pelvis, -0.105, -0.02, 0)
    const hipR = joint(pelvis, 0.105, -0.02, 0)
    limb(hipL, GEO.thigh, trouserMat)
    limb(hipR, GEO.thigh, trouserMat)
    const kneeL = joint(hipL, 0, -0.44, 0)
    const kneeR = joint(hipR, 0, -0.44, 0)
    limb(kneeL, GEO.shin, trouserMat)
    limb(kneeR, GEO.shin, trouserMat)
    const footL = limb(kneeL, GEO.foot, shoeMat)
    const footR = limb(kneeR, GEO.foot, shoeMat)
    footL.position.set(0, -0.45, 0.055)
    footR.position.set(0, -0.45, 0.055)

    const held = new THREE.Mesh(GEO.held, new THREE.MeshLambertMaterial({ color: '#c8a568', flatShading: true }))
    held.position.set(0, -0.36, 0.03)
    held.scale.setScalar(0.75)
    held.visible = false
    elbowR.add(held)

    const ring = new THREE.Mesh(this.ringGeo, this.ringMat)
    ring.position.y = 0.04
    ring.visible = false
    root.add(ring)

    // scale the whole body to this person's height (the rig is built at 1.75 m)
    const scale = look.height / 1.75
    root.scale.setScalar(scale)

    const label = makeLabel()
    if (label) {
      label.sprite.position.y = 2.1
      label.sprite.scale.set(2.2, 0.55, 1)
      root.add(label.sprite)
    }
    const bubble = makeLabel(512, 256)
    if (bubble) {
      bubble.sprite.position.y = 2.55
      bubble.sprite.scale.set(3, 1.5, 1)
      bubble.sprite.visible = false
      root.add(bubble.sprite)
    }

    this.group.add(root)

    return {
      id: c.id, root, body, pelvis, spine, chest, neck, head, jaw, mouth,
      eyeL: eyeLeft.g, eyeR: eyeRight.g, pupilL: eyeLeft.pupil, pupilR: eyeRight.pupil,
      browL, browR,
      shoulderL, shoulderR, elbowL, elbowR, hipL, hipR, kneeL, kneeR, footL, footR,
      held, skinMat, shirtMat, apron: null, hat: null, jobShown: null,
      phase: (c.id * 2.399963) % (Math.PI * 2),
      renderX: c.pos.x, renderZ: c.pos.z, lastX: c.pos.x, lastZ: c.pos.z,
      speed: 0,
      groundY: heightAt(c.pos.x, c.pos.z),
      blink: 0, blinkTimer: 1 + (c.id % 7) * 0.6,
      glanceX: 0, glanceTimer: 2 + (c.id % 5),
      scale,
      label, bubble, bubbleUntil: 0, bubbleText: '',
      ring,
    }
  }

  /** An apron or a hat, so you can see a trade across the square. */
  private dressForWork(rig: Rig, c: Creature): void {
    if (c.job === rig.jobShown) return
    rig.jobShown = c.job
    if (rig.apron) {
      rig.apron.removeFromParent()
      rig.apron = null
    }
    if (rig.hat) {
      rig.hat.removeFromParent()
      rig.hat = null
    }
    const look = c.job ? JOB_LOOK[c.job] : undefined
    if (!look) return
    const apron = new THREE.Mesh(
      taper(0.3, 0.26, 0.42, 0.03),
      new THREE.MeshLambertMaterial({ color: look.apron, flatShading: true }),
    )
    apron.position.set(0, 0.06, 0.115)
    rig.spine.add(apron)
    rig.apron = apron
    if (look.hat) {
      const hat = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.21, 0.05, 10),
        new THREE.MeshLambertMaterial({ color: look.hat, flatShading: true }),
      )
      hat.position.set(0, 0.245, 0)
      rig.head.add(hat)
      rig.hat = hat
    }
  }

  sync(
    creatures: Creature[],
    dt: number,
    now: number,
    camera: THREE.Camera,
    opts: LumaViewOptions,
    selectedId: number | null,
    lookedAtId: number | null,
  ): void {
    const seen = new Set<number>()
    const camPos = new THREE.Vector3()
    camera.getWorldPosition(camPos)

    for (const c of creatures) {
      if (!c.alive && c.buried) continue
      seen.add(c.id)
      let rig = this.rigs.get(c.id)
      if (!rig) {
        rig = this.build(c)
        this.rigs.set(c.id, rig)
      }
      this.pose(rig, c, dt, now, camPos, opts, selectedId, lookedAtId)
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
    opts: LumaViewOptions, selectedId: number | null, lookedAtId: number | null,
  ): void {
    const emotion = deriveEmotion(c.chem, c.genome)
    this.dressForWork(rig, c)

    // --- follow the simulated position smoothly -----------------------------
    // The sim steps six times a second. Chasing its output with a damped
    // follow, and measuring speed from the path we actually draw, is what
    // turns a row of teleports into a walk.
    const jump = Math.hypot(c.pos.x - rig.renderX, c.pos.z - rig.renderZ)
    if (jump > 4) {
      rig.renderX = c.pos.x
      rig.renderZ = c.pos.z
    } else {
      const follow = Math.min(1, dt * 11)
      rig.renderX += (c.pos.x - rig.renderX) * follow
      rig.renderZ += (c.pos.z - rig.renderZ) * follow
    }

    const travelled = Math.hypot(rig.renderX - rig.lastX, rig.renderZ - rig.lastZ)
    rig.lastX = rig.renderX
    rig.lastZ = rig.renderZ
    const instant = travelled / Math.max(dt, 1 / 240)
    rig.speed += (Math.min(instant, 7) - rig.speed) * Math.min(1, dt * 6)
    if (rig.speed < 0.05) rig.speed = 0

    const targetGround = heightAt(rig.renderX, rig.renderZ)
    rig.groundY += (targetGround - rig.groundY) * Math.min(1, dt * 10)
    rig.root.position.set(rig.renderX, rig.groundY, rig.renderZ)

    // face the way they are going, turning at a human rate
    const facing = rig.root.rotation.y
    let diff = ((c.facing - facing + Math.PI) % (Math.PI * 2)) - Math.PI
    if (diff < -Math.PI) diff += Math.PI * 2
    rig.root.rotation.y = facing + diff * Math.min(1, dt * 6)

    const dist = camPos.distanceTo(rig.root.position)
    const near = dist < 60

    // --- age and build ------------------------------------------------------
    const stageScale = c.stage === 'child' ? 0.62 : c.stage === 'adolescent' ? 0.84 : 1
    rig.root.scale.setScalar(rig.scale * stageScale)

    // --- dead ---------------------------------------------------------------
    if (!c.alive) {
      rig.body.rotation.set(-Math.PI / 2 + 0.1, 0, 0)
      rig.body.position.set(0, 0.16, 0)
      rig.hipL.rotation.set(0.3, 0, 0.1)
      rig.hipR.rotation.set(0.1, 0, -0.15)
      rig.kneeL.rotation.set(-0.4, 0, 0)
      rig.kneeR.rotation.set(-0.2, 0, 0)
      rig.shoulderL.rotation.set(0.4, 0, 0.5)
      rig.shoulderR.rotation.set(0.2, 0, -0.6)
      rig.eyeL.scale.y = 0.06
      rig.eyeR.scale.y = 0.06
      rig.ring.visible = false
      if (rig.label) rig.label.sprite.visible = false
      if (rig.bubble) rig.bubble.sprite.visible = false
      return
    }

    // --- sleeping -----------------------------------------------------------
    if (c.sleeping) {
      const breath = Math.sin(now * 0.9 + rig.phase) * 0.02
      rig.body.rotation.set(-Math.PI / 2 + 0.06, 0.15, 0)
      rig.body.position.set(0, 0.2 + breath, 0)
      rig.hipL.rotation.set(0.7, 0, 0.12)
      rig.hipR.rotation.set(0.5, 0, -0.08)
      rig.kneeL.rotation.set(-0.9, 0, 0)
      rig.kneeR.rotation.set(-0.7, 0, 0)
      rig.shoulderL.rotation.set(0.5, 0, 0.4)
      rig.shoulderR.rotation.set(0.3, 0, -0.35)
      rig.neck.rotation.set(0.2, 0.3, 0)
      rig.eyeL.scale.y = 0.06
      rig.eyeR.scale.y = 0.06
      this.updateLabels(rig, c, emotion.color, near && opts.showLabels, now, dist, selectedId, lookedAtId)
      return
    }

    // --- the walk -----------------------------------------------------------
    // A stride is about three quarters of a metre, so cadence follows speed
    // instead of being a number that happens to look right at one pace.
    const stride = 0.78 * rig.scale * stageScale
    const walking = rig.speed > 0.12
    if (walking) rig.phase += (rig.speed / stride) * Math.PI * dt
    else rig.phase += dt * 0.6
    if (rig.phase > Math.PI * 4) rig.phase -= Math.PI * 4

    const p = rig.phase
    const gait = Math.min(1.35, rig.speed / 1.7)
    const amp = walking ? Math.min(0.62, 0.2 + gait * 0.38) : 0

    // --- mood, as posture ---------------------------------------------------
    const drunk = impairmentOf(c.chem)
    const fear = c.chem.fear
    const sad = Math.max(c.chem.grief, Math.max(0, 0.55 - c.chem.pleasure))
    const joy = Math.max(0, c.chem.pleasure - 0.6) * 2.5
    const anger = emotion.type === 'angry' ? emotion.intensity : 0
    const tired = 1 - c.chem.energy
    const old = c.stage === 'elder' ? 1 : 0

    const slump = sad * 0.34 + tired * 0.18 + old * 0.2 + drunk.slowness * 0.3
    const crouch = fear * 0.1
    const sway = drunk.slowness * Math.sin(now * 1.7 + rig.phase) * 0.14

    // --- the body -----------------------------------------------------------
    const bob = walking ? Math.abs(Math.sin(p)) * 0.035 * (0.5 + gait) : 0
    const breathe = Math.sin(now * 1.5 + rig.phase) * 0.006
    rig.body.position.set(0, bob + breathe - crouch, 0)
    rig.body.rotation.set(0, 0, sway)

    rig.pelvis.rotation.set(0, walking ? -Math.sin(p) * amp * 0.24 : 0, walking ? Math.cos(p) * 0.03 : 0)
    rig.spine.rotation.set(
      slump * 0.24 + gait * 0.05 + anger * 0.06,
      walking ? Math.sin(p) * amp * 0.14 : Math.sin(now * 0.5 + rig.phase) * 0.02,
      0,
    )
    rig.chest.rotation.set(slump * 0.12, 0, 0)

    // --- legs: hip swings, knee bends on the way through --------------------
    const hipL = Math.sin(p) * amp
    const hipR = Math.sin(p + Math.PI) * amp
    rig.hipL.rotation.x = hipL
    rig.hipR.rotation.x = hipR
    // the knee folds while the leg swings forward and stays straight on stance
    rig.kneeL.rotation.x = -Math.max(0, Math.sin(p + 1.5)) * amp * 1.5 - (walking ? 0.05 : 0.02)
    rig.kneeR.rotation.x = -Math.max(0, Math.sin(p + Math.PI + 1.5)) * amp * 1.5 - (walking ? 0.05 : 0.02)
    // ankles keep the feet roughly level with the ground
    rig.footL.rotation.x = -hipL * 0.35 + Math.max(0, Math.sin(p + 2.4)) * amp * 0.5
    rig.footR.rotation.x = -hipR * 0.35 + Math.max(0, Math.sin(p + Math.PI + 2.4)) * amp * 0.5

    // --- arms: counter-swing, with a resting bend ---------------------------
    const armBase = 0.06 + slump * 0.16 + fear * 0.2
    rig.shoulderL.rotation.x = -hipL * 0.7 - armBase
    rig.shoulderR.rotation.x = -hipR * 0.7 - armBase
    rig.shoulderL.rotation.z = 0.07 + anger * 0.2 + fear * 0.18 + slump * 0.05
    rig.shoulderR.rotation.z = -0.07 - anger * 0.2 - fear * 0.18 - slump * 0.05
    rig.elbowL.rotation.x = -0.16 - Math.max(0, hipL) * 0.5 - anger * 0.3
    rig.elbowR.rotation.x = -0.16 - Math.max(0, hipR) * 0.5 - anger * 0.3

    // --- head: level against the lean, then look at what matters ------------
    let headPitch = -rig.spine.rotation.x * 0.8 + slump * 0.42 - joy * 0.08
    let headYaw = 0
    if (c.talkingTo === 0) {
      const toCam = Math.atan2(camPos.x - rig.renderX, camPos.z - rig.renderZ)
      headYaw = wrapAngle(toCam - rig.root.rotation.y) * 0.7
      headPitch += 0.04
    } else if (near) {
      rig.glanceTimer -= dt
      if (rig.glanceTimer <= 0) {
        rig.glanceTimer = 2.5 + Math.random() * 5
        rig.glanceX = (Math.random() - 0.5) * 0.7
      }
      headYaw += (rig.glanceX - headYaw) * Math.min(1, dt * 3)
    }
    rig.neck.rotation.set(
      headPitch * 0.5,
      THREE.MathUtils.clamp(headYaw, -1.2, 1.2) * 0.5,
      0,
    )
    rig.head.rotation.set(
      headPitch * 0.5,
      THREE.MathUtils.clamp(headYaw, -1.2, 1.2) * 0.5,
      Math.sin(now * 0.8 + rig.phase) * 0.015,
    )

    // --- face ---------------------------------------------------------------
    rig.blinkTimer -= dt
    if (rig.blinkTimer <= 0) {
      rig.blink = 0.13
      rig.blinkTimer = 2.4 + Math.random() * 4.5
    }
    rig.blink = Math.max(0, rig.blink - dt)
    const lid = rig.blink > 0 ? 0.08 : 1
    const squint = 1 - Math.min(0.5, anger * 0.45 + sad * 0.3 + drunk.slowness * 0.5)
    rig.eyeL.scale.y = lid * squint
    rig.eyeR.scale.y = lid * squint
    const gaze = THREE.MathUtils.clamp(headYaw * 0.02, -0.014, 0.014)
    rig.pupilL.position.x = gaze
    rig.pupilR.position.x = gaze
    // brows carry most of an expression
    const browAngle = anger * 0.5 - sad * 0.3
    rig.browL.rotation.z = -browAngle
    rig.browR.rotation.z = browAngle
    rig.browL.position.y = 0.183 + (joy * 0.008) - anger * 0.01
    rig.browR.position.y = rig.browL.position.y

    const talking = c.busyTicks > 0 && (c.action === 'chat' || c.talkingTo != null)
    if (talking) {
      const m = Math.sin(now * 9 + rig.phase) * 0.5 + 0.5
      rig.jaw.position.y = 0.035 - m * 0.022
      rig.mouth.scale.set(1, 0.7 + m * 2.2, 1)
      rig.head.rotation.x += Math.sin(now * 4 + rig.phase) * 0.03
      // a hand comes up while explaining something
      rig.shoulderR.rotation.x -= 0.35 + Math.sin(now * 3.4 + rig.phase) * 0.2
      rig.elbowR.rotation.x -= 0.5
    } else {
      rig.jaw.position.y = 0.035
      rig.mouth.scale.set(1, joy > 0.3 ? 0.7 : 1, 1)
    }

    // --- what they are doing ------------------------------------------------
    switch (c.action) {
      case 'work':
      case 'work done': {
        const swing = Math.sin(now * 4.5 + rig.phase)
        rig.shoulderR.rotation.x = -1.5 + swing * 0.6
        rig.elbowR.rotation.x = -0.5 - Math.max(0, swing) * 0.5
        rig.shoulderL.rotation.x = -0.7
        rig.elbowL.rotation.x = -0.7
        rig.spine.rotation.x += 0.18
        break
      }
      case 'eat': {
        const bite = Math.sin(now * 5 + rig.phase) * 0.25
        rig.shoulderR.rotation.x = -1.1 + bite
        rig.elbowR.rotation.x = -1.5 - bite
        rig.jaw.position.y = 0.035 - Math.abs(bite) * 0.06
        break
      }
      case 'fight': {
        const jab = Math.sin(now * 7 + rig.phase)
        rig.shoulderR.rotation.x = -1.3 - jab * 0.7
        rig.elbowR.rotation.x = -0.4 + jab * 0.3
        rig.shoulderL.rotation.x = -0.9
        rig.elbowL.rotation.x = -1.2
        rig.spine.rotation.x += 0.16
        break
      }
      case 'play': {
        rig.shoulderL.rotation.x = -2.1 + Math.sin(now * 4) * 0.3
        rig.shoulderR.rotation.x = -2.1 - Math.sin(now * 4) * 0.3
        rig.body.position.y += Math.abs(Math.sin(now * 3.4 + rig.phase)) * 0.06
        break
      }
      case 'school':
      case 'learn':
      case 'teach': {
        rig.shoulderR.rotation.x = -0.9
        rig.elbowR.rotation.x = -1.1
        break
      }
      default:
        break
    }

    // something in hand
    const carried = firstItem(c)
    rig.held.visible = carried != null
    if (carried) {
      ;(rig.held.material as THREE.MeshLambertMaterial).color.set(ITEM_COLORS[carried] ?? '#c8a568')
      rig.shoulderR.rotation.x = -0.55
      rig.elbowR.rotation.x = -1.25
    }

    // illness shows in the face before it shows anywhere else
    const base = appearanceOf(c).skin
    if (c.illness > 0.15) base.lerp(new THREE.Color('#a8b39a'), Math.min(0.45, c.illness))
    if (drunk.slowness > 0.1) base.lerp(new THREE.Color('#c98a7a'), drunk.slowness * 0.4)
    rig.skinMat.color.lerp(base, Math.min(1, dt * 3))

    this.updateLabels(rig, c, emotion.color, near && opts.showLabels, now, dist, selectedId, lookedAtId)
  }

  private updateLabels(
    rig: Rig, c: Creature, accent: string, show: boolean, now: number,
    dist: number, selectedId: number | null, lookedAtId: number | null,
  ): void {
    const selected = selectedId === c.id
    const looked = lookedAtId === c.id
    rig.ring.visible = selected || looked
    if (rig.ring.visible) {
      const mat = rig.ring.material as THREE.MeshBasicMaterial
      mat.color.set(selected ? '#ffd27a' : '#9fd8ff')
      mat.opacity = 0.5 + Math.sin(now * 4) * 0.18
    }

    if (rig.label) {
      const visible = show && !looked && (dist < 26 || selected)
      rig.label.sprite.visible = visible
      if (visible) {
        const sub = c.job ? c.job : c.stage === 'child' ? 'child' : undefined
        drawLabel(rig.label, c.name, accent, sub)
        const s = Math.max(1, dist / 22)
        rig.label.sprite.scale.set(2.2 * s, 0.55 * s, 1)
      }
    }

    if (rig.bubble) {
      const line = c.recentDialogue[c.recentDialogue.length - 1]
      if (line && line !== rig.bubbleText) {
        rig.bubbleText = line
        rig.bubbleUntil = now + 4.5
        drawBubble(rig.bubble, line)
      }
      const visible = now < rig.bubbleUntil && dist < 34
      rig.bubble.sprite.visible = visible
      if (visible) {
        const s = Math.max(1, dist / 20)
        rig.bubble.sprite.scale.set(3 * s, 1.5 * s, 1)
      }
    }
  }

  /** World position of a creature's head, for the interaction prompt. */
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

function firstItem(c: Creature): string | null {
  for (const [id, n] of Object.entries(c.inventory.items)) {
    if ((n ?? 0) > 0) return id
  }
  return null
}

const ITEM_COLORS: Record<string, string> = {
  bread: '#c98a3d', water: '#4f9fd0', medicine: '#d8e8e0', brew: '#8a5a2a',
  herb: '#6aa84f', spark: '#ffd166', tonic: '#b06ad0', stick: '#8a6a45',
  cloak: '#7a5aa0', trinket: '#d0a84f', gem: '#6fd0d8', satchel: '#9a7a52',
  timber: '#8a5e3b', grain: '#d8c070', berry: '#b0455f', stone: '#8d8a82',
  fish: '#9fc4d8', lantern: '#ffcf80',
}
