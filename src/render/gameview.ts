import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Game } from '../sim/game'
import type { Creature } from '../sim/creature'
import { buildWorld3D, type World3D } from './world3d'
import { buildCreature3D, buildNameLabel, type Creature3D } from './creature3d'
import type { SoundEngine } from '../audio/sfx'

export interface GameViewCallbacks {
  onSelect: (creatureId: number | null) => void
}

/**
 * GameView — owns the Three.js scene, camera and render loop.
 * The React layer owns UI; this class only renders + input.
 */
export class GameView {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  world3d: World3D
  creatureViews = new Map<number, Creature3D>()
  labels = new Map<number, THREE.Sprite>()
  raycaster = new THREE.Raycaster()
  pointer = new THREE.Vector2()
  selectedId: number | null = null
  private raf = 0
  private lastTime = performance.now()
  private simAccum = 0
  private callbacks: GameViewCallbacks
  private game: Game
  private sound: SoundEngine | null
  private follow = false
  private showNames = true
  /** sim ticks per second (fixed timestep) */
  private static TICK_RATE = 6

  constructor(container: HTMLElement, game: Game, sound: SoundEngine | null, callbacks: GameViewCallbacks) {
    this.game = game
    this.sound = sound
    this.callbacks = callbacks

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    container.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 400)
    this.camera.position.set(16, 14, 20)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 1, 0)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = Math.PI / 2.05
    this.controls.minDistance = 4
    this.controls.maxDistance = 60

    this.world3d = buildWorld3D(game.world)
    this.scene.add(this.world3d.group)
    this.scene.fog = new THREE.Fog(0xaee1f5, 40, 110)

    for (const c of game.creatures) {
      this.addCreature(c)
    }
    // frame the first alive creature so the player sees life immediately
    const first = game.creatures.find((c) => c.alive) ?? game.creatures[0]
    if (first) {
      this.controls.target.set(first.pos.x, 1, first.pos.z)
      this.camera.position.set(first.pos.x + 12, 10, first.pos.z + 15)
    }

    // interaction
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove)

    window.addEventListener('resize', this.onResize)

    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
  }

  private addCreature(c: Creature): void {
    const view = buildCreature3D(c)
    view.group.position.set(c.pos.x, this.groundY(c.pos.x, c.pos.z), c.pos.z)
    this.scene.add(view.group)
    this.creatureViews.set(c.id, view)
    const label = buildNameLabel(c.name)
    label.position.set(c.pos.x, 2.2, c.pos.z)
    label.visible = this.showNames
    this.scene.add(label)
    this.labels.set(c.id, label)
  }

  syncCreatures(): void {
    // add newly born creatures
    for (const c of this.game.creatures) {
      if (!this.creatureViews.has(c.id)) this.addCreature(c)
    }
    // remove? keep dead as graves
    for (const [id, view] of this.creatureViews) {
      const c = this.game.selectedCreature(id)
      if (!c) {
        this.scene.remove(view.group)
        const l = this.labels.get(id)
        if (l) this.scene.remove(l)
      }
    }
  }

  private groundY(x: number, z: number): number {
    return this.game.world.height(x, z) * 6 - 2.5 + 0.15
  }

  private onPointerDown = (e: PointerEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const meshes: THREE.Object3D[] = []
    for (const view of this.creatureViews.values()) {
      view.group.traverse((o) => {
        if (o instanceof THREE.Mesh) meshes.push(o)
      })
    }
    const hits = this.raycaster.intersectObjects(meshes, false)
    if (hits.length > 0) {
      const hit = hits[0]
      for (const [id, view] of this.creatureViews) {
        if (view.group === hit.object || view.group.getObjectById(hit.object.id)) {
          this.select(id)
          return
        }
      }
    } else {
      this.select(null)
    }
  }

  private onPointerMove = (e: PointerEvent): void => {
    // cursor affordance
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const meshes: THREE.Object3D[] = []
    for (const view of this.creatureViews.values()) {
      view.group.traverse((o) => {
        if (o instanceof THREE.Mesh) meshes.push(o)
      })
    }
    const hits = this.raycaster.intersectObjects(meshes, false)
    this.renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'default'
  }

  select(id: number | null): void {
    if (this.selectedId === id) return
    if (this.selectedId !== null) {
      this.creatureViews.get(this.selectedId)?.setSelected(false)
    }
    this.selectedId = id
    if (id !== null) {
      this.creatureViews.get(id)?.setSelected(true)
    }
    this.callbacks.onSelect(id)
  }

  setFollow(on: boolean): void {
    this.follow = on
  }

  setShowNames(on: boolean): void {
    this.showNames = on
    for (const [id, label] of this.labels) {
      label.visible = on
      void id
    }
  }

  private onResize = (): void => {
    const w = this.renderer.domElement.parentElement?.clientWidth ?? window.innerWidth
    const h = this.renderer.domElement.parentElement?.clientHeight ?? window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private loop(): void {
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    const dt = Math.min((now - this.lastTime) / 1000, 0.1)
    this.lastTime = now

    // fixed-timestep sim: creatures age at a pace you can bond with
    this.simAccum += dt
    const step = 1 / GameView.TICK_RATE
    let guard = 0
    while (this.simAccum >= step && guard < 5) {
      this.game.tick()
      this.simAccum -= step
      guard++
    }
    this.world3d.update(this.game.world.state.dayTime)
    this.syncCreatures()

    // creature transforms
    for (const [id, view] of this.creatureViews) {
      const c = this.game.selectedCreature(id)
      if (!c) continue
      const gy = this.groundY(c.pos.x, c.pos.z)
      view.group.position.x = c.pos.x
      view.group.position.z = c.pos.z
      view.group.position.y = gy
      view.update(dt, now / 1000)
      const label = this.labels.get(id)
      if (label) {
        label.position.x = c.pos.x
        label.position.z = c.pos.z
        label.position.y = gy + 2.1
        label.visible = this.showNames && c.alive
      }
    }

    // camera follow
    if (this.follow && this.selectedId !== null) {
      const c = this.game.selectedCreature(this.selectedId)
      if (c) {
        const target = new THREE.Vector3(c.pos.x, 1.2, c.pos.z)
        this.controls.target.lerp(target, 0.06)
      }
    }

    // occasional creature vocalization → sound
    if (this.sound && Math.random() < 0.004) {
      const c = this.game.creatures.find((x) => x.alive && Math.random() < 0.5)
      if (c) this.sound.voice(c.traits.voicePitch, c.chem.pleasure > 0.5 ? 'happy' : 'neutral')
    }

    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.onResize)
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove)
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
