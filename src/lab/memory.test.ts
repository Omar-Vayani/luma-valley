import { describe, expect, it } from 'vitest'
import { createMemory, remember, learnFact, knowsFact, hasVendetta, addVendetta, preferPlace, placePreference } from './memory'

describe('memory — learning and vendettas', () => {
  it('starts empty', () => {
    const m = createMemory()
    expect(m.episodes.length).toBe(0)
    expect(Object.keys(m.facts).length).toBe(0)
  })

  it('remembers episodes up to a cap', () => {
    const m = createMemory()
    for (let i = 0; i < 20; i++) remember(m, 'saw', i, 1, 1, i)
    expect(m.episodes.length).toBeLessThanOrEqual(12)
    expect(m.episodes[0].valence).toBe(1)
  })

  it('learns facts and recalls them', () => {
    const m = createMemory()
    learnFact(m, 'bankIsSafe', 1)
    expect(knowsFact(m, 'bankIsSafe')).toBe(true)
    expect(knowsFact(m, 'someoneStoleFromMe')).toBe(false)
  })

  it('tracks vendettas after being robbed', () => {
    const m = createMemory()
    addVendetta(m, 7)
    expect(hasVendetta(m, 7)).toBe(true)
    expect(hasVendetta(m, 8)).toBe(false)
  })

  it('learns place preferences from experiences', () => {
    const m = createMemory()
    preferPlace(m, 'food', 1)
    preferPlace(m, 'food', 1)
    expect(placePreference(m, 'food')).toBeGreaterThan(0.5)
    expect(placePreference(m, 'bank')).toBe(0)
  })
})
