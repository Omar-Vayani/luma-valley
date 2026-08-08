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
  version: 2
  seed: number
  settings: { gentle: boolean }
  world: WorldState
  creatures: SavedCreature[]
  nextId: number
  time: number
  extra?: { carriedId?: number | null }
  player: {
    pos: { x: number; z: number }
    facingYaw: number
    inventory: { berries: number; wood: number; torch: number; items?: Record<string, number> }
    torchLit: boolean
    sanity: number
  }
  quests: {
    active: string | null
    progress: Record<string, number>
    completed: string[]
    unlocked: string[]
  }
  shadowBeasts: { id: number; pos: { x: number; z: number }; state: string; health: number; targetId: number | null }[]
  beastNextId: number
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
  psyche: {
    memories: { trigger: string; intensity: number }[]
    baselineFear: number
    trust: number
    addiction: Record<string, number>
    lastDose: Record<string, number>
  }
  mind: {
    episodes: { id: number; kind: string; pos: { x: number; z: number }; entityId: number | null; valence: number; intensity: number; tick: number }[]
    affinity: Record<string, number>
    curiosity: number
  }
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
  player: { pos: { x: number; z: number }; facingYaw: number; inventory: { berries: number; wood: number; torch: number; items?: Record<string, number> }; torchLit: boolean; sanity: number },
  quests: { active: string | null; progress: Record<string, number>; completed: string[]; unlocked: string[] },
  shadowBeasts: { id: number; pos: { x: number; z: number }; state: string; health: number; targetId: number | null }[],
  beastNextId: number,
): SaveData {
  return {
    version: 2,
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
      psyche: {
        memories: c.psyche.memories.map((m) => ({ trigger: m.trigger, intensity: Math.round(m.intensity * 100) / 100 })),
        baselineFear: Math.round(c.psyche.baselineFear * 100) / 100,
        trust: Math.round(c.psyche.trust * 100) / 100,
        addiction: { ...c.psyche.addiction },
        lastDose: { ...c.lastDose },
      },
      mind: {
        episodes: c.mind.episodes.map((e) => ({ id: e.id, kind: e.kind, pos: { ...e.pos }, entityId: e.entityId, valence: Math.round(e.valence * 100) / 100, intensity: Math.round(e.intensity * 100) / 100, tick: e.tick })),
        affinity: { ...c.mind.affinity },
        curiosity: Math.round(c.mind.curiosity * 100) / 100,
      },
    })),
    nextId,
    time,
    player,
    quests,
    shadowBeasts,
    beastNextId,
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
    if (sc.psyche) {
      c.psyche.memories = sc.psyche.memories.map((m, i) => ({
        id: i + 1,
        trigger: m.trigger as 'shadow' | 'player' | 'drop' | 'fire' | 'noise' | 'poison' | 'abandonment',
        intensity: m.intensity,
        createdAt: c.age,
        healTimer: 0,
      }))
      c.psyche.baselineFear = sc.psyche.baselineFear ?? 0
      c.psyche.trust = sc.psyche.trust ?? 0.5
      c.psyche.addiction = { smoke: 0, sugar: 0, cactus: 0, mushroom: 0, ...(sc.psyche.addiction ?? {}) }
      c.lastDose = { smoke: -9999, sugar: -9999, cactus: -9999, mushroom: -9999, ...(sc.psyche.lastDose ?? {}) }
    }
    if (sc.mind) {
      c.mind.episodes = sc.mind.episodes.map((e) => ({ id: e.id, kind: e.kind as 'food' | 'scare' | 'friend' | 'water' | 'player-kind' | 'player-cruel', pos: { ...e.pos }, entityId: e.entityId, valence: e.valence, intensity: e.intensity, tick: e.tick }))
      c.mind.affinity = { ...(sc.mind.affinity ?? {}) }
      c.mind.curiosity = sc.mind.curiosity ?? 0.5
    }
    c.journal = sc.journal.map((j) => ({ ...j }))
    creatures.push(c)
  }
}

export function saveSizeKb(data: SaveData): number {
  return JSON.stringify(data).length / 1024
}
