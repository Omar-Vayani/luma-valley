/**
 * inventory — every creature (and the player) can hold items they buy, trade,
 * sell, or eat. Items are bought at towers and stored for later use, so a
 * creature can save up food, hoard wealth, or barter with peers.
 */

export type ItemId = 'bread' | 'medicine' | 'brew' | 'herb' | 'spark' | 'tonic' | 'stick'

export const ITEM_IDS: ItemId[] = ['bread', 'medicine', 'brew', 'herb', 'spark', 'tonic', 'stick']

export const ITEM_COST: Record<ItemId, number> = {
  bread: 3,
  medicine: 7,
  brew: 4,
  herb: 5,
  spark: 6,
  tonic: 8,
  stick: 10,
}

export interface Inventory {
  items: Partial<Record<ItemId, number>>
}

export function createInventory(): Inventory {
  return { items: {} }
}

export function countItem(inv: Inventory, id: ItemId): number {
  return inv.items[id] ?? 0
}

export function hasItem(inv: Inventory, id: ItemId): boolean {
  return countItem(inv, id) > 0
}

export function addItem(inv: Inventory, id: ItemId, n = 1): void {
  inv.items[id] = (inv.items[id] ?? 0) + n
}

export function removeItem(inv: Inventory, id: ItemId, n = 1): boolean {
  if (countItem(inv, id) < n) return false
  inv.items[id] = countItem(inv, id) - n
  if (inv.items[id] === 0) delete inv.items[id]
  return true
}

/** Use one item — returns the id consumed, or null if empty. */
export function useItem(inv: Inventory, id: ItemId): ItemId | null {
  return removeItem(inv, id, 1) ? id : null
}

/** Move one item from one inventory to another (trade). */
export function tradeItem(from: Inventory, to: Inventory, id: ItemId, n = 1): boolean {
  if (!removeItem(from, id, n)) return false
  addItem(to, id, n)
  return true
}

export function itemCost(id: ItemId): number {
  return ITEM_COST[id]
}

/** How much coins this inventory is worth at base prices. */
export function inventoryValue(inv: Inventory): number {
  let total = 0
  for (const [id, n] of Object.entries(inv.items) as [ItemId, number][]) {
    total += (ITEM_COST[id] ?? 0) * n
  }
  return total
}
