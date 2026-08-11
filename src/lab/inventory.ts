/**
 * inventory — every creature (and the player) can hold items they buy, trade,
 * sell, or consume. Items are data-defined in items.ts; this module owns the
 * mechanical rules: counts, capacity by weight, transfers, and ownership.
 *
 * Ownership is recorded per stack so theft is detectable: a creature can
 * notice that the loaf in your hands used to be theirs.
 */
import { itemBaseValue, itemWeight } from './items'

export type ItemId =
  | 'bread'
  | 'water'
  | 'medicine'
  | 'brew'
  | 'herb'
  | 'spark'
  | 'tonic'
  | 'stick'
  | 'cloak'
  | 'trinket'
  | 'gem'
  | 'satchel'
  | 'timber'
  | 'grain'

export const ITEM_IDS: ItemId[] = [
  'bread', 'water', 'medicine', 'brew', 'herb', 'spark', 'tonic',
  'stick', 'cloak', 'trinket', 'gem', 'satchel', 'timber', 'grain',
]

/** Base carry capacity in weight units before container bonuses. */
export const BASE_CAPACITY = 12

export interface Inventory {
  items: Partial<Record<ItemId, number>>
  /** itemId -> original owner creature id (0 = player, undefined = unowned) */
  owners?: Partial<Record<ItemId, number>>
}

export function createInventory(): Inventory {
  return { items: {}, owners: {} }
}

export function countItem(inv: Inventory, id: ItemId): number {
  return inv.items[id] ?? 0
}

export function hasItem(inv: Inventory, id: ItemId): boolean {
  return countItem(inv, id) > 0
}

/** Total carried weight. */
export function inventoryWeight(inv: Inventory): number {
  let w = 0
  for (const [id, n] of Object.entries(inv.items) as [ItemId, number][]) {
    w += itemWeight(id) * n
  }
  return Math.round(w * 100) / 100
}

/** Capacity including container bonuses (a satchel adds room). */
export function inventoryCapacity(inv: Inventory): number {
  return BASE_CAPACITY + countItem(inv, 'satchel') * 6
}

export function canCarry(inv: Inventory, id: ItemId, n = 1): boolean {
  return inventoryWeight(inv) + itemWeight(id) * n <= inventoryCapacity(inv)
}

/** Add items, refusing anything over capacity. Returns how many fit. */
export function addItem(inv: Inventory, id: ItemId, n = 1, ownerId?: number): number {
  let added = 0
  for (let i = 0; i < n; i++) {
    if (!canCarry(inv, id, 1)) break
    inv.items[id] = (inv.items[id] ?? 0) + 1
    added++
  }
  if (added > 0 && ownerId !== undefined) {
    if (!inv.owners) inv.owners = {}
    if (inv.owners[id] === undefined) inv.owners[id] = ownerId
  }
  return added
}

export function removeItem(inv: Inventory, id: ItemId, n = 1): boolean {
  if (countItem(inv, id) < n) return false
  inv.items[id] = countItem(inv, id) - n
  if (inv.items[id] === 0) {
    delete inv.items[id]
    if (inv.owners) delete inv.owners[id]
  }
  return true
}

/** Use one item — returns the id consumed, or null if empty. */
export function useItem(inv: Inventory, id: ItemId): ItemId | null {
  return removeItem(inv, id, 1) ? id : null
}

/**
 * Move items between inventories. `stolen` keeps the original owner mark so
 * the victim can recognize their property later.
 */
export function tradeItem(
  from: Inventory,
  to: Inventory,
  id: ItemId,
  n = 1,
  opts: { stolen?: boolean; newOwnerId?: number } = {},
): boolean {
  if (countItem(from, id) < n) return false
  if (!canCarry(to, id, n)) return false
  const originalOwner = from.owners?.[id]
  if (!removeItem(from, id, n)) return false
  addItem(to, id, n)
  if (!to.owners) to.owners = {}
  if (opts.stolen) {
    to.owners[id] = originalOwner ?? to.owners[id]
  } else if (opts.newOwnerId !== undefined) {
    to.owners[id] = opts.newOwnerId
  }
  return true
}

/** Who does this stack belong to, if anyone remembers? */
export function ownerOf(inv: Inventory, id: ItemId): number | undefined {
  return inv.owners?.[id]
}

/** True when the holder is carrying something marked as someone else's. */
export function holdsStolenGoods(inv: Inventory, holderId: number): ItemId[] {
  if (!inv.owners) return []
  return (Object.entries(inv.owners) as [ItemId, number][])
    .filter(([id, owner]) => owner !== undefined && owner !== holderId && countItem(inv, id) > 0)
    .map(([id]) => id)
}

export function itemCost(id: ItemId): number {
  return itemBaseValue(id)
}

/** How much coins this inventory is worth at base prices. */
export function inventoryValue(inv: Inventory): number {
  let total = 0
  for (const [id, n] of Object.entries(inv.items) as [ItemId, number][]) {
    total += itemBaseValue(id) * n
  }
  return total
}

/** Legacy alias kept for existing call sites and tests. */
export const ITEM_COST: Record<ItemId, number> = ITEM_IDS.reduce((acc, id) => {
  acc[id] = itemBaseValue(id)
  return acc
}, {} as Record<ItemId, number>)
