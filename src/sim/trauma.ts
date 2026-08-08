/**
 * trauma — the psychology engine. Creatures form lasting trauma memories
 * from terrifying events, develop PTSD (flashbacks, baseline fear, phobias),
 * and keep a trust score toward the player. Terrorise them and they will
 * remember — feed them and the scars slowly heal.
 */
import { clamp, type RNG } from './rng'

export type TraumaTrigger = 'shadow' | 'player' | 'drop' | 'fire' | 'noise' | 'poison' | 'abandonment'

export interface TraumaMemory {
  id: number
  trigger: TraumaTrigger
  intensity: number // 0..1
  createdAt: number // sim tick
  healTimer: number // ticks until it fades a notch
}

export interface PsycheState {
  memories: TraumaMemory[]
  baselineFear: number // permanent scarring 0..1
  trust: number // 0..1 toward the player
  addiction: Record<string, number> // substance -> 0..1
  flashbackTimer: number
  trustLastEvent: number
}

export function createPsyche(): PsycheState {
  return {
    memories: [],
    baselineFear: 0,
    trust: 0.5,
    addiction: { smoke: 0, sugar: 0, cactus: 0, mushroom: 0 },
    flashbackTimer: 0,
    trustLastEvent: 0,
  }
}

const TRIGGER_NAMES: Record<TraumaTrigger, string> = {
  shadow: 'the Shadow Beast',
  player: 'you',
  drop: 'falling from the sky',
  fire: 'fire',
  noise: 'a terrible noise',
  poison: 'poison',
  abandonment: 'being left alone in the dark',
}

export function triggerName(t: TraumaTrigger): string {
  return TRIGGER_NAMES[t]
}

/** A terrifying event etches a trauma memory. */
export function traumatise(psyche: PsycheState, trigger: TraumaTrigger, intensity: number, tick: number, nextId: () => number): TraumaMemory | null {
  const capped = Math.min(1, intensity)
  if (capped < 0.25) return null // minor scares don't scar
  // merge with a similar existing memory (stack intensity)
  const existing = psyche.memories.find((m) => m.trigger === trigger)
  if (existing) {
    existing.intensity = clamp(existing.intensity + capped * 0.4, 0, 1)
    existing.healTimer = 0
    return existing
  }
  const mem: TraumaMemory = { id: nextId(), trigger, intensity: capped, createdAt: tick, healTimer: 0 }
  psyche.memories.push(mem)
  if (psyche.memories.length > 4) {
    // oldest fades into baseline fear
    const oldest = psyche.memories.sort((a, b) => a.createdAt - b.createdAt)[0]
    psyche.memories = psyche.memories.filter((m) => m.id !== oldest.id)
    psyche.baselineFear = clamp(psyche.baselineFear + oldest.intensity * 0.15, 0, 1)
  }
  return mem
}

/**
 * Advance psyche each tick.
 * - memories slowly heal (fast when trust is high)
 * - flashbacks: a creature with heavy trauma may suddenly spike fear
 * - withdrawal: addicted creatures panic without their substance
 */
export function psycheTick(
  psyche: PsycheState,
  _tick: number,
  rng: RNG,
  ctx: {
    night: boolean
    triggerPresent: { shadow?: boolean; fire?: boolean; noise?: boolean; abandonment?: boolean }
    withdrawal?: string[]
  },
): { fearSpike: number; flashback: boolean; healed: boolean } {
  let fearSpike = 0
  let flashback = false
  let healed = false

  // heal memories
  for (const m of psyche.memories) {
    m.healTimer++
    const healEvery = psyche.trust > 0.6 ? 300 : 900
    if (m.healTimer > healEvery) {
      m.healTimer = 0
      m.intensity -= 0.1
      if (m.intensity <= 0.2) {
        psyche.memories = psyche.memories.filter((x) => x.id !== m.id)
        healed = true
      }
    }
  }

  // trigger presence spikes fear
  const present: TraumaTrigger[] = []
  if (ctx.triggerPresent.shadow) present.push('shadow')
  if (ctx.triggerPresent.fire) present.push('fire')
  if (ctx.triggerPresent.noise) present.push('noise')
  if (ctx.triggerPresent.abandonment) present.push('abandonment')
  for (const t of present) {
    const mem = psyche.memories.find((m) => m.trigger === t)
    if (mem) fearSpike += mem.intensity * 0.35
  }

  // flashbacks: deep trauma resurfaces at night / random
  if (psyche.memories.length > 0) {
    const total = psyche.memories.reduce((s, m) => s + m.intensity, 0)
    const chance = ctx.night ? 0.006 + total * 0.01 : 0.0015 + total * 0.002
    if (rng() < chance) {
      flashback = true
      const worst = psyche.memories.reduce((a, b) => (b.intensity > a.intensity ? b : a))
      fearSpike += worst.intensity * 0.8
    }
  }

  // withdrawal
  if (ctx.withdrawal && ctx.withdrawal.length > 0) {
    for (const sub of ctx.withdrawal) {
      if (psyche.addiction[sub] > 0.35) fearSpike += (psyche.addiction[sub] - 0.35) * 0.4
    }
  }

  // baseline fear never fully fades
  fearSpike += psyche.baselineFear * 0.5

  return { fearSpike, flashback, healed }
}

/** A creature with very low trust won't come when called, and flees you. */
export function trustReaction(psyche: PsycheState): { flee: boolean; ignoreCome: boolean; cower: boolean } {
  return {
    flee: psyche.trust < 0.18,
    ignoreCome: psyche.trust < 0.3,
    cower: psyche.trust < 0.12,
  }
}

export function trustLabel(trust: number): string {
  if (trust > 0.8) return 'devoted'
  if (trust > 0.6) return 'trusting'
  if (trust > 0.4) return 'wary'
  if (trust > 0.2) return 'afraid'
  return 'terrified'
}
