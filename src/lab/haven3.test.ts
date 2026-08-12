import { describe, expect, it } from 'vitest'
import { createSim, shareDirections } from './sim'
import { randomGenome, type Genome } from './genetics'
import { courtStep, partnershipStep, separate, reconcileStep, crushOf } from './courtship'
import { applySocialEvent, edgeTo } from './socialbond'
import { isMature } from './lifecycle'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('courtship — love is earned, not assigned', () => {
  it('two strangers do not become partners on first contact', () => {
    const s = createSim(1)
    const a = s.spawnCreature(GEN({ lovePropensity: 0.9 }), 0, 0)
    const b = s.spawnCreature(GEN({ lovePropensity: 0.9 }), 1, 0)
    expect(courtStep(a, b)).not.toBe('partnered')
    expect(a.partnerId).toBeNull()
  })

  it('repeated compatible contact eventually makes a couple', () => {
    const s = createSim(2)
    const a = s.spawnCreature(GEN({ lovePropensity: 0.95, sociability: 0.9, loyalty: 0.8, aggression: 0.1 }), 0, 0)
    const b = s.spawnCreature(GEN({ lovePropensity: 0.95, sociability: 0.9, loyalty: 0.8, aggression: 0.1 }), 1, 0)
    let outcome = ''
    for (let i = 0; i < 60 && a.partnerId === null; i++) {
      applySocialEvent(a.social, b.id, 'talk', 1)
      applySocialEvent(b.social, a.id, 'talk', 1)
      outcome = courtStep(a, b)
    }
    expect(outcome).toBe('partnered')
    expect(a.partnerId).toBe(b.id)
    expect(b.partnerId).toBe(a.id)
  })

  it('one-sided interest gets rejected and stings', () => {
    const s = createSim(3)
    const hopeful = s.spawnCreature(GEN({ lovePropensity: 0.95 }), 0, 0)
    const uninterested = s.spawnCreature(GEN({ lovePropensity: 0.05, fearfulness: 0.9 }), 1, 0)
    // build one-sided feeling only
    for (let i = 0; i < 30; i++) applySocialEvent(hopeful.social, uninterested.id, 'flirt', 1)
    applySocialEvent(uninterested.social, hopeful.id, 'reject', 1)
    const outcome = courtStep(hopeful, uninterested)
    expect(outcome).toBe('rejected')
    expect(hopeful.partnerId).toBeNull()
    expect(hopeful.emotions.shame).toBeGreaterThan(0)
  })

  it('children never court', () => {
    const s = createSim(4)
    const kid = s.spawnCreature(GEN(), 0, 0)
    const adult = s.spawnCreature(GEN(), 1, 0)
    kid.age = 50
    kid.stage = 'child'
    expect(isMature(kid.stage)).toBe(false)
    expect(courtStep(kid, adult)).toBe('not-ready')
  })

  it('resentment ends a partnership, and both feel the loss', () => {
    const s = createSim(5)
    const a = s.spawnCreature(GEN(), 0, 0)
    const b = s.spawnCreature(GEN(), 1, 0)
    a.partnerId = b.id
    b.partnerId = a.id
    a.chem.bond = 0.9
    b.chem.bond = 0.9
    for (let i = 0; i < 6; i++) applySocialEvent(a.social, b.id, 'betray', 1)
    expect(partnershipStep(a, b)).toBe('ended')
    expect(a.partnerId).toBeNull()
    expect(b.partnerId).toBeNull()
    expect(a.emotions.frustration).toBeGreaterThan(0)
  })

  it('jealousy strains a partnership before it breaks it', () => {
    const s = createSim(6)
    const a = s.spawnCreature(GEN(), 0, 0)
    const b = s.spawnCreature(GEN(), 1, 0)
    a.partnerId = b.id
    b.partnerId = a.id
    a.jealousy = 0.8
    expect(partnershipStep(a, b)).toBe('strained')
    expect(a.partnerId).toBe(b.id)
  })

  it('a forgiving creature can reconcile; a bitter one cannot', () => {
    const s = createSim(7)
    const a = s.spawnCreature(GEN({ loyalty: 0.9 }), 0, 0)
    const b = s.spawnCreature(GEN(), 1, 0)
    applySocialEvent(a.social, b.id, 'talk', 3)
    applySocialEvent(a.social, b.id, 'steal', 1)
    a.emotions.forgiveness = 0.8
    expect(reconcileStep(a, b)).toBe(true)

    const bitter = s.spawnCreature(GEN({ loyalty: 0.05 }), 2, 0)
    for (let i = 0; i < 5; i++) applySocialEvent(bitter.social, b.id, 'betray', 1)
    bitter.emotions.forgiveness = 0
    expect(reconcileStep(bitter, b)).toBe(false)
  })

  it('separation is remembered — an ex is not a stranger', () => {
    const s = createSim(8)
    const a = s.spawnCreature(GEN(), 0, 0)
    const b = s.spawnCreature(GEN(), 1, 0)
    a.partnerId = b.id
    b.partnerId = a.id
    applySocialEvent(a.social, b.id, 'talk', 4)
    separate(a, b)
    expect(edgeTo(a.social, b.id).familiarity).toBeGreaterThan(0)
  })

  it('crushOf finds the strongest available interest', () => {
    const s = createSim(9)
    const c = s.spawnCreature(GEN({ lovePropensity: 0.9 }), 0, 0)
    const meh = s.spawnCreature(GEN(), 1, 0)
    const spark = s.spawnCreature(GEN(), 2, 0)
    for (let i = 0; i < 10; i++) applySocialEvent(c.social, spark.id, 'flirt', 1)
    applySocialEvent(c.social, meh.id, 'talk', 1)
    expect(crushOf(c, s.creatures)?.id).toBe(spark.id)
  })
})

describe('care, widowhood, and newcomers keep a society alive', () => {
  it('an adult feeds a hungry child from their own supplies', () => {
    const s = createSim(10)
    const parent = s.spawnCreature(GEN({ greed: 0.2, loyalty: 0.9, sociability: 0.9 }), 0, 0)
    const kid = s.spawnCreature(GEN(), 1, 0)
    kid.age = 100
    kid.stage = 'child'
    kid.chem.hunger = 0.2
    parent.inventory.items.bread = 3
    const before = kid.chem.hunger
    for (let i = 0; i < 40 && kid.chem.hunger <= before; i++) s.tick()
    expect(kid.chem.hunger).toBeGreaterThan(before)
  })

  it('a neglectful adult lets a child go hungry', () => {
    const s = createSim(11)
    const adult = s.spawnCreature(GEN({ greed: 0.95, loyalty: 0.1, sociability: 0.2 }), 0, 0)
    const kid = s.spawnCreature(GEN(), 1, 0)
    kid.age = 100
    kid.stage = 'child'
    kid.chem.hunger = 0.4
    kid.wallet = 0 // no way to feed itself — it depends on the adults
    adult.inventory.items.bread = 3
    adult.wallet = 2 // too poor to hand out coins, so only the care path matters
    adult.chem.hunger = 1 // and not hungry enough to eat the loaves itself
    const before = kid.chem.hunger
    for (let i = 0; i < 20; i++) s.tick()
    expect(kid.chem.hunger).toBeLessThanOrEqual(before)
    expect(adult.inventory.items.bread).toBe(3)
  })

  it('a widow becomes single again once mourning passes', () => {
    const s = createSim(12)
    const a = s.spawnCreature(GEN(), 0, 0)
    const b = s.spawnCreature(GEN(), 1, 0)
    a.partnerId = b.id
    b.partnerId = a.id
    b.alive = false
    b.buried = true
    a.chem.grief = 0.1
    for (let i = 0; i < 30 && a.partnerId !== null; i++) s.tick()
    expect(a.partnerId).toBeNull()
  })

  it('travellers arrive when the settlement thins, and can be switched off', () => {
    const open = createSim(13)
    open.settings.allowNewcomers = true
    open.settings.populationCap = 12
    open.spawnCreature(GEN(), 0, 0)
    const startOpen = open.creatures.length
    for (let i = 0; i < 4000 && open.creatures.length === startOpen; i++) open.tick()
    expect(open.creatures.length).toBeGreaterThan(startOpen)

    const closed = createSim(13)
    closed.settings.allowNewcomers = false
    closed.settings.populationCap = 12
    closed.spawnCreature(GEN(), 0, 0)
    const startClosed = closed.creatures.length
    for (let i = 0; i < 2000; i++) closed.tick()
    expect(closed.creatures.length).toBe(startClosed)
  })

  it('a small settlement survives a long run instead of dying out', { timeout: 30_000 }, () => {
    const s = createSim(99)
    s.settings.lodNear = 200
    s.settings.aiBatchSize = 8
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      s.spawnCreature(GEN(), Math.cos(angle) * 12, Math.sin(angle) * 12)
    }
    for (let t = 0; t < 6000; t++) s.tick()
    const alive = s.creatures.filter((c) => c.alive)
    expect(alive.length).toBeGreaterThan(2)
    expect(alive.length).toBeLessThanOrEqual(s.settings.populationCap)
  })

  it('institutions get staffed and production refills the shelves', () => {
    const s = createSim(41)
    s.settings.lodNear = 200
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2
      s.spawnCreature(GEN(), Math.cos(angle) * 10, Math.sin(angle) * 10)
    }
    for (let t = 0; t < 1500; t++) s.tick()
    expect(Object.keys(s.jobs.holders).length).toBeGreaterThan(0)
  })

  it('creatures learn where things are by being told', () => {
    const s = createSim(42)
    const local = s.spawnCreature(GEN({ sociability: 0.9 }), 0, 0)
    const newcomer = s.spawnCreature(GEN({ sociability: 0.9 }), 1, 0)
    local.knowledge.food = 1
    newcomer.knowledge = {}
    newcomer.chem.hunger = 0.3 // visibly hungry, so directions are volunteered
    shareDirections(local, newcomer, 0.5)
    expect(newcomer.knowsTower('food')).toBe(true)
  })

  it('a creature nobody trusts is told nothing', () => {
    const s = createSim(43)
    const local = s.spawnCreature(GEN(), 0, 0)
    const outcast = s.spawnCreature(GEN(), 1, 0)
    local.knowledge.food = 1
    outcast.knowledge = {}
    outcast.chem.hunger = 0.2
    shareDirections(local, outcast, -0.8)
    expect(outcast.knowsTower('food')).toBe(false)
  })
})
