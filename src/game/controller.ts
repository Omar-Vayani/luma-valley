/**
 * controller — how it feels to be in the valley.
 *
 * Deliberately modelled on the first-person game everybody already has in
 * their hands: you accelerate quickly and stop quickly, you can jump about a
 * metre, sprinting widens the view a little, crouching drops you and slows
 * you, and you swim if you walk into the lake. The camera bobs with the step
 * and settles when you stand still.
 *
 * Collision is cheap on purpose: the ground is a height field so feet are a
 * lookup, and buildings are circles you get pushed out of. Nothing here needs
 * a physics engine, and skipping one keeps the frame budget for the world.
 */
import * as THREE from 'three'
import {
  WATER_LEVEL, clampToTerrain, heightAt, slopeAt, surfaceAt,
} from '../world/terrain'

export interface Collider {
  x: number
  z: number
  r: number
}

export interface ControllerInputs {
  forward: number
  strafe: number
  jump: boolean
  sprint: boolean
  crouch: boolean
  /** yaw/pitch delta in radians for this frame */
  lookX: number
  lookY: number
}

const WALK = 4.8
const SPRINT = 7.8
const CROUCH_SPEED = 2.3
const SWIM = 3.2
const GRAVITY = 21
const JUMP_SPEED = 6.4
const EYE_STAND = 1.68
const EYE_CROUCH = 1.06
const RADIUS = 0.42
/** Anything steeper than this you slide off rather than climb. */
const MAX_SLOPE = 0.62
const COYOTE = 0.12

export class PlayerController {
  readonly position = new THREE.Vector3(0, 0, 6)
  readonly velocity = new THREE.Vector3()
  yaw = Math.PI
  pitch = 0

  onGround = true
  crouching = false
  sprinting = false
  swimming = false
  /** 0..1, how fast you are actually moving relative to a sprint */
  gait = 0

  private eyeHeight = EYE_STAND
  private bobPhase = 0
  private bobAmount = 0
  private landImpact = 0
  private coyote = 0
  private colliders: Collider[] = []
  private stepDistance = 0
  private lastStep = 0

  /** Raised when a foot lands, with the surface underneath. */
  onFootstep: ((surface: string, running: boolean) => void) | null = null
  onLand: ((force: number) => void) | null = null

  constructor(startX = 0, startZ = 8) {
    this.position.set(startX, heightAt(startX, startZ), startZ)
  }

  setColliders(list: Collider[]): void {
    this.colliders = list
  }

  /** Where the eyes are, which is where the camera goes. */
  get eye(): number {
    return this.eyeHeight
  }

  teleport(x: number, z: number): void {
    this.position.set(x, heightAt(x, z) + 0.2, z)
    this.velocity.set(0, 0, 0)
  }

  /** Turn to face a point on the ground. */
  lookTowards(x: number, z: number): void {
    const dx = x - this.position.x
    const dz = z - this.position.z
    if (!dx && !dz) return
    // forward is (-sin yaw, ·, -cos yaw), so this is the yaw that points at it
    this.yaw = Math.atan2(-dx, -dz)
    this.pitch = -0.06
  }

  update(dt: number, input: ControllerInputs): void {
    // --- look ---------------------------------------------------------------
    this.yaw -= input.lookX
    this.pitch -= input.lookY
    this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02)
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2

    // --- what we are standing in --------------------------------------------
    const ground = heightAt(this.position.x, this.position.z)
    const depth = WATER_LEVEL - this.position.y
    this.swimming = depth > 0.6

    const wanted = new THREE.Vector2(input.strafe, input.forward)
    if (wanted.lengthSq() > 1) wanted.normalize()

    this.crouching = input.crouch && !this.swimming
    this.sprinting = input.sprint && !this.crouching && wanted.y > 0.1 && !this.swimming

    const targetEye = this.crouching ? EYE_CROUCH : EYE_STAND
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, dt * 12)

    const speed = this.swimming ? SWIM
      : this.crouching ? CROUCH_SPEED
        : this.sprinting ? SPRINT : WALK

    // --- horizontal movement -------------------------------------------------
    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    const wishX = wanted.x * cos - wanted.y * sin
    const wishZ = -wanted.x * sin - wanted.y * cos

    // ground control is snappy; in the air you keep most of your momentum
    const control = this.onGround || this.swimming ? 16 : 3.2
    const targetVX = wishX * speed
    const targetVZ = wishZ * speed
    this.velocity.x += (targetVX - this.velocity.x) * Math.min(1, dt * control)
    this.velocity.z += (targetVZ - this.velocity.z) * Math.min(1, dt * control)

    // --- vertical -------------------------------------------------------------
    if (this.swimming) {
      // bob toward the surface, and let jump be "swim up"
      const targetY = WATER_LEVEL - 0.45
      const buoyancy = (targetY - this.position.y) * 6
      this.velocity.y += (buoyancy - this.velocity.y * 3.2) * dt * 4
      if (input.jump) this.velocity.y += 8 * dt
      this.onGround = false
      this.coyote = 0
    } else {
      this.coyote = this.onGround ? COYOTE : Math.max(0, this.coyote - dt)
      if (input.jump && this.coyote > 0) {
        this.velocity.y = JUMP_SPEED
        this.onGround = false
        this.coyote = 0
      }
      this.velocity.y -= GRAVITY * dt
    }

    // --- integrate + collide ---------------------------------------------------
    const nextX = clampToTerrain(this.position.x + this.velocity.x * dt)
    const nextZ = clampToTerrain(this.position.z + this.velocity.z * dt)
    this.moveHorizontally(nextX, nextZ)
    this.position.y += this.velocity.y * dt

    const floor = heightAt(this.position.x, this.position.z)
    if (this.position.y <= floor) {
      if (!this.onGround && this.velocity.y < -6) {
        const force = Math.min(1, -this.velocity.y / 18)
        this.landImpact = force
        this.onLand?.(force)
      }
      this.position.y = floor
      this.velocity.y = 0
      this.onGround = true
    } else if (this.position.y > floor + 0.06) {
      this.onGround = false
    }
    void ground

    // --- head bob and footsteps ------------------------------------------------
    const planar = Math.hypot(this.velocity.x, this.velocity.z)
    this.gait = Math.min(1, planar / SPRINT)
    const moving = planar > 0.4 && (this.onGround || this.swimming)
    const targetBob = moving ? Math.min(1, planar / WALK) : 0
    this.bobAmount += (targetBob - this.bobAmount) * Math.min(1, dt * 8)
    if (moving) {
      const cadence = this.sprinting ? 9.4 : this.crouching ? 4.4 : 6.8
      this.bobPhase += dt * cadence
      this.stepDistance += planar * dt
      if (this.stepDistance - this.lastStep > (this.sprinting ? 2.2 : 1.7)) {
        this.lastStep = this.stepDistance
        const surface = this.swimming ? 'water' : surfaceAt(this.position.x, this.position.z)
        this.onFootstep?.(surface, this.sprinting)
      }
    }
    this.landImpact = Math.max(0, this.landImpact - dt * 3)
  }

  /** Slide along building walls instead of sticking to them. */
  private moveHorizontally(nextX: number, nextZ: number): void {
    let x = nextX
    let z = nextZ

    for (const c of this.colliders) {
      const dx = x - c.x
      const dz = z - c.z
      const d = Math.hypot(dx, dz)
      const min = c.r + RADIUS
      if (d < min && d > 0.0001) {
        const push = (min - d) / d
        x += dx * push
        z += dz * push
      }
    }

    // refuse ground too steep to stand on, so the rim mountains are a wall
    if (!this.swimming) {
      const slope = slopeAt(x, z)
      if (slope > MAX_SLOPE && heightAt(x, z) > this.position.y + 0.4) {
        x = this.position.x
        z = this.position.z
        this.velocity.x *= 0.2
        this.velocity.z *= 0.2
      }
    }

    this.position.x = clampToTerrain(x)
    this.position.z = clampToTerrain(z)
  }

  /**
   * Put the camera where the eyes are, with the bob and the sprint lean.
   * Returns the field of view the engine should use this frame.
   */
  applyTo(camera: THREE.PerspectiveCamera, baseFov: number, dt: number): number {
    const bobY = Math.sin(this.bobPhase * 2) * 0.055 * this.bobAmount
    const bobX = Math.cos(this.bobPhase) * 0.045 * this.bobAmount
    const dip = this.landImpact * 0.28

    camera.position.set(
      this.position.x + bobX * Math.cos(this.yaw),
      this.position.y + this.eyeHeight + bobY - dip,
      this.position.z - bobX * Math.sin(this.yaw),
    )
    camera.rotation.set(this.pitch, this.yaw, Math.sin(this.bobPhase) * 0.008 * this.bobAmount, 'YXZ')

    const targetFov = baseFov + (this.sprinting ? 6 : 0) + (this.swimming ? -4 : 0)
    const current = camera.fov
    return current + (targetFov - current) * Math.min(1, dt * 6)
  }

  /** Unit vector the camera is looking along. */
  forwardVector(out: THREE.Vector3): THREE.Vector3 {
    const cosPitch = Math.cos(this.pitch)
    out.set(-Math.sin(this.yaw) * cosPitch, Math.sin(this.pitch), -Math.cos(this.yaw) * cosPitch)
    return out
  }

  /** Where the eyes are in world space. */
  eyePosition(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.position.x, this.position.y + this.eyeHeight, this.position.z)
  }

  get underwater(): boolean {
    return this.position.y + this.eyeHeight < WATER_LEVEL
  }
}
