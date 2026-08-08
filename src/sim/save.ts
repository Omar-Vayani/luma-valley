import { Creature } from './creature'
import { Brain } from './brain'
import { World } from './world'
import type { WorldState } from './world'
import type { ChemicalState } from './biochem'
import { describeGenome, type Genome } from './genetics'

/**
 * Save — compact serialization for one player's whole world.
 * Target: small file (a valley with ~8 creatures ≈ a few dozen KB).
 */

export interface SaveData {
  version: 1
  seed: number
  settings: { gentle: boolean }
  world: WorldState
  creatures: SavedCreature[]
  nextId: number
  time: number
  extra?: { carriedId?: number | null }
}

export interface SavedCreature {
  id: number
  name: string
  genome: Genome
  brain: CompactBrain
  chem: ChemicalState
  pos: { x: number; z: number }
  facing: number
  age: number
  alive: boolean
  sleeping: boolean
  action: string
  learnedWords: Record<string, { kind: string }>
  journal: { tick: number; text: string }[]
}

/** Compact brain: rounded tuples, no transient eligibility/state. */
export interface CompactBrain {
  config: ReturnType<Brain['snapshot']>['config']
  neurons: Array<[number, number, number, number]> // [th, leak, bias, act]
  dendrites: Array<[number, number, number]> // [from, to, weight]
}

const r4 = (x: number) => Math.round(x * 10000) / 10000

function compactBrain(b: Brain): CompactBrain {
  return {
    config: { ...b.config },
    neurons: b.neurons.map((n) => [r4(n.th), r4(n.leak), r4(n.bias), r4(n.act)]),
    dendrites: b.dendrites.map((d) => [d.from, d.to, r4(d.weight)]),
  }
}

function restoreBrain(c: CompactBrain): Brain {
  const b = new Brain(c.config, () => 0)
  for (let i = 0; i < b.neurons.length; i++) {
    const [th, leak, bias, act] = c.neurons[i] ?? [b.neurons[i].th, b.neurons[i].leak, b.neurons[i].bias, 0]
    b.neurons[i].th = th
    b.neurons[i].leak = leak
    b.neurons[i].bias = bias
    b.neurons[i].act = act
    b.neurons[i].st = 0
    b.neurons[i].sg = 0
  }
  b.dendrites = c.dendrites.map(([from, to, weight]) => ({ from, to, weight, el: 0 }))
  return b
}

export function buildSave(
  world: World,
  creatures: Creature[],
  settings: { gentle: boolean },
  nextId: number,
  time: number,
): SaveData {
  return {
    version: 1,
    seed: world.state.seed,
    settings,
    world: world.toJSON(),
    creatures: creatures.map((c) => ({
      id: c.id,
      name: c.name,
      genome: c.genome,
      brain: compactBrain(c.brain),
      chem: { ...c.chem },
      pos: { ...c.pos },
      facing: c.facing,
      age: c.age,
      alive: c.alive,
      sleeping: c.sleeping,
      action: c.action,
      learnedWords: c.learnedWords,
      journal: c.journal.map((j) => ({ ...j })),
    })),
    nextId,
    time,
  }
}

export function applySave(data: SaveData, world: World, creatures: Creature[]): void {
  world.state = data.world
  creatures.length = 0
  for (const sc of data.creatures) {
    const c = new Creature(sc.genome, world.rng, sc.id, sc.age, sc.name)
    c.traits = describeGenome(sc.genome)
    c.brain = restoreBrain(sc.brain)
    c.chem = { ...sc.chem }
    c.pos = { ...sc.pos }
    c.facing = sc.facing
    c.age = sc.age
    c.alive = sc.alive
    c.sleeping = sc.sleeping
    c.action = sc.action as Creature['action']
    c.learnedWords = Object.fromEntries(
      Object.entries(sc.learnedWords).map(([k, v]) => [k, { kind: v.kind as 'food' | 'water' | 'come' }]),
    )
    c.journal = sc.journal.map((j) => ({ ...j }))
    creatures.push(c)
  }
}

export function saveSizeKb(data: SaveData): number {
  return JSON.stringify(data).length / 1024
}
