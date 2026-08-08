import { Creature } from './creature'
import type { CreatureCtx } from './creature'
import { applyFood, FOOD_EFFECTS } from './biochem'
import { World } from './world'
import { applySave, buildSave, type SaveData } from './save'
import { clamp, mulberry32, range, type RNG } from './rng'

/**
 * Game — orchestrates the world + creatures into one playable simulation.
 * The renderer/worker calls tick() every frame and reads entities.
 */

export interface GameSettings {
  gentle: boolean
}

export interface GameView {
  world: World
  creatures: Creature[]
  time: number
  nextId: number
  settings: GameSettings
}

export class Game {
  world: World
  creatures: Creature[] = []
  time = 0
  nextId = 1
  settings: GameSettings = { gentle: false }
  rng: RNG
  private breedCooldown = 0

  constructor(seed: number, size = 40, settings?: GameSettings) {
    this.world = new World(seed, size)
    this.rng = mulberry32(seed)
    if (settings) this.settings = settings
  }

  spawnInitial(count = 5): void {
    for (let i = 0; i < count; i++) {
      const c = new Creature(null, this.rng, this.nextId++, 0)
      this.placeRandom(c)
      this.creatures.push(c)
      c.log('hatches into the valley')
    }
  }

  private placeRandom(c: Creature): void {
    const s = this.world.state.size
    for (let tries = 0; tries < 30; tries++) {
      const x = range(this.rng, -s + 5, s - 5)
      const z = range(this.rng, -s + 5, s - 5)
      const h = this.world.height(x, z)
      if (h > 0.3 && Math.hypot(x - this.world.state.den.x, z - this.world.state.den.z) > 6) {
        c.pos = { x, z }
        return
      }
    }
    c.pos = { x: 0, z: 0 }
  }

  private proximity(pos: { x: number; z: number }, find: () => { x: number; z: number } | null, max = 12): number {
    const t = find()
    if (!t) return 0
    const d = Math.hypot(t.x - pos.x, t.z - pos.z)
    if (d >= max) return 0
    return 1 - d / max
  }

  private ctxFor(c: Creature): CreatureCtx {
    const self = c
    return {
      rng: this.rng,
      foodNear: this.proximity(self.pos, () => this.world.nearestFood(self.pos)),
      waterNear: this.proximity(self.pos, () => this.world.nearestWater(self.pos)),
      creatureNear: this.proximity(self.pos, () => this.world.nearestCreature(self.pos, this.creatures, self.id), 8),
      dangerNear: this.world.dangerAt(self.pos, this.world.state.dayTime),
      day: this.world.state.dayTime,
      time: this.time,
      gentle: this.settings.gentle,
      findFood: () => this.world.nearestFood(self.pos),
      findWater: () => this.world.nearestWater(self.pos),
      findFriend: () => this.world.nearestCreature(self.pos, this.creatures, self.id),
      eatAt: (p) => this.world.eatAt(p),
    }
  }

  /** Advance the sim by one tick. */
  tick(): void {
    this.time++
    this.world.tick()
    for (const c of this.creatures) {
      if (!c.alive) continue
      // carried creatures stay put (brain still thinks, body frozen in hand)
      if (this.carriedId === c.id) {
        const savePos = { ...c.pos }
        c.tick(this.ctxFor(c))
        c.pos = savePos
        continue
      }
      c.tick(this.ctxFor(c))
    }
    this.maybeBreed()
    if (this.breedCooldown > 0) this.breedCooldown--
  }

  private maybeBreed(): void {
    if (this.breedCooldown > 0) return
    const adults = this.creatures.filter((c) => c.alive && c.age > 400 && c.chem.health > 0.5)
    if (adults.length < 2) return
    // pair the two adults that are closest
    let bestPair: [Creature, Creature] | null = null
    let bestD = Infinity
    for (let i = 0; i < adults.length; i++) {
      for (let j = i + 1; j < adults.length; j++) {
        const d = Math.hypot(adults[i].pos.x - adults[j].pos.x, adults[i].pos.z - adults[j].pos.z)
        if (d < bestD) {
          bestD = d
          bestPair = [adults[i], adults[j]]
        }
      }
    }
    if (!bestPair || bestD > 10) return
    const [a, b] = bestPair
    const genome = a.breedWith(b, this.rng)
    if (genome) {
      const child = new Creature(genome, this.rng, this.nextId++, 0)
      child.pos = { x: a.pos.x + range(this.rng, -1, 1), z: a.pos.z + range(this.rng, -1, 1) }
      child.log('is born')
      this.creatures.push(child)
      this.breedCooldown = 300
    }
  }

  teach(creatureId: number, word: string, kind: 'food' | 'water' | 'come'): boolean {
    const c = this.creatures.find((x) => x.id === creatureId && x.alive)
    if (!c) return false
    c.teachWord(word, kind)
    return true
  }

  carriedId: number | null = null

  setCarried(id: number | null): void {
    if (id !== null && !this.creatures.some((c) => c.id === id && c.alive)) return
    this.carriedId = id
  }

  /** Hand-feed a creature a berry (instant effect — no world drop). */
  feed(creatureId: number): boolean {
    const c = this.creatures.find((x) => x.id === creatureId && x.alive)
    if (!c) return false
    applyFood(c.chem, FOOD_EFFECTS.berry)
    c.brain.reinforce(0.6)
    c.log('is hand-fed')
    return true
  }

  /** Tickle — pleasure + positive reinforcement. */
  tickle(creatureId: number): boolean {
    const c = this.creatures.find((x) => x.id === creatureId && x.alive)
    if (!c) return false
    c.chem.pleasure = clamp(c.chem.pleasure + 0.3, 0, 1)
    c.brain.reinforce(0.4)
    c.log('giggles at a tickle')
    return true
  }

  /** React to a spoken word near a creature (player "speaks"). */
  speak(creatureId: number, word: string): boolean {
    const c = this.creatures.find((x) => x.id === creatureId && x.alive)
    if (!c) return false
    // If they know it, they respond; otherwise it's a teaching moment.
    const known = c.reactToWord(word)
    if (!known && word.trim().length > 0) {
      c.teachWord(word, 'come')
      return true
    }
    return known
  }

  selectedCreature(id: number): Creature | null {
    return this.creatures.find((c) => c.id === id) ?? null
  }

  save(): SaveData {
    const data = buildSave(this.world, this.creatures, this.settings, this.nextId, this.time)
    data.extra = { carriedId: this.carriedId ?? undefined } as any
    return data
  }

  load(data: SaveData): void {
    this.settings = data.settings
    this.nextId = data.nextId
    this.time = data.time
    applySave(data, this.world, this.creatures)
    this.carriedId = (data as any).extra?.carriedId ?? null
  }

  view(): GameView {
    return { world: this.world, creatures: this.creatures, time: this.time, nextId: this.nextId, settings: this.settings }
  }
}
