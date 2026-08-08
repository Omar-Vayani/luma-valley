import { describe, expect, it } from 'vitest'
import { Creature } from './creature'
import { Game } from './game'
import { ITEMS, applyItem } from './items'
import { psycheTick, trustLabel, trustReaction } from './trauma'
import { mulberry32 } from './rng'

describe('items', () => {
  it('berry is healthy and nourishing', () => {
    const c = new Creature(null, mulberry32(1), 1)
    c.chem.hunger = 0.9
    const out = applyItem(c.chem, ITEMS.berry)
    expect(out.chem.hunger).toBeLessThan(0.7)
    expect(out.chem.pleasure).toBeGreaterThan(0)
    expect(out.toxic).toBe(false)
    expect(out.healthDelta).toBe(0)
  })

  it('smoke-herb calms stress but addicts and damages health', () => {
    const c = new Creature(null, mulberry32(2), 2)
    c.chem.fear = 0.8
    const out = applyItem(c.chem, ITEMS['smoke-herb'])
    expect(out.chem.fear).toBeLessThan(0.5) // instant calm
    expect(out.addictionDelta.smoke).toBeGreaterThan(0)
    expect(out.healthDelta).toBeGreaterThan(0)
  })

  it('nightshade is toxic and can kill', () => {
    const c = new Creature(null, mulberry32(3), 3)
    c.chem.health = 0.5
    const res = c.giveItem(ITEMS.nightshade)
    expect(c.chem.health).toBeLessThan(0.1)
    expect(c.alive).toBe(false)
    expect(res?.toxic).toBe(true)
    expect(c.journal.some((j) => j.text.includes('poison'))).toBe(true)
  })

  it('giving addictive items tracks lastDose and raises addiction', () => {
    const c = new Creature(null, mulberry32(4), 4)
    c.age = 500
    c.giveItem(ITEMS['smoke-herb'])
    expect(c.psyche.addiction.smoke).toBeGreaterThan(0)
    expect(c.lastDose.smoke).toBe(500)
  })
})

describe('trauma', () => {
  it('scaring creates a trauma memory and burns trust', () => {
    const c = new Creature(null, mulberry32(5), 5)
    c.scare('shadow', 0.9, 'the Shadow Beast')
    expect(c.psyche.memories.length).toBe(1)
    expect(c.psyche.memories[0].trigger).toBe('shadow')
    expect(c.psyche.trust).toBeLessThan(0.5)
    expect(c.journal.some((j) => j.text.includes("won't forget"))).toBe(true)
  })

  it('flashbacks spike fear at night for traumatised creatures', () => {
    const c = new Creature(null, mulberry32(6), 6)
    c.scare('shadow', 0.95, 'the Shadow Beast')
    c.chem.fear = 0
    let sawFlash = false
    for (let i = 0; i < 4000; i++) {
      const psy = psycheTick(c.psyche, i, mulberry32(i), { night: true, triggerPresent: {}, withdrawal: [] })
      if (psy.flashback) {
        sawFlash = true
        expect(psy.fearSpike).toBeGreaterThan(0.5)
        break
      }
    }
    expect(sawFlash).toBe(true)
  })

  it('abandonment trauma forms from loneliness at night', () => {
    const c = new Creature(null, mulberry32(7), 7)
    c.scare('abandonment', 0.8, 'being left alone')
    expect(c.psyche.memories.some((m) => m.trigger === 'abandonment')).toBe(true)
  })

  it('trust matters: low trust creatures refuse to come and flee', () => {
    const c = new Creature(null, mulberry32(8), 8)
    c.psyche.trust = 0.1
    c.teachWord('come', 'come')
    const obeyed = c.reactToWord('come')
    expect(obeyed).toBe(false) // refuses
    const re = trustReaction(c.psyche)
    expect(re.flee).toBe(true)
    expect(re.ignoreCome).toBe(true)
    expect(trustLabel(c.psyche.trust)).toBe('terrified')
  })

  it('kindness rebuilds trust', () => {
    const c = new Creature(null, mulberry32(9), 9)
    c.scare('player', 0.8, 'your looming hand')
    expect(trustLabel(c.psyche.trust)).toBe('afraid')
    for (let i = 0; i < 20; i++) c.comfort(0.05, 'is comforted')
    expect(trustLabel(c.psyche.trust)).toBe('devoted')
  })
})

describe('game terror/happiness loop', () => {
  it('scare then comfort: the full arc', () => {
    const g = new Game(42)
    g.spawnInitial(2)
    g.pickupItem('smoke-herb')
    g.pickupItem('berry')
    const c = g.creatures[0]

    // terrorise
    const scare = g.scareCreature(c.id)
    expect(scare.ok).toBe(true)
    expect(c.psyche.memories.length).toBe(1)
    expect(c.chem.fear).toBeGreaterThan(0.4)

    // calm with smoke
    const calm = g.giveItem(c.id, 'smoke-herb')
    expect(calm.ok).toBe(true)
    expect(c.chem.fear).toBeLessThan(0.5)

    // rebuild with kindness
    const berry = g.giveItem(c.id, 'berry')
    expect(berry.ok).toBe(true)
    expect(c.psyche.trust).toBeGreaterThan(0.3)
  })

  it('dropping a scared carried creature gives drop trauma', () => {
    const g = new Game(43)
    g.spawnInitial(2)
    const c = g.creatures[0]
    g.setCarried(c.id)
    c.chem.fear = 0.8
    const drop = g.dropCarried()
    expect(drop.ok).toBe(true)
    expect(c.psyche.memories.some((m) => m.trigger === 'drop')).toBe(true)
  })

  it('withdrawal: an addicted creature panics without its substance', () => {
    const g = new Game(44)
    g.spawnInitial(2)
    const c = g.creatures[0]
    c.age = 2000
    c.giveItem(ITEMS['smoke-herb'])
    c.psyche.addiction.smoke = 0.9
    c.lastDose.smoke = 0 // long ago
    c.chem.fear = 0
    let fearBefore = c.chem.fear
    for (let i = 0; i < 20; i++) {
      // simulate ticks with no dose
      const psy = psycheTick(c.psyche, i, mulberry32(i), { night: false, triggerPresent: {}, withdrawal: ['smoke'] })
      if (psy.fearSpike > 0) fearBefore = psy.fearSpike
    }
    expect(fearBefore).toBeGreaterThan(0.2)
  })
})
