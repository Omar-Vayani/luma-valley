import { describe, expect, it } from 'vitest'
import { parsePlayerText, respondToPlayer } from './dialogue'
import { createCreature } from './creature'
import { randomGenome } from './genetics'
import { createSocialGraph, applySocialEvent, romanticInterest, friendship, geneticCompatibility } from './socialbond'
import { createLodState, pickAiBatch, bandFor, shouldFullDecide } from './lod'
import { DEFAULT_SETTINGS } from './settings'
import { createSociety, ensureCoupleHousehold, adoptChild, homeSlotPos } from './household'
import { createSim } from './sim'
import { inspectCreature } from './inspect'
import { saveSim, loadSim, SAVE_VERSION } from './save'
import { tickPsyche } from './psyche'

const GEN = () => randomGenome(() => 0.5)

describe('dialogue — offline NL', () => {
  it('parses greetings, questions, and commands', () => {
    expect(parsePlayerText('Hello there!').intent).toBe('greet')
    expect(parsePlayerText('How are you feeling?').intent).toBe('ask_feeling')
    expect(parsePlayerText('What is your name?').intent).toBe('ask_name')
    expect(parsePlayerText('Go to the bank').intent).toBe('command')
    expect(parsePlayerText('I like you').intent).toBe('flirt')
  })

  it('creatures reply without auto-obeying commands', () => {
    const c = createCreature(1, 'Momo', GEN(), 0, 0)
    c.genome.aggression = 0.9
    c.genome.loyalty = 0.1
    const turn = respondToPlayer(
      {
        creature: c,
        playerName: 'Visitor',
        playerTrust: -0.2,
        graph: c.social,
        nearbyNames: [],
        knownPlaces: ['bank'],
        tick: 1,
      },
      { intent: 'command' },
    )
    expect(turn.obeyed).toBe(false)
    expect(turn.text.length).toBeGreaterThan(5)
  })

  it('trusted greetings warm the reply', () => {
    const c = createCreature(2, 'Nana', GEN(), 0, 0)
    applySocialEvent(c.social, 0, 'talk', 2)
    const turn = respondToPlayer(
      {
        creature: c,
        playerName: 'Visitor',
        playerTrust: 0.8,
        graph: c.social,
        nearbyNames: [],
        knownPlaces: [],
        tick: 2,
      },
      { intent: 'greet' },
    )
    expect(turn.text).toMatch(/Nana|Visitor|Hello/i)
  })
})

describe('socialbond — multidimensional edges', () => {
  it('theft damages trust and raises resentment asymmetrically', () => {
    const g = createSocialGraph()
    applySocialEvent(g, 7, 'steal', 1)
    expect(g[7].resentment).toBeGreaterThan(0.2)
    expect(g[7].trust).toBeLessThan(0.1)
    expect(g[7].familiarity).toBeGreaterThan(0)
  })

  it('romance needs attraction + trust, not a single friendship score', () => {
    const g = createSocialGraph()
    applySocialEvent(g, 3, 'flirt', 2)
    applySocialEvent(g, 3, 'talk', 2)
    applySocialEvent(g, 3, 'help', 1)
    const e = g[3]
    expect(romanticInterest(e, 0.8)).toBeGreaterThan(friendship(e) * 0.3)
  })

  it('genetic compatibility prefers aligned temperament', () => {
    const a = { sociability: 0.8, loyalty: 0.7, aggression: 0.2, lovePropensity: 0.8, fearfulness: 0.2 }
    const alike = { ...a }
    const unlike = { sociability: 0.1, loyalty: 0.1, aggression: 0.9, lovePropensity: 0.1, fearfulness: 0.9 }
    expect(geneticCompatibility(a, alike)).toBeGreaterThan(geneticCompatibility(a, unlike))
  })
})

describe('lod — time-sliced AI', () => {
  it('bands distant creatures as mid/far', () => {
    const c = createCreature(1, 'A', GEN(), 80, 0)
    expect(bandFor(c, 0, 0, DEFAULT_SETTINGS)).toBe('far')
    c.pos.x = 10
    expect(bandFor(c, 0, 0, DEFAULT_SETTINGS)).toBe('near')
  })

  it('batches a limited number of AI decides', () => {
    const creatures = Array.from({ length: 12 }, (_, i) => createCreature(i + 1, `C${i}`, GEN(), i * 2, 0))
    const lod = createLodState()
    const batch = pickAiBatch(creatures, 0, 0, DEFAULT_SETTINGS, lod, 10)
    expect(batch.length).toBeLessThanOrEqual(DEFAULT_SETTINGS.aiBatchSize)
    expect(batch.length).toBeGreaterThan(0)
  })

  it('sleeping creatures decide infrequently', () => {
    expect(shouldFullDecide(createCreature(1, 'Z', GEN()), 'sleep', 10, 9)).toBe(false)
    expect(shouldFullDecide(createCreature(1, 'Z', GEN()), 'sleep', 20, 10)).toBe(true)
  })
})

describe('household + psyche', () => {
  it('couples form a household with a home slot', () => {
    const society = createSociety()
    const a = createCreature(1, 'A', GEN(), 0, 0)
    const b = createCreature(2, 'B', GEN(), 1, 0)
    const h = ensureCoupleHousehold(society, a, b, 5)
    expect(h.memberIds).toContain(1)
    expect(h.memberIds).toContain(2)
    expect(a.householdId).toBe(h.id)
    const pos = homeSlotPos(h.homeSlot)
    expect(Number.isFinite(pos.x)).toBe(true)
  })

  it('children join the parents household', () => {
    const society = createSociety()
    const a = createCreature(1, 'A', GEN(), 0, 0)
    const b = createCreature(2, 'B', GEN(), 1, 0)
    const child = createCreature(3, 'Kid', GEN(), 0.5, 0)
    ensureCoupleHousehold(society, a, b, 1)
    adoptChild(society, a, child)
    expect(child.householdId).toBe(a.householdId)
  })

  it('psyche derives a mood from chem + emotions', () => {
    const c = createCreature(1, 'P', GEN(), 0, 0)
    c.chem.grief = 0.8
    tickPsyche(c)
    expect(c.psyche.mood).toBe('grieving')
  })
})

describe('playerTalk + inspect + save v5', () => {
  it('playerTalk produces a dialogue turn with a nearby creature', () => {
    const s = createSim(42)
    const c = s.spawnCreature(GEN(), 1, 0)
    s.player.pos = { x: 0, z: 0 }
    const turn = s.playerTalk('Hello!')
    expect(turn).not.toBeNull()
    expect(turn!.speakerId).toBe(c.id)
    expect(c.recentDialogue.length).toBeGreaterThan(0)
    expect(s.dialogueLog.length).toBe(1)
  })

  it('inspector exposes reasoning and scores', () => {
    const s = createSim(3)
    const c = s.spawnCreature(GEN(), 0, 0)
    c.chem.hunger = 0.2
    const report = inspectCreature(s, c)
    expect(report.reasoning.length).toBeGreaterThan(0)
    expect(report.topScores.length).toBeGreaterThan(0)
    expect(report.needs.some((n) => n.key === 'hunger')).toBe(true)
  })

  it('round-trips social graph and society in save v5', () => {
    const s = createSim(9)
    const a = s.spawnCreature(GEN(), 0, 0)
    const b = s.spawnCreature(GEN(), 1, 0)
    applySocialEvent(a.social, b.id, 'flirt', 1)
    ensureCoupleHousehold(s.society, a, b, s.time)
    a.illness = 0.4
    const data = saveSim(s)
    expect(data.version).toBe(SAVE_VERSION)
    const s2 = loadSim(data)
    expect(s2.creatures[0].social[b.id]?.attraction).toBeGreaterThan(0)
    expect(s2.creatures[0].illness).toBeCloseTo(0.4)
    expect(s2.society.households.length).toBe(1)
  })

  it('clinic action is scored when ill', () => {
    const s = createSim(2)
    const c = s.spawnCreature(GEN(), 52, -36)
    c.learnTower('clinic')
    c.illness = 0.6
    c.wallet = 20
    c.chem.health = 0.5
    for (let i = 0; i < 5; i++) s.tick()
    // either walked/acted at clinic or has clinic intention
    expect(
      c.action === 'clinic' || c.intention === 'clinic' || c.illness < 0.6 || c.goalTowerId === 'clinic',
    ).toBe(true)
  })
})
