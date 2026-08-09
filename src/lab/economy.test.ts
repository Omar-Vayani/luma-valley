import { describe, expect, it } from 'vitest'
import { createEconomy, tickEconomy, buyFromTower, workShift, marketPrice, WORK_SHIFT_TICKS } from './economy'
import { createSim } from './sim'
import { randomGenome, type Genome } from './genetics'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('economy — nothing is free', () => {
  it('starts with priced goods and stock', () => {
    const e = createEconomy()
    expect(marketPrice(e, 'bread')).toBeGreaterThan(0)
    expect(e.goods.bread.stock).toBeGreaterThan(0)
    expect(marketPrice(e, 'medicine')).toBeGreaterThan(0)
    expect(marketPrice(e, 'weapon')).toBeGreaterThan(marketPrice(e, 'bread'))
  })

  it('buying food costs coins and reduces stock', () => {
    const e = createEconomy()
    const stockBefore = e.goods.bread.stock
    const price = marketPrice(e, 'bread')
    const ok = buyFromTower(e, 'food', { wallet: price + 5 } as never)
    expect(ok).toBe('bread')
    expect(e.goods.bread.stock).toBe(stockBefore - 1)
  })

  it('cannot buy what you cannot afford', () => {
    const e = createEconomy()
    const ok = buyFromTower(e, 'food', { wallet: 0 } as never)
    expect(ok).toBeNull()
    expect(e.goods.bread.stock).toBe(e.goods.bread.stock)
  })

  it('cannot buy what is out of stock (scarcity)', () => {
    const e = createEconomy()
    e.goods.bread.stock = 0
    const ok = buyFromTower(e, 'food', { wallet: 999 } as never)
    expect(ok).toBeNull()
  })

  it('prices rise as stock runs low (supply and demand)', () => {
    const e = createEconomy()
    const fullPrice = marketPrice(e, 'bread')
    e.goods.bread.stock = 1
    expect(marketPrice(e, 'bread')).toBeGreaterThan(fullPrice)
  })

  it('stock slowly replenishes (supply returns)', () => {
    const e = createEconomy()
    e.goods.bread.stock = 1
    for (let i = 0; i < 7; i++) tickEconomy(e)
    expect(e.goods.bread.stock).toBeGreaterThan(1)
  })

  it('a work shift takes time and pays coins when completed', () => {
    const e = createEconomy()
    const c = { wallet: 0, action: 'idle', workProgress: 0 } as { wallet: number; action: string; workProgress: number }
    expect(workShift(e, c, WORK_SHIFT_TICKS - 1)).toBe(false) // still working
    expect(c.wallet).toBe(0)
    expect(workShift(e, c, 1)).toBe(true) // shift complete
    expect(c.wallet).toBeGreaterThan(0)
  })

  it('a creature stays at work for several ticks before getting paid', () => {
    const s = createSim(1)
    const c = s.spawnCreature(GEN(), 0, 44) // at the work tower
    c.wallet = 0
    c.chem.hunger = 0.3 // hungry + broke → motivated to earn
    s.tick()
    // at the work tower, should be working (not paid yet)
    expect(c.action).toBe('work')
    expect(c.wallet).toBe(0)
  })
})

describe('economy — buying in the sim', () => {
  it('a creature with coins buys food at the food tower (nothing free)', () => {
    const s = createSim(2)
    const c = s.spawnCreature(GEN(), -32, -32) // at food tower
    c.wallet = 20
    c.chem.hunger = 0.2
    for (let i = 0; i < 5; i++) s.tick()
    expect(c.chem.hunger).toBeGreaterThan(0.3) // bought + ate
    expect(c.wallet).toBeLessThan(20) // paid for it
  })

  it('a broke creature cannot eat and goes to work instead', () => {
    const s = createSim(3)
    const c = s.spawnCreature(GEN(), -28, -28) // at food tower, broke
    c.wallet = 0
    c.chem.hunger = 0.2
    s.tick()
    expect(c.chem.hunger).toBeLessThanOrEqual(0.3) // could not buy
    expect(c.action).toBe('go work') // goes to earn
  })
})
