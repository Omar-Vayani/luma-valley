import { describe, expect, it } from 'vitest'
import { SoundGate, falloffAt } from './audio'

/**
 * The complaints these tests exist for, in the player's words: "I keep hearing
 * a sound effect repeatedly without stop", and "give me a radius on how far I
 * can listen".
 */

describe('how far a sound carries', () => {
  it('is silent past the range', () => {
    expect(falloffAt(22, 22)).toBe(0)
    expect(falloffAt(60, 22)).toBe(0)
  })

  it('is loudest underfoot and fades with distance', () => {
    expect(falloffAt(0, 22)).toBeCloseTo(1, 5)
    expect(falloffAt(1, 22)).toBeCloseTo(1, 5)
    const near = falloffAt(5, 22)
    const mid = falloffAt(12, 22)
    const far = falloffAt(20, 22)
    expect(near).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(far)
    expect(far).toBeGreaterThan(0)
  })

  it('follows the range the player sets', () => {
    // the same sound, at the same distance, is quieter with a tighter range
    expect(falloffAt(15, 40)).toBeGreaterThan(falloffAt(15, 20))
    expect(falloffAt(15, 10)).toBe(0)
  })
})

describe('how often a sound may repeat', () => {
  it('refuses the same sound from the same source inside its cooldown', () => {
    const gate = new SoundGate()
    const cooldown = gate.cooldownOf('afraid')
    expect(cooldown).toBeGreaterThan(0)

    expect(gate.allow('afraid', 3, 0)).toBe(true)
    expect(gate.allow('afraid', 3, cooldown * 0.5)).toBe(false)
    expect(gate.allow('afraid', 3, cooldown * 0.99)).toBe(false)
    expect(gate.allow('afraid', 3, cooldown + 0.01)).toBe(true)
  })

  it('counts each creature separately', () => {
    const gate = new SoundGate()
    expect(gate.allow('hurt', 1, 0)).toBe(true)
    expect(gate.allow('hurt', 2, 0)).toBe(true)
    expect(gate.allow('hurt', 1, 0)).toBe(false)
  })

  it('counts each kind of sound separately', () => {
    const gate = new SoundGate()
    expect(gate.allow('hurt', 1, 0)).toBe(true)
    expect(gate.allow('eat', 1, 0)).toBe(true)
    expect(gate.allow('hurt', 1, 0)).toBe(false)
  })

  it('cannot be made to machine-gun by asking very fast', () => {
    // this is the actual bug: a creature emitting an event every tick
    const gate = new SoundGate()
    let played = 0
    for (let tick = 0; tick < 1200; tick++) {
      // twelve ticks a second for a hundred seconds
      if (gate.allow('afraid', 7, tick / 12)) played++
    }
    const expected = 100 / gate.cooldownOf('afraid')
    expect(played).toBeLessThanOrEqual(Math.ceil(expected) + 1)
    expect(played).toBeGreaterThan(0)
  })

  it('keeps footsteps responsive while still bounding them', () => {
    const gate = new SoundGate()
    expect(gate.cooldownOf('step')).toBeLessThan(0.3)
  })
})
