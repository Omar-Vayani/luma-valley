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
  private hasPointerPosition = false
  private lastLockedMove = { dx: 0, dy: 0, at: -Infinity, source: '' }
  private canvasTouchId: number | null = null
  private canvasPointerId: number | null = null
  private canvasLast = { x: 0, y: 0 }

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement, world: World, spawn: { x: number; z: number }) {
    this.camera = camera
    this.domElement = domElement
    this.world = world
    // bounds derive from the world size (not hardcoded)
    this.worldMin = -(world.state.size - 2)
    this.worldMax = world.state.size - 2
    this.position.set(spawn.x, 4, spawn.z)
    this.updateCamera(true)

    // window-level events: look works no matter what element is under the pointer.
    // Register pointermove + mousemove + touchmove ALL — the delta handler
    // naturally dedupes (compat events after a pointer event see delta 0),
    // and this covers every browser/webview input path (some webviews only
    // deliver mousemove or only touchmove).
    window.addEventListener('pointermove', this.onPointerMove, { passive: false })
    window.addEventListener('mousemove', this.onMouseMoveUniversal)
    window.addEventListener('touchmove', this.onTouchMoveUniversal, { passive: false })
    window.addEventListener('pointerdown', this.onPointerDown, { passive: false })
    window.addEventListener('mousedown', this.onPointerDown)
    window.addEventListener('touchstart', this.onPointerDown, { passive: false })
    window.addEventListener('blur', this.onBlur)
    document.addEventListener('keydown', this.onKeyDown)
    document.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('pointerlockchange', this.onLockChangeEvt)
    domElement.addEventListener('wheel', this.onWheelEvt, { passive: false })
    // Canvas gestures are deliberately element-local, matching the reliable
    // mobile joystick path instead of depending on window event delivery.
    domElement.addEventListener('touchstart', this.onCanvasTouchStart, { passive: false })
    domElement.addEventListener('touchmove', this.onCanvasTouchMove, { passive: false })
    domElement.addEventListener('touchend', this.onCanvasTouchEnd, { passive: false })
    domElement.addEventListener('touchcancel', this.onCanvasTouchEnd, { passive: false })
    domElement.addEventListener('pointerdown', this.onCanvasPointerDown)
    domElement.addEventListener('pointermove', this.onCanvasPointerMove)
    domElement.addEventListener('pointerup', this.onCanvasPointerEnd)
    domElement.addEventListener('pointercancel', this.onCanvasPointerEnd)
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
    return !!target.closest('.joystick, .lookstick, .jump-btn, .btn, input, textarea, select, button, a')
  }

  private onCanvasTouchStart = (e: TouchEvent): void => {
    if (this.canvasTouchId !== null || this.canvasPointerId !== null) return
    const touch = e.changedTouches[0]
    if (!touch) return
    e.preventDefault()
    e.stopPropagation()
    this.canvasTouchId = touch.identifier
    this.canvasLast = { x: touch.clientX, y: touch.clientY }
  }

  private onCanvasTouchMove = (e: TouchEvent): void => {
    if (this.canvasTouchId === null) return
    const touch = Array.from(e.changedTouches).find((item) => item.identifier === this.canvasTouchId)
    if (!touch) return
    e.preventDefault()
    e.stopPropagation()
    this.canvasDelta(touch.clientX, touch.clientY)
  }

  private onCanvasTouchEnd = (e: TouchEvent): void => {
    if (this.canvasTouchId === null) return
    if (!Array.from(e.changedTouches).some((item) => item.identifier === this.canvasTouchId)) return
    e.preventDefault()
    e.stopPropagation()
    this.canvasTouchId = null
  }

  private onCanvasPointerDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return
    e.preventDefault()
    e.stopPropagation()
    this.canvasPointerId = e.pointerId
    this.canvasLast = { x: e.clientX, y: e.clientY }
    this.domElement.setPointerCapture?.(e.pointerId)
  }

  private onCanvasPointerMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.canvasPointerId) return
    e.preventDefault()
    e.stopPropagation()
    this.canvasDelta(e.clientX, e.clientY)
  }

  private onCanvasPointerEnd = (e: PointerEvent): void => {
    if (e.pointerId !== this.canvasPointerId) return
    e.stopPropagation()
    this.canvasPointerId = null
  }

  private canvasDelta(clientX: number, clientY: number): void {
    const dx = clientX - this.canvasLast.x
    const dy = clientY - this.canvasLast.y
    this.canvasLast = { x: clientX, y: clientY }
    this.applyLook(dx, dy)
  }

  private onPointerDown = (e: PointerEvent | MouseEvent | TouchEvent): void => {
    this.lastPointerX = this.eventX(e)
    this.lastPointerY = this.eventY(e)
    this.hasPointerPosition = true
  }

  private onPointerMove = (e: PointerEvent): void => {
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

  /** Universal touchmove (always registered; dedupes naturally via deltas). */
  private onTouchMoveUniversal = (e: TouchEvent): void => {
    const t = e.touches[0]
    if (!t || this.locked) return
    this.deltaMove(t.clientX, t.clientY, e.target)
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

  private onBlur = (): void => {
    this.keys.clear()
    this.hasPointerPosition = false
  }

  private eventX(e: PointerEvent | MouseEvent | TouchEvent): number {
    if ('touches' in e && e.touches[0]) return e.touches[0].clientX
    return (e as PointerEvent | MouseEvent).clientX
  }

  private eventY(e: PointerEvent | MouseEvent | TouchEvent): number {
    if ('touches' in e && e.touches[0]) return e.touches[0].clientY
    return (e as PointerEvent | MouseEvent).clientY
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
   * KEYBOARD LOOK — guaranteed to work in any environment where keys work
   * (movement proves keys reach the page). ArrowLeft/Right rotate yaw,
   * ArrowUp/Down tilt pitch (when Shift is NOT held), Q/E strafe-rotate.
   */
  private keyLook(dt: number): void {
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyQ')) this.applyLook(1.2 * (dt * 60), 0)
    if (this.keys.has('ArrowRight') || this.keys.has('KeyE')) this.applyLook(-1.2 * (dt * 60), 0)
    if (this.keys.has('ArrowUp')) this.applyLook(0, 1.0 * (dt * 60))
    if (this.keys.has('ArrowDown')) this.applyLook(0, -1.0 * (dt * 60))
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
    window.removeEventListener('mousemove', this.onMouseMoveUniversal)
    window.removeEventListener('touchmove', this.onTouchMoveUniversal)
    window.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('mousedown', this.onPointerDown)
    window.removeEventListener('touchstart', this.onPointerDown)
    window.removeEventListener('blur', this.onBlur)
    document.removeEventListener('keydown', this.onKeyDown)
    document.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('pointerlockchange', this.onLockChangeEvt)
    this.domElement.removeEventListener('wheel', this.onWheelEvt)
    this.domElement.removeEventListener('touchstart', this.onCanvasTouchStart)
    this.domElement.removeEventListener('touchmove', this.onCanvasTouchMove)
    this.domElement.removeEventListener('touchend', this.onCanvasTouchEnd)
    this.domElement.removeEventListener('touchcancel', this.onCanvasTouchEnd)
    this.domElement.removeEventListener('pointerdown', this.onCanvasPointerDown)
    this.domElement.removeEventListener('pointermove', this.onCanvasPointerMove)
    this.domElement.removeEventListener('pointerup', this.onCanvasPointerEnd)
    this.domElement.removeEventListener('pointercancel', this.onCanvasPointerEnd)
  }
}
