import { describe, expect, it } from 'vitest'
import { createInventory, addItem, removeItem, countItem, hasItem, inventoryValue, itemCost, tradeItem, useItem } from './inventory'
import { ITEM_IDS } from './inventory'

describe('inventory — creatures buy, keep, trade, sell, and eat items', () => {
  it('creates an empty inventory', () => {
    const inv = createInventory()
    expect(countItem(inv, 'bread')).toBe(0)
    expect(inv.items).toEqual({})
  })

  it('adds and counts items', () => {
    const inv = createInventory()
    addItem(inv, 'bread', 3)
    addItem(inv, 'bread', 2)
    addItem(inv, 'medicine', 1)
    expect(countItem(inv, 'bread')).toBe(5)
    expect(countItem(inv, 'medicine')).toBe(1)
    expect(hasItem(inv, 'bread')).toBe(true)
    expect(hasItem(inv, 'stick')).toBe(false)
  })

  it('removes items only when available', () => {
    const inv = createInventory()
    addItem(inv, 'bread', 2)
    expect(removeItem(inv, 'bread', 3)).toBe(false) // not enough
    expect(countItem(inv, 'bread')).toBe(2)
    expect(removeItem(inv, 'bread', 1)).toBe(true)
    expect(countItem(inv, 'bread')).toBe(1)
  })

  it('every item has a cost and a value', () => {
    for (const id of ITEM_IDS) {
      expect(itemCost(id)).toBeGreaterThan(0)
      expect(inventoryValue(createInventory())).toBe(0)
    }
  })

  it('trades items between creatures', () => {
    const a = createInventory()
    const b = createInventory()
    addItem(a, 'bread', 2)
    expect(tradeItem(a, b, 'bread', 1)).toBe(true)
    expect(countItem(a, 'bread')).toBe(1)
    expect(countItem(b, 'bread')).toBe(1)
    expect(tradeItem(a, b, 'medicine', 1)).toBe(false) // a has none
  })

  it('useItem consumes and returns the item', () => {
    const inv = createInventory()
    addItem(inv, 'bread', 1)
    const got = useItem(inv, 'bread')
    expect(got).toBe('bread')
    expect(countItem(inv, 'bread')).toBe(0)
    expect(useItem(inv, 'bread')).toBeNull()
  })

  it('inventory value sums item worth', () => {
    const inv = createInventory()
    addItem(inv, 'bread', 2) // each ~3
    addItem(inv, 'medicine', 1) // each ~7
    expect(inventoryValue(inv)).toBeGreaterThan(5)
  })

  it('items are the standard set creatures can buy', () => {
    expect(ITEM_IDS).toContain('bread')
    expect(ITEM_IDS).toContain('medicine')
    expect(ITEM_IDS).toContain('stick')
    expect(ITEM_IDS).toContain('brew')
  })
})
