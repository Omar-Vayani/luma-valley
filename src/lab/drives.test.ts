import { describe, expect, it } from 'vitest'
import { createDrives, tickDrives, applySocialFeedback, driveTitles } from './drives'
import { createChem } from './chem'

describe('drives — human tendencies for NPC AI', () => {
  it('every creature has the full set of drives', () => {
    const d = createDrives()
    for (const key of ['importance', 'approval', 'ego', 'tribalism', 'conformity', 'reciprocity', 'lossAversion', 'greed', 'curiosity', 'legacy'] as const) {
      expect(typeof d[key]).toBe('number')
    }
  })

  it('drives drift toward the creature personality (genes + needs)', () => {
    const chem = createChem()
    const d = createDrives()
    d.importance = 0.2
    d.approval = 0.2
    d.ego = 0.2
    tickDrives(d, chem, { aggression: 0.9, sociability: 0.3, greed: 0.8, curiosity: 0.9 } as never)
    // aggressive, greedy, curious → those drives rise
    expect(d.greed).toBeGreaterThan(0.2)
    expect(d.curiosity).toBeGreaterThan(0.2)
    expect(d.importance).toBeGreaterThan(0.2)
  })

  it('praise raises approval and legacy; shame hurts ego', () => {
    const d = createDrives()
    d.approval = 0.3
    d.ego = 0.5
    applySocialFeedback(d, 'praise')
    expect(d.approval).toBeGreaterThan(0.3)
    expect(d.ego).toBeGreaterThan(0.5)
    applySocialFeedback(d, 'shame')
    expect(d.ego).toBeLessThan(0.6)
  })

  it('drive titles explain them for the UI', () => {
    expect(driveTitles.legacy).toContain('lasting')
    expect(driveTitles.tribalism).toContain('gang')
  })
})
