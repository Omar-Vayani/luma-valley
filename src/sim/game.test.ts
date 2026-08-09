import { describe, expect, it } from 'vitest'
import { Game } from './game'
import { saveSizeKb } from './save'

describe('game', () => {
  it('spawns creatures and ticks them alive', () => {
    const g = new Game(123)
    g.spawnInitial(5)
    expect(g.creatures.length).toBe(5)
    for (let i = 0; i < 300; i++) g.tick()
    const alive = g.creatures.filter((c) => c.alive).length
    expect(alive).toBeGreaterThan(0)
  })

  it('time advances and world day cycles', () => {
    const g = new Game(7)
    g.spawnInitial(3)
    for (let i = 0; i < 100; i++) g.tick()
    expect(g.time).toBe(100)
    expect(g.world.state.dayTime).toBeGreaterThan(0)
  })

  it('teach + speak round-trip', () => {
    const g = new Game(9)
    g.spawnInitial(2)
    const id = g.creatures[0].id
    expect(g.teach(id, 'berry', 'food')).toBe(true)
    // speaking an unknown word teaches "come"
    expect(g.speak(id, 'come')).toBe(true)
    expect(g.creatures[0].learnedWords['berry']).toBeTruthy()
  })

  it('offers a low-pressure greeting that improves connection', () => {
    const g = new Game(33)
    g.spawnInitial(1)
    const citizen = g.creatures[0]
    citizen.chem.loneliness = .8
    const trust = citizen.psyche.trust
    const result = g.greet(citizen.id)
    expect(result.ok).toBe(true)
    expect(citizen.chem.loneliness).toBeLessThan(.8)
    expect(citizen.psyche.trust).toBeGreaterThan(trust)
  })

  it('spawns night threats inside the city and within hunting range', () => {
    const g = new Game(77)
    g.spawnInitial(5)
    g.world.state.dayTime = .8
    for (let i = 0; i < 205; i++) g.tick()
    expect(g.shadowBeasts.length).toBeGreaterThan(0)
    const beast = g.shadowBeasts[0]
    expect(Math.abs(beast.state.pos.x)).toBeLessThan(70)
    expect(Math.abs(beast.state.pos.z)).toBeLessThan(70)
    const nearest = Math.min(...g.creatures.filter((creature) => creature.alive).map((creature) => Math.hypot(creature.pos.x - beast.state.pos.x, creature.pos.z - beast.state.pos.z)))
    expect(nearest).toBeLessThan(40)
  })

  it('save/load preserves world', () => {
    const g = new Game(42)
    g.spawnInitial(4)
    for (let i = 0; i < 120; i++) g.tick()
    g.player.pos = { x: 7, z: -8 }
    const save = g.save()
    const g2 = new Game(0)
    g2.load(save)
    expect(g2.world.state.seed).toBe(42)
    expect(g2.creatures.length).toBe(g.creatures.length)
    expect(g2.time).toBe(120)
    expect(g2.creatures[0].name).toBe(g.creatures[0].name)
    expect(g2.player.pos).toEqual({ x: 7, z: -8 })
  })

  it('migrates pre-city saves to a visible city arrival', () => {
    const old = new Game(12)
    old.spawnInitial(3)
    const save = old.save()
    for (const creature of save.creatures) delete creature.urban
    save.player.pos = { x: 48, z: 48 }
    const city = new Game(0)
    city.load(save)
    expect(city.world.state.size).toBe(96)
    expect(city.player.pos).toEqual({ x: 0, z: -14 })
    expect(city.creatures.every((creature) => creature.pos.z <= -20 && creature.pos.z >= -21.4)).toBe(true)
    expect(city.quests.active).toBe('q1_feed')
  })

  it('preserves quest progress when expanding a compact city save', () => {
    const compact = new Game(14, 60)
    compact.spawnInitial(2)
    compact.quests = {
      active: 'q2_teach',
      progress: { q1_feed: 1, q2_teach: 0 },
      completed: ['q1_feed'],
      unlocked: ['q1_feed', 'q2_teach'],
    }
    const restored = new Game(0)
    restored.load(compact.save())
    expect(restored.world.state.size).toBe(96)
    expect(restored.quests).toEqual(compact.quests)
  })

  it('save stays small', () => {
    const g = new Game(5)
    g.spawnInitial(6)
    for (let i = 0; i < 500; i++) g.tick()
    expect(saveSizeKb(g.save())).toBeLessThan(80)
  })

  it('gentle mode: creatures survive long runs', () => {
    const g = new Game(3, 40, { gentle: true })
    g.spawnInitial(6)
    for (let i = 0; i < 3000; i++) g.tick()
    // with gentle mode, old age still kills, but none should starve early
    expect(g.creatures.filter((c) => c.alive).length).toBeGreaterThanOrEqual(1)
  })

  it('feed reduces hunger and reinforces', () => {
    const g = new Game(13)
    g.spawnInitial(2)
    const c = g.creatures[0]
    c.chem.hunger = 0.9
    expect(g.feed(c.id)).toBe(true)
    expect(c.chem.hunger).toBeLessThan(0.5)
    expect(c.chem.pleasure).toBeGreaterThan(0.3)
    expect(c.journal.some((j) => j.text.includes('hand-fed'))).toBe(true)
  })

  it('tickle raises pleasure', () => {
    const g = new Game(14)
    g.spawnInitial(2)
    const c = g.creatures[0]
    expect(g.tickle(c.id)).toBe(true)
    expect(c.chem.pleasure).toBeGreaterThan(0.2)
  })

  it('carried creature stays put while brain ticks', () => {
    const g = new Game(15)
    g.spawnInitial(3)
    const c = g.creatures[0]
    g.setCarried(c.id)
    const before = { ...c.pos }
    for (let i = 0; i < 40; i++) g.tick()
    expect(c.pos.x).toBeCloseTo(before.x, 6)
    expect(c.pos.z).toBeCloseTo(before.z, 6)
    expect(c.age).toBe(40)
    g.setCarried(null)
  })

  it('breeding happens and produces children with mixed genomes', () => {
    // place two adults next to each other, force fertility, let the sim run
    const g = new Game(77)
    g.spawnInitial(2)
    const a = g.creatures[0]
    const b = g.creatures[1]
    a.age = 1000
    b.age = 1000
    a.chem.health = 1
    b.chem.health = 1
    a.traits.fertility = 1
    b.traits.fertility = 1
    a.pos = { x: 0, z: 0 }
    b.pos = { x: 2, z: 0 }
    const initialCount = g.creatures.length
    let born = false
    for (let i = 0; i < 1200 && !born; i++) {
      g.tick()
      if (g.creatures.length > initialCount) born = true
    }
    expect(born).toBe(true)
    const child = g.creatures.find((c) => c.age === 0 && c.id >= 3)
    expect(child).toBeTruthy()
    expect(child!.genome.genes.length).toBeGreaterThan(0)
  })
})
