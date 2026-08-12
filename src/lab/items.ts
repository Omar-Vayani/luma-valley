/**
 * items — the data-driven item catalog.
 *
 * Items are described by data, not code branches: weight, value, category,
 * legality, durability, and effects. New items can be added here (or loaded
 * from a data file) without touching simulation logic.
 */
import type { ItemId } from './inventory'

export type ItemCategory =
  | 'food'
  | 'drink'
  | 'alcohol'
  | 'medicine'
  | 'substance'
  | 'tool'
  | 'weapon'
  | 'wearable'
  | 'valuable'
  | 'container'
  | 'gift'
  | 'material'

export interface ItemDef {
  id: ItemId
  name: string
  category: ItemCategory
  /** base coin value before scarcity/subjective adjustment */
  value: number
  /** carried weight units */
  weight: number
  /** 0..1 — how rare it is to find in shops */
  rarity: number
  /** 0..1 — 1 means fully accepted, 0 means socially condemned */
  acceptance: number
  /** uses before it breaks; 0 = consumable single use, -1 = permanent */
  durability: number
  /** short description used in the HUD */
  effect: string
  /** direct chem deltas when used */
  use?: Partial<{
    hunger: number
    thirst: number
    energy: number
    health: number
    pleasure: number
    fear: number
    social: number
    comfort: number
  }>
}

export const ITEM_CATALOG: Record<ItemId, ItemDef> = {
  bread: {
    id: 'bread', name: 'hearth loaf', category: 'food', value: 3, weight: 0.5, rarity: 0.1,
    acceptance: 1, durability: 0, effect: 'fills the belly',
    use: { hunger: 0.45, pleasure: 0.1, health: 0.02 },
  },
  water: {
    id: 'water', name: 'clean water', category: 'drink', value: 1, weight: 0.6, rarity: 0.05,
    acceptance: 1, durability: 0, effect: 'quenches thirst',
    use: { thirst: 0.5, health: 0.01 },
  },
  medicine: {
    id: 'medicine', name: 'remedy vial', category: 'medicine', value: 7, weight: 0.2, rarity: 0.35,
    acceptance: 1, durability: 0, effect: 'heals wounds and illness',
    use: { health: 0.35 },
  },
  brew: {
    id: 'brew', name: 'amber brew', category: 'alcohol', value: 4, weight: 0.7, rarity: 0.2,
    acceptance: 0.7, durability: 0, effect: 'warm cheer, dulled judgement',
    use: { pleasure: 0.3, fear: -0.12, social: 0.15, health: -0.01 },
  },
  herb: {
    id: 'herb', name: 'dreamleaf', category: 'substance', value: 5, weight: 0.1, rarity: 0.4,
    acceptance: 0.45, durability: 0, effect: 'mellow calm, dulled drive',
    use: { pleasure: 0.28, fear: -0.25, energy: -0.08, health: -0.005 },
  },
  spark: {
    id: 'spark', name: 'sparkdust', category: 'substance', value: 9, weight: 0.05, rarity: 0.7,
    acceptance: 0.12, durability: 0, effect: 'intense rush, heavy cost',
    use: { pleasure: 0.5, energy: 0.3, fear: 0.12, health: -0.03 },
  },
  tonic: {
    id: 'tonic', name: 'focus tonic', category: 'substance', value: 6, weight: 0.2, rarity: 0.45,
    acceptance: 0.6, durability: 0, effect: 'focused drive',
    use: { energy: 0.25, pleasure: 0.18, health: -0.01 },
  },
  stick: {
    id: 'stick', name: 'walking stick', category: 'weapon', value: 10, weight: 2.5, rarity: 0.5,
    acceptance: 0.5, durability: 40, effect: 'a blunt argument',
  },
  cloak: {
    id: 'cloak', name: 'wool cloak', category: 'wearable', value: 12, weight: 1.8, rarity: 0.5,
    acceptance: 1, durability: 200, effect: 'warmth and comfort',
    use: { comfort: 0.2 },
  },
  trinket: {
    id: 'trinket', name: 'glass trinket', category: 'gift', value: 8, weight: 0.2, rarity: 0.6,
    acceptance: 1, durability: -1, effect: 'a keepsake worth giving',
  },
  gem: {
    id: 'gem', name: 'river gem', category: 'valuable', value: 25, weight: 0.1, rarity: 0.85,
    acceptance: 1, durability: -1, effect: 'small, portable wealth',
  },
  satchel: {
    id: 'satchel', name: 'leather satchel', category: 'container', value: 14, weight: 1,
    rarity: 0.55, acceptance: 1, durability: -1, effect: 'carry more (+6 capacity)',
  },
  timber: {
    id: 'timber', name: 'cut timber', category: 'material', value: 4, weight: 4, rarity: 0.25,
    acceptance: 1, durability: -1, effect: 'raw building material',
  },
  grain: {
    id: 'grain', name: 'field grain', category: 'material', value: 2, weight: 1.2, rarity: 0.15,
    acceptance: 1, durability: -1, effect: 'becomes bread at the market',
  },
  berry: {
    id: 'berry', name: 'hedge berries', category: 'food', value: 1, weight: 0.2, rarity: 0.05,
    acceptance: 1, durability: 0, effect: 'a handful off the bush',
    use: { hunger: 0.16, thirst: 0.06, pleasure: 0.05 },
  },
  stone: {
    id: 'stone', name: 'river stone', category: 'material', value: 2, weight: 3, rarity: 0.2,
    acceptance: 1, durability: -1, effect: 'raw building material',
  },
  fish: {
    id: 'fish', name: 'silverfin', category: 'food', value: 4, weight: 0.8, rarity: 0.3,
    acceptance: 1, durability: 0, effect: 'a proper meal, if you can catch one',
    use: { hunger: 0.5, pleasure: 0.15, health: 0.04 },
  },
  lantern: {
    id: 'lantern', name: 'valley lantern', category: 'tool', value: 9, weight: 1.5, rarity: 0.5,
    acceptance: 1, durability: -1, effect: 'set it down and it burns all night',
  },
}

export const ITEM_LIST: ItemDef[] = Object.values(ITEM_CATALOG)

export function itemDef(id: ItemId): ItemDef | undefined {
  return ITEM_CATALOG[id]
}

export function itemWeight(id: ItemId): number {
  return ITEM_CATALOG[id]?.weight ?? 0.5
}

export function itemBaseValue(id: ItemId): number {
  return ITEM_CATALOG[id]?.value ?? 1
}

/** Items below this acceptance are socially frowned upon / semi-legal. */
export function isContraband(id: ItemId): boolean {
  return (ITEM_CATALOG[id]?.acceptance ?? 1) < 0.35
}

export function itemsByCategory(cat: ItemCategory): ItemDef[] {
  return ITEM_LIST.filter((d) => d.category === cat)
}
