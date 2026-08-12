/**
 * input — one place that decides whether a key means "walk forward" or the
 * letter W.
 *
 * The old build read raw keydown events straight into movement, so typing a
 * message to someone walked you into a wall while you did it. Here the rule is
 * explicit and has exactly one home: when a text field has focus, or a panel
 * has taken the screen, the game gets no keys at all, and any that were held
 * down are released rather than left stuck.
 */

export type GameAction =
  | 'forward' | 'back' | 'left' | 'right'
  | 'jump' | 'sprint' | 'crouch' | 'interact' | 'use' | 'place' | 'drop'

const BINDINGS: Record<string, GameAction> = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  ControlLeft: 'crouch', ControlRight: 'crouch', KeyC: 'crouch',
  KeyE: 'interact',
  KeyF: 'use',
  KeyQ: 'drop',
}

export interface PointerDelta {
  x: number
  y: number
}

export class Input {
  private held = new Set<GameAction>()
  private pressedThisFrame = new Set<GameAction>()
  private releasedThisFrame = new Set<GameAction>()
  private look: PointerDelta = { x: 0, y: 0 }
  private wheelDelta = 0
  private element: HTMLElement

  /** Set while a panel owns the screen; the world stops hearing the keyboard. */
  uiCaptured = false
  /** True while the pointer is locked to the canvas. */
  locked = false
  /** Left mouse button, for held actions like chopping. */
  primary = false
  secondary = false

  onLockChange: ((locked: boolean) => void) | null = null
  /** Raised for keys the UI owns (panels, hotbar). */
  onKey: ((code: string, event: KeyboardEvent) => void) | null = null
  /** Touch joystick, -1..1, written by the mobile controls. */
  joystick = { x: 0, y: 0 }
  touchLook: PointerDelta = { x: 0, y: 0 }

  private mouseSensitivity = 0.0022

  constructor(element: HTMLElement) {
    this.element = element
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    window.addEventListener('blur', this.releaseAll)
    document.addEventListener('pointerlockchange', this.handleLockChange)
    element.addEventListener('mousemove', this.handleMouseMove)
    element.addEventListener('mousedown', this.handleMouseDown)
    window.addEventListener('mouseup', this.handleMouseUp)
    element.addEventListener('wheel', this.handleWheel, { passive: true })
    element.addEventListener('contextmenu', this.preventContext)
  }

  /** True when the keyboard belongs to the page rather than the world. */
  private get typing(): boolean {
    if (this.uiCaptured) return true
    const el = document.activeElement as HTMLElement | null
    if (!el) return false
    const tag = el.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    // panels and the hotbar always hear about the key, even while typing —
    // they decide for themselves (Escape must work from inside a text field)
    this.onKey?.(e.code, e)
    if (this.typing) {
      this.releaseAll()
      return
    }
    const action = BINDINGS[e.code]
    if (!action) return
    if (e.repeat) return
    if (!this.held.has(action)) this.pressedThisFrame.add(action)
    this.held.add(action)
    if (e.code === 'Space') e.preventDefault()
  }

  private handleKeyUp = (e: KeyboardEvent): void => {
    const action = BINDINGS[e.code]
    if (!action) return
    if (this.held.delete(action)) this.releasedThisFrame.add(action)
  }

  private releaseAll = (): void => {
    for (const a of this.held) this.releasedThisFrame.add(a)
    this.held.clear()
    this.primary = false
    this.secondary = false
  }

  private handleLockChange = (): void => {
    this.locked = document.pointerLockElement === this.element
    if (!this.locked) this.releaseAll()
    this.onLockChange?.(this.locked)
  }

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return
    this.look.x += e.movementX * this.mouseSensitivity
    this.look.y += e.movementY * this.mouseSensitivity
  }

  private handleMouseDown = (e: MouseEvent): void => {
    if (this.typing) return
    if (e.button === 0) this.primary = true
    if (e.button === 2) this.secondary = true
  }

  private handleMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.primary = false
    if (e.button === 2) this.secondary = false
  }

  private handleWheel = (e: WheelEvent): void => {
    if (this.typing) return
    this.wheelDelta += e.deltaY
  }

  private preventContext = (e: Event): void => {
    e.preventDefault()
  }

  setSensitivity(v: number): void {
    this.mouseSensitivity = 0.0006 + v * 0.0035
  }

  requestLock(): void {
    if (this.locked) return
    void this.element.requestPointerLock?.()
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock()
  }

  isDown(action: GameAction): boolean {
    return this.held.has(action)
  }

  wasPressed(action: GameAction): boolean {
    return this.pressedThisFrame.has(action)
  }

  /** Consume the accumulated look delta for this frame. */
  takeLook(): PointerDelta {
    const out = { x: this.look.x + this.touchLook.x, y: this.look.y + this.touchLook.y }
    this.look.x = 0
    this.look.y = 0
    this.touchLook.x = 0
    this.touchLook.y = 0
    return out
  }

  /** Consume scroll notches, positive = next slot. */
  takeWheel(): number {
    const notches = Math.trunc(this.wheelDelta / 100) || (this.wheelDelta > 0 ? 1 : this.wheelDelta < 0 ? -1 : 0)
    this.wheelDelta = 0
    return notches
  }

  endFrame(): void {
    this.pressedThisFrame.clear()
    this.releasedThisFrame.clear()
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    window.removeEventListener('blur', this.releaseAll)
    document.removeEventListener('pointerlockchange', this.handleLockChange)
    this.element.removeEventListener('mousemove', this.handleMouseMove)
    this.element.removeEventListener('mousedown', this.handleMouseDown)
    window.removeEventListener('mouseup', this.handleMouseUp)
    this.element.removeEventListener('wheel', this.handleWheel)
    this.element.removeEventListener('contextmenu', this.preventContext)
  }
}
