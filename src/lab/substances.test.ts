import { describe, expect, it } from 'vitest'
import { doseSubstance, tickSubstances, SUBSTANCES } from './substances'
import { createChem } from './chem'

describe('substances — more than booze', () => {
  it('offers several addictive substances (herb, spark, brew, tonic)', () => {
    const ids = SUBSTANCES.map((s) => s.id)
    expect(ids).toContain('brew') // renamed booze
    expect(ids).toContain('herb') // renamed weed
    expect(ids).toContain('spark') // renamed crack
    expect(ids).toContain('tonic') // stimulant medicine-like
    expect(ids.length).toBeGreaterThanOrEqual(4)
  })

  it('dosing builds per-substance addiction', () => {
    const chem = createChem()
    doseSubstance(chem, 'herb', 0.9)
    expect(chem.addiction.herb ?? 0).toBeGreaterThan(0)
    expect(chem.addiction.spark ?? 0).toBe(0)
  })

  it('herb soothes (lowers fear, raises pleasure, mellow) but dulls', () => {
    const chem = createChem()
    chem.fear = 0.6
    chem.pleasure = 0.2
    chem.social = 0.9
    doseSubstance(chem, 'herb', 0.9, 1)
    expect(chem.fear).toBeLessThan(0.6)
    expect(chem.pleasure).toBeGreaterThan(0.3)
    expect(chem.social).toBeLessThan(0.9) // mellow, less social
  })

  it('spark is intense: big pleasure spike then harsh comedown/withdrawal', () => {
    const chem = createChem()
    doseSubstance(chem, 'spark', 0.9, 1)
    expect(chem.pleasure).toBeGreaterThan(0.8) // huge rush
    expect(chem.energy).toBeGreaterThan(0.8) // wired
    // after time passes the crash hits
    for (let i = 2; i < 200; i++) tickSubstances(chem, i)
    expect(chem.pleasure).toBeLessThan(0.8)
    expect(chem.fear).toBeGreaterThan(0.1) // comedown anxiety
  })

  it('withdrawal hurts the addicted creature when deprived', () => {
    const chem = createChem()
    // repeated dosing builds real dependence
    for (let i = 1; i <= 6; i++) doseSubstance(chem, 'brew', 0.95, i)
    // deprive for a long stretch
    for (let i = 7; i < 260; i++) tickSubstances(chem, i)
    expect(chem.health).toBeLessThan(1)
    expect(chem.fear).toBeGreaterThan(0.2) // craving panic
  })

  it('tonic is a performance boost that builds dependence', () => {
    const chem = createChem()
    doseSubstance(chem, 'tonic', 0.9)
    expect(chem.energy).toBeGreaterThan(0.8)
    // dependence builds with repeated use
    doseSubstance(chem, 'tonic', 0.9)
    doseSubstance(chem, 'tonic', 0.9)
    expect(chem.addiction.tonic ?? 0).toBeGreaterThan(0.3)
  })
})
