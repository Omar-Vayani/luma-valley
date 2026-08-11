/**
 * socialacts — the deliberate social moves that produce stories.
 *
 * Everything here is a choice a creature makes about another creature, scored
 * against its character and situation rather than triggered by a script:
 *
 *   mentor    — an experienced creature passes on what it knows
 *   mediate   — a respected creature steps between two who are fighting
 *   flatter   — trust bought rather than earned, which can collapse later
 *   ally      — two creatures who keep helping each other formalise it
 */
import type { Creature } from './creature'
import { applySocialEvent, edgeTo, friendship, type SocialEdge } from './socialbond'
import { observeEvidence } from './beliefs'
import { isMature, learningRateFor } from './lifecycle'
import { clamp01 } from './util'

// ── mentorship ────────────────────────────────────────────────────────────

/** Would this creature take the time to teach that one? */
export function mentorScore(teacher: Creature, student: Creature): number {
  if (!isMature(teacher.stage)) return 0
  if (teacher.chem.hunger < 0.35 || teacher.chem.fear > 0.5) return 0
  const known = Object.keys(teacher.knowledge).length
  const studentKnows = Object.keys(student.knowledge).length
  if (known < 4 || studentKnows >= known) return 0 // you cannot teach what you have not seen
  const edge = teacher.social[student.id]
  const kin = teacher.parentIds.includes(student.id) || student.parentIds.includes(teacher.id)
  const young = !isMature(student.stage)
  return clamp01(
    teacher.genome.sociability * 0.3 +
    teacher.genome.loyalty * 0.2 +
    teacher.drives.legacy * 0.3 +
    (kin ? 0.4 : 0) +
    (young ? 0.25 : 0) +
    (edge ? friendship(edge) * 0.2 : 0) +
    teacher.chem.purpose * 0.1,
  )
}

export interface MentorResult {
  taughtPlace: string | null
  taughtWord: string | null
}

/**
 * Teaching: the student gains places and words the teacher knows, faster if
 * they are young. Both come away with a stronger bond, and the teacher gets
 * the satisfaction of having passed something on.
 */
export function mentor(teacher: Creature, student: Creature): MentorResult {
  const rate = learningRateFor(student.stage)
  let taughtPlace: string | null = null
  for (const [place, level] of Object.entries(teacher.knowledge)) {
    if (level < 0.5) continue
    if ((student.knowledge[place] ?? 0) > 0.4) continue
    student.knowledge[place] = Math.min(1, (student.knowledge[place] ?? 0) + 0.5 * rate)
    taughtPlace = place
    break
  }

  let taughtWord: string | null = null
  for (const [concept, entry] of teacher.language.vocab) {
    if (entry.strength < 0.4) continue
    const known = student.language.vocab.get(concept)
    if (known && known.strength >= entry.strength) continue
    student.language.vocab.set(concept, { word: entry.word, strength: entry.strength * 0.7 * rate })
    student.language.wordToConcept.set(entry.word, concept)
    taughtWord = entry.word
    break
  }

  applySocialEvent(student.social, teacher.id, 'teach', 1.2)
  applySocialEvent(teacher.social, student.id, 'help', 0.6)
  student.emotions.gratitude = clamp01(student.emotions.gratitude + 0.12)
  teacher.emotions.pride = clamp01(teacher.emotions.pride + 0.15)
  teacher.chem.purpose = clamp01(teacher.chem.purpose + 0.12)
  student.chem.social = clamp01(student.chem.social + 0.1)
  return { taughtPlace, taughtWord }
}

// ── mediation ─────────────────────────────────────────────────────────────

/**
 * Stepping between two angry creatures is brave and unpopular. Only the
 * courageous, the respected, or those who care about both parties try it.
 */
export function mediateScore(peacemaker: Creature, a: Creature, b: Creature, influence: number): number {
  if (peacemaker.id === a.id || peacemaker.id === b.id) return 0
  if (!isMature(peacemaker.stage)) return 0
  if (peacemaker.chem.fear > 0.6) return 0
  const caresA = peacemaker.social[a.id] ? friendship(peacemaker.social[a.id]) : 0
  const caresB = peacemaker.social[b.id] ? friendship(peacemaker.social[b.id]) : 0
  return clamp01(
    peacemaker.genome.courage * 0.3 +
    influence * 0.3 +
    (caresA + caresB) * 0.25 +
    (1 - peacemaker.genome.aggression) * 0.15 -
    peacemaker.chem.fear * 0.3,
  )
}

export interface MediationResult {
  cooled: boolean
  hurt: boolean
}

/**
 * Mediation cools both grudges. If either party is furious enough, the
 * peacemaker takes a knock for the trouble — which is why it is not free.
 */
export function mediate(peacemaker: Creature, a: Creature, b: Creature): MediationResult {
  const fury = Math.max(a.emotions.spite, b.emotions.spite, a.emotions.resentment, b.emotions.resentment)
  for (const [x, y] of [[a, b], [b, a]] as const) {
    applySocialEvent(x.social, y.id, 'forgive', 0.7)
    x.emotions.spite = clamp01(x.emotions.spite - 0.25)
    x.emotions.resentment = clamp01(x.emotions.resentment - 0.15)
    x.chem.fear = clamp01(x.chem.fear - 0.05)
    applySocialEvent(x.social, peacemaker.id, 'help', 0.8)
  }
  const hurt = fury > 0.6 && Math.random() < fury - 0.4
  if (hurt) {
    peacemaker.hurt(0.06)
    peacemaker.injury = clamp01(peacemaker.injury + 0.08)
  }
  peacemaker.emotions.pride = clamp01(peacemaker.emotions.pride + 0.18)
  peacemaker.chem.purpose = clamp01(peacemaker.chem.purpose + 0.08)
  return { cooled: true, hurt }
}

// ── flattery and manipulation ─────────────────────────────────────────────

/** Who tries to buy trust they have not earned? */
export function flatterScore(flatterer: Creature, target: Creature): number {
  if (flatterer.id === target.id) return 0
  const edge = flatterer.social[target.id]
  const wantsSomething =
    (target.wallet > flatterer.wallet + 8 ? 0.4 : 0) +
    (flatterer.chem.hunger < 0.5 ? 0.25 : 0) +
    (edge && edge.trust < 0.3 ? 0.2 : 0)
  return clamp01(
    (flatterer.genome.theft * 0.35 + (1 - flatterer.genome.loyalty) * 0.25 + flatterer.drives.greed * 0.2)
    * (0.4 + wantsSomething),
  )
}

export interface FlatteryResult {
  believed: boolean
}

/**
 * Flattery works on the unsuspecting and the lonely. When it fails, the target
 * sees through it and trusts the flatterer less than before.
 */
export function flatter(flatterer: Creature, target: Creature): FlatteryResult {
  const edge = edgeTo(target.social, flatterer.id)
  const guard = edge.suspicion * 0.5 + target.emotions.paranoia * 0.3 + target.genome.learning * 0.2
  const charm = flatterer.genome.sociability * 0.4 + (1 - guard) * 0.4 + (1 - target.chem.social) * 0.2
  const believed = charm > guard + 0.25
  if (believed) {
    applySocialEvent(target.social, flatterer.id, 'talk', 1.5)
    edge.trust = clamp01(edge.trust + 0.12)
    edge.affection = clamp01(edge.affection + 0.08)
    target.chem.social = clamp01(target.chem.social + 0.08)
  } else {
    edge.suspicion = clamp01(edge.suspicion + 0.2)
    edge.trust = clamp01(edge.trust - 0.1)
    observeEvidence(target.beliefs, `who:${flatterer.id}:insincere`, 1, 'seen', 0)
  }
  return { believed }
}

// ── alliances ─────────────────────────────────────────────────────────────

/**
 * An alliance is not declared, it is recognised: two creatures who have
 * repeatedly helped each other and trust each other both ways.
 */
export function alliedPair(a: Creature, b: Creature): boolean {
  const ab = a.social[b.id]
  const ba = b.social[a.id]
  if (!ab || !ba) return false
  return mutualStrength(ab, ba) > 1.15
}

function mutualStrength(ab: SocialEdge, ba: SocialEdge): number {
  return (
    ab.trust + ba.trust +
    (ab.loyalty + ba.loyalty) * 0.6 +
    (ab.gratitude + ba.gratitude) * 0.4 +
    (ab.respect + ba.respect) * 0.4
  )
}

/** Formalising an alliance deepens loyalty on both sides. */
export function formAlliance(a: Creature, b: Creature): void {
  applySocialEvent(a.social, b.id, 'workTogether', 2)
  applySocialEvent(b.social, a.id, 'workTogether', 2)
  const ab = edgeTo(a.social, b.id)
  const ba = edgeTo(b.social, a.id)
  ab.loyalty = clamp01(ab.loyalty + 0.2)
  ba.loyalty = clamp01(ba.loyalty + 0.2)
  a.emotions.loyalty = clamp01(a.emotions.loyalty + 0.15)
  b.emotions.loyalty = clamp01(b.emotions.loyalty + 0.15)
}

/** Allies get better terms and expect help; strangers get list price. */
export function allyDiscount(a: Creature, b: Creature): number {
  return alliedPair(a, b) ? 0.75 : 1
}
