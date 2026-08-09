import { describe, expect, it } from 'vitest'
import { Creature } from './creature'
import { Game } from './game'
import { affinityFor, contagion, createMind, dreadAt, drawAt, remember, updateAffinity, wantsToExplore } from './mind'
import { mulberry32 } from './rng'

describe('mind', () => {
  it('remembers episodes and recalls good food places', () => {
    const m = createMind()
    remember(m, 'food', { x: 5, z: 5 }, 1, 0.8, 10)
    const draw = drawAt(m, { x: 3, z: 3 }, 10)
    expect(draw).not.toBeNull()
    expect(draw!.x).toBe(5)
  })

  it('dreads remembered scary places', () => {
    const m = createMind()
    remember(m, 'scare', { x: 10, z: 10 }, -1, 1, 5)
    expect(dreadAt(m, { x: 10, z: 10 })).toBeGreaterThan(0.5)
    expect(dreadAt(m, { x: -20, z: -20 })).toBe(0)
  })

  it('curiosity drives exploration only when healthy', () => {
    const m = createMind()
    m.curiosity = 1
    const rng = () => 0.001
    expect(wantsToExplore(m, 0, rng, true)).toBe(true)
    expect(wantsToExplore(m, 200, rng, false)).toBe(false) // unhealthy
  })

  it('affinity grows between nearby creatures and fear spreads', () => {
    const m = createMind()
    updateAffinity(m, 99, 0.5)
    expect(affinityFor(m, 99)).toBeGreaterThan(0.4)
    expect(contagion(m, 99, 0.8)).toBeGreaterThan(0.1)
    expect(contagion(m, 1, 0.8)).toBe(0) // stranger's fear doesn't spread
  })

  it('creatures remember being scared and stay wary of that spot', () => {
    const c = new Creature(null, mulberry32(1), 1)
    c.pos = { x: 8, z: 8 }
    c.scare('player', 0.9, 'your looming hand')
    expect(c.mind.episodes.some((e) => e.kind === 'scare' && e.pos.x === 8)).toBe(true)
    c.pos = { x: 8, z: 8 }
    const c2 = new Creature(null, mulberry32(2), 2)
    const g = new Game(1)
    // fear from the memory should raise chem.fear when standing there
    const before = c.chem.fear
    c.tick({
      rng: mulberry32(3),
      foodNear: 0,
      waterNear: 0,
      creatureNear: 0,
      dangerNear: 0,
      playerNear: 0,
      day: 0.5,
      time: 1,
      gentle: false,
      findFood: () => null,
      findWater: () => null,
      findFriend: () => null,
      eatAt: () => null,
      resolveCollision: (p) => ({ ...p }),
      discoverPlaces: () => [],
      findPlace: () => null,
      usePlace: () => null,
    })
    expect(c.chem.fear).toBeGreaterThanOrEqual(before)
    void c2
    void g
  })

  it('citizens learn the district where they arrive', () => {
    const g = new Game(7)
    g.spawnInitial(1)
    const c = g.creatures[0]
    g.tick()
    expect(Object.keys(c.urban.knownPlaces).length).toBeGreaterThan(0)
  })
})
