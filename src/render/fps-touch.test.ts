// Regression tests for the mobile touch control contract:
// invisible split mode (left = movement pad, right = look), classic fallback,
// and the preserved non-inverted look sign. Pure helpers live in ./fps.
import { describe, expect, it } from 'vitest'
import {
  TOUCH_MOVE_RADIUS,
  applyTouchLook,
  lookDeltas,
  touchMoveFromOrigin,
  touchZoneAt,
} from './fps'

describe('touch zone split', () => {
  it('split mode: left half is movement, right half is look', () => {
    expect(touchZoneAt(0, 390, 'split')).toBe('move')
    expect(touchZoneAt(194, 390, 'split')).toBe('move')
    expect(touchZoneAt(195, 390, 'split')).toBe('look')
    expect(touchZoneAt(389, 390, 'split')).toBe('look')
  })

  it('classic mode: the whole screen is look (the visible joystick owns movement)', () => {
    expect(touchZoneAt(0, 390, 'classic')).toBe('look')
    expect(touchZoneAt(200, 390, 'classic')).toBe('look')
    expect(touchZoneAt(389, 390, 'classic')).toBe('look')
  })
})

describe('touch movement from touch-origin displacement', () => {
  it('returns zero when the finger has not moved', () => {
    expect(touchMoveFromOrigin({ x: 50, y: 50 }, { x: 50, y: 50 })).toEqual({ fwd: 0, side: 0 })
  })

  it('deadzones small displacements so micro-jitter never starts movement', () => {
    const v = touchMoveFromOrigin({ x: 50, y: 50 }, { x: 55, y: 50 })
    expect(v.fwd).toBe(0)
    expect(v.side).toBe(0)
  })

  it('maps drag up to forward and drag down to backward', () => {
    const up = touchMoveFromOrigin({ x: 50, y: 100 }, { x: 50, y: 40 })
    expect(up.fwd).toBeGreaterThan(0)
    expect(up.side).toBe(0)
    const down = touchMoveFromOrigin({ x: 50, y: 40 }, { x: 50, y: 100 })
    expect(down.fwd).toBeLessThan(0)
  })

  it('maps drag right to strafe right and drag left to strafe left', () => {
    const right = touchMoveFromOrigin({ x: 50, y: 50 }, { x: 100, y: 50 })
    expect(right.side).toBeGreaterThan(0)
    expect(right.fwd).toBe(0)
    const left = touchMoveFromOrigin({ x: 100, y: 50 }, { x: 50, y: 50 })
    expect(left.side).toBeLessThan(0)
  })

  it('clamps displacement beyond the radius to full speed (unit magnitude)', () => {
    const far = touchMoveFromOrigin({ x: 50, y: 50 }, { x: 50, y: 50 - TOUCH_MOVE_RADIUS * 4 })
    expect(far.fwd).toBeCloseTo(1, 5)
    expect(Math.abs(far.fwd)).toBeLessThanOrEqual(1)
    expect(Math.abs(far.side)).toBeLessThanOrEqual(1)
  })

  it('deadzones per axis so a mostly-vertical drag does not strafe', () => {
    // dy = -30 (forward), dx = 6 — side magnitude stays below the deadzone
    const v = touchMoveFromOrigin({ x: 50, y: 50 }, { x: 56, y: 20 })
    expect(v.fwd).toBeGreaterThan(0)
    expect(v.side).toBe(0)
  })
})

describe('look sign contract', () => {
  it('applyLook stays non-inverted: slide right → yaw+, slide up → pitch+', () => {
    expect(lookDeltas(10, 0).yaw).toBeGreaterThan(0)
    expect(lookDeltas(-10, 0).yaw).toBeLessThan(0)
    expect(lookDeltas(0, -10).pitch).toBeGreaterThan(0)
    expect(lookDeltas(0, 10).pitch).toBeLessThan(0)
  })

  it('touch look preserves the verified direct-manipulation sign', () => {
    // dragging right pans the world right (camera yaw decreases)
    expect(applyTouchLook(10, 0).dx).toBeLessThan(0)
    // dragging up looks up
    expect(applyTouchLook(0, -10).dy).toBeLessThan(0)
    // composition: drag right still rotates yaw exactly as the shipped controls do
    const d = applyTouchLook(10, 0)
    expect(lookDeltas(d.dx, d.dy).yaw).toBeLessThan(0)
  })
})
