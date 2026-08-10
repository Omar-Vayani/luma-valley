import { describe, expect, it } from 'vitest'
import { createWant, wantForState, wantProgress, fulfillWant, tickWant, wantExpired, refreshWant, WANT_TYPES } from './wants'

describe('wants — Sims-style goals that make creatures expressive', () => {
  it('a creature always has a want derived from its own state', () => {
    const w = createWant('food')
    expect(WANT_TYPES).toContain(w.type)
  })

  it('a hungry creature wants food; a bored one wants play', () => {
    const hungry = wantForState({ hunger: 0.1, energy: 0.8, social: 0.7, pleasure: 0.6 })
    const bored = wantForState({ hunger: 0.9, energy: 0.9, social: 0.8, pleasure: 0.2 })
    expect(hungry).toBe('food')
    expect(bored).toBe('play')
  })

  it('fulfilling a want gives a happiness boost and resets', () => {
    const w = createWant('food')
    w.progress = 0.4
    fulfillWant(w, 0.3) // step toward the want, not complete
    expect(w.progress).toBeGreaterThan(0.4)
    expect(w.fulfilled).toBe(false)
    // complete it
    w.progress = 0.9
    fulfillWant(w, 0.2)
    expect(w.fulfilled).toBe(true)
  })

  it('wants expire over time and are replaced', () => {
    const w = createWant('food')
    for (let i = 0; i < 700; i++) tickWant(w)
    expect(wantExpired(w)).toBe(true)
    const s = { hunger: 0.5, energy: 0.5, social: 0.5, pleasure: 0.5 }
    const next = refreshWant(w, s)
    expect(next.type).toBeDefined()
    expect(next.age).toBe(0)
  })

  it('doing the matching action advances the want', () => {
    const w = createWant('food')
    wantProgress(w, 'eat')
    expect(w.progress).toBe(0.25)
    wantProgress(w, 'wander')
    expect(w.progress).toBe(0.25)
  })
})
