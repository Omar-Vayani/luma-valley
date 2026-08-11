/**
 * psyche — simplified but meaningful mind state connecting needs, emotion,
 * personality, memory, and decision-making. Not a clinical model.
 */
import type { Creature } from './creature'
import { clamp01 } from './util'

export type PsycheMood =
  | 'content'
  | 'anxious'
  | 'melancholy'
  | 'irritated'
  | 'hopeful'
  | 'ashamed'
  | 'proud'
  | 'lonely'
  | 'curious'
  | 'grieving'

export interface Psyche {
  /** Short-term mood label derived from chem + emotions. */
  mood: PsycheMood
  stress: number
  confidence: number
  boredom: number
  belonging: number
  /** Personal values 0..1 — bias long-term goals. */
  values: {
    safety: number
    kinship: number
    mastery: number
    pleasure: number
    fairness: number
  }
}

export function createPsyche(c: { genome: Creature['genome'] }): Psyche {
  return {
    mood: 'content',
    stress: 0.2,
    confidence: 0.4 + c.genome.courage * 0.3,
    boredom: 0.3,
    belonging: 0.3 + c.genome.sociability * 0.2,
    values: {
      safety: 0.3 + c.genome.fearfulness * 0.5,
      kinship: 0.3 + c.genome.loyalty * 0.4 + c.genome.sociability * 0.2,
      mastery: 0.2 + c.genome.learning * 0.4 + c.genome.curiosity * 0.2,
      pleasure: 0.3 + c.genome.lovePropensity * 0.2 + (1 - c.genome.fearfulness) * 0.2,
      fairness: 0.4 + c.genome.loyalty * 0.3 - c.genome.theft * 0.3,
    },
  }
}

export function tickPsyche(c: Creature): void {
  if (!c.psyche) c.psyche = createPsyche(c)
  const p = c.psyche
  const chem = c.chem

  // stress from competing pressures
  const pressure =
    (1 - chem.hunger) * 0.25 +
    (1 - chem.health) * 0.25 +
    chem.fear * 0.2 +
    chem.grief * 0.15 +
    (1 - chem.social) * 0.1 +
    c.jealousy * 0.1
  p.stress = clamp01(p.stress * 0.9 + pressure * 0.35)

  // confidence rises with success (money, bonds, strength) and falls with fear
  p.confidence = clamp01(
    p.confidence * 0.98 +
      Math.min(1, c.wallet / 20) * 0.01 +
      chem.strength * 0.005 +
      -chem.fear * 0.02 +
      c.emotions.joy * 0.01,
  )

  p.boredom = clamp01(p.boredom + 0.002 - chem.pleasure * 0.004 - c.emotions.curiosity * 0.003)
  if (c.action === 'explore' || c.action === 'play') p.boredom = clamp01(p.boredom - 0.05)

  const bondCount = Object.values(c.bonds).filter((v) => v > 0.3).length
  p.belonging = clamp01(
    0.2 +
      bondCount * 0.08 +
      (c.partnerId !== null ? 0.2 : 0) +
      (c.gangId !== null ? 0.1 : 0) +
      (c.householdId != null ? 0.15 : 0) -
      (1 - chem.social) * 0.2,
  )

  p.mood = deriveMood(c, p)
}

function deriveMood(c: Creature, p: Psyche): PsycheMood {
  if (c.chem.grief > 0.45) return 'grieving'
  if (p.stress > 0.65 && c.chem.fear > 0.4) return 'anxious'
  if (c.chem.social < 0.3 && p.belonging < 0.35) return 'lonely'
  if (c.emotions.spite > 0.4 || c.jealousy > 0.55) return 'irritated'
  if (c.emotions.resentment > 0.45) return 'ashamed'
  if (c.emotions.joy > 0.45 && p.confidence > 0.55) return 'proud'
  if (c.emotions.curiosity > 0.4 || p.boredom > 0.55) return 'curious'
  if (c.chem.pleasure > 0.55 && p.stress < 0.4) return 'hopeful'
  if (c.chem.grief > 0.25 || c.chem.pleasure < 0.25) return 'melancholy'
  return 'content'
}

/** Risk tolerance modifier from psyche (−0.3..+0.3) for utility scoring. */
export function riskModifier(c: Creature): number {
  if (!c.psyche) return 0
  return (c.psyche.confidence - c.psyche.stress) * 0.3 + (c.psyche.values.safety * -0.15)
}
