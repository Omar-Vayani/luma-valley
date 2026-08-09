/**
 * society — lightweight society/economy core (strict TDD).
 * Tests written first; run them to see them fail, then implement society.ts.
 */
import { describe, expect, it } from 'vitest'
import {
  addNpc,
  bestChoice,
  buyFromMarket,
  choosePartner,
  compactSociety,
  countAlive,
  createSociety,
  deserializeSociety,
  getNpc,
  getRelationship,
  killNpc,
  marketPrice,
  recordSocialEvent,
  sampleChoice,
  sellToMarket,
  serializeSociety,
  setTrait,
  socialUtilities,
  tickSociety,
  work,
  type SocialChoice,
  type Traits,
} from './society'
import { mulberry32, type RNG } from './rng'

const TRAIT_KEYS: (keyof Traits)[] = ['trust', 'attachment', 'love', 'betrayal', 'fear', 'greed']
const CHOICES: SocialChoice[] = ['follow', 'flee', 'share', 'hoard', 'trade', 'fight', 'cooperate']

function mkSociety() {
  return createSociety({})
}

function mkRng(seed = 1): RNG {
  return mulberry32(seed)
}

function pos(x: number, z: number) {
  return { x, z }
}

function expectTraitsBounded(t: Traits) {
  for (const k of TRAIT_KEYS) {
    expect(t[k]).toBeGreaterThanOrEqual(0)
    expect(t[k]).toBeLessThanOrEqual(1)
  }
}

describe('society state creation', () => {
  it('creates an empty society with sane defaults', () => {
    const s = mkSociety()
    expect(s.tick).toBe(0)
    expect(s.nextNpcId).toBe(1)
    expect(countAlive(s)).toBe(0)
    expect(s.events).toEqual([])
  })

  it('addNpc assigns sequential ids and stores alive npcs', () => {
    const s = mkSociety()
    const a = addNpc(s, { name: 'Ada' })
    const b = addNpc(s, { name: 'Bo' })
    expect(a).toBe(1)
    expect(b).toBe(2)
    expect(getNpc(s, a)?.name).toBe('Ada')
    expect(getNpc(s, a)?.alive).toBe(true)
    expect(getNpc(s, 99)).toBeUndefined()
  })

  it('clamps out-of-range traits on creation', () => {
    const s = mkSociety()
    const id = addNpc(s, { traits: { trust: 5, greed: -1 } })
    const npc = getNpc(s, id)!
    expect(npc.traits.trust).toBe(1)
    expect(npc.traits.greed).toBe(0)
    expectTraitsBounded(npc.traits)
  })

  it('randomized traits from injected rng stay bounded', () => {
    const s = mkSociety()
    for (let i = 0; i < 20; i++) {
      const id = addNpc(s, { rng: mkRng(i + 100) })
      expectTraitsBounded(getNpc(s, id)!.traits)
    }
  })

  it('addNpc accepts an explicit id (game sync) and advances nextNpcId', () => {
    const s = mkSociety()
    const a = addNpc(s, { id: 7, name: 'Seven' })
    expect(a).toBe(7)
    expect(getNpc(s, 7)!.name).toBe('Seven')
    const b = addNpc(s, {})
    expect(b).toBe(8)
    const c = addNpc(s, { id: 3 })
    expect(c).toBe(3)
    expect(addNpc(s, {})).toBe(9)
  })

  it('setTrait clamps to the 0..1 range', () => {
    const s = mkSociety()
    const id = addNpc(s, {})
    setTrait(s, id, 'fear', 5)
    expect(getNpc(s, id)!.traits.fear).toBe(1)
    setTrait(s, id, 'love', -3)
    expect(getNpc(s, id)!.traits.love).toBe(0)
  })
})

describe('relationship memory', () => {
  it('starts with no stored relationship', () => {
    const s = mkSociety()
    const a = addNpc(s, {})
    const b = addNpc(s, {})
    expect(getRelationship(s, a, b)).toBeUndefined()
  })

  it('sharing directly raises trust and attachment in the actor memory of the partner', () => {
    const s = mkSociety()
    const a = addNpc(s, {})
    const b = addNpc(s, {})
    recordSocialEvent(s, 'share', a, b)
    const rel = getRelationship(s, a, b)!
    expect(rel.trust).toBeGreaterThan(0.5)
    expect(rel.attachment).toBeGreaterThan(0)
    expect(rel.interactions).toBe(1)
  })

  it('fighting directly raises betrayal and fear, lowers trust in the target memory of the attacker', () => {
    const s = mkSociety()
    const a = addNpc(s, {})
    const b = addNpc(s, {})
    recordSocialEvent(s, 'fight', a, b)
    const rel = getRelationship(s, b, a)!
    expect(rel.betrayal).toBeGreaterThan(0)
    expect(rel.fear).toBeGreaterThan(0)
    expect(rel.trust).toBeLessThan(0.5)
  })

  it('a nearby witness updates its memory of the actor (smaller than direct)', () => {
    const s = mkSociety()
    const a = addNpc(s, {})
    const b = addNpc(s, {})
    const w = addNpc(s, {})
    recordSocialEvent(s, 'fight', a, b)
    expect(getRelationship(s, w, a)!.fear).toBeGreaterThan(0)
    expect(getRelationship(s, w, a)!.trust).toBeLessThan(0.5)
    expect(getRelationship(s, w, a)!.fear).toBeLessThan(getRelationship(s, b, a)!.fear)
  })

  it('a distant npc does not witness the event', () => {
    const s = mkSociety()
    const a = addNpc(s, {})
    const b = addNpc(s, {})
    const f = addNpc(s, {})
    recordSocialEvent(s, 'fight', a, b, { at: pos(0, 0), positions: { [f]: pos(100, 100) } })
    expect(getRelationship(s, f, a)).toBeUndefined()
  })

  it('repeated negative events stay bounded at 1 (betrayal never exceeds)', () => {
    const s = mkSociety()
    const a = addNpc(s, {})
    const b = addNpc(s, {})
    for (let i = 0; i < 10; i++) recordSocialEvent(s, 'fight', a, b)
    const rel = getRelationship(s, b, a)!
    expect(rel.betrayal).toBe(1)
    expect(rel.fear).toBeLessThanOrEqual(1)
    expect(rel.trust).toBeGreaterThanOrEqual(0)
  })
})

describe('utility-weighted social choices', () => {
  it('hoard dominates for a greedy, distrustful npc', () => {
    const s = mkSociety()
    const a = addNpc(s, { traits: { greed: 0.95, trust: 0.1, attachment: 0, love: 0, betrayal: 0.5, fear: 0.3 } })
    const b = addNpc(s, { traits: { trust: 0.5, greed: 0.4 } })
    const u = socialUtilities(s, a, b)
    expect(bestChoice(u)).toBe('hoard')
  })

  it('flee dominates for a fearful, betrayed npc', () => {
    const s = mkSociety()
    const a = addNpc(s, { traits: { fear: 0.9, betrayal: 0.9, trust: 0.1, attachment: 0, love: 0, greed: 0.2 } })
    const b = addNpc(s, { traits: { trust: 0.5 } })
    const u = socialUtilities(s, a, b)
    expect(bestChoice(u)).toBe('flee')
  })

  it('follow dominates for a strongly bonded pair', () => {
    const s = mkSociety()
    const a = addNpc(s, { traits: { trust: 0.9, attachment: 0.9, love: 0.9, fear: 0.05, betrayal: 0.05, greed: 0.3 } })
    const b = addNpc(s, { traits: { trust: 0.9 } })
    const u = socialUtilities(s, a, b)
    expect(bestChoice(u)).toBe('follow')
  })

  it('fight dominates when betrayed, greedy, and unafraid', () => {
    const s = mkSociety()
    const a = addNpc(s, { traits: { betrayal: 0.9, greed: 0.9, fear: 0.1, trust: 0.1 } })
    const b = addNpc(s, { traits: { trust: 0.5 }, wallet: 5, inventory: { berry: 2 } })
    const u = socialUtilities(s, a, b)
    expect(bestChoice(u)).toBe('fight')
  })

  it('sampleChoice is deterministic for the same seed and utility vector', () => {
    const u: Record<SocialChoice, number> = { follow: 1, flee: 0.1, share: 0.3, hoard: 0.8, trade: 0.5, fight: 0.2, cooperate: 0.7 }
    const r1 = mkRng(42)
    const r2 = mkRng(42)
    const c1 = sampleChoice(u, r1)
    const c2 = sampleChoice(u, r2)
    expect(c1).toBe(c2)
  })

  it('sampleChoice at very low temperature always picks the argmax', () => {
    const u: Record<SocialChoice, number> = { follow: 0.2, flee: 0.1, share: 0.3, hoard: 5, trade: 0.5, fight: 0.2, cooperate: 0.4 }
    for (let i = 0; i < 10; i++) {
      expect(sampleChoice(u, mkRng(i), 0.01)).toBe('hoard')
    }
  })

  it('choosePartner with maxNeighborsConsidered=1 picks the nearest alive npc', () => {
    const s = createSociety({ maxNeighborsConsidered: 1, maxWitnessDistance: 10 })
    const ids: number[] = []
    for (let i = 0; i < 5; i++) ids.push(addNpc(s, { name: `n${i}` }))
    const positions = {
      [ids[0]]: pos(0, 0),
      [ids[1]]: pos(1, 0),
      [ids[2]]: pos(2, 0),
      [ids[3]]: pos(3, 0),
      [ids[4]]: pos(4, 0),
    }
    const p = choosePartner(s, ids[0], mkRng(7), positions)
    expect(p).toBe(ids[1])
  })

  it('choosePartner returns null when alone', () => {
    const s = mkSociety()
    const a = addNpc(s, {})
    expect(choosePartner(s, a, mkRng(1))).toBeNull()
  })
})

describe('tick loop', () => {
  it('advances the tick and yields one social event per alive npc', () => {
    const s = mkSociety()
    addNpc(s, {})
    addNpc(s, {})
    addNpc(s, {})
    const evs = tickSociety(s, mkRng(3))
    expect(s.tick).toBe(1)
    expect(evs).toHaveLength(3)
    for (const e of evs) {
      expect(e.tick).toBe(1)
      expect(CHOICES).toContain(e.kind)
    }
  })

  it('dead npcs do not act', () => {
    const s = mkSociety()
    addNpc(s, {})
    addNpc(s, {})
    const d = addNpc(s, {})
    killNpc(s, d)
    const evs = tickSociety(s, mkRng(4))
    expect(evs).toHaveLength(2)
    expect(evs.some((e) => e.actorId === d)).toBe(false)
  })

  it('two societies with the same seed evolve identically', () => {
    const s1 = mkSociety()
    const s2 = mkSociety()
    for (let i = 0; i < 5; i++) {
      addNpc(s1, {})
      addNpc(s2, {})
    }
    const positions = { 1: pos(0, 0), 2: pos(1, 0), 3: pos(2, 0), 4: pos(3, 0), 5: pos(4, 0) }
    for (let t = 0; t < 5; t++) {
      const e1 = tickSociety(s1, mkRng(9), { positions })
      const e2 = tickSociety(s2, mkRng(9), { positions })
      expect(e1).toEqual(e2)
    }
    expect(s1.events).toEqual(s2.events)
    for (const id of [1, 2, 3, 4, 5]) {
      expect(getNpc(s1, id)!.wallet).toBe(getNpc(s2, id)!.wallet)
    }
  })

  it('perf: 20 npcs x 100 ticks completes quickly (local-pair budget)', () => {
    const s = mkSociety()
    const positions: Record<number, { x: number; z: number }> = {}
    for (let i = 0; i < 20; i++) {
      const id = addNpc(s, { rng: mkRng(i + 1) })
      positions[id] = pos((i % 5) * 2, Math.floor(i / 5) * 2)
    }
    const rng = mkRng(123)
    const t0 = performance.now()
    for (let t = 0; t < 100; t++) tickSociety(s, rng, { positions })
    const elapsed = performance.now() - t0
    expect(s.tick).toBe(100)
    expect(countAlive(s)).toBe(20)
    expect(elapsed).toBeLessThan(3000)
  })
})

describe('economy: wallets, work, market', () => {
  it('work adds the wage to the wallet', () => {
    const s = mkSociety()
    const id = addNpc(s, { wallet: 0 })
    expect(work(s, id)).toBe(true)
    expect(getNpc(s, id)!.wallet).toBe(1)
  })

  it('work fails for dead npcs', () => {
    const s = mkSociety()
    const id = addNpc(s, { wallet: 2 })
    killNpc(s, id)
    expect(work(s, id)).toBe(false)
    expect(getNpc(s, id)!.wallet).toBe(2)
  })

  it('market price rises as stock falls (scarcity)', () => {
    const s = mkSociety()
    // default berry: base 1, max 20, elasticity 1
    const high = marketPrice(s, 'berry') // full stock -> base price
    for (let i = 0; i < 18; i++) s.market.stocks.berry--
    const low = marketPrice(s, 'berry')
    expect(high).toBeCloseTo(1, 5)
    expect(low).toBeGreaterThan(high)
  })

  it('buyFromMarket charges the current price and removes stock', () => {
    const s = mkSociety()
    const id = addNpc(s, { wallet: 10, capacity: 4 })
    // stock 20 -> price 1
    expect(buyFromMarket(s, id, 'berry', 1)).toBe(true)
    const npc = getNpc(s, id)!
    expect(npc.inventory.items.berry).toBe(1)
    expect(npc.wallet).toBeCloseTo(9, 5)
    expect(s.market.stocks.berry).toBe(19)
    expect(s.market.wallet).toBeCloseTo(101, 5)
  })

  it('buyFromMarket fails when stock is empty or wallet is insufficient', () => {
    const s = mkSociety()
    const id = addNpc(s, { wallet: 0 })
    expect(buyFromMarket(s, id, 'berry', 1)).toBe(false)
    expect(getNpc(s, id)!.inventory.items.berry ?? 0).toBe(0)
    const id2 = addNpc(s, { wallet: 100 })
    s.market.stocks.berry = 0
    expect(buyFromMarket(s, id2, 'berry', 1)).toBe(false)
  })

  it('buyFromMarket respects the tiny inventory capacity', () => {
    const s = mkSociety()
    const id = addNpc(s, { wallet: 100, capacity: 2, inventory: { berry: 1 } })
    expect(buyFromMarket(s, id, 'berry', 2)).toBe(false) // 1 + 2 > 2
    expect(buyFromMarket(s, id, 'berry', 1)).toBe(true)
    expect(getNpc(s, id)!.inventory.items.berry).toBe(2)
  })

  it('sellToMarket pays the npc and adds stock, capped at max', () => {
    const s = mkSociety()
    const id = addNpc(s, { wallet: 0, inventory: { berry: 5 } })
    s.market.stocks.berry = 18 // below max so the sale is allowed
    expect(sellToMarket(s, id, 'berry', 2)).toBe(true)
    const npc = getNpc(s, id)!
    expect(npc.inventory.items.berry).toBe(3)
    expect(npc.wallet).toBeCloseTo(2.2, 5) // price at stock 18 = 1.1 each
    expect(s.market.stocks.berry).toBe(20) // capped at max
    expect(s.market.wallet).toBeCloseTo(97.8, 5)
  })

  it('sellToMarket fails when the market is at capacity', () => {
    const s = mkSociety()
    const id = addNpc(s, { inventory: { berry: 3 } })
    s.market.stocks.berry = 20 // max
    expect(sellToMarket(s, id, 'berry', 1)).toBe(false)
  })

  it('sellToMarket fails when the market cannot pay', () => {
    const s = mkSociety()
    const id = addNpc(s, { inventory: { berry: 3 } })
    s.market.wallet = 0
    expect(sellToMarket(s, id, 'berry', 1)).toBe(false)
  })

  it('market transactions reject non-positive quantities', () => {
    const s = mkSociety()
    const id = addNpc(s, { wallet: 10, inventory: { berry: 2 } })
    expect(buyFromMarket(s, id, 'berry', 0)).toBe(false)
    expect(sellToMarket(s, id, 'berry', -1)).toBe(false)
  })
})

describe('death is permanent', () => {
  it('killNpc marks death permanently and records a death event', () => {
    const s = mkSociety()
    const a = addNpc(s, {})
    const b = addNpc(s, {})
    const before = s.events.length
    killNpc(s, b, { killerId: a })
    expect(getNpc(s, b)!.alive).toBe(false)
    expect(getNpc(s, b)!.deathTick).toBe(0)
    expect(countAlive(s)).toBe(1)
    expect(s.events.length).toBe(before + 1)
    expect(s.events.at(-1)!.kind).toBe('death')
    expect(s.events.at(-1)!.actorId).toBe(b)
    expect(s.events.at(-1)!.killerId).toBe(a)
  })

  it('a second kill is a no-op', () => {
    const s = mkSociety()
    const a = addNpc(s, {})
    killNpc(s, a)
    const before = s.events.length
    killNpc(s, a, { killerId: 1 })
    expect(s.events.length).toBe(before)
  })

  it('relationships to the dead persist', () => {
    const s = mkSociety()
    const a = addNpc(s, {})
    const b = addNpc(s, {})
    recordSocialEvent(s, 'share', a, b)
    killNpc(s, b)
    expect(getRelationship(s, a, b)!.trust).toBeGreaterThan(0.5)
    expect(getRelationship(s, b, a)).toBeDefined()
  })

  it('witnesses near a killing grow fear of the killer', () => {
    const s = mkSociety()
    const a = addNpc(s, {})
    const b = addNpc(s, {})
    const w = addNpc(s, {})
    killNpc(s, b, { killerId: a, at: pos(0, 0), positions: { [w]: pos(0, 1) } })
    expect(getRelationship(s, w, a)!.fear).toBeGreaterThan(0)
    expect(getRelationship(s, w, a)!.trust).toBeLessThan(0.5)
  })

  it('a fight can kill a weakened npc permanently', () => {
    const s = createSociety({ fightKillChance: 1, temperature: 0.01 })
    const a = addNpc(s, { traits: { betrayal: 0.9, greed: 0.9, fear: 0.1, trust: 0.1 } })
    const b = addNpc(s, { traits: { trust: 0.5 }, wallet: 5, inventory: {}, vitality: 0.05 })
    // make A despise B so fight is the argmax
    recordSocialEvent(s, 'fight', a, b)
    recordSocialEvent(s, 'fight', a, b)
    const evs = tickSociety(s, mkRng(11))
    expect(getNpc(s, b)!.alive).toBe(false)
    expect(getNpc(s, b)!.deathTick).toBe(1)
    expect(evs.some((e) => e.kind === 'death' && e.actorId === b && e.killerId === a)).toBe(true)
  })
})

describe('serialization', () => {
  it('serialize/deserialize round-trips the full state', () => {
    const s = mkSociety()
    for (let i = 0; i < 4; i++) addNpc(s, { rng: mkRng(i + 1) })
    const positions = { 1: pos(0, 0), 2: pos(1, 0), 3: pos(2, 0), 4: pos(3, 0) }
    for (let t = 0; t < 3; t++) tickSociety(s, mkRng(5), { positions })
    killNpc(s, 2, { killerId: 1, at: pos(1, 0), positions: { 3: pos(2, 0), 4: pos(3, 0) } })

    const save = serializeSociety(s)
    const json = JSON.stringify(save)
    const s2 = deserializeSociety(JSON.parse(json))

    expect(s2.tick).toBe(s.tick)
    expect(s2.nextNpcId).toBe(s.nextNpcId)
    expect(s2.npcs).toEqual(s.npcs)
    expect(s2.market).toEqual(s.market)
    expect(s2.events).toEqual(s.events)
  })

  it('serialized save is plain JSON-safe data', () => {
    const s = mkSociety()
    addNpc(s, {})
    const save = serializeSociety(s)
    expect(JSON.parse(JSON.stringify(save))).toEqual(save)
  })

  it('compactSociety caps events and round-trips wallets/stocks/traits/relationships', () => {
    const s = mkSociety()
    const a = addNpc(s, { traits: { greed: 0.77, trust: 0.3 } })
    const b = addNpc(s, { traits: { trust: 0.8 } })
    for (let i = 0; i < 20; i++) recordSocialEvent(s, 'cooperate', a, b)
    s.market.stocks.berry = 13
    s.market.wallet = 42.5
    const save = compactSociety(s, 12)
    expect(save.events.length).toBe(12)
    const s2 = deserializeSociety(JSON.parse(JSON.stringify(save)))
    expect(s2.npcs[a].wallet).toBe(s.npcs[a].wallet)
    expect(s2.npcs[a].traits.greed).toBeCloseTo(0.77, 4)
    expect(s2.npcs[a].traits.trust).toBeCloseTo(s.npcs[a].traits.trust, 4)
    expect(s2.market.stocks.berry).toBe(13)
    expect(s2.market.wallet).toBe(42.5)
    expect(s2.market.maxStocks).toEqual(s.market.maxStocks)
    expect(s2.npcs[a].relationships[b]).toEqual(s.npcs[a].relationships[b])
    // market maps are reconstructed from market state when omitted from config
    expect(s2.config.marketBasePrices).toEqual(s.config.marketBasePrices)
    expect(s2.config.fightKillChance).toBe(s.config.fightKillChance)
    expect(s2.tick).toBe(s.tick)
    expect(s2.nextNpcId).toBe(s.nextNpcId)
  })
})

describe('event kinds used by the sim', () => {
  it('recordSocialEvent records a bounded event log (no unbounded growth)', () => {
    const s = createSociety({ eventLogSize: 8 })
    const a = addNpc(s, {})
    const b = addNpc(s, {})
    for (let i = 0; i < 30; i++) recordSocialEvent(s, 'cooperate', a, b)
    expect(s.events.length).toBe(8)
  })

  it('socialUtilities returns all seven choices bounded', () => {
    const s = mkSociety()
    const a = addNpc(s, {})
    const b = addNpc(s, {})
    const u = socialUtilities(s, a, b)
    for (const k of CHOICES) {
      expect(typeof u[k]).toBe('number')
      expect(Number.isFinite(u[k])).toBe(true)
    }
  })

  it('witness propagation is applied by tickSociety via positions', () => {
    // Deterministic setup: A only ever partners B (K=1, B nearest) and fight is
    // A's argmax (low temperature); W sits just outside partner range but
    // inside witness range of the fight location.
    const s = createSociety({ maxNeighborsConsidered: 1, temperature: 0.01 })
    const a = addNpc(s, { traits: { betrayal: 0.9, greed: 0.9, fear: 0.1, trust: 0.1 } })
    const b = addNpc(s, { wallet: 5, inventory: { berry: 2 }, vitality: 1 })
    const w = addNpc(s, {})
    recordSocialEvent(s, 'fight', a, b)
    recordSocialEvent(s, 'fight', a, b)
    const positions = { [a]: pos(0, 0), [b]: pos(1, 0), [w]: pos(0, 3) }
    tickSociety(s, mkRng(1), { positions })
    expect(getRelationship(s, w, a)!.fear).toBeGreaterThan(0)
    expect(getRelationship(s, w, a)!.trust).toBeLessThan(0.5)
  })
})
