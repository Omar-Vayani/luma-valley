import * as THREE from 'three'
import type { Game } from '../sim/game'
import type { Creature } from '../sim/creature'
import { buildWorld3D, type World3D } from './world3d'
import { buildNameLabel } from './creature3d'
import { AssetManager, speciesFromGene } from './assets'
import { buildDungeonDressing, buildGraveyard, buildStoneHouse } from './structures'
import { FPSControls } from './fps'
import type { SoundEngine } from '../audio/sfx'

export type InteractKind = 'creature' | 'berry' | 'wood' | 'shrine' | 'den' | 'pickup'

export interface InteractEvent {
  kind: InteractKind
  creatureId?: number
  itemId?: string
}

export interface GameViewCallbacks {
  onSelect: (creatureId: number | null) => void
  onInteract: (ev: InteractEvent) => void
  onLockChange: (locked: boolean) => void
  onQuestHint: (text: string) => void
}

interface CreatureView {
  group: THREE.Group
  label: THREE.Sprite
  animMixer?: THREE.AnimationMixer
  animClip?: THREE.AnimationClip
}

/** Actions that mean the creature is on the move (walking animation). */
const WALK_ACTIONS = new Set(['wander', 'toFood', 'toWater', 'social', 'flee'])

export class GameView {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  fps: FPSControls
  world3d: World3D
  assets: AssetManager
  creatureViews = new Map<number, CreatureView>()
  beastViews: { group: THREE.Group }[] = []
  mentorGroup: THREE.Group
  shrineGroup: THREE.Group
  torchLight: THREE.PointLight
  raycaster = new THREE.Raycaster()
  selectedId: number | null = null
  private raf = 0
  private lastTime = performance.now()
  private simAccum = 0
  private callbacks: GameViewCallbacks
  private game: Game
  private sound: SoundEngine | null
  private showNames = true
  private mentor: THREE.Group | null = null
  private woodMeshes: THREE.Object3D[] = []
  private pickups: THREE.Mesh[] = []
  private butterflies: THREE.Group[] = []
  private shrineLit = false
  private static TICK_RATE = 6

  constructor(container: HTMLElement, game: Game, sound: SoundEngine | null, callbacks: GameViewCallbacks) {
    this.game = game
    this.sound = sound
    this.callbacks = callbacks
    this.assets = new AssetManager()

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    container.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.1, 400)
    this.scene.fog = new THREE.Fog(0xaee1f5, 40, 110)

    this.world3d = buildWorld3D(game.world)
    this.scene.add(this.world3d.group)

    // FPV controls — spawn near the first alive creature so life is in view
    const firstCreature = game.creatures.find((c) => c.alive) ?? game.creatures[0]
    const spawn = firstCreature
      ? { x: firstCreature.pos.x + 4, z: firstCreature.pos.z + 4 }
      : { x: game.world.state.den.x + 4, z: game.world.state.den.z + 4 }
    this.fps = new FPSControls(this.camera, this.renderer.domElement, game.world, spawn)
    this.fps.onLockChange = (l) => this.callbacks.onLockChange(l)
    this.fps.onWheel = () => {
      /* wheel reserved */
    }

    // torch light (attached to camera)
    this.torchLight = new THREE.PointLight(0xff9a3c, 0, 18, 2)
    this.torchLight.position.set(0.5, -0.2, -0.6)
    this.camera.add(this.torchLight)
    this.scene.add(this.camera)

    // structures
    this.buildStructures()
    this.mentorGroup = new THREE.Group()
    this.scene.add(this.mentorGroup)
    this.shrineGroup = new THREE.Group()
    this.scene.add(this.shrineGroup)

    // interactions (look input is owned entirely by FPSControls — window-level,
    // client-delta based, works for mouse + touch in every browser)
    this.renderer.domElement.style.touchAction = 'none' // vertical swipes must reach us, not the browser
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.addEventListener('click', this.onClick)
    window.addEventListener('resize', this.onResize)

    void this.assets.preload().then(() => {
      for (const c of game.creatures) this.addCreature(c)
      this.spawnMentor()
      this.spawnShrine()
      // village house + dungeon + graveyard structures
      const gy = (x: number, z: number) => this.game.world.height(x, z) * 6 - 2.5
      void buildStoneHouse(this.scene, -10, 14, gy)
      void buildDungeonDressing(this.scene, -24, -18, gy)
      void buildGraveyard(this.scene, 28, 30, gy)
    })

    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
    // QA/debug hook
    ;(window as unknown as Record<string, unknown>).__luma = { view: this }
  }

  // ── World structures: cave entrance, player cabin, shrine ──
  private buildStructures(): void {
    const w = this.game.world
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x9a7d5c })
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x3a2c1e })
    const cavePos = { x: -24, z: -18 }
    // cave mouth (cluster of rocks with a dark opening)
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1 + Math.random() * 0.8, 0), stoneMat)
      r.position.set(cavePos.x + Math.cos(ang) * 3.2, 0.3, cavePos.z + Math.sin(ang) * 3.2)
      r.rotation.set(Math.random(), Math.random(), Math.random())
      r.scale.y = 0.7
      this.scene.add(r)
    }
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(1.8, 10, 8), darkMat)
    mouth.position.set(cavePos.x, 0.2, cavePos.z)
    mouth.scale.set(1, 0.7, 1.3)
    this.scene.add(mouth)
    // crystal glow inside cave
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshLambertMaterial({ color: 0x6ef0c8, emissive: 0x2a8f6a }))
    crystal.position.set(cavePos.x - 4, 1.0, cavePos.z - 3)
    this.scene.add(crystal)
    const caveLight = new THREE.PointLight(0x6ef0c8, 1.2, 14)
    caveLight.position.copy(crystal.position)
    this.scene.add(caveLight)

    // player cabin near den
    const cabin = new THREE.Group()
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xd9b380 })
    const roofMat = new THREE.MeshLambertMaterial({ color: 0xb06030 })
    const base = { x: w.state.den.x + 6, z: w.state.den.z + 8 }
    const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, m: THREE.Material) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m)
      b.position.set(x, y, z)
      cabin.add(b)
    }
    box(5, 3, 4, base.x, 1.5, base.z, wallMat)
    box(4.6, 1, 3.6, base.x, 3.2, base.z, roofMat)
    box(5.2, 0.5, 4.2, base.x, -0.2, base.z, stoneMat)
    box(1.2, 1.8, 0.1, base.x + 1.2, 0.9, base.z + 2, new THREE.MeshLambertMaterial({ color: 0x5a3a20 }))
    this.scene.add(cabin)
    // fire pit
    const fire = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.3, 8), stoneMat)
    fire.position.set(base.x - 3, 0.1, base.z)
    this.scene.add(fire)
    const fireLight = new THREE.PointLight(0xff9a3c, 0.9, 10)
    fireLight.position.set(base.x - 3, 1.2, base.z)
    this.scene.add(fireLight)
    // wood piles (collectible)
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.6, 6), new THREE.MeshLambertMaterial({ color: 0x8a5a30 }))
      log.position.set(base.x - 1.5 + i * 1.2, 0.25, base.z + 2.4)
      log.rotation.z = Math.PI / 2
      log.userData.interact = 'wood'
      log.userData.id = i
      this.scene.add(log)
      this.woodMeshes.push(log)
    }
    // item pickups (collectible) — scattered around the cabin
    const pickupDefs: { id: string; geo: THREE.BufferGeometry; color: number }[] = [
      { id: 'smoke-herb', geo: new THREE.OctahedronGeometry(0.35, 0), color: 0x9a8c6a },
      { id: 'sugar-candy', geo: new THREE.OctahedronGeometry(0.35, 0), color: 0xf0a0c0 },
      { id: 'cactus-juice', geo: new THREE.OctahedronGeometry(0.35, 0), color: 0x7fdc7f },
      { id: 'dream-mushroom', geo: new THREE.OctahedronGeometry(0.35, 0), color: 0x9a7fdc },
      { id: 'nightshade', geo: new THREE.OctahedronGeometry(0.35, 0), color: 0x4a3a5a },
      { id: 'berry', geo: new THREE.OctahedronGeometry(0.35, 0), color: 0xe05a5a },
      { id: 'warm-lamp', geo: new THREE.BoxGeometry(0.5, 0.6, 0.5), color: 0xffb03a },
      { id: 'music-box', geo: new THREE.BoxGeometry(0.5, 0.4, 0.4), color: 0x7fb6de },
      { id: 'soft-blanket', geo: new THREE.BoxGeometry(0.6, 0.25, 0.8), color: 0xe0a0a0 },
      { id: 'honey', geo: new THREE.BoxGeometry(0.5, 0.45, 0.5), color: 0xf0a83a },
    ]
    pickupDefs.forEach((def, i) => {
      const mat = new THREE.MeshLambertMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.55 })
      const mesh = new THREE.Mesh(def.geo, mat)
      const ang = (i / pickupDefs.length) * Math.PI * 2 + 0.4
      const r = 3.4 + Math.random() * 1.8
      const x = base.x + Math.cos(ang) * r
      const z = base.z + Math.sin(ang) * r
      const baseY = this.groundY(x, z) + 0.9
      mesh.position.set(x, baseY, z)
      mesh.rotation.y = Math.random() * Math.PI * 2
      mesh.userData.pickupItem = def.id
      mesh.userData.baseY = baseY
      mesh.userData.phase = i * 1.3
      this.scene.add(mesh)
      this.pickups.push(mesh)
    })

    // ── static colliders for structures ──
    const w2 = this.game.world
    // cave rocks ring
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2
      w2.addCollider(cavePos.x + Math.cos(ang) * 3.2, cavePos.z + Math.sin(ang) * 3.2, 1.0)
    }
    w2.addCollider(cavePos.x, cavePos.z, 1.8)
    // cabin + fire pit
    w2.addCollider(base.x, base.z, 2.8)
    w2.addCollider(base.x - 3, base.z, 0.8)
    // village house footprint (walls at -10..-6, z 11..17)
    for (let i = 0; i < 6; i++) {
      const wx = i < 4 ? -10 + (i % 2) * 4 : -10.2
      const wz = i < 4 ? 11 + Math.floor(i / 2) * 6 : 12.5 + (i % 2) * 3
      w2.addCollider(wx, wz, 1.2)
    }
    w2.addCollider(-8, 14, 1.2) // roof center
    // graveyard corner
    w2.addCollider(28, 30, 2.4)
    // shrine
    w2.addCollider(-24, -18, 1.8)
    // den
    w2.addCollider(w.state.den.x, w.state.den.z, 1.5)

    this.scatterNature()
    void this.buildPlaces()
  }

  /**
   * Places with a purpose — landmarks that make the valley feel designed:
   * berry grove, flower meadow, ancient stone circle, lookout hill, pond,
   * and dirt paths connecting them. Plus ambient butterflies.
   */
  private async buildPlaces(): Promise<void> {
    const w = this.game.world
    const S = w.state.size

    // helper: place an OBJ prop clone at a spot
    const prop = (name: string, x: number, z: number, s = 1, ry = 0) => {
      return this.assets.loadProp(name).then((g) => {
        const y = this.groundY(x, z) - 0.3
        g.position.set(x, y, z)
        g.scale.setScalar(s)
        g.rotation.y = ry
        this.scene.add(g)
      })
    }

    // ── dirt paths between the main places ──
    const pathMat = new THREE.MeshLambertMaterial({ color: 0x9a7a52 })
    const pathBetween = (ax: number, az: number, bx: number, bz: number) => {
      const dx = bx - ax
      const dz = bz - az
      const len = Math.hypot(dx, dz)
      const steps = Math.max(2, Math.floor(len / 3))
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const x = ax + dx * t
        const z = az + dz * t
        const seg = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 3), pathMat)
        seg.rotation.y = Math.atan2(dz, dx) - Math.PI / 2
        seg.position.set(x, this.groundY(x, z) - 0.32, z)
        this.scene.add(seg)
      }
    }
    // cabin (6,8) → house (-8,14); house → cave (-24,-18); cave → graveyard (28,30)
    pathBetween(6, 8, -8, 14)
    pathBetween(-8, 14, -24, -18)
    pathBetween(-24, -18, 28, 30)
    pathBetween(6, 8, 18, -14) // cabin → berry grove
    pathBetween(6, 8, 32, -8) // cabin → lookout

    // ── berry grove at (18,-14): a cluster of berry bushes ──
    const bushMat = new THREE.MeshLambertMaterial({ color: 0x2f7a3a })
    const berryMat = new THREE.MeshLambertMaterial({ color: 0xd94a4a })
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2
      const bx = 18 + Math.cos(ang) * (1.5 + Math.random() * 1.2)
      const bz = -14 + Math.sin(ang) * (1.5 + Math.random() * 1.2)
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 + Math.random() * 0.3, 0), bushMat)
      b.scale.y = 0.8
      b.position.set(bx, this.groundY(bx, bz) - 0.35, bz)
      this.scene.add(b)
      for (let j = 0; j < 4; j++) {
        const berry = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 4), berryMat)
        berry.position.set(bx + (Math.random() - 0.5) * 0.8, this.groundY(bx, bz) + 0.4 + Math.random() * 0.5, bz + (Math.random() - 0.5) * 0.8)
        this.scene.add(berry)
      }
    }

    // ── flower meadow at (-16, 26) ──
    const flowerMats2 = [0xe05a8a, 0xf0c040, 0x7a7ae0, 0xe07a40, 0xffffff].map((c) => new THREE.MeshLambertMaterial({ color: c }))
    for (let i = 0; i < 70; i++) {
      const fx = -16 + (Math.random() - 0.5) * 14
      const fz = 26 + (Math.random() - 0.5) * 10
      if (Math.abs(fx + 6) < 2) continue // off the stream
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4), new THREE.MeshLambertMaterial({ color: 0x3f8f3f }))
      stem.position.set(fx, this.groundY(fx, fz) - 0.3, fz)
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 5, 4), flowerMats2[Math.floor(Math.random() * flowerMats2.length)])
      head.position.set(fx, this.groundY(fx, fz) + 0.3, fz)
      this.scene.add(stem)
      this.scene.add(head)
    }

    // ── ancient stone circle at (4,-30) ──
    const stoneMat2 = new THREE.MeshLambertMaterial({ color: 0x8a8a7e })
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2
      const sx = 4 + Math.cos(ang) * 5
      const sz = -30 + Math.sin(ang) * 5
      const stone = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.6 + Math.random() * 1.2, 0.6), stoneMat2)
      stone.position.set(sx, this.groundY(sx, sz) + 0.3, sz)
      stone.rotation.y = ang
      stone.rotation.z = (Math.random() - 0.5) * 0.15
      this.scene.add(stone)
      w.addCollider(sx, sz, 1.0)
    }
    const centerStone = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.6, 1.1), stoneMat2)
    centerStone.position.set(4, this.groundY(4, -30) + 0.2, -30)
    this.scene.add(centerStone)
    w.addCollider(4, -30, 1.2)
    const circleGlow = new THREE.PointLight(0x7aa0e0, 0.6, 10)
    circleGlow.position.set(4, 2, -30)
    this.scene.add(circleGlow)

    // ── lookout hill at (32,-8): lantern on a mound ──
    const mound = new THREE.Mesh(new THREE.ConeGeometry(4, 3, 8), new THREE.MeshLambertMaterial({ color: 0x7a9a5a }))
    mound.position.set(32, this.groundY(32, -8) + 0.6, -8)
    this.scene.add(mound)
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 3.2, 6), new THREE.MeshLambertMaterial({ color: 0x5a3a20 }))
    post.position.set(32, this.groundY(32, -8) + 2.8, -8)
    this.scene.add(post)
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffb03a, emissive: 0xcc7a1a }))
    lantern.position.set(32, this.groundY(32, -8) + 4.6, -8)
    this.scene.add(lantern)
    const lanternLight = new THREE.PointLight(0xffb03a, 1.0, 12)
    lanternLight.position.set(32, 4.6, -8)
    this.scene.add(lanternLight)
    w.addCollider(32, -8, 1.0)

    // ── pond at (16,24): the stream widens ──
    const pondMat = new THREE.MeshLambertMaterial({ color: 0x4a9ad0, transparent: true, opacity: 0.85 })
    const pond = new THREE.Mesh(new THREE.CircleGeometry(4.5, 12), pondMat)
    pond.rotation.x = -Math.PI / 2
    pond.position.set(16, this.groundY(16, 24) - 0.15, 24)
    this.scene.add(pond)
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2
      const rx = 16 + Math.cos(ang) * 4.5
      const rz = 24 + Math.sin(ang) * 4.5
      const reed = new THREE.Mesh(new THREE.ConeGeometry(0.08, 1.1, 4), new THREE.MeshLambertMaterial({ color: 0x4a7a3a }))
      reed.position.set(rx, this.groundY(rx, rz) + 0.2, rz)
      this.scene.add(reed)
    }
    w.addCollider(16, 24, 4.2) // pond edge is walkable but the water is there

    // ── scattered mushrooms ──
    const shroomCap = new THREE.MeshLambertMaterial({ color: 0xc83030 })
    const shroomStem = new THREE.MeshLambertMaterial({ color: 0xe8dcc8 })
    for (let i = 0; i < 30; i++) {
      const mx = -S + Math.random() * S * 2
      const mz = -S + Math.random() * S * 2
      if (w.collides({ x: mx, z: mz }, 0.6) || Math.abs(mx + 6) < 2.2) continue
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.35, 5), shroomStem)
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), shroomCap)
      cap.position.y = 0.22
      stem.position.set(mx, this.groundY(mx, mz) - 0.35, mz)
      cap.position.set(mx, this.groundY(mx, mz) - 0.12, mz)
      cap.scale.y = 0.7
      this.scene.add(stem)
      this.scene.add(cap)
    }

    // ── fallen logs ──
    const logMat = new THREE.MeshLambertMaterial({ color: 0x7a4a28 })
    for (let i = 0; i < 10; i++) {
      const lx = -S + Math.random() * S * 2
      const lz = -S + Math.random() * S * 2
      if (w.collides({ x: lx, z: lz }, 0.8) || Math.abs(lx + 6) < 2.2) continue
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 2 + Math.random() * 1.5, 6), logMat)
      log.position.set(lx, this.groundY(lx, lz) - 0.2, lz)
      log.rotation.z = Math.PI / 2
      log.rotation.y = Math.random() * Math.PI
      this.scene.add(log)
      w.addCollider(lx, lz, 0.5)
    }

    // ── nature props from the Drive pack (variety) ──
    void Promise.allSettled([
      prop('PineTree_1.obj', -2, 20, 1.6),
      prop('PineTree_1.obj', -30, 12, 1.4),
      prop('PineTree_1.obj', 26, -28, 1.7),
      prop('Willow_1.obj', 38, 10, 1.5),
      prop('Willow_1.obj', -38, -32, 1.4),
      prop('BirchTree_1.obj', 24, 4, 1.3),
      prop('BirchTree_1.obj', -6, -34, 1.4),
      prop('Rock_1.obj', 12, -30, 1.2),
      prop('Rock_1.obj', -34, 24, 1.3),
      prop('TreeStump.obj', 10, 12, 1.2),
      prop('TreeStump.obj', -20, 4, 1.1),
      prop('WoodLog.obj', -12, -8, 1.2),
      prop('WoodLog.obj', 22, -22, 1.2),
      prop('BushBerries_1.obj', 20, -16, 1.3),
      prop('BushBerries_1.obj', 16, -12, 1.2),
      prop('Bush_1.obj', 8, -20, 1.2),
      prop('Bush_1.obj', -28, -6, 1.3),
    ])

    // ── butterflies: tiny fluttering ambient sprites ──
    const butterflyGeo = new THREE.BufferGeometry()
    const wingMat = new THREE.MeshLambertMaterial({ color: 0xffcc66, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    for (let i = 0; i < 9; i++) {
      const bf = new THREE.Group()
      const w1 = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.2), wingMat)
      const w2 = w1.clone()
      w1.position.x = 0.12
      w2.position.x = -0.12
      w2.rotation.y = Math.PI
      bf.add(w1)
      bf.add(w2)
      bf.userData = {
        base: { x: -S + Math.random() * S * 2, y: 1.5 + Math.random() * 2, z: -S + Math.random() * S * 2 },
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.5,
        flap: 0,
      }
      bf.position.set(bf.userData.base.x, bf.userData.base.y, bf.userData.base.z)
      this.butterflies.push(bf)
      this.scene.add(bf)
    }
    void butterflyGeo
  }

  /** Fill the valley with trees, rocks, bushes, flowers and grass tufts. */
  private scatterNature(): void {
    const w = this.game.world
    const rng = this.game.rng
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x4c8c3a })
    const treeMat2 = new THREE.MeshLambertMaterial({ color: 0x3f7a33 })
    const treeMat3 = new THREE.MeshLambertMaterial({ color: 0x5a9c44 })
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 })
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x9a9a8a })
    const rockMat2 = new THREE.MeshLambertMaterial({ color: 0x8a8a7c })
    const bushMat = new THREE.MeshLambertMaterial({ color: 0x3f8f3f })
    const flowerMats = [0xe05a8a, 0xf0c040, 0x7a7ae0, 0xe07a40].map((c) => new THREE.MeshLambertMaterial({ color: c }))
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x66b04a })
    const S = w.state.size

    const scatter = (n: number, make: () => THREE.Mesh, tryRadius: number, colliderRadius: number) => {
      let placed = 0
      let guard = 0
      while (placed < n && guard < n * 25) {
        guard++
        const x = -S + rng() * S * 2
        const z = -S + rng() * S * 2
        // keep off the stream corridor, structure pads, and other colliders
        if (Math.abs(x + 6) < 2.2 && Math.abs(z) < S) continue
        if (w.collides({ x, z }, tryRadius)) continue
        const m = make()
        const y = this.groundY(x, z) - 0.3
        m.position.set(x, y, z)
        m.rotation.y = rng() * Math.PI * 2
        const s = 0.7 + rng() * 0.9
        m.scale.setScalar(s)
        this.scene.add(m)
        if (colliderRadius > 0) w.addCollider(x, z, colliderRadius * s)
        placed++
      }
    }

    // trees: trunk + cone canopy (generous — the valley should feel wooded)
    scatter(45, () => {
      const g = new THREE.Group()
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.6, 5), trunkMat)
      trunk.position.y = 0.8
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.6, 6), [treeMat, treeMat2, treeMat3][Math.floor(rng() * 3)])
      canopy.position.y = 2.4
      g.add(trunk)
      g.add(canopy)
      return g as unknown as THREE.Mesh
    }, 1.6, 0.8)

    // rocks
    scatter(35, () => {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55 + rng() * 0.6, 0), [rockMat, rockMat2][Math.floor(rng() * 2)])
      r.scale.y = 0.6
      r.rotation.set(rng() * 3, rng() * 3, rng() * 3)
      return r
    }, 1.0, 0.7)

    // bushes
    scatter(30, () => {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + rng() * 0.3, 0), bushMat)
      b.scale.y = 0.75
      return b
    }, 0.9, 0)

    // flowers (small stem + colored head)
    scatter(45, () => {
      const g = new THREE.Group()
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 4), grassMat)
      stem.position.y = 0.28
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), flowerMats[Math.floor(rng() * flowerMats.length)])
      head.position.y = 0.6
      g.add(stem)
      g.add(head)
      return g as unknown as THREE.Mesh
    }, 0.5, 0)

    // grass tufts
    scatter(55, () => {
      const g = new THREE.Group()
      for (let i = 0; i < 6; i++) {
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.45 + rng() * 0.35, 4), grassMat)
        blade.position.set(rng() * 0.55 - 0.28, 0.22, rng() * 0.55 - 0.28)
        blade.rotation.set(rng() * 0.4 - 0.2, 0, rng() * 0.4 - 0.2)
        g.add(blade)
      }
      return g as unknown as THREE.Mesh
    }, 0.4, 0)

    // hero trees: a few big trees framing the cabin and the house
    const hero = [
      { x: 1, z: 4 }, { x: -1, z: 12 }, { x: 12, z: 3 }, { x: -16, z: 8 }, { x: 18, z: 16 }, { x: -2, z: 24 },
    ]
    for (const h of hero) {
      if (w.collides({ x: h.x, z: h.z }, 1.8)) continue
      const g = new THREE.Group()
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 3, 6), trunkMat)
      trunk.position.y = 1.5
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.4, 4.5, 7), treeMat3)
      canopy.position.y = 4.2
      g.add(trunk)
      g.add(canopy)
      g.position.set(h.x, this.groundY(h.x, h.z) - 0.3, h.z)
      g.scale.setScalar(1 + rng() * 0.5)
      this.scene.add(g)
      w.addCollider(h.x, h.z, 1.6)
    }
  }

  private spawnMentor(): void {
    void this.assets.creatureModel(9).then((m) => {
      this.assets.tint(m, 0.12, false) // golden spirit
      m.scale.setScalar(1.4)
      m.position.set(this.game.world.state.den.x, 2.4, this.game.world.state.den.z + 3)
      this.mentorGroup.add(m)
      this.mentor = m
    })
  }

  private spawnShrine(): void {
    const shrinePos = new THREE.Vector3(-24, 0, -18)
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0xb8a888 })
    const altar = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.0, 1.2, 8), stoneMat)
    altar.position.set(shrinePos.x, 0.6, shrinePos.z)
    this.shrineGroup.add(altar)
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), new THREE.MeshLambertMaterial({ color: 0x9ad8ff, emissive: 0x2a6a9a }))
    orb.position.set(shrinePos.x, 1.6, shrinePos.z)
    orb.userData.interact = 'shrine'
    this.shrineGroup.add(orb)
    const light = new THREE.PointLight(0x9ad8ff, 0.8, 12)
    light.position.copy(orb.position)
    this.shrineGroup.add(light)
    this.shrineGroup.position.set(0, 0, 0)
  }

  lightShrine(): void {
    if (this.shrineLit) return
    this.shrineLit = true
    this.shrineGroup.traverse((o: THREE.Object3D) => {
      if (o instanceof THREE.Mesh && o.userData.interact === 'shrine') {
        const mat = o.material as THREE.MeshLambertMaterial
        mat.emissive = new THREE.Color(0xffd27a)
        mat.color = new THREE.Color(0xfff3c8)
      }
    })
    this.callbacks.onQuestHint('The Old Shrine blazes with warm light. The valley feels safer.')
  }

  private addCreature(c: Creature): void {
    const species = speciesFromGene(c.traits.species ?? 0.5)
    const holder = new THREE.Group()
    holder.position.set(c.pos.x, this.groundY(c.pos.x, c.pos.z), c.pos.z)
    this.scene.add(holder)
    const label = buildNameLabel(c.name)
    label.position.y = 2.4
    holder.add(label)
    label.visible = this.showNames
    this.creatureViews.set(c.id, { group: holder, label })

    void this.assets.creatureModel(species).then((m) => {
      this.assets.tint(m, c.traits.hue)
      m.scale.setScalar(1.4)
      m.rotation.y = c.facing
      m.userData.baseScale = 1.4
      holder.add(m)
      holder.userData.model = m
    })
  }

  private groundY(x: number, z: number): number {
    return this.game.world.height(x, z) * 6 - 2.5 + 0.3
  }

  private onClick = (): void => {
    // interact with whatever is at the crosshair
    this.interact()
  }

  /** Center-screen interaction (like Minecraft's use button). */
  interact(): InteractEvent | null {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera)
    const targets: THREE.Object3D[] = []
    for (const v of this.creatureViews.values()) {
      if (v.group.userData.model) v.group.userData.model.traverse((o: THREE.Object3D) => { if (o instanceof THREE.Mesh) targets.push(o) })
    }
    targets.push(...this.woodMeshes)
    targets.push(...this.pickups)
    this.shrineGroup.traverse((o: THREE.Object3D) => { if (o instanceof THREE.Mesh && o.userData.interact === 'shrine') targets.push(o) })
    const hits = this.raycaster.intersectObjects(targets, false)
    if (hits.length === 0) {
      this.callbacks.onSelect(null)
      return null
    }
    const hit = hits[0]
    // pickup?
    const itemId = hit.object.userData.pickupItem as string | undefined
    if (itemId && this.game.pickupItem(itemId)) {
      this.scene.remove(hit.object)
      const pi = this.pickups.indexOf(hit.object as THREE.Mesh)
      if (pi >= 0) this.pickups.splice(pi, 1)
      this.callbacks.onInteract({ kind: 'pickup', itemId })
      return { kind: 'pickup', itemId }
    }
    // creature?
    for (const [id, v] of this.creatureViews) {
      const model = v.group.userData.model as THREE.Object3D | undefined
      if (model && (model === hit.object || model.getObjectById(hit.object.id))) {
        this.select(id)
        this.callbacks.onInteract({ kind: 'creature', creatureId: id })
        return { kind: 'creature', creatureId: id }
      }
    }
    if (hit.object.userData.interact === 'wood') {
      this.callbacks.onInteract({ kind: 'wood' })
      return { kind: 'wood' }
    }
    if (hit.object.userData.interact === 'shrine') {
      this.callbacks.onInteract({ kind: 'shrine' })
      return { kind: 'shrine' }
    }
    return null
  }

  select(id: number | null): void {
    if (this.selectedId === id) return
    if (this.selectedId !== null) {
      const v = this.creatureViews.get(this.selectedId)
      if (v) v.group.userData.selected = false
    }
    this.selectedId = id
    if (id !== null) {
      const v = this.creatureViews.get(id)
      if (v) v.group.userData.selected = true
    }
    this.callbacks.onSelect(id)
  }

  setShowNames(on: boolean): void {
    this.showNames = on
    for (const v of this.creatureViews.values()) v.label.visible = on
  }

  private onResize = (): void => {
    const w = this.renderer.domElement.parentElement?.clientWidth ?? window.innerWidth
    const h = this.renderer.domElement.parentElement?.clientHeight ?? window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  /** Debug/QA hook: teleport the FPV camera. */
  teleport(x: number, z: number): void {
    this.fps.position.set(x, 6, z)
    this.fps.update(0)
  }

  private loop(): void {
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    const dt = Math.min((now - this.lastTime) / 1000, 0.1)
    this.lastTime = now

    // sim at fixed rate
    this.simAccum += dt
    const step = 1 / GameView.TICK_RATE
    let guard = 0
    while (this.simAccum >= step && guard < 5) {
      this.game.tick()
      this.simAccum -= step
      guard++
    }
    this.world3d.update(this.game.world.state.dayTime)
    this.world3d.shimmer(now / 1000)
    this.torchLight.intensity = this.game.player.torchLit ? 1.6 : 0

    // add newly born creatures
    for (const c of this.game.creatures) {
      if (!this.creatureViews.has(c.id)) this.addCreature(c)
    }

    // creature transforms
    for (const [id, v] of this.creatureViews) {
      const c = this.game.selectedCreature(id)
      if (!c) continue
      const gy = this.groundY(c.pos.x, c.pos.z)
      v.group.position.set(c.pos.x, gy, c.pos.z)
      v.group.rotation.y = c.facing
      const model = v.group.userData.model as THREE.Group | undefined
      if (model) {
        if (!c.alive) {
          // dead: lying flat (unchanged)
          model.rotation.x = -Math.PI / 2
          model.position.y = 0
          model.scale.setScalar(1.4)
        } else {
          model.rotation.x = 0
          if (c.sleeping) {
            // gentle breathing: slow bob + subtle scale pulse
            model.position.y = Math.sin(now / 500 + id) * 0.02
            model.scale.setScalar(1.4 * 0.9 * (1 + Math.sin(now / 900 + id) * 0.03))
          } else if (WALK_ACTIONS.has(c.action)) {
            // walking: subtle hop bounce
            model.position.y = Math.abs(Math.sin(now / 180 + id * 2)) * 0.05
            model.scale.setScalar(1.4)
          } else {
            // idle sway (unchanged)
            model.position.y = Math.sin(now / 300 + id) * 0.05
            model.scale.setScalar(1.4)
          }
        }
      }
      v.label.position.y = 2.4 + (c.sleeping ? 0.4 : 0)
      v.label.visible = this.showNames && c.alive
    }

    // shadow beasts (dark tinted creatures)
    this.syncBeasts()

    // mentor float
    if (this.mentor) {
      this.mentor.position.y = 2.4 + Math.sin(now / 700) * 0.25
      this.mentor.rotation.y += dt * 0.6
    }

    // pickup float + spin animation
    for (const p of this.pickups) {
      const baseY = (p.userData.baseY as number | undefined) ?? p.position.y
      const phase = (p.userData.phase as number | undefined) ?? 0
      p.position.y = baseY + Math.sin(now / 600 + phase) * 0.1
      p.rotation.y += dt * 0.8
    }

    this.fps.update(dt)
    // keep player in sync with sim
    this.game.player.pos.x = this.fps.position.x
    this.game.player.pos.z = this.fps.position.z

    // occasional creature vocalization → sound
    if (this.sound && Math.random() < 0.002) {
      const c = this.game.creatures.find((x) => x.alive)
      if (c) this.sound.voice(c.traits.voicePitch, 'neutral')
    }

    this.world3d.shimmer(now / 1000)

    // butterflies flutter
    const t = now / 1000
    for (const bf of this.butterflies) {
      const u = bf.userData as { base: { x: number; y: number; z: number }; phase: number; speed: number; flap: number }
      u.phase += 0.02
      u.flap = Math.sin(now / 80 + u.phase * 3)
      const ox = Math.sin(u.phase * u.speed) * 3
      const oz = Math.cos(u.phase * u.speed * 0.8) * 3
      const oy = Math.sin(u.phase * u.speed * 0.6) * 0.6
      bf.position.set(u.base.x + ox, u.base.y + oy, u.base.z + oz)
      bf.rotation.y = u.phase * 2
      bf.children.forEach((c) => {
        c.rotation.z = u.flap * 0.8
      })
    }
    void t

    this.renderer.render(this.scene, this.camera)
  }

  private beastModel: THREE.Group | null = null
  private async syncBeasts(): Promise<void> {
    if (!this.beastModel) {
      this.beastModel = await this.assets.creatureModel(3) // Demon base
      this.assets.tint(this.beastModel, 0.02, true)
    }
    const want = this.game.shadowBeasts.length
    while (this.beastViews.length < want) {
      const g = this.beastModel.clone(true)
      g.traverse((o: THREE.Object3D) => {
        if (o instanceof THREE.Mesh) o.castShadow = true
      })
      this.scene.add(g)
      this.beastViews.push({ group: g })
    }
    for (let i = 0; i < this.beastViews.length; i++) {
      const v = this.beastViews[i]
      if (i < want) {
        const b = this.game.shadowBeasts[i]
        v.group.position.set(b.state.pos.x, this.groundY(b.state.pos.x, b.state.pos.z), b.state.pos.z)
        v.group.visible = true
      } else {
        v.group.visible = false
      }
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.onResize)
    this.renderer.domElement.removeEventListener('click', this.onClick)
    this.fps.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
