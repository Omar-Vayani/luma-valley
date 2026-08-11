/**
 * norms — settlement-level culture that emerges from behavior.
 *
 * Nobody writes the rules down. Each witnessed act nudges a shared expectation:
 * frequent unpunished theft erodes the property norm; frequent sharing
 * strengthens generosity. Norms then feed back into individual decisions
 * (conformity) and into how harshly the community reacts.
 *
 * Leaders are not appointed. Influence is earned through respect edges and
 * visible protection/generosity.
 */
import type { Creature } from './creature'
import { friendship } from './socialbond'
import { clamp01 } from './util'

export type NormKey =
  | 'property' // taking what isn't yours is wrong
  | 'nonviolence' // hitting others is wrong
  | 'honesty' // lying is wrong
  | 'generosity' // sharing is expected
  | 'loyalty' // sticking by kin/partners is expected
  | 'sobriety' // heavy substance use is frowned upon

export type Norms = Record<NormKey, number>

export const NORM_KEYS: NormKey[] = [
  'property', 'nonviolence', 'honesty', 'generosity', 'loyalty', 'sobriety',
]

export interface Culture {
  norms: Norms
  /** shared vocabulary that spread widely: concept -> word */
  sharedWords: Record<string, string>
  /** creatureId -> influence 0..1 */
  influence: Record<number, number>
  /** stable story beats worth remembering across generations */
  chronicle: { tick: number; text: string }[]
}

export function createCulture(): Culture {
  return {
    norms: {
      property: 0.65,
      nonviolence: 0.6,
      honesty: 0.55,
      generosity: 0.45,
      loyalty: 0.55,
      sobriety: 0.4,
    },
    sharedWords: {},
    influence: {},
    chronicle: [],
  }
}

const NUDGE = 0.012
const RESTORE = 0.0008

/**
 * A public act shifts the norm it touches. Violations erode; compliance and
 * visible disapproval reinforce.
 */
export function witnessedAct(
  culture: Culture,
  key: NormKey,
  violated: boolean,
  witnesses: number,
): void {
  const weight = Math.min(1, 0.4 + witnesses * 0.2)
  const delta = violated ? -NUDGE * weight : NUDGE * 0.6 * weight
  culture.norms[key] = clamp01(culture.norms[key] + delta)
}

/** Norms drift slowly back toward their baseline when nothing happens. */
export function tickCulture(culture: Culture): void {
  const baseline = 0.5
  for (const k of NORM_KEYS) {
    const n = culture.norms[k]
    culture.norms[k] = clamp01(n + (baseline - n) * RESTORE)
  }
}

/**
 * How strongly this creature feels bound by a norm: the community standard
 * filtered through personal conformity and values.
 */
export function normPressure(culture: Culture, c: Creature, key: NormKey): number {
  const shared = culture.norms[key]
  const conformity = c.drives.conformity
  const personal =
    key === 'property' ? 1 - c.genome.theft
      : key === 'nonviolence' ? 1 - c.genome.aggression
        : key === 'honesty' ? c.genome.loyalty
          : key === 'generosity' ? c.genome.sociability
            : key === 'loyalty' ? c.genome.loyalty
              : 1 - c.genome.addictionProne
  return clamp01(shared * (0.35 + conformity * 0.65) * 0.6 + personal * 0.4)
}

/**
 * Recompute who the community looks up to. Influence comes from earned
 * respect across many edges, not from a title.
 */
export function updateInfluence(culture: Culture, creatures: Creature[]): void {
  const next: Record<number, number> = {}
  for (const c of creatures) {
    if (!c.alive) continue
    let respect = 0
    let ties = 0
    for (const other of creatures) {
      if (other.id === c.id || !other.alive) continue
      const edge = other.social[c.id]
      if (!edge) continue
      respect += edge.respect * 0.6 + friendship(edge) * 0.4 - edge.fear * 0.2
      ties++
    }
    if (ties === 0) continue
    const reach = Math.min(1, ties / Math.max(3, creatures.length - 1))
    next[c.id] = clamp01((respect / ties) * 0.7 + reach * 0.3)
  }
  culture.influence = next
}

/** The most influential living creature, if anyone stands out. */
export function currentLeader(culture: Culture, creatures: Creature[]): Creature | null {
  let best: Creature | null = null
  let bestScore = 0.35 // threshold: leadership must be earned
  for (const c of creatures) {
    if (!c.alive) continue
    const score = culture.influence[c.id] ?? 0
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  return best
}

/** Record a society-level story beat (kept short for saves). */
export function chronicle(culture: Culture, tick: number, text: string): void {
  culture.chronicle.push({ tick, text })
  if (culture.chronicle.length > 40) culture.chronicle.splice(0, culture.chronicle.length - 40)
}

/**
 * Cultural transmission: a child absorbs vocabulary, place knowledge, and
 * norm-leaning from a parent. This is how knowledge crosses generations.
 */
export function transmitCulture(parent: Creature, child: Creature): void {
  for (const [concept, entry] of parent.language.vocab) {
    if (entry.strength < 0.3) continue
    child.language.vocab.set(concept, { word: entry.word, strength: entry.strength * 0.6 })
    child.language.wordToConcept.set(entry.word, concept)
  }
  for (const [place, level] of Object.entries(parent.knowledge)) {
    if (level > 0.5) child.knowledge[place] = Math.min(1, level * 0.5)
  }
  for (const [place, pref] of Object.entries(parent.memory.placePrefs)) {
    if (pref > 0.4) child.memory.placePrefs[place] = pref * 0.5
  }
  // children copy the parent's conformity/reciprocity leaning
  child.drives.conformity = clamp01((child.drives.conformity + parent.drives.conformity) / 2)
  child.drives.reciprocity = clamp01((child.drives.reciprocity + parent.drives.reciprocity) / 2)
}

/** Words that most of the settlement agrees on become "shared". */
export function updateSharedWords(culture: Culture, creatures: Creature[]): void {
  const tally = new Map<string, Map<string, number>>()
  const living = creatures.filter((c) => c.alive)
  if (living.length === 0) return
  for (const c of living) {
    for (const [concept, entry] of c.language.vocab) {
      if (entry.strength < 0.35) continue
      const words = tally.get(concept) ?? new Map<string, number>()
      words.set(entry.word, (words.get(entry.word) ?? 0) + 1)
      tally.set(concept, words)
    }
  }
  for (const [concept, words] of tally) {
    let bestWord = ''
    let bestCount = 0
    for (const [word, count] of words) {
      if (count > bestCount) {
        bestCount = count
        bestWord = word
      }
    }
    if (bestCount >= Math.max(2, Math.ceil(living.length * 0.5))) {
      culture.sharedWords[concept] = bestWord
    }
  }
}
