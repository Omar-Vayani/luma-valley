/**
 * fx — the small feedback that tells you something happened.
 *
 * Two pooled systems, no allocation per event: a bank of instanced chips for
 * bursts (leaves off a bush, chips off a stone, splashes, hearts, coins) and a
 * few canvas sprites for floating text. Both are cheap enough to fire on every
 * interaction, which is the point — a game that answers instantly feels good
 * long before it looks good.
 */
import * as THREE from 'three'

export type BurstKind = 'leaf' | 'chip' | 'splash' | 'heart' | 'coin' | 'dust' | 'spark' | 'note'

const COLORS: Record<BurstKind, string[]> = {
  leaf: ['#6aa84f', '#8fbf5a', '#4f7a3a'],
  chip: ['#9a968c', '#7a766e', '#b6b1a6'],
  splash: ['#9fd8ff', '#cbe9ff', '#6fb2d8'],
  heart: ['#e8637f', '#ff90a8'],
  coin: ['#f2c14e', '#ffe08a'],
  dust: ['#b8a98c', '#cbbfa4'],
  spark: ['#ffd166', '#ff9f45'],
  note: ['#cfe3f2', '#9fb8cf'],
}

const MAX = 220

interface Particle {
  life: number
  maxLife: number
  vx: number
  vy: number
  vz: number
  spin: number
  size: number
  gravity: number
}

export class Fx {
  readonly group = new THREE.Group()
  private mesh: THREE.InstancedMesh
  private particles: Particle[] = []
  private positions: THREE.Vector3[] = []
  private rotations: number[] = []
  private colors: THREE.Color[] = []
  private next = 0
  private matrix = new THREE.Matrix4()
  private quat = new THREE.Quaternion()
  private scale = new THREE.Vector3()
  private axis = new THREE.Vector3(0.3, 1, 0.2).normalize()
  private floaters: Floater[] = []

  constructor() {
    this.group.name = 'fx'
    const geo = new THREE.TetrahedronGeometry(0.09, 0)
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX)
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3)
    this.mesh.frustumCulled = false
    this.mesh.castShadow = false
    for (let i = 0; i < MAX; i++) {
      this.particles.push({ life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, spin: 0, size: 1, gravity: 1 })
      this.positions.push(new THREE.Vector3())
      this.rotations.push(0)
      this.colors.push(new THREE.Color())
    }
    this.group.add(this.mesh)
    this.hideAll()
  }

  private hideAll(): void {
    this.scale.setScalar(0.0001)
    for (let i = 0; i < MAX; i++) {
      this.matrix.compose(this.positions[i], this.quat, this.scale)
      this.mesh.setMatrixAt(i, this.matrix)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }

  burst(kind: BurstKind, at: THREE.Vector3, count = 10, spread = 1): void {
    const palette = COLORS[kind]
    const rising = kind === 'heart' || kind === 'note' || kind === 'spark'
    for (let n = 0; n < count; n++) {
      const i = this.next
      this.next = (this.next + 1) % MAX
      const p = this.particles[i]
      p.maxLife = rising ? 1.4 : 0.75 + Math.random() * 0.5
      p.life = p.maxLife
      const angle = Math.random() * Math.PI * 2
      const speed = (0.7 + Math.random() * 1.5) * spread
      p.vx = Math.cos(angle) * speed
      p.vz = Math.sin(angle) * speed
      p.vy = rising ? 0.8 + Math.random() * 0.6 : 1.6 + Math.random() * 2
      p.gravity = rising ? 0.15 : 5.2
      p.spin = (Math.random() - 0.5) * 12
      p.size = (kind === 'coin' || kind === 'heart' ? 1.4 : 1) * (0.7 + Math.random() * 0.7)
      this.positions[i].copy(at)
      this.positions[i].x += (Math.random() - 0.5) * 0.3
      this.positions[i].z += (Math.random() - 0.5) * 0.3
      this.rotations[i] = Math.random() * Math.PI
      this.colors[i].set(palette[Math.floor(Math.random() * palette.length)])
    }
  }

  /** A number or a word that drifts up from a point in the world. */
  float(text: string, at: THREE.Vector3, color = '#ffe6b0'): void {
    let f = this.floaters.find((x) => x.life <= 0)
    if (!f) {
      if (this.floaters.length >= 8) return
      f = new Floater()
      this.floaters.push(f)
      this.group.add(f.sprite)
    }
    f.show(text, at, color)
  }

  update(dt: number): void {
    const color = new THREE.Color()
    for (let i = 0; i < MAX; i++) {
      const p = this.particles[i]
      if (p.life <= 0) continue
      p.life -= dt
      if (p.life <= 0) {
        this.scale.setScalar(0.0001)
        this.matrix.compose(this.positions[i], this.quat, this.scale)
        this.mesh.setMatrixAt(i, this.matrix)
        continue
      }
      p.vy -= p.gravity * dt
      const pos = this.positions[i]
      pos.x += p.vx * dt
      pos.y += p.vy * dt
      pos.z += p.vz * dt
      p.vx *= 1 - dt * 1.6
      p.vz *= 1 - dt * 1.6
      this.rotations[i] += p.spin * dt

      const k = p.life / p.maxLife
      this.quat.setFromAxisAngle(this.axis, this.rotations[i])
      this.scale.setScalar(p.size * (0.4 + k * 0.9))
      this.matrix.compose(pos, this.quat, this.scale)
      this.mesh.setMatrixAt(i, this.matrix)
      color.copy(this.colors[i]).multiplyScalar(0.5 + k * 0.5)
      this.mesh.setColorAt(i, color)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true

    for (const f of this.floaters) f.update(dt)
  }
}

class Floater {
  readonly sprite: THREE.Sprite
  private canvas = document.createElement('canvas')
  private ctx: CanvasRenderingContext2D | null
  private texture: THREE.CanvasTexture
  life = 0

  constructor() {
    this.canvas.width = 384
    this.canvas.height = 96
    this.ctx = this.canvas.getContext('2d')
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthTest: false }),
    )
    this.sprite.renderOrder = 950
    this.sprite.visible = false
    this.sprite.scale.set(1.7, 0.42, 1)
  }

  show(text: string, at: THREE.Vector3, color: string): void {
    const ctx = this.ctx
    if (!ctx) return
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.font = '700 52px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 8
    ctx.strokeStyle = 'rgba(12, 12, 16, 0.85)'
    ctx.strokeText(text, 192, 48)
    ctx.fillStyle = color
    ctx.fillText(text, 192, 48)
    this.texture.needsUpdate = true
    this.sprite.position.copy(at)
    this.sprite.visible = true
    this.life = 1.6
  }

  update(dt: number): void {
    if (this.life <= 0) return
    this.life -= dt
    this.sprite.position.y += dt * 0.9
    const mat = this.sprite.material as THREE.SpriteMaterial
    mat.opacity = Math.min(1, this.life / 0.6)
    if (this.life <= 0) this.sprite.visible = false
  }
}
