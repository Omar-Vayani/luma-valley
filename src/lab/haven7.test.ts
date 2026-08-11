import { describe, expect, it } from 'vitest'
import { createSim } from './sim'
import { randomGenome, type Genome } from './genetics'
import {
  createInstitutions, isOpen, timeOfDay, isNight, takePayment, payFromTill, tillOf,
  ticksUntilOpen, closedNow, DAY_LENGTH,
} from './institutions'
import {
  standingOf, priceMultiplierFor, willingToHelp, rankForHousing, describeStanding,
} from './status'
import { createCulture } from './norms'
import { claimJob } from './jobs'
import { createLodState, timePhase, rollPhases, phaseBreakdown, SIM_PHASES } from './lod'
import { inspectSociety, inspectCreature } from './inspect'
import { scoreActions } from './mind'
import { applySocialEvent } from './socialbond'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('institutions keep their own hours and their own money', () => {
  it('a new world opens in daylight with the doors unlocked', () => {
    const inst = createInstitutions()
    expect(isOpen(inst, 'food', 0)).toBe(true)
    expect(isOpen(inst, 'work', 0)).toBe(true)
    expect(isNight(0)).toBe(false)
  })

  it('the market shuts overnight and says when it opens again', () => {
    const inst = createInstitutions()
    const night = Math.round(DAY_LENGTH * 0.5) // half a day past the midday start
    expect(timeOfDay(night)).toBeCloseTo(0, 1)
    expect(isNight(night)).toBe(true)
    expect(isOpen(inst, 'food', night)).toBe(false)
    expect(ticksUntilOpen(inst, 'food', night)).toBeGreaterThan(0)
    expect(closedNow(inst, night)).toContain('food')
  })

  it('the clinic never closes', () => {
    const inst = createInstitutions()
    for (let t = 0; t < DAY_LENGTH; t += 100) {
      expect(isOpen(inst, 'clinic', t)).toBe(true)
    }
  })

  it('wages come out of the till a building actually took', () => {
    const inst = createInstitutions()
    inst.food.till = 0
    expect(payFromTill(inst, 'food', 9)).toBe(0)
    takePayment(inst, 'food', 12)
    expect(tillOf(inst, 'food')).toBe(12)
    expect(payFromTill(inst, 'food', 9)).toBe(9)
    expect(tillOf(inst, 'food')).toBe(3)
  })

  it('a worker whose shop has taken nothing goes unpaid', () => {
    const s = createSim(3)
    const keeper = s.spawnCreature(GEN(), -28, -28) // standing in the market
    claimJob(s.jobs, keeper, 'shopkeep')
    s.institutions.food.till = 0
    keeper.wallet = 0
    keeper.learnTower('food')
    keeper.intention = 'work'
    for (let i = 0; i < 60; i++) s.tick()
    expect(keeper.wallet).toBe(0)
  })

  it('creatures do not set out for a shop that is shut', () => {
    const s = createSim(4)
    const c = s.spawnCreature(GEN(), 0, 0)
    c.learnTower('tavern')
    c.chem.pleasure = 0.1
    c.chem.addiction.brew = 0.8
    const openScore = scoreActions(s, c).drink
    s.time = Math.round(DAY_LENGTH * 0.5) // the middle of the night
    const shutScore = scoreActions(s, c).drink
    expect(shutScore).toBeLessThan(openScore)
  })

  it('night makes a tired creature keener to sleep', () => {
    const s = createSim(5)
    const c = s.spawnCreature(GEN(), 0, 0)
    c.chem.energy = 0.35
    const byDay = scoreActions(s, c).sleep
    s.time = Math.round(DAY_LENGTH * 0.5)
    const byNight = scoreActions(s, c).sleep
    expect(byNight).toBeGreaterThan(byDay)
  })

  it('the society panel reports the hour and which doors are shut', () => {
    const s = createSim(6)
    s.spawnCreature(GEN(), 0, 0)
    s.time = Math.round(DAY_LENGTH * 0.5)
    const report = inspectSociety(s)
    expect(report.closed.length).toBeGreaterThan(0)
    expect(report.tills.some((t) => t.tower === 'food')).toBe(true)
  })
})

describe('standing changes what the settlement gives you', () => {
  it('a respected worker outranks a disgraced stranger', () => {
    const s = createSim(7)
    const respected = s.spawnCreature(GEN(), 0, 0)
    const disgraced = s.spawnCreature(GEN(), 2, 0)
    const peer = s.spawnCreature(GEN(), 4, 0)
    respected.job = 'healer'
    respected.education = 3
    s.culture.influence[respected.id] = 0.8
    peer.reputation[disgraced.id] = { trust: -0.8, thief: 0.9, protector: 0, aggressor: 0.6 }

    const good = standingOf(respected, s.culture, s.creatures)
    const bad = standingOf(disgraced, s.culture, s.creatures)
    expect(good.score).toBeGreaterThan(bad.score)
    expect(bad.disgrace).toBeGreaterThan(0)
    expect(describeStanding(bad)).toContain('distrusted')
  })

  it('the disgraced are quoted worse prices', () => {
    const clean = { score: 0.7, respect: 0.7, wealth: 0.5, contribution: 0.7, disgrace: 0 }
    const shady = { score: 0.1, respect: 0, wealth: 0.2, contribution: 0.1, disgrace: 0.8 }
    expect(priceMultiplierFor(shady)).toBeGreaterThan(priceMultiplierFor(clean))
  })

  it('people help a friend before a well-regarded stranger', () => {
    const s = createSim(8)
    const helper = s.spawnCreature(GEN(), 0, 0)
    const friend = s.spawnCreature(GEN(), 1, 0)
    const stranger = s.spawnCreature(GEN(), 2, 0)
    for (let i = 0; i < 8; i++) applySocialEvent(helper.social, friend.id, 'help', 1)
    const friendStanding = standingOf(friend, s.culture, s.creatures)
    const strangerStanding = { ...standingOf(stranger, s.culture, s.creatures), score: 0.8 }
    expect(willingToHelp(helper, friend, friendStanding))
      .toBeGreaterThan(willingToHelp(helper, stranger, strangerStanding) * 0.9)
  })

  it('housing goes to those the settlement thinks most of', () => {
    const s = createSim(9)
    const culture = createCulture()
    const low = s.spawnCreature(GEN(), 0, 0)
    const high = s.spawnCreature(GEN(), 2, 0)
    high.job = 'shopkeep'
    high.wallet = 60
    culture.influence[high.id] = 0.9
    const ranked = rankForHousing([low, high], culture, s.creatures)
    expect(ranked[0].id).toBe(high.id)
  })

  it('the inspector says where a creature stands in words', () => {
    const s = createSim(10)
    const c = s.spawnCreature(GEN(), 0, 0)
    const report = inspectCreature(s, c)
    expect(report.standing.length).toBeGreaterThan(3)
    expect(report.standingScore).toBeGreaterThanOrEqual(0)
  })
})

describe('per-system profiling', () => {
  it('attributes time to each phase and averages it', () => {
    const lod = createLodState()
    timePhase(lod, 'minds', () => {
      let x = 0
      for (let i = 0; i < 200000; i++) x += i
      return x
    })
    expect(lod.phaseMs.minds).toBeGreaterThanOrEqual(0)
    rollPhases(lod)
    expect(lod.phaseMs.minds).toBe(0) // reset for the next tick
    const breakdown = phaseBreakdown(lod)
    expect(breakdown.length).toBe(SIM_PHASES.length)
    expect(breakdown[0].share).toBeGreaterThanOrEqual(breakdown[1].share)
  })

  it('a running simulation fills in every phase', () => {
    const s = createSim(11)
    for (let i = 0; i < 6; i++) s.spawnCreature(GEN(), i * 2, 0)
    for (let t = 0; t < 300; t++) s.tick()
    const total = SIM_PHASES.reduce((sum, p) => sum + s.lod.phaseAvg[p], 0)
    expect(total).toBeGreaterThan(0)
  })
})

describe('the settlement holds together over a long run', () => {
  it('keeps a living population across several seeds', () => {
    for (const seed of [7, 42, 99, 2026]) {
      const s = createSim(seed)
      s.settings.lodNear = 200
      s.settings.aiBatchSize = 8
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2
        s.spawnCreature(GEN(), Math.cos(angle) * 12, Math.sin(angle) * 12)
      }
      for (let t = 0; t < 7000; t++) s.tick()
      const alive = s.creatures.filter((c) => c.alive).length
      expect(alive, `seed ${seed} died out`).toBeGreaterThan(1)
      expect(alive).toBeLessThanOrEqual(s.settings.populationCap)
    }
  })

  it('two creatures in the same spot with different natures choose differently', () => {
    const s = createSim(12)
    const timid = s.spawnCreature(GEN({ theft: 0.02, aggression: 0.02, fearfulness: 0.9, courage: 0.05 }), 0, 0)
    const chancer = s.spawnCreature(GEN({ theft: 0.95, aggression: 0.9, fearfulness: 0.05, courage: 0.95 }), 1, 0)
    const mark = s.spawnCreature(GEN(), 2, 0)
    mark.wallet = 40
    for (const c of [timid, chancer]) {
      c.wallet = 0
      c.chem.hunger = 0.25
      c.learnTower('food')
      c.learnTower('work')
    }
    const timidScores = scoreActions(s, timid)
    const chancerScores = scoreActions(s, chancer)
    expect(chancerScores.steal).toBeGreaterThan(timidScores.steal * 2)
    expect(timidScores.work).toBeGreaterThan(timidScores.steal)
  })
})
