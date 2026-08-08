import { Creature } from './creature'
import type { FoodEffect } from './biochem'
import { FOOD_EFFECTS } from './biochem'
import { int, mulberry32, range, type RNG } from './rng'
import type { Vec2 } from './creature'

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
}

export function valueNoise(x: number, z: number, seed: number): number {
  const r = mulberry32(seed + Math.floor(x) * 7349 + Math.floor(z) * 9151)
  return r()
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
    }
    // stream along z axis at x ≈ -6 with meander
    for (let z = -size; z <= size; z += 2) {
      const meander = Math.sin(z * 0.3 + seed) * 3
      this.state.waterPoints.push({ x: -6 + meander, z })
    }
    this.state.den = { x: 8, z: 4 }
    const plantCount = 36
    for (let i = 0; i < plantCount; i++) {
      const x = range(this.rng, -size + 4, size - 4)
      const z = range(this.rng, -size + 4, size - 4)
      const h = this.height(x, z)
      if (h < 0.25) continue // don't plant in the stream
      this.state.plants.push({ id: i, pos: { x, z }, berries: int(this.rng, 1, 4), regrow: 0 })
    }
  }

  height(x: number, z: number): number {
    let h = sampleHeight(x, z, this.state.seed)
    for (const zone of this.state.flatZones) {
      const d = Math.hypot(x - zone.x, z - zone.z)
      if (d < zone.r) {
        const edge = Math.max(0, Math.min(1, (d - zone.r * 0.6) / (zone.r * 0.4)))
        h = zone.y + (h - zone.y) * (edge * edge * (3 - 2 * edge))
      }
    }
    return h
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

  /** Danger: for now, night time is mildly scary; later: predators. */
  dangerAt(pos: Vec2, dayTime: number): number {
    const night = dayTime > 0.75 || dayTime < 0.12 ? 0.6 : 0
    const edge = Math.abs(pos.x) > this.state.size - 6 || Math.abs(pos.z) > this.state.size - 6 ? 0.3 : 0
    return Math.min(1, night + edge)
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
