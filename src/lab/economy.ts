/**
 * economy — nothing is free. Every good has a price and finite stock.
 * Prices rise when stock runs low (scarcity / supply-and-demand) and ease
 * back down as stock replenishes. Work is a timed shift: stay at the work
 * tower for N ticks and you get paid; leave early and you get nothing.
 */
export interface Good {
  id: string
  basePrice: number
  stock: number
  maxStock: number
  restockEvery: number // ticks between +1 stock
  restockTimer: number
}

export interface Economy {
  goods: Record<string, Good>
}

export function createEconomy(): Economy {
  return {
    goods: {
      bread: { id: 'bread', basePrice: 3, stock: 12, maxStock: 12, restockEvery: 6, restockTimer: 0 },
      medicine: { id: 'medicine', basePrice: 7, stock: 8, maxStock: 8, restockEvery: 10, restockTimer: 0 },
      drink: { id: 'drink', basePrice: 4, stock: 10, maxStock: 10, restockEvery: 8, restockTimer: 0 },
      weapon: { id: 'weapon', basePrice: 15, stock: 4, maxStock: 4, restockEvery: 30, restockTimer: 0 },
    },
  }
}

/** Current market price for a good (rises as stock drops). */
export function marketPrice(e: Economy, id: string): number {
  const g = e.goods[id]
  if (!g) return 0
  const scarcity = 1 - g.stock / g.maxStock
  return Math.round(g.basePrice * (1 + scarcity * 0.8))
}

export function tickEconomy(e: Economy): void {
  for (const g of Object.values(e.goods)) {
    g.restockTimer++
    if (g.restockTimer >= g.restockEvery && g.stock < g.maxStock) {
      g.stock++
      g.restockTimer = 0
    }
  }
}

/** A creature pays and receives a good from the tower. Nothing is free. */
export function buyFromTower(e: Economy, towerId: string, buyer: { wallet: number }): boolean {
  const goodId = towerId === 'food' ? 'bread'
    : towerId === 'pharmacy' ? 'medicine'
      : towerId === 'tavern' ? 'drink'
        : towerId === 'tools' ? 'weapon'
          : null
  if (!goodId) return false
  const g = e.goods[goodId]
  if (!g || g.stock <= 0) return false
  const price = marketPrice(e, goodId)
  if (buyer.wallet < price) return false
  buyer.wallet -= price
  g.stock -= 1
  return true
}

/** How many ticks a work shift lasts, and the pay. */
export const WORK_SHIFT_TICKS = 24
export const WORK_PAY = 5

/**
 * Advance a creature's work shift. Returns true when the shift completes and
 * the creature is paid; false while still working (creature stays put).
 */
export function workShift(_e: Economy, c: { wallet: number; action: string; workProgress: number }, ticks: number): boolean {
  c.workProgress += ticks
  c.action = 'work'
  if (c.workProgress >= WORK_SHIFT_TICKS) {
    c.wallet += WORK_PAY
    c.workProgress = 0
    c.action = 'idle'
    return true
  }
  return false
}
