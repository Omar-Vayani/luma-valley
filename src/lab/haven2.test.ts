import { describe, expect, it } from 'vitest'
import {
  createBeliefs, observeEvidence, believedValue, believes, tickBeliefs, generalize,
  createHabits, reinforceHabit, tickHabits, habitBias, decideToLie, detectLie,
} from './beliefs'
import { createEmotions, appraise, emotionalRiskBias, tickEmotions } from './emotions'
import { createMemory, remember, consolidate, semanticFeeling, forgetWeakest } from './memory'
import { createSim } from './sim'
import { randomGenome, type Genome, completeGenome, bodyScale, metabolicRate } from './genetics'
import { lifeStageFor, isMature, learningRateFor } from './lifecycle'
import { speak, makePromise, tickPromises, promisesTo, inEarshot } from './chatter'
import { createCulture, witnessedAct, normPressure, updateInfluence, currentLeader, transmitCulture } from './norms'
import { createJobBoard, claimJob, openJobsFor, workShiftAt, isStaffed, releaseJob } from './jobs'
import { createEconomy, valueTo, negotiate, createLedger, addDebt, repayDebt, totalOwedBy, wealthInequality } from './economy'
import { createInventory, addItem, inventoryWeight, canCarry, tradeItem, ownerOf, holdsStolenGoods } from './inventory'
import { itemDef, isContraband } from './items'
import { localProvider, createCloudProvider, providerFor } from './dialogue-provider'
import { saveSim, loadSim, SAVE_VERSION } from './save'
import { inspectSociety, inspectCreature } from './inspect'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('beliefs — creatures can be wrong and change their minds', () => {
  it('forms a belief from direct sight with real confidence', () => {
    const b = createBeliefs()
    observeEvidence(b, 'place:food:hasStock', 1, 'seen', 10)
    expect(believes(b, 'place:food:hasStock')).toBe(true)
    expect(believedValue(b, 'place:food:hasStock')).toBeGreaterThan(0)
  })

  it('hearsay is weaker than what a creature saw itself', () => {
    const seen = createBeliefs()
    const told = createBeliefs()
    observeEvidence(seen, 'k', 1, 'seen', 1)
    observeEvidence(told, 'k', 1, 'told', 1)
    expect(seen.k.confidence).toBeGreaterThan(told.k.confidence)
  })

  it('contradicting evidence erodes confidence before flipping the belief', () => {
    const b = createBeliefs()
    observeEvidence(b, 'k', 1, 'seen', 1)
    const before = b.k.value
    observeEvidence(b, 'k', -1, 'seen', 2)
    expect(b.k.value).toBe(before) // not flipped yet, just shaken
    observeEvidence(b, 'k', -1, 'seen', 3)
    observeEvidence(b, 'k', -1, 'seen', 4)
    expect(b.k.value).toBeLessThan(0) // evidence eventually wins
  })

  it('untested beliefs fade over time', () => {
    const b = createBeliefs()
    observeEvidence(b, 'k', 1, 'guessed', 0)
    const start = b.k.confidence
    for (let t = 0; t < 400; t++) tickBeliefs(b, t)
    expect(b.k?.confidence ?? 0).toBeLessThan(start)
  })

  it('generalizes a category from several specific beliefs', () => {
    const b = createBeliefs()
    observeEvidence(b, 'place:food:hasStock', 1, 'seen', 1)
    observeEvidence(b, 'place:tavern:hasStock', 1, 'seen', 1)
    generalize(b, 'place:', 'category:places:haveStock', 2)
    expect(believedValue(b, 'category:places:haveStock')).toBeGreaterThan(0)
  })
})

describe('habits and deception', () => {
  it('repetition builds a habit that biases future choices', () => {
    const h = createHabits()
    for (let i = 0; i < 10; i++) reinforceHabit(h, 'drink')
    expect(habitBias(h, 'drink')).toBeGreaterThan(habitBias(h, 'work'))
  })

  it('habits fade when the behavior stops', () => {
    const h = createHabits()
    reinforceHabit(h, 'drink', 0.2)
    const before = h.drink
    for (let i = 0; i < 50; i++) tickHabits(h)
    expect(h.drink ?? 0).toBeLessThan(before)
  })

  it('a desperate spiteful creature lies; a loyal trusting one does not', () => {
    const liar = {
      genome: { theft: 0.9, loyalty: 0.1, aggression: 0.5 },
      emotions: { spite: 0.7, resentment: 0.5 },
      chem: { hunger: 0.15, fear: 0.3 },
    }
    const honest = {
      genome: { theft: 0.05, loyalty: 0.9, aggression: 0.1 },
      emotions: { spite: 0, resentment: 0 },
      chem: { hunger: 0.9, fear: 0.05 },
    }
    expect(decideToLie(liar, -0.5, 1).lying).toBe(true)
    expect(decideToLie(honest, 0.8, 1).lying).toBe(false)
  })

  it('a suspicious, familiar listener catches an unconvincing lie', () => {
    const listener = { genome: { learning: 0.8 }, emotions: { paranoia: 0.6 } }
    const edge = { suspicion: 0.7, familiarity: 0.8, affection: 0.1 }
    expect(detectLie(listener, edge, 0.3, true)).toBe(true)
    const naive = { genome: { learning: 0.1 }, emotions: { paranoia: 0 } }
    const warmEdge = { suspicion: 0, familiarity: 0.2, affection: 0.9 }
    expect(detectLie(naive, warmEdge, 0.9, false)).toBe(false)
  })
})

describe('emotions — appraisal produces self-conscious feelings', () => {
  it('a self-caused good outcome creates pride', () => {
    const e = createEmotions()
    appraise(e, 0.8, 0.2, 0.9)
    expect(e.pride).toBeGreaterThan(0)
    expect(e.joy).toBeGreaterThan(0)
  })

  it('harming someone through your own choice creates guilt', () => {
    const e = createEmotions()
    appraise(e, 0.3, 0, 0.8, 0.9)
    expect(e.guilt).toBeGreaterThan(0)
  })

  it('pride emboldens and shame restrains risk taking', () => {
    const bold = createEmotions()
    bold.pride = 0.8
    bold.hope = 0.6
    const timid = createEmotions()
    timid.shame = 0.8
    timid.paranoia = 0.7
    expect(emotionalRiskBias(bold)).toBeGreaterThan(emotionalRiskBias(timid))
  })

  it('grudges outlast good moods', () => {
    const e = createEmotions()
    e.joy = 0.5
    e.resentment = 0.5
    for (let i = 0; i < 40; i++) tickEmotions(e)
    expect(e.resentment).toBeGreaterThan(e.joy)
  })
})

describe('memory — importance, consolidation, forgetting', () => {
  it('consolidates repeated episodes into a semantic pattern', () => {
    const m = createMemory()
    for (let i = 0; i < 8; i++) remember(m, 'stolenFrom', 3, -0.8, 0.9, i)
    consolidate(m, 10)
    expect(semanticFeeling(m, 'stolenFrom', 3)).toBeLessThan(0)
  })

  it('forgets mundane memories before vivid ones', () => {
    const m = createMemory()
    remember(m, 'vivid', 1, -1, 1, 1)
    for (let i = 0; i < 20; i++) remember(m, 'dull', 2, 0.02, 0.02, i)
    forgetWeakest(m, 3)
    expect(m.episodes.some((e) => e.kind === 'vivid')).toBe(true)
  })
})

describe('life stages and genetics', () => {
  it('classifies stages by age and gates maturity', () => {
    expect(lifeStageFor(10)).toBe('child')
    expect(lifeStageFor(500)).toBe('adolescent')
    expect(lifeStageFor(1000)).toBe('adult')
    expect(lifeStageFor(6000)).toBe('elder')
    expect(isMature(lifeStageFor(10))).toBe(false)
    expect(isMature(lifeStageFor(1000))).toBe(true)
  })

  it('children learn faster than elders', () => {
    expect(learningRateFor('child')).toBeGreaterThan(learningRateFor('elder'))
  })

  it('body genes express as physical traits', () => {
    const small = GEN({ size: 0, metabolism: 0 })
    const large = GEN({ size: 1, metabolism: 1 })
    expect(bodyScale(large)).toBeGreaterThan(bodyScale(small))
    expect(metabolicRate(large)).toBeGreaterThan(metabolicRate(small))
  })

  it('completes genomes missing new genes (old saves)', () => {
    const g = completeGenome({ aggression: 0.9 })
    expect(g.aggression).toBe(0.9)
    expect(g.fertility).toBeGreaterThan(0)
  })
})

describe('chatter — cheap meaning, words only when heard', () => {
  it('creatures exchange messages and both gain social need', () => {
    const s = createSim(5)
    const a = s.spawnCreature(GEN(), 0, 0)
    const b = s.spawnCreature(GEN(), 1, 0)
    a.chem.social = 0.3
    const before = a.chem.social
    speak(s.chatter, a, b, 'greet', s.time)
    expect(a.chem.social).toBeGreaterThan(before)
    expect(s.chatter.recent.length).toBe(1)
  })

  it('earshot decides whether the player gets words', () => {
    const s = createSim(6)
    const a = s.spawnCreature(GEN(), 0, 0)
    const b = s.spawnCreature(GEN(), 1, 0)
    expect(inEarshot(0, 0, a, b)).toBe(true)
    expect(inEarshot(90, 90, a, b)).toBe(false)
  })

  it('a broken promise costs trust and creates guilt', () => {
    const s = createSim(7)
    const a = s.spawnCreature(GEN(), 0, 0)
    const b = s.spawnCreature(GEN(), 1, 0)
    makePromise(s.chatter, a, b, 'food', 0, 5)
    expect(promisesTo(s.chatter, b.id).length).toBe(1)
    tickPromises(s.chatter, 100, (id) => s.creatureById(id))
    expect(b.emotions.resentment).toBeGreaterThan(0)
    expect(a.emotions.guilt).toBeGreaterThan(0)
    expect(promisesTo(s.chatter, b.id).length).toBe(0)
  })
})

describe('norms and culture', () => {
  it('repeated unpunished theft erodes the property norm', () => {
    const culture = createCulture()
    const before = culture.norms.property
    for (let i = 0; i < 20; i++) witnessedAct(culture, 'property', true, 3)
    expect(culture.norms.property).toBeLessThan(before)
  })

  it('norm pressure blends community standard with personal character', () => {
    const culture = createCulture()
    const s = createSim(8)
    const honest = s.spawnCreature(GEN({ theft: 0.05 }), 0, 0)
    const crook = s.spawnCreature(GEN({ theft: 0.95 }), 2, 0)
    expect(normPressure(culture, honest, 'property')).toBeGreaterThan(
      normPressure(culture, crook, 'property'),
    )
  })

  it('influence is earned through respect, producing a leader', () => {
    const s = createSim(9)
    const hero = s.spawnCreature(GEN(), 0, 0)
    const a = s.spawnCreature(GEN(), 2, 0)
    const b = s.spawnCreature(GEN(), 4, 0)
    for (const other of [a, b]) {
      other.social[hero.id] = {
        familiarity: 0.9, trust: 0.9, affection: 0.8, attraction: 0, respect: 0.95,
        fear: 0, gratitude: 0.6, suspicion: 0, resentment: 0, loyalty: 0.7, dependence: 0.2,
      }
    }
    updateInfluence(s.culture, s.creatures)
    expect(currentLeader(s.culture, s.creatures)?.id).toBe(hero.id)
  })

  it('a child inherits vocabulary and place knowledge from a parent', () => {
    const s = createSim(10)
    const parent = s.spawnCreature(GEN(), 0, 0)
    const child = s.spawnCreature(GEN(), 1, 0)
    parent.language.vocab.set('food', { word: 'wum', strength: 0.9 })
    parent.knowledge.food = 1
    transmitCulture(parent, child)
    expect(child.language.vocab.get('food')?.word).toBe('wum')
    expect(child.knowledge.food).toBeGreaterThan(0)
  })
})

describe('jobs — creatures operate institutions', () => {
  it('a claimed role staffs the institution and pays a completed shift', () => {
    const s = createSim(11)
    const c = s.spawnCreature(GEN(), 0, 0)
    const board = createJobBoard()
    expect(claimJob(board, c, 'shopkeep')).toBe(true)
    expect(isStaffed(board, 'shopkeep')).toBe(true)
    c.wallet = 0
    const economy = createEconomy()
    economy.goods.bread.stock = 0
    let paid = 0
    let produced: string | null = null
    for (let i = 0; i < 30; i++) {
      const r = workShiftAt(board, economy, c, 'shopkeep')
      paid += r.paid
      produced = r.produced ?? produced
    }
    expect(paid).toBeGreaterThan(0)
    expect(produced).toBe('bread')
    expect(economy.goods.bread.stock).toBeGreaterThan(0)
  })

  it('a role cannot be claimed twice, and releasing frees it', () => {
    const s = createSim(12)
    const a = s.spawnCreature(GEN(), 0, 0)
    const b = s.spawnCreature(GEN(), 1, 0)
    const board = createJobBoard()
    expect(claimJob(board, a, 'healer')).toBe(true)
    expect(claimJob(board, b, 'healer')).toBe(false)
    releaseJob(board, a)
    expect(claimJob(board, b, 'healer')).toBe(true)
  })

  it('open jobs are ranked by aptitude', () => {
    const s = createSim(13)
    const social = s.spawnCreature(GEN({ sociability: 0.95, learning: 0.1, energy: 0.1 }), 0, 0)
    const board = createJobBoard()
    const best = openJobsFor(board, social)[0]
    expect(['shopkeep', 'bartender']).toContain(best.id)
  })
})

describe('economy — subjective value, haggling, debt', () => {
  it('a starving creature values bread above a full one', () => {
    const e = createEconomy()
    const base = { wallet: 10, genome: { greed: 0.5, addictionProne: 0.5 } }
    const hungry = valueTo(e, { ...base, chem: { hunger: 0.05, health: 1, energy: 1, pleasure: 1 } }, 'bread')
    const full = valueTo(e, { ...base, chem: { hunger: 1, health: 1, energy: 1, pleasure: 1 } }, 'bread')
    expect(hungry).toBeGreaterThan(full)
  })

  it('a sick creature values medicine above a healthy one', () => {
    const e = createEconomy()
    const base = { wallet: 20, genome: { greed: 0.5, addictionProne: 0.5 } }
    const sick = valueTo(e, { ...base, chem: { hunger: 1, health: 0.1, energy: 1, pleasure: 1 } }, 'medicine')
    const well = valueTo(e, { ...base, chem: { hunger: 1, health: 1, energy: 1, pleasure: 1 } }, 'medicine')
    expect(sick).toBeGreaterThan(well)
  })

  it('a trusted friend gets a better price than a stranger', () => {
    const e = createEconomy()
    const friend = negotiate(e, 'bread', { trust: 0.9, thief: 0 }, 100, 100)
    const stranger = negotiate(e, 'bread', { trust: -0.5, thief: 0.2 }, 100, 100)
    expect(friend.price).toBeLessThan(stranger.price)
    expect(friend.reason).toBe('friend-discount')
  })

  it('a known thief is refused service', () => {
    const e = createEconomy()
    const offer = negotiate(e, 'bread', { trust: -0.6, thief: 0.8 }, 100, 100)
    expect(offer.accepted).toBe(false)
    expect(offer.reason).toBe('refused-thief')
  })

  it('tracks and repays informal debts', () => {
    const l = createLedger()
    addDebt(l, 1, 2, 10, 0)
    expect(totalOwedBy(l, 1)).toBe(10)
    expect(repayDebt(l, 1, 2, 4)).toBe(4)
    expect(totalOwedBy(l, 1)).toBe(6)
  })

  it('measures wealth inequality', () => {
    expect(wealthInequality([10, 10, 10])).toBeLessThan(wealthInequality([0, 0, 100]))
  })
})

describe('items and ownership', () => {
  it('capacity limits what a creature can carry', () => {
    const inv = createInventory()
    const added = addItem(inv, 'timber', 100)
    expect(added).toBeLessThan(100)
    expect(inventoryWeight(inv)).toBeLessThanOrEqual(12)
    expect(canCarry(inv, 'timber', 5)).toBe(false)
  })

  it('a satchel increases what fits', () => {
    const plain = createInventory()
    const packed = createInventory()
    addItem(packed, 'satchel', 1)
    const plainFit = addItem(plain, 'timber', 100)
    const packedFit = addItem(packed, 'timber', 100)
    expect(packedFit).toBeGreaterThanOrEqual(plainFit)
  })

  it('stolen goods keep the original owner mark', () => {
    const victim = createInventory()
    const thief = createInventory()
    addItem(victim, 'gem', 1, 7)
    tradeItem(victim, thief, 'gem', 1, { stolen: true })
    expect(ownerOf(thief, 'gem')).toBe(7)
    expect(holdsStolenGoods(thief, 99)).toContain('gem')
  })

  it('items are data-described, including contraband', () => {
    expect(itemDef('bread')?.category).toBe('food')
    expect(isContraband('spark')).toBe(true)
    expect(isContraband('bread')).toBe(false)
  })
})

describe('optional cloud AI degrades gracefully', () => {
  it('local provider always works offline', async () => {
    expect(localProvider.available()).toBe(true)
    const text = await localProvider.polish({ baseText: 'hi', speakerName: 'A', mood: 'calm', hints: [] })
    expect(text).toBe('hi')
  })

  it('a failing cloud provider falls back to the local line', async () => {
    const cloud = createCloudProvider({
      endpoint: 'https://example.invalid/x',
      fetchImpl: (async () => {
        throw new Error('offline')
      }) as unknown as typeof fetch,
    })
    const text = await cloud.polish({ baseText: 'local line', speakerName: 'A', mood: 'calm', hints: [] })
    expect(text).toBe('local line')
  })

  it('provider selection prefers local unless cloud is enabled and available', () => {
    const cloud = createCloudProvider({ endpoint: '', fetchImpl: undefined as unknown as typeof fetch })
    expect(providerFor(false, cloud).id).toBe('local')
    expect(providerFor(true, cloud).id).toBe('local') // unavailable → local
  })
})

describe('save v6 and society inspection', () => {
  it('round-trips beliefs, habits, jobs, culture, and debts', () => {
    const s = createSim(21)
    const a = s.spawnCreature(GEN(), 0, 0)
    observeEvidence(a.beliefs, 'place:food:hasStock', 1, 'seen', 1)
    reinforceHabit(a.habits, 'work', 0.4)
    claimJob(s.jobs, a, 'porter')
    a.injury = 0.3
    addDebt(s.ledger, a.id, 2, 5, 1)
    witnessedAct(s.culture, 'property', true, 2)
    const data = saveSim(s)
    expect(data.version).toBe(SAVE_VERSION)
    const s2 = loadSim(data)
    const a2 = s2.creatures[0]
    expect(a2.beliefs['place:food:hasStock']).toBeDefined()
    expect(a2.habits.work).toBeGreaterThan(0)
    expect(a2.job).toBe('porter')
    expect(a2.injury).toBeCloseTo(0.3)
    expect(s2.ledger.debts.length).toBe(1)
    expect(s2.culture.norms.property).toBeLessThan(0.65)
  })

  it('society inspection summarizes norms, jobs, and population', () => {
    const s = createSim(22)
    s.spawnCreature(GEN(), 0, 0)
    s.spawnCreature(GEN(), 2, 0)
    const report = inspectSociety(s)
    expect(report.population).toBe(2)
    expect(report.norms.length).toBeGreaterThan(3)
    expect(report.vacancies.length).toBeGreaterThan(0)
  })

  it('creature inspection exposes stage, habits, beliefs, and family', () => {
    const s = createSim(23)
    const parent = s.spawnCreature(GEN(), 0, 0)
    const child = s.spawnCreature(GEN(), 1, 0)
    child.parentIds = [parent.id]
    reinforceHabit(child.habits, 'play', 0.5)
    observeEvidence(child.beliefs, 'who:1:kind', 1, 'seen', 1)
    const report = inspectCreature(s, child)
    expect(report.stage).toBeTruthy()
    expect(report.habits.length).toBeGreaterThan(0)
    expect(report.beliefKeys.length).toBeGreaterThan(0)
    expect(report.family.parents).toContain(parent.name)
  })
})
