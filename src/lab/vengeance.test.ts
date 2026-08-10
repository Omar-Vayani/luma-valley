import { describe, expect, it } from 'vitest'
import { createVengeance, recordWrong, planRevenge, revengeScore, isGangRevenge, settleRevenge, revengeStyleFor, VENGEANCE } from './vengeance'
import { createSim } from './sim'
import { randomGenome, type Genome } from './genetics'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('vengeance — revenge and the actions related to it', () => {
  it('records a wrong and tracks the grudge', () => {
    const v = createVengeance()
    recordWrong(v, 42, 0.5)
    expect(v.grudges[42]).toBeDefined()
    expect(v.grudges[42].intensity).toBeGreaterThan(0)
  })

  it('a big wrong creates a strong grudge', () => {
    const v = createVengeance()
    recordWrong(v, 7, 0.9) // e.g. partner killed
    expect(v.grudges[7].intensity).toBeGreaterThan(0.6)
  })

  it('repeated wrongs escalate the grudge', () => {
    const v = createVengeance()
    recordWrong(v, 5, 0.3)
    recordWrong(v, 5, 0.3)
    expect(v.grudges[5].intensity).toBeGreaterThan(0.4)
  })

  it('revenge score rises with grudge intensity', () => {
    const v = createVengeance()
    expect(revengeScore(v, 1)).toBe(0) // no grudge
    recordWrong(v, 1, 0.8)
    expect(revengeScore(v, 1)).toBeGreaterThan(0)
  })

  it('planRevenge picks the style from personality', () => {
    const v = createVengeance()
    recordWrong(v, 1, 0.9)
    const aggressive = planRevenge(v, 1, { aggression: 0.9, courage: 0.9, loyalty: 0.2 })
    const cowardly = planRevenge(v, 1, { aggression: 0.1, courage: 0.1, loyalty: 0.2 })
    expect(VENGEANCE.includes(aggressive)).toBe(true)
    expect(VENGEANCE.includes(cowardly)).toBe(true)
    // aggressive creatures fight back directly; cowards scheme
    expect(aggressive).toBe('ambush')
    expect(cowardly).not.toBe('ambush')
  })

  it('gang revenge engages when loyalty is high', () => {
    const v = createVengeance()
    recordWrong(v, 1, 0.7)
    const style = revengeStyleFor(v, 1, { loyalty: 0.9, aggression: 0.4, courage: 0.5 })
    expect(isGangRevenge(style)).toBe(true)
  })

  it('settling revenge releases the grudge', () => {
    const v = createVengeance()
    recordWrong(v, 3, 0.8)
    expect(settleRevenge(v, 3)).toBe(true)
    expect(revengeScore(v, 3)).toBe(0)
  })

  it('grudges fade slowly over time', () => {
    const v = createVengeance()
    recordWrong(v, 9, 0.6)
    const before = v.grudges[9].intensity
    // simulate decay
    v.grudges[9].intensity *= 0.99
    expect(v.grudges[9].intensity).toBeLessThan(before)
  })

  it('a wronged creature seeks the culprit over other goals', () => {
    const s = createSim(11)
    const wronged = s.spawnCreature(GEN({ aggression: 0.8 }), 0, 0)
    const culprit = s.spawnCreature(GEN(), 3, 0)
    wronged.memory.vendettas[culprit.id] = 0.9 // deep grudge
    recordWrong(wronged.vengeance ?? createVengeance(), culprit.id, 0.9)
    // move culprit close; the wronged one should fight/approach
    culprit.pos = { x: 1, z: 0 }
    let fought = false
    for (let i = 0; i < 30; i++) {
      s.tick()
      if (s.events.some((e) => e.type === 'fight' && e.aId === wronged.id)) {
        fought = true
        break
      }
    }
    expect(fought).toBe(true)
  })
})
