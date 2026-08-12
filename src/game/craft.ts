/**
 * craft — turning what the valley gives you into something worth having.
 *
 * Recipes are data, and most of them need a place: you bake at a hearth,
 * you forge at the smithy, you mix remedies at the apothecary. That is on
 * purpose — it sends you into buildings where Luma are working, which is
 * where the game is.
 */
import { addItem, canCarry, countItem, removeItem, type Inventory, type ItemId } from '../lab/inventory'
import { itemName } from '../lab/items'
import type { TowerId } from '../lab/world'

export type Station = 'anywhere' | 'hearth' | 'smithy' | 'apothecary' | 'field'

/** Which buildings count as which kind of workspace. */
export const STATION_TOWERS: Record<Station, TowerId[]> = {
  anywhere: [],
  hearth: ['homes', 'tavern', 'food', 'house1', 'house2', 'house3', 'house4'],
  smithy: ['tools', 'work'],
  apothecary: ['pharmacy', 'clinic'],
  field: ['farm'],
}

export const STATION_LABEL: Record<Station, string> = {
  anywhere: 'anywhere',
  hearth: 'at a hearth',
  smithy: 'at the smithy or workyard',
  apothecary: 'at the apothecary',
  field: 'at the fields',
}

export interface Recipe {
  id: string
  name: string
  station: Station
  inputs: { id: ItemId; n: number }[]
  output: { id: ItemId; n: number }
  /** one line explaining why you would bother */
  note: string
}

export const RECIPES: Recipe[] = [
  {
    id: 'loaf', name: 'Hearth loaf', station: 'hearth',
    inputs: [{ id: 'grain', n: 2 }],
    output: { id: 'bread', n: 1 },
    note: 'The staple. Luma will thank you for one and remember it.',
  },
  {
    id: 'preserve', name: 'Berry preserve', station: 'hearth',
    inputs: [{ id: 'berry', n: 4 }],
    output: { id: 'bread', n: 1 },
    note: 'Berries keep badly. Cooked down, they keep well.',
  },
  {
    id: 'remedy', name: 'Remedy', station: 'apothecary',
    inputs: [{ id: 'herb', n: 2 }, { id: 'water', n: 1 }],
    output: { id: 'medicine', n: 1 },
    note: 'The only thing that helps when a fever takes hold.',
  },
  {
    id: 'tonic', name: 'Bitter tonic', station: 'apothecary',
    inputs: [{ id: 'herb', n: 3 }, { id: 'brew', n: 1 }],
    output: { id: 'tonic', n: 1 },
    note: 'Steadies the nerves. Habit-forming, so give it carefully.',
  },
  {
    id: 'stick', name: 'Walking stick', station: 'anywhere',
    inputs: [{ id: 'timber', n: 1 }],
    output: { id: 'stick', n: 1 },
    note: 'Speeds up chopping. Also, regrettably, a weapon.',
  },
  {
    id: 'lantern', name: 'Valley lantern', station: 'smithy',
    inputs: [{ id: 'timber', n: 2 }, { id: 'stone', n: 1 }, { id: 'spark', n: 1 }],
    output: { id: 'lantern', n: 1 },
    note: 'Set one down anywhere and it burns until morning.',
  },
  {
    id: 'trinket', name: 'Carved trinket', station: 'smithy',
    inputs: [{ id: 'timber', n: 1 }, { id: 'stone', n: 1 }],
    output: { id: 'trinket', n: 1 },
    note: 'Worth little and given for that reason.',
  },
  {
    id: 'satchel', name: 'Satchel', station: 'smithy',
    inputs: [{ id: 'cloak', n: 1 }, { id: 'timber', n: 2 }],
    output: { id: 'satchel', n: 1 },
    note: 'Six more units of carrying, which you will want.',
  },
]

export function recipeById(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id)
}

/** Do you have the materials, ignoring where you are standing? */
export function hasInputs(inv: Inventory, r: Recipe): boolean {
  return r.inputs.every((i) => countItem(inv, i.id) >= i.n)
}

export type CraftFailure = 'materials' | 'station' | 'space'

export interface CraftResult {
  ok: boolean
  reason?: CraftFailure
  message: string
}

/**
 * Make one. `atStation` is supplied by the caller because only the game layer
 * knows where the player is standing.
 */
export function craft(inv: Inventory, r: Recipe, atStation: boolean): CraftResult {
  if (!atStation && r.station !== 'anywhere') {
    return { ok: false, reason: 'station', message: `You need to be ${STATION_LABEL[r.station]}.` }
  }
  if (!hasInputs(inv, r)) {
    const missing = r.inputs
      .filter((i) => countItem(inv, i.id) < i.n)
      .map((i) => `${i.n - countItem(inv, i.id)} more ${itemName(i.id)}`)
    return { ok: false, reason: 'materials', message: `You need ${missing.join(' and ')}.` }
  }
  if (!canCarry(inv, r.output.id, r.output.n)) {
    return { ok: false, reason: 'space', message: 'Your pack is full.' }
  }
  for (const i of r.inputs) removeItem(inv, i.id, i.n)
  addItem(inv, r.output.id, r.output.n, 0)
  return { ok: true, message: `Made ${itemName(r.output.id)}.` }
}
