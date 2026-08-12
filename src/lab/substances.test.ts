import { describe, expect, it } from 'vitest'
import {
  SUBSTANCES, addictionLevel, disapprovalOf, doseSubstance, impairmentOf,
  isSubstance, substanceDef, tickSubstances, toleranceLevel, worstHabit,
} from './substances'
import { createChem } from './chem'

/** Let time pass without anybody taking anything. */
function abstain(chem: ReturnType<typeof createChem>, from: number, ticks: number): void {
  for (let i = 0; i < ticks; i++) tickSubstances(chem, from + i)
}

describe('substances — four habits with different shapes', () => {
  it('offers drink, a smoked leaf, a hard stimulant and a bought focus', () => {
    const ids = SUBSTANCES.map((s) => s.id)
    expect(ids).toEqual(['brew', 'herb', 'spark', 'tonic'])
    expect(isSubstance('brew')).toBe(true)
    expect(isSubstance('bread')).toBe(false)
    expect(substanceDef('spark')?.name).toBe('sparkdust')
  })

  it('the settlement minds them by very different amounts', () => {
    expect(disapprovalOf('spark')).toBeGreaterThan(disapprovalOf('herb'))
    expect(disapprovalOf('herb')).toBeGreaterThan(disapprovalOf('brew'))
  })

  it('dosing builds dependence on that one thing and nothing else', () => {
    const chem = createChem()
    doseSubstance(chem, 'herb', 0.9)
    expect(addictionLevel(chem, 'herb')).toBeGreaterThan(0)
    expect(addictionLevel(chem, 'spark')).toBe(0)
  })

  it('herb soothes and isolates', () => {
    const chem = createChem()
    chem.fear = 0.6
    chem.pleasure = 0.2
    chem.social = 0.9
    doseSubstance(chem, 'herb', 0.9, 1)
    expect(chem.fear).toBeLessThan(0.6)
    expect(chem.pleasure).toBeGreaterThan(0.3)
    expect(chem.social).toBeLessThan(0.9)
  })

  it('spark is a rush that costs health, and a comedown that arrives', () => {
    const chem = createChem()
    doseSubstance(chem, 'spark', 0.9, 1)
    expect(chem.pleasure).toBeGreaterThan(0.8)
    expect(chem.energy).toBeGreaterThan(0.8)
    expect(chem.health).toBeLessThan(1)

    // dependence first, then a long dry spell
    for (let i = 2; i < 8; i++) doseSubstance(chem, 'spark', 0.9, i)
    const health = chem.health
    chem.fear = 0
    chem.pleasure = 1
    abstain(chem, 10, 900)
    expect(chem.fear, 'no craving').toBeGreaterThan(0.1)
    expect(chem.pleasure).toBeLessThan(1)
    expect(chem.health).toBeLessThan(health)
  })

  it('tolerance: the same dose does less each time', () => {
    const first = createChem()
    first.pleasure = 0
    doseSubstance(first, 'brew', 0.5, 1)
    const firstLift = first.pleasure

    const jaded = createChem()
    for (let i = 1; i <= 25; i++) doseSubstance(jaded, 'brew', 0.9, i)
    jaded.pleasure = 0
    doseSubstance(jaded, 'brew', 0.9, 26)

    expect(toleranceLevel(jaded, 'brew')).toBeGreaterThan(0.3)
    expect(jaded.pleasure).toBeLessThan(firstLift * 0.85)
  })

  it('but the damage does not get the same discount', () => {
    const jaded = createChem()
    for (let i = 1; i <= 25; i++) doseSubstance(jaded, 'spark', 0.9, i)
    expect(jaded.health).toBeLessThan(0.6)
  })

  it('withdrawal bites when a dependent creature is deprived', () => {
    const chem = createChem()
    for (let i = 1; i <= 8; i++) doseSubstance(chem, 'brew', 0.95, i)
    chem.fear = 0
    abstain(chem, 10, 1400)
    expect(chem.health).toBeLessThan(1)
    expect(chem.fear).toBeGreaterThan(0.2)
  })

  it('and reports what is being craved, so the settlement can notice', () => {
    const chem = createChem()
    for (let i = 1; i <= 8; i++) doseSubstance(chem, 'spark', 0.95, i)
    let craving = { id: null as string | null, severity: 0 }
    for (let i = 0; i < 900; i++) {
      const state = tickSubstances(chem, 10 + i)
      if (state.severity > craving.severity) craving = state
    }
    expect(craving.id).toBe('spark')
    expect(craving.severity).toBeGreaterThan(0)
  })

  it('dependence fades while abstinent, and tolerance outlasts it', () => {
    const chem = createChem()
    for (let i = 1; i <= 20; i++) doseSubstance(chem, 'brew', 0.9, i)
    const dependence = addictionLevel(chem, 'brew')
    const tolerance = toleranceLevel(chem, 'brew')
    abstain(chem, 25, 4000)
    const dependenceLost = dependence - addictionLevel(chem, 'brew')
    const toleranceLost = tolerance - toleranceLevel(chem, 'brew')
    expect(dependenceLost).toBeGreaterThan(0)
    expect(toleranceLost).toBeGreaterThan(0)
    // the body forgets the craving faster than it forgets the dose, which is
    // what makes going back to it land so hard
    expect(dependenceLost).toBeGreaterThan(toleranceLost)
  })

  it('names the worst habit somebody has', () => {
    const chem = createChem()
    expect(worstHabit(chem)).toBeNull()
    for (let i = 1; i <= 6; i++) doseSubstance(chem, 'brew', 0.9, i)
    for (let i = 7; i <= 10; i++) doseSubstance(chem, 'spark', 0.9, i)
    expect(worstHabit(chem)?.id).toBe('spark')
  })

  it('being intoxicated slows you down and makes you reckless', () => {
    const chem = createChem()
    expect(impairmentOf(chem).slowness).toBe(0)
    doseSubstance(chem, 'brew', 0.5, 1)
    doseSubstance(chem, 'brew', 0.5, 2)
    const drunk = impairmentOf(chem)
    expect(drunk.slowness).toBeGreaterThan(0.1)
    expect(drunk.recklessness).toBeGreaterThan(0.2)
    expect(drunk.sociability).toBeGreaterThan(0.1)
  })

  it('and it wears off', () => {
    const chem = createChem()
    doseSubstance(chem, 'brew', 0.5, 1)
    const drunk = chem.intoxication
    abstain(chem, 2, 200)
    expect(chem.intoxication).toBeLessThan(drunk)
  })

  it('tonic is a working day borrowed from tomorrow', () => {
    const chem = createChem()
    doseSubstance(chem, 'tonic', 0.9)
    expect(chem.energy).toBeGreaterThan(0.8)
    for (let i = 0; i < 4; i++) doseSubstance(chem, 'tonic', 0.9, i)
    expect(addictionLevel(chem, 'tonic')).toBeGreaterThan(0.3)
    expect(chem.health).toBeLessThan(1)
  })
})
