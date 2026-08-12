import { describe, expect, it } from 'vitest'
import {
  ACTIONS, bindCommand, createBrain, decide, emptySenses, hearWord, markChoice,
  meaningOf, perceive, associate, reinforce, snapshot, wordBias, wordStrength,
  saveBrain, loadBrain, type Action,
} from './brain'
import { mulberry32 } from './rng'

const allowAll = (): boolean => true

function scoreOf(brain: ReturnType<typeof createBrain>, action: Action): number {
  return brain.decision[ACTIONS.indexOf(action)]
}

describe('perception and the concept lobe', () => {
  it('lights only a few concepts, so a situation is legible', () => {
    const brain = createBrain(mulberry32(1))
    const senses = emptySenses()
    senses.hunger = 0.9
    senses.food = 0.7
    perceive(brain, senses)

    const lit = [...brain.concept].filter((v) => v > 0)
    expect(lit.length).toBeGreaterThan(0)
    expect(lit.length).toBeLessThanOrEqual(4)
    // the winners are normalised into a distribution
    const total = [...brain.concept].reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 5)
  })

  it('gives different situations different concepts', () => {
    const brain = createBrain(mulberry32(7))
    const hungry = emptySenses()
    hungry.hunger = 1
    perceive(brain, hungry)
    const a = [...brain.concept]

    const afraid = emptySenses()
    afraid.fear = 1
    afraid.player = 1
    perceive(brain, afraid)
    const b = [...brain.concept]

    const overlap = a.reduce((sum, v, i) => sum + Math.min(v, b[i]), 0)
    expect(overlap).toBeLessThan(0.75)
  })

  it('keeps Hebbian weights bounded however long it runs', () => {
    const brain = createBrain(mulberry32(3))
    const senses = emptySenses()
    senses.hunger = 1
    senses.food = 1
    for (let i = 0; i < 4000; i++) {
      perceive(brain, senses)
      associate(brain)
    }
    for (const w of brain.wConcept) expect(Math.abs(w)).toBeLessThan(3.001)
  })
})

describe('instincts', () => {
  it('makes a newborn reach for food when hungry rather than act at random', () => {
    const brain = createBrain(mulberry32(11))
    const senses = emptySenses()
    senses.hunger = 0.95
    perceive(brain, senses)
    decide(brain, allowAll, mulberry32(2))
    expect(scoreOf(brain, 'eat')).toBeGreaterThan(scoreOf(brain, 'sleep'))
  })

  it('makes fear push towards running', () => {
    const brain = createBrain(mulberry32(12))
    const senses = emptySenses()
    senses.fear = 0.95
    perceive(brain, senses)
    decide(brain, allowAll, mulberry32(2))
    expect(scoreOf(brain, 'flee')).toBeGreaterThan(scoreOf(brain, 'play'))
  })
})

describe('reinforcement', () => {
  it('learns to prefer whatever was rewarded in a state', () => {
    const brain = createBrain(mulberry32(21))
    const senses = emptySenses()
    senses.toy = 1
    senses.boredom = 0.5

    const before = (): number => {
      perceive(brain, senses)
      decide(brain, allowAll, mulberry32(5))
      return scoreOf(brain, 'play') - scoreOf(brain, 'wander')
    }
    const gapBefore = before()

    for (let i = 0; i < 30; i++) {
      perceive(brain, senses)
      markChoice(brain, 'play')
      reinforce(brain, 1)
    }

    const gapAfter = before()
    expect(gapAfter).toBeGreaterThan(gapBefore + 0.5)
  })

  it('learns to avoid whatever was punished', () => {
    const brain = createBrain(mulberry32(22))
    const senses = emptySenses()
    senses.player = 1
    senses.playerClose = 1

    perceive(brain, senses)
    decide(brain, allowAll, mulberry32(5))
    const before = scoreOf(brain, 'approach')

    for (let i = 0; i < 30; i++) {
      perceive(brain, senses)
      markChoice(brain, 'approach')
      reinforce(brain, -1)
    }

    perceive(brain, senses)
    decide(brain, allowAll, mulberry32(5))
    expect(scoreOf(brain, 'approach')).toBeLessThan(before - 0.5)
  })

  it('pays a delayed reward into the action that earned it', () => {
    // the trace has to survive the gap between eating and hunger falling
    const brain = createBrain(mulberry32(23))
    const senses = emptySenses()
    senses.hunger = 0.8
    senses.food = 1

    perceive(brain, senses)
    decide(brain, allowAll, mulberry32(1))
    const before = scoreOf(brain, 'eat')

    perceive(brain, senses)
    markChoice(brain, 'eat')
    // two ticks pass with no reward at all, then the reward lands
    reinforce(brain, 0)
    reinforce(brain, 0)
    reinforce(brain, 1)

    perceive(brain, senses)
    decide(brain, allowAll, mulberry32(1))
    expect(scoreOf(brain, 'eat')).toBeGreaterThan(before)
  })

  it('never lets a weight run away', () => {
    const brain = createBrain(mulberry32(24))
    const senses = emptySenses()
    senses.hunger = 1
    for (let i = 0; i < 2000; i++) {
      perceive(brain, senses)
      markChoice(brain, 'eat')
      reinforce(brain, 1)
    }
    for (const w of brain.wAction) expect(Math.abs(w)).toBeLessThanOrEqual(3.001)
  })
})

describe('choosing', () => {
  it('never chooses something it is not allowed to do', () => {
    const brain = createBrain(mulberry32(31))
    const senses = emptySenses()
    senses.hunger = 1
    const rand = mulberry32(9)
    for (let i = 0; i < 200; i++) {
      perceive(brain, senses)
      const { action } = decide(brain, (a) => a === 'wander' || a === 'rest', rand)
      expect(['wander', 'rest']).toContain(action)
    }
  })

  it('settles down as it matures', () => {
    const young = createBrain(mulberry32(32))
    const old = createBrain(mulberry32(32))
    old.maturity = 1
    const senses = emptySenses()
    senses.hunger = 1

    const spread = (brain: ReturnType<typeof createBrain>): number => {
      const counts = new Map<string, number>()
      const rand = mulberry32(4)
      for (let i = 0; i < 300; i++) {
        perceive(brain, senses)
        const { action } = decide(brain, allowAll, rand)
        counts.set(action, (counts.get(action) ?? 0) + 1)
      }
      return counts.size
    }

    expect(spread(old)).toBeLessThanOrEqual(spread(young))
  })
})

describe('words', () => {
  it('binds a word to whatever the mind was doing when it was heard', () => {
    const brain = createBrain(mulberry32(41))
    const senses = emptySenses()
    senses.food = 1
    senses.hunger = 0.8
    perceive(brain, senses)
    hearWord(brain, 'nom')

    expect(wordStrength(brain, 'nom')).toBeGreaterThan(0)
    expect(wordStrength(brain, 'never-said')).toBe(0)
  })

  it('lets a taught word push behaviour', () => {
    const brain = createBrain(mulberry32(42))
    bindCommand(brain, 'come', 'approach', 1.5)
    const bias = wordBias(brain, ['come'])
    expect(bias).not.toBeNull()
    expect(bias![ACTIONS.indexOf('approach')]).toBeGreaterThan(1)
    expect(meaningOf(brain, 'come')).toBe('come to you')
  })

  it('reports an unknown word as meaning nothing', () => {
    const brain = createBrain(mulberry32(43))
    expect(meaningOf(brain, 'zzz')).toBe('nothing yet')
  })

  it('reads a word back as whatever it was actually taught, not what it is spelled', () => {
    const brain = createBrain(mulberry32(44))
    bindCommand(brain, 'food', 'sleep', 1.5)
    expect(meaningOf(brain, 'food')).toBe('sleep')
  })
})

describe('the readout', () => {
  it('describes the brain without changing it', () => {
    const brain = createBrain(mulberry32(51))
    const senses = emptySenses()
    senses.hunger = 0.7
    perceive(brain, senses)
    decide(brain, allowAll, mulberry32(1))
    const before = Array.from(brain.wAction)

    const shot = snapshot(brain, allowAll)
    expect(shot.perception.length).toBeGreaterThan(8)
    expect(shot.decision.length).toBe(ACTIONS.length)
    expect(shot.concept.length).toBe(16)
    expect(Array.from(brain.wAction)).toEqual(before)
  })
})

describe('persistence', () => {
  it('round-trips a trained brain', () => {
    const brain = createBrain(mulberry32(61))
    const senses = emptySenses()
    senses.toy = 1
    for (let i = 0; i < 25; i++) {
      perceive(brain, senses)
      markChoice(brain, 'play')
      reinforce(brain, 1)
    }
    hearWord(brain, 'ball')
    bindCommand(brain, 'ball', 'play', 1)

    const restored = loadBrain(saveBrain(brain), mulberry32(61))
    perceive(brain, senses)
    perceive(restored, senses)
    for (let i = 0; i < brain.concept.length; i++) {
      expect(restored.concept[i]).toBeCloseTo(brain.concept[i], 3)
    }
    expect(meaningOf(restored, 'ball')).toBe(meaningOf(brain, 'ball'))
    expect(restored.maturity).toBeCloseTo(brain.maturity, 5)
  })
})
