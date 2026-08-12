/**
 * luma — the creatures, and how they move.
 *
 * A Luma is built from a dozen flat-shaded pieces on a small hierarchy: hips,
 * torso, head, two ears, two arms, two legs, a tail. Nothing is keyframed;
 * every pose is computed each frame from what the simulation already knows —
 * how fast they are walking, what they are doing, how they feel, how old they
 * are — so the animation cannot drift out of sync with the mind driving it.
 *
 * The point is legibility. You should be able to tell from thirty metres that
 * someone is frightened, carrying something, or asleep on their feet.
 */
import * as THREE from 'three'
import type { Creature } from '../lab/creature'
import { deriveEmotion } from '../lab/emotion'
import { bodyScale } from '../lab/genetics'
import { hairStyle } from '../lab/hair'
import { heightAt } from '../world/terrain'

// ---------------------------------------------------------------- geometry

const GEO = {
  torso: new THREE.IcosahedronGeometry(0.5, 1),
  head: new THREE.IcosahedronGeometry(0.36, 1),
  snout: new THREE.ConeGeometry(0.13, 0.2, 6),
  ear: new THREE.ConeGeometry(0.1, 0.62, 5),
  limb: new THREE.CapsuleGeometry(0.085, 0.3, 2, 6),
  foot: new THREE.BoxGeometry(0.2, 0.11, 0.3),
  hand: new THREE.IcosahedronGeometry(0.11, 0),
  eye: new THREE.SphereGeometry(0.095, 8, 6),
  pupil: new THREE.SphereGeometry(0.062, 7, 6),
  brow: new THREE.BoxGeometry(0.13, 0.035, 0.04),
  tail: new THREE.ConeGeometry(0.13, 0.5, 5),
  tuft: new THREE.ConeGeometry(0.1, 0.28, 5),
  belly: new THREE.SphereGeometry(0.34, 8, 6),
  held: new THREE.BoxGeometry(0.24, 0.24, 0.24),
}
GEO.snout.rotateX(Math.PI / 2)
GEO.tail.rotateX(Math.PI / 2)

const WHITE = new THREE.MeshLambertMaterial({ color: '#f4f1e8', flatShading: true })
const DARK = new THREE.MeshLambertMaterial({ color: '#151318' })

/** A stable hue per creature, so siblings resemble each other via the genome. */
function skinColor(c: Creature): THREE.Color {
  const g = c.genome
  const hue = (g.curiosity * 0.42 + g.sociability * 0.3 + g.energy * 0.18) % 1
  const sat = 0.3 + g.emotionality * 0.28
  const light = 0.42 + g.resilience * 0.16
  return new THREE.Color().setHSL(hue, sat, light)
}

function bellyColor(base: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 }
  base.getHSL(hsl)
  return new THREE.Color().setHSL((hsl.h + 0.04) % 1, hsl.s * 0.55, Math.min(0.92, hsl.l + 0.3))
}

// ---------------------------------------------------------------- the rig

interface Rig {
  id: number
  root: THREE.Group
  /** everything above the feet, for bob and lean */
  body: THREE.Group
  torso: THREE.Mesh
  belly: THREE.Mesh
  neck: THREE.Group
  head: THREE.Mesh
  snout: THREE.Mesh
  mouth: THREE.Mesh
  earL: THREE.Group
  earR: THREE.Group
  eyeL: THREE.Group
  eyeR: THREE.Group
  pupilL: THREE.Mesh
  pupilR: THREE.Mesh
  armL: THREE.Group
  armR: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  tail: THREE.Group
  crest: THREE.Group
  held: THREE.Mesh
  skin: THREE.MeshLambertMaterial
  bellyMat: THREE.MeshLambertMaterial
  /** per-creature animation offset so a crowd is not a chorus line */
  phase: number
  /** smoothed walk speed in metres/second */
  speed: number
  lastX: number
  lastZ: number
  blink: number
  blinkTimer: number
  earTwitch: number
  scale: number
  /** the y the feet are standing on, smoothed */
  groundY: number
  label: Label | null
  bubble: Label | null
  bubbleUntil: number
  bubbleText: string
  selected: boolean
  ring: THREE.Mesh
}

function limbGroup(parent: THREE.Object3D, mat: THREE.Material, len: number, x: number, y: number, z = 0): THREE.Group {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  const mesh = new THREE.Mesh(GEO.limb, mat)
  mesh.scale.set(1, len / 0.47, 1)
  mesh.position.y = -len / 2
  mesh.castShadow = true
  g.add(mesh)
  parent.add(g)
  return g
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
  ctx.font = '600 46px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const w = Math.min(canvas.width - 20, ctx.measureText(text).width + 56)
  const h = sub ? 92 : 62
  const x = (canvas.width - w) / 2
  const y = (canvas.height - h) / 2

  ctx.fillStyle = 'rgba(14, 16, 22, 0.72)'
  roundRect(ctx, x, y, w, h, 16)
  ctx.fill()
  ctx.strokeStyle = accent
  ctx.lineWidth = 3
  roundRect(ctx, x, y, w, h, 16)
  ctx.stroke()

  ctx.fillStyle = '#f3efe6'
  ctx.fillText(text, canvas.width / 2, y + (sub ? 30 : h / 2))
  if (sub) {
    ctx.font = '400 30px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = 'rgba(233, 226, 212, 0.75)'
    ctx.fillText(sub, canvas.width / 2, y + 66)
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
  const w = Math.min(
    canvas.width - 16,
    Math.max(...lines.map((l) => ctx.measureText(l).width)) + 56,
  )
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
  private selectionRing: THREE.RingGeometry
  private ringMat: THREE.MeshBasicMaterial

  constructor() {
    this.group.name = 'luma'
    this.selectionRing = new THREE.RingGeometry(0.62, 0.78, 24)
    this.selectionRing.rotateX(-Math.PI / 2)
    this.ringMat = new THREE.MeshBasicMaterial({
      color: '#ffd27a', transparent: true, opacity: 0.85, depthWrite: false,
    })
  }

  private build(c: Creature): Rig {
    const skinColor_ = skinColor(c)
    const skin = new THREE.MeshLambertMaterial({ color: skinColor_, flatShading: true })
    const bellyMat = new THREE.MeshLambertMaterial({ color: bellyColor(skinColor_), flatShading: true })

    const root = new THREE.Group()
    const body = new THREE.Group()
    body.position.y = 0.66
    root.add(body)

    const torso = new THREE.Mesh(GEO.torso, skin)
    torso.scale.set(0.84, 1.12, 0.76)
    torso.castShadow = true
    body.add(torso)

    const belly = new THREE.Mesh(GEO.belly, bellyMat)
    belly.scale.set(0.78, 0.86, 0.6)
    belly.position.set(0, -0.05, 0.22)
    body.add(belly)

    const neck = new THREE.Group()
    neck.position.set(0, 0.6, 0.02)
    body.add(neck)

    const head = new THREE.Mesh(GEO.head, skin)
    head.scale.set(1, 0.95, 1.02)
    head.castShadow = true
    neck.add(head)

    const snout = new THREE.Mesh(GEO.snout, bellyMat)
    snout.position.set(0, -0.1, 0.31)
    neck.add(snout)

    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.05), DARK)
    nose.position.set(0, -0.05, 0.42)
    neck.add(nose)

    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 0.035), DARK)
    mouth.position.set(0, -0.16, 0.37)
    neck.add(mouth)

    const makeEye = (side: number) => {
      const g = new THREE.Group()
      g.position.set(side * 0.16, 0.06, 0.27)
      const white = new THREE.Mesh(GEO.eye, WHITE)
      white.scale.set(1, 1.05, 0.7)
      g.add(white)
      const pupil = new THREE.Mesh(GEO.pupil, DARK)
      pupil.position.set(0, 0, 0.05)
      g.add(pupil)
      const brow = new THREE.Mesh(GEO.brow, skin)
      brow.position.set(0, 0.1, 0.03)
      brow.rotation.z = side * 0.22
      g.add(brow)
      neck.add(g)
      return { g, pupil }
    }
    const eyeLeft = makeEye(-1)
    const eyeRight = makeEye(1)

    const makeEar = (side: number) => {
      const g = new THREE.Group()
      g.position.set(side * 0.2, 0.26, -0.02)
      g.rotation.z = side * 0.22
      const ear = new THREE.Mesh(GEO.ear, skin)
      ear.position.y = 0.3
      ear.castShadow = true
      g.add(ear)
      const inner = new THREE.Mesh(GEO.ear, bellyMat)
      inner.position.y = 0.28
      inner.scale.set(0.6, 0.9, 0.4)
      g.add(inner)
      neck.add(g)
      return g
    }
    const earL = makeEar(-1)
    const earR = makeEar(1)

    const armL = limbGroup(body, skin, 0.46, -0.4, 0.3)
    const armR = limbGroup(body, skin, 0.46, 0.4, 0.3)
    for (const arm of [armL, armR]) {
      const hand = new THREE.Mesh(GEO.hand, bellyMat)
      hand.position.y = -0.48
      arm.add(hand)
    }

    const legL = limbGroup(root, skin, 0.62, -0.19, 0.68)
    const legR = limbGroup(root, skin, 0.62, 0.19, 0.68)
    for (const leg of [legL, legR]) {
      const foot = new THREE.Mesh(GEO.foot, bellyMat)
      foot.position.set(0, -0.64, 0.07)
      leg.add(foot)
    }

    const tail = new THREE.Group()
    tail.position.set(0, -0.06, -0.4)
    const tailMesh = new THREE.Mesh(GEO.tail, skin)
    tailMesh.position.z = -0.2
    tailMesh.rotation.x = Math.PI
    tail.add(tailMesh)
    body.add(tail)

    // a crest of hair, from the genome
    const crest = new THREE.Group()
    const style = hairStyle(c.genome, c.id * 7)
    const hairMat = new THREE.MeshLambertMaterial({ color: style.color, flatShading: true })
    const tufts = style.style === 'bald' ? 0 : style.style === 'buzz' ? 3 : style.style === 'long' ? 6 : 5
    for (let i = 0; i < tufts; i++) {
      const t = new THREE.Mesh(GEO.tuft, hairMat)
      const f = i / (tufts - 1)
      t.position.set((f - 0.5) * 0.34, 0.3, -0.04 - Math.abs(f - 0.5) * 0.1)
      const lean = style.style === 'spiky' ? -0.1 : style.style === 'curly' ? 0.9 : 0.35
      t.rotation.x = lean + (i % 2) * 0.15
      t.rotation.z = (f - 0.5) * 0.7
      t.scale.setScalar(0.6 + style.size * 0.9)
      crest.add(t)
    }
    neck.add(crest)

    const held = new THREE.Mesh(GEO.held, bellyMat)
    held.position.set(0, -0.62, 0.14)
    held.scale.setScalar(0.85)
    held.visible = false
    armR.add(held)

    const ring = new THREE.Mesh(this.selectionRing, this.ringMat)
    ring.position.y = 0.04
    ring.visible = false
    root.add(ring)

    // Luma stand a little over head height on a person when fully grown; that
    // is close enough to eye level that a conversation feels like one
    const scale = bodyScale(c.genome) * 1.12
    root.scale.setScalar(scale)

    const label = makeLabel()
    if (label) {
      label.sprite.position.y = 2.32
      label.sprite.scale.set(2.6, 0.65, 1)
      root.add(label.sprite)
    }
    const bubble = makeLabel(512, 256)
    if (bubble) {
      bubble.sprite.position.y = 3.02
      bubble.sprite.scale.set(3.2, 1.6, 1)
      bubble.sprite.visible = false
      root.add(bubble.sprite)
    }

    this.group.add(root)

    return {
      id: c.id, root, body, torso, belly, neck, head, snout, mouth,
      earL, earR, eyeL: eyeLeft.g, eyeR: eyeRight.g, pupilL: eyeLeft.pupil, pupilR: eyeRight.pupil,
      armL, armR, legL, legR, tail, crest, held, skin, bellyMat,
      phase: (c.id * 2.399963) % (Math.PI * 2),
      speed: 0, lastX: c.pos.x, lastZ: c.pos.z,
      blink: 0, blinkTimer: 1 + (c.id % 7) * 0.6, earTwitch: 0,
      scale, groundY: heightAt(c.pos.x, c.pos.z),
      label, bubble, bubbleUntil: 0, bubbleText: '',
      selected: false, ring,
    }
  }

  /**
   * Bring the rigs in line with the simulation and pose them.
   * `dt` is real seconds; `now` is a monotonic clock for the cycles.
   */
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

    // --- position, footing, facing -----------------------------------------
    const targetGround = heightAt(c.pos.x, c.pos.z)
    rig.groundY += (targetGround - rig.groundY) * Math.min(1, dt * 12)
    const dx = c.pos.x - rig.lastX
    const dz = c.pos.z - rig.lastZ
    const instant = Math.hypot(dx, dz) / Math.max(dt, 0.0001)
    rig.speed += (Math.min(instant, 6) - rig.speed) * Math.min(1, dt * 8)
    rig.lastX = c.pos.x
    rig.lastZ = c.pos.z
    rig.root.position.set(c.pos.x, rig.groundY, c.pos.z)

    const facing = rig.root.rotation.y
    let want = c.facing
    // shortest way round, so nobody spins to turn 10 degrees
    let diff = ((want - facing + Math.PI) % (Math.PI * 2)) - Math.PI
    if (diff < -Math.PI) diff += Math.PI * 2
    rig.root.rotation.y = facing + diff * Math.min(1, dt * 9)

    const dist = camPos.distanceTo(rig.root.position)
    const near = dist < 60

    // --- the age of them ----------------------------------------------------
    const stageScale = c.stage === 'child' ? 0.62 : c.stage === 'adolescent' ? 0.82 : 1
    const elderStoop = c.stage === 'elder' ? 0.12 : 0
    const scale = rig.scale * stageScale
    rig.root.scale.setScalar(scale)

    // --- dead ---------------------------------------------------------------
    if (!c.alive) {
      rig.body.rotation.set(-1.45, 0, 0)
      rig.body.position.set(0, 0.34, -0.2)
      rig.legL.rotation.set(0.4, 0, 0)
      rig.legR.rotation.set(0.2, 0, 0)
      rig.armL.rotation.set(0.9, 0, 0.4)
      rig.armR.rotation.set(0.7, 0, -0.3)
      rig.neck.rotation.set(0.3, 0, 0)
      rig.eyeL.scale.y = 0.08
      rig.eyeR.scale.y = 0.08
      rig.ring.visible = false
      if (rig.label) rig.label.sprite.visible = false
      if (rig.bubble) rig.bubble.sprite.visible = false
      return
    }

    // --- sleeping -----------------------------------------------------------
    if (c.sleeping) {
      const breath = Math.sin(now * 1.3 + rig.phase) * 0.04
      rig.body.rotation.set(-1.3, 0.2, 0)
      rig.body.position.set(0, 0.42 + breath, -0.1)
      rig.legL.rotation.set(1.3, 0, 0.2)
      rig.legR.rotation.set(1.1, 0, -0.1)
      rig.armL.rotation.set(1.4, 0, 0.5)
      rig.armR.rotation.set(1.2, 0, -0.4)
      rig.neck.rotation.set(0.5, 0.2, 0)
      rig.earL.rotation.x = 0.7
      rig.earR.rotation.x = 0.7
      rig.eyeL.scale.y = 0.08
      rig.eyeR.scale.y = 0.08
      rig.tail.rotation.x = 0.4
      this.updateLabels(rig, c, emotion.color, near && opts.showLabels, now, dist, selectedId, lookedAtId)
      return
    }

    // --- the walk cycle -----------------------------------------------------
    const gait = Math.min(1, rig.speed / 2.8)
    const running = rig.speed > 3.2
    const freq = 3.4 + gait * 4.2
    const t = now * freq + rig.phase
    const swing = Math.sin(t) * (0.35 + gait * 0.55)
    const bob = Math.abs(Math.sin(t)) * (0.02 + gait * 0.08)
    const roll = Math.cos(t) * gait * 0.05

    // --- mood, as posture ---------------------------------------------------
    const fear = c.chem.fear
    const sad = Math.max(c.chem.grief, 1 - c.chem.pleasure - 0.35)
    const joy = Math.max(0, c.chem.pleasure - 0.55) * 2
    const anger = emotion.type === 'angry' ? emotion.intensity : 0
    const tired = 1 - c.chem.energy

    const crouch = fear * 0.18 + tired * 0.06
    const slump = Math.max(0, sad) * 0.3 + elderStoop + tired * 0.1
    const bounce = joy * Math.abs(Math.sin(now * 5 + rig.phase)) * 0.07

    rig.body.position.set(0, 0.66 - crouch + bob + bounce, 0)
    rig.body.rotation.set(
      gait * 0.14 + anger * 0.16 + slump * 0.35,
      0,
      roll,
    )

    // legs and arms
    rig.legL.rotation.x = swing
    rig.legR.rotation.x = -swing
    const armBase = anger * 0.3 + fear * 0.25
    rig.armL.rotation.x = -swing * 0.75 - armBase
    rig.armR.rotation.x = swing * 0.75 - armBase
    rig.armL.rotation.z = 0.1 + anger * 0.35 + fear * 0.3
    rig.armR.rotation.z = -0.1 - anger * 0.35 - fear * 0.3

    // ears: up when curious, flat back when frightened or angry
    const alert = Math.max(0, c.emotions.curiosity - 0.3)
    rig.earTwitch = Math.max(0, rig.earTwitch - dt)
    if (rig.earTwitch <= 0 && Math.random() < dt * 0.15) rig.earTwitch = 0.28
    const twitch = rig.earTwitch > 0 ? Math.sin(rig.earTwitch * 40) * 0.25 : 0
    const earBack = fear * 1.1 + anger * 0.6 + slump * 0.5
    rig.earL.rotation.x = -0.1 - alert * 0.25 + earBack + twitch
    rig.earR.rotation.x = -0.1 - alert * 0.25 + earBack - twitch * 0.6
    rig.earL.rotation.z = 0.22 + earBack * 0.3
    rig.earR.rotation.z = -0.22 - earBack * 0.3

    // tail: wags when happy, tucks when scared
    const wag = joy > 0.05 ? Math.sin(now * 9 + rig.phase) * joy * 0.5 : Math.sin(now * 1.6 + rig.phase) * 0.08
    rig.tail.rotation.y = wag
    rig.tail.rotation.x = -0.2 + fear * 0.9 + slump * 0.5 - joy * 0.3

    // head: level against the body lean, then look at whatever matters
    let headPitch = -rig.body.rotation.x * 0.7 + slump * 0.5 - alert * 0.12
    let headYaw = 0
    const partner = c.talkingTo
    if (partner === 0) {
      // looking at the player
      const toCam = Math.atan2(camPos.x - c.pos.x, camPos.z - c.pos.z)
      headYaw = wrapAngle(toCam - rig.root.rotation.y) * 0.6
      headPitch += 0.06
    } else if (near) {
      headYaw = Math.sin(now * 0.6 + rig.phase) * 0.18
    }
    rig.neck.rotation.set(
      headPitch,
      THREE.MathUtils.clamp(headYaw, -1.1, 1.1),
      Math.sin(now * 1.1 + rig.phase) * 0.03,
    )

    // blinking
    rig.blinkTimer -= dt
    if (rig.blinkTimer <= 0) {
      rig.blink = 0.14
      rig.blinkTimer = 2.4 + Math.random() * 4
    }
    rig.blink = Math.max(0, rig.blink - dt)
    const lid = rig.blink > 0 ? 0.1 : 1
    const squint = 1 - Math.min(0.55, anger * 0.5 + Math.max(0, sad) * 0.35)
    rig.eyeL.scale.y = lid * squint
    rig.eyeR.scale.y = lid * squint
    // pupils drift toward whatever the head is looking at
    const px = THREE.MathUtils.clamp(headYaw * 0.09, -0.045, 0.045)
    rig.pupilL.position.x = px
    rig.pupilR.position.x = px

    // talking: a bob and a moving mouth
    const talking = c.busyTicks > 0 && (c.action === 'chat' || c.talkingTo != null)
    if (talking) {
      const m = (Math.sin(now * 13 + rig.phase) * 0.5 + 0.5)
      rig.mouth.scale.set(1, 0.6 + m * 2.4, 1)
      rig.neck.rotation.x += Math.sin(now * 6 + rig.phase) * 0.05
      rig.armR.rotation.x -= 0.25 + Math.sin(now * 5 + rig.phase) * 0.2
    } else {
      rig.mouth.scale.set(1, 1, 1)
    }

    // action flavour
    switch (c.action) {
      case 'work':
      case 'work done': {
        const hammer = Math.sin(now * 7 + rig.phase)
        rig.armR.rotation.x = -1.5 + hammer * 0.7
        rig.armL.rotation.x = -0.9
        rig.body.rotation.x += 0.18
        break
      }
      case 'eat': {
        const bite = Math.sin(now * 8 + rig.phase) * 0.3
        rig.armR.rotation.x = -2.0 + bite
        rig.mouth.scale.y = 1.4 + bite * 2
        break
      }
      case 'fight': {
        const jab = Math.sin(now * 11 + rig.phase)
        rig.armR.rotation.x = -1.8 - jab * 0.9
        rig.armL.rotation.x = -0.6 + jab * 0.4
        rig.body.rotation.x += 0.25
        break
      }
      case 'flee': {
        rig.body.rotation.x += 0.2
        break
      }
      case 'play': {
        rig.body.position.y += Math.abs(Math.sin(now * 6 + rig.phase)) * 0.12
        rig.armL.rotation.x = -2.2
        rig.armR.rotation.x = -2.2
        break
      }
      case 'teach':
      case 'social':
      case 'chat': {
        rig.armR.rotation.x -= 0.4 + Math.sin(now * 4 + rig.phase) * 0.3
        break
      }
      default:
        break
    }

    if (running) {
      rig.body.rotation.x += 0.16
      rig.armL.rotation.x -= 0.3
      rig.armR.rotation.x -= 0.3
    }

    // something in hand
    const carried = firstItem(c)
    rig.held.visible = carried != null
    if (carried) {
      ;(rig.held.material as THREE.MeshLambertMaterial).color.set(ITEM_COLORS[carried] ?? '#c8a568')
      rig.armR.rotation.x = -1.2
      rig.armL.rotation.x = -1.1
    }

    // colour drifts with mood: sickly when ill, flushed when angry
    const base = skinColor(c)
    if (c.illness > 0.2) base.lerp(new THREE.Color('#9aa97e'), Math.min(0.5, c.illness))
    if (anger > 0.2) base.lerp(new THREE.Color('#c05a45'), anger * 0.35)
    rig.skin.color.lerp(base, Math.min(1, dt * 3))

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
      // Names only when you are close, or when you are looking right at them —
      // and never for the one under the crosshair, because the HUD is already
      // giving them a nameplate with more in it.
      const visible = show && !looked && (dist < 26 || selected)
      rig.label.sprite.visible = visible
      if (visible) {
        const sub = c.job ? c.job : c.stage === 'child' ? 'child' : undefined
        drawLabel(rig.label, c.name, accent, sub)
        const s = Math.max(1, dist / 22)
        rig.label.sprite.scale.set(2.6 * s, 0.65 * s, 1)
        rig.label.sprite.position.y = 2.32
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
        rig.bubble.sprite.scale.set(3.2 * s, 1.6 * s, 1)
      }
    }
  }

  /** World position of a creature's head, for the interaction prompt. */
  headPosition(id: number, out: THREE.Vector3): boolean {
    const rig = this.rigs.get(id)
    if (!rig) return false
    rig.neck.getWorldPosition(out)
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
