/**
 * economy — nothing is free. Every good has a price and finite stock.
 * Prices rise when stock runs low (scarcity / supply-and-demand) and ease
 * back down as stock replenishes. Work is a timed shift: stay at the work
 * tower for N ticks and you get paid; leave early and you get nothing.
 *
 * MARKET (Slime Rancher-style): we also track how much of each good the
 * creatures bought each day. A day ticks over on an interval; if sales ran
 * far ahead of the demand quota the price drifts up, and if sales were quiet
 * the price drifts back toward base. Players can watch ▲/▼ trends and learn
 * to sell at the peak. Prices always stay inside sane bounds.
 */
export interface Good {
  id: string
  basePrice: number
  stock: number
  maxStock: number
  restockEvery: number // ticks between +1 stock
  restockTimer: number
  priceFactor: number // 1 = base price; drifts with demand
}

export interface Economy {
  goods: Record<string, Good>
  day: number
  sales: Record<string, number[]> // goodId -> units sold per day (rolling)
  DAY_TICKS: number
}

/** The goods the economy knows about. */
export const GOODS = ['bread', 'medicine', 'brew', 'weapon', 'herb', 'spark', 'tonic'] as const

/** How much the market absorbs per day at the fair price, per good. */
export const DEMAND_QUOTA: Record<string, number> = {
  bread: 10,
  medicine: 6,
  brew: 8,
  weapon: 2,
  herb: 6,
  spark: 4,
  tonic: 6,
}

const DAY_TICKS = 400 // one "market day" ≈ 400 sim ticks (a few minutes of play)

export function createEconomy(): Economy {
  return {
    goods: {
      bread: { id: 'bread', basePrice: 3, stock: 12, maxStock: 12, restockEvery: 6, restockTimer: 0, priceFactor: 1 },
      medicine: { id: 'medicine', basePrice: 7, stock: 8, maxStock: 8, restockEvery: 10, restockTimer: 0, priceFactor: 1 },
      brew: { id: 'brew', basePrice: 4, stock: 10, maxStock: 10, restockEvery: 8, restockTimer: 0, priceFactor: 1 },
      weapon: { id: 'weapon', basePrice: 15, stock: 4, maxStock: 4, restockEvery: 30, restockTimer: 0, priceFactor: 1 },
      herb: { id: 'herb', basePrice: 5, stock: 8, maxStock: 8, restockEvery: 10, restockTimer: 0, priceFactor: 1 },
      spark: { id: 'spark', basePrice: 9, stock: 5, maxStock: 5, restockEvery: 14, restockTimer: 0, priceFactor: 1 },
      tonic: { id: 'tonic', basePrice: 6, stock: 8, maxStock: 8, restockEvery: 10, restockTimer: 0, priceFactor: 1 },
    },
    day: 0,
    sales: {},
    DAY_TICKS,
  }
}

/** Current market price for a good (rises as stock drops, drifts with demand). */
export function marketPrice(e: Economy, id: string): number {
  const g = e.goods[id]
  if (!g) return 0
  const scarcity = 1 - g.stock / g.maxStock
  return Math.max(1, Math.round(g.basePrice * g.priceFactor * (1 + scarcity * 0.6)))
}

/** Record that a creature bought `amount` of a good today. */
export function recordSale(e: Economy, id: string, amount = 1): void {
  if (!e.goods[id]) return
  if (!e.sales[id]) e.sales[id] = []
  while (e.sales[id].length <= e.day) e.sales[id].push(0)
  e.sales[id][e.day] += amount
}

/** Units of `id` sold on `day` (0 if not tracked). Negative = all days. */
export function salesSinceDay(e: Economy, id: string, day: number): number {
  const arr = e.sales[id]
  if (!arr) return 0
  if (day >= 0 && day < arr.length) return arr[day]
  if (day < 0) return arr.reduce((a, b) => a + b, 0)
  return 0 // specific day outside the tracked window = no sales that day
}

/** Advance the economy. Returns true when a market day rolled over. */
export function tickEconomy(e: Economy): boolean {
  for (const g of Object.values(e.goods)) {
    g.restockTimer++
    if (g.restockTimer >= g.restockEvery && g.stock < g.maxStock) {
      g.stock++
      g.restockTimer = 0
    }
  }
  return false
}

/** Advance a full market day: adjust prices by yesterday's demand. */
export function tickMarketDay(e: Economy, day: number): void {
  e.day = day
  for (const id of GOODS) {
    const g = e.goods[id]
    const sold = salesSinceDay(e, id, day - 1)
    const quota = DEMAND_QUOTA[id]
    // heavy demand (sales >> quota) → price rises; light demand → eases down
    const ratio = quota > 0 ? sold / quota : 0
    const drift = (ratio - 1) * 0.25
    g.priceFactor = Math.max(0.4, Math.min(2.5, g.priceFactor + drift))
  }
}

/** How a good's price moved over the last market days (▲/▼/—). */
export function priceTrend(e: Economy, id: string): 'up' | 'down' | 'flat' {
  const g = e.goods[id]
  if (!g) return 'flat'
  const before = g.basePrice * (g.priceFactor - 0.02)
  const now = marketPrice(e, id)
  if (now > before + 0.4) return 'up'
  if (now < before - 0.4) return 'down'
  return 'flat'
}

/** A creature pays and receives a good from the tower. Nothing is free. */
export function buyFromTower(e: Economy, towerId: string, buyer: { wallet: number }): string | null {
  const goodId = towerId === 'food' ? 'bread'
    : towerId === 'pharmacy' ? 'medicine'
      : towerId === 'tavern' ? 'brew'
        : towerId === 'tools' ? 'weapon'
          : towerId === 'den' ? (Math.random() < 0.4 ? 'spark' : 'herb')
            : null
  if (!goodId) return null
  const g = e.goods[goodId]
  if (!g || g.stock <= 0) return null
  const price = marketPrice(e, goodId)
  if (buyer.wallet < price) return null
  buyer.wallet -= price
  g.stock -= 1
  recordSale(e, goodId, 1)
  return goodId
}

/** How many ticks a work shift lasts, and the pay. */
export const WORK_SHIFT_TICKS = 24
export const WORK_PAY = 8 // a shift buys more than a meal — real progress

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

// ── subjective value, negotiation, refusal, debt ──────────────────────────

/**
 * What an item is WORTH to a particular creature right now. A starving
 * creature values bread far above list price; a wealthy one shrugs at it.
 * This is the number creatures haggle around — prices are never truly fixed.
 */
export function valueTo(
  e: Economy,
  c: {
    chem: { hunger: number; health: number; energy: number; pleasure: number }
    wallet: number
    genome: { greed: number; addictionProne: number }
    chemAddiction?: Record<string, number>
  },
  goodId: string,
): number {
  const base = marketPrice(e, goodId)
  let need = 1
  if (goodId === 'bread' || goodId === 'grain') need += (1 - c.chem.hunger) * 1.4
  if (goodId === 'water') need += (1 - c.chem.hunger) * 0.4
  if (goodId === 'medicine' || goodId === 'tonic') need += (1 - c.chem.health) * 1.6
  if (goodId === 'brew' || goodId === 'herb' || goodId === 'spark') {
    const dep = c.chemAddiction?.[goodId] ?? 0
    need += dep * 1.5 + (1 - c.chem.pleasure) * 0.4
  }
  // the poor feel every coin; the greedy always want a bargain
  const wealthFactor = c.wallet < 5 ? 0.85 : c.wallet > 30 ? 1.15 : 1
  const greedFactor = 1 - c.genome.greed * 0.15
  return Math.max(1, Math.round(base * need * wealthFactor * greedFactor))
}

export interface Offer {
  price: number
  accepted: boolean
  reason: 'fair' | 'friend-discount' | 'too-expensive' | 'refused-thief' | 'no-stock'
}

/**
 * Negotiate a price between two parties. Trust buys a discount, suspicion
 * adds a markup, and a known thief can simply be refused service.
 */
export function negotiate(
  e: Economy,
  goodId: string,
  sellerView: { trust: number; thief: number },
  buyerBudget: number,
  buyerValue: number,
): Offer {
  const good = e.goods[goodId]
  if (!good || good.stock <= 0) return { price: 0, accepted: false, reason: 'no-stock' }
  if (sellerView.thief > 0.55 && sellerView.trust < 0) {
    return { price: 0, accepted: false, reason: 'refused-thief' }
  }
  const list = marketPrice(e, goodId)
  const trustAdj = 1 - Math.max(0, sellerView.trust) * 0.2 + Math.max(0, -sellerView.trust) * 0.25
  const suspicionAdj = 1 + sellerView.thief * 0.3
  const price = Math.max(1, Math.round(list * trustAdj * suspicionAdj))
  if (price > buyerBudget) return { price, accepted: false, reason: 'too-expensive' }
  if (price > buyerValue * 1.35) return { price, accepted: false, reason: 'too-expensive' }
  return {
    price,
    accepted: true,
    reason: sellerView.trust > 0.3 ? 'friend-discount' : 'fair',
  }
}

export interface Debt {
  fromId: number // owes
  toId: number // owed
  amount: number
  since: number
}

export interface Ledger {
  debts: Debt[]
}

export function createLedger(): Ledger {
  return { debts: [] }
}

/** Record an informal obligation — a loan, an unpaid tab, a favor in coin. */
export function addDebt(ledger: Ledger, fromId: number, toId: number, amount: number, tick: number): void {
  const existing = ledger.debts.find((d) => d.fromId === fromId && d.toId === toId)
  if (existing) {
    existing.amount += amount
    return
  }
  ledger.debts.push({ fromId, toId, amount, since: tick })
}

/** Pay down a debt; returns how much was actually repaid. */
export function repayDebt(ledger: Ledger, fromId: number, toId: number, amount: number): number {
  const debt = ledger.debts.find((d) => d.fromId === fromId && d.toId === toId)
  if (!debt) return 0
  const paid = Math.min(debt.amount, amount)
  debt.amount -= paid
  if (debt.amount <= 0.001) {
    ledger.debts = ledger.debts.filter((d) => d !== debt)
  }
  return paid
}

export function totalOwedBy(ledger: Ledger, id: number): number {
  return ledger.debts.filter((d) => d.fromId === id).reduce((s, d) => s + d.amount, 0)
}

export function totalOwedTo(ledger: Ledger, id: number): number {
  return ledger.debts.filter((d) => d.toId === id).reduce((s, d) => s + d.amount, 0)
}

/** Drop debts owed by or to the dead so the ledger stays small. */
export function pruneLedger(ledger: Ledger, aliveIds: Set<number>): void {
  ledger.debts = ledger.debts.filter((d) => aliveIds.has(d.fromId) && aliveIds.has(d.toId))
}

/** Simple inequality readout for the society panel (0 = equal, 1 = extreme). */
export function wealthInequality(wallets: number[]): number {
  if (wallets.length < 2) return 0
  const sorted = [...wallets].sort((a, b) => a - b)
  const total = sorted.reduce((s, w) => s + w, 0)
  if (total <= 0) return 0
  let cum = 0
  let gini = 0
  for (let i = 0; i < sorted.length; i++) {
    cum += sorted[i]
    gini += cum / total
  }
  const n = sorted.length
  return Math.max(0, Math.min(1, (n + 1 - 2 * gini) / n))
}
