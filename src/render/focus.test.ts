import { describe, expect, it } from 'vitest'
import { pickFocusTarget, type FocusCandidate } from './focus'

const candidates: FocusCandidate[] = [
  { kind: 'creature', id: 1, name: 'Lumi', x: 2.4, z: 2.5 },
  { kind: 'creature', id: 2, name: 'Moss', x: -3, z: 1 },
  { kind: 'place', id: 'market', name: 'Market', x: 0, z: 7 },
]

describe('proximity interaction focus', () => {
  it('focuses a nearby creature in a forgiving forward cone', () => {
    expect(pickFocusTarget({ x: 0, z: 0 }, { x: 0, z: 1 }, candidates)?.id).toBe(1)
  })

  it('falls back to an adjacent creature without precise aim', () => {
    expect(pickFocusTarget({ x: -1, z: 1 }, { x: -1, z: 0 }, candidates)?.id).toBe(2)
  })

  it('does not target distant or rear objects', () => {
    expect(pickFocusTarget({ x: 20, z: 20 }, { x: 0, z: 1 }, candidates)).toBeNull()
  })

  it('preserves precise desktop aim as the highest priority', () => {
    expect(pickFocusTarget({ x: 0, z: 0 }, { x: 0, z: 1 }, candidates, candidates[1])?.id).toBe(2)
  })
})
