/**
 * world-view — the game loop.
 *
 * Owns the scene, the player, the clock that drives the simulation, and every
 * interaction that happens in the world rather than in a panel. React sits on
 * top of this and is told what to draw; it never reaches into the scene.
 */
import * as THREE from 'three'
import type { Sim } from '../lab/sim'
import { addItem, countItem, removeItem, type ItemId } from '../lab/inventory'
import { itemName } from '../lab/items'
import { SoundEngine } from '../lab/audio'
import type { SoundSpec } from '../lab/sounds'
import { avgFrameMs, recordFrameTime } from '../lab/lod'
import { Atmosphere } from './atmosphere'
import { Engine, QUALITY } from './engine'
import { buildTerrain, Water } from './ground'
import { buildVillage, makeKit, mergeByMaterial, type Kit, type Lamp } from './architecture'
import { loadPropGeometries } from './assets'
import { ScatterView } from './scatter-view'
import { LumaView } from './luma'
import { Fx } from './fx'
import { ViewModel } from './viewmodel'
import { PlayerController } from '../game/controller'
import { CollisionGrid, PROP_SOLIDITY } from '../game/collision'
import { Input } from '../game/input'
import {
  GAZE_RANGE, pickGaze, pickTarget, promptFor, type Target,
} from '../game/targeting'
import { effortFor, harvestNode, HARVEST } from '../game/gather'
import {
  addJournal, meet, placeProp, removeProp, PLACEABLE_COST, PLACEABLE_LABEL,
  type PlaceableKind, type PlayerProgress,
} from '../game/progress'
import { landmarkNear, type Landmark } from '../world/lore'
import { worldScatter } from '../world/scatter'
import { heightAt, regionAt, WATER_LEVEL } from '../world/terrain'
import type { QualityPreset } from '../lab/settings'
import type { TowerId } from '../lab/world'

export interface HudGaze {
  id: number
  name: string
  action: string
  job: string | null
  mood: string
  health: number
}

export interface HudSnapshot {
  time: string
  phase: string
  day: number
  region: string | null
  prompt: string | null
  promptKey: string
  hold: number
  gaze: HudGaze | null
  health: number
  hunger: number
  swimming: boolean
  underwater: boolean
  population: number
  fps: number
  frameMs: number
  simMs: number
  draws: number
  triangles: number
  locked: boolean
}

export type ToastKind = 'info' | 'good' | 'bad' | 'story'

export interface WorldCallbacks {
  onHud: (s: HudSnapshot) => void
  onToast: (text: string, kind: ToastKind) => void
  onTalk: (creatureId: number) => void
  onDiscover: (l: Landmark) => void
  onRegion: (name: string) => void
  onLoadProgress: (fraction: number, label: string) => void
  onGave: (creatureId: number, item: ItemId) => void
  onGathered: (item: ItemId, amount: number) => void
  onPointerLock: (locked: boolean) => void
  onShop: (tower: TowerId) => void
}

const STEP_SOUNDS: Record<string, SoundSpec> = {
  grass: { type: 'noise', freq: 380, freqEnd: 220, duration: 0.09, gain: 0.05 },
  meadow: { type: 'noise', freq: 400, freqEnd: 240, duration: 0.09, gain: 0.05 },
  forest: { type: 'noise', freq: 300, freqEnd: 180, duration: 0.11, gain: 0.055 },
  road: { type: 'noise', freq: 620, freqEnd: 300, duration: 0.07, gain: 0.06 },
  rock: { type: 'noise', freq: 720, freqEnd: 360, duration: 0.07, gain: 0.06 },
  sand: { type: 'noise', freq: 260, freqEnd: 150, duration: 0.12, gain: 0.05 },
  snow: { type: 'noise', freq: 480, freqEnd: 200, duration: 0.13, gain: 0.045 },
  farm: { type: 'noise', freq: 320, freqEnd: 190, duration: 0.1, gain: 0.05 },
  marsh: { type: 'noise', freq: 240, freqEnd: 140, duration: 0.16, gain: 0.06 },
  water: { type: 'noise', freq: 200, freqEnd: 420, duration: 0.2, gain: 0.08 },
}

const SFX = {
  gather: { type: 'triangle', freq: 620, freqEnd: 880, duration: 0.14, gain: 0.11 } as SoundSpec,
  chop: { type: 'noise', freq: 260, freqEnd: 120, duration: 0.14, gain: 0.12 } as SoundSpec,
  place: { type: 'square', freq: 300, freqEnd: 460, duration: 0.1, gain: 0.09 } as SoundSpec,
  pickup: { type: 'sine', freq: 880, freqEnd: 1320, duration: 0.12, gain: 0.1 } as SoundSpec,
  jump: { type: 'sine', freq: 420, freqEnd: 620, duration: 0.09, gain: 0.06 } as SoundSpec,
  land: { type: 'noise', freq: 220, freqEnd: 90, duration: 0.14, gain: 0.09 } as SoundSpec,
  splash: { type: 'noise', freq: 500, freqEnd: 180, duration: 0.3, gain: 0.13 } as SoundSpec,
  discover: { type: 'sine', freq: 520, freqEnd: 1040, duration: 0.5, gain: 0.14 } as SoundSpec,
  deny: { type: 'square', freq: 200, freqEnd: 150, duration: 0.12, gain: 0.07 } as SoundSpec,
}

/** The item a placeable maps back to, for pick-ups. */
const PLACEABLE_FROM_ITEM: Partial<Record<ItemId, PlaceableKind>> = {
  lantern: 'lantern',
  timber: 'fence',
  stone: 'marker',
}

export class WorldView {
  readonly engine: Engine
  readonly sound = new SoundEngine()
  private atmosphere: Atmosphere
  private water = new Water()
  private kit: Kit = makeKit()
  private scatterView: ScatterView | null = null
  private luma = new LumaView()
  private fx = new Fx()
  private viewmodel: ViewModel
  private controller: PlayerController
  readonly input: Input

  private sim: Sim
  private progress: PlayerProgress
  private callbacks: WorldCallbacks
  private container: HTMLElement

  private raf = 0
  private lastTime = 0
  private elapsed = 0
  private simAccum = 0
  private speed = 1
  private paused = false
  private hudAccum = 0
  private fps = 60
  private frameMs = 16
  private simMs = 0

  private target: Target | null = null
  private gazeId: number | null = null
  private holdFor = 0
  private holdElapsed = 0
  private regionId: string | null = null
  private lastLampSync = -99

  private glowMeshes: THREE.Mesh[] = []
  private lampPositions: Lamp[] = []
  private lampLights: THREE.PointLight[] = []
  private solids: CollisionGrid | null = null
  private placedGroup = new THREE.Group()
  private placedMeshes = new Map<string, THREE.Object3D>()
  private graveGroup = new THREE.Group()
  private graveCount = 0
  private dropGroup = new THREE.Group()
  private dropPool: THREE.Mesh[] = []
  private baseFov = 74
  private ready = false

  selectedId: number | null = null

  constructor(container: HTMLElement, sim: Sim, progress: PlayerProgress, callbacks: WorldCallbacks) {
    this.container = container
    this.sim = sim
    this.progress = progress
    this.callbacks = callbacks

    this.engine = new Engine(container, sim.settings.quality)
    this.atmosphere = new Atmosphere(this.engine.scene)
    this.controller = new PlayerController(sim.player.pos.x, sim.player.pos.z)
    this.viewmodel = new ViewModel(this.engine.camera)
    this.engine.scene.add(this.engine.camera)
    this.input = new Input(this.engine.canvas)
    this.input.onLockChange = (locked) => this.callbacks.onPointerLock(locked)

    this.engine.scene.add(this.water.mesh)
    this.engine.scene.add(this.luma.group)
    this.engine.scene.add(this.fx.group)
    this.engine.scene.add(this.placedGroup)
    this.engine.scene.add(this.graveGroup)
    this.engine.scene.add(this.dropGroup)

    this.controller.onFootstep = (surface, running) => {
      const spec = STEP_SOUNDS[surface] ?? STEP_SOUNDS.grass
      this.sound.playSpec({ ...spec, gain: spec.gain * (running ? 1.4 : 1) })
    }
    this.controller.onLand = (force) => {
      this.sound.playSpec({ ...SFX.land, gain: SFX.land.gain * force })
    }

    window.addEventListener('resize', this.handleResize)
    this.handleResize()
  }

  /** Build the valley. Reports progress so the loading screen can be honest. */
  async load(): Promise<void> {
    this.callbacks.onLoadProgress(0.05, 'shaping the valley')
    const terrain = buildTerrain()
    this.engine.scene.add(terrain.mesh)
    await frameBreak()

    this.callbacks.onLoadProgress(0.18, 'raising Haven')
    const village = buildVillage(this.kit)
    const keep = new Set<THREE.Object3D>(village.glow)
    const merged = mergeByMaterial(village.group, keep)
    this.engine.scene.add(merged)
    this.glowMeshes = []
    merged.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh && mesh.material === this.kit.glow) this.glowMeshes.push(mesh)
    })
    this.lampPositions = village.lamps
    this.solids = new CollisionGrid()
    for (const c of village.colliders) {
      this.solids.add({ x: c.x, z: c.z, r: c.r, height: c.height ?? 6, kind: c.kind })
    }
    this.controller.setWorld(this.solids)
    await frameBreak()

    this.callbacks.onLoadProgress(0.3, 'planting the woods')
    const geo = await loadPropGeometries((done, total) => {
      this.callbacks.onLoadProgress(0.3 + (done / total) * 0.5, 'planting the woods')
    })
    await frameBreak()

    this.callbacks.onLoadProgress(0.84, 'scattering the valley')
    const scatter = worldScatter()
    // trunks and boulders are solid; undergrowth is not
    for (const p of scatter.props) {
      const solid = PROP_SOLIDITY[p.kind]
      if (solid) this.solids?.add({ x: p.x, z: p.z, r: solid.r * p.scale, height: solid.height, kind: p.kind })
    }
    for (const n of scatter.nodes) {
      const solid = PROP_SOLIDITY[n.prop]
      if (solid) this.solids?.add({ x: n.x, z: n.z, r: solid.r * n.scale, height: solid.height, kind: n.prop })
    }
    this.scatterView = new ScatterView(scatter, geo)
    this.scatterView.setDrawDistance(this.engine.quality.propDistance)
    this.engine.scene.add(this.scatterView.group)
    await frameBreak()

    this.callbacks.onLoadProgress(0.95, 'lighting the lamps')
    for (let i = 0; i < 6; i++) {
      const light = new THREE.PointLight(0xffb14a, 0, 22, 1.6)
      light.castShadow = false
      this.lampLights.push(light)
      this.engine.scene.add(light)
    }
    this.syncPlaced()

    // stand the player where the save left them, looking into the settlement
    this.controller.teleport(this.sim.player.pos.x, this.sim.player.pos.z)
    this.controller.lookTowards(0, 0)
    this.ready = true
    this.callbacks.onLoadProgress(1, 'ready')
  }

  start(): void {
    if (this.raf) return
    this.lastTime = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    window.removeEventListener('resize', this.handleResize)
    this.input.dispose()
    this.luma.dispose()
    this.scatterView?.dispose()
    this.engine.dispose()
  }

  // ------------------------------------------------------------- controls

  setPaused(p: boolean): void {
    this.paused = p
  }

  setSpeed(s: number): void {
    this.speed = s
  }

  setQuality(q: QualityPreset): void {
    this.engine.setQuality(q)
    const profile = QUALITY[q] ?? QUALITY.medium
    this.atmosphere.setShadowDistance(profile.shadowDistance)
    this.atmosphere.setShadowMapSize(profile.shadowMapSize)
    this.atmosphere.sun.castShadow = profile.shadows
    this.scatterView?.setDrawDistance(profile.propDistance)
    this.scatterView?.setSmallShadows(profile.smallShadows ?? false)
    this.handleResize()
  }

  setUiCaptured(captured: boolean): void {
    this.input.uiCaptured = captured
    if (captured) this.input.exitLock()
  }

  requestLock(): void {
    this.sound.unlock()
    this.input.requestLock()
  }

  get pointerLocked(): boolean {
    return this.input.locked
  }

  /** Where the player is, for the map. */
  playerPosition(): { x: number; z: number; yaw: number } {
    return { x: this.controller.position.x, z: this.controller.position.z, yaw: this.controller.yaw }
  }

  teleport(x: number, z: number): void {
    this.controller.teleport(x, z)
  }

  /** Point the camera somewhere. Used by the screenshot harness. */
  lookAt(x: number, z: number, pitch = -0.05): void {
    this.controller.lookTowards(x, z)
    this.controller.pitch = pitch
  }

  /** Aim exactly at a point in space, height included. */
  aimAt(x: number, y: number, z: number): void {
    const eye = this.controller.eyePosition(new THREE.Vector3())
    const dx = x - eye.x
    const dy = y - eye.y
    const dz = z - eye.z
    this.controller.yaw = Math.atan2(-dx, -dz)
    this.controller.pitch = Math.atan2(dy, Math.hypot(dx, dz))
  }

  private handleResize = (): void => {
    const rect = this.container.getBoundingClientRect()
    this.engine.resize(rect.width, rect.height)
  }

  // ------------------------------------------------------------- the loop

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame)
    const dt = Math.min(0.1, (now - this.lastTime) / 1000)
    this.lastTime = now
    if (!this.ready) return

    const frameStart = performance.now()
    this.elapsed += dt

    this.stepPlayer(dt)
    this.stepSim(dt)
    this.stepWorld(dt)

    this.engine.nightAmount = this.atmosphere.state.night
    this.engine.render()

    this.frameMs = performance.now() - frameStart
    recordFrameTime(this.sim.lod, this.frameMs)
    this.fps += (1 / Math.max(dt, 0.0001) - this.fps) * 0.08

    this.hudAccum += dt
    if (this.hudAccum > 0.1) {
      this.hudAccum = 0
      this.publishHud()
    }
    this.input.endFrame()
  }

  private stepPlayer(dt: number): void {
    const look = this.input.takeLook()
    const forward = (this.input.isDown('forward') ? 1 : 0) - (this.input.isDown('back') ? 1 : 0)
      + this.input.joystick.y
    const strafe = (this.input.isDown('right') ? 1 : 0) - (this.input.isDown('left') ? 1 : 0)
      + this.input.joystick.x

    const wasGrounded = this.controller.onGround
    const wasSwimming = this.controller.swimming

    this.controller.update(dt, {
      forward: THREE.MathUtils.clamp(forward, -1, 1),
      strafe: THREE.MathUtils.clamp(strafe, -1, 1),
      jump: this.input.isDown('jump'),
      sprint: this.input.isDown('sprint'),
      crouch: this.input.isDown('crouch'),
      lookX: look.x,
      lookY: look.y,
    })

    if (wasGrounded && !this.controller.onGround && this.input.wasPressed('jump')) {
      this.sound.playSpec(SFX.jump)
    }
    if (!wasSwimming && this.controller.swimming) {
      this.sound.playSpec(SFX.splash)
      this.fx.burst('splash', this.controller.position, 16, 1.4)
    }

    const fov = this.controller.applyTo(this.engine.camera, this.baseFov, dt)
    this.engine.setFov(fov)
    this.viewmodel.update(dt, this.controller.gait, this.elapsed, this.controller.underwater)

    // the simulation only knows about the ground plane
    this.sim.player.pos.x = this.controller.position.x
    this.sim.player.pos.z = this.controller.position.z
    this.sim.player.facing = this.controller.yaw + Math.PI

    this.updateTargeting()
    this.updateHold(dt)

    const region = regionAt(this.controller.position.x, this.controller.position.z)
    if ((region?.id ?? null) !== this.regionId) {
      this.regionId = region?.id ?? null
      if (region) this.callbacks.onRegion(region.name)
    }

    const landmark = landmarkNear(this.controller.position.x, this.controller.position.z)
    if (landmark && !this.progress.discovered.includes(landmark.id)) {
      this.progress.discovered.push(landmark.id)
      addJournal(this.progress, {
        kind: 'landmark', tick: this.sim.time, title: landmark.name, text: landmark.text,
      })
      this.sound.playSpec(SFX.discover)
      this.callbacks.onDiscover(landmark)
    }
  }

  private stepSim(dt: number): void {
    if (this.paused) return
    const hz = this.sim.settings.simHz
    this.simAccum += dt * this.speed
    const step = 1 / hz
    let steps = 0
    const start = performance.now()
    while (this.simAccum >= step && steps < 8) {
      this.simAccum -= step
      steps++
      // The sim resolves bodies including the player's, so a Luma walking into
      // you should push you. But the sim also clamps everything to the
      // settlement's roaming bounds, and applying that to the player pinned
      // them inside the village. Take small shoves, ignore the leash.
      const beforeX = this.sim.player.pos.x
      const beforeZ = this.sim.player.pos.z
      this.sim.tick()
      const dx = this.sim.player.pos.x - beforeX
      const dz = this.sim.player.pos.z - beforeZ
      if (Math.abs(dx) < 1.2 && Math.abs(dz) < 1.2 && (dx || dz)) {
        this.controller.position.x += dx
        this.controller.position.z += dz
      }
      this.sim.player.pos.x = this.controller.position.x
      this.sim.player.pos.z = this.controller.position.z
      this.consumeEvents()
    }
    if (steps) this.simMs = performance.now() - start
  }

  private stepWorld(dt: number): void {
    const camPos = this.engine.camera.position
    const sky = this.atmosphere.update(this.sim.time, camPos, this.elapsed)

    const fogNear = this.engine.scene.fog instanceof THREE.Fog ? this.engine.scene.fog.near : 110
    const fogFar = this.engine.scene.fog instanceof THREE.Fog ? this.engine.scene.fog.far : 620
    this.water.update(this.elapsed, camPos, sky, fogNear, fogFar)

    this.scatterView?.update(this.elapsed, camPos)
    this.scatterView?.refreshNodes(this.progress, this.sim.time)

    this.luma.sync(
      this.sim.creatures, dt, this.elapsed, this.engine.camera,
      { showLabels: this.sim.settings.showLabels },
      this.selectedId, this.gazeId,
    )

    this.fx.update(dt)
    this.updateLamps(sky.lampLight)
    this.syncGraves()
    this.syncDrops()

    // underwater tint, by leaning on the fog
    if (this.controller.underwater && this.engine.scene.fog instanceof THREE.Fog) {
      this.engine.scene.fog.color.set('#183c4e')
      this.engine.scene.fog.near = 0
      this.engine.scene.fog.far = 34
    }
  }

  private updateLamps(amount: number): void {
    this.kit.glow.emissiveIntensity = Math.max(amount * 2.4, 0.5)
    if (this.elapsed - this.lastLampSync < 0.5) return
    this.lastLampSync = this.elapsed
    const cam = this.engine.camera.position
    // Indoor lamps burn by day as well: a room with a roof on it is dark at
    // noon and the sun is not going to help.
    const near = this.lampPositions
      .map((l) => ({ l, d: l.pos.distanceToSquared(cam) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.lampLights.length)
    this.lampLights.forEach((light, i) => {
      const entry = near[i]
      if (!entry || entry.d > 60 * 60) {
        light.intensity = 0
        light.userData.base = 0
        return
      }
      light.position.copy(entry.l.pos)
      const level = entry.l.indoor ? Math.max(0.75, amount) : amount
      light.userData.base = entry.l.indoor ? 20 : 16
      light.intensity = light.userData.base * level
    })
  }

  // ------------------------------------------------------------- targeting

  private updateTargeting(): void {
    const eye = this.controller.eyePosition(new THREE.Vector3())
    const dir = this.controller.forwardVector(new THREE.Vector3())
    const nodes = this.scatterView ? worldScatter().nodes : []

    this.target = pickTarget({
      sim: this.sim,
      progress: this.progress,
      nodes,
      eye,
      dir,
      tick: this.sim.time,
      holding: null,
    })
    this.gazeId = pickGaze(this.sim, eye, dir)

    if (this.target?.kind !== 'node') {
      this.holdElapsed = 0
      this.holdFor = 0
    }
    this.viewmodel.setWorking(this.holdFor > 0 ? Math.min(1, this.holdElapsed / this.holdFor) : 0)
  }

  private updateHold(dt: number): void {
    const target = this.target
    if (!target || target.kind !== 'node') return
    const holding = this.input.isDown('interact') || this.input.primary
    if (!holding) {
      this.holdElapsed = Math.max(0, this.holdElapsed - dt * 2)
      return
    }
    this.holdFor = effortFor(target.node.kind, (id) => countItem(this.sim.player.inventory, id) > 0)
    this.holdElapsed += dt
    if (this.holdElapsed >= this.holdFor) {
      this.holdElapsed = 0
      this.completeHarvest(target)
    } else if (Math.random() < dt * 9) {
      const spec = target.node.kind === 'wood' || target.node.kind === 'stone' ? SFX.chop : SFX.gather
      this.sound.playSpec({ ...spec, gain: spec.gain * 0.5 })
      this.fx.burst(target.node.kind === 'stone' ? 'chip' : 'leaf', target.point, 2, 0.6)
    }
  }

  private completeHarvest(target: Extract<Target, { kind: 'node' }>): void {
    const yielded = harvestNode(this.progress, target.node, this.sim.time)
    if (!yielded) return
    const added = addItem(this.sim.player.inventory, yielded.item, yielded.amount, 0)
    if (added <= 0) {
      this.callbacks.onToast('Your pack is full.', 'bad')
      this.sound.playSpec(SFX.deny)
      return
    }
    const rule = HARVEST[target.node.kind]
    this.sound.playSpec(SFX.gather)
    this.fx.burst(target.node.kind === 'stone' ? 'chip' : 'leaf', target.point, 12, 1.1)
    this.fx.float(`+${added} ${itemName(yielded.item)}`, target.point.clone().add(new THREE.Vector3(0, 0.7, 0)))
    this.scatterView?.refreshNodes(this.progress, this.sim.time, true)
    this.callbacks.onGathered(yielded.item, added)
    void rule
  }

  // ------------------------------------------------------------- actions

  /** The context action, bound to E. */
  interact(): void {
    const target = this.target
    if (!target) return
    if (target.kind !== 'node') this.viewmodel.swing()
    switch (target.kind) {
      case 'creature': {
        const c = this.sim.creatureById(target.id)
        if (!c) return
        this.selectedId = c.id
        this.sim.talkingWith = c.id
        this.sim.playerSocialize()
        if (meet(this.progress, c.id)) {
          addJournal(this.progress, {
            kind: 'first', tick: this.sim.time, title: `Met ${c.name}`,
            text: `${c.name}, ${c.stage}${c.job ? `, works as ${c.job}` : ''}.`,
          })
        }
        this.callbacks.onTalk(c.id)
        break
      }
      case 'fixture': {
        if (target.fixture.kind === 'counter') {
          this.callbacks.onShop(target.fixture.tower)
          break
        }
        const message = this.sim.playerUseFixture(
          target.fixture.kind === 'bed' ? 'rest'
            : target.fixture.kind === 'door' ? 'toggle' : 'take',
        )
        if (message) this.callbacks.onToast(message, 'info')
        this.sound.playSpec(SFX.place)
        break
      }
      case 'drop': {
        this.sim.playerPickUp()
        this.sound.playSpec(SFX.pickup)
        this.fx.burst('coin', target.point, 6)
        break
      }
      case 'placed': {
        const item = PLACEABLE_COST[target.prop.kind]
        if (addItem(this.sim.player.inventory, item, 1, 0) > 0) {
          removeProp(this.progress, target.prop.id)
          this.syncPlaced()
          this.sound.playSpec(SFX.pickup)
          this.callbacks.onToast(`Picked up the ${PLACEABLE_LABEL[target.prop.kind]}.`, 'info')
        }
        break
      }
      case 'water': {
        if (addItem(this.sim.player.inventory, 'water', 1, 0) > 0) {
          this.fx.burst('splash', target.point, 8, 0.8)
          this.sound.playSpec(SFX.pickup)
          this.callbacks.onToast('Filled a flask.', 'good')
        } else {
          this.callbacks.onToast('Nothing to carry it in.', 'bad')
        }
        break
      }
      case 'node':
        // handled by the hold
        break
      case 'landmark':
        break
    }
  }

  /** What is in the player's hand, for the viewmodel. */
  setHeld(item: ItemId | null): void {
    this.viewmodel.setItem(item)
  }

  /** Left click: give what you are holding, or use it on yourself. */
  useHeld(item: ItemId | null): void {
    this.viewmodel.swing()
    if (!item) return
    if (countItem(this.sim.player.inventory, item) <= 0) return
    const target = this.target
    if (target && target.kind === 'creature') {
      const result = this.sim.playerGive(item, target.id)
      if (result) {
        this.callbacks.onToast(result, 'good')
        this.fx.burst('heart', target.point, 8)
        this.callbacks.onGave(target.id, item)
      } else {
        this.callbacks.onToast('They would not take it.', 'bad')
        this.sound.playSpec(SFX.deny)
      }
      return
    }
    this.sim.playerUseItem(item)
    this.sound.playSpec(SFX.gather)
    this.fx.float(itemName(item), this.controller.position.clone().add(new THREE.Vector3(0, 1.6, 0)), '#cfe3f2')
  }

  /** Right click: set the held thing down in the world. */
  place(item: ItemId | null): void {
    if (!item) return
    const kind = PLACEABLE_FROM_ITEM[item]
    if (!kind) {
      this.callbacks.onToast(`You cannot set ${itemName(item)} down as anything.`, 'bad')
      this.sound.playSpec(SFX.deny)
      return
    }
    if (countItem(this.sim.player.inventory, item) <= 0) return

    const dir = this.controller.forwardVector(new THREE.Vector3())
    const x = this.controller.position.x + dir.x * 2.2
    const z = this.controller.position.z + dir.z * 2.2
    const y = heightAt(x, z)
    if (y < WATER_LEVEL) {
      this.callbacks.onToast('Not in the water.', 'bad')
      return
    }
    removeItem(this.sim.player.inventory, item, 1)
    placeProp(this.progress, kind, x, y, z, this.controller.yaw, this.sim.time)
    this.syncPlaced()
    this.sound.playSpec(SFX.place)
    this.fx.burst('dust', new THREE.Vector3(x, y, z), 8, 0.7)
    this.callbacks.onToast(`Set down a ${PLACEABLE_LABEL[kind]}.`, 'good')
  }

  dropHeld(item: ItemId | null): void {
    if (!item) return
    if (this.sim.playerDrop(item)) {
      this.sound.playSpec(SFX.place)
    }
  }

  // ------------------------------------------------------------- scenery

  private syncPlaced(): void {
    const live = new Set(this.progress.placed.map((p) => p.id))
    for (const [id, obj] of this.placedMeshes) {
      if (live.has(id)) continue
      this.placedGroup.remove(obj)
      this.placedMeshes.delete(id)
    }
    for (const p of this.progress.placed) {
      if (this.placedMeshes.has(p.id)) continue
      const obj = this.makePlaced(p.kind, p)
      obj.position.set(p.x, p.y, p.z)
      obj.rotation.y = p.rot
      this.placedGroup.add(obj)
      this.placedMeshes.set(p.id, obj)
    }
  }

  private makePlaced(kind: PlaceableKind, at: { x: number; y: number; z: number }): THREE.Object3D {
    const g = new THREE.Group()
    if (kind === 'lantern') {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 0.12), this.kit.darkTimber)
      post.position.y = 0.75
      post.castShadow = true
      g.add(post)
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3), this.kit.glow)
      lamp.position.y = 1.6
      g.add(lamp)
      this.glowMeshes.push(lamp)
      this.lampPositions.push({ pos: new THREE.Vector3(at.x, at.y + 1.6, at.z), indoor: false })
    } else if (kind === 'fence') {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.1, 0.16), this.kit.timber)
      post.position.y = 0.55
      post.castShadow = true
      g.add(post)
      for (const y of [0.4, 0.8]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.11, 0.09), this.kit.timber)
        rail.position.set(0.9, y, 0)
        rail.castShadow = true
        g.add(rail)
      }
    } else {
      let y = 0
      for (let i = 0; i < 5; i++) {
        const r = 0.32 * (1 - i / 7)
        const stone = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, 0.18, 6), this.kit.stone)
        stone.position.set((Math.random() - 0.5) * 0.08, y + 0.09, (Math.random() - 0.5) * 0.08)
        stone.castShadow = true
        g.add(stone)
        y += 0.16
      }
    }
    return g
  }

  private syncGraves(): void {
    if (this.sim.graves.length === this.graveCount) return
    this.graveCount = this.sim.graves.length
    this.graveGroup.clear()
    for (const grave of this.sim.graves) {
      const g = new THREE.Group()
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.18), this.kit.paleStone)
      slab.position.y = 0.5
      slab.rotation.z = (Math.random() - 0.5) * 0.12
      slab.castShadow = true
      g.add(slab)
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 0.5), this.kit.stone)
      base.position.y = 0.08
      g.add(base)
      g.position.set(grave.x, heightAt(grave.x, grave.z), grave.z)
      g.rotation.y = Math.random() * 0.4 - 0.2
      this.graveGroup.add(g)
    }
  }

  private syncDrops(): void {
    while (this.dropPool.length < this.sim.drops.length) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.3, 0.3),
        new THREE.MeshLambertMaterial({ color: '#c98a3d', flatShading: true }),
      )
      mesh.castShadow = true
      this.dropPool.push(mesh)
      this.dropGroup.add(mesh)
    }
    this.dropPool.forEach((mesh, i) => {
      const drop = this.sim.drops[i]
      if (!drop) {
        mesh.visible = false
        return
      }
      mesh.visible = true
      const bounce = Math.sin(this.elapsed * 2.4 + i) * 0.06
      mesh.position.set(drop.x, heightAt(drop.x, drop.z) + 0.25 + bounce, drop.z)
      mesh.rotation.y = this.elapsed * 0.8 + i
      ;(mesh.material as THREE.MeshLambertMaterial).color.set(drop.kind === 'money' ? '#f2c14e' : '#c98a3d')
    })
  }

  private consumeEvents(): void {
    const events = this.sim.events
    if (!events.length) return
    for (const e of events.slice(-6)) {
      const c = this.sim.creatureById(e.aId ?? -1)
      const mood = c
        ? { pleasure: c.chem.pleasure, grief: c.chem.grief, fear: c.chem.fear }
        : { pleasure: 0.5, grief: 0, fear: 0 }
      const dist = Math.hypot(e.x - this.controller.position.x, e.z - this.controller.position.z)
      if (dist > 40) continue
      const volume = Math.max(0.1, 1 - dist / 40)
      this.sound.playEvent(e.type, mood, volume)
      if (!this.sim.settings.showParticles) continue
      const at = new THREE.Vector3(e.x, heightAt(e.x, e.z) + 1.2, e.z)
      switch (e.type) {
        case 'love': this.fx.burst('heart', at, 6); break
        case 'birth': this.fx.burst('heart', at, 12); break
        case 'fight': this.fx.burst('chip', at, 8); break
        case 'steal': this.fx.burst('coin', at, 5); break
        case 'gift': this.fx.burst('coin', at, 6); break
        case 'eat': this.fx.burst('leaf', at, 4, 0.5); break
        case 'work': this.fx.burst('spark', at, 4, 0.5); break
        case 'death': this.fx.burst('note', at, 10); break
        default: break
      }
    }
  }

  // ------------------------------------------------------------- hud

  private publishHud(): void {
    const clock = Atmosphere.clock(this.sim.time)
    const region = regionAt(this.controller.position.x, this.controller.position.z)
    const info = this.engine.renderer.info

    let gaze: HudGaze | null = null
    if (this.gazeId != null) {
      const c = this.sim.creatureById(this.gazeId)
      if (c && c.alive) {
        gaze = {
          id: c.id, name: c.name, action: c.action, job: c.job,
          mood: c.psyche.mood, health: c.chem.health,
        }
      }
    }

    const target = this.target
    this.callbacks.onHud({
      time: clock.time,
      phase: clock.phase,
      day: clock.day,
      region: region?.name ?? null,
      prompt: target ? promptFor(target, null) : null,
      promptKey: target?.kind === 'node' ? 'Hold E' : 'E',
      hold: this.holdFor > 0 ? Math.min(1, this.holdElapsed / this.holdFor) : 0,
      gaze,
      health: this.sim.player.health,
      hunger: this.sim.player.hunger,
      swimming: this.controller.swimming,
      underwater: this.controller.underwater,
      population: this.sim.creatures.filter((c) => c.alive).length,
      fps: this.fps,
      frameMs: avgFrameMs(this.sim.lod),
      simMs: this.simMs,
      draws: info.render.calls,
      triangles: info.render.triangles,
      locked: this.input.locked,
    })
  }

  /** Distance to a creature, for the talk panel's "still in earshot" check. */
  distanceTo(creatureId: number): number {
    const c = this.sim.creatureById(creatureId)
    if (!c) return Infinity
    return Math.hypot(c.pos.x - this.controller.position.x, c.pos.z - this.controller.position.z)
  }

  get gazeTarget(): number | null {
    return this.gazeId
  }

  get currentTarget(): Target | null {
    return this.target
  }

  get gazeRange(): number {
    return GAZE_RANGE
  }
}

function frameBreak(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
