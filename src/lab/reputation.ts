/**
 * reputation — social awareness + gossip network.
 *
 * Creatures OBSERVE third-party actions (a theft between two others, someone
 * defending a friend) and record PUBLIC REPUTATIONS per creatureId:
 *   { trust, thief, protector, aggressor }
 *
 * Reputation is stored per observer: `creature.reputation[targetId]` is what
 * THIS creature believes about `targetId` — hearsay included. Gossip spreads
 * beliefs to peers via the language module (shareWithNeighbors pattern), so a
 * creature can distrust a known thief it has never met.
 *
 * trust:      -1..1 (negative = distrust)
 * thief:      0..1 evidence of stealing
 * protector:  0..1 evidence of protecting/helping others
 * aggressor:  0..1 evidence of unprovoked aggression
 */
import type { Creature } from './creature'
import { sayWord, shareWithNeighbors } from './language'
import { clamp01 } from './util'

export interface Reputation {
  trust: number // -1..1
  thief: number // 0..1
  protector: number // 0..1
  aggressor: number // 0..1
}

export type ReputationMap = Record<number, Reputation>

export type ObservedKind = 'steal' | 'aggress' | 'protect' | 'share' | 'betray'

const clampTrust = (x: number): number => Math.min(1, Math.max(-1, x))

export function createReputation(): Reputation {
  return { trust: 0, thief: 0, protector: 0, aggressor: 0 }
}

/** Get (or lazily create) the observer's reputation entry for a target. */
export function getReputation(observer: Creature, targetId: number): Reputation {
  const existing = observer.reputation[targetId]
  if (existing) return existing
  const fresh = createReputation()
  observer.reputation[targetId] = fresh
  return fresh
}

/** How much this creature trusts `targetId` right now (-1..1, 0 = stranger). */
export function trustTowards(observer: Creature, targetId: number): number {
  return observer.reputation[targetId]?.trust ?? 0
}

/** How strongly the observer believes the target is a thief / protector / aggressor. */
export function reputationOf(observer: Creature, targetId: number): Reputation {
  return observer.reputation[targetId] ?? createReputation()
}

/**
 * Record a witnessed action. `kind` is what the observer SAW:
 *   'steal'   — actor robbed someone
 *   'betray'  — actor robbed/attacked a bonded partner (worse)
 *   'aggress' — actor started an unprovoked fight
 *   'protect' — actor defended a friend
 *   'share'   — actor gave resources to someone
 */
export function observeEvent(observer: Creature, kind: ObservedKind, actorId: number): void {
  const rep = getReputation(observer, actorId)
  switch (kind) {
    case 'steal':
      rep.thief = clamp01(rep.thief + 0.35)
      rep.trust = clampTrust(rep.trust - 0.3)
      break
    case 'betray':
      rep.thief = clamp01(rep.thief + 0.4)
      rep.trust = clampTrust(rep.trust - 0.55)
      break
    case 'aggress':
      rep.aggressor = clamp01(rep.aggressor + 0.35)
      rep.trust = clampTrust(rep.trust - 0.3)
      break
    case 'protect':
      rep.protector = clamp01(rep.protector + 0.4)
      rep.trust = clampTrust(rep.trust + 0.35)
      break
    case 'share':
      rep.protector = clamp01(rep.protector + 0.2)
      rep.trust = clampTrust(rep.trust + 0.2)
      break
  }
}

/**
 * Gossip: `from` tells `to` what it believes about `aboutId`. Hearsay is
 * weaker than direct observation (fidelity < 1), and it travels through the
 * language module — the speaker says its word for the concept ('danger' for
 * a thief/aggressor, 'help' for a protector) and the listener hears it.
 */
export function gossipSpread(from: Creature, to: Creature, aboutId: number): void {
  const src = from.reputation[aboutId]
  if (!src) return
  const FIDELITY = 0.6 // hearsay decays: you believe less of what you didn't see
  const dst = getReputation(to, aboutId)
  dst.trust = clampTrust(dst.trust + src.trust * FIDELITY)
  dst.thief = clamp01(dst.thief + src.thief * FIDELITY)
  dst.protector = clamp01(dst.protector + src.protector * FIDELITY)
  dst.aggressor = clamp01(dst.aggressor + src.aggressor * FIDELITY)
  // vocal/gestural channel: speak the word for what we saw
  const concept = src.trust < 0 ? 'danger' : 'help'
  const word = sayWord(from.language, concept)
  if (word) {
    shareWithNeighbors(from.language, to.language, concept, 0.4)
  }
}
