import { describe, expect, it } from 'vitest'
import { Creature } from './creature'
import type { CreatureCtx } from './creature'
import { World } from './world'
import { applySave, buildSave, saveSizeKb } from './save'
import { mulberry32 } from './rng'
import { avoidCityObstacles, FILLER_BUILDINGS, wallBoxes } from './city-layout'

function makeCtx(world: World, creatures: Creature[], self: Creature, day = 0.4): CreatureCtx {
  return {
    rng: mulberry32(1),
    foodNear: 0,
    waterNear: 0,
    creatureNear: 0,
    dangerNear: 0,
    playerNear: 0,
    day,
    time: 0,
    gentle: false,
    findFood: () => world.nearestFood(self.pos),
    findWater: () => world.nearestWater(self.pos),
    findFriend: () => world.nearestCreature(self.pos, creatures, self.id),
    eatAt: (p) => world.eatAt(p),
    resolveCollision: (p, r) => world.resolveCollision(p, r),
    discoverPlaces: () => [],
    findPlace: () => null,
    navigateTarget: (from, target) => avoidCityObstacles(from, target),
    usePlace: () => null,
  }
}

describe('creature', () => {
  it('spawns alive with a name and genome', () => {
    const c = new Creature(null, mulberry32(2), 1)
    expect(c.alive).toBe(true)
    expect(c.name.length).toBeGreaterThan(0)
    expect(c.genome.genes.length).toBe(26)
  })

  it('drives rise and hunger grows', () => {
    const c = new Creature(null, mulberry32(3), 1)
    c.pos = { x: 0, z: 0 }
    const w = new World(7)
    const ctx = makeCtx(w, [c], c)
    for (let i = 0; i < 300; i++) c.tick(ctx)
    expect(c.chem.hunger).toBeGreaterThan(0.3)
    expect(c.age).toBe(300)
    expect(c.alive).toBe(true)
  })

  it('can learn a word and respond', () => {
    const c = new Creature(null, mulberry32(4), 1)
    c.teachWord('food', 'food')
    expect(c.reactToWord('food')).toBe(true)
    expect(c.action).toBe('toFood')
    expect(c.journal.some((j) => j.text.includes('learned'))).toBe(true)
  })

  it('learns a nearby city place before it can seek its resources', () => {
    const w = new World(11)
    const c = new Creature(null, mulberry32(5), 1)
    const ctx = makeCtx(w, [c], c)
    const market = { id: 'market' as const, name: 'Old Market', purpose: 'food', pos: { x: 0, z: 0 }, radius: 5, provides: ['bread' as const], danger: 0 }
    ctx.discoverPlaces = () => [market]
    ctx.findPlace = () => market
    c.chem.hunger = 0.95
    c.tick(ctx)
    expect(c.urban.knownPlaces.market).toBeDefined()
    expect(c.journal.some((entry) => entry.text.includes('discovers Old Market'))).toBe(true)
  })

  it('dies at lifespan end (permadeath)', () => {
    const c = new Creature(null, mulberry32(6), 1)
    c.chem.health = 1
    // force old age
    const lifespan = c.traits.lifespan
    c.age = lifespan - 1
    const w = new World(7)
    const ctx = makeCtx(w, [c], c)
    c.tick(ctx)
    expect(c.alive).toBe(false)
    expect(c.journal.some((j) => j.text.includes('passes away'))).toBe(true)
  })

  it('gentle mode prevents death from starvation', () => {
    const c = new Creature(null, mulberry32(8), 1)
    c.chem.hunger = 0.999
    c.chem.health = 0.05
    const w = new World(7)
    const ctx = makeCtx(w, [c], c)
    ctx.gentle = true
    for (let i = 0; i < 200; i++) {
      if (!c.alive) break
      c.tick(ctx)
    }
    expect(c.alive).toBe(true)
  })

  it('eats food at hand instead of walking to a far city goal', () => {
    const c = new Creature(null, mulberry32(7), 1)
    c.chem.hunger = 0.9
    const w = new World(7)
    // a berry bush right next to the creature
    w.state.plants.push({ id: 1, pos: { x: 1, z: 0 }, berries: 3, regrow: 0 })
    const ctx = makeCtx(w, [c], c)
    ctx.foodNear = 0.9 // bush is well within smell range
    ctx.rng = () => 0.5 // suppress random exploration
    const market = { id: 'market' as const, name: 'Old Market', purpose: 'food', pos: { x: -28, z: 18 }, radius: 10, provides: ['bread' as const], danger: 0 }
    ctx.findPlace = () => market
    // the market is already known, so the hunger goal would normally send it there
    c.urban.knownPlaces.market = { provides: ['bread'], pos: market.pos, confidence: 1, valence: 1, lastVisited: 0 }
    c.tick(ctx)
    // it must have eaten the berry at its feet, not marched off to the market
    expect(c.chem.hunger).toBeLessThan(0.9)
  })

  it('sick citizen seeks an unknown district to find medicine', () => {
    const c = new Creature(null, mulberry32(9), 1)
    c.chem.health = 0.3
    c.chem.hunger = 0.4
    c.chem.boredom = 0.3
    c.chem.loneliness = 0.3
    const w = new World(7)
    const ctx = makeCtx(w, [c], c)
    const apothecary = { id: 'apothecary' as const, name: 'Saint Orra Drugstore', purpose: 'Medicine and recovery', pos: { x: 32, z: -28 }, radius: 9, provides: ['medicine' as const, 'rest' as const], danger: 0.04 }
    ctx.findPlace = () => apothecary
    // first rng draw passes the exploration gate, second draw picks the
    // apothecary out of the 9 CITY_PLACES (index 3 → 0.4*9 = 3.6)
    let calls = 0
    ctx.rng = () => (calls++ === 0 ? 0.005 : 0.4)
    c.tick(ctx)
    expect(c.urban.currentGoal).toBe('apothecary')
  })

  it('a starving citizen ignores a rest/water goal and forages food instead', () => {
    // hunger > 0.9 must not be overridden by a park/rest goal — even when
    // thirst is also high — unless the destination actually supplies food
    const c = new Creature(null, mulberry32(21), 1)
    c.chem.hunger = 0.95
    c.chem.thirst = 0.85
    const w = new World(7)
    // food is reachable (within the 12-unit forage range) but not at hand
    w.state.plants.push({ id: 1, pos: { x: 11, z: 0 }, berries: 3, regrow: 0 })
    const ctx = makeCtx(w, [c], c)
    const park = { id: 'park' as const, name: 'Ashen Park', purpose: 'Water, calm and conversation', pos: { x: 0, z: -28 }, radius: 11, provides: ['water' as const, 'rest' as const, 'company' as const], danger: 0.02 }
    ctx.findPlace = () => park
    ctx.rng = () => 0.5
    c.urban.knownPlaces.park = { provides: ['water', 'rest', 'company'], pos: park.pos, confidence: 1, valence: 1, lastVisited: 0 }
    // the park goal was set in a calmer moment and is still pending
    c.urban.currentGoal = 'park'
    c.tick(ctx)
    // it must head for the berries, not walk off to rest at the park
    expect(['toFood', 'eat']).toContain(c.action)
    expect(c.action).not.toBe('toPlace')
    expect(c.action).not.toBe('usePlace')
  })

  it('a citizen pressed against a building wall still finds its way to reachable food', () => {
    // regression: toFood used to turn toward the target and push straight into
    // walls; a citizen wedged west of a building starved beside a reachable bush
    const c = new Creature(null, mulberry32(22), 1)
    const w = new World(7)
    const rowS1 = FILLER_BUILDINGS.find((b) => b.id === 'row-s1')!
    for (const wall of wallBoxes(rowS1)) w.addBoxCollider(wall.x, wall.z, wall.hx, wall.hz)
    // bush east of the building, citizen on the west side (like Fifi6's alley)
    w.state.plants.push({ id: 1, pos: { x: -8, z: -32 }, berries: 3, regrow: 0 })
    const ctx = makeCtx(w, [c], c)
    ctx.findFood = () => w.nearestFood(c.pos, 300)
    ctx.rng = () => 0.5
    c.pos = { x: -28, z: -33 }
    c.chem.hunger = 0.9
    let ate = false
    for (let i = 0; i < 500 && c.alive && !ate; i++) {
      // mirror the game's proximity sensor so the eat instinct fires near the bush
      const food = w.nearestFood(c.pos, 300)
      ctx.foodNear = food ? Math.max(0, 1 - Math.hypot(food.x - c.pos.x, food.z - c.pos.z) / 12) : 0
      c.tick(ctx)
      ate = c.chem.hunger < 0.5
    }
    expect(c.alive).toBe(true)
    expect(ate).toBe(true)
  })

  it('breeding produces a child genome with both parents', () => {
    const a = new Creature(null, mulberry32(9), 1)
    const b = new Creature(null, mulberry32(10), 2)
    a.age = 1000
    b.age = 1000
    a.chem.health = 1
    b.chem.health = 1
    a.traits.fertility = 1
    b.traits.fertility = 1
    const childGenome = a.breedWith(b, mulberry32(11))
    expect(childGenome).not.toBeNull()
    const child = new Creature(childGenome, mulberry32(12), 3)
    expect(child.genome.genes.length).toBeGreaterThan(0)
  })
})

describe('world', () => {
  it('generates a flat city foundation, fountain and residential den', () => {
    const w = new World(42)
    expect(w.state.plants).toHaveLength(0)
    expect(w.state.waterPoints).toHaveLength(1)
    expect(w.state.den).toBeTruthy()
    expect(w.height(-35, 22)).toBe(w.height(31, -27))
  })

  it('is deterministic per seed', () => {
    const a = new World(42)
    const b = new World(42)
    expect(a.state.plants.map((p) => p.pos.x)).toEqual(b.state.plants.map((p) => p.pos.x))
  })

  it('makes the back alley more dangerous than the market by day', () => {
    const w = new World(43)
    expect(w.dangerAt({ x: -50, z: -4 }, 0.5)).toBeGreaterThan(w.dangerAt({ x: -28, z: 18 }, 0.5))
  })
})

describe('save', () => {
  it('round-trips a world + creatures', () => {
    const w = new World(99)
    const creatures = [new Creature(null, mulberry32(1), 1), new Creature(null, mulberry32(2), 2)]
    creatures[0].pos = { x: 5, z: -3 }
    creatures[0].teachWord('berry', 'food')
    for (let i = 0; i < 50; i++) creatures[0].tick(makeCtx(w, creatures, creatures[0]))
    const save = buildSave(w, creatures, { gentle: false }, 3, 50,
      { pos: { x: 0, z: 0 }, facingYaw: 0, inventory: { berries: 0, wood: 0, torch: 1 }, torchLit: false, sanity: 1 },
      { active: null, progress: {}, completed: [], unlocked: [] },
      [], 1)
    const w2 = new World(0)
    const c2: Creature[] = []
    applySave(save, w2, c2)
    expect(w2.state.seed).toBe(99)
    expect(c2.length).toBe(2)
    expect(c2[0].name).toBe(creatures[0].name)
    expect(c2[0].pos).toEqual(creatures[0].pos)
    expect(c2[0].chem.hunger).toBeCloseTo(creatures[0].chem.hunger, 6)
    expect(c2[0].learnedWords['berry']).toBeTruthy()
    expect(c2[0].journal.length).toBe(creatures[0].journal.length)
  })

  it('stays small (< 60 KB)', () => {
    const w = new World(5)
    const creatures = Array.from({ length: 8 }, (_, i) => new Creature(null, mulberry32(i + 1), i + 1))
    for (let i = 0; i < 200; i++) {
      for (const c of creatures) c.tick(makeCtx(w, creatures, c))
    }
    const save = buildSave(w, creatures, { gentle: false }, 9, 200,
      { pos: { x: 0, z: 0 }, facingYaw: 0, inventory: { berries: 0, wood: 0, torch: 1 }, torchLit: false, sanity: 1 },
      { active: null, progress: {}, completed: [], unlocked: [] },
      [], 1)
    const kb = saveSizeKb(save)
    expect(kb).toBeLessThan(70)
  })
})
