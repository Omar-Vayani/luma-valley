import * as THREE from 'three'
import type { World } from '../sim/world'

/**
 * FPSControls — first-person movement + look.
 *
 * LOOK is built to work in EVERY browser and input mode:
 *   - window-level `pointermove` using clientX/clientY deltas
 *     (movementX/Y are unreliable outside pointer lock — e.g. Safari)
 *   - free mouse look: moving the mouse rotates the camera, no click/drag
 *   - touch drag rotates the camera too (same delta code path)
 *   - pointer lock is a *bonus* (hides the cursor) but never required
 *   - pointer over UI (panels/buttons) never rotates the camera
 * MOVE: WASD/arrows always work; joystick (mobile) calls setInput();
 * Space or jump() to jump.
 */
export class FPSControls {
  camera: THREE.PerspectiveCamera
  domElement: HTMLElement
  yaw = 0
  pitch = 0
  position = new THREE.Vector3(0, 4, 0)
  velocity = new THREE.Vector3()
  onLockChange: ((locked: boolean) => void) | null = null
  private keys = new Set<string>()
  private locked = false
  private world: World
  private radius = 0.8
  private eyeHeight = 1.5
  private gravity = -28
  private grounded = true
  private jumpVel = 0
  private bobPhase = 0
  private bobAmp = 0
  private landedAt = 0
  private worldMin = 0
  private worldMax = 0
  onWheel: ((d: number) => void) | null = null

  // ── pointer tracking (client-coordinate deltas, browser-agnostic) ──
  private lastPointerX = 0
  private lastPointerY = 0
  private pointerActive = false

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement, world: World, spawn: { x: number; z: number }) {
    this.camera = camera
    this.domElement = domElement
    this.world = world
    // bounds derive from the world size (not hardcoded)
    this.worldMin = -(world.state.size - 2)
    this.worldMax = world.state.size - 2
    this.position.set(spawn.x, 4, spawn.z)
    this.updateCamera(true)

    // window-level events: look works no matter what element is under the pointer
    window.addEventListener('pointermove', this.onPointerMove, { passive: false })
    window.addEventListener('pointerdown', this.onPointerDown, { passive: false })
    window.addEventListener('pointerup', this.onPointerUp)
    document.addEventListener('keydown', this.onKeyDown)
    document.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('pointerlockchange', this.onLockChangeEvt)
    domElement.addEventListener('wheel', this.onWheelEvt, { passive: false })
  }

  /** Request pointer lock (optional; hides the cursor while looking). */
  lock(): void {
    this.domElement.requestPointerLock()
  }

  unlock(): void {
    document.exitPointerLock()
  }

  get isLocked(): boolean {
    return this.locked
  }

  private onLockChangeEvt = (): void => {
    this.locked = document.pointerLockElement === this.domElement
    this.onLockChange?.(this.locked)
  }

  private onWheelEvt = (e: WheelEvent): void => {
    e.preventDefault()
    this.onWheel?.(e.deltaY > 0 ? 1 : -1)
  }

  /** Single look entry point — every input routes here and the camera updates NOW. */
  applyLook(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return
    this.yaw -= dx * 0.0022
    this.pitch -= dy * 0.0022
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.35, 1.35)
    this.updateCamera()
  }

  /** True if the pointer is over game UI (never rotate then). */
  private overUi(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    return !!target.closest('.panel, .topbar, .quest-tracker, .quickbar, .fpv-hint, .overlay, .toast, .joystick, .jump-btn, .btn, input, textarea, select, button')
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.lastPointerX = e.clientX
    this.lastPointerY = e.clientY
    this.pointerActive = true
    // seed the reference point even if this is a UI press, so the first
    // world move doesn't jump
    if (this.overUi(e.target)) this.pointerActive = false
  }

  private onPointerMove = (e: PointerEvent): void => {
    const dx = e.clientX - this.lastPointerX
    const dy = e.clientY - this.lastPointerY
    this.lastPointerX = e.clientX
    this.lastPointerY = e.clientY
    if (dx === 0 && dy === 0) return
    // never rotate while over UI controls
    if (this.overUi(e.target)) return
    // clamp large jumps (pointer re-entering the window etc.)
    const cdx = Math.max(-160, Math.min(160, dx))
    const cdy = Math.max(-160, Math.min(160, dy))
    this.applyLook(cdx, cdy)
    void this.pointerActive
  }

  private onPointerUp = (): void => {
    this.pointerActive = false
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code)
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code)
  }

  setInput(key: string, down: boolean): void {
    if (down) this.keys.add(key)
    else this.keys.delete(key)
  }

  getInput(): { fwd: number; side: number; sprint: boolean } {
    let fwd = 0
    let side = 0
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) fwd += 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) fwd -= 1
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) side -= 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) side += 1
    return { fwd, side, sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') }
  }

  /** Jump (Space or the mobile jump button). */
  jump(): void {
    if (this.grounded) {
      this.jumpVel = 9
      this.grounded = false
    }
  }

  /** Advance physics by dt seconds. */
  update(dt: number): void {
    const { fwd, side, sprint } = this.getInput()
    const speed = (sprint ? 7.2 : 4.6) * dt
    const dir = new THREE.Vector3()
    this.camera.getWorldDirection(dir)
    dir.y = 0
    dir.normalize()
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize()
    const move = new THREE.Vector3()
    move.addScaledVector(dir, fwd * speed)
    move.addScaledVector(right, side * speed)

    // gravity + jump
    if (this.keys.has('Space') && this.grounded) {
      this.jumpVel = 9
      this.grounded = false
    }
    this.jumpVel += this.gravity * dt
    if (this.jumpVel < -12) this.jumpVel = -12

    // horizontal move with collision (terrain bounds + static colliders)
    const nx = this.position.x + move.x
    const nz = this.position.z + move.z
    if (nx > this.worldMin + this.radius && nx < this.worldMax - this.radius) this.position.x = nx
    if (nz > this.worldMin + this.radius && nz < this.worldMax - this.radius) this.position.z = nz
    const resolved = this.world.resolveCollision({ x: this.position.x, z: this.position.z }, this.radius)
    this.position.x = resolved.x
    this.position.z = resolved.z

    // vertical: terrain height (feet rest ON the ground; eye is +eyeHeight)
    const ground = this.world.height(this.position.x, this.position.z) * 6 - 2.5
    this.position.y += this.jumpVel * dt
    const minY = ground
    if (this.position.y <= minY) {
      this.position.y = minY
      const impact = this.jumpVel
      this.jumpVel = 0
      if (!this.grounded && impact < -5) {
        // hard landing → brief camera squash (decays via the lerp below)
        this.landedAt = performance.now()
        this.bobAmp = 1.5
      }
      this.grounded = true
    } else {
      this.grounded = false
    }

    // walk bob: amplitude ramps in with movement, fades when still / after landing
    const moving = this.grounded && (Math.abs(fwd) + Math.abs(side)) > 0
    const targetAmp = moving ? 1 : 0
    const sinceLand = (performance.now() - this.landedAt) / 1000
    const decayRate = sinceLand < 0.3 ? 12 : 8 // a touch faster right after a landing
    this.bobAmp += (targetAmp - this.bobAmp) * Math.min(1, dt * decayRate)
    if (moving) this.bobPhase += dt * (sprint ? 14 : 10)

    this.updateCamera()
  }

  private updateCamera(force = false): void {
    // Always sync the camera to the player (position + look from yaw/pitch).
    void force
    const bobY = Math.sin(this.bobPhase) * 0.06 * this.bobAmp
    this.camera.position.set(this.position.x, this.position.y + this.eyeHeight + bobY, this.position.z)
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    )
    this.camera.lookAt(this.position.clone().add(dir))
  }

  dispose(): void {
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointerup', this.onPointerUp)
    document.removeEventListener('keydown', this.onKeyDown)
    document.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('pointerlockchange', this.onLockChangeEvt)
    this.domElement.removeEventListener('wheel', this.onWheelEvt)
  }
}
