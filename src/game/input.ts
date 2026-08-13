/**
 * input — one place that decides whether a key means "walk forward" or the
 * letter W.
 *
 * The rule is explicit and has exactly one home: when a text field has focus,
 * or a panel owns the screen, the world gets no keys at all, and anything
 * being held is released rather than left stuck down. Typing "walk west" into
 * the chat box should not walk you west.
 */

export type GameAction = 'forward' | 'back' | 'left' | 'right' | 'jump' | 'sprint' | 'crouch' | 'interact' | 'use'

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
}

export interface PointerDelta {
  x: number
  y: number
}

export class Input {
  private held = new Set<GameAction>()
  private pressed = new Set<GameAction>()
  private look: PointerDelta = { x: 0, y: 0 }
  private element: HTMLElement
  private primaryClicked = false
  private secondaryClicked = false
  private sensitivity = 0.0022

  /** set while a panel owns the screen */
  uiCaptured = false
  locked = false

  onLockChange: ((locked: boolean) => void) | null = null
  /** raised for every key, so panels can handle Escape and shortcuts */
  onKey: ((code: string, event: KeyboardEvent) => void) | null = null

  constructor(element: HTMLElement) {
    this.element = element
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    window.addEventListener('blur', this.releaseAll)
    document.addEventListener('pointerlockchange', this.handleLockChange)
    element.addEventListener('mousemove', this.handleMouseMove)
    element.addEventListener('mousedown', this.handleMouseDown)
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
    // panels always hear the key, even while typing, so Escape works from
    // inside a text field
    this.onKey?.(e.code, e)
    if (this.typing) {
      this.releaseAll()
      return
    }
    const action = BINDINGS[e.code]
    if (!action || e.repeat) return
    if (!this.held.has(action)) this.pressed.add(action)
    this.held.add(action)
    if (e.code === 'Space') e.preventDefault()
  }

  private handleKeyUp = (e: KeyboardEvent): void => {
    const action = BINDINGS[e.code]
    if (action) this.held.delete(action)
  }

  private releaseAll = (): void => {
    this.held.clear()
  }

  private handleLockChange = (): void => {
    this.locked = document.pointerLockElement === this.element
    if (!this.locked) this.releaseAll()
    this.onLockChange?.(this.locked)
  }

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return
    this.look.x += e.movementX * this.sensitivity
    this.look.y += e.movementY * this.sensitivity
  }

  private handleMouseDown = (e: MouseEvent): void => {
    if (this.typing) return
    if (!this.locked) {
      // the first click is what asks for the mouse, not an action in the world
      this.requestLock()
      return
    }
    if (e.button === 0) this.primaryClicked = true
    if (e.button === 2) this.secondaryClicked = true
  }

  private preventContext = (e: Event): void => {
    e.preventDefault()
  }

  setSensitivity(v: number): void {
    this.sensitivity = 0.0008 + v * 0.003
  }

  requestLock(): void {
    if (this.locked || this.uiCaptured) return
    void this.element.requestPointerLock?.()
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock()
  }

  isDown(action: GameAction): boolean {
    return this.held.has(action)
  }

  wasPressed(action: GameAction): boolean {
    return this.pressed.has(action)
  }

  /** Consume a left click. Edge-triggered, so holding is not a hundred pets. */
  takePrimary(): boolean {
    const clicked = this.primaryClicked
    this.primaryClicked = false
    return clicked
  }

  takeSecondary(): boolean {
    const clicked = this.secondaryClicked
    this.secondaryClicked = false
    return clicked
  }

  /** Consume the accumulated look delta for this frame. */
  takeLook(): PointerDelta {
    const out = { x: this.look.x, y: this.look.y }
    this.look.x = 0
    this.look.y = 0
    return out
  }

  endFrame(): void {
    this.pressed.clear()
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    window.removeEventListener('blur', this.releaseAll)
    document.removeEventListener('pointerlockchange', this.handleLockChange)
    this.element.removeEventListener('mousemove', this.handleMouseMove)
    this.element.removeEventListener('mousedown', this.handleMouseDown)
    this.element.removeEventListener('contextmenu', this.preventContext)
  }
}
