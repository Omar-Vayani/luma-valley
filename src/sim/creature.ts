import { Brain } from './brain'
import {
  applyFood,
  chemTick,
  emptyChemicals,
  FOOD_EFFECTS,
  sleepTick,
  socialTick,
  type ChemicalState,
  type ChemConfig,
  type FoodEffect,
} from './biochem'
import { crossover, describeGenome, randomGenome, type Genome } from './genetics'
import { clamp, hashSeed, pick, type RNG } from './rng'

export const ACTIONS = [
  'wander',
  'toFood',
  'eat',
  'toWater',
  'drink',
  'sleep',
  'social',
  'vocalize',
] as const
export type Action = (typeof ACTIONS)[number]

export interface Vec2 {
  x: number
  z: number
}

export interface JournalEvent {
  tick: number
  text: string
}

export interface CreatureCtx {
  rng: RNG
  foodNear: number // 0..1 proximity to nearest edible
  waterNear: number
  creatureNear: number
  dangerNear: number
  day: number // 0..1
  time: number // elapsed ticks
  gentle: boolean
  // environment access for moving/eating:
  findFood: () => Vec2 | null
  findWater: () => Vec2 | null
  findFriend: () => Vec2 | null
  eatAt: (pos: Vec2) => FoodEffect | null
}

export interface LearnedWord {
  kind: 'food' | 'water' | 'come'
}

const NAMES = ['Momo', 'Pip', 'Nana', 'Lulu', 'Kiko', 'Zuzu', 'Bobo', 'Toto', 'Fifi', 'Gigi', 'Mimi', 'Roro']

export class Creature {
  id: number
  name: string
  genome: Genome
  traits: ReturnType<typeof describeGenome>
  brain: Brain
  chem: ChemicalState
  chemConfig: ChemConfig
  pos: Vec2
  facing: number
  age = 0
  alive = true
  sleeping = false
  action: Action = 'wander'
  actionTimer = 0
  learnedWords: Record<string, LearnedWord> = {}
  journal: JournalEvent[] = []
  bornTick: number

  constructor(genome: Genome | null, rng: RNG, id: number, bornTick = 0, name?: string) {
    this.id = id
    this.genome = genome ?? randomGenome(rng, 26)
    this.traits = describeGenome(this.genome)
    this.name = name ?? pick(rng, NAMES) + (id % 10)
    this.brain = new Brain(
      {
        sensors: 11,
        hidden: 12,
        motors: ACTIONS.length,
        density: this.traits.density,
        threshold: this.traits.threshold,
        leak: this.traits.leak,
        bias: 0.15,
        lr: this.traits.lr,
        elDecay: 0.75,
      },
      rng,
    )
    this.chem = emptyChemicals()
    this.chem.hunger = 0.4
    this.chem.thirst = 0.3
    this.chem.fatigue = 0.1
    this.chem.health = 1
    this.chemConfig = {
      synth: {
        hunger: 0.0012 + this.gene('hunger') * 0.001,
        thirst: 0.0011 + this.gene('thirst') * 0.0008,
        fatigue: 0.0008 + this.gene('fatigue') * 0.0006,
        boredom: 0.0006 + this.gene('boredom') * 0.0006,
        loneliness: 0.0007 + this.gene('loneliness') * 0.0006,
      },
      halfLife: { fear: 35, pleasure: 12, pain: 18 },
      max: { hunger: 1, thirst: 1, fatigue: 1, boredom: 1, loneliness: 1, fear: 1, pleasure: 1, pain: 1, health: 1 },
    }
    this.pos = { x: 0, z: 0 }
    this.facing = rng() * Math.PI * 2
    this.bornTick = bornTick
  }

  gene(key: string): number {
    return this.traits[key as keyof typeof this.traits] ?? 0.5
  }

  log(text: string): void {
    if (this.journal.length > 60) this.journal.shift()
    this.journal.push({ tick: this.age, text })
  }

  teachWord(word: string, kind: LearnedWord['kind']): void {
    this.learnedWords[word.toLowerCase()] = { kind }
    this.log(`learned "${word}"`)
  }

  reactToWord(word: string): boolean {
    const w = this.learnedWords[word.toLowerCase()]
    if (!w) return false
    if (w.kind === 'food') this.action = 'toFood'
    else if (w.kind === 'water') this.action = 'toWater'
    else if (w.kind === 'come') this.action = 'social'
    this.log(`responds to "${word}"`)
    return true
  }

  /** Main per-tick update. Returns true if the creature is still alive. */
  tick(ctx: CreatureCtx): boolean {
    if (!this.alive) return false
    this.age++
    if (this.age >= this.traits.lifespan) {
      this.die('old age')
      return false
    }

    // chemistry
    chemTick(this.chem, this.chemConfig)
    if (this.sleeping) {
      sleepTick(this.chem, 1)
      this.chem.fatigue = clamp(this.chem.fatigue - 0.008, 0, 1)
      this.actionTimer++
      if (this.chem.fatigue < 0.05 || this.actionTimer > 600) {
        this.sleeping = false
        this.action = 'wander'
        this.log('wakes up')
      }
      return true
    }

    // world damage / starvation
    if (this.chem.hunger > 0.97) this.chem.health = clamp(this.chem.health - 0.0004, 0, 1)
    if (this.chem.thirst > 0.97) this.chem.health = clamp(this.chem.health - 0.0005, 0, 1)
    if (this.chem.health <= 0) {
      if (ctx.gentle) {
        this.chem.health = 0.05
      } else {
        this.die('weakness')
        return false
      }
    }
    if (!ctx.gentle && (this.chem.hunger >= 1 || this.chem.thirst >= 1)) {
      this.chem.health = clamp(this.chem.health - 0.002, 0, 1)
    }

    // sensors
    const sensors = [
      this.chem.hunger,
      this.chem.thirst,
      this.chem.fatigue,
      this.chem.boredom,
      this.chem.loneliness,
      this.chem.fear,
      this.chem.pain,
      ctx.foodNear,
      ctx.waterNear,
      ctx.creatureNear,
      ctx.day,
    ]
    this.brain.setInputs(sensors)
    this.brain.tick()

    // decode action
    const outs = this.brain.outputs()
    let best = 0
    for (let i = 1; i < outs.length; i++) if (outs[i] > outs[best]) best = i
    if (outs[best] < 0.25) {
      this.action = 'wander'
    } else {
      this.action = ACTIONS[best]
    }
    // Instinct overlay: hardwired survival drives guarantee baseline behavior
    // even before the neural net has learned anything. Learning refines it.
    if (this.chem.hunger > 0.72 && ctx.foodNear > 0.15) this.action = 'eat'
    else if (this.chem.hunger > 0.55) this.action = 'toFood'
    else if (this.chem.thirst > 0.72 && ctx.waterNear > 0.15) this.action = 'drink'
    else if (this.chem.thirst > 0.55) this.action = 'toWater'
    else if (this.chem.fatigue > 0.82) this.action = 'sleep'
    else if (this.chem.loneliness > 0.8 || (this.chem.boredom > 0.85 && ctx.creatureNear > 0.2)) this.action = 'social'
    this.execute(ctx)
    return true
  }

  private execute(ctx: CreatureCtx): void {
    this.actionTimer++
    const speed = 0.5 + this.traits.energy * 0.6
    switch (this.action) {
      case 'wander': {
        if (this.actionTimer > 60 || this.actionTimer === 1) {
          this.facing += (ctx.rng() - 0.5) * 2.4
          this.actionTimer = 0
        }
        this.move(speed * 0.7, ctx)
        break
      }
      case 'toFood': {
        const f = ctx.findFood()
        if (f) {
          this.turnToward(f)
          this.move(speed, ctx)
        } else this.action = 'wander'
        break
      }
      case 'eat': {
        const f = ctx.findFood()
        if (f) {
          this.turnToward(f)
          if (this.dist(f) < 1.2) {
            const effect = ctx.eatAt(f)
            if (effect) {
              applyFood(this.chem, effect)
              this.brain.reinforce(effect.pleasure - effect.pain * 0.8)
              this.action = 'wander'
              this.actionTimer = 0
              if (effect.pain > 0.05) this.log('ate something bad!')
              else if (this.chem.hunger < 0.15) this.log('is full')
            }
          } else {
            this.move(speed, ctx)
          }
        } else this.action = 'wander'
        break
      }
      case 'toWater': {
        const w = ctx.findWater()
        if (w) {
          this.turnToward(w)
          this.move(speed, ctx)
        } else this.action = 'wander'
        break
      }
      case 'drink': {
        const w = ctx.findWater()
        if (w && this.dist(w) < 1.2) {
          applyFood(this.chem, FOOD_EFFECTS.water)
          this.brain.reinforce(0.3)
          this.action = 'wander'
          this.actionTimer = 0
        } else {
          this.move(speed, ctx)
        }
        break
      }
      case 'sleep': {
        this.sleeping = true
        this.actionTimer = 0
        this.log('falls asleep')
        break
      }
      case 'social': {
        const friend = ctx.findFriend()
        if (friend) {
          this.turnToward(friend)
          if (this.dist(friend) > 1.5) this.move(speed, ctx)
          else {
            socialTick(this.chem)
            this.brain.reinforce(0.25)
            if (ctx.rng() < 0.02) this.log(`chirps at a friend`)
          }
        } else this.action = 'wander'
        break
      }
      case 'vocalize': {
        if (ctx.rng() < 0.2) this.log('chirps')
        this.action = 'wander'
        break
      }
    }
  }

  private move(dist: number, ctx: CreatureCtx): void {
    const noise = (ctx.rng() - 0.5) * 0.3
    this.facing += noise
    this.pos.x += Math.cos(this.facing) * dist
    this.pos.z += Math.sin(this.facing) * dist
  }

  private turnToward(target: Vec2): void {
    this.facing = Math.atan2(target.z - this.pos.z, target.x - this.pos.x)
  }

  private dist(target: Vec2): number {
    return Math.hypot(target.x - this.pos.x, target.z - this.pos.z)
  }

  /** Attempt breeding with another adult. Returns child genome or null. */
  breedWith(other: Creature, rng: RNG): Genome | null {
    if (this.age < 400 || other.age < 400) return null
    if (this.chem.health < 0.5 || other.chem.health < 0.5) return null
    const fertility = (this.traits.fertility + other.traits.fertility) / 2
    if (rng() > 0.25 + fertility * 0.55) return null
    this.log(`mates with ${other.name}`)
    other.log(`mates with ${this.name}`)
    return crossover(this.genome, other.genome, rng, 0.08)
  }

  die(reason: string): void {
    this.alive = false
    this.log(`passes away (${reason})`)
  }
}

/** Seed a creature's identity from a name string (for save compatibility). */
export function creatureSeed(id: number, name: string): number {
  return hashSeed(`luma-${id}-${name}`) + id * 7919
}
