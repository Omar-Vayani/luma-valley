/**
 * social — emotional spectrum, reputation/gossip network, and moral/selfish
 * behaviors for the Luma Lab creatures.
 *
 * Covers:
 *  - expressive emotions (joy, envy, resentment, paranoia, spite, forgiveness,
 *    loyalty, affection) that modulate the utility mind's action scores
 *  - observing third-party actions → public reputations (thief / protector /
 *    aggressor) per creatureId, spread to peers via the language module
 *  - reputation-based trust WITHOUT direct interaction (hearsay)
 *  - betrayal (bonded creatures can still rob/fight when desperate — penalty,
 *    not a hard block) and unprovoked hostility (spite/aggression)
 */
import { describe, expect, it } from 'vitest'
import { createSim } from './sim'
import { scoreActions } from './mind'
import { saveSim, loadSim } from './save'
import { randomGenome, type Genome } from './genetics'
import { createEmotions, tickEmotions, applyEmotionFeedback } from './emotions'
import { observeEvent, gossipSpread, trustTowards } from './reputation'
import { learnWord } from './language'
import type { Creature } from './creature'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

const THIEF_REP = { trust: -0.8, thief: 0.9, protector: 0, aggressor: 0.2 }
const PROTECTOR_REP = { trust: 0.8, thief: 0, protector: 0.9, aggressor: 0 }
const AGGRESSOR_REP = { trust: -0.7, thief: 0, protector: 0, aggressor: 0.9 }

describe('emotions — the expressive spectrum', () => {
  it('starts neutral and stays JSON-safe', () => {
    const e = createEmotions()
    expect(e.joy).toBe(0)
    expect(e.envy).toBe(0)
    expect(e.resentment).toBe(0)
    expect(e.paranoia).toBe(0)
    expect(e.spite).toBe(0)
    expect(e.forgiveness).toBe(0)
    expect(e.loyalty).toBe(0)
    expect(e.affection).toBe(0)
    expect(JSON.parse(JSON.stringify(e))).toEqual(e)
  })

  it('applyEmotionFeedback raises an emotion and tickEmotions decays it', () => {
    const e = createEmotions()
    applyEmotionFeedback(e, 'joy', 0.6)
    expect(e.joy).toBeCloseTo(0.6)
    tickEmotions(e)
    expect(e.joy).toBeLessThan(0.6)
  })

  it('decay never pushes an emotion below zero', () => {
    const e = createEmotions()
    applyEmotionFeedback(e, 'spite', 0.05)
    for (let i = 0; i < 200; i++) tickEmotions(e)
    expect(e.spite).toBe(0)
  })
})

describe('reputation — observing third-party actions', () => {
  it('witnessing a theft marks the actor as a thief and lowers trust', () => {
    const s = createSim(1)
    const witness = s.spawnCreature(GEN(), 0, 0)
    const thief = s.spawnCreature(GEN(), 5, 5)
    observeEvent(witness, 'steal', thief.id)
    expect(witness.reputation[thief.id].thief).toBeGreaterThan(0)
    expect(trustTowards(witness, thief.id)).toBeLessThan(0)
  })

  it('witnessing protection raises protector reputation and trust', () => {
    const s = createSim(2)
    const witness = s.spawnCreature(GEN(), 0, 0)
    const hero = s.spawnCreature(GEN(), 5, 5)
    observeEvent(witness, 'protect', hero.id)
    expect(witness.reputation[hero.id].protector).toBeGreaterThan(0)
    expect(trustTowards(witness, hero.id)).toBeGreaterThan(0)
  })

  it('a betrayed partner loses trust harder than a plain theft victim', () => {
    const s = createSim(3)
    const victim = s.spawnCreature(GEN(), 0, 0)
    const thief = s.spawnCreature(GEN(), 5, 5)
    observeEvent(victim, 'steal', thief.id)
    const plain = trustTowards(victim, thief.id)
    observeEvent(victim, 'betray', thief.id)
    expect(trustTowards(victim, thief.id)).toBeLessThan(plain)
  })

  it('strangers start with neutral trust', () => {
    const s = createSim(4)
    const c = s.spawnCreature(GEN(), 0, 0)
    expect(trustTowards(c, 999)).toBe(0)
  })

  it('gossip spreads a reputation to a peer without direct interaction (hearsay is weaker)', () => {
    const s = createSim(5)
    const witness = s.spawnCreature(GEN(), 0, 0)
    const peer = s.spawnCreature(GEN(), 1, 0)
    const thief = s.spawnCreature(GEN(), 30, 30) // peer NEVER saw this thief
    observeEvent(witness, 'steal', thief.id)
    gossipSpread(witness, peer, thief.id)
    expect(peer.reputation[thief.id]?.thief ?? 0).toBeGreaterThan(0)
    expect(trustTowards(peer, thief.id)).toBeLessThan(0)
    expect(peer.reputation[thief.id]!.thief).toBeLessThan(witness.reputation[thief.id]!.thief)
  })

  it('gossip uses the language module — the listener learns the danger word', () => {
    const s = createSim(6)
    const witness = s.spawnCreature(GEN(), 0, 0)
    const peer = s.spawnCreature(GEN(), 1, 0)
    const thief = s.spawnCreature(GEN(), 30, 30)
    learnWord(witness.language, 'danger', 1) // the witness can talk about danger
    observeEvent(witness, 'steal', thief.id)
    gossipSpread(witness, peer, thief.id)
    const heard = peer.language.vocab.get('danger')
    expect(heard).toBeDefined()
    expect(heard!.word).toBe(witness.language.vocab.get('danger')!.word)
  })
})

describe('social — reputation-based behavior in the utility mind', () => {
  const lonely = (c: Creature): void => {
    c.chem.social = 0.1 // lonely → social pressure matters
  }

  it('creatures avoid known thieves: social score is lower than toward a stranger', () => {
    const s1 = createSim(10)
    const a1 = s1.spawnCreature(GEN({ sociability: 0.9 }), 0, 0)
    const b1 = s1.spawnCreature(GEN(), 1, 0)
    a1.reputation[b1.id] = { ...THIEF_REP }
    lonely(a1)
    const withThief = scoreActions(s1, a1).social

    const s2 = createSim(11)
    const a2 = s2.spawnCreature(GEN({ sociability: 0.9 }), 0, 0)
    s2.spawnCreature(GEN(), 1, 0)
    lonely(a2)
    const withStranger = scoreActions(s2, a2).social

    expect(withThief).toBeLessThan(withStranger)
  })

  it('creatures ally with protectors: social score is higher than toward a stranger', () => {
    const s1 = createSim(12)
    const a1 = s1.spawnCreature(GEN({ sociability: 0.9 }), 0, 0)
    const b1 = s1.spawnCreature(GEN(), 1, 0)
    a1.reputation[b1.id] = { ...PROTECTOR_REP }
    lonely(a1)
    const withProtector = scoreActions(s1, a1).social

    const s2 = createSim(13)
    const a2 = s2.spawnCreature(GEN({ sociability: 0.9 }), 0, 0)
    s2.spawnCreature(GEN(), 1, 0)
    lonely(a2)
    const withStranger = scoreActions(s2, a2).social

    expect(withProtector).toBeGreaterThan(withStranger)
  })

  it('creatures shun aggressors: a known aggressor nearby raises avoidance (wander)', () => {
    const s1 = createSim(14)
    const a1 = s1.spawnCreature(GEN(), 0, 0)
    const b1 = s1.spawnCreature(GEN(), 1, 0)
    a1.reputation[b1.id] = { ...AGGRESSOR_REP }
    const nearAggressor = scoreActions(s1, a1).wander

    const s2 = createSim(15)
    const a2 = s2.spawnCreature(GEN(), 0, 0)
    s2.spawnCreature(GEN(), 1, 0)
    const nearStranger = scoreActions(s2, a2).wander

    expect(nearAggressor).toBeGreaterThan(nearStranger)
  })

  it('envy drives stealing: an envious creature scores steal higher', () => {
    const s1 = createSim(16)
    const e1 = s1.spawnCreature(GEN({ theft: 0.9 }), 0, 0)
    const r1 = s1.spawnCreature(GEN(), 1, 0)
    r1.wallet = 10
    e1.wallet = 4
    e1.chem.hunger = 0.6
    e1.emotions.envy = 1
    const envious = scoreActions(s1, e1).steal

    const s2 = createSim(17)
    const e2 = s2.spawnCreature(GEN({ theft: 0.9 }), 0, 0)
    const r2 = s2.spawnCreature(GEN(), 1, 0)
    r2.wallet = 10
    e2.wallet = 4
    e2.chem.hunger = 0.6
    const calm = scoreActions(s2, e2).steal

    expect(envious).toBeGreaterThan(calm)
  })

  it('spite drives unprovoked hostility: fight scores high without any vendetta', () => {
    const s1 = createSim(18)
    const a1 = s1.spawnCreature(GEN({ aggression: 0.9, loyalty: 0.1 }), 0, 0)
    s1.spawnCreature(GEN(), 1, 0)
    a1.chem.pleasure = 0.1 // bored
    a1.emotions.spite = 1
    const spiteful = scoreActions(s1, a1).fight

    const s2 = createSim(19)
    const a2 = s2.spawnCreature(GEN({ aggression: 0.9, loyalty: 0.1 }), 0, 0)
    s2.spawnCreature(GEN(), 1, 0)
    a2.chem.pleasure = 0.1
    const calm = scoreActions(s2, a2).fight

    expect(spiteful).toBeGreaterThan(calm)
    expect(spiteful).toBeGreaterThan(0.5) // high enough to actually be chosen
  })

  it('a bond makes stealing from a partner less likely — penalty, not a hard block', () => {
    const s1 = createSim(20)
    const a1 = s1.spawnCreature(GEN({ theft: 0.9 }), 0, 0)
    const b1 = s1.spawnCreature(GEN(), 1, 0)
    b1.wallet = 10
    a1.wallet = 4
    a1.chem.hunger = 0.6
    a1.bonds[b1.id] = 0.9
    a1.partnerId = b1.id
    const bonded = scoreActions(s1, a1).steal

    const s2 = createSim(21)
    const a2 = s2.spawnCreature(GEN({ theft: 0.9 }), 0, 0)
    const b2 = s2.spawnCreature(GEN(), 1, 0)
    b2.wallet = 10
    a2.wallet = 4
    a2.chem.hunger = 0.6
    const stranger = scoreActions(s2, a2).steal

    expect(bonded).toBeLessThan(stranger)
  })

  it('loyalty & affection drive selfless protection of a wounded friend', () => {
    const s1 = createSim(22)
    const hero = s1.spawnCreature(GEN({ loyalty: 0.9 }), 0, 0)
    const friend = s1.spawnCreature(GEN(), 1, 0)
    const threat = s1.spawnCreature(GEN(), 2, 0)
    hero.bonds[friend.id] = 0.9
    hero.emotions.loyalty = 0.9
    hero.emotions.affection = 0.9
    friend.chem.health = 0.4 // wounded friend
    hero.reputation[threat.id] = { ...AGGRESSOR_REP }
    const defending = scoreActions(s1, hero).fight

    friend.chem.health = 1 // healthy friend → no reason to defend
    const notDefending = scoreActions(s1, hero).fight

    expect(defending).toBeGreaterThan(notDefending)
  })
})

describe('social — sim behavior', () => {
  it('a creature that WATCHES a theft builds a reputation and the victim feels resentment', () => {
    const s = createSim(30)
    const thief = s.spawnCreature(GEN({ theft: 0.95 }), 0, 0)
    const victim = s.spawnCreature(GEN(), 0.5, 0)
    const witness = s.spawnCreature(GEN({ sociability: 0.9 }), 4, 0)
    thief.wallet = 0
    thief.chem.hunger = 0.1 // desperate → survival steal
    victim.wallet = 10
    for (let i = 0; i < 5; i++) s.tick()
    expect(witness.reputation[thief.id]?.thief ?? 0).toBeGreaterThan(0.2)
    expect(trustTowards(witness, thief.id)).toBeLessThan(0)
    expect(victim.emotions.resentment).toBeGreaterThan(0)
  })

  it('a bonded creature betrays its partner when desperate (steal is possible, not blocked)', () => {
    const s = createSim(31)
    const a = s.spawnCreature(GEN({ theft: 0.95, greed: 0.9 }), 0, 0)
    const b = s.spawnCreature(GEN(), 0.5, 0)
    a.partnerId = b.id
    b.partnerId = a.id
    a.chem.bond = 1
    b.chem.bond = 1
    a.wallet = 0
    a.chem.hunger = 0.1 // desperate
    b.wallet = 10
    for (let i = 0; i < 5; i++) s.tick()
    expect(b.wallet).toBeLessThan(10) // betrayal happened
    expect(trustTowards(b, a.id)).toBeLessThan(-0.3) // and the victim now distrusts the traitor
  })

  it('a comfortable bonded creature does NOT steal from its partner', () => {
    const s = createSim(32)
    const a = s.spawnCreature(GEN({ theft: 0.95 }), 0, 0)
    const b = s.spawnCreature(GEN(), 0.5, 0)
    a.partnerId = b.id
    b.partnerId = a.id
    a.chem.bond = 1
    b.chem.bond = 1
    a.wallet = 10
    b.wallet = 10
    a.chem.hunger = 0.9 // comfortable — no desperation
    for (let i = 0; i < 25; i++) s.tick()
    expect(b.wallet).toBe(10)
  })

  it('a spiteful creature attacks without any vendetta (unprovoked hostility)', () => {
    const s = createSim(33)
    const a = s.spawnCreature(GEN({ aggression: 0.9, loyalty: 0.1, fearfulness: 0.1, courage: 0.9 }), 0, 0)
    const b = s.spawnCreature(GEN(), 1, 0)
    a.emotions.spite = 1
    a.chem.pleasure = 0.1 // bored + spiteful
    const bHealth = b.chem.health
    for (let i = 0; i < 6; i++) s.tick()
    expect(b.chem.health).toBeLessThan(bHealth)
  })

  it('forgiveness heals a relationship after a gift (vendetta fades)', () => {
    const s = createSim(34)
    const giver = s.spawnCreature(GEN({ sociability: 0.8 }), 0, 0)
    const receiver = s.spawnCreature(GEN(), 1, 0)
    giver.wallet = 15
    receiver.wallet = 0
    giver.gratitude[receiver.id] = 0.8 // giver wants to share with the receiver
    receiver.memory.vendettas[giver.id] = 1 // but the receiver held a grudge
    receiver.emotions.forgiveness = 0.9 // ...until forgiveness lets it go
    s.tick()
    expect(receiver.memory.vendettas[giver.id] ?? 0).toBeLessThan(1)
  })

  it('a fearful creature flees from a known aggressor even below the panic threshold', () => {
    const s = createSim(35)
    const a = s.spawnCreature(GEN({ fearfulness: 0.9, courage: 0.1 }), 0, 0)
    const aggro = s.spawnCreature(GEN(), 2, 0)
    a.reputation[aggro.id] = { ...AGGRESSOR_REP }
    a.chem.fear = 0.5 // below the usual panic threshold — reputation pushes it over
    s.tick()
    expect(a.action).toBe('flee')
  })

  it('emotions and reputation survive a save/load round-trip', () => {
    const s = createSim(36)
    const c = s.spawnCreature(GEN(), 0, 0)
    const other = s.spawnCreature(GEN(), 5, 5)
    c.emotions.envy = 0.7
    c.emotions.spite = 0.4
    c.reputation[other.id] = { ...THIEF_REP }
    const data = saveSim(s)
    const s2 = loadSim(data)
    const c2 = s2.creatures[0]
    expect(c2.emotions.envy).toBeCloseTo(0.7)
    expect(c2.emotions.spite).toBeCloseTo(0.4)
    expect(c2.reputation[other.id]?.thief ?? 0).toBeCloseTo(0.9)
    expect(trustTowards(c2, other.id)).toBeCloseTo(-0.8)
  })
})
