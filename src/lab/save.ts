/**
 * save — deep-state persistence for Luma Haven.
 * version 5 adds social graphs, psyche, households, illness, dialogue snippets.
 * Missing optional fields receive deterministic defaults for graceful recovery.
 * v4 saves still load (fields defaulted).
 */
import { createSim, type Sim } from './sim'
import { createCreature } from './creature'
import { createChem, type ChemState } from './chem'
import { createMemory, type MemoryState } from './memory'
import { createEconomy, type Economy } from './economy'
import { createDrives, type Drives } from './drives'
import { createEmotions, type EmotionState } from './emotions'
import type { ReputationMap } from './reputation'
import { createBrain } from './brain'
import type { ActionName } from './mind'
import type { Genome } from './genetics'
import { mulberry32 } from './rng'
import { createSocialGraph, type SocialGraph } from './socialbond'
import { createPsyche, type Psyche } from './psyche'
import type { HavenSociety } from './household'
import { createSociety } from './household'
import type { GameSettings } from './settings'
import { DEFAULT_SETTINGS } from './settings'
import { createBeliefs, createHabits, type BeliefStore, type HabitStore } from './beliefs'
import { createChatter, type ChatterState } from './chatter'
import { createCulture, type Culture } from './norms'
import { createJobBoard, type JobBoard } from './jobs'
import { createLedger, type Ledger } from './economy'
import { createStoryLog, type StoryLog } from './story'
import { lifeStageFor } from './lifecycle'
import { completeGenome } from './genetics'

export const SAVE_VERSION = 6

export interface LabSave {
  version: 4 | 5 | 6
  seed: number
  time: number
  nextId: number
  creatures: SavedCreature[]
  drops: { kind: 'food' | 'money'; x: number; z: number; amount: number }[]
  graves: { creatureId: number; name: string; x: number; z: number; tick: number }[]
  economy: Economy
  player: SavedPlayer
  society?: HavenSociety
  settings?: Partial<GameSettings>
  chatter?: ChatterState
  culture?: Culture
  jobs?: JobBoard
  ledger?: Ledger
  /** container contents keyed by fixture id (the furniture itself is rebuilt) */
  containers?: Record<string, { items: Record<string, number>; owners?: Record<string, number> }>
  /** the notable moments and why they happened */
  stories?: StoryLog
}

interface SavedCreature {
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
  fightCooldown: number
  workProgress: number
  gratitude: Record<number, number>
  intention: ActionName | null
  intentionTicks: number
  education: number
  buried: boolean
  jealousy: number
  drives: Drives
  knowledge: Record<string, number>
  emotions: EmotionState
  reputation: ReputationMap
  brain: { w1: number[]; b1: number[]; w2: number[]; b2: number[] }
  vocab: { concept: string; word: string; strength: number }[]
  inventory: { items: Record<string, number> }
  vengeance: { grudges: Record<string, { targetId: number; intensity: number; since: number }> }
  want: { type: string; progress: number; age: number; fulfilled: boolean }
  social?: SocialGraph
  psyche?: Psyche
  householdId?: number | null
  parentIds?: number[]
  recentDialogue?: string[]
  illness?: number
  injury?: number
  beliefs?: BeliefStore
  habits?: HabitStore
  job?: string | null
}

export interface SavedPlayer {
  pos: { x: number; z: number }
  facing: number
  health: number
  alive: boolean
  wallet: number
  inventory: { items: Record<string, number> }
  weapon: string | null
  bondWith: number[]
  name: string
  hunger: number
  language: { vocab: { concept: string; word: string; strength: number }[] }
}

export function saveSim(sim: Sim): LabSave {
  const creatures: SavedCreature[] = sim.creatures.map((c) => ({
    id: c.id,
    name: c.name,
    genome: c.genome,
    chem: JSON.parse(JSON.stringify(c.chem)),
    memory: JSON.parse(JSON.stringify(c.memory)),
    pos: { ...c.pos },
    facing: c.facing,
    wallet: c.wallet,
    banked: c.banked,
    alive: c.alive,
    sleeping: c.sleeping,
    action: c.action,
    goalTowerId: c.goalTowerId,
    gangId: c.gangId,
    partnerId: c.partnerId,
    bonds: { ...c.bonds },
    age: c.age,
    weapon: c.weapon,
    fightCooldown: c.fightCooldown,
    workProgress: c.workProgress,
    gratitude: { ...c.gratitude },
    intention: c.intention,
    intentionTicks: c.intentionTicks,
    education: c.education,
    buried: c.buried,
    jealousy: c.jealousy,
    drives: { ...c.drives },
    knowledge: { ...c.knowledge },
    emotions: { ...c.emotions },
    reputation: JSON.parse(JSON.stringify(c.reputation)),
    brain: c.brain.serialize(),
    vocab: Array.from(c.language.vocab.entries()).map(([concept, entry]) => ({
      concept,
      word: entry.word,
      strength: entry.strength,
    })),
    inventory: { items: { ...c.inventory.items } },
    vengeance: {
      grudges: Object.fromEntries(
        Object.entries(c.vengeance.grudges).map(([k, g]) => [k, { ...g }]),
      ),
    },
    want: {
      type: c.want.type,
      progress: c.want.progress,
      age: c.want.age,
      fulfilled: c.want.fulfilled,
    },
    social: JSON.parse(JSON.stringify(c.social)),
    psyche: JSON.parse(JSON.stringify(c.psyche)),
    householdId: c.householdId,
    parentIds: [...c.parentIds],
    recentDialogue: [...c.recentDialogue],
    illness: c.illness,
    injury: c.injury,
    beliefs: JSON.parse(JSON.stringify(c.beliefs)),
    habits: { ...c.habits },
    job: c.job,
  }))
  return {
    version: 6,
    seed: sim.seed,
    time: sim.time,
    nextId: sim.nextId,
    creatures,
    drops: sim.drops.map((d) => ({ ...d })),
    graves: sim.graves.map((g) => ({ ...g })),
    economy: JSON.parse(JSON.stringify(sim.economy)),
    player: {
      pos: { ...sim.player.pos },
      facing: sim.player.facing,
      health: sim.player.health,
      alive: sim.player.alive,
      wallet: sim.player.wallet,
      inventory: { items: { ...sim.player.inventory.items } },
      weapon: sim.player.weapon,
      bondWith: [...sim.player.bondWith],
      name: sim.player.name,
      hunger: sim.player.hunger,
      language: {
        vocab: Array.from(sim.player.language.vocab.entries()).map(([concept, entry]) => ({
          concept,
          word: entry.word,
          strength: entry.strength,
        })),
      },
    },
    society: JSON.parse(JSON.stringify(sim.society)),
    settings: { ...sim.settings },
    chatter: JSON.parse(JSON.stringify(sim.chatter)),
    culture: JSON.parse(JSON.stringify(sim.culture)),
    jobs: JSON.parse(JSON.stringify(sim.jobs)),
    ledger: JSON.parse(JSON.stringify(sim.ledger)),
    stories: JSON.parse(JSON.stringify(sim.stories)),
    containers: Object.fromEntries(
      sim.fixtures
        .filter((f) => f.storage && Object.keys(f.storage.items).length > 0)
        .map((f) => [f.id, JSON.parse(JSON.stringify(f.storage))]),
    ),
  }
}

/** Oldest save version this build can still read. */
export const MIN_SAVE_VERSION = 4

export function loadSim(data: LabSave): Sim {
  if (data.version < MIN_SAVE_VERSION || data.version > SAVE_VERSION) {
    throw new Error(
      `save version ${data.version} not supported (need ${MIN_SAVE_VERSION}–${SAVE_VERSION}) — old saves were rebuilt`,
    )
  }
  const sim = createSim(data.seed)
  sim.time = data.time
  sim.nextId = data.nextId
  if (data.settings) sim.settings = { ...DEFAULT_SETTINGS, ...data.settings }
  sim.society = data.society ? JSON.parse(JSON.stringify(data.society)) : createSociety()
  sim.chatter = data.chatter ? JSON.parse(JSON.stringify(data.chatter)) : createChatter()
  sim.culture = data.culture
    ? { ...createCulture(), ...JSON.parse(JSON.stringify(data.culture)) }
    : createCulture()
  sim.jobs = data.jobs ? JSON.parse(JSON.stringify(data.jobs)) : createJobBoard()
  sim.ledger = data.ledger ? JSON.parse(JSON.stringify(data.ledger)) : createLedger()
  sim.stories = data.stories ? JSON.parse(JSON.stringify(data.stories)) : createStoryLog()
  if (data.containers) {
    for (const f of sim.fixtures) {
      const saved = data.containers[f.id]
      if (f.storage && saved) {
        f.storage.items = { ...saved.items } as typeof f.storage.items
        f.storage.owners = { ...saved.owners } as typeof f.storage.owners
      }
    }
  }

  sim.creatures = data.creatures.map((sc) => {
    const c = createCreature(sc.id, sc.name, completeGenome(sc.genome), sc.pos.x, sc.pos.z)
    c.chem = { ...createChem(), ...JSON.parse(JSON.stringify(sc.chem)) }
    c.memory = { ...createMemory(), ...JSON.parse(JSON.stringify(sc.memory)) }
    c.facing = sc.facing
    c.wallet = sc.wallet
    c.banked = sc.banked
    c.alive = sc.alive
    c.sleeping = sc.sleeping
    c.action = sc.action
    c.goalTowerId = sc.goalTowerId
    c.gangId = sc.gangId
    c.partnerId = sc.partnerId
    c.bonds = { ...sc.bonds }
    c.age = sc.age
    c.weapon = sc.weapon
    c.fightCooldown = sc.fightCooldown ?? 0
    c.workProgress = sc.workProgress ?? 0
    c.gratitude = { ...sc.gratitude }
    c.intention = sc.intention ?? null
    c.intentionTicks = sc.intentionTicks ?? 0
    c.education = sc.education ?? 0
    c.buried = sc.buried ?? false
    c.jealousy = sc.jealousy ?? 0
    c.drives = { ...(sc.drives ?? createDrives()) }
    c.knowledge = { ...sc.knowledge }
    c.emotions = { ...createEmotions(), ...sc.emotions }
    c.reputation = sc.reputation ? JSON.parse(JSON.stringify(sc.reputation)) : {}
    if (sc.brain) {
      c.brain = createBrain(c.brain.inputSize, c.brain.outputSize, sc.brain)
    }
    if (sc.vocab) {
      for (const v of sc.vocab) {
        c.language.vocab.set(v.concept, { word: v.word, strength: v.strength })
        c.language.wordToConcept.set(v.word, v.concept)
      }
    }
    if (sc.inventory?.items) {
      c.inventory.items = { ...sc.inventory.items }
    }
    if (sc.vengeance?.grudges) {
      for (const [k, g] of Object.entries(sc.vengeance.grudges)) {
        c.vengeance.grudges[Number(k)] = { ...g }
      }
    }
    if (sc.want) {
      c.want = {
        type: sc.want.type as never,
        progress: sc.want.progress,
        age: sc.want.age,
        fulfilled: sc.want.fulfilled,
      }
    }
    c.social = sc.social ? JSON.parse(JSON.stringify(sc.social)) : createSocialGraph()
    c.psyche = sc.psyche ? JSON.parse(JSON.stringify(sc.psyche)) : createPsyche(c)
    c.householdId = sc.householdId ?? null
    c.parentIds = sc.parentIds ? [...sc.parentIds] : []
    c.recentDialogue = sc.recentDialogue ? [...sc.recentDialogue] : []
    c.illness = sc.illness ?? 0
    c.injury = sc.injury ?? 0
    c.beliefs = sc.beliefs ? JSON.parse(JSON.stringify(sc.beliefs)) : createBeliefs()
    c.habits = sc.habits ? { ...sc.habits } : createHabits()
    c.job = sc.job ?? null
    c.stage = lifeStageFor(c.age)
    return c
  })
  sim.rng = mulberry32(data.seed + data.time)
  sim.drops = (data.drops ?? []).map((d) => ({ ...d }))
  sim.graves = (data.graves ?? []).map((g) => ({ ...g }))
  sim.economy = data.economy ? JSON.parse(JSON.stringify(data.economy)) : createEconomy()
  if (data.player) {
    const sp = data.player
    sim.player.pos = { ...sp.pos }
    sim.player.facing = sp.facing
    sim.player.health = sp.health
    sim.player.alive = sp.alive
    sim.player.wallet = sp.wallet
    sim.player.inventory.items = { ...sp.inventory.items }
    sim.player.weapon = sp.weapon as import('./inventory').ItemId | null
    sim.player.bondWith = [...sp.bondWith]
    sim.player.name = sp.name
    sim.player.hunger = sp.hunger ?? 0.75
    if (sp.language?.vocab) {
      for (const v of sp.language.vocab) {
        sim.player.language.vocab.set(v.concept, { word: v.word, strength: v.strength })
        sim.player.language.wordToConcept.set(v.word, v.concept)
      }
    }
  }
  return sim
}
