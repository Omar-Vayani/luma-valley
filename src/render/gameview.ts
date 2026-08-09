import * as THREE from 'three'
import type { Game } from '../sim/game'
import type { Creature } from '../sim/creature'
import type { CityPlaceId } from '../sim/city'
import { CITY_WALL_BOUND } from '../sim/city-layout'
import { buildWorld3D, terrainY, type World3D } from './world3d'
import { buildCreature3D, buildNameLabel, type Creature3D } from './creature3d'
import { buildCityStructures, cityPlaceById } from './structures'
import { FPSControls } from './fps'
import type { SoundEngine } from '../audio/sfx'
import { pickFocusTarget, type FocusCandidate, type FocusTarget } from './focus'

export type InteractKind = 'creature' | 'berry' | 'wood' | 'shrine' | 'den' | 'pickup' | 'place'

export interface InteractEvent {
  kind: InteractKind
  creatureId?: number
  itemId?: string
  placeId?: CityPlaceId
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
  ring: THREE.Mesh
  rig: Creature3D
  shadow?: THREE.Mesh
}

const WALK_ACTIONS = new Set(['wander', 'toFood', 'toWater', 'toPlace', 'social', 'flee'])

export class GameView {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  fps: FPSControls
  world3d: World3D
  creatureViews = new Map<number, CreatureView>()
  beastViews: { group: THREE.Group }[] = []
  mentorGroup = new THREE.Group()
  shrineGroup = new THREE.Group()
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
  private paused = false
  private placeTargets: THREE.Object3D[] = []
  private static TICK_RATE = 6

  constructor(container: HTMLElement, game: Game, sound: SoundEngine | null, callbacks: GameViewCallbacks) {
    this.game = game
    this.sound = sound
    this.callbacks = callbacks
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.setClearColor(0x343535)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    container.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(0x4b4b48, 48, 125)
    this.camera = new THREE.PerspectiveCamera(68, container.clientWidth / container.clientHeight, 0.1, 250)
    this.world3d = buildWorld3D(game.world)
    this.scene.add(this.world3d.group)

    const first = game.creatures.find((c) => c.alive) ?? game.creatures[0]
    const spawn = { ...game.player.pos }
    this.fps = new FPSControls(this.camera, this.renderer.domElement, game.world, spawn, (x, z) => terrainY(game.world, x, z))
    if (first) {
      this.fps.yaw = Math.atan2(first.pos.x - spawn.x, first.pos.z - spawn.z)
      this.fps.pitch = -0.18
      this.fps.update(0)
    }
    this.fps.onLockChange = (locked) => callbacks.onLockChange(locked)
    this.fps.onWheel = () => undefined

    this.torchLight = new THREE.PointLight(0xff9a3c, 0, 18, 2)
    this.torchLight.position.set(.5, -.2, -.6)
    this.camera.add(this.torchLight)
    this.scene.add(this.camera, this.mentorGroup, this.shrineGroup)
    this.buildCity()
    for (const creature of game.creatures) this.addCreature(creature)

    this.renderer.domElement.style.touchAction = 'none'
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.addEventListener('click', this.onClick)
    window.addEventListener('resize', this.onResize)
    window.addEventListener('keydown', this.onInteractKey)
    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
    ;(window as unknown as Record<string, unknown>).__luma = { view: this }
  }

  private buildCity(): void {
    const city = buildCityStructures()
    this.scene.add(city.group)
    this.placeTargets = city.interactionMeshes
    // Render geometry and collision now share the same wall footprints.
    this.game.world.clearColliders()
    for (const wall of city.colliders) this.game.world.addBoxCollider(wall.x, wall.z, wall.hx, wall.hz)
    this.game.world.addBoxCollider(0, -CITY_WALL_BOUND, CITY_WALL_BOUND, 1)
    this.game.world.addBoxCollider(0, CITY_WALL_BOUND, CITY_WALL_BOUND, 1)
    this.game.world.addBoxCollider(-CITY_WALL_BOUND, 0, 1, CITY_WALL_BOUND)
    this.game.world.addBoxCollider(CITY_WALL_BOUND, 0, 1, CITY_WALL_BOUND)
  }

  private addCreature(creature: Creature): void {
    const holder = new THREE.Group()
    holder.position.set(creature.pos.x, this.groundY(creature.pos.x, creature.pos.z), creature.pos.z)
    const rig = buildCreature3D(creature)
    rig.group.scale.setScalar(1)
    rig.group.position.y = creature.traits.size * 1.35
    holder.add(rig.group)
    holder.userData.model = rig.group
    const label = buildNameLabel(creature.name)
    label.position.y = 3.25
    holder.add(label)
    const ring = new THREE.Mesh(new THREE.RingGeometry(.8, 1.02, 28), new THREE.MeshBasicMaterial({ color: 0xffc45e, transparent: true, opacity: .95, side: THREE.DoubleSide, depthWrite: false }))
    ring.rotation.x = -Math.PI / 2
    ring.position.y = .03
    ring.visible = false
    holder.add(ring)
    const shadow = this.createContactShadow()
    shadow.position.set(creature.pos.x, .015, creature.pos.z)
    this.scene.add(holder, shadow)
    this.creatureViews.set(creature.id, { group: holder, label, ring, rig, shadow })
  }

  private createContactShadow(): THREE.Mesh {
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(.7, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .38, depthWrite: false }))
    shadow.rotation.x = -Math.PI / 2
    shadow.renderOrder = 1
    return shadow
  }

  private groundY(x: number, z: number): number { return terrainY(this.game.world, x, z) }

  private onClick = (): void => { this.interact() }

  private onInteractKey = (event: KeyboardEvent): void => {
    const target = event.target instanceof Element ? event.target : null
    const active = document.activeElement instanceof Element ? document.activeElement : null
    const isEditing = (element: Element | null): boolean => !!element?.closest('input, textarea, select, button, [contenteditable="true"]')
    if (document.querySelector('.overlay') || isEditing(target) || isEditing(active)) return
    if (event.code === 'KeyF' && !event.repeat) this.interact()
  }

  private interactionTargets(): THREE.Object3D[] {
    const targets = [...this.placeTargets]
    for (const view of this.creatureViews.values()) view.rig.group.traverse((object) => { if (object instanceof THREE.Mesh) targets.push(object) })
    return targets
  }

  private aimedHit(): THREE.Intersection | null {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera)
    const hit = this.raycaster.intersectObjects(this.interactionTargets(), false)[0]
    return hit && hit.distance <= 10 ? hit : null
  }

  currentFocus(): FocusTarget | null {
    const candidates: FocusCandidate[] = []
    for (const creature of this.game.creatures) {
      if (!creature.alive) continue
      const view = this.creatureViews.get(creature.id)
      if (view) candidates.push({ kind: 'creature', id: creature.id, name: creature.name, x: view.group.position.x, z: view.group.position.z })
    }
    const places = new Map<CityPlaceId, FocusCandidate>()
    for (const object of this.placeTargets) {
      const placeId = object.userData.placeId as CityPlaceId | undefined
      const place = placeId ? cityPlaceById(placeId) : undefined
      if (placeId && place && !places.has(placeId)) places.set(placeId, { kind: 'place', id: placeId, name: place.name, x: object.position.x, z: object.position.z })
    }
    candidates.push(...places.values())

    let aimed: FocusCandidate | null = null
    const hit = this.aimedHit()
    if (hit) {
      const placeId = hit.object.userData.placeId as CityPlaceId | undefined
      if (placeId) aimed = places.get(placeId) ?? null
      if (!aimed) {
        for (const candidate of candidates) {
          if (candidate.kind !== 'creature') continue
          const view = this.creatureViews.get(candidate.id as number)
          if (view?.rig.group.getObjectById(hit.object.id)) { aimed = candidate; break }
        }
      }
    }
    const forward = new THREE.Vector3()
    this.camera.getWorldDirection(forward)
    return pickFocusTarget(this.fps.position, forward, candidates, aimed)
  }

  interactionHint(): string | null {
    const focus = this.currentFocus()
    if (!focus) return null
    if (focus.kind === 'place') {
      const place = cityPlaceById(String(focus.id))
      return place ? `Visit ${place.name} — ${place.purpose}` : `Visit ${focus.name}`
    }
    const creature = this.game.selectedCreature(focus.id as number)
    return `Meet ${creature?.name ?? focus.name} · ${creature?.action ?? 'nearby'}`
  }

  interact(): InteractEvent | null {
    const focus = this.currentFocus()
    if (!focus) return null
    if (focus.kind === 'place') {
      const placeId = focus.id as CityPlaceId
      const event: InteractEvent = { kind: 'place', placeId }
      this.callbacks.onInteract(event)
      return event
    }
    const id = focus.id as number
    this.select(id)
    const event: InteractEvent = { kind: 'creature', creatureId: id }
    this.callbacks.onInteract(event)
    return event
  }

  select(id: number | null): void {
    if (this.selectedId === id) return
    if (this.selectedId !== null) {
      const prior = this.creatureViews.get(this.selectedId)
      if (prior) { prior.ring.visible = false; prior.rig.setSelected(false) }
    }
    this.selectedId = id
    if (id !== null) {
      const next = this.creatureViews.get(id)
      if (next) { next.ring.visible = true; next.rig.setSelected(true) }
    }
    this.callbacks.onSelect(id)
  }

  setShowNames(on: boolean): void {
    this.showNames = on
    for (const view of this.creatureViews.values()) view.label.visible = on
  }

  lightShrine(): void { this.callbacks.onQuestHint('The watch fire burns brighter over the old city.') }

  private onResize = (): void => {
    const width = this.renderer.domElement.parentElement?.clientWidth ?? window.innerWidth
    const height = this.renderer.domElement.parentElement?.clientHeight ?? window.innerHeight
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    if (paused) this.simAccum = 0
  }

  teleport(x: number, z: number): void {
    this.fps.position.set(x, this.groundY(x, z), z)
    this.fps.update(0)
  }

  private loop(): void {
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    const dt = Math.min((now - this.lastTime) / 1000, .1)
    this.lastTime = now
    if (!this.paused) this.simAccum += dt
    const step = 1 / GameView.TICK_RATE
    let guard = 0
    while (!this.paused && this.simAccum >= step && guard++ < 5) { this.game.tick(); this.simAccum -= step }
    this.world3d.update(this.game.world.state.dayTime)
    this.torchLight.intensity = this.game.player.torchLit ? 1.6 : 0

    for (const creature of this.game.creatures) if (!this.creatureViews.has(creature.id)) this.addCreature(creature)
    for (const [id, view] of this.creatureViews) {
      const creature = this.game.selectedCreature(id)
      if (!creature) continue
      const y = this.groundY(creature.pos.x, creature.pos.z)
      const smoothing = 1 - Math.exp(-dt * 9)
      view.group.position.x = THREE.MathUtils.lerp(view.group.position.x, creature.pos.x, smoothing)
      view.group.position.y = y
      view.group.position.z = THREE.MathUtils.lerp(view.group.position.z, creature.pos.z, smoothing)
      if (view.shadow) view.shadow.position.set(view.group.position.x, y + .015, view.group.position.z)
      view.rig.update(dt, now / 1000)
      if (WALK_ACTIONS.has(creature.action)) view.ring.rotation.z += dt
      view.label.position.y = 3.25 + (creature.sleeping ? .2 : 0)
      view.label.visible = this.showNames && creature.alive
    }
    this.syncBeasts()
    this.fps.update(dt)
    this.game.player.pos.x = this.fps.position.x
    this.game.player.pos.z = this.fps.position.z
    if (this.sound && Math.random() < .002) {
      const creature = this.game.creatures.find((item) => item.alive)
      if (creature) this.sound.voice(creature.traits.voicePitch, 'neutral')
    }
    this.renderer.render(this.scene, this.camera)
  }

  private syncBeasts(): void {
    while (this.beastViews.length < this.game.shadowBeasts.length) {
      const group = new THREE.Group()
      const cloak = new THREE.Mesh(new THREE.ConeGeometry(.8, 2.1, 7), new THREE.MeshLambertMaterial({ color: 0x171315 }))
      cloak.position.y = 1.05; cloak.castShadow = true; group.add(cloak); this.scene.add(group); this.beastViews.push({ group })
    }
    for (let i = 0; i < this.beastViews.length; i++) {
      const beast = this.game.shadowBeasts[i]
      this.beastViews[i].group.visible = !!beast
      if (beast) this.beastViews[i].group.position.set(beast.state.pos.x, 0, beast.state.pos.z)
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('keydown', this.onInteractKey)
    this.renderer.domElement.removeEventListener('click', this.onClick)
    this.fps.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
