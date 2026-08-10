import { describe, expect, it } from 'vitest'
import { createEconomy, marketPrice, recordSale, tickMarketDay, salesSinceDay, GOODS, DEMAND_QUOTA } from './economy'

describe('economy — supply, demand, and visible price movement', () => {
  it('has a demand quota per good (what the market absorbs at fair price)', () => {
    const e = createEconomy()
    for (const id of GOODS) {
      expect(DEMAND_QUOTA[id]).toBeGreaterThan(0)
      expect(e.goods[id].stock).toBeGreaterThan(0)
    }
  })

  it('prices rise when demand is high (sales exceed quota) and fall when demand is low', () => {
    const e = createEconomy()
    const base = marketPrice(e, 'bread')
    // heavy sales yesterday → price rises
    for (let i = 0; i < DEMAND_QUOTA.bread * 2; i++) recordSale(e, 'bread')
    tickMarketDay(e, 1)
    const high = marketPrice(e, 'bread')
    expect(high).toBeGreaterThanOrEqual(base)

    // restock so scarcity no longer masks the demand signal
    e.goods.bread.stock = e.goods.bread.maxStock
    // quiet days → price eases back toward base
    tickMarketDay(e, 2)
    tickMarketDay(e, 3)
    const low = marketPrice(e, 'bread')
    expect(low).toBeLessThan(high)
  })

  it('prices stay within sane bounds (never free, never absurd)', () => {
    const e = createEconomy()
    for (let day = 0; day < 50; day++) {
      for (const id of GOODS) {
        if (day % 3 === 0) recordSale(e, id, DEMAND_QUOTA[id] + 3) // dump
      }
      tickMarketDay(e, day)
    }
    for (const id of GOODS) {
      const p = marketPrice(e, id)
      expect(p).toBeGreaterThanOrEqual(1)
      expect(p).toBeLessThanOrEqual(100)
    }
  })

  it('tracks sales per day so trends are visible', () => {
    const e = createEconomy()
    recordSale(e, 'bread', 3)
    expect(salesSinceDay(e, 'bread', 0)).toBe(3)
    tickMarketDay(e, 1) // roll to day 1
    recordSale(e, 'bread', 2)
    expect(salesSinceDay(e, 'bread', 1)).toBe(2)
    // day 0 sales are no longer in the 1-day window
    expect(salesSinceDay(e, 'bread', 1)).toBe(2)
  })
})
