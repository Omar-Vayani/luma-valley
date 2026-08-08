import type { Vec2 } from './creature'
import { clamp } from './rng'

/**
 * ShadowBeast — a hostile presence that hunts creatures at night.
 * It scares creatures (fear spike), can wound them if it catches them,
 * is repelled by a lit torch, and dissolves at dawn.
 */
export interface ShadowBeastState {
  id: number
  pos: Vec2
  state: 'spawn' | 'hunt' | 'flee'
  health: number
  targetId: number | null
}

export class ShadowBeast {
  state: ShadowBeastState
  private speed = 0.28

  constructor(id: number, pos: Vec2) {
    this.state = { id, pos: { ...pos }, state: 'spawn', health: 1, targetId: null }
  }

  /** Advance. Returns events: 'attack' | 'flee' | 'dissolve'. */
  tick(
    ctx: {
      creatures: { id: number; pos: Vec2; alive: boolean; fear: number }[]
      playerPos: Vec2
      torchNear: boolean // torch is lit and close to this beast
      dayTime: number
    },
  ): string[] {
    const s = this.state
    const events: string[] = []
    // dissolve at dawn
    const night = ctx.dayTime > 0.72 || ctx.dayTime < 0.1
    if (!night) {
      events.push('dissolve')
      return events
    }
    // torch repels
    if (ctx.torchNear) {
      s.state = 'flee'
    } else {
      s.state = 'hunt'
    }
    if (s.state === 'flee') {
      // run away from player
      const away = Math.atan2(s.pos.z - ctx.playerPos.z, s.pos.x - ctx.playerPos.x)
      s.pos.x += Math.cos(away) * this.speed * 1.6
      s.pos.z += Math.sin(away) * this.speed * 1.6
      s.health = clamp(s.health - 0.02, 0, 1)
      if (s.health <= 0) events.push('dissolve')
      return events
    }
    // hunt: pick nearest alive creature
    let best: { id: number; pos: Vec2 } | null = null
    let bd = 40
    for (const c of ctx.creatures) {
      if (!c.alive) continue
      const d = Math.hypot(c.pos.x - s.pos.x, c.pos.z - s.pos.z)
      if (d < bd) {
        bd = d
        best = c
      }
    }
    if (best) {
      const ang = Math.atan2(best.pos.z - s.pos.z, best.pos.x - s.pos.x)
      s.pos.x += Math.cos(ang) * this.speed
      s.pos.z += Math.sin(ang) * this.speed
      if (bd < 1.4) {
        events.push('attack')
      }
    }
    return events
  }
}
