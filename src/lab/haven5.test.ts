import { describe, expect, it } from 'vitest'
import {
  createStoryLog, recordStory, topStories, lifeStory, storiesSince, markSeen, explain, formatStory,
} from './story'
import { createSim } from './sim'
import { randomGenome, type Genome } from './genetics'
import { createJobBoard, claimJob, workShiftAt, isProducedGoodStaffed, producerOf } from './jobs'
import { createEconomy, tickEconomy, addDebt, totalOwedBy, totalOwedTo } from './economy'
import {
  mentorScore, mentor, mediateScore, mediate, flatterScore, flatter, alliedPair, formAlliance,
  allyDiscount,
} from './socialacts'
import { applySocialEvent } from './socialbond'
import { parsePlayerText, extractItem, inVoiceOf } from './dialogue'
import { inspectSociety, inspectCreature } from './inspect'
import { saveSim, loadSim } from './save'
import { addItem } from './inventory'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('story — the moments worth noticing', () => {
  it('ranks a death above a routine shift', () => {
    const log = createStoryLog()
    recordStory(log, { kind: 'work', tick: 10, text: 'someone worked a shift' })
    recordStory(log, { kind: 'death', tick: 10, text: 'someone died' })
    expect(topStories(log, 20)[0].text).toBe('someone died')
  })

  it('prefers a fresh story over an equally important old one', () => {
    const log = createStoryLog()
    recordStory(log, { kind: 'theft', tick: 0, text: 'old theft' })
    recordStory(log, { kind: 'theft', tick: 5000, text: 'fresh theft' })
    expect(topStories(log, 5000)[0].text).toBe('fresh theft')
  })

  it('collects the life of one individual in order', () => {
    const s = createSim(1)
    const a = s.spawnCreature(GEN(), 0, 0)
    const b = s.spawnCreature(GEN(), 1, 0)
    recordStory(s.stories, { kind: 'birth', tick: 5, actor: a, text: 'a was born' })
    recordStory(s.stories, { kind: 'theft', tick: 50, actor: b, target: a, text: 'b robbed a' })
    recordStory(s.stories, { kind: 'theft', tick: 30, actor: b, text: 'b robbed someone else' })
    const life = lifeStory(s.stories, a.id)
    expect(life.map((e) => e.text)).toEqual(['a was born', 'b robbed a'])
  })

  it('reports only what changed since the player last looked', () => {
    const log = createStoryLog()
    recordStory(log, { kind: 'birth', tick: 10, text: 'before' })
    markSeen(log, 20)
    recordStory(log, { kind: 'birth', tick: 30, text: 'after' })
    expect(storiesSince(log, log.lastSeenTick).map((e) => e.text)).toEqual(['after'])
  })

  it('explains a choice from the state that drove it', () => {
    const s = createSim(2)
    const c = s.spawnCreature(GEN(), 0, 0)
    c.chem.hunger = 0.1
    expect(explain(c)).toBe('starving')
    c.chem.hunger = 1
    c.chem.grief = 0.8
    expect(explain(c)).toBe('grieving')
  })

  it('formats a story with its reason attached', () => {
    const log = createStoryLog()
    const e = recordStory(log, { kind: 'theft', tick: 1, text: 'X robbed Y', because: 'starving' })
    expect(formatStory(e)).toBe('X robbed Y (starving)')
  })

  it('keeps the log bounded', () => {
    const log = createStoryLog()
    for (let i = 0; i < 400; i++) recordStory(log, { kind: 'work', tick: i, text: `t${i}` })
    expect(log.events.length).toBeLessThanOrEqual(120)
  })

  it('records the real events of a running settlement', { timeout: 30_000 }, () => {
    const s = createSim(99)
    s.settings.lodNear = 200
    s.settings.aiBatchSize = 8
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      s.spawnCreature(GEN(), Math.cos(angle) * 12, Math.sin(angle) * 12)
    }
    for (let t = 0; t < 3000; t++) s.tick()
    expect(s.stories.events.length).toBeGreaterThan(0)
    for (const e of s.stories.events) {
      expect(e.text.length).toBeGreaterThan(4)
      expect(e.significance).toBeGreaterThan(0)
    }
  })

  it('survives a save and load', () => {
    const s = createSim(3)
    const c = s.spawnCreature(GEN(), 0, 0)
    recordStory(s.stories, { kind: 'birth', tick: 1, actor: c, text: 'something happened' })
    const s2 = loadSim(saveSim(s))
    expect(s2.stories.events.length).toBe(1)
  })
})

describe('supply chains — shortages have a name', () => {
  it('a shift consumes its input and produces the next good', () => {
    const board = createJobBoard()
    const economy = createEconomy()
    const s = createSim(4)
    const baker = s.spawnCreature(GEN(), 0, 0)
    claimJob(board, baker, 'shopkeep')
    economy.goods.bread.stock = 0
    economy.goods.grain.stock = 5
    for (let i = 0; i < 30; i++) workShiftAt(board, economy, baker, 'shopkeep')
    expect(economy.goods.bread.stock).toBe(1)
    expect(economy.goods.grain.stock).toBe(4)
  })

  it('without the input, the shift produces nothing and pays less', () => {
    const board = createJobBoard()
    const economy = createEconomy()
    const s = createSim(5)
    const baker = s.spawnCreature(GEN(), 0, 0)
    claimJob(board, baker, 'shopkeep')
    economy.goods.bread.stock = 0
    economy.goods.grain.stock = 0
    let result = workShiftAt(board, economy, baker, 'shopkeep')
    for (let i = 0; i < 30; i++) {
      const r = workShiftAt(board, economy, baker, 'shopkeep')
      if (r.paid > 0) result = r
    }
    expect(result.produced).toBeNull()
    expect(result.blockedFor).toBe('grain')
    expect(result.paid).toBeGreaterThan(0)
    expect(economy.goods.bread.stock).toBe(0)
  })

  it('an unstaffed trade stops delivering entirely', () => {
    const board = createJobBoard()
    const economy = createEconomy()
    economy.goods.bread.stock = 0
    for (let i = 0; i < 200; i++) {
      tickEconomy(economy, (goodId) => isProducedGoodStaffed(board, goodId))
    }
    expect(economy.goods.bread.stock).toBe(0)
    expect(producerOf('bread')?.id).toBe('shopkeep')
  })

  it('goods nobody produces still arrive on the road', () => {
    const board = createJobBoard()
    const economy = createEconomy()
    economy.goods.weapon.stock = 0
    for (let i = 0; i < 200; i++) {
      tickEconomy(economy, (goodId) => isProducedGoodStaffed(board, goodId))
    }
    expect(economy.goods.weapon.stock).toBeGreaterThan(0)
  })

  it('the society panel names who is missing when a shelf is empty', () => {
    const s = createSim(6)
    s.spawnCreature(GEN(), 0, 0)
    s.economy.goods.bread.stock = 0
    const report = inspectSociety(s)
    const shortage = report.shortages.find((x) => x.good === 'bread')
    expect(shortage).toBeDefined()
    expect(shortage!.cause).toContain('shopkeeper')
  })
})

describe('debt between individuals', () => {
  it('a healer treats someone who cannot pay, and is owed for it', () => {
    const s = createSim(7)
    const healer = s.spawnCreature(GEN({ loyalty: 0.9 }), 52, -36)
    const patient = s.spawnCreature(GEN(), 52, -35)
    claimJob(s.jobs, healer, 'healer')
    healer.job = 'healer'
    patient.wallet = 0
    patient.chem.health = 0.3
    patient.injury = 0.5
    patient.learnTower('clinic')
    patient.intention = 'clinic'
    for (let i = 0; i < 40 && totalOwedBy(s.ledger, patient.id) === 0; i++) s.tick()
    expect(totalOwedBy(s.ledger, patient.id)).toBeGreaterThan(0)
    expect(totalOwedTo(s.ledger, healer.id)).toBeGreaterThan(0)
    expect(patient.chem.health).toBeGreaterThan(0.3)
  })

  it('a debtor repays when they can afford to', () => {
    const s = createSim(8)
    const debtor = s.spawnCreature(GEN(), 0, 0)
    const creditor = s.spawnCreature(GEN(), 1, 0)
    addDebt(s.ledger, debtor.id, creditor.id, 5, 0)
    debtor.wallet = 30
    for (let i = 0; i < 300 && totalOwedBy(s.ledger, debtor.id) > 0; i++) {
      // they keep running into each other around the plaza
      creditor.pos = { x: debtor.pos.x + 1, z: debtor.pos.z }
      s.tick()
    }
    expect(totalOwedBy(s.ledger, debtor.id)).toBe(0)
    expect(creditor.wallet).toBeGreaterThan(0)
  })

  it('the inspector shows what a creature owes', () => {
    const s = createSim(9)
    const a = s.spawnCreature(GEN(), 0, 0)
    const b = s.spawnCreature(GEN(), 1, 0)
    addDebt(s.ledger, a.id, b.id, 7, 0)
    expect(inspectCreature(s, a).owes).toBe(7)
    expect(inspectCreature(s, b).owed).toBe(7)
  })
})

describe('social acts that produce stories', () => {
  it('a parent teaches a child something it did not know', () => {
    const s = createSim(10)
    const parent = s.spawnCreature(GEN({ sociability: 0.8, loyalty: 0.8 }), 0, 0)
    const child = s.spawnCreature(GEN(), 1, 0)
    child.age = 100
    child.stage = 'child'
    child.knowledge = {}
    parent.knowledge = { food: 1, bank: 1, clinic: 1, tavern: 1 }
    child.parentIds = [parent.id]
    expect(mentorScore(parent, child)).toBeGreaterThan(0.5)
    const taught = mentor(parent, child)
    expect(taught.taughtPlace).toBeTruthy()
    expect(Object.keys(child.knowledge).length).toBe(1)
  })

  it('nobody teaches what they have not seen', () => {
    const s = createSim(11)
    const ignorant = s.spawnCreature(GEN(), 0, 0)
    const child = s.spawnCreature(GEN(), 1, 0)
    child.age = 100
    child.stage = 'child'
    ignorant.knowledge = { food: 1 }
    expect(mentorScore(ignorant, child)).toBe(0)
  })

  it('a brave respected creature breaks up a fight, sometimes taking a hit', () => {
    const s = createSim(12)
    const peacemaker = s.spawnCreature(GEN({ courage: 0.95, aggression: 0.1 }), 0, 0)
    const a = s.spawnCreature(GEN(), 1, 0)
    const b = s.spawnCreature(GEN(), 2, 0)
    a.emotions.spite = 0.8
    b.emotions.resentment = 0.7
    expect(mediateScore(peacemaker, a, b, 0.6)).toBeGreaterThan(0.5)
    mediate(peacemaker, a, b)
    expect(a.emotions.spite).toBeLessThan(0.8)
    expect(b.emotions.resentment).toBeLessThan(0.7)
  })

  it('a frightened creature does not step between fighters', () => {
    const s = createSim(13)
    const coward = s.spawnCreature(GEN({ courage: 0.05 }), 0, 0)
    coward.chem.fear = 0.9
    const a = s.spawnCreature(GEN(), 1, 0)
    const b = s.spawnCreature(GEN(), 2, 0)
    expect(mediateScore(coward, a, b, 0.2)).toBe(0)
  })

  it('flattery wins over the unguarded and backfires on the suspicious', () => {
    const s = createSim(14)
    const charmer = s.spawnCreature(GEN({ theft: 0.9, loyalty: 0.1, sociability: 0.95 }), 0, 0)
    const mark = s.spawnCreature(GEN({ learning: 0.05 }), 1, 0)
    mark.wallet = 40
    mark.chem.social = 0.1
    expect(flatterScore(charmer, mark)).toBeGreaterThan(0.4)
    expect(flatter(charmer, mark).believed).toBe(true)

    const wary = s.spawnCreature(GEN({ learning: 0.95 }), 2, 0)
    wary.emotions.paranoia = 0.9
    applySocialEvent(wary.social, charmer.id, 'steal', 2)
    const result = flatter(charmer, wary)
    expect(result.believed).toBe(false)
    expect(wary.social[charmer.id].suspicion).toBeGreaterThan(0.3)
  })

  it('an alliance is recognised only when the help runs both ways', () => {
    const s = createSim(15)
    const a = s.spawnCreature(GEN(), 0, 0)
    const b = s.spawnCreature(GEN(), 1, 0)
    for (let i = 0; i < 6; i++) applySocialEvent(a.social, b.id, 'help', 1)
    expect(alliedPair(a, b)).toBe(false) // one-sided is not an alliance
    for (let i = 0; i < 6; i++) applySocialEvent(b.social, a.id, 'help', 1)
    expect(alliedPair(a, b)).toBe(true)
    formAlliance(a, b)
    expect(allyDiscount(a, b)).toBeLessThan(1)
  })
})

describe('conversation that changes the world', () => {
  it('understands what the player wants to trade', () => {
    const parsed = parsePlayerText('can i buy bread from you?')
    expect(parsed.intent).toBe('request_trade')
    expect(parsed.item).toBe('bread')
    expect(parsed.direction).toBe('buy')
    expect(extractItem('do you want this medicine')).toBe('medicine')
  })

  it('a creature sells to the player and the goods actually move', () => {
    const s = createSim(16)
    const seller = s.spawnCreature(GEN(), 1, 0)
    addItem(seller.inventory, 'bread', 2, seller.id)
    seller.chem.hunger = 0.9
    s.player.pos = { x: 0, z: 0 }
    s.player.wallet = 50
    const turn = s.playerTalk('can i buy bread', seller.id)
    expect(turn).not.toBeNull()
    expect(s.player.inventory.items.bread ?? 0).toBeGreaterThan(0)
    expect(s.player.wallet).toBeLessThan(50)
  })

  it('a creature who thinks you are a thief refuses to deal', () => {
    const s = createSim(17)
    const seller = s.spawnCreature(GEN(), 1, 0)
    addItem(seller.inventory, 'bread', 2, seller.id)
    seller.reputation[0] = { trust: -0.8, thief: 0.9, protector: 0, aggressor: 0 }
    s.player.pos = { x: 0, z: 0 }
    s.player.wallet = 50
    const turn = s.playerTalk('can i buy bread', seller.id)
    expect(turn!.text).toContain("don't deal with thieves")
    expect(s.player.inventory.items.bread ?? 0).toBe(0)
  })

  it('asking a trusting creature for help creates a promise it can break', () => {
    const s = createSim(18)
    const helper = s.spawnCreature(GEN(), 1, 0)
    helper.reputation[0] = { trust: 0.8, thief: 0, protector: 0, aggressor: 0 }
    s.player.pos = { x: 0, z: 0 }
    s.playerTalk('help me please', helper.id)
    expect(s.chatter.promises.length).toBe(1)
    expect(s.chatter.promises[0].promiserId).toBe(helper.id)
  })

  it('warning a creature about someone changes what it believes', () => {
    const s = createSim(19)
    const listener = s.spawnCreature(GEN(), 1, 0)
    const suspect = s.spawnCreature(GEN(), 8, 8)
    listener.reputation[0] = { trust: 0.9, thief: 0, protector: 0, aggressor: 0 }
    s.player.pos = { x: 0, z: 0 }
    s.playerTalk(`be careful of ${suspect.name}`, listener.id)
    expect(listener.beliefs[`who:${suspect.id}:danger`]).toBeDefined()
  })

  it('a creature nobody trusts is not believed', () => {
    const s = createSim(20)
    const listener = s.spawnCreature(GEN(), 1, 0)
    const suspect = s.spawnCreature(GEN(), 8, 8)
    listener.reputation[0] = { trust: -0.9, thief: 0, protector: 0, aggressor: 0 }
    s.player.pos = { x: 0, z: 0 }
    const turn = s.playerTalk(`be careful of ${suspect.name}`, listener.id)
    expect(turn!.text).toContain('Says who')
    expect(listener.beliefs[`who:${suspect.id}:danger`]).toBeUndefined()
  })

  it('a conversation stays with the person you are talking to', () => {
    const s = createSim(30)
    const talker = s.spawnCreature(GEN(), 2, 0)
    const passerby = s.spawnCreature(GEN(), 1, 0)
    s.player.pos = { x: 0, z: 0 }
    const first = s.playerTalk('hello', talker.id)
    expect(first!.speakerId).toBe(talker.id)
    // the other one wanders closer, but you are mid-conversation
    passerby.pos = { x: 0.2, z: 0 }
    const second = s.playerTalk('how are you feeling?')
    expect(second!.speakerId).toBe(talker.id)
    // until they walk out of earshot, and then whoever is near picks it up
    talker.pos = { x: 70, z: 70 }
    const third = s.playerTalk('hello')
    expect(third!.speakerId).toBe(passerby.id)
  })

  it('children and elders do not sound the same', () => {
    const s = createSim(21)
    const kid = s.spawnCreature(GEN(), 0, 0)
    kid.stage = 'child'
    const elder = s.spawnCreature(GEN(), 1, 0)
    elder.stage = 'elder'
    elder.language.vocab.set('food', { word: 'wum', strength: 0.9 })
    elder.language.vocab.set('home', { word: 'dul', strength: 0.9 })
    elder.language.vocab.set('friend', { word: 'ka', strength: 0.9 })
    const line = '"I am alright," they say, and then they look away.'
    expect(inVoiceOf(kid, line)).not.toContain('and then')
    expect(inVoiceOf(elder, line)).toContain('seen it before')
  })
})
