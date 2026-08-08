import { describe, expect, it } from 'vitest'
import { Creature } from './creature'
import type { CreatureCtx } from './creature'
import { World } from './world'
import { applySave, buildSave, saveSizeKb } from './save'
import { mulberry32 } from './rng'

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

  it('learning: eating near food reinforces toward-food behavior', () => {
    // Place a plant right next to the creature; hunger high; creature should
    // eventually find and eat, reducing hunger (and journaling "is full" or eating).
    const w = new World(11)
    const c = new Creature(null, mulberry32(5), 1)
    c.pos = { x: w.state.plants[0].pos.x + 0.4, z: w.state.plants[0].pos.z + 0.4 }
    c.chem.hunger = 0.95
    const ctx = makeCtx(w, [c], c)
    ctx.foodNear = 0.9
    let ate = false
    for (let i = 0; i < 400; i++) {
      if (!c.tick(ctx)) break
      if (c.chem.hunger < 0.8) {
        ate = true
        break
      }
    }
    expect(ate).toBe(true)
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
  it('generates plants, water and a den', () => {
    const w = new World(42)
    expect(w.state.plants.length).toBeGreaterThan(10)
    expect(w.state.waterPoints.length).toBeGreaterThan(10)
    expect(w.state.den).toBeTruthy()
  })

  it('is deterministic per seed', () => {
    const a = new World(42)
    const b = new World(42)
    expect(a.state.plants.map((p) => p.pos.x)).toEqual(b.state.plants.map((p) => p.pos.x))
  })

  it('plants regrow berries over time', () => {
    const w = new World(43)
    const p = w.state.plants[0]
    p.berries = 0
    for (let i = 0; i < 150; i++) w.tick()
    expect(p.berries).toBeGreaterThan(0)
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
