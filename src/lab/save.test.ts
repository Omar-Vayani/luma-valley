import { describe, expect, it } from 'vitest'
import { createSim } from './sim'
import { randomGenome, type Genome } from './genetics'
import { saveSim, loadSim, SAVE_VERSION } from './save'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

const populated = () => {
  const s = createSim(7)
  s.spawnCreature(GEN({ aggression: 0.8, theft: 0.9, addictionProne: 0.9 }), -4, 0)
  s.spawnCreature(GEN({ sociability: 0.9 }), 2, 3)
  s.spawnCreature(GEN({ lovePropensity: 0.9 }), -9, 8)
  // give one creature deep state
  const a = s.creatures[0]
  a.wallet = 12
  a.banked = 30
  a.weapon = 'stick'
  a.gangId = 1
  a.chem.addiction.drink = 0.6
  a.memory.vendettas[2] = 0.9
  a.memory.facts.bankIsSafe = 1
  for (let i = 0; i < 20; i++) s.tick()
  return s
}

describe('save — deep state round-trip', () => {
  it('saves with the current version and plain JSON', () => {
    const s = populated()
    const data = saveSim(s)
    expect(data.version).toBe(SAVE_VERSION)
    expect(JSON.parse(JSON.stringify(data))).toEqual(data)
  })

  it('round-trips creatures, wallets, memories, and time', () => {
    const s = populated()
    s.creatures[0].memory.vendettas[2] = 0.9 // set after decay ticks
    const data = saveSim(s)
    const s2 = loadSim(data)
    expect(s2.creatures.length).toBe(s.creatures.length)
    const a1 = s.creatures[0]
    const a2 = s2.creatures[0]
    expect(a2.name).toBe(a1.name)
    expect(a2.wallet).toBe(12)
    expect(a2.banked).toBe(30)
    expect(a2.weapon).toBe('stick')
    expect(a2.gangId).toBe(1)
    expect(a2.chem.addiction.drink).toBeCloseTo(0.6)
    expect(a2.memory.vendettas[2]).toBeCloseTo(0.9)
    expect(a2.memory.facts.bankIsSafe).toBe(1)
    expect(s2.time).toBe(s.time)
  })

  it('keeps the save comfortably under 400KB even with a full world', () => {
    const s = createSim(3)
    for (let i = 0; i < 12; i++) s.spawnCreature(GEN())
    for (let i = 0; i < 200; i++) s.tick()
    const kb = JSON.stringify(saveSim(s)).length / 1024
    expect(kb).toBeLessThan(400)
  })

  it('rejects old-version saves instead of silently corrupting', () => {
    const s = populated()
    const data = saveSim(s) as { version: number }
    data.version = 2
    expect(() => loadSim(data as never)).toThrow(/version/)
  })

  it('children born before save survive the round-trip', () => {
    const s = populated()
    const data = saveSim(s)
    const s2 = loadSim(data)
    expect(s2.creatures.length).toBe(s.creatures.length)
  })
})
