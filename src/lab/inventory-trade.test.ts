import { describe, expect, it } from 'vitest'
import { createSim } from './sim'
import { randomGenome, type Genome } from './genetics'
import { addItem } from './inventory'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('creature trade — a stocked creature sells bread to a hungry peer', () => {
  it('sells one loaf for coins when the buyer can afford it', () => {
    const s = createSim(9)
    const seller = s.spawnCreature(GEN(), 0, 0)
    const buyer = s.spawnCreature(GEN(), 1, 0)
    addItem(seller.inventory, 'bread', 3)
    buyer.wallet = 10
    buyer.chem.hunger = 0.2
    const sellerWallet = seller.wallet
    const ok = s.creatureTrade(seller, buyer)
    expect(ok).toBe(true)
    expect(seller.inventory.items.bread ?? 0).toBe(2)
    expect(buyer.inventory.items.bread ?? 0).toBe(1)
    expect(buyer.wallet).toBeLessThan(10)
    expect(seller.wallet).toBeGreaterThan(sellerWallet)
  })

  it('refuses when the seller has no bread', () => {
    const s = createSim(9)
    const seller = s.spawnCreature(GEN(), 0, 0)
    const buyer = s.spawnCreature(GEN(), 1, 0)
    buyer.wallet = 10
    expect(s.creatureTrade(seller, buyer)).toBe(false)
    expect(buyer.wallet).toBe(10)
  })

  it('refuses when the buyer is broke', () => {
    const s = createSim(9)
    const seller = s.spawnCreature(GEN(), 0, 0)
    const buyer = s.spawnCreature(GEN(), 1, 0)
    addItem(seller.inventory, 'bread', 2)
    buyer.wallet = 0
    expect(s.creatureTrade(seller, buyer)).toBe(false)
    expect(seller.inventory.items.bread ?? 0).toBe(2)
  })

  it('refuses when either party is dead', () => {
    const s = createSim(9)
    const seller = s.spawnCreature(GEN(), 0, 0)
    const buyer = s.spawnCreature(GEN(), 1, 0)
    addItem(seller.inventory, 'bread', 2)
    buyer.wallet = 10
    buyer.alive = false
    expect(s.creatureTrade(seller, buyer)).toBe(false)
  })

  it('trades autonomously during ticks when a stocked seller meets a hungry buyer', () => {
    const s = createSim(9)
    const seller = s.spawnCreature(GEN(), 0, 0)
    const buyer = s.spawnCreature(GEN(), 0.5, 0)
    addItem(seller.inventory, 'bread', 5)
    buyer.wallet = 20
    buyer.chem.hunger = 0.3
    // the trade cadence fires early (time 2), before the hungry buyer wanders
    // out of the seller's reach — the loaf must change hands.
    for (let i = 0; i < 12; i++) s.tick()
    expect(buyer.inventory.items.bread ?? 0).toBeGreaterThan(0)
    expect(seller.inventory.items.bread ?? 0).toBeLessThan(5)
  })
})
