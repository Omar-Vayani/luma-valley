/**
 * items — the interaction catalog. Every item affects a creature's
 * chemistry AND psychology; some heal, some soothe, some poison,
 * some addict. All effects are intentional and testable.
 */
import type { ChemicalState } from './biochem'
import { clamp } from './rng'

export type Substance = 'smoke' | 'sugar' | 'cactus' | 'mushroom'
export type ItemId =
  | 'berry'
  | 'honey'
  | 'smoke-herb'
  | 'sugar-candy'
  | 'cactus-juice'
  | 'dream-mushroom'
  | 'nightshade'
  | 'warm-lamp'
  | 'music-box'
  | 'soft-blanket'

export interface ItemDef {
  id: ItemId
  name: string
  emoji: string
  blurb: string
  healthy: boolean
  /** immediate chemical deltas (applied additively, clamped) */
  chem?: Partial<ChemicalState>
  /** psychology: calm 0-1 (raises), stress 0-1 (lowers mood), pleasure, fear */
  psych?: { calm?: number; stress?: number; pleasure?: number; fear?: number }
  /** player-trust delta */
  trust?: number
  /** addiction: substance + how much it raises addiction (0-1) */
  addictive?: { substance: Substance; amount: number }
  /** long-term health damage (0-1 scale per dose) */
  healthCost?: number
  /** toxic — can kill at high dose */
  toxic?: boolean
  /** addiction withdrawal penalty while present */
  withdrawal?: { substance: Substance; fearSpike: number; calmDrop: number }
}

export const ITEMS: Record<ItemId, ItemDef> = {
  berry: {
    id: 'berry', name: 'Sweet Berry', emoji: '🍓', healthy: true,
    blurb: 'Nourishing and safe. A little joy in every bite.',
    chem: { hunger: -0.28, pleasure: 0.15 },
    psych: { calm: 0.1, pleasure: 0.2 },
    trust: 0.06,
  },
  honey: {
    id: 'honey', name: 'Golden Honey', emoji: '🍯', healthy: true,
    blurb: 'Rich and warm. Restores energy and brightens the mood.',
    chem: { hunger: -0.35, pleasure: 0.25, fatigue: -0.15 },
    psych: { calm: 0.15, pleasure: 0.3 },
    trust: 0.08,
  },
  'smoke-herb': {
    id: 'smoke-herb', name: 'Smoke Herb', emoji: '🚬', healthy: false,
    blurb: 'Instantly numbs stress — but it hooks, stains the lungs, and the calm never lasts.',
    chem: { pleasure: 0.05 },
    psych: { fear: -0.45, stress: -0.5, calm: 0.35, pleasure: 0.1 },
    trust: -0.02,
    addictive: { substance: 'smoke', amount: 0.22 },
    healthCost: 0.03,
    withdrawal: { substance: 'smoke', fearSpike: 0.3, calmDrop: 0.35 },
  },
  'sugar-candy': {
    id: 'sugar-candy', name: 'Candy Blossom', emoji: '🍬', healthy: false,
    blurb: 'A blissful sugar rush that always ends in a crash.',
    chem: { hunger: -0.1, pleasure: 0.4 },
    psych: { pleasure: 0.4, calm: -0.05 },
    trust: 0.02,
    addictive: { substance: 'sugar', amount: 0.18 },
    healthCost: 0.015,
    withdrawal: { substance: 'sugar', fearSpike: 0.15, calmDrop: 0.25 },
  },
  'cactus-juice': {
    id: 'cactus-juice', name: 'Cactus Juice', emoji: '🍹', healthy: false,
    blurb: 'Dulls everything — fear, pain, and the will to wander.',
    chem: { pleasure: 0.15, fatigue: 0.1 },
    psych: { fear: -0.4, stress: -0.35, calm: 0.3 },
    addictive: { substance: 'cactus', amount: 0.2 },
    healthCost: 0.02,
    withdrawal: { substance: 'cactus', fearSpike: 0.35, calmDrop: 0.3 },
  },
  'dream-mushroom': {
    id: 'dream-mushroom', name: 'Dream Mushroom', emoji: '🍄', healthy: false,
    blurb: 'Vivid, wandering dreams — the valley melts away. So fragile afterwards.',
    chem: { pleasure: 0.1 },
    psych: { fear: -0.5, stress: -0.6, calm: 0.4, pleasure: 0.2 },
    addictive: { substance: 'mushroom', amount: 0.28 },
    healthCost: 0.045,
    toxic: true,
    withdrawal: { substance: 'mushroom', fearSpike: 0.45, calmDrop: 0.4 },
  },
  nightshade: {
    id: 'nightshade', name: 'Nightshade', emoji: '☠️', healthy: false,
    blurb: 'Poison. There is nothing kind about this.',
    chem: { health: -0.45, pleasure: -0.1 },
    psych: { fear: 0.3, stress: 0.3 },
    trust: -0.15,
    toxic: true,
  },
  'warm-lamp': {
    id: 'warm-lamp', name: 'Warm Lamp', emoji: '🏮', healthy: true,
    blurb: 'A gentle glow that says nothing will hurt them tonight.',
    psych: { fear: -0.3, calm: 0.3 },
    trust: 0.1,
  },
  'music-box': {
    id: 'music-box', name: 'Music Box', emoji: '🎵', healthy: true,
    blurb: 'A soft lullaby. Boredom and worry drift away together.',
    chem: { boredom: -0.3 },
    psych: { calm: 0.3, pleasure: 0.15 },
    trust: 0.05,
  },
  'soft-blanket': {
    id: 'soft-blanket', name: 'Soft Blanket', emoji: '🧣', healthy: true,
    blurb: 'Warm, safe, quiet. Sleep comes easy.',
    chem: { fatigue: -0.4 },
    psych: { calm: 0.35, stress: -0.2 },
    trust: 0.08,
  },
}

export interface ItemOutcome {
  chem: ChemicalState
  psych: { calm: number; stress: number; pleasure: number; fear: number }
  trustDelta: number
  addictionDelta: Partial<Record<Substance, number>>
  healthDelta: number
  toxic: boolean
  label: string
}

/** Apply an item to a creature's current chemistry, returning everything that happened. */
export function applyItem(chem: ChemicalState, item: ItemDef): ItemOutcome {
  const psych = { calm: item.psych?.calm ?? 0, stress: item.psych?.stress ?? 0, pleasure: item.psych?.pleasure ?? 0, fear: item.psych?.fear ?? 0 }
  const addictionDelta: Partial<Record<Substance, number>> = {}
  if (item.addictive) addictionDelta[item.addictive.substance] = item.addictive.amount
  const out: ItemOutcome = {
    chem: { ...chem },
    psych,
    trustDelta: item.trust ?? 0,
    addictionDelta,
    healthDelta: item.healthCost ?? 0,
    toxic: !!item.toxic,
    label: item.name,
  }
  if (item.chem) {
    for (const [k, v] of Object.entries(item.chem)) {
      out.chem[k as keyof ChemicalState] = clamp((out.chem[k as keyof ChemicalState] ?? 0) + v, 0, 1)
    }
  }
  // fold psychology into chemistry: calm soothes fear, stress breeds it
  out.chem.fear = clamp(out.chem.fear + out.psych.fear - out.psych.calm * 0.7 + out.psych.stress * 0.5, 0, 1)
  out.chem.pleasure = clamp(out.chem.pleasure + out.psych.pleasure + out.psych.calm * 0.3, 0, 1)
  return out
}
