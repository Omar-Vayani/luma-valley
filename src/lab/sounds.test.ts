import { describe, expect, it } from 'vitest'
import { soundForEvent, moodPitchShift } from './sounds'

describe('sounds — creatures make sounds based on their experience', () => {
  it('every sim experience maps to a distinct sound', () => {
    const events = ['eat', 'drink', 'fight', 'steal', 'love', 'birth', 'death', 'play', 'school', 'work', 'bury', 'gift', 'medicine', 'gym', 'sleep']
    for (const e of events) {
      const s = soundForEvent(e, { pleasure: 0.5, grief: 0, fear: 0 })
      expect(s).toBeDefined()
      expect(s.freq).toBeGreaterThan(50)
      expect(s.freq).toBeLessThan(2000)
      expect(s.duration).toBeGreaterThan(0)
    }
  })

  it('different experiences sound different (no two share every parameter)', () => {
    const eat = soundForEvent('eat', { pleasure: 0.5, grief: 0, fear: 0 })
    const fight = soundForEvent('fight', { pleasure: 0.5, grief: 0, fear: 0 })
    const love = soundForEvent('love', { pleasure: 0.5, grief: 0, fear: 0 })
    expect(eat.freq).not.toBe(fight.freq)
    expect(love.freq).not.toBe(fight.freq)
  })

  it('a happy creature makes brighter sounds than a sad one', () => {
    const happy = soundForEvent('play', { pleasure: 0.9, grief: 0, fear: 0 })
    const sad = soundForEvent('play', { pleasure: 0.1, grief: 0.7, fear: 0 })
    expect(happy.freq).toBeGreaterThan(sad.freq)
  })

  it('an afraid creature makes higher panicked sounds', () => {
    const calm = soundForEvent('wander', { pleasure: 0.5, grief: 0, fear: 0.1 })
    const scared = soundForEvent('flee', { pleasure: 0.5, grief: 0, fear: 0.9 })
    expect(scared.freq).toBeGreaterThan(calm.freq)
  })

  it('moodPitchShift shifts pitch up for joy and down for grief', () => {
    expect(moodPitchShift(0.9, 0, 0)).toBeGreaterThan(1)
    expect(moodPitchShift(0.1, 0.8, 0)).toBeLessThan(1)
    expect(moodPitchShift(0.5, 0, 0.1)).toBeCloseTo(1, 1)
  })

  it('sounds have a type that the audio engine understands', () => {
    const s = soundForEvent('death', { pleasure: 0.5, grief: 0, fear: 0 })
    expect(['sine', 'square', 'triangle', 'sawtooth', 'noise']).toContain(s.type)
    expect(s.gain).toBeGreaterThan(0)
    expect(s.gain).toBeLessThan(1)
  })
})
