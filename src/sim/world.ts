import { Creature } from './creature'
import type { FoodEffect } from './biochem'
import { FOOD_EFFECTS } from './biochem'
import { mulberry32, type RNG } from './rng'
import type { Vec2 } from './creature'
import { CITY_PLACES } from './city'

/**
 * World — a small procedural valley with terrain height, a stream,
 * edible berry bushes, a den, and a day/night clock. Seeded and compact.
 */

export interface Plant {
  id: number
  pos: Vec2
  berries: number
  regrow: number
}

export interface WorldState {
  seed: number
  dayTime: number
  size: number
  plants: Plant[]
  waterPoints: Vec2[]
  den: Vec2
  flatZones: { x: number; z: number; r: number; y: number }[]
  colliders: { x: number; z: number; r: number }[]
}

function latticeNoise(x: number, z: number, seed: number): number {
  return mulberry32(seed + x * 7349 + z * 9151)()
}

export function valueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const tx = x - x0
  const tz = z - z0
  const sx = tx * tx * (3 - 2 * tx)
  const sz = tz * tz * (3 - 2 * tz)
  const north = latticeNoise(x0, z0, seed) * (1 - sx) + latticeNoise(x0 + 1, z0, seed) * sx
  const south = latticeNoise(x0, z0 + 1, seed) * (1 - sx) + latticeNoise(x0 + 1, z0 + 1, seed) * sx
  return north * (1 - sz) + south * sz
}

function sampleHeight(x: number, z: number, seed: number): number {
  const base = valueNoise(x * 0.08, z * 0.08, seed)
  const mid = valueNoise(x * 0.3, z * 0.3, seed + 99) * 0.5
  return base * 0.7 + mid * 0.3
}

export class World {
  state: WorldState
  rng: RNG

  constructor(seed: number, size = 40) {
    this.rng = mulberry32(seed)
    this.state = {
      seed,
      dayTime: 0.5, // start at bright noon
      size,
      plants: [],
      waterPoints: [],
      den: { x: 0, z: 0 },
      flatZones: [],
      colliders: [],
    }
    // The old city uses a level foundation. Water is available from the
    // public fountain in Ashen Park; food and other resources come from
    // explicit, learnable city places rather than anonymous wilderness props.
    const park = CITY_PLACES.find((place) => place.id === 'park')!
    this.state.waterPoints.push({ ...park.pos })
    this.state.den = { ...CITY_PLACES.find((place) => place.id === 'homes')!.pos }
  }

  height(x: number, z: number): number {
    void x
    void z
    return 0.5
  }

  /** Carve a level pad for a structure. */
  addFlatZone(x: number, z: number, r: number): void {
    const y = sampleHeight(x, z, this.state.seed)
    this.state.flatZones.push({ x, z, r, y })
  }

  /** Advance world clock (day/night). */
  tick(): void {
    this.state.dayTime = (this.state.dayTime + 1 / 6000) % 1
    for (const p of this.state.plants) {
      if (p.berries < 3 && p.regrow <= 0) p.berries++
      else if (p.berries < 3 && p.regrow > 0) p.regrow--
    }
  }

  nearestFood(pos: Vec2, maxDist = 12): Vec2 | null {
    let best: Vec2 | null = null
    let bd = maxDist
    for (const p of this.state.plants) {
      if (p.berries <= 0) continue
      const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z)
      if (d < bd) {
        bd = d
        best = p.pos
      }
    }
    return best
  }

  nearestWater(pos: Vec2, maxDist = 12): Vec2 | null {
    let best: Vec2 | null = null
    let bd = maxDist
    for (const w of this.state.waterPoints) {
      const d = Math.hypot(w.x - pos.x, w.z - pos.z)
      if (d < bd) {
        bd = d
        best = w
      }
    }
    return best
  }

  nearestCreature(pos: Vec2, creatures: Creature[], selfId: number, maxDist = 10): Vec2 | null {
    let best: Vec2 | null = null
    let bd = maxDist
    for (const c of creatures) {
      if (!c.alive || c.id === selfId) continue
      const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z)
      if (d < bd) {
        bd = d
        best = c.pos
      }
    }
    return best
  }

  /** Danger comes from darkness, the city edge, and the illicit back alley. */
  dangerAt(pos: Vec2, dayTime: number): number {
    const night = dayTime > 0.75 || dayTime < 0.12 ? 0.35 : 0
    const edge = Math.abs(pos.x) > this.state.size - 6 || Math.abs(pos.z) > this.state.size - 6 ? 0.3 : 0
    const alley = CITY_PLACES.find((place) => place.id === 'back-alley')!
    const alleyDanger = Math.hypot(pos.x - alley.pos.x, pos.z - alley.pos.z) < alley.radius + 3 ? alley.danger : 0
    return Math.min(1, night + edge + alleyDanger)
  }

  eatAt(pos: Vec2): FoodEffect | null {
    for (const p of this.state.plants) {
      if (Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < 1.0 && p.berries > 0) {
        p.berries--
        p.regrow = 120
        return FOOD_EFFECTS.berry
      }
    }
    return null
  }

  // ── collision: static colliders (rocks, trees, structures) ──
  /** Register a static circular collider (world units). */
  addCollider(x: number, z: number, r: number): void {
    this.state.colliders.push({ x, z, r })
  }

  /** Push a circle of radius `radius` out of any overlapping collider. */
  resolveCollision(pos: Vec2, radius: number): Vec2 {
    const out = { ...pos }
    for (const c of this.state.colliders) {
      const dx = out.x - c.x
      const dz = out.z - c.z
      const d = Math.hypot(dx, dz)
      const min = c.r + radius
      if (d < min && d > 0.0001) {
        const push = min - d
        out.x += (dx / d) * push
        out.z += (dz / d) * push
      } else if (d <= 0.0001) {
        out.x = c.x + min
      }
    }
    return out
  }

  /** True if the circle at pos overlaps a collider (for spawning checks). */
  collides(pos: Vec2, radius: number): boolean {
    for (const c of this.state.colliders) {
      if (Math.hypot(pos.x - c.x, pos.z - c.z) < c.r + radius) return true
    }
    return false
  }

  toJSON(): WorldState {
    return JSON.parse(JSON.stringify(this.state))
  }

  static fromJSON(s: WorldState): World {
    const w = new World(s.seed, s.size)
    w.state = JSON.parse(JSON.stringify(s))
    w.rng = mulberry32(s.seed)
    return w
  }
}
