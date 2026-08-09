import * as THREE from 'three'
import type { World } from '../sim/world'

/**
 * FPSControls — first-person movement + look.
 *
 * LOOK is built to work in EVERY browser and input mode:
 *   - window-level `pointermove` using clientX/clientY deltas
 *     (movementX/Y are unreliable outside pointer lock — e.g. Safari)
 *   - free mouse look: moving the mouse rotates the camera, no click/drag
 *   - mobile touch look is owned by App's full-screen LookSurface
 *   - pointer lock is a *bonus* (hides the cursor) but never required
 *   - pointer over UI (panels/buttons) never rotates the camera
 * MOVE: WASD always works; joystick (mobile) calls setInput();
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
  private groundHeight: (x: number, z: number) => number
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
  private hasPointerPosition = false
  private lastLockedMove = { dx: 0, dy: 0, at: -Infinity, source: '' }

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    world: World,
    spawn: { x: number; z: number },
    groundHeight: (x: number, z: number) => number = (x, z) => world.height(x, z) * 6 - 2.5,
  ) {
    this.camera = camera
    this.domElement = domElement
    this.world = world
    this.groundHeight = groundHeight
    // bounds derive from the world size (not hardcoded)
    this.worldMin = -(world.state.size - 2)
    this.worldMax = world.state.size - 2
    this.position.set(spawn.x, this.groundHeight(spawn.x, spawn.z), spawn.z)
    this.updateCamera(true)

    // window-level events: look works no matter what element is under the pointer.
    // Desktop look. Mobile touch look has one owner: App's LookSurface.
    // Keeping touch out of this global path is essential for two-thumb play:
    // the movement joystick and look surface must never fight over touches.
    window.addEventListener('pointermove', this.onPointerMove, { passive: false })
    window.addEventListener('mousemove', this.onMouseMoveUniversal)
    window.addEventListener('pointerdown', this.onPointerDown, { passive: false })
    window.addEventListener('mousedown', this.onPointerDown)
    window.addEventListener('blur', this.onBlur)
    document.addEventListener('keydown', this.onKeyDown)
    document.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('pointerlockchange', this.onLockChangeEvt)
    domElement.addEventListener('wheel', this.onWheelEvt, { passive: false })
    // NOTE: no canvas-level touch handlers — the mobile look surface is a
    // full-screen React div (LookSurface) using the same synthetic touch
    // events that provably work on real devices (the joystick). preventDefault
    // on canvas touchstart triggers touchcancel in many mobile webviews,
    // silently killing the whole look stream.
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
    this.hasPointerPosition = false
    this.lastLockedMove.at = -Infinity
    this.onLockChange?.(this.locked)
  }

  private onWheelEvt = (e: WheelEvent): void => {
    e.preventDefault()
    this.onWheel?.(e.deltaY > 0 ? 1 : -1)
  }

  /** Single look entry point — every input routes here and the camera updates NOW.
   *  NATURAL (non-inverted): slide right → look right (yaw+), slide up → look up (pitch+). */
  applyLook(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return
    this.yaw += dx * 0.0022
    this.pitch -= dy * 0.0022
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.35, 1.35)
    this.updateCamera()
  }

  /** True if the pointer is over an interactive control (never rotate then).
   *  Panels/background are lookable — only buttons/inputs/sticks block look. */
  private overUi(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    return !!target.closest('button, .btn, input, textarea, select, .joystick, .jump-btn, .fpv-hint')
  }

  private onBlur = (): void => {
    this.keys.clear()
    this.hasPointerPosition = false
  }

  private onPointerDown = (e: PointerEvent | MouseEvent): void => {
    if ('pointerType' in e && e.pointerType === 'touch') return
    this.lastPointerX = e.clientX
    this.lastPointerY = e.clientY
    this.hasPointerPosition = true
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return
    // LOCKED: the cursor is captured in place — clientX/Y never change.
    // movementX/Y are the only reliable signal (and are 100% reliable there).
    if (this.locked) {
      this.lockedMove(e.movementX, e.movementY, 'pointer', e.timeStamp)
      return
    }
    this.deltaMove(e.clientX, e.clientY, e.target)
  }

  /** Universal mousemove (always registered; dedupes naturally via deltas). */
  private onMouseMoveUniversal = (e: MouseEvent): void => {
    if (this.locked) {
      this.lockedMove(e.movementX, e.movementY, 'mouse', e.timeStamp)
      return
    }
    this.deltaMove(e.clientX, e.clientY, e.target)
  }


  private deltaMove(clientX: number, clientY: number, target: EventTarget | null): void {
    if (!this.hasPointerPosition) {
      this.lastPointerX = clientX
      this.lastPointerY = clientY
      this.hasPointerPosition = true
      return
    }
    const dx = clientX - this.lastPointerX
    const dy = clientY - this.lastPointerY
    this.lastPointerX = clientX
    this.lastPointerY = clientY
    if (dx === 0 && dy === 0) return
    // never rotate while over UI controls
    if (this.overUi(target)) return
    // clamp large jumps (pointer re-entering the window etc.)
    const cdx = Math.max(-160, Math.min(160, dx))
    const cdy = Math.max(-160, Math.min(160, dy))
    this.applyLook(cdx, cdy)
  }

  /** Suppress the compatibility mousemove that commonly follows pointermove. */
  private lockedMove(dx: number, dy: number, source: 'pointer' | 'mouse', at: number): void {
    if (dx === 0 && dy === 0) return
    const previous = this.lastLockedMove
    const duplicate = previous.source !== source && previous.dx === dx && previous.dy === dy && Math.abs(at - previous.at) < 2
    this.lastLockedMove = { dx, dy, at, source }
    if (!duplicate) this.applyLook(dx, dy)
  }


  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code.startsWith('Arrow')) e.preventDefault()
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
    // WASD = movement; arrow keys = LOOK (see keyLook)
    if (this.keys.has('KeyW')) fwd += 1
    if (this.keys.has('KeyS')) fwd -= 1
    if (this.keys.has('KeyA')) side -= 1
    if (this.keys.has('KeyD')) side += 1
    return { fwd, side, sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') }
  }

  /**
   * KEYBOARD LOOK — guaranteed to work in any environment where keys work.
   * ArrowRight/Left rotate right/left (non-inverted), ArrowUp/Down tilt
   * up/down, Q/E rotate left/right.
   */
  private keyLook(dt: number): void {
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyQ')) this.applyLook(-1.2 * (dt * 60), 0)
    if (this.keys.has('ArrowRight') || this.keys.has('KeyE')) this.applyLook(1.2 * (dt * 60), 0)
    if (this.keys.has('ArrowUp')) this.applyLook(0, -1.0 * (dt * 60))
    if (this.keys.has('ArrowDown')) this.applyLook(0, 1.0 * (dt * 60))
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
    // keyboard look (arrows/Q/E) — always available
    this.keyLook(dt)
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
    const ground = this.groundHeight(this.position.x, this.position.z)
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
    // Aim from the EYE, not from the player's feet. Using `position + dir`
    // made the camera always look steeply down and severely muted pitch.
    this.camera.lookAt(this.camera.position.clone().add(dir))
  }

  dispose(): void {
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('mousemove', this.onMouseMoveUniversal)
    window.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('mousedown', this.onPointerDown)
    window.removeEventListener('blur', this.onBlur)
    document.removeEventListener('keydown', this.onKeyDown)
    document.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('pointerlockchange', this.onLockChangeEvt)
    this.domElement.removeEventListener('wheel', this.onWheelEvt)
  }
}
