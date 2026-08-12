import { describe, expect, it } from 'vitest'
import {
  BRAIN_ACTIONS, BRAIN_INPUTS, BRAIN_OUTPUTS, brainCertainty, createBrain,
  rewardSync, thinkSync,
} from './brain'
import { createSim } from './sim'
import { randomGenome } from './genetics'
import { findTower } from './world'

const flat = (n: number, v = 0.5): number[] => Array.from({ length: n }, () => v)

describe('brain — a small neural net per creature', () => {
  it('is sized to the actions it can hold an opinion about', () => {
    expect(BRAIN_OUTPUTS).toBe(BRAIN_ACTIONS.length)
    const b = createBrain(BRAIN_INPUTS, BRAIN_OUTPUTS)
    expect(b.inputSize).toBe(BRAIN_INPUTS)
    expect(b.outputSize).toBe(BRAIN_OUTPUTS)
    expect(b.learnRate).toBeGreaterThan(0)
    expect(b.learnRate).toBeLessThan(1)
  })

  it('answers with a distribution over actions', () => {
    const b = createBrain(8, 6)
    const out = thinkSync(b, flat(8))
    expect(out.length).toBe(6)
    expect(out.reduce((a, v) => a + v, 0)).toBeCloseTo(1, 5)
    for (const v of out) expect(v).toBeGreaterThanOrEqual(0)
  })

  it('responds to the context it is given', () => {
    const b = createBrain(4, 3)
    const hungry = thinkSync(b, [1, 0, 0, 0])
    const rested = thinkSync(b, [0, 1, 0, 0])
    expect(hungry.some((v, i) => Math.abs(v - rested[i]) > 1e-6)).toBe(true)
  })

  it('learns: rewarding an action in a context makes it the preference there', () => {
    const b = createBrain(4, 3)
    const context = [1, 0, 0, 0]
    const before = thinkSync(b, context)[1]
    for (let i = 0; i < 40; i++) rewardSync(b, context, 1, 0.8)
    const after = thinkSync(b, context)
    expect(after[1]).toBeGreaterThan(before)
    expect(after[1]).toBeGreaterThan(after[0])
    expect(after[1]).toBeGreaterThan(after[2])
  })

  it('unlearns: a punished action loses its preference', () => {
    const b = createBrain(4, 3)
    const context = [1, 0, 0, 0]
    for (let i = 0; i < 30; i++) rewardSync(b, context, 2, 0.8)
    const liked = thinkSync(b, context)[2]
    for (let i = 0; i < 30; i++) rewardSync(b, context, 2, -0.8)
    expect(thinkSync(b, context)[2]).toBeLessThan(liked)
  })

  it('keeps what it learned tied to the context it learned it in', () => {
    const b = createBrain(4, 3)
    for (let i = 0; i < 40; i++) rewardSync(b, [1, 0, 0, 0], 1, 0.8)
    const inThatContext = thinkSync(b, [1, 0, 0, 0])[1]
    const inAnother = thinkSync(b, [0, 0, 1, 0])[1]
    expect(inThatContext).toBeGreaterThan(inAnother)
  })

  it('reports how settled its opinions are', () => {
    const b = createBrain(4, 3)
    const fresh = brainCertainty(thinkSync(b, [1, 0, 0, 0]))
    for (let i = 0; i < 60; i++) rewardSync(b, [1, 0, 0, 0], 1, 0.9)
    const settled = brainCertainty(thinkSync(b, [1, 0, 0, 0]))
    expect(settled).toBeGreaterThan(fresh)
    expect(brainCertainty(null)).toBe(0)
    expect(brainCertainty([0.5, 0.5])).toBeCloseTo(0, 5)
  })

  it('does not run away however long it is trained', () => {
    const b = createBrain(4, 3)
    for (let i = 0; i < 4000; i++) rewardSync(b, [1, 0.2, 0, 0], i % 3, 1)
    for (const w of b.w1) expect(Number.isFinite(w)).toBe(true)
    const out = thinkSync(b, [1, 0.2, 0, 0])
    expect(out.reduce((a, v) => a + v, 0)).toBeCloseTo(1, 4)
  })

  it('brains are independent of one another', () => {
    const a = createBrain(4, 3)
    const b = createBrain(4, 3)
    const beforeB = thinkSync(b, [1, 0, 0, 0])
    for (let i = 0; i < 30; i++) rewardSync(a, [1, 0, 0, 0], 1, 0.8)
    expect(thinkSync(b, [1, 0, 0, 0])).toEqual(beforeB)
  })

  it('saves and reloads exactly', () => {
    const b = createBrain(4, 3)
    rewardSync(b, [1, 0, 0, 0], 1, 0.5)
    const snapshot = b.serialize()
    expect(thinkSync(createBrain(4, 3, snapshot), [1, 0, 0, 0]))
      .toEqual(thinkSync(b, [1, 0, 0, 0]))
  })

  it('starts fresh rather than mangled when the action list has changed', () => {
    const old = createBrain(4, 3).serialize()
    const wider = createBrain(4, 5, old)
    expect(wider.outputSize).toBe(5)
    expect(thinkSync(wider, [1, 0, 0, 0]).length).toBe(5)
  })

  it('is reproducible from a seed', () => {
    let n = 1
    const seeded = () => (n = (n * 16807) % 2147483647) / 2147483647
    const a = createBrain(4, 3, undefined, seeded)
    n = 1
    const b = createBrain(4, 3, undefined, seeded)
    expect(Array.from(a.w1)).toEqual(Array.from(b.w1))
  })
})

describe('brain — actually wired into what a creature decides', () => {
  it('fills in its preferences as part of making a decision', () => {
    const s = createSim(3)
    const c = s.spawnCreature(randomGenome(() => 0.5), 0, 0)
    expect(c.brainPrefs).toBeNull()
    for (let i = 0; i < 4; i++) s.tick()
    expect(c.brainPrefs, 'the brain was never asked').not.toBeNull()
    expect(c.brainPrefs!.length).toBe(BRAIN_OUTPUTS)
  })

  it('a brain trained toward one action shifts what its owner chooses', () => {
    // two identical creatures, in identical circumstances, one of whom has
    // spent its life being rewarded for going to the tavern
    const drinkIndex = BRAIN_ACTIONS.indexOf('drink')
    const tavern = findTower('tavern')!
    const counts = { trained: 0, untrained: 0 }

    for (const trained of [true, false]) {
      for (let seed = 0; seed < 6; seed++) {
        const s = createSim(100 + seed)
        const c = s.spawnCreature(randomGenome(() => 0.5), tavern.x, tavern.z)
        c.wallet = 60
        c.chem.hunger = 0.85
        c.chem.energy = 0.85
        c.chem.pleasure = 0.4
        c.learnTower('tavern')
        if (trained) {
          const context = Array.from({ length: BRAIN_INPUTS }, () => 0.5)
          for (let i = 0; i < 120; i++) rewardSync(c.brain, context, drinkIndex, 0.9)
        }
        for (let i = 0; i < 30; i++) s.tick()
        if (c.action === 'drink' || c.intention === 'drink' || (c.chem.addiction.brew ?? 0) > 0) {
          counts[trained ? 'trained' : 'untrained']++
        }
      }
    }

    expect(counts.trained).toBeGreaterThan(counts.untrained)
  })
})
