/**
 * creature — one Luma: a body, a set of drives and a brain wired to both.
 *
 * There is deliberately very little state here beyond those three things. If
 * something can be derived from the drives or read out of the brain, it is not
 * stored — that is what keeps what you see in the neural interface honest,
 * because there is no second, hidden copy of the creature's mind for the
 * animation and the dialogue to consult instead.
 */
import { createBrain, emptySenses, type Action, type Brain, type Senses } from './brain'
import { createDrives, type Drives } from './drives'
import { clamp01 } from './rng'

export interface Genome {
  /** body colour */
  hue: number
  /** 0 small .. 1 large */
  size: number
  /** how fast they walk and how quickly they tire */
  energy: number
  /** how close they will let you get before they mind */
  boldness: number
  /** how readily they explore rather than settle */
  curiosity: number
  /** how much they talk */
  chatter: number
  /** how fast the drives climb */
  metabolism: number
}

export function randomGenome(rand: () => number): Genome {
  return {
    hue: rand(),
    size: rand(),
    energy: 0.3 + rand() * 0.6,
    boldness: 0.2 + rand() * 0.7,
    curiosity: 0.2 + rand() * 0.7,
    chatter: 0.25 + rand() * 0.7,
    metabolism: 0.75 + rand() * 0.5,
  }
}

/** What a Luma is doing with its body right now. */
export type Posture = 'stand' | 'walk' | 'run' | 'sit' | 'sleep' | 'eat' | 'drink' | 'play' | 'listen' | 'cower'

export interface Creature {
  id: number
  name: string
  genome: Genome
  brain: Brain
  drives: Drives

  x: number
  z: number
  /** where they are heading, in world space */
  vx: number
  vz: number
  facing: number

  /** seconds lived */
  age: number

  action: Action
  posture: Posture
  /** where the current action is taking them: the last leg of the route */
  target: { x: number; z: number } | null
  /**
   * The legs still to walk, in order. Doors are legs, which is how a Luma
   * gets out of a building without trying to walk through the wall.
   */
  route: Array<{ x: number; z: number }>
  /**
   * How long the current action has been running, in seconds — reset when
   * the walking part finishes, so that the time spent getting somewhere is
   * not counted against the time spent doing the thing.
   */
  actionTime: number
  /** true once the route is walked and the action proper has begun */
  arrived: boolean
  /** discomfort when the current action began, for the reward */
  discomfortAtStart: number

  /** who they are attending to: -1 is the player, >=0 another Luma */
  attending: number | null
  attentionLeft: number
  /** true while they have stopped to listen to you */
  listening: boolean

  /** what they have come to feel about the player */
  trust: number
  threat: number

  /** the building they are standing in */
  inside: string | null

  asleep: boolean
  /** 0..1 visible alarm, drives the animation and the icon over their head */
  alarm: number

  /** the last thing they said, for the speech bubble */
  said: string
  saidAt: number
  /** words heard in the last moment, fed to the brain */
  heard: string[]

  senses: Senses

  /** stuck detection */
  lastX: number
  lastZ: number
  stuckFor: number

  /** a short log of what has happened to them, for chat and the interface */
  recent: string[]
}

const NAMES = [
  'Pip', 'Sable', 'Moss', 'Wren', 'Tobble', 'Fen', 'Juniper', 'Bramble',
  'Nim', 'Ora', 'Quill', 'Rowan',
]

export function nameFor(index: number, rand: () => number): string {
  return NAMES[index % NAMES.length] ?? `Luma ${Math.floor(rand() * 900 + 100)}`
}

export function createCreature(id: number, x: number, z: number, rand: () => number): Creature {
  const genome = randomGenome(rand)
  return {
    id,
    name: nameFor(id, rand),
    genome,
    brain: createBrain(rand),
    drives: createDrives(() => rand()),
    x,
    z,
    vx: 0,
    vz: 0,
    facing: rand() * Math.PI * 2,
    age: 0,
    action: 'wander',
    posture: 'stand',
    target: null,
    route: [],
    actionTime: 0,
    arrived: false,
    discomfortAtStart: 0,
    attending: null,
    attentionLeft: 0,
    listening: false,
    trust: 0.3,
    threat: 0,
    inside: null,
    asleep: false,
    alarm: 0,
    said: '',
    saidAt: -99,
    heard: [],
    senses: emptySenses(),
    lastX: x,
    lastZ: z,
    stuckFor: 0,
    recent: [],
  }
}

/** How fast this Luma walks, in metres per second. Calm by design. */
export function walkSpeed(c: Creature): number {
  return 1.05 + c.genome.energy * 0.5
}

/** How fast they move when frightened. Faster than you walk, but not by much. */
export function fleeSpeed(c: Creature): number {
  return 3.4 + c.genome.energy * 1.2
}

/** Body radius. Small: they are people-sized, not barrels. */
export function bodyRadius(c: Creature): number {
  return 0.26 + c.genome.size * 0.06
}

export function bodyHeight(c: Creature): number {
  return 1.15 + c.genome.size * 0.28
}

export function remember(c: Creature, line: string): void {
  c.recent.push(line)
  if (c.recent.length > 8) c.recent.shift()
}

/** How much they like you, as one number, for the HUD. */
export function regard(c: Creature): number {
  return clamp01(c.trust - c.threat * 0.9)
}
