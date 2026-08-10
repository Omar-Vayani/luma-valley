/**
 * save — deep-state persistence for the test lab.
 * No 70KB cap anymore: brains, memories, vendettas, bonds all persist.
 * version 3 rejects old observer-city saves cleanly.
 */
import { createSim, type Sim } from './sim'
import { createCreature } from './creature'
import { createChem, type ChemState } from './chem'
import { createMemory, type MemoryState } from './memory'
import { createEconomy, type Economy } from './economy'
import { createDrives, type Drives } from './drives'
import { createBrain } from './brain'
import type { ActionName } from './mind'
import type { Genome } from './genetics'
import { mulberry32 } from './rng'

export const SAVE_VERSION = 4

export interface LabSave {
  version: 4
  seed: number
  time: number
  nextId: number
  creatures: SavedCreature[]
  drops: { kind: 'food' | 'money'; x: number; z: number; amount: number }[]
  graves: { creatureId: number; name: string; x: number; z: number; tick: number }[]
  economy: Economy
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
  brain: { w1: number[]; b1: number[]; w2: number[]; b2: number[] }
  vocab: { concept: string; word: string; strength: number }[]
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
    brain: c.brain.serialize(),
    vocab: Array.from(c.language.vocab.entries()).map(([concept, entry]) => ({ concept, word: entry.word, strength: entry.strength })),
  }))
  return {
    version: 4,
    seed: sim.seed,
    time: sim.time,
    nextId: sim.nextId,
    creatures,
    drops: sim.drops.map((d) => ({ ...d })),
    graves: sim.graves.map((g) => ({ ...g })),
    economy: JSON.parse(JSON.stringify(sim.economy)),
  }
}

export function loadSim(data: LabSave): Sim {
  if (data.version !== SAVE_VERSION) {
    throw new Error(`save version ${data.version} not supported (need ${SAVE_VERSION}) — old saves were rebuilt`)
  }
  const sim = createSim(data.seed)
  sim.time = data.time
  sim.nextId = data.nextId
  sim.creatures = data.creatures.map((sc) => {
    const c = createCreature(sc.id, sc.name, sc.genome, sc.pos.x, sc.pos.z)
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
    if (sc.brain) {
      c.brain = createBrain(c.brain.inputSize, c.brain.outputSize, sc.brain)
    }
    if (sc.vocab) {
      for (const v of sc.vocab) {
        c.language.vocab.set(v.concept, { word: v.word, strength: v.strength })
        c.language.wordToConcept.set(v.word, v.concept)
      }
    }
    return c
  })
  sim.rng = mulberry32(data.seed + data.time)
  sim.drops = (data.drops ?? []).map((d) => ({ ...d }))
  sim.graves = (data.graves ?? []).map((g) => ({ ...g }))
  sim.economy = data.economy ? JSON.parse(JSON.stringify(data.economy)) : createEconomy()
  return sim
}
