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
import { createPsyche, psycheTick, traumatise, trustReaction, type PsycheState, type TraumaTrigger } from './trauma'
import { applyItem, type ItemDef } from './items'
import { createMind, dreadAt, remember, wantsToExplore, type MindState } from './mind'

export const ACTIONS = [
  'wander',
  'toFood',
  'eat',
  'toWater',
  'drink',
  'sleep',
  'social',
  'vocalize',
  'flee',
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
  playerNear: number // 0..1 proximity to the player
  bondFear?: number // fear bleeding in from bonded friends (emotional contagion)
  day: number // 0..1
  time: number // elapsed ticks
  gentle: boolean
  // environment access for moving/eating:
  findFood: () => Vec2 | null
  findWater: () => Vec2 | null
  findFriend: () => Vec2 | null
  eatAt: (pos: Vec2) => FoodEffect | null
  resolveCollision: (pos: Vec2, radius: number) => Vec2
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
  psyche: PsycheState
  mind: MindState
  lastDose: Record<string, number> = { smoke: -9999, sugar: -9999, cactus: -9999, mushroom: -9999 }
  private rngStore: RNG

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
    this.psyche = createPsyche()
    this.mind = createMind()
    this.rngStore = rng
  }

  /** Give an item — returns what it did (or null if dead). */
  giveItem(item: ItemDef): { label: string; trustDelta: number; toxic: boolean } | null {
    if (!this.alive) return null
    const out = applyItem(this.chem, item)
    this.chem = out.chem
    this.psyche.trust = clamp(this.psyche.trust + out.trustDelta, 0, 1)
    for (const [sub, amt] of Object.entries(out.addictionDelta)) {
      this.psyche.addiction[sub] = clamp((this.psyche.addiction[sub] ?? 0) + amt, 0, 1)
      this.lastDose[sub] = this.age
    }
    if (out.healthDelta > 0) this.chem.health = clamp(this.chem.health - out.healthDelta, 0, 1)
    const nice = out.trustDelta >= 0
    this.log(nice ? `enjoys the ${out.label} (trust ↑)` : `sours at the ${out.label}`)
    if (out.toxic && this.chem.health <= 0.15) {
      this.die('poisoning')
      return { label: out.label, trustDelta: out.trustDelta, toxic: true }
    }
    return { label: out.label, trustDelta: out.trustDelta, toxic: false }
  }

  /** Terrify the creature — etches trauma + spikes fear + burns trust. */
  scare(trigger: TraumaTrigger, intensity: number, reason: string): void {
    if (!this.alive) return
    const mem = traumatise(this.psyche, trigger, intensity, this.age, () => this.psyche.memories.length + this.id)
    this.chem.fear = clamp(this.chem.fear + intensity * 0.7, 0, 1)
    this.psyche.trust = clamp(this.psyche.trust - intensity * 0.25, 0, 1)
    remember(this.mind, 'scare', this.pos, -1, intensity, this.age)
    this.log(mem ? `is terrorised by ${reason}! It won't forget.` : `startles at ${reason}`)
  }

  /** Kindness heals — raising trust accelerates trauma recovery. */
  comfort(amount: number, reason: string): void {
    if (!this.alive) return
    this.psyche.trust = clamp(this.psyche.trust + amount, 0, 1)
    this.chem.pleasure = clamp(this.chem.pleasure + amount * 0.5, 0, 1)
    this.log(reason)
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
    if (w.kind === 'come' && trustReaction(this.psyche).ignoreCome) {
      this.log(`stays away — doesn't trust you yet`)
      return false
    }
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

    // ── psyche: trauma, flashbacks, withdrawal ──
    const night = ctx.day > 0.72 || ctx.day < 0.1
    const withdrawal: string[] = []
    for (const sub of ['smoke', 'sugar', 'cactus', 'mushroom']) {
      if ((this.psyche.addiction[sub] ?? 0) > 0.35 && this.age - (this.lastDose[sub] ?? -9999) > 600) withdrawal.push(sub)
    }
    const psy = psycheTick(this.psyche, this.age, this.rngStore, {
      night,
      triggerPresent: {
        shadow: ctx.dangerNear > 0.3,
        abandonment: night && ctx.creatureNear < 0.1 && ctx.time > 400,
      },
      withdrawal,
    })
    if (psy.fearSpike > 0) {
      this.chem.fear = clamp(this.chem.fear + psy.fearSpike, 0, 1)
      this.chem.pleasure = clamp(this.chem.pleasure - psy.fearSpike * 0.15, 0, 1)
    }
    if (psy.flashback) {
      const worst = this.psyche.memories.reduce((a, b) => (b.intensity > a.intensity ? b : a))
      this.log(`shudders — haunted by ${worst.trigger}`)
    }
    if (psy.healed) this.log('the fear seems a little smaller today')

    // ── mind: episodic dread + emotional contagion ──
    const dread = dreadAt(this.mind, this.pos)
    if (dread > 0) this.chem.fear = clamp(this.chem.fear + dread, 0, 1)
    if (ctx.bondFear) {
      this.chem.fear = clamp(this.chem.fear + ctx.bondFear, 0, 1)
    }

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
    if (this.chem.fear > 0.6) this.action = 'flee'
    else if (this.chem.hunger > 0.72 && ctx.foodNear > 0.15) this.action = 'eat'
    else if (this.chem.hunger > 0.55) this.action = 'toFood'
    else if (this.chem.thirst > 0.72 && ctx.waterNear > 0.15) this.action = 'drink'
    else if (this.chem.thirst > 0.55) this.action = 'toWater'
    else if (this.chem.fatigue > 0.82) this.action = 'sleep'
    else if (this.chem.loneliness > 0.8 || (this.chem.boredom > 0.85 && ctx.creatureNear > 0.2)) this.action = 'social'

    // terrified creatures flee the player
    if (this.psyche.trust < 0.18 && ctx.playerNear > 0.3) this.action = 'flee'

    // curiosity: explore when healthy and no urgent need
    if (this.chem.hunger < 0.5 && this.chem.thirst < 0.5 && this.chem.fatigue < 0.6 && wantsToExplore(this.mind, this.age, ctx.rng, this.chem.health > 0.6)) {
      this.action = 'wander'
    }

    this.execute(ctx)
    return true
  }

  private execute(ctx: CreatureCtx): void {
    this.actionTimer++
    const speed = 0.5 + this.traits.energy * 0.6
    switch (this.action) {
      case 'flee': {
        // panic: run fast, turning hard
        this.facing += (ctx.rng() - 0.5) * 1.6
        this.move(speed * 1.8, ctx)
        break
      }
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
    // collision: push out of rocks/trees/structures
    const resolved = ctx.resolveCollision(this.pos, 0.35)
    this.pos.x = resolved.x
    this.pos.z = resolved.z
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
