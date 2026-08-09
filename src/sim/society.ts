/**
 * society — pure lightweight society/economy core for Luma Valley.
 *
 * Design goals:
 * - No ML inference; all decisions are closed-form utility functions over
 *   bounded 0..1 traits and per-pair relationship memories.
 * - Deterministic: every random draw flows through an injected RNG
 *   (`() => number`, e.g. mulberry32 from ./rng). The RNG is NOT stored in
 *   the state; the integration layer owns the seed so replays are possible.
 * - Local-pair computation: with `positions` supplied each tick, an NPC only
 *   considers the nearest `maxNeighborsConsidered` alive neighbours within
 *   `maxWitnessDistance`, and witness propagation scans only that radius.
 *   Without positions it falls back to all alive NPCs (still O(N^2) for the
 *   5-20 NPC budget — trivially cheap on an S24 Ultra).
 * - Serialization-friendly: state is plain JSON-safe data; serialize/
 *   deserialize round-trips everything except the injected RNG.
 * - Death is permanent: dead NPCs keep their records and relationships but
 *   never act, work, trade, or appear as partners/witnesses again.
 *
 * Integration notes for Creature/Game/save:
 * - Positions map: Record<npcId, {x, z}> — pass the same positions the game
 *   uses each tick; witness radius and neighbour selection derive from it.
 * - The market is a single self-service vendor: NPCs vend items in
 *   (`sellToMarket`) and buy out (`buyFromMarket`). Prices are derived on
 *   demand from current stock (`marketPrice`), so scarcity always moves
 *   prices without a separate price-update pass.
 * - `tickSociety(state, rng, { positions })` returns the events emitted that
 *   tick; the same events are appended to `state.events` (bounded log).
 */
import { clamp, type RNG } from './rng'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ItemId = string

export type SocialChoice = 'follow' | 'flee' | 'share' | 'hoard' | 'trade' | 'fight' | 'cooperate'

export type SocialEventKind = SocialChoice | 'work' | 'death'

export const SOCIAL_CHOICES: readonly SocialChoice[] = [
  'follow',
  'flee',
  'share',
  'hoard',
  'trade',
  'fight',
  'cooperate',
]

export interface Vec2 {
  x: number
  z: number
}

/** All six bounded 0..1 personality dimensions. */
export interface Traits {
  trust: number
  attachment: number
  love: number
  betrayal: number
  fear: number
  greed: number
}

/** Per-NPC memory of another NPC (bounded 0..1). Created lazily, priors = own traits. */
export interface RelationshipMemory {
  trust: number
  attachment: number
  love: number
  betrayal: number
  fear: number
  interactions: number
}

/** Tiny inventory: a flat item->count map plus a total-unit capacity. */
export interface Inventory {
  items: Record<ItemId, number>
  capacity: number
}

export interface Npc {
  id: number
  name: string
  alive: boolean
  deathTick: number | null
  vitality: number // 0..1; reaching 0 (fights) is permanent death
  traits: Traits
  wallet: number
  inventory: Inventory
  relationships: Record<number, RelationshipMemory>
  lastChoice: SocialChoice | null
}

export interface MarketState {
  stocks: Record<ItemId, number> // finite local stock (scarcity)
  maxStocks: Record<ItemId, number> // ceiling; sells beyond this are refused
  basePrices: Record<ItemId, number>
  wallet: number // funds for buying from NPCs; cannot go negative
}

export interface SocialEvent {
  tick: number
  kind: SocialEventKind
  actorId: number
  targetId: number | null
  item?: ItemId
  amount?: number
  /** money moved; negative = paid out by the actor (market buy). */
  money?: number
  direction?: 'buy' | 'sell'
  killerId?: number
}

export interface DirectEffects {
  share?: Partial<Pick<RelationshipMemory, 'trust' | 'attachment' | 'love'>>
  fight?: { trust?: number; betrayal?: number; fear?: number; selfTrust?: number }
  cooperate?: Partial<Pick<RelationshipMemory, 'trust' | 'attachment'>>
  trade?: Partial<Pick<RelationshipMemory, 'trust'>>
  follow?: Partial<Pick<RelationshipMemory, 'attachment' | 'trust'>>
  flee?: Partial<Pick<RelationshipMemory, 'fear'>>
  hoard?: Partial<Pick<Traits, 'greed'>>
}

export interface SocietyConfig {
  temperature: number // softmax temperature for utility-weighted choice sampling
  maxWitnessDistance: number
  maxNeighborsConsidered: number
  witnessScale: number // reputation leak = direct delta * witnessScale
  wage: number // per-tick work earnings
  fightKillChance: number // chance a fight is lethal (rng roll per fight)
  priceElasticity: number // how hard scarcity pushes price up
  eventLogSize: number // bounded event history kept on state
  startingWallet: number
  inventoryCapacity: number
  marketFunds: number
  marketStocks: Record<ItemId, number>
  marketMaxStocks: Record<ItemId, number>
  marketBasePrices: Record<ItemId, number>
  direct: DirectEffects
}

export interface SocietyState {
  npcs: Record<number, Npc>
  market: MarketState
  config: SocietyConfig
  tick: number
  nextNpcId: number
  events: SocialEvent[]
}

/** JSON-safe projection of the state (no functions, no RNG). */
export interface SocietySave {
  npcs: Record<number, Npc>
  market: MarketState
  /** Partial so compact saves can omit market maps (reconstructed from market state). */
  config?: Partial<SocietyConfig>
  tick: number
  nextNpcId: number
  events: SocialEvent[]
}

export interface AddNpcOptions {
  /** Explicit npc id — used by the game to keep society NPCs in sync with creatures. */
  id?: number
  name?: string
  traits?: Partial<Traits>
  wallet?: number
  inventory?: Record<ItemId, number>
  capacity?: number
  vitality?: number
  rng?: RNG // if provided and a trait is unspecified, randomize it
}

export interface TickOptions {
  positions?: Record<number, Vec2>
}

export interface EventOptions {
  at?: Vec2
  positions?: Record<number, Vec2>
  killerId?: number
  item?: ItemId
  amount?: number
  money?: number
  direction?: 'buy' | 'sell'
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_TRAITS: Traits = {
  trust: 0.5,
  attachment: 0.3,
  love: 0.2,
  betrayal: 0.1,
  fear: 0.2,
  greed: 0.4,
}

export const DEFAULT_CONFIG: SocietyConfig = {
  temperature: 0.25,
  maxWitnessDistance: 6,
  maxNeighborsConsidered: 4,
  witnessScale: 0.3,
  wage: 1,
  fightKillChance: 0.05,
  priceElasticity: 1,
  eventLogSize: 128,
  startingWallet: 5,
  inventoryCapacity: 4,
  marketFunds: 100,
  marketStocks: { berry: 20, fish: 8, wood: 15 },
  marketMaxStocks: { berry: 20, fish: 8, wood: 15 },
  marketBasePrices: { berry: 1, fish: 3, wood: 2 },
  direct: {
    share: { trust: 0.15, attachment: 0.1, love: 0.05 },
    fight: { trust: -0.2, betrayal: 0.25, fear: 0.2, selfTrust: -0.05 },
    cooperate: { trust: 0.1, attachment: 0.08 },
    trade: { trust: 0.05 },
    follow: { attachment: 0.02, trust: 0.01 },
    flee: { fear: 0.02 },
    hoard: { greed: 0.02 },
  },
}

function mergeConfig(partial: Partial<SocietyConfig> = {}): SocietyConfig {
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    direct: { ...DEFAULT_CONFIG.direct, ...partial.direct },
  }
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function createSociety(partial: Partial<SocietyConfig> = {}): SocietyState {
  const config = mergeConfig(partial)
  return {
    npcs: {},
    market: {
      stocks: { ...config.marketStocks },
      maxStocks: { ...config.marketMaxStocks },
      basePrices: { ...config.marketBasePrices },
      wallet: config.marketFunds,
    },
    config,
    tick: 0,
    nextNpcId: 1,
    events: [],
  }
}

export function addNpc(state: SocietyState, opts: AddNpcOptions = {}): number {
  const id = opts.id ?? state.nextNpcId++
  if (opts.id !== undefined) state.nextNpcId = Math.max(state.nextNpcId, id + 1)
  const rng = opts.rng
  const traits: Traits = { ...DEFAULT_TRAITS }
  for (const k of Object.keys(traits) as (keyof Traits)[]) {
    let v = opts.traits?.[k]
    if (v === undefined && rng) v = clamp(DEFAULT_TRAITS[k] + (rng() - 0.5) * 0.5, 0, 1)
    traits[k] = clamp(v ?? DEFAULT_TRAITS[k], 0, 1)
  }
  const npc: Npc = {
    id,
    name: opts.name ?? `npc-${id}`,
    alive: true,
    deathTick: null,
    vitality: clamp(opts.vitality ?? 1, 0, 1),
    traits,
    wallet: opts.wallet ?? state.config.startingWallet,
    inventory: {
      items: { ...opts.inventory },
      capacity: opts.capacity ?? state.config.inventoryCapacity,
    },
    relationships: {},
    lastChoice: null,
  }
  state.npcs[id] = npc
  return id
}

export function getNpc(state: SocietyState, id: number): Npc | undefined {
  return state.npcs[id]
}

export function countAlive(state: SocietyState): number {
  let n = 0
  for (const id of Object.keys(state.npcs)) if (state.npcs[Number(id)].alive) n++
  return n
}

export function setTrait(state: SocietyState, id: number, key: keyof Traits, value: number): void {
  const npc = state.npcs[id]
  if (npc) npc.traits[key] = clamp(value, 0, 1)
}

export function getRelationship(state: SocietyState, a: number, b: number): RelationshipMemory | undefined {
  return state.npcs[a]?.relationships[b]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function aliveIds(state: SocietyState): number[] {
  const ids: number[] = []
  for (const k of Object.keys(state.npcs)) {
    const id = Number(k)
    if (state.npcs[id].alive) ids.push(id)
  }
  return ids
}

function ensureRel(npc: Npc, partnerId: number): RelationshipMemory {
  let rel = npc.relationships[partnerId]
  if (!rel) {
    rel = {
      trust: npc.traits.trust,
      attachment: npc.traits.attachment,
      love: npc.traits.love,
      betrayal: npc.traits.betrayal,
      fear: npc.traits.fear,
      interactions: 0,
    }
    npc.relationships[partnerId] = rel
  }
  return rel
}

function inventoryCount(npc: Npc): number {
  let n = 0
  for (const k of Object.keys(npc.inventory.items)) n += npc.inventory.items[k]
  return n
}

/** First owned item with count >= n, or null. Deterministic (insertion order). */
function firstItemCountGte(npc: Npc, n: number): ItemId | null {
  for (const k of Object.keys(npc.inventory.items)) {
    if (npc.inventory.items[k] >= n) return k
  }
  return null
}

/** First known good the npc holds zero of, or null. Deterministic. */
function firstItemNeeded(state: SocietyState, npc: Npc): ItemId | null {
  for (const k of Object.keys(state.config.marketBasePrices)) {
    if ((npc.inventory.items[k] ?? 0) === 0) return k
  }
  return null
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function emit(state: SocietyState, ev: SocialEvent): SocialEvent {
  state.events.push(ev)
  if (state.events.length > state.config.eventLogSize) state.events.shift()
  return ev
}

/** Transfer between two inventories; false if source lacks items or target lacks capacity. */
function transferItem(from: Npc, to: Npc, item: ItemId, qty: number): boolean {
  if ((from.inventory.items[item] ?? 0) < qty) return false
  if (inventoryCount(to) + qty > to.inventory.capacity) return false
  from.inventory.items[item] = (from.inventory.items[item] ?? 0) - qty
  to.inventory.items[item] = (to.inventory.items[item] ?? 0) + qty
  return true
}

/** Witnesses within range of `at` (or all alive when no positions given). */
function witnessesFor(
  state: SocietyState,
  actorId: number,
  targetId: number | null,
  at: Vec2 | undefined,
  positions: Record<number, Vec2> | undefined,
): number[] {
  const out: number[] = []
  for (const id of aliveIds(state)) {
    if (id === actorId || id === targetId) continue
    if (positions && at) {
      const p = positions[id]
      if (!p) continue
      if (dist(at, p) > state.config.maxWitnessDistance) continue
    }
    out.push(id)
  }
  return out
}

// ---------------------------------------------------------------------------
// Relationship memory + witness propagation
// ---------------------------------------------------------------------------

/**
 * Record a social event: apply direct relationship deltas, propagate a scaled
 * reputation leak to witnesses, and append to the bounded event log.
 * Returns the event, or null when the actor is unknown/dead.
 */
export function recordSocialEvent(
  state: SocietyState,
  kind: SocialEventKind,
  actorId: number,
  targetId: number | null,
  opts: EventOptions = {},
): SocialEvent | null {
  const actor = state.npcs[actorId]
  if (!actor) return null
  const d = state.config.direct

  if (kind !== 'death' && targetId !== null) {
    const target = state.npcs[targetId]
    if (target) {
      const aRel = ensureRel(actor, targetId)
      aRel.interactions += 1
      if (kind === 'share') {
        applyDelta(aRel, d.share)
        const tRel = ensureRel(target, actorId)
        tRel.interactions += 1
        tRel.trust = clamp(tRel.trust + 0.1, 0, 1)
        tRel.attachment = clamp(tRel.attachment + 0.05, 0, 1)
      } else if (kind === 'fight') {
        const tRel = ensureRel(target, actorId)
        tRel.interactions += 1
        tRel.trust = clamp(tRel.trust + (d.fight?.trust ?? 0), 0, 1)
        tRel.betrayal = clamp(tRel.betrayal + (d.fight?.betrayal ?? 0), 0, 1)
        tRel.fear = clamp(tRel.fear + (d.fight?.fear ?? 0), 0, 1)
        aRel.trust = clamp(aRel.trust + (d.fight?.selfTrust ?? 0), 0, 1)
      } else if (kind === 'cooperate') {
        applyDelta(aRel, d.cooperate)
        const tRel = ensureRel(target, actorId)
        tRel.interactions += 1
        applyDelta(tRel, d.cooperate)
      } else if (kind === 'trade') {
        applyDelta(aRel, d.trade)
      } else if (kind === 'follow') {
        applyDelta(aRel, d.follow)
      } else if (kind === 'flee') {
        applyDelta(aRel, d.flee)
      }
    }
  } else if (kind === 'hoard') {
    actor.traits.greed = clamp(actor.traits.greed + (d.hoard?.greed ?? 0), 0, 1)
  }

  // Witness / reputation propagation (share, cooperate: kind to the actor;
  // fight: aggressive reputation). Death witness handling lives in killNpc
  // (it must not double-emit an event).
  if (kind === 'share' || kind === 'cooperate' || kind === 'fight') {
    const scale = state.config.witnessScale
    for (const w of witnessesFor(state, actorId, targetId, opts.at, opts.positions)) {
      const rel = ensureRel(state.npcs[w], actorId)
      rel.interactions += 1
      if (kind === 'share' || kind === 'cooperate') {
        rel.trust = clamp(rel.trust + 0.15 * scale, 0, 1)
        rel.attachment = clamp(rel.attachment + 0.1 * scale, 0, 1)
      } else {
        rel.trust = clamp(rel.trust - 0.2 * scale, 0, 1)
        rel.fear = clamp(rel.fear + 0.2 * scale, 0, 1)
      }
    }
  }

  return emit(state, {
    tick: state.tick,
    kind,
    actorId,
    targetId,
    item: opts.item,
    amount: opts.amount,
    money: opts.money,
    direction: opts.direction,
    killerId: opts.killerId,
  })
}

function applyDelta(
  rel: RelationshipMemory,
  delta: Partial<Pick<RelationshipMemory, 'trust' | 'attachment' | 'love' | 'betrayal' | 'fear'>> | undefined,
): void {
  if (!delta) return
  if (delta.trust !== undefined) rel.trust = clamp(rel.trust + delta.trust, 0, 1)
  if (delta.attachment !== undefined) rel.attachment = clamp(rel.attachment + delta.attachment, 0, 1)
  if (delta.love !== undefined) rel.love = clamp(rel.love + delta.love, 0, 1)
  if (delta.betrayal !== undefined) rel.betrayal = clamp(rel.betrayal + delta.betrayal, 0, 1)
  if (delta.fear !== undefined) rel.fear = clamp(rel.fear + delta.fear, 0, 1)
}

// ---------------------------------------------------------------------------
// Utilities & choice
// ---------------------------------------------------------------------------

export function softmaxWeights(utils: Record<SocialChoice, number>, temperature: number): Record<SocialChoice, number> {
  const t = Math.max(temperature, 1e-4)
  const exps = SOCIAL_CHOICES.map((k) => Math.exp(utils[k] / t))
  const sum = exps.reduce((a, b) => a + b, 0)
  const out = {} as Record<SocialChoice, number>
  SOCIAL_CHOICES.forEach((k, i) => {
    out[k] = sum > 0 ? exps[i] / sum : 1 / SOCIAL_CHOICES.length
  })
  return out
}

export function bestChoice(utils: Record<SocialChoice, number>): SocialChoice {
  let best = SOCIAL_CHOICES[0]
  for (const k of SOCIAL_CHOICES) if (utils[k] > utils[best]) best = k
  return best
}

/** Utility-weighted sampling (softmax with temperature, then rng draw). */
export function sampleChoice(
  utils: Record<SocialChoice, number>,
  rng: RNG,
  temperature = DEFAULT_CONFIG.temperature,
): SocialChoice {
  const w = softmaxWeights(utils, temperature)
  const r = rng()
  let acc = 0
  for (const k of SOCIAL_CHOICES) {
    acc += w[k]
    if (r <= acc) return k
  }
  return SOCIAL_CHOICES[SOCIAL_CHOICES.length - 1]
}

/**
 * Closed-form utility for each social choice an actor feels toward a partner.
 * Missing relationship memories fall back to the actor's own trait priors.
 */
export function socialUtilities(state: SocietyState, actorId: number, partnerId: number): Record<SocialChoice, number> {
  const actor = state.npcs[actorId]
  const partner = state.npcs[partnerId]
  if (!actor || !partner) {
    const zero = {} as Record<SocialChoice, number>
    for (const k of SOCIAL_CHOICES) zero[k] = 0
    return zero
  }
  const rel = actor.relationships[partnerId]
  const T = rel?.trust ?? actor.traits.trust
  const A = rel?.attachment ?? actor.traits.attachment
  const L = rel?.love ?? actor.traits.love
  const B = rel?.betrayal ?? actor.traits.betrayal
  const F = rel?.fear ?? actor.traits.fear
  const G = actor.traits.greed

  const hasSurplus = firstItemCountGte(actor, 2) !== null
  const surplusFactor = hasSurplus ? 1 : 0.2
  const need = firstItemNeeded(state, actor)
  const canAffordNeed = need !== null && actor.wallet >= marketPrice(state, need)
  const capacityFree = inventoryCount(actor) < actor.inventory.capacity
  const targetHasResources = partner.wallet > 0 || inventoryCount(partner) > 0 ? 1 : 0.1

  return {
    follow: 0.5 * A + 0.5 * L + 0.4 * T - 0.5 * F - 0.1 * B,
    flee: 0.6 * F + 0.5 * B - 0.4 * A,
    share: (0.5 * L + 0.4 * A + 0.3 * T) * (1 - G) * surplusFactor,
    hoard: 0.6 * G * (1 - T) + 0.15,
    trade: 0.3 * T + 0.4 * (hasSurplus ? 1 : 0) + 0.4 * (capacityFree && canAffordNeed ? 1 : 0),
    fight: (0.6 * B + 0.4 * G) * (1 - F) * targetHasResources,
    cooperate: 0.5 * T + 0.5 * A + 0.2 * L,
  }
}

/**
 * Pick a social partner: nearest `maxNeighborsConsidered` alive NPCs within
 * `maxWitnessDistance` (when positions given), weighted by relationship
 * salience (strong bonds AND strong grudges attract attention). O(N) scan.
 */
export function choosePartner(
  state: SocietyState,
  actorId: number,
  rng: RNG,
  positions?: Record<number, Vec2>,
): number | null {
  const actor = state.npcs[actorId]
  if (!actor || !actor.alive) return null
  let candidates = aliveIds(state).filter((id) => id !== actorId)
  if (candidates.length === 0) return null

  if (positions) {
    const apos = positions[actorId]
    if (apos) {
      const scored = candidates
        .map((id) => ({ id, d: dist(apos, positions[id] ?? { x: Infinity, z: Infinity }) }))
        .filter((o) => o.d <= state.config.maxWitnessDistance)
      scored.sort((a, b) => a.d - b.d)
      candidates = scored.slice(0, state.config.maxNeighborsConsidered).map((o) => o.id)
      if (candidates.length === 0) return null
    }
  }

  const weights = candidates.map((id) => {
    const rel = actor.relationships[id]
    const sal = rel ? rel.trust + rel.attachment + rel.love + rel.betrayal + rel.fear : 0
    return 0.5 + sal
  })
  const sum = weights.reduce((a, b) => a + b, 0)
  let r = rng() * sum
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i]
    if (r <= 0) return candidates[i]
  }
  return candidates[candidates.length - 1]
}

// ---------------------------------------------------------------------------
// Market
// ---------------------------------------------------------------------------

/** Scarcity-derived price: base * (1 + elasticity * (1 - stock/max)). */
export function marketPrice(state: SocietyState, item: ItemId): number {
  const base = state.config.marketBasePrices[item] ?? 1
  const max = state.config.marketMaxStocks[item] ?? 0
  if (max <= 0) return base
  const fill = clamp((state.market.stocks[item] ?? 0) / max, 0, 1)
  const price = base * (1 + state.config.priceElasticity * (1 - fill))
  return clamp(price, base * 0.5, base * (1 + state.config.priceElasticity))
}

/** Self-service purchase. All-or-nothing: stock, wallet, and capacity checks. */
export function buyFromMarket(state: SocietyState, npcId: number, item: ItemId, qty: number): boolean {
  if (!Number.isInteger(qty) || qty <= 0) return false
  const npc = state.npcs[npcId]
  if (!npc || !npc.alive) return false
  const stock = state.market.stocks[item] ?? 0
  if (stock < qty) return false
  const cost = marketPrice(state, item) * qty
  if (npc.wallet < cost) return false
  if (inventoryCount(npc) + qty > npc.inventory.capacity) return false
  npc.wallet -= cost
  npc.inventory.items[item] = (npc.inventory.items[item] ?? 0) + qty
  state.market.stocks[item] = stock - qty
  state.market.wallet += cost
  return true
}

/** Vending into the market. Refused when at capacity or the market can't pay. */
export function sellToMarket(state: SocietyState, npcId: number, item: ItemId, qty: number): boolean {
  if (!Number.isInteger(qty) || qty <= 0) return false
  const npc = state.npcs[npcId]
  if (!npc || !npc.alive) return false
  const held = npc.inventory.items[item] ?? 0
  if (held < qty) return false
  const max = state.config.marketMaxStocks[item] ?? 0
  const stock = state.market.stocks[item] ?? 0
  if (max > 0 && stock >= max) return false
  const payout = marketPrice(state, item) * qty
  if (state.market.wallet < payout) return false
  npc.inventory.items[item] = held - qty
  npc.wallet += payout
  state.market.stocks[item] = stock + qty
  state.market.wallet -= payout
  return true
}

/** Work: flat per-tick wage, minted (no market drain). Silent — no event. */
export function work(state: SocietyState, npcId: number): boolean {
  const npc = state.npcs[npcId]
  if (!npc || !npc.alive) return false
  npc.wallet += state.config.wage
  return true
}

// ---------------------------------------------------------------------------
// Death
// ---------------------------------------------------------------------------

/** Permanent death. Dead NPCs keep records/relationships but never act again. */
export function killNpc(
  state: SocietyState,
  id: number,
  opts: EventOptions = {},
): SocialEvent | null {
  const npc = state.npcs[id]
  if (!npc || !npc.alive) return null
  npc.alive = false
  npc.deathTick = state.tick
  const ev = emit(state, {
    tick: state.tick,
    kind: 'death',
    actorId: id,
    targetId: null,
    killerId: opts.killerId,
  })
  if (opts.killerId !== undefined) applyDeathWitness(state, opts.killerId, opts.at, opts.positions)
  return ev
}

/** Witnesses near a killing grow fear of, and distrust, the killer. */
function applyDeathWitness(
  state: SocietyState,
  killerId: number,
  at: Vec2 | undefined,
  positions: Record<number, Vec2> | undefined,
): void {
  for (const w of witnessesFor(state, killerId, null, at, positions)) {
    const rel = ensureRel(state.npcs[w], killerId)
    rel.interactions += 1
    rel.trust = clamp(rel.trust - 0.06, 0, 1)
    rel.fear = clamp(rel.fear + 0.1, 0, 1)
  }
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

function applyChoice(
  state: SocietyState,
  actorId: number,
  partnerId: number,
  choice: SocialChoice,
  rng: RNG,
  positions: Record<number, Vec2> | undefined,
): SocialEvent[] {
  const actor = state.npcs[actorId]
  const partner = state.npcs[partnerId]
  const at = positions?.[actorId]
  const evOpts: EventOptions = { at, positions }
  const one = (ev: SocialEvent | null): SocialEvent[] => (ev ? [ev] : [])

  if (choice === 'follow' || choice === 'flee') {
    return one(recordSocialEvent(state, choice, actorId, partnerId, evOpts))
  }

  if (choice === 'share') {
    const item = firstItemCountGte(actor, 2)
    const shared = item !== null && partner !== undefined && partner.alive && transferItem(actor, partner, item, 1)
    return one(
      recordSocialEvent(state, 'share', actorId, partnerId, {
        ...evOpts,
        item: item ?? undefined,
        amount: shared ? 1 : 0,
      }),
    )
  }

  if (choice === 'hoard') {
    return one(recordSocialEvent(state, 'hoard', actorId, null, evOpts))
  }

  if (choice === 'trade') {
    const surplus = firstItemCountGte(actor, 2)
    if (surplus !== null && sellToMarket(state, actorId, surplus, 1)) {
      return one(
        recordSocialEvent(state, 'trade', actorId, partnerId, {
          ...evOpts,
          item: surplus,
          amount: 1,
          direction: 'sell',
          money: marketPrice(state, surplus),
        }),
      )
    }
    const need = firstItemNeeded(state, actor)
    if (need !== null && buyFromMarket(state, actorId, need, 1)) {
      return one(
        recordSocialEvent(state, 'trade', actorId, partnerId, {
          ...evOpts,
          item: need,
          amount: 1,
          direction: 'buy',
          money: -marketPrice(state, need),
        }),
      )
    }
    return one(recordSocialEvent(state, 'trade', actorId, partnerId, { ...evOpts, amount: 0 }))
  }

  if (choice === 'fight') {
    let stolenItem: ItemId | undefined
    let stolenMoney = 0
    if (partner !== undefined && partner.alive) {
      const item = firstItemCountGte(partner, 1)
      if (item !== null && transferItem(partner, actor, item, 1)) {
        stolenItem = item
      } else if (partner.wallet > 0) {
        stolenMoney = Math.min(partner.wallet, Math.ceil(partner.wallet * 0.2))
        partner.wallet -= stolenMoney
        actor.wallet += stolenMoney
      }
      const dmg = 0.15 + rng() * 0.15
      partner.vitality = clamp(partner.vitality - dmg, 0, 1)
    }
    const out = one(
      recordSocialEvent(state, 'fight', actorId, partnerId, {
        ...evOpts,
        item: stolenItem,
        amount: stolenItem !== undefined ? 1 : 0,
        money: stolenMoney > 0 ? stolenMoney : undefined,
      }),
    )
    if (partner !== undefined && partner.alive && partner.vitality <= 0 && rng() < state.config.fightKillChance) {
      const deathEv = killNpc(state, partnerId, { killerId: actorId, at, positions })
      if (deathEv) out.push(deathEv)
    }
    return out
  }

  // cooperate
  let reward = 0
  if (partner !== undefined && partner.alive) {
    reward = 1
    actor.wallet += reward
    partner.wallet += reward
  }
  return one(
    recordSocialEvent(state, 'cooperate', actorId, partnerId, {
      ...evOpts,
      money: reward > 0 ? reward : undefined,
    }),
  )
}

/** Default routine when a npc has no partner: vend surplus, else buy a need, else hoard. */
function defaultMarketAction(state: SocietyState, actorId: number): SocialEvent | null {
  const actor = state.npcs[actorId]
  const surplus = firstItemCountGte(actor, 2)
  if (surplus !== null && sellToMarket(state, actorId, surplus, 1)) {
    return recordSocialEvent(state, 'trade', actorId, null, {
      item: surplus,
      amount: 1,
      direction: 'sell',
      money: marketPrice(state, surplus),
    })
  }
  const need = firstItemNeeded(state, actor)
  if (need !== null && buyFromMarket(state, actorId, need, 1)) {
    return recordSocialEvent(state, 'trade', actorId, null, {
      item: need,
      amount: 1,
      direction: 'buy',
      money: -marketPrice(state, need),
    })
  }
  return recordSocialEvent(state, 'hoard', actorId, null)
}

/**
 * Advance the simulation one tick:
 * 1. every alive NPC works (silent wage),
 * 2. each alive NPC picks a partner and a utility-weighted social choice,
 * 3. witnesses absorb scaled reputation leaks.
 * Returns the events emitted this tick (also appended to state.events).
 */
export function tickSociety(
  state: SocietyState,
  rng: RNG,
  opts: TickOptions = {},
): SocialEvent[] {
  state.tick += 1
  const events: SocialEvent[] = []
  for (const id of aliveIds(state)) {
    work(state, id)
    const partner = choosePartner(state, id, rng, opts.positions)
    if (partner === null) {
      const ev = defaultMarketAction(state, id)
      if (ev) events.push(ev)
      continue
    }
    const utils = socialUtilities(state, id, partner)
    const choice = sampleChoice(utils, rng, state.config.temperature)
    const npc = state.npcs[id]
    npc.lastChoice = choice
    for (const ev of applyChoice(state, id, partner, choice, rng, opts.positions)) {
      events.push(ev)
    }
  }
  return events
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export function serializeSociety(state: SocietyState): SocietySave {
  return {
    npcs: state.npcs,
    market: state.market,
    config: state.config,
    tick: state.tick,
    nextNpcId: state.nextNpcId,
    events: state.events,
  }
}

/**
 * Compact save projection for the game's save file: caps the event log,
 * rounds floats to 4 decimals (money to 2), and omits the market maps from
 * config (they are reconstructed from `market` on load). Preserves wallets,
 * stocks, traits, and relationship memories.
 */
export function compactSociety(state: SocietyState, maxEvents = 12): SocietySave {
  const r4 = (x: number) => Math.round(x * 10000) / 10000
  const npcs: Record<number, Npc> = {}
  for (const k of Object.keys(state.npcs)) {
    const n = state.npcs[Number(k)]
    const relationships: Record<number, RelationshipMemory> = {}
    for (const rk of Object.keys(n.relationships)) {
      const r = n.relationships[Number(rk)]
      relationships[Number(rk)] = {
        trust: r4(r.trust),
        attachment: r4(r.attachment),
        love: r4(r.love),
        betrayal: r4(r.betrayal),
        fear: r4(r.fear),
        interactions: r.interactions,
      }
    }
    const items: Record<string, number> = {}
    for (const ik of Object.keys(n.inventory.items)) items[ik] = n.inventory.items[ik]
    npcs[n.id] = {
      id: n.id,
      name: n.name,
      alive: n.alive,
      deathTick: n.deathTick,
      vitality: r4(n.vitality),
      traits: {
        trust: r4(n.traits.trust),
        attachment: r4(n.traits.attachment),
        love: r4(n.traits.love),
        betrayal: r4(n.traits.betrayal),
        fear: r4(n.traits.fear),
        greed: r4(n.traits.greed),
      },
      wallet: Math.round(n.wallet * 100) / 100,
      inventory: { items, capacity: n.inventory.capacity },
      relationships,
      lastChoice: n.lastChoice,
    }
  }
  const events = state.events.slice(-maxEvents).map((e) => ({
    tick: e.tick,
    kind: e.kind,
    actorId: e.actorId,
    targetId: e.targetId,
    item: e.item,
    amount: e.amount,
    money: e.money !== undefined ? Math.round(e.money * 100) / 100 : undefined,
    direction: e.direction,
    killerId: e.killerId,
  }))
  return {
    npcs,
    market: {
      stocks: { ...state.market.stocks },
      maxStocks: { ...state.market.maxStocks },
      basePrices: { ...state.market.basePrices },
      wallet: Math.round(state.market.wallet * 100) / 100,
    },
    config: {
      // only the non-default knobs are persisted; everything else (including
      // the market maps, reconstructed from `market`) falls back to defaults
      fightKillChance: state.config.fightKillChance,
    },
    tick: state.tick,
    nextNpcId: state.nextNpcId,
    events,
  }
}

/** Rebuild a full config from a save; market maps always come from market state. */
function configFromSave(save: SocietySave): SocietyConfig {
  return mergeConfig({
    ...save.config,
    marketStocks: { ...save.market.stocks },
    marketMaxStocks: { ...save.market.maxStocks },
    marketBasePrices: { ...save.market.basePrices },
  })
}

export function deserializeSociety(save: SocietySave): SocietyState {
  return {
    npcs: save.npcs,
    market: {
      stocks: { ...save.market.stocks },
      maxStocks: { ...save.market.maxStocks },
      basePrices: { ...save.market.basePrices },
      wallet: save.market.wallet,
    },
    config: configFromSave(save),
    tick: save.tick,
    nextNpcId: save.nextNpcId,
    events: save.events,
  }
}
