/**
 * sim — the valley, ticking.
 *
 * The loop is small on purpose: sense, decide, move, act, learn. Everything a
 * creature does comes out of `brain.ts`; this file's job is to give the brain
 * something true to look at, to carry out whatever it chose, and to hand back
 * a reward when the drives move.
 *
 * The one rule that matters here: a creature's body is resolved against the
 * *same* collision grid as the player's. There is no separate, more forgiving
 * physics for the AI, which is what used to let them wander into a wall and
 * stay there.
 */
import {
  ACTIONS, decide, hearWord, markChoice, perceive, associate, reinforce, reinforceAction,
  wordBias, bindCommand, type Action, type Senses,
} from './brain'
import { CollisionGrid, circle, type Solid } from './collision'
import {
  bodyRadius, createCreature, fleeSpeed, remember, walkSpeed, type Creature,
} from './creature'
import { aggravate, discomfort, relieve, tickDrives } from './drives'
import { clamp, clamp01, dist, mulberry32 } from './rng'
import { clampToValley, heightAt, isWalkable, POND, WATER_LEVEL } from './terrain'
import {
  buildVillage, buildingAt, doorInside, doorOutside, doorThreshold, isInside,
  type Building, type Place, type VillageModel,
} from './village'

// ---------------------------------------------------------------- events

export type SimEventType =
  | 'chirp' | 'happy' | 'hurt' | 'afraid' | 'eat' | 'drink' | 'snore'
  | 'greet' | 'play' | 'door' | 'splash' | 'learn'

export interface SimEvent {
  type: SimEventType
  x: number
  z: number
  /** which creature made it, so the mixer can rate-limit per creature */
  who: number
  /** 0..1 */
  strength: number
}

// ---------------------------------------------------------------- the player

export interface PlayerState {
  x: number
  z: number
  y: number
  /** true while the player is moving quickly, which creatures notice */
  rushing: boolean
  /** how many berries are in hand */
  berries: number
}

// ---------------------------------------------------------------- the world

/** A full day, in seconds. Twenty minutes: long enough to be a background. */
export const DAY_LENGTH = 1200

export interface SimOptions {
  seed?: number
  creatures?: number
}

export class Sim {
  readonly village: VillageModel
  readonly grid = new CollisionGrid(120)
  readonly creatures: Creature[] = []
  readonly player: PlayerState = { x: 0, z: 26, y: 0, rushing: false, berries: 3 }

  /**
   * Seconds since the world began; the clock everything else reads. A new
   * valley opens at nine in the morning rather than before dawn, because the
   * first thing anybody should see is the place in daylight.
   */
  time = DAY_LENGTH * 0.375
  events: SimEvent[] = []

  readonly seed: number

  private rand: () => number
  private scratch: Solid[] = []
  /** solids that move: the creatures themselves */
  private bodies: Solid[] = []

  constructor(opts: SimOptions = {}) {
    this.seed = opts.seed ?? 20260812
    this.rand = mulberry32(this.seed)
    this.village = buildVillage()
    this.grid.addAll(this.village.solids)

    const count = opts.creatures ?? 6
    for (let i = 0; i < count; i++) {
      const { x, z } = this.openSpotNear((i / count) * Math.PI * 2 + 0.6)
      this.creatures.push(createCreature(i, x, z, this.rand))
    }
  }

  /**
   * A clear patch on the green along a bearing. Spawning a creature inside a
   * barrel and letting the physics sort it out is not a plan.
   */
  private openSpotNear(bearing: number): { x: number; z: number } {
    for (let attempt = 0; attempt < 30; attempt++) {
      const a = bearing + (attempt % 2 === 0 ? 1 : -1) * attempt * 0.13
      const radius = 7 + (attempt % 7)
      const x = Math.sin(a) * radius
      const z = Math.cos(a) * radius
      if (isWalkable(x, z) && this.grid.isClear(x, z, 0.6, this.scratch)) return { x, z }
    }
    return { x: Math.sin(bearing) * 12, z: Math.cos(bearing) * 12 }
  }

  /** 0 at midnight, 0.5 at noon. */
  get dayPhase(): number {
    return (this.time % DAY_LENGTH) / DAY_LENGTH
  }

  /** 0 in full daylight, 1 in the middle of the night. */
  get darkness(): number {
    const p = this.dayPhase
    const daylight = Math.sin((p - 0.25) * Math.PI * 2) * 0.5 + 0.5
    return clamp01(1 - daylight * 1.35)
  }

  get isNight(): boolean {
    return this.darkness > 0.55
  }

  creature(id: number): Creature | undefined {
    return this.creatures.find((c) => c.id === id)
  }

  emit(type: SimEventType, x: number, z: number, who: number, strength = 1): void {
    this.events.push({ type, x, z, who, strength })
    if (this.events.length > 64) this.events.shift()
  }

  /** Drain the event queue. The audio mixer and the renderer take turns. */
  takeEvents(): SimEvent[] {
    const out = this.events
    this.events = []
    return out
  }

  // -------------------------------------------------------------- the tick

  tick(dt: number): void {
    const step = Math.min(dt, 0.1)
    this.time += step

    // Creatures are solid to each other, but only just — the body radius is
    // small so that walking past somebody is not a shoving match. The list is
    // index-aligned with `creatures` so that a body can be told to skip
    // itself; when it could not, every creature spent every tick being
    // violently pushed out of its own previous position and into the walls.
    this.bodies.length = 0
    for (const c of this.creatures) {
      this.bodies.push(circle(c.x, c.z, bodyRadius(c), 1.4, 'luma'))
    }

    for (let i = 0; i < this.creatures.length; i++) this.updateCreature(this.creatures[i], step, i)
    this.regrow(step)
  }

  private regrow(dt: number): void {
    for (const p of this.village.places) {
      if (p.kind !== 'food') continue
      p.amount = clamp01((p.amount ?? 0) + dt * 0.03)
    }
  }

  // -------------------------------------------------------------- one Luma

  private updateCreature(c: Creature, dt: number, index: number): void {
    c.age += dt
    c.inside = buildingAt(this.village, c.x, c.z)?.id ?? null

    // --- drives -----------------------------------------------------------
    tickDrives(c.drives, dt, c.genome.metabolism * (c.asleep ? 0.35 : 1))
    if (this.isNight && !c.inside) aggravate(c.drives, 'cold', dt * 0.012)
    else relieve(c.drives, 'cold', dt * 0.02)

    // Somebody you have learned to be afraid of is frightening to be near.
    // This is what closes the loop: standing over a Luma you have hit raises
    // its fear, getting away lowers it, and so running away is an action that
    // demonstrably makes things better — which is the only way the brain can
    // ever learn to do it.
    const pd = this.playerDistance(c)
    if (c.threat > 0.2) {
      const looming = Math.max(0, 1 - pd / 9)
      if (looming > 0) aggravate(c.drives, 'fear', dt * c.threat * looming * 0.5)
    }
    if (pd > 12) relieve(c.drives, 'fear', dt * 0.06)

    c.alarm = Math.max(c.drives.fear, c.alarm - dt * 0.5)
    c.attentionLeft = Math.max(0, c.attentionLeft - dt)
    if (c.attentionLeft <= 0) {
      c.attending = null
      c.listening = false
    }

    // --- sleep ------------------------------------------------------------
    if (c.asleep) {
      relieve(c.drives, 'fatigue', dt * 0.055)
      c.posture = 'sleep'
      c.vx = 0
      c.vz = 0
      // They wake when they are rested or when something frightens them.
      // Daylight used to force them awake, which meant a Luma that got tired
      // at noon could never do anything about it and simply stayed exhausted
      // until dusk.
      if (c.drives.fatigue < 0.08 || c.drives.fear > 0.45) {
        c.asleep = false
        remember(c, 'woke up')
      }
      if (Math.random() < dt * 0.25) this.emit('snore', c.x, c.z, c.id, 0.35)
      return
    }

    // --- sense ------------------------------------------------------------
    this.senseFor(c)
    perceive(c.brain, c.senses)
    associate(c.brain)

    // --- decide -----------------------------------------------------------
    c.actionTime += dt

    // A decision is reconsidered when the thing it set out to do is finished,
    // not on a timer. Re-deciding every few seconds regardless meant no
    // journey longer than one deliberation could ever be completed: they
    // would set off for a bed on the far side of the green, change their mind
    // halfway, and do that for ever. Fear still interrupts anything.
    const startled = c.drives.fear > 0.5 && c.action !== 'flee'
    const needsDecision =
      c.target == null ||
      startled ||
      (c.arrived && c.actionTime > this.actionLength(c)) ||
      // a journey that has taken this long is not going to end well
      (!c.arrived && c.actionTime > 45)

    if (needsDecision) {
      this.settleUp(c)
      this.chooseAction(c)
    }

    // --- move and act -----------------------------------------------------
    this.stepMotion(c, dt, index)
    this.performAction(c, dt)
  }

  /** How long a Luma sticks with a choice before reconsidering. */
  private actionLength(c: Creature): number {
    if (c.action === 'flee') return 1.2
    if (c.action === 'listen') return 0.6
    if (c.action === 'sleep' || c.action === 'rest') return 4
    return 2.4 + c.genome.curiosity * 1.5
  }

  /**
   * Pay for the action that just finished. The reward is simply how much the
   * drives fell while it ran — no table of "eating is good", because eating
   * when you are not hungry then correctly teaches nothing.
   */
  private settleUp(c: Creature): void {
    if (c.actionTime <= 0.1) return
    const now = discomfort(c.drives)
    const change = c.discomfortAtStart - now
    reinforce(c.brain, clamp(change * 7, -1, 1))
  }

  private chooseAction(c: Creature): void {
    const bias = c.heard.length > 0 ? wordBias(c.brain, c.heard) : null
    const choice = decide(c.brain, (a) => this.canDo(c, a), this.rand, bias, this.reflexes(c))
    c.heard = []
    this.beginAction(c, choice.action)
  }

  /**
   * The floor under the learning.
   *
   * A brain trained only by reward can learn its way into a corner: a Luma
   * that never happened to eat while hungry early on has nothing telling it
   * that eating helps, and one was observed sitting at maximum hunger for
   * hours without ever trying. Animals do not work like that — past a certain
   * point a drive stops being an opinion and starts being a reflex.
   *
   * These are deliberately narrow. They only apply when a drive is already
   * desperate, they only ever push towards the one thing that answers it, and
   * they are added at the moment of choosing rather than trained in, so they
   * never overwrite what the creature has learned.
   */
  private reflexes(c: Creature): Float32Array {
    const out = new Float32Array(ACTIONS.length)
    const urge = (drive: number, from: number, action: Action, strength: number): void => {
      if (drive <= from) return
      out[ACTIONS.indexOf(action)] += ((drive - from) / (1 - from)) * strength
    }
    urge(c.drives.hunger, 0.75, 'eat', 2.2)
    urge(c.drives.thirst, 0.75, 'drink', 2.2)
    urge(c.drives.fatigue, 0.8, 'sleep', 1.8)
    urge(c.drives.cold, 0.8, 'warm', 1.5)
    urge(Math.max(c.drives.fear, c.drives.pain), 0.55, 'flee', 2.5)
    return out
  }

  /**
   * Commit to an action.
   *
   * The `discomfortAtStart` snapshot is taken *here*, after whatever caused
   * the change has already been applied. That ordering is the whole of credit
   * assignment: when a Luma is hit, the pain lands first and the snapshot is
   * taken second, so running away is judged on the fear that follows rather
   * than being blamed for the blow that preceded it. Getting this backwards
   * taught them that running away was the worst thing they could possibly do.
   */
  private beginAction(c: Creature, action: Action): void {
    c.action = action
    c.actionTime = 0
    c.arrived = false
    c.discomfortAtStart = discomfort(c.drives)
    markChoice(c.brain, action)
    this.setTargetFor(c, action)
    if (c.route.length === 0) c.arrived = true
  }

  // -------------------------------------------------------------- senses

  private senseFor(c: Creature): void {
    const s = c.senses
    for (const k of Object.keys(c.drives) as Array<keyof typeof c.drives>) {
      s[k] = c.drives[k]
    }

    const near = (kind: Place['kind'], range: number): number => {
      const p = this.nearestPlace(c, kind)
      if (!p) return 0
      const d = dist(c.x, c.z, p.x, p.z)
      return clamp01(1 - d / range)
    }

    s.food = Math.max(near('food', 26), this.player.berries > 0 && this.playerDistance(c) < 4 ? 0.8 : 0)
    s.water = near('water', 30)
    s.bed = near('bed', 30)
    s.fire = near('fire', 26)
    s.toy = near('toy', 22)

    const friend = this.nearestFriend(c)
    s.friend = friend ? clamp01(1 - dist(c.x, c.z, friend.x, friend.z) / 16) : 0

    const pd = this.playerDistance(c)
    s.player = clamp01(1 - pd / 22)
    s.playerClose = clamp01(1 - pd / 4)
    s.trust = c.trust
    s.threat = c.threat
    s.indoors = c.inside ? 1 : 0
    s.dark = this.darkness
    s.heard = c.heard.length > 0 ? 1 : Math.max(0, s.heard - 0.12)
    s.touched = Math.max(0, s.touched - 0.05)
  }

  /**
   * Is this action physically possible right now? Gating impossible actions
   * out of the choice keeps a Luma from trying to eat thin air; everything
   * merely *unhelpful* is left in, so the brain has something to be wrong
   * about and therefore something to learn from.
   *
   * Public because the neural interface greys out what is unavailable, and it
   * must be reading the same answer the creature is.
   */
  canDo(c: Creature, a: Action): boolean {
    switch (a) {
      case 'eat':
        return this.nearestPlace(c, 'food') != null ||
          (this.player.berries > 0 && this.playerDistance(c) < 5)
      case 'drink':
        return this.nearestPlace(c, 'water') != null
      case 'sleep':
        return c.drives.fatigue > 0.3 && c.drives.fear < 0.4
      case 'play':
        return this.nearestPlace(c, 'toy') != null || this.nearestFriend(c) != null
      case 'socialise':
        return this.nearestFriend(c) != null
      case 'warm':
        return this.nearestPlace(c, 'fire') != null
      case 'shelter':
        return c.inside == null && this.village.buildings.length > 0
      case 'approach':
        return this.playerDistance(c) < 26 && c.drives.fear < 0.5
      case 'flee':
        // fresh fear, fresh pain, or simply having learned that you are
        // somebody worth keeping away from
        return c.drives.fear > 0.15 || c.drives.pain > 0.15 ||
          (c.threat > 0.4 && this.playerDistance(c) < 14)
      case 'listen':
        return c.attending != null
      default:
        return true
    }
  }

  // -------------------------------------------------------------- targets

  private setTargetFor(c: Creature, a: Action): void {
    const go = (x: number, z: number): void => this.route(c, x, z)
    switch (a) {
      case 'eat': {
        if (this.player.berries > 0 && this.playerDistance(c) < 5) {
          go(this.player.x, this.player.z)
          break
        }
        const p = this.nearestPlace(c, 'food')
        if (p) go(p.x, p.z)
        break
      }
      case 'drink': {
        const p = this.nearestPlace(c, 'water')
        if (p) go(p.x, p.z)
        break
      }
      case 'sleep': {
        const p = this.nearestPlace(c, 'bed')
        if (p) go(p.x, p.z)
        else this.stayPut(c)
        break
      }
      case 'play': {
        const p = this.nearestPlace(c, 'toy')
        const friend = this.nearestFriend(c)
        if (p && (!friend || this.rand() < 0.6)) go(p.x, p.z)
        else if (friend) go(friend.x, friend.z)
        break
      }
      case 'socialise': {
        const friend = this.nearestFriend(c)
        if (friend) go(friend.x, friend.z)
        break
      }
      case 'warm': {
        const p = this.nearestPlace(c, 'fire')
        if (p) go(p.x, p.z)
        break
      }
      case 'shelter': {
        const b = this.nearestBuilding(c)
        if (b) {
          const inn = doorInside(b)
          go(inn.x, inn.z)
        }
        break
      }
      case 'approach':
        go(this.player.x, this.player.z)
        break
      case 'flee': {
        // straight away from whatever frightened them, but to somewhere they
        // can actually stand
        const away = Math.atan2(c.x - this.player.x, c.z - this.player.z)
        for (let attempt = 0; attempt < 6; attempt++) {
          const a2 = away + (this.rand() - 0.5) * 1.2
          const d = 12 + this.rand() * 8
          const x = clampToValley(c.x + Math.sin(a2) * d)
          const z = clampToValley(c.z + Math.cos(a2) * d)
          if (isWalkable(x, z) && this.grid.isClear(x, z, bodyRadius(c) + 0.2, this.scratch)) {
            this.route(c, x, z)
            return
          }
        }
        this.route(c, clampToValley(c.x + Math.sin(away) * 8), clampToValley(c.z + Math.cos(away) * 8))
        break
      }
      case 'listen':
      case 'rest':
        this.stayPut(c)
        break
      default: {
        // wander: somewhere nearby, open, and on land
        for (let attempt = 0; attempt < 8; attempt++) {
          const a2 = this.rand() * Math.PI * 2
          const d = 4 + this.rand() * 12
          const x = clampToValley(c.x + Math.sin(a2) * d)
          const z = clampToValley(c.z + Math.cos(a2) * d)
          if (isWalkable(x, z) && this.grid.isClear(x, z, bodyRadius(c) + 0.3, this.scratch)) {
            this.route(c, x, z)
            return
          }
        }
        this.stayPut(c)
      }
    }
  }

  private stayPut(c: Creature): void {
    c.target = { x: c.x, z: c.z }
    c.route = []
  }

  /**
   * Work out how to get there. Walls are solid and doors are the only way
   * through them, so a trip that crosses a wall is broken into legs that go
   * via the doorway. This is the whole of the navigation system, and it is
   * enough because there is exactly one door per building.
   */
  private route(c: Creature, x: number, z: number): void {
    const from = c.inside ? this.village.buildings.find((b) => b.id === c.inside) ?? null : null
    const to = this.village.buildings.find((b) => isInside(b, x, z, 0.4)) ?? null
    const legs: Array<{ x: number; z: number }> = []

    if (from && from !== to) {
      legs.push(doorInside(from), doorThreshold(from), doorOutside(from))
    }
    if (to && to !== from) {
      legs.push(doorOutside(to), doorThreshold(to), doorInside(to))
    }
    legs.push({ x, z })

    // Walk the legs that happen outside and bend them around any building in
    // the way. Without this a Luma steers straight at its goal, meets the back
    // of the longhouse, and spends the rest of the afternoon leaning on it.
    const planned: Array<{ x: number; z: number }> = []
    let cursor = { x: c.x, z: c.z }
    for (const leg of legs) {
      const insideEither = (b: Building): boolean => b === from || b === to
      for (const point of this.around(cursor, leg, insideEither, 0)) planned.push(point)
      planned.push(leg)
      cursor = leg
    }

    c.target = planned[planned.length - 1]
    c.route = planned
  }

  /**
   * Waypoints that take a straight line around whatever building blocks it.
   *
   * Buildings are treated as circles here rather than boxes: a shade
   * conservative, but it keeps a Luma a comfortable distance off the corner
   * instead of grazing it, and it makes the geometry a two-line calculation
   * instead of a segment-versus-oriented-box test.
   */
  private around(
    from: { x: number; z: number },
    to: { x: number; z: number },
    skip: (b: Building) => boolean,
    depth: number,
  ): Array<{ x: number; z: number }> {
    if (depth >= 3) return []

    const dx = to.x - from.x
    const dz = to.z - from.z
    const length = Math.hypot(dx, dz)
    if (length < 0.5) return []
    const ux = dx / length
    const uz = dz / length

    let blocker: Building | null = null
    let blockerAt = Infinity
    let blockerRadius = 0
    for (const b of this.village.buildings) {
      if (skip(b)) continue
      const radius = Math.hypot(b.width, b.depth) / 2 + 1.1
      // how far along the segment the building's centre projects
      const along = (b.x - from.x) * ux + (b.z - from.z) * uz
      if (along < -radius || along > length + radius) continue
      const clamped = Math.max(0, Math.min(length, along))
      const nearestX = from.x + ux * clamped
      const nearestZ = from.z + uz * clamped
      const gap = Math.hypot(b.x - nearestX, b.z - nearestZ)
      if (gap >= radius) continue
      if (along < blockerAt) {
        blocker = b
        blockerAt = along
        blockerRadius = radius
      }
    }
    if (!blocker) return []

    // step out sideways far enough to clear it, on whichever side is nearer
    const side = Math.sign((blocker.x - from.x) * uz - (blocker.z - from.z) * ux) || 1
    const perpX = -uz * side
    const perpZ = ux * side
    const waypoint = {
      x: clampToValley(blocker.x + perpX * blockerRadius),
      z: clampToValley(blocker.z + perpZ * blockerRadius),
    }

    return [
      ...this.around(from, waypoint, skip, depth + 1),
      waypoint,
      ...this.around(waypoint, to, skip, depth + 1),
    ]
  }

  // -------------------------------------------------------------- movement

  private stepMotion(c: Creature, dt: number, index: number): void {
    const goal: { x: number; z: number } | null = c.route[0] ?? null
    const frightened = c.action === 'flee'
    const speed = frightened ? fleeSpeed(c) : walkSpeed(c)

    if (c.listening) {
      // stop and listen: they hold still and turn to face you
      c.vx *= Math.max(0, 1 - dt * 9)
      c.vz *= Math.max(0, 1 - dt * 9)
      c.posture = 'listen'
      this.faceTowards(c, this.player.x, this.player.z, dt, 7)
    } else if (goal) {
      const dx = goal.x - c.x
      const dz = goal.z - c.z
      const d = Math.hypot(dx, dz)
      // doorway legs are hit precisely; the final leg only has to be reached
      const arriveAt = c.route.length > 1 ? 0.3 : this.arriveDistance(c)
      if (d < arriveAt) {
        c.route.shift()
        c.vx *= 0.4
        c.vz *= 0.4
        if (c.route.length === 0 && !c.arrived) {
          // the walking is done; the action proper starts now
          c.arrived = true
          c.actionTime = 0
        }
      } else {
        const wishX = (dx / d) * speed
        const wishZ = (dz / d) * speed
        const control = Math.min(1, dt * 6)
        c.vx += (wishX - c.vx) * control
        c.vz += (wishZ - c.vz) * control
        this.faceTowards(c, c.x + c.vx, c.z + c.vz, dt, 6)
      }
    } else {
      c.vx *= Math.max(0, 1 - dt * 6)
      c.vz *= Math.max(0, 1 - dt * 6)
    }

    // integrate, then resolve against the same grid the player uses
    const pos = { x: clampToValley(c.x + c.vx * dt), z: clampToValley(c.z + c.vz * dt) }
    const r = bodyRadius(c)
    const wantedX = pos.x
    const wantedZ = pos.z
    const hit = this.grid.resolve(pos, r, 0, this.scratch)
    if (hit) {
      // Slide along whatever was hit rather than stopping dead in front of
      // it. The direction the body was pushed is the surface normal, so
      // taking the velocity's component along that normal out leaves the part
      // that runs parallel to the wall — which is how you get round the back
      // of a building instead of leaning on it until the stuck-detector
      // notices. Steering straight at a goal and killing the speed on contact
      // is what pinned them to walls for minutes at a time.
      const nx = pos.x - wantedX
      const nz = pos.z - wantedZ
      const len = Math.hypot(nx, nz)
      if (len > 1e-6) {
        const ux = nx / len
        const uz = nz / len
        const into = c.vx * ux + c.vz * uz
        if (into < 0) {
          c.vx -= ux * into
          c.vz -= uz * into
        }
      }
      c.vx *= 0.92
      c.vz *= 0.92
    }
    // and against each other, softly — skipping their own body
    let shoved = false
    for (let i = 0; i < this.bodies.length; i++) {
      if (i === index) continue
      const body = this.bodies[i]
      if (body.shape !== 'circle') continue
      const dx = pos.x - body.x
      const dz = pos.z - body.z
      const min = body.r + r
      const d2 = dx * dx + dz * dz
      if (d2 < 1e-6 || d2 >= min * min) continue
      const d = Math.sqrt(d2)
      const push = ((min - d) / d) * 0.5
      pos.x += dx * push
      pos.z += dz * push
      shoved = true
    }
    // being pushed aside by a neighbour must not push you into a wall, so the
    // world gets the last word
    if (shoved) this.grid.resolve(pos, r, 0, this.scratch)

    // do not walk into the pond
    if (heightAt(pos.x, pos.z) < WATER_LEVEL + 0.15) {
      const away = Math.atan2(c.x - POND.x, c.z - POND.z)
      pos.x = c.x + Math.sin(away) * 0.3
      pos.z = c.z + Math.cos(away) * 0.3
      c.vx = 0
      c.vz = 0
    }

    c.x = pos.x
    c.z = pos.z

    const speedNow = Math.hypot(c.vx, c.vz)
    if (!c.listening) {
      c.posture = speedNow > 2.2 ? 'run' : speedNow > 0.15 ? 'walk' : c.posture === 'walk' || c.posture === 'run' ? 'stand' : c.posture
    }

    this.checkStuck(c, dt)
  }

  /**
   * How close counts as arrived. Generous, and different per action, because
   * most of these targets sit next to something solid — a creature that has
   * to reach the exact centre of a bed never arrives at all.
   */
  private arriveDistance(c: Creature): number {
    switch (c.action) {
      case 'approach': return 1.7
      case 'socialise': return 1.4
      case 'eat':
      case 'drink': return 1.4
      case 'sleep':
      case 'warm':
      case 'play': return 1.2
      case 'shelter': return 0.9
      default: return 0.7
    }
  }

  private faceTowards(c: Creature, x: number, z: number, dt: number, rate: number): void {
    const want = Math.atan2(x - c.x, z - c.z)
    let diff = ((want - c.facing + Math.PI) % (Math.PI * 2)) - Math.PI
    if (diff < -Math.PI) diff += Math.PI * 2
    c.facing += diff * Math.min(1, dt * rate)
  }

  /**
   * Nothing ruins a settlement faster than somebody standing in a doorway
   * pressing into it for ever. If a Luma has been trying to move and has not,
   * it gives up on where it was going and gets itself back into the open.
   */
  private checkStuck(c: Creature, dt: number): void {
    const moved = dist(c.x, c.z, c.lastX, c.lastZ)
    const trying = c.route.length > 0 && !c.listening && !c.asleep
    if (trying && moved < 0.02) c.stuckFor += dt
    else c.stuckFor = Math.max(0, c.stuckFor - dt * 2)
    c.lastX = c.x
    c.lastZ = c.z

    if (c.stuckFor < 0.9) return
    c.stuckFor = 0

    const r = bodyRadius(c)

    // First try: keep the goal, but go around. A step out to one side, chosen
    // because it is both clear and roughly on the way, is enough to get past
    // any one building; repeated, it walks the whole way round one.
    const goal = c.route[c.route.length - 1]
    if (goal) {
      const toGoal = Math.atan2(goal.x - c.x, goal.z - c.z)
      for (const turn of [Math.PI / 2, -Math.PI / 2, Math.PI * 0.75, -Math.PI * 0.75]) {
        for (const step of [2.5, 4.5]) {
          const a = toGoal + turn
          const x = clampToValley(c.x + Math.sin(a) * step)
          const z = clampToValley(c.z + Math.cos(a) * step)
          if (!isWalkable(x, z)) continue
          if (!this.grid.isClear(x, z, r + 0.2, this.scratch)) continue
          if (!this.grid.lineClear(c.x, c.z, x, z, r)) continue
          c.route.unshift({ x, z })
          c.vx = 0
          c.vz = 0
          return
        }
      }
    }

    // Second try: if they are indoors, the way out is the door.
    const building = c.inside ? this.village.buildings.find((b) => b.id === c.inside) : null
    if (building) {
      const out = doorOutside(building)
      c.route = [doorInside(building), out]
      c.target = out
      c.action = 'wander'
      c.arrived = false
      c.actionTime = 0
      return
    }

    // Last resort: step to any clear spot nearby and start over.
    for (let i = 0; i < 12; i++) {
      const a = this.rand() * Math.PI * 2
      const d = 1.2 + this.rand() * 2.5
      const x = clampToValley(c.x + Math.sin(a) * d)
      const z = clampToValley(c.z + Math.cos(a) * d)
      if (isWalkable(x, z) && this.grid.isClear(x, z, r + 0.15, this.scratch)) {
        c.x = x
        c.z = z
        c.vx = 0
        c.vz = 0
        this.route(c, x, z)
        c.action = 'wander'
        c.actionTime = 0
        return
      }
    }
  }

  // -------------------------------------------------------------- actions

  private performAction(c: Creature, dt: number): void {
    // an action only happens once the walking part of it is done
    const atTarget = c.arrived && c.route.length === 0

    switch (c.action) {
      case 'eat': {
        if (!atTarget) break
        const p = this.nearestPlace(c, 'food')
        if (p && dist(c.x, c.z, p.x, p.z) < 2.2 && (p.amount ?? 0) > 0.1) {
          p.amount = clamp01((p.amount ?? 0) - dt * 0.16)
          relieve(c.drives, 'hunger', dt * 0.34)
          c.posture = 'eat'
          if (Math.random() < dt * 1.2) this.emit('eat', c.x, c.z, c.id, 0.5)
        } else {
          // somebody got here first: go and find another bush rather than
          // standing at an empty one until the dwell timer runs out
          c.actionTime = 99
        }
        break
      }
      case 'drink': {
        if (!atTarget) break
        relieve(c.drives, 'thirst', dt * 0.4)
        c.posture = 'drink'
        if (Math.random() < dt * 0.8) this.emit('drink', c.x, c.z, c.id, 0.4)
        break
      }
      case 'sleep': {
        if (!atTarget) break
        c.asleep = true
        c.posture = 'sleep'
        remember(c, 'went to sleep')
        break
      }
      case 'play': {
        if (!atTarget) break
        relieve(c.drives, 'boredom', dt * 0.5)
        relieve(c.drives, 'loneliness', dt * 0.12)
        c.posture = 'play'
        if (Math.random() < dt * 0.7) this.emit('play', c.x, c.z, c.id, 0.5)
        break
      }
      case 'socialise': {
        if (!atTarget) break
        const friend = this.nearestFriend(c)
        if (friend && dist(c.x, c.z, friend.x, friend.z) < 3) {
          relieve(c.drives, 'loneliness', dt * 0.35)
          relieve(friend.drives, 'loneliness', dt * 0.2)
          this.faceTowards(c, friend.x, friend.z, dt, 5)
          if (Math.random() < dt * 0.35) this.emit('chirp', c.x, c.z, c.id, 0.35)
        }
        break
      }
      case 'warm': {
        if (!atTarget) break
        relieve(c.drives, 'cold', dt * 0.4)
        relieve(c.drives, 'boredom', dt * 0.05)
        c.posture = 'sit'
        break
      }
      case 'approach': {
        const pd = this.playerDistance(c)
        if (pd < 3) {
          this.faceTowards(c, this.player.x, this.player.z, dt, 5)
          relieve(c.drives, 'loneliness', dt * 0.18)
          relieve(c.drives, 'boredom', dt * 0.1)
          if (Math.random() < dt * 0.3) this.emit('greet', c.x, c.z, c.id, 0.4)
        }
        break
      }
      case 'flee': {
        c.posture = Math.hypot(c.vx, c.vz) > 1 ? 'run' : 'cower'
        if (Math.random() < dt * 0.6) this.emit('afraid', c.x, c.z, c.id, 0.6)
        break
      }
      case 'rest': {
        relieve(c.drives, 'fatigue', dt * 0.02)
        c.posture = 'sit'
        break
      }
      case 'listen': {
        c.posture = 'listen'
        break
      }
      default:
        break
    }
  }

  // -------------------------------------------------------------- queries

  playerDistance(c: Creature): number {
    return dist(c.x, c.z, this.player.x, this.player.z)
  }

  private nearestPlace(c: Creature, kind: Place['kind']): Place | null {
    let best: Place | null = null
    let bestD = Infinity
    for (const p of this.village.places) {
      if (p.kind !== kind) continue
      if (kind === 'food' && (p.amount ?? 0) < 0.15) continue
      const d = dist(c.x, c.z, p.x, p.z)
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
    return best
  }

  private nearestBuilding(c: Creature): Building | null {
    let best: Building | null = null
    let bestD = Infinity
    for (const b of this.village.buildings) {
      const d = dist(c.x, c.z, b.x, b.z)
      if (d < bestD) {
        bestD = d
        best = b
      }
    }
    return best
  }

  private nearestFriend(c: Creature): Creature | null {
    let best: Creature | null = null
    let bestD = 20
    for (const other of this.creatures) {
      if (other.id === c.id || other.asleep) continue
      const d = dist(c.x, c.z, other.x, other.z)
      if (d < bestD) {
        bestD = d
        best = other
      }
    }
    return best
  }

  /** The Luma nearest a point, within a range. Used for the crosshair. */
  creatureNear(x: number, z: number, range: number): Creature | null {
    let best: Creature | null = null
    let bestD = range
    for (const c of this.creatures) {
      const d = dist(c.x, c.z, x, z)
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
    return best
  }

  // -------------------------------------------------------------- the player

  /**
   * Say something to a Luma. They stop, turn and listen — unless they are too
   * frightened of you, in which case they bolt, which is itself an answer.
   */
  speakTo(c: Creature, words: string[]): { listened: boolean } {
    const scared = c.drives.fear > 0.55 || c.threat > 0.7
    c.heard = words.slice(0, 6)
    for (const w of c.heard) hearWord(c.brain, w, 0.8)
    c.senses.heard = 1

    if (scared) {
      c.attending = null
      c.listening = false
      this.beginAction(c, 'flee')
      return { listened: false }
    }

    c.attending = -1
    c.attentionLeft = 5.5
    c.listening = true
    this.beginAction(c, 'listen')
    this.emit('chirp', c.x, c.z, c.id, 0.3)
    return { listened: true }
  }

  /** Stop listening and get on with life. */
  stopListening(c: Creature): void {
    c.listening = false
    c.attending = null
    c.attentionLeft = 0
    c.actionTime = 99
  }

  /** A hand on the head. Pleasant, and the brain is told so. */
  pet(c: Creature): void {
    relieve(c.drives, 'loneliness', 0.3)
    relieve(c.drives, 'boredom', 0.18)
    relieve(c.drives, 'fear', 0.2)
    c.trust = clamp01(c.trust + 0.07)
    c.threat = clamp01(c.threat - 0.05)
    c.senses.touched = 1
    reinforceAction(c.brain, c.action, 0.6)
    for (const w of c.heard) bindCommand(c.brain, w, c.action, 0.35)
    remember(c, 'you were kind')
    this.emit('happy', c.x, c.z, c.id, 0.6)
  }

  /**
   * A smack with a stick. It hurts, it frightens, and — the part that was
   * missing before — the brain is punished for whatever it was doing and the
   * creature learns that you are the thing that did it.
   */
  strike(c: Creature): void {
    aggravate(c.drives, 'pain', 0.55)
    aggravate(c.drives, 'fear', 0.75)
    c.trust = clamp01(c.trust - 0.25)
    c.threat = clamp01(c.threat + 0.3)
    c.alarm = 1
    c.senses.touched = 1
    c.asleep = false
    reinforceAction(c.brain, c.action, -0.9)
    for (const w of c.heard) bindCommand(c.brain, w, c.action, -0.4)
    remember(c, 'you hurt them')

    // and they act on it immediately, rather than finishing their errand
    this.senseFor(c)
    perceive(c.brain, c.senses)
    c.listening = false
    c.attending = null
    this.beginAction(c, 'flee')
    this.emit('hurt', c.x, c.z, c.id, 1)
  }

  /**
   * Tell a Luma off. A negative reward with no pain and no fear attached, so
   * a habit can be broken without teaching them to be afraid of you.
   */
  punish(c: Creature, strength: number): void {
    reinforceAction(c.brain, c.action, -clamp01(strength))
    c.senses.touched = 1
    for (const w of c.heard) bindCommand(c.brain, w, c.action, -0.3)
    remember(c, 'you told them off')
  }

  /** Offer a berry. The most direct way there is of teaching a word. */
  feed(c: Creature): boolean {
    if (this.player.berries <= 0) return false
    this.player.berries--
    relieve(c.drives, 'hunger', 0.5)
    c.trust = clamp01(c.trust + 0.12)
    c.threat = clamp01(c.threat - 0.08)
    c.senses.touched = 1
    reinforceAction(c.brain, c.action, 0.85)
    // whatever you said as you fed them attaches to eating
    for (const w of c.heard) {
      hearWord(c.brain, w, 1)
      bindCommand(c.brain, w, 'eat', 0.5)
    }
    remember(c, 'you fed them')
    this.emit('eat', c.x, c.z, c.id, 0.7)
    return true
  }

  /**
   * Teach a word for an action outright: say the word, then show them. Used
   * by the "teach" control in the chat panel.
   */
  teach(c: Creature, word: string, action: Action): void {
    hearWord(c.brain, word, 1)
    bindCommand(c.brain, word, action, 0.75)
    c.trust = clamp01(c.trust + 0.02)
    this.emit('learn', c.x, c.z, c.id, 0.5)
    remember(c, `learned "${word}"`)
  }

  /**
   * Ask a Luma to do something now. Only works to the degree they have
   * actually learned the word — an unknown word does nothing, which is the
   * point.
   */
  command(c: Creature, words: string[]): { obeyed: Action | null; understanding: number } {
    const bias = wordBias(c.brain, words)
    if (!bias) return { obeyed: null, understanding: 0 }
    let best = -Infinity
    let bestAction: Action | null = null
    for (let a = 0; a < ACTIONS.length; a++) {
      if (bias[a] > best && this.canDo(c, ACTIONS[a])) {
        best = bias[a]
        bestAction = ACTIONS[a]
      }
    }
    const understanding = clamp01(best / 1.5)
    if (!bestAction || understanding < 0.18) return { obeyed: null, understanding }
    c.listening = false
    this.beginAction(c, bestAction)
    return { obeyed: bestAction, understanding }
  }

  /** Pick berries from a bush. The only gathering in the game. */
  pickBerries(x: number, z: number): boolean {
    for (const p of this.village.places) {
      if (p.kind !== 'food') continue
      if (dist(x, z, p.x, p.z) > 2.2) continue
      if ((p.amount ?? 0) < 0.3) return false
      p.amount = (p.amount ?? 0) - 0.3
      this.player.berries = Math.min(9, this.player.berries + 1)
      return true
    }
    return false
  }
}

export function createSim(opts: SimOptions = {}): Sim {
  return new Sim(opts)
}

/** Re-exported so the UI does not have to reach into two modules. */
export type { Action, Senses }
