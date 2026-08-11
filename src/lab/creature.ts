/**
 * creature — a ball with eyes. Holds genome, chemistry, memory, wallet,
 * bonds, and the small verbs (eat/sleep/work/pay/deposit/socialize).
 * The Sim orchestrates movement + decisions; this is pure state + verbs.
 */
import { createChem, applyFood, applySleep, applySocial, type ChemState } from './chem'
import { createMemory, type MemoryState } from './memory'
import { createDrives, type Drives } from './drives'
import { createEmotions, type EmotionState } from './emotions'
import type { ReputationMap } from './reputation'
import { createBrain, type Brain } from './brain'
import { createLanguage, type LanguageState } from './language'
import { ageLimitFor } from './lifecycle'
import { createInventory, type Inventory } from './inventory'
import { createVengeance, type VengeanceState } from './vengeance'
import { createWant, wantForState } from './wants'
import { createSocialGraph, type SocialGraph } from './socialbond'
import { createPsyche, type Psyche } from './psyche'
import { createBeliefs, createHabits, type BeliefStore, type HabitStore } from './beliefs'
import { lifeStageFor, type LifeStage } from './lifecycle'
import type { Genome } from './genetics'
import type { ActionName } from './mind'
import { clamp01 } from './util'

export interface Creature {
  id: number
  name: string
  genome: Genome
  chem: ChemState
  memory: MemoryState
  pos: { x: number; z: number }
  facing: number
  wallet: number
  banked: number
  alive: boolean
  sleeping: boolean
  action: string
  goalTowerId: string | null
  gangId: number | null
  partnerId: number | null
  bonds: Record<number, number>
  age: number
  weapon: string | null
  fightCooldown: number // ticks until this creature fights again
  workProgress: number // ticks worked toward the current shift
  gratitude: Record<number, number> // creatureId -> gratitude toward them
  intention: ActionName | null // the action the mind is committed to
  intentionTicks: number // ticks remaining on the current commitment
  education: number // schooling level — raises work earnings a little each time
  buried: boolean // true when carried to the graveyard
  jealousy: number // 0..1 — how much the partner's outside bonds sting
  drives: Drives
  knowledge: Record<string, number> // towerId -> 0..1 (learned by seeing/visiting)
  emotions: EmotionState // social emotional spectrum (joy, envy, spite, ...)
  reputation: ReputationMap // targetId -> what THIS creature believes about them
  brain: Brain // tiny tfjs neural net — learns action preferences from experience
  language: LanguageState // vocabulary learned by association
  brainPrefs: number[] | null // cached brain inference (refreshed async, throttled)
  playerBond: number // 0..1 — how bonded to the player (shields from aging)
  ageLimit: number // ticks until natural aging begins (genetic)
  inventory: Inventory // items the creature bought and keeps
  vengeance: VengeanceState // grudges + revenge planning
  talkingTo: number | null // creature id being talked to (stops to interact)
  busyTicks: number // remaining ticks of a committed interaction (talk/fight)
  want: import('./wants').Want // current Sims-style desire (icon above head)
  /** Multidimensional directed relationships (asymmetric). */
  social: SocialGraph
  /** Simplified psyche connecting stress, belonging, values, mood. */
  psyche: Psyche
  /** Household / family id, if any. */
  householdId: number | null
  /** Parent ids for family tree (empty = founder). */
  parentIds: number[]
  /** Recent NL lines for inspector / speech bubbles (capped). */
  recentDialogue: string[]
  /** Illness 0..1 — treated at clinic; pharmacy sells medicine. */
  illness: number
  /** Injury 0..1 — physical wounds, treated differently from illness. */
  injury: number
  /** What this creature thinks is true, with confidence and provenance. */
  beliefs: BeliefStore
  /** Repeated behavior biases (learned routine). */
  habits: HabitStore
  /** Claimed job role, if any (shopkeep, healer, bartender, …). */
  job: string | null
  /** Cached life stage; recomputed as the creature ages. */
  stage: LifeStage
  /** Ticks spent pressed against an obstacle without progress. */
  stuckTicks: number
  /** Which way this creature prefers to walk around a wall (+1 / -1). */
  detourSign: number
  knowsTower(towerId: string): boolean
  learnTower(towerId: string): void
  hurt(amount: number): void
  pay(amount: number): boolean
  deposit(amount: number): void
  withdraw(amount: number): void
  work(amount: number): void
  sleep(): void
  wake(): void
  eat(): void
  socialize(other: Creature): void
  tryPair(other: Creature): void
}

const NAMES = ['Bobo', 'Nana', 'Momo', 'Gigi', 'Kiko', 'Lulu', 'Tutu', 'Fifi', 'Roro', 'Dodo', 'Zizi', 'Pepi']

export function createCreature(id: number, name: string, genome: Genome, x = 0, z = 0): Creature {
  const c: Creature = {
    id,
    name,
    genome,
    chem: createChem(),
    memory: createMemory(),
    pos: { x, z },
    facing: Math.random() * Math.PI * 2,
    wallet: 0,
    banked: 0,
    alive: true,
    sleeping: false,
    action: 'idle',
    goalTowerId: null,
    gangId: null,
    partnerId: null,
    bonds: {},
    age: 0,
    weapon: null,
    fightCooldown: 0,
    workProgress: 0,
    gratitude: {},
    intention: null,
    intentionTicks: 0,
    education: 0,
    buried: false,
    jealousy: 0,
    drives: createDrives(),
    knowledge: {},
    emotions: createEmotions(),
    reputation: {},
    brain: createBrain(16, 20),
    language: createLanguage(id),
    brainPrefs: null,
    playerBond: 0,
    ageLimit: ageLimitFor(Math.random()),
    inventory: createInventory(),
    vengeance: createVengeance(),
    talkingTo: null,
    busyTicks: 0,
    want: createWant(wantForState({ hunger: 0.8, energy: 0.8, social: 0.8, pleasure: 0.8 })),
    social: createSocialGraph(),
    psyche: createPsyche({ genome }),
    householdId: null,
    parentIds: [],
    recentDialogue: [],
    illness: 0,
    injury: 0,
    beliefs: createBeliefs(),
    habits: createHabits(),
    job: null,
    stage: lifeStageFor(0),
    stuckTicks: 0,
    detourSign: id % 2 === 0 ? 1 : -1,
    knowsTower(towerId: string): boolean {
      return (c.knowledge[towerId] ?? 0) > 0.3
    },
    learnTower(towerId: string): void {
      c.knowledge[towerId] = Math.min(1, (c.knowledge[towerId] ?? 0) + 1) // one sight = you know where it is
    },
    hurt(amount: number): void {
      if (!c.alive) return
      c.chem.health = clamp01(c.chem.health - amount)
      c.chem.fear = clamp01(c.chem.fear + amount * 0.6)
      if (c.chem.health <= 0) c.alive = false
    },
    pay(amount: number): boolean {
      if (c.wallet < amount) return false
      c.wallet -= amount
      return true
    },
    deposit(amount: number): void {
      const amt = Math.min(amount, c.wallet)
      c.wallet -= amt
      c.banked += amt
    },
    withdraw(amount: number): void {
      const amt = Math.min(amount, c.banked)
      c.banked -= amt
      c.wallet += amt
    },
    work(amount: number): void {
      c.wallet += amount
    },
    sleep(): void {
      applySleep(c.chem)
      c.sleeping = true
    },
    wake(): void {
      c.sleeping = false
    },
    eat(): void {
      applyFood(c.chem)
    },
    socialize(other: Creature): void {
      applySocial(c.chem)
      applySocial(other.chem)
      const gain = 0.06 + c.genome.sociability * 0.06 + other.genome.sociability * 0.04
      c.bonds[other.id] = clamp01((c.bonds[other.id] ?? 0) + gain)
      other.bonds[c.id] = clamp01((other.bonds[c.id] ?? 0) + gain)
      if (c.partnerId === null && c.bonds[other.id] > 0.6 && other.partnerId === null) {
        c.partnerId = other.id
        other.partnerId = c.id
        c.chem.bond = clamp01(c.chem.bond + 0.3)
        other.chem.bond = clamp01(other.chem.bond + 0.3)
      }
    },
    tryPair(other: Creature): void {
      if (c.partnerId === null && other.partnerId === null && c.bonds[other.id] > 0.5) {
        c.partnerId = other.id
        other.partnerId = c.id
      }
    },
  }
  return c
}

export function randomName(rng: () => number): string {
  return NAMES[Math.floor(rng() * NAMES.length)]
}
