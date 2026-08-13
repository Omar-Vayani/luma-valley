/**
 * player — how it feels to walk around the valley.
 *
 * An unhurried first-person controller. The speeds are deliberately lower
 * than an action game's: the valley is four hundred metres across and there is
 * nothing in it to be late for.
 *
 * Collision resolves against the same grid the creatures use, and — as with
 * them — contact makes you slide along a wall rather than stop dead against
 * it, because being stopped by a wall you are only brushing is what makes a
 * world feel sticky.
 */
import * as THREE from 'three'
import { CollisionGrid, type Solid } from '../sim/collision'
import { WATER_LEVEL, clampToValley, heightAt, slopeAt, surfaceAt } from '../sim/terrain'

export interface ControllerInputs {
  forward: number
  strafe: number
  jump: boolean
  sprint: boolean
  crouch: boolean
  lookX: number
  lookY: number
}

const WALK = 3.6
const SPRINT = 6.0
const CROUCH_SPEED = 1.8
const SWIM = 2.4
const GRAVITY = 20
const JUMP_SPEED = 6
const EYE_STAND = 1.66
const EYE_CROUCH = 1.05
export const PLAYER_RADIUS = 0.38
/** steeper than this and you slide off rather than climb */
const MAX_SLOPE = 0.36
const COYOTE = 0.12

export class PlayerController {
  readonly position = new THREE.Vector3(0, 0, 26)
  readonly velocity = new THREE.Vector3()
  yaw = Math.PI
  pitch = -0.04

  onGround = true
  crouching = false
  sprinting = false
  swimming = false
  /** 0..1 relative to a sprint */
  gait = 0

  private eyeHeight = EYE_STAND
  private bobPhase = 0
  private bobAmount = 0
  private landImpact = 0
  private coyote = 0
  private grid: CollisionGrid | null = null
  private scratch: Solid[] = []
  private walked = 0
  private lastStep = 0

  onFootstep: ((surface: string, running: boolean) => void) | null = null

  constructor(x = 0, z = 26) {
    this.position.set(x, heightAt(x, z), z)
  }

  setWorld(grid: CollisionGrid): void {
    this.grid = grid
  }

  get eye(): number {
    return this.eyeHeight
  }

  teleport(x: number, z: number): void {
    this.position.set(x, heightAt(x, z) + 0.2, z)
    this.velocity.set(0, 0, 0)
  }

  update(dt: number, input: ControllerInputs): void {
    // --- look ---------------------------------------------------------------
    this.yaw -= input.lookX
    this.pitch -= input.lookY
    this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.03, Math.PI / 2 - 0.03)
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2

    // --- what we are standing in --------------------------------------------
    this.swimming = WATER_LEVEL - this.position.y > 0.6

    const wanted = new THREE.Vector2(input.strafe, input.forward)
    if (wanted.lengthSq() > 1) wanted.normalize()

    this.crouching = input.crouch && !this.swimming
    this.sprinting = input.sprint && !this.crouching && wanted.y > 0.1 && !this.swimming

    const targetEye = this.crouching ? EYE_CROUCH : EYE_STAND
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, dt * 12)

    const speed = this.swimming ? SWIM
      : this.crouching ? CROUCH_SPEED
        : this.sprinting ? SPRINT : WALK

    // --- horizontal ----------------------------------------------------------
    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    const wishX = wanted.x * cos - wanted.y * sin
    const wishZ = -wanted.x * sin - wanted.y * cos

    const control = this.onGround || this.swimming ? 14 : 3
    this.velocity.x += (wishX * speed - this.velocity.x) * Math.min(1, dt * control)
    this.velocity.z += (wishZ * speed - this.velocity.z) * Math.min(1, dt * control)

    // --- vertical ------------------------------------------------------------
    if (this.swimming) {
      const target = WATER_LEVEL - 0.4
      const buoyancy = (target - this.position.y) * 6
      this.velocity.y += (buoyancy - this.velocity.y * 3) * dt * 4
      if (input.jump) this.velocity.y += 7 * dt
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

    // --- integrate and collide -----------------------------------------------
    this.moveHorizontally(
      clampToValley(this.position.x + this.velocity.x * dt),
      clampToValley(this.position.z + this.velocity.z * dt),
    )
    this.position.y += this.velocity.y * dt

    const floor = heightAt(this.position.x, this.position.z)
    if (this.position.y <= floor) {
      if (!this.onGround && this.velocity.y < -6) {
        this.landImpact = Math.min(1, -this.velocity.y / 17)
      }
      this.position.y = floor
      this.velocity.y = 0
      this.onGround = true
    } else if (this.position.y > floor + 0.06) {
      this.onGround = false
    }

    // --- bob and footsteps ----------------------------------------------------
    const planar = Math.hypot(this.velocity.x, this.velocity.z)
    this.gait = Math.min(1, planar / SPRINT)
    const moving = planar > 0.4 && (this.onGround || this.swimming)
    this.bobAmount += ((moving ? Math.min(1, planar / WALK) : 0) - this.bobAmount) * Math.min(1, dt * 8)
    if (moving) {
      this.bobPhase += dt * (this.sprinting ? 8.6 : this.crouching ? 4 : 6.2)
      this.walked += planar * dt
      if (this.walked - this.lastStep > (this.sprinting ? 2.1 : 1.7)) {
        this.lastStep = this.walked
        const surface = this.swimming ? 'water' : surfaceAt(this.position.x, this.position.z)
        this.onFootstep?.(surface, this.sprinting)
      }
    }
    this.landImpact = Math.max(0, this.landImpact - dt * 3)
  }

  private moveHorizontally(nextX: number, nextZ: number): void {
    const probe = { x: nextX, z: nextZ }

    if (this.grid) {
      const feet = Math.max(0, this.position.y - heightAt(this.position.x, this.position.z))
      const wantedX = probe.x
      const wantedZ = probe.z
      if (this.grid.resolve(probe, PLAYER_RADIUS, feet, this.scratch)) {
        // slide: take out only the part of the velocity going into the surface
        const nx = probe.x - wantedX
        const nz = probe.z - wantedZ
        const len = Math.hypot(nx, nz)
        if (len > 1e-6) {
          const ux = nx / len
          const uz = nz / len
          const into = this.velocity.x * ux + this.velocity.z * uz
          if (into < 0) {
            this.velocity.x -= ux * into
            this.velocity.z -= uz * into
          }
        }
        this.velocity.x *= 0.94
        this.velocity.z *= 0.94
      }
    }

    // ground too steep to stand on is a wall
    if (!this.swimming) {
      const slope = slopeAt(probe.x, probe.z)
      if (slope > MAX_SLOPE && heightAt(probe.x, probe.z) > this.position.y + 0.4) {
        probe.x = this.position.x
        probe.z = this.position.z
        this.velocity.x *= 0.2
        this.velocity.z *= 0.2
      }
    }

    this.position.x = clampToValley(probe.x)
    this.position.z = clampToValley(probe.z)
  }

  /** Put the camera at the eyes. Returns the field of view for this frame. */
  applyTo(camera: THREE.PerspectiveCamera, baseFov: number, dt: number): number {
    const bobY = Math.sin(this.bobPhase * 2) * 0.04 * this.bobAmount
    const bobX = Math.cos(this.bobPhase) * 0.032 * this.bobAmount
    camera.position.set(
      this.position.x + bobX * Math.cos(this.yaw),
      this.position.y + this.eyeHeight + bobY - this.landImpact * 0.24,
      this.position.z - bobX * Math.sin(this.yaw),
    )
    camera.rotation.set(this.pitch, this.yaw, Math.sin(this.bobPhase) * 0.006 * this.bobAmount, 'YXZ')
    const target = baseFov + (this.sprinting ? 4 : 0) + (this.swimming ? -3 : 0)
    return camera.fov + (target - camera.fov) * Math.min(1, dt * 6)
  }

  forwardVector(out: THREE.Vector3): THREE.Vector3 {
    const cosPitch = Math.cos(this.pitch)
    return out.set(-Math.sin(this.yaw) * cosPitch, Math.sin(this.pitch), -Math.cos(this.yaw) * cosPitch)
  }

  eyePosition(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.position.x, this.position.y + this.eyeHeight, this.position.z)
  }

  get underwater(): boolean {
    return this.position.y + this.eyeHeight < WATER_LEVEL
  }
}
