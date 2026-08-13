/**
 * save — the valley, written down.
 *
 * Two things are stored, in two keys, because they change at very different
 * rates. The world (creatures, brains, drives, the clock) is written every
 * half minute. The conversation log is written the moment a line is said,
 * because losing what somebody told you is far more annoying than losing
 * thirty seconds of walking about.
 */
import { loadBrain, saveBrain, type BrainSave } from './brain'
import { createCreature, type Creature } from './creature'
import { mulberry32 } from './rng'
import { Sim } from './sim'

const WORLD_KEY = 'luma.world.v3'
const CHAT_KEY = 'luma.chat.v3'
export const SAVE_VERSION = 3

interface CreatureSave {
  id: number
  name: string
  genome: Creature['genome']
  drives: Creature['drives']
  brain: BrainSave
  x: number
  z: number
  trust: number
  threat: number
  age: number
}

export interface WorldSave {
  version: number
  seed: number
  time: number
  berries: number
  player: { x: number; z: number }
  food: Array<[string, number]>
  creatures: CreatureSave[]
}

export function serialize(sim: Sim): WorldSave {
  return {
    version: SAVE_VERSION,
    seed: sim.seed,
    time: sim.time,
    berries: sim.player.berries,
    player: { x: sim.player.x, z: sim.player.z },
    food: sim.village.places
      .filter((p) => p.kind === 'food')
      .map((p) => [p.id, Math.round((p.amount ?? 0) * 100) / 100] as [string, number]),
    creatures: sim.creatures.map((c) => ({
      id: c.id,
      name: c.name,
      genome: c.genome,
      drives: { ...c.drives },
      brain: saveBrain(c.brain),
      x: Math.round(c.x * 100) / 100,
      z: Math.round(c.z * 100) / 100,
      trust: c.trust,
      threat: c.threat,
      age: Math.round(c.age),
    })),
  }
}

export function deserialize(save: WorldSave): Sim {
  const sim = new Sim({ seed: save.seed, creatures: save.creatures.length })
  sim.time = save.time ?? sim.time
  sim.player.berries = save.berries ?? 3
  if (save.player) {
    sim.player.x = save.player.x
    sim.player.z = save.player.z
  }
  for (const [id, amount] of save.food ?? []) {
    const place = sim.village.places.find((p) => p.id === id)
    if (place) place.amount = amount
  }
  sim.creatures.length = 0
  for (const s of save.creatures) {
    const rand = mulberry32(save.seed + s.id * 7919)
    const c = createCreature(s.id, s.x, s.z, rand)
    c.name = s.name
    c.genome = s.genome
    c.drives = { ...c.drives, ...s.drives }
    c.brain = loadBrain(s.brain, rand)
    c.trust = s.trust
    c.threat = s.threat
    c.age = s.age ?? 0
    c.lastX = c.x
    c.lastZ = c.z
    sim.creatures.push(c)
  }
  return sim
}

// ---------------------------------------------------------------- storage

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function saveWorld(sim: Sim): boolean {
  const store = storage()
  if (!store) return false
  try {
    store.setItem(WORLD_KEY, JSON.stringify(serialize(sim)))
    return true
  } catch {
    return false
  }
}

export function loadWorld(): Sim | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(WORLD_KEY)
    if (!raw) return null
    const save = JSON.parse(raw) as WorldSave
    if (save.version !== SAVE_VERSION || !Array.isArray(save.creatures)) return null
    return deserialize(save)
  } catch {
    return null
  }
}

export function clearWorld(): void {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(WORLD_KEY)
    store.removeItem(CHAT_KEY)
  } catch {
    // nothing to be done about it
  }
}

// ---------------------------------------------------------------- the chat log

export interface ChatLine {
  /** who said it */
  from: 'you' | 'them'
  text: string
  /** sim time it was said at */
  at: number
}

export type ChatLog = Record<number, ChatLine[]>

const MAX_LINES = 60

/**
 * The conversation, kept per creature and written through on every line.
 * This is the bug the old build had: the panel held the transcript in React
 * state, so closing it — or reloading — threw the conversation away.
 */
export class ChatStore {
  private log: ChatLog = {}

  constructor() {
    this.log = readChat()
  }

  lines(id: number): ChatLine[] {
    return this.log[id] ?? []
  }

  append(id: number, line: ChatLine): ChatLine[] {
    const list = this.log[id] ? [...this.log[id], line] : [line]
    if (list.length > MAX_LINES) list.splice(0, list.length - MAX_LINES)
    this.log[id] = list
    writeChat(this.log)
    return list
  }

  clear(id: number): void {
    delete this.log[id]
    writeChat(this.log)
  }

  clearAll(): void {
    this.log = {}
    writeChat(this.log)
  }
}

function readChat(): ChatLog {
  const store = storage()
  if (!store) return {}
  try {
    const raw = store.getItem(CHAT_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as ChatLog
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function writeChat(log: ChatLog): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(CHAT_KEY, JSON.stringify(log))
  } catch {
    // a full quota is not worth crashing a conversation over
  }
}
