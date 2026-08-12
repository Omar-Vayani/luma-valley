/**
 * view — the game loop.
 *
 * Owns the scene, the camera, the player and the clock; steps the simulation
 * at a fixed rate independent of the frame rate; and publishes a small
 * snapshot for React to draw the interface from. React never touches the
 * scene graph and the scene graph never touches React state.
 */
import * as THREE from 'three'
import { Engine } from './engine'
import { Sky } from './sky'
import { Water, buildTerrain } from './ground'
import { buildVillageView, type VillageView } from './buildings'
import { LumaView, moodColour } from './luma-view'
import { NatureView, loadPropGeometries, propSolids, scatter } from './nature'
import { QUALITY, type Settings } from './quality'
import { Audio, type SoundName } from '../audio/audio'
import { Input } from '../game/input'
import { PlayerController } from '../game/player'
import { Sim } from '../sim/sim'
import type { Creature } from '../sim/creature'
import { idleUtterance } from '../sim/speech'
import { heightAt } from '../sim/terrain'
import { buildingAt } from '../sim/village'

/** What the crosshair is pointing at. */
export interface Gaze {
  kind: 'none' | 'luma' | 'berries' | 'door'
  /** the Luma being looked at */
  id: number | null
  name: string
  /** the prompt shown under the crosshair */
  prompt: string
  /** close enough to interact */
  inReach: boolean
}

export interface HudSnapshot {
  gaze: Gaze
  berries: number
  /** 0..1 through the day */
  dayPhase: number
  clock: string
  /** the Luma you are talking to, if any */
  talkingTo: number | null
  /** a short list for the sidebar */
  nearby: Array<{ id: number; name: string; mood: string; distance: number; alarm: number }>
  fps: number
}

export interface ViewCallbacks {
  onHud: (hud: HudSnapshot) => void
  onOpenChat: (id: number) => void
  onToast: (text: string) => void
}

const REACH = 4
const GAZE_RANGE = 26
/** Close enough that E means "talk to them" even if you are not quite aimed. */
const NUDGE_RANGE = 2.6

export class WorldView {
  readonly engine: Engine
  readonly input: Input
  readonly player: PlayerController
  readonly audio = new Audio()

  private sim: Sim
  private callbacks: ViewCallbacks
  private settings: Settings

  private sky: Sky
  private water = new Water()
  private terrain: THREE.Mesh | null = null
  private village: VillageView | null = null
  private nature: NatureView | null = null
  private luma = new LumaView()

  private running = false
  private frameHandle = 0
  private lastFrame = 0
  private accumulator = 0
  private hudTimer = 0
  private fps = 60
  private uiCaptured = false

  private gaze: Gaze = { kind: 'none', id: null, name: '', prompt: '', inReach: false }
  private talkingTo: number | null = null
  private pickHeld = 0

  private tmpVec = new THREE.Vector3()
  private tmpVec2 = new THREE.Vector3()

  constructor(container: HTMLElement, sim: Sim, settings: Settings, callbacks: ViewCallbacks) {
    this.sim = sim
    this.settings = settings
    this.callbacks = callbacks

    this.engine = new Engine(container, settings.quality)
    this.sky = new Sky(this.engine.scene, QUALITY[settings.quality].shadowDistance)
    this.engine.scene.add(this.water.mesh)
    this.engine.scene.add(this.luma.group)

    this.player = new PlayerController(sim.player.x, sim.player.z)
    this.input = new Input(this.engine.canvas)
    this.input.setSensitivity(settings.sensitivity)
    this.audio.setVolume(settings.volume)
    this.audio.setHearingRange(settings.hearingRange)

    this.player.onFootstep = (surface): void => {
      this.audio.play('step', this.player.position.x, this.player.position.z, 'player',
        surface === 'water' ? 1 : 0.7)
    }

    window.addEventListener('resize', this.handleResize)
    this.handleResize()
  }

  /** Build the world. Async because the tree models are fetched. */
  async load(): Promise<void> {
    this.terrain = buildTerrain()
    this.engine.scene.add(this.terrain)

    this.village = buildVillageView(this.sim.village)
    this.engine.scene.add(this.village.group)

    const props = scatter(this.sim.seed)
    // the trees the player can bump into join the same grid the walls are in
    this.sim.grid.addAll(propSolids(props))

    const geometries = await loadPropGeometries()
    this.nature = new NatureView(props, geometries, QUALITY[this.settings.quality].groundCover)
    this.engine.scene.add(this.nature.group)

    this.player.setWorld(this.sim.grid)
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.lastFrame = performance.now()
    this.frameHandle = requestAnimationFrame(this.frame)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.frameHandle)
  }

  setPaused(paused: boolean): void {
    if (paused) this.stop()
    else this.start()
  }

  /** A panel has the screen: release the mouse and stop reading the keyboard. */
  setUiCaptured(captured: boolean): void {
    this.uiCaptured = captured
    this.input.uiCaptured = captured
    if (captured) this.input.exitLock()
  }

  setTalkingTo(id: number | null): void {
    this.talkingTo = id
  }

  /** Change just the graphics preset. Used by the playtest and the benchmark. */
  setQuality(quality: Settings['quality']): void {
    this.applySettings({ ...this.settings, quality })
  }

  applySettings(settings: Settings): void {
    const qualityChanged = settings.quality !== this.settings.quality
    this.settings = settings
    this.input.setSensitivity(settings.sensitivity)
    this.audio.setVolume(settings.volume)
    this.audio.setHearingRange(settings.hearingRange)
    if (qualityChanged) {
      const profile = QUALITY[settings.quality]
      this.engine.setQuality(settings.quality)
      this.sky.setShadowDistance(profile.shadowDistance)
      this.sky.setShadowMapSize(profile.shadowMapSize)
    }
  }

  private handleResize = (): void => {
    const parent = this.engine.canvas.parentElement
    const width = parent?.clientWidth || window.innerWidth
    const height = parent?.clientHeight || window.innerHeight
    this.engine.resize(width, height)
  }

  // ---------------------------------------------------------------- the frame

  private frame = (now: number): void => {
    if (!this.running) return
    this.frameHandle = requestAnimationFrame(this.frame)

    const dt = Math.min(0.1, (now - this.lastFrame) / 1000)
    this.lastFrame = now
    if (dt <= 0) return
    this.fps += (1 / dt - this.fps) * 0.08

    this.stepPlayer(dt)
    this.stepSim(dt)
    this.stepWorld(dt, now / 1000)
    this.engine.render()

    this.hudTimer -= dt
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1
      this.publishHud()
    }
    this.input.endFrame()
  }

  private stepPlayer(dt: number): void {
    const look = this.input.takeLook()
    this.player.update(dt, {
      forward: (this.input.isDown('forward') ? 1 : 0) - (this.input.isDown('back') ? 1 : 0),
      strafe: (this.input.isDown('right') ? 1 : 0) - (this.input.isDown('left') ? 1 : 0),
      jump: this.input.isDown('jump'),
      sprint: this.input.isDown('sprint'),
      crouch: this.input.isDown('crouch'),
      lookX: this.uiCaptured ? 0 : look.x,
      lookY: this.uiCaptured ? 0 : look.y,
    })

    // the simulation is told where the player is, and how fast they arrived
    this.sim.player.x = this.player.position.x
    this.sim.player.z = this.player.position.z
    this.sim.player.y = this.player.position.y
    this.sim.player.rushing = this.player.sprinting

    this.audio.setListener(this.player.position.x, this.player.position.z)
    this.updateGaze()
    this.handleActions(dt)
  }

  private stepSim(dt: number): void {
    const step = 1 / 12
    this.accumulator = Math.min(this.accumulator + dt, step * 6)
    while (this.accumulator >= step) {
      this.accumulator -= step
      this.sim.tick(step)
    }
    this.drainEvents()
  }

  private stepWorld(dt: number, now: number): void {
    this.sky.update(this.sim.dayPhase, this.player.position)
    this.engine.nightAmount = this.sky.night
    this.water.update(now)

    this.luma.sync(
      this.sim.creatures, dt, now, this.engine.camera,
      { showNames: this.settings.showNames },
      this.gaze.id, this.talkingTo,
    )

    // windows and fires come up as the light goes down
    if (this.village) {
      const lit = this.sky.night
      for (const pane of this.village.windows) pane.opacity = lit * 0.85
      for (const fire of this.village.fires) {
        const flicker = 0.85 + Math.sin(now * 9 + fire.id) * 0.1 + Math.sin(now * 21) * 0.05
        fire.scale.set(flicker, 0.8 + flicker * 0.4, flicker)
      }
      // berry bushes empty out as they are eaten and fill back in
      for (const place of this.sim.village.places) {
        if (place.kind !== 'food') continue
        const cluster = this.village.berries.get(place.id)
        if (!cluster) continue
        const amount = place.amount ?? 0
        cluster.children.forEach((berry, i) => {
          berry.visible = i / cluster.children.length < amount
        })
      }
    }

    const fov = this.player.applyTo(this.engine.camera, 70, dt)
    this.engine.setFov(fov)

    // a Luma mutters to itself occasionally, which is most of the ambience
    for (const c of this.sim.creatures) {
      if (c.asleep || now - c.saidAt < 9) continue
      const distance = Math.hypot(c.x - this.player.position.x, c.z - this.player.position.z)
      if (distance > 18) continue
      if (Math.random() > dt * 0.05 * c.genome.chatter) continue
      c.said = idleUtterance(c)
      c.saidAt = now
    }
  }

  // ---------------------------------------------------------------- events

  private drainEvents(): void {
    for (const event of this.sim.takeEvents()) {
      this.audio.play(event.type as SoundName, event.x, event.z, event.who, event.strength)
    }
  }

  // ---------------------------------------------------------------- pointing

  private updateGaze(): void {
    const eye = this.player.eyePosition(this.tmpVec)
    const forward = this.player.forwardVector(this.tmpVec2)

    let best: Creature | null = null
    let bestScore = 0.955
    let bestDistance = 0
    for (const c of this.sim.creatures) {
      const dx = c.x - eye.x
      const dz = c.z - eye.z
      const distance = Math.hypot(dx, dz)
      if (distance > GAZE_RANGE) continue
      const dy = heightAt(c.x, c.z) + 0.8 - eye.y
      const length = Math.hypot(dx, dy, dz) || 1
      const dot = (dx * forward.x + dy * forward.y + dz * forward.z) / length
      // A creature fills more of the view the closer it is, so the cone has to
      // widen as it approaches — otherwise standing right next to somebody
      // loses them entirely, which is the moment you are most likely to want
      // to talk to them.
      const threshold = distance < 1.6 ? 0.1 : distance < 4 ? 0.8 : 0.955
      if (dot < threshold) continue
      if (dot > bestScore || best == null) {
        bestScore = dot
        best = c
        bestDistance = distance
      }
    }

    if (!best) {
      // Standing next to somebody and not quite looking at them should still
      // count. Being made to line up a crosshair on a wandering creature is
      // the opposite of a calm afternoon, and it was the single thing that
      // made the game hardest to play.
      let nearest: Creature | null = null
      let nearestDistance = NUDGE_RANGE
      for (const c of this.sim.creatures) {
        const distance = Math.hypot(c.x - eye.x, c.z - eye.z)
        if (distance > nearestDistance) continue
        const facingThem = ((c.x - eye.x) * forward.x + (c.z - eye.z) * forward.z) / (distance || 1)
        if (facingThem < -0.2) continue
        nearest = c
        nearestDistance = distance
      }
      best = nearest
      bestDistance = nearestDistance
    }

    if (best) {
      const scared = best.drives.fear > 0.45
      this.gaze = {
        kind: 'luma',
        id: best.id,
        name: best.name,
        inReach: bestDistance < REACH,
        prompt: bestDistance < REACH
          ? scared ? `${best.name} is frightened — E to speak gently` : `E talk to ${best.name}`
          : best.name,
      }
      return
    }

    // a berry bush within reach
    for (const place of this.sim.village.places) {
      if (place.kind !== 'food') continue
      const distance = Math.hypot(place.x - eye.x, place.z - eye.z)
      if (distance > REACH) continue
      const dx = place.x - eye.x
      const dz = place.z - eye.z
      const dot = (dx * forward.x + dz * forward.z) / (Math.hypot(dx, dz) || 1)
      if (dot < 0.55) continue
      const ripe = (place.amount ?? 0) >= 0.3
      this.gaze = {
        kind: 'berries',
        id: null,
        name: 'berry bush',
        inReach: ripe,
        prompt: ripe ? 'hold E to pick berries' : 'the berries need time to grow back',
      }
      return
    }

    const inside = buildingAt(this.sim.village, this.player.position.x, this.player.position.z)
    this.gaze = {
      kind: inside ? 'door' : 'none',
      id: null,
      name: inside?.name ?? '',
      prompt: '',
      inReach: false,
    }
  }

  private handleActions(dt: number): void {
    if (this.uiCaptured) {
      this.pickHeld = 0
      return
    }

    // --- hold E to pick berries ---------------------------------------------
    if (this.gaze.kind === 'berries' && this.gaze.inReach && this.input.isDown('interact')) {
      this.pickHeld += dt
      if (this.pickHeld > 0.7) {
        this.pickHeld = 0
        const eye = this.player.position
        if (this.sim.pickBerries(eye.x, eye.z)) {
          this.audio.play('pick', eye.x, eye.z, 'player')
          this.callbacks.onToast('picked a berry')
        }
      }
      return
    }
    this.pickHeld = 0

    // --- E to talk -----------------------------------------------------------
    if (this.input.wasPressed('interact') && this.gaze.kind === 'luma' && this.gaze.inReach && this.gaze.id != null) {
      this.callbacks.onOpenChat(this.gaze.id)
      return
    }

    // --- left click: a hand on the head --------------------------------------
    if (this.input.takePrimary() && this.gaze.kind === 'luma' && this.gaze.inReach && this.gaze.id != null) {
      const c = this.sim.creature(this.gaze.id)
      if (c) {
        this.sim.pet(c)
        this.audio.play('pet', c.x, c.z, c.id)
        this.callbacks.onToast(`${c.name} leans into it`)
      }
      return
    }

    // --- right click: a swat with the stick ----------------------------------
    if (this.input.takeSecondary() && this.gaze.kind === 'luma' && this.gaze.inReach && this.gaze.id != null) {
      const c = this.sim.creature(this.gaze.id)
      if (c) {
        this.sim.strike(c)
        this.callbacks.onToast(`${c.name} is frightened of you`)
      }
      return
    }

    // --- F to offer a berry ---------------------------------------------------
    if (this.input.wasPressed('use') && this.gaze.kind === 'luma' && this.gaze.inReach && this.gaze.id != null) {
      const c = this.sim.creature(this.gaze.id)
      if (!c) return
      if (this.sim.feed(c)) this.callbacks.onToast(`${c.name} eats from your hand`)
      else this.callbacks.onToast('no berries left — pick some from a bush')
    }
  }

  // ---------------------------------------------------------------- the HUD

  private publishHud(): void {
    const nearby = this.sim.creatures
      .map((c) => ({
        id: c.id,
        name: c.name,
        mood: moodColour(c),
        distance: Math.hypot(c.x - this.player.position.x, c.z - this.player.position.z),
        alarm: c.alarm,
      }))
      .filter((c) => c.distance < 30)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5)

    const minutes = Math.floor(this.sim.dayPhase * 24 * 60)
    const clock = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

    this.callbacks.onHud({
      gaze: this.gaze,
      berries: this.sim.player.berries,
      dayPhase: this.sim.dayPhase,
      clock,
      talkingTo: this.talkingTo,
      nearby,
      fps: Math.round(this.fps),
    })
  }

  /** The Luma under the crosshair, if any. */
  gazeTarget(): number | null {
    return this.gaze.kind === 'luma' ? this.gaze.id : null
  }

  /** What the crosshair is on, in full. */
  currentGaze(): Gaze {
    return this.gaze
  }

  playerPosition(): { x: number; y: number; z: number } {
    return { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z }
  }

  teleport(x: number, z: number): void {
    this.player.teleport(x, z)
    this.sim.player.x = x
    this.sim.player.z = z
  }

  /** Point the camera at a spot on the ground. */
  lookAt(x: number, z: number): void {
    const dx = x - this.player.position.x
    const dz = z - this.player.position.z
    this.player.yaw = Math.atan2(-dx, -dz)
    this.player.pitch = -0.08
  }

  /** Where a Luma's head is on screen, so a panel can point at them. */
  headScreenPosition(id: number): { x: number; y: number } | null {
    if (!this.luma.headPosition(id, this.tmpVec)) return null
    const projected = this.tmpVec.clone().project(this.engine.camera)
    if (projected.z > 1) return null
    return {
      x: (projected.x * 0.5 + 0.5) * this.engine.canvas.clientWidth,
      y: (-projected.y * 0.5 + 0.5) * this.engine.canvas.clientHeight,
    }
  }

  /** Put the player next to a Luma. Used by the "find" button. */
  goTo(c: Creature): void {
    const angle = Math.atan2(this.player.position.x - c.x, this.player.position.z - c.z)
    this.player.teleport(c.x + Math.sin(angle) * 2.2, c.z + Math.cos(angle) * 2.2)
  }

  dispose(): void {
    this.stop()
    window.removeEventListener('resize', this.handleResize)
    this.input.dispose()
    this.luma.dispose()
    this.nature?.dispose()
    this.village?.dispose()
    this.water.dispose()
    this.sky.dispose()
    this.terrain?.geometry.dispose()
    this.audio.dispose()
    this.engine.dispose()
  }
}
