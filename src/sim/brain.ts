/**
 * brain — the neural interface every Luma is driven by.
 *
 * The shape is borrowed from Creatures (1996): a stack of *lobes* wired to
 * each other by dendrites, with no scripted behaviour anywhere. Three lobes
 * do the work.
 *
 *   perception → concept → decision
 *
 * - **Perception** is one neuron per sense. Eight of them are the creature's
 *   own drives, the rest are what it can see and what it has learned to feel
 *   about the player.
 * - **Concept** is a sparse association layer. It is trained by Hebb's rule
 *   (in Oja's normalising form, so weights cannot run away): senses that keep
 *   firing together end up owning a neuron between them. Only the strongest
 *   few concepts survive each tick, so a situation is represented by three
 *   neurons rather than a smear across sixteen — which is what makes the
 *   interface readable rather than a heat haze.
 * - **Decision** is one neuron per action, trained by reinforcement. Every
 *   decision leaves an eligibility trace; when the drives later fall the trace
 *   is what the reward is paid into. That delay is the whole trick: eating is
 *   rewarding because hunger drops a second later, not because a rule says so.
 *
 * On top of that sits a small **word lobe**. A word heard while a concept is
 * lit gets bound to it, so vocabulary is learned the same way as everything
 * else, and a learned word can then drive behaviour on its own.
 *
 * Newborns are not blank. Creatures pre-trained its brains with "instincts"
 * during sleep, and so do we: `INSTINCTS` is run through the same
 * reinforcement path at birth, which means an instinct is visible in the
 * interface as ordinary synapse strength and can be overwritten by experience.
 */
import { DRIVE_KEYS } from './drives'
import { clamp, clamp01 } from './rng'

// ---------------------------------------------------------------- the lobes

/** Everything the perception lobe can be told, in a fixed order. */
export const SENSE_KEYS = [
  // the eight drives, straight in
  ...DRIVE_KEYS,
  // what is within reach of the senses
  'food', 'water', 'bed', 'fire', 'friend', 'toy',
  // the player, and what has been learned about them
  'player', 'playerClose', 'trust', 'threat',
  // circumstance
  'indoors', 'dark', 'heard', 'touched',
] as const

export type SenseKey = (typeof SENSE_KEYS)[number]
export type Senses = Record<SenseKey, number>

export const SENSE_LABEL: Partial<Record<SenseKey, string>> = {
  food: 'food in sight',
  water: 'water in sight',
  bed: 'bed in sight',
  fire: 'fire in sight',
  friend: 'friend near',
  toy: 'something to play with',
  player: 'you are near',
  playerClose: 'you are very close',
  trust: 'trusts you',
  threat: 'fears you',
  indoors: 'indoors',
  dark: 'night',
  heard: 'heard a word',
  touched: 'was touched',
}

/** Everything the decision lobe can choose to do. */
export const ACTIONS = [
  'wander', 'rest', 'eat', 'drink', 'sleep', 'play',
  'approach', 'flee', 'socialise', 'warm', 'shelter', 'listen',
] as const

export type Action = (typeof ACTIONS)[number]

export const ACTION_LABEL: Record<Action, string> = {
  wander: 'wander',
  rest: 'rest',
  eat: 'eat',
  drink: 'drink',
  sleep: 'sleep',
  play: 'play',
  approach: 'come to you',
  flee: 'run away',
  socialise: 'find a friend',
  warm: 'warm up',
  shelter: 'go inside',
  listen: 'listen',
}

export const SENSE_COUNT = SENSE_KEYS.length
export const CONCEPT_COUNT = 16
export const ACTION_COUNT = ACTIONS.length
/** How many concept neurons stay lit after lateral inhibition. */
const CONCEPT_WINNERS = 3

export function emptySenses(): Senses {
  const s = {} as Senses
  for (const k of SENSE_KEYS) s[k] = 0
  return s
}

// ---------------------------------------------------------------- the brain

export interface Brain {
  /** perception → concept, `[concept * SENSE_COUNT + sense]`. */
  wConcept: Float32Array
  /** concept → decision, `[concept * ACTION_COUNT + action]`. */
  wAction: Float32Array
  /** eligibility trace over `wAction`, decayed every tick. */
  trace: Float32Array
  /** live activation of each lobe, kept for the interface. */
  perception: Float32Array
  concept: Float32Array
  decision: Float32Array
  /** word → concept bindings, built as words are heard. */
  words: Map<string, Float32Array>
  /** word → action bindings, so a command can be obeyed directly. */
  commands: Map<string, Float32Array>
  /** how much has been learned, 0..1; drives exploration and confidence. */
  maturity: number
  /** the last reward paid, for the interface. */
  lastReward: number
  /** how much of the last choice was the brain rather than a coin toss. */
  lastConfidence: number
  chosen: Action
  /** rolling count of decisions made, for the interface. */
  decisions: number
}

const LEARN_HEBB = 0.045
const LEARN_REWARD = 0.55
const TRACE_DECAY = 0.72
const WEIGHT_LIMIT = 3

function seededNoise(rand: () => number): number {
  return (rand() - 0.5) * 0.12
}

export function createBrain(rand: () => number): Brain {
  const wConcept = new Float32Array(CONCEPT_COUNT * SENSE_COUNT)
  for (let i = 0; i < wConcept.length; i++) wConcept[i] = seededNoise(rand)
  const wAction = new Float32Array(CONCEPT_COUNT * ACTION_COUNT)
  for (let i = 0; i < wAction.length; i++) wAction[i] = seededNoise(rand) * 0.5

  const brain: Brain = {
    wConcept,
    wAction,
    trace: new Float32Array(CONCEPT_COUNT * ACTION_COUNT),
    perception: new Float32Array(SENSE_COUNT),
    concept: new Float32Array(CONCEPT_COUNT),
    decision: new Float32Array(ACTION_COUNT),
    words: new Map(),
    commands: new Map(),
    maturity: 0,
    lastReward: 0,
    lastConfidence: 0,
    chosen: 'wander',
    decisions: 0,
  }
  imprintInstincts(brain, rand)
  return brain
}

// ---------------------------------------------------------------- instincts

/**
 * What a Luma is born already believing. Each one is a sense that should push
 * towards an action; they are trained in rather than consulted at runtime, so
 * experience can argue with them and win.
 */
const INSTINCTS: Array<{ sense: SenseKey; action: Action; strength: number }> = [
  { sense: 'hunger', action: 'eat', strength: 1 },
  { sense: 'thirst', action: 'drink', strength: 1 },
  { sense: 'fatigue', action: 'sleep', strength: 0.9 },
  { sense: 'loneliness', action: 'socialise', strength: 0.7 },
  { sense: 'boredom', action: 'play', strength: 0.6 },
  { sense: 'boredom', action: 'wander', strength: 0.5 },
  { sense: 'cold', action: 'warm', strength: 0.8 },
  { sense: 'fear', action: 'flee', strength: 1.1 },
  { sense: 'pain', action: 'flee', strength: 0.8 },
  { sense: 'heard', action: 'listen', strength: 1.2 },
  { sense: 'food', action: 'eat', strength: 0.5 },
  { sense: 'water', action: 'drink', strength: 0.5 },
  { sense: 'dark', action: 'shelter', strength: 0.5 },
]

/**
 * Run the instincts through the ordinary learning path, the way Creatures
 * dreamt its instincts in. Each one becomes a synthetic experience: light up
 * the sense, let the concept lobe settle, then reward the matching action.
 */
function imprintInstincts(brain: Brain, rand: () => number): void {
  for (let pass = 0; pass < 14; pass++) {
    for (const inst of INSTINCTS) {
      const senses = emptySenses()
      senses[inst.sense] = 0.8 + rand() * 0.2
      perceive(brain, senses)
      const a = ACTIONS.indexOf(inst.action)
      for (let c = 0; c < CONCEPT_COUNT; c++) {
        const act = brain.concept[c]
        if (act <= 0) continue
        const i = c * ACTION_COUNT + a
        brain.wAction[i] = clamp(
          brain.wAction[i] + 0.06 * inst.strength * act,
          -WEIGHT_LIMIT,
          WEIGHT_LIMIT,
        )
      }
    }
  }
  brain.trace.fill(0)
  brain.concept.fill(0)
  brain.decision.fill(0)
}

// ---------------------------------------------------------------- perceiving

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

/**
 * Push a set of senses through the concept lobe and leave the result in
 * `brain.concept`. Lateral inhibition keeps only the strongest few, which is
 * what makes concepts distinct instead of everything meaning everything.
 */
export function perceive(brain: Brain, senses: Senses): void {
  const p = brain.perception
  for (let i = 0; i < SENSE_COUNT; i++) p[i] = clamp01(senses[SENSE_KEYS[i]])

  const raw = brain.concept
  for (let c = 0; c < CONCEPT_COUNT; c++) {
    let sum = 0
    const base = c * SENSE_COUNT
    for (let s = 0; s < SENSE_COUNT; s++) sum += brain.wConcept[base + s] * p[s]
    raw[c] = sigmoid(sum * 2.2 - 1.1)
  }

  // lateral inhibition: find the threshold that leaves CONCEPT_WINNERS alight
  let threshold = 0
  const sorted = Array.from(raw).sort((a, b) => b - a)
  threshold = sorted[Math.min(CONCEPT_WINNERS, sorted.length - 1)] ?? 0
  let total = 0
  for (let c = 0; c < CONCEPT_COUNT; c++) {
    raw[c] = raw[c] > threshold ? raw[c] - threshold : 0
    total += raw[c]
  }
  if (total > 0) {
    for (let c = 0; c < CONCEPT_COUNT; c++) raw[c] /= total
  }
}

/**
 * Hebbian learning on the concept lobe, in Oja's form so that a neuron that
 * keeps winning does not simply grow forever. Only run while awake and only
 * on the winners, which is what keeps concepts from blurring together.
 */
export function associate(brain: Brain, rate = LEARN_HEBB): void {
  const p = brain.perception
  for (let c = 0; c < CONCEPT_COUNT; c++) {
    const act = brain.concept[c]
    if (act <= 0.001) continue
    const base = c * SENSE_COUNT
    for (let s = 0; s < SENSE_COUNT; s++) {
      const w = brain.wConcept[base + s]
      brain.wConcept[base + s] = clamp(
        w + rate * act * (p[s] - act * w),
        -WEIGHT_LIMIT,
        WEIGHT_LIMIT,
      )
    }
  }
}

// ---------------------------------------------------------------- deciding

export interface Decision {
  action: Action
  /** 0..1 — how much the winner beat the field by. */
  confidence: number
  /** the score of every action, for the interface. */
  scores: Float32Array
}

/**
 * Choose what to do. `allowed` gates out what is physically impossible right
 * now (there is no eating without food in reach); everything else is left in
 * so the brain has something to be wrong about, and therefore something to
 * learn from.
 */
export function decide(
  brain: Brain,
  allowed: (a: Action) => boolean,
  rand: () => number,
  wordBias?: Float32Array | null,
  reflex?: Float32Array | null,
): Decision {
  const scores = brain.decision
  for (let a = 0; a < ACTION_COUNT; a++) {
    let sum = 0
    for (let c = 0; c < CONCEPT_COUNT; c++) {
      const act = brain.concept[c]
      if (act > 0) sum += brain.wAction[c * ACTION_COUNT + a] * act
    }
    if (wordBias) sum += wordBias[a]
    if (reflex) sum += reflex[a]
    scores[a] = sum
  }

  // exploration cools as the brain fills up, so the young try things and the
  // old have opinions
  const temperature = 0.55 - brain.maturity * 0.42

  let bestIndex = -1
  let best = -Infinity
  let runnerUp = -Infinity
  let totalWeight = 0
  const weights = new Float32Array(ACTION_COUNT)
  for (let a = 0; a < ACTION_COUNT; a++) {
    if (!allowed(ACTIONS[a])) {
      weights[a] = 0
      continue
    }
    const w = Math.exp(scores[a] / Math.max(0.08, temperature))
    weights[a] = w
    totalWeight += w
    if (scores[a] > best) {
      runnerUp = best
      best = scores[a]
      bestIndex = a
    } else if (scores[a] > runnerUp) {
      runnerUp = scores[a]
    }
  }

  let picked = bestIndex
  if (totalWeight > 0) {
    let roll = rand() * totalWeight
    for (let a = 0; a < ACTION_COUNT; a++) {
      roll -= weights[a]
      if (roll <= 0) {
        picked = a
        break
      }
    }
  }
  if (picked < 0) picked = ACTIONS.indexOf('wander')

  const confidence = runnerUp === -Infinity ? 1 : clamp01((best - runnerUp) / 1.2)
  brain.chosen = ACTIONS[picked]
  brain.lastConfidence = confidence
  brain.decisions++
  brain.maturity = clamp01(brain.maturity + 0.0016)
  return { action: brain.chosen, confidence, scores }
}

/**
 * Remember that this action was taken in this state, so that a reward arriving
 * later has somewhere to land.
 */
export function markChoice(brain: Brain, action: Action): void {
  const a = ACTIONS.indexOf(action)
  if (a < 0) return
  for (let c = 0; c < CONCEPT_COUNT; c++) {
    const act = brain.concept[c]
    if (act <= 0) continue
    const i = c * ACTION_COUNT + a
    brain.trace[i] = clamp(brain.trace[i] + act, 0, 4)
  }
}

/**
 * Pay a reward straight into what the creature is doing *at this moment*,
 * rather than into the fading trace of everything it has done lately.
 *
 * This is the hand-on-the-head path: a smack or a scratch behind the ears is
 * feedback about the behaviour in front of you, and attributing it to a choice
 * made ten seconds ago is how a creature ends up learning that running away
 * from a beating is the thing it is being beaten for. The trace is damped
 * afterwards so the same feedback is not paid twice.
 */
export function reinforceAction(brain: Brain, action: Action, reward: number): void {
  const a = ACTIONS.indexOf(action)
  if (a < 0) return
  const r = clamp(reward, -1, 1)
  brain.lastReward = r
  for (let c = 0; c < CONCEPT_COUNT; c++) {
    const act = brain.concept[c]
    if (act <= 0) continue
    const i = c * ACTION_COUNT + a
    brain.wAction[i] = clamp(brain.wAction[i] + LEARN_REWARD * r * act, -WEIGHT_LIMIT, WEIGHT_LIMIT)
  }
  for (let i = 0; i < brain.trace.length; i++) brain.trace[i] *= 0.3
}

/**
 * Pay a reward into whatever the eligibility trace is still holding. Positive
 * for drives that fell, negative for drives that rose. This is the delayed
 * path, and the only reason eating can be rewarding when hunger does not fall
 * until a second later.
 */
export function reinforce(brain: Brain, reward: number): void {
  const r = clamp(reward, -1, 1)
  brain.lastReward = r
  if (r !== 0) {
    for (let i = 0; i < brain.trace.length; i++) {
      const e = brain.trace[i]
      if (e <= 0) continue
      brain.wAction[i] = clamp(
        brain.wAction[i] + LEARN_REWARD * r * e,
        -WEIGHT_LIMIT,
        WEIGHT_LIMIT,
      )
    }
  }
  for (let i = 0; i < brain.trace.length; i++) brain.trace[i] *= TRACE_DECAY
}

// ---------------------------------------------------------------- vocabulary

/**
 * Hear a word. Whatever the concept lobe is doing at this moment is what the
 * word comes to mean — which is why teaching works by saying "food" while
 * holding food, and why saying it at random teaches nonsense.
 */
export function hearWord(brain: Brain, word: string, strength = 1): void {
  const key = word.toLowerCase()
  let binding = brain.words.get(key)
  if (!binding) {
    binding = new Float32Array(CONCEPT_COUNT)
    brain.words.set(key, binding)
  }
  for (let c = 0; c < CONCEPT_COUNT; c++) {
    const act = brain.concept[c]
    binding[c] = clamp(binding[c] + 0.34 * strength * (act - binding[c] * 0.25), 0, 2)
  }
}

/**
 * Bind a word straight to an action. Used when the player says a word and the
 * creature is then rewarded for what it did — the way "come" becomes a command
 * rather than a noise.
 */
export function bindCommand(brain: Brain, word: string, action: Action, strength: number): void {
  const key = word.toLowerCase()
  let binding = brain.commands.get(key)
  if (!binding) {
    binding = new Float32Array(ACTION_COUNT)
    brain.commands.set(key, binding)
  }
  const a = ACTIONS.indexOf(action)
  if (a < 0) return
  binding[a] = clamp(binding[a] + strength, -2.5, 2.5)
}

/** How strongly a word is understood at all, 0..1. */
export function wordStrength(brain: Brain, word: string): number {
  const key = word.toLowerCase()
  let total = 0
  const concept = brain.words.get(key)
  if (concept) for (const v of concept) total += v
  const command = brain.commands.get(key)
  if (command) for (const v of command) total += Math.abs(v)
  return clamp01(total / 2.4)
}

/**
 * The push a heard word gives the decision lobe: whatever it has been bound
 * to directly, plus whatever the concepts it evokes would have wanted.
 */
export function wordBias(brain: Brain, words: string[]): Float32Array | null {
  if (words.length === 0) return null
  const bias = new Float32Array(ACTION_COUNT)
  let any = false
  for (const raw of words) {
    const word = raw.toLowerCase()
    const command = brain.commands.get(word)
    if (command) {
      for (let a = 0; a < ACTION_COUNT; a++) bias[a] += command[a]
      any = true
    }
    const concept = brain.words.get(word)
    if (concept) {
      for (let c = 0; c < CONCEPT_COUNT; c++) {
        const strength = concept[c]
        if (strength <= 0.02) continue
        for (let a = 0; a < ACTION_COUNT; a++) {
          bias[a] += brain.wAction[c * ACTION_COUNT + a] * strength * 0.5
        }
      }
      any = true
    }
  }
  return any ? bias : null
}

// ---------------------------------------------------------------- the readout

export interface Synapse {
  from: string
  to: string
  weight: number
}

export interface BrainSnapshot {
  perception: Array<{ key: SenseKey; value: number }>
  concept: number[]
  decision: Array<{ action: Action; score: number; allowed: boolean }>
  chosen: Action
  confidence: number
  reward: number
  maturity: number
  decisions: number
  vocabulary: Array<{ word: string; strength: number; means: string }>
  strongest: Synapse[]
}

/** What the neural interface draws. Pure read — never mutates the brain. */
export function snapshot(brain: Brain, allowed: (a: Action) => boolean): BrainSnapshot {
  const perception = SENSE_KEYS.map((key, i) => ({ key, value: brain.perception[i] }))
  const decision = ACTIONS.map((action, a) => ({
    action,
    score: brain.decision[a],
    allowed: allowed(action),
  }))

  const strongest: Synapse[] = []
  for (let c = 0; c < CONCEPT_COUNT; c++) {
    for (let a = 0; a < ACTION_COUNT; a++) {
      const w = brain.wAction[c * ACTION_COUNT + a]
      if (Math.abs(w) < 0.45) continue
      strongest.push({ from: `concept ${c + 1}`, to: ACTION_LABEL[ACTIONS[a]], weight: w })
    }
  }
  strongest.sort((x, y) => Math.abs(y.weight) - Math.abs(x.weight))

  const vocabulary = [...brain.words.keys()].map((word) => ({
    word,
    strength: wordStrength(brain, word),
    means: meaningOf(brain, word),
  }))
  for (const word of brain.commands.keys()) {
    if (!brain.words.has(word)) {
      vocabulary.push({ word, strength: wordStrength(brain, word), means: meaningOf(brain, word) })
    }
  }
  vocabulary.sort((x, y) => y.strength - x.strength)

  return {
    perception,
    concept: Array.from(brain.concept),
    decision,
    chosen: brain.chosen,
    confidence: brain.lastConfidence,
    reward: brain.lastReward,
    maturity: brain.maturity,
    decisions: brain.decisions,
    vocabulary,
    strongest: strongest.slice(0, 8),
  }
}

/**
 * Put into words what a word has come to mean, by asking which action its
 * concepts push hardest towards. This is a readout of the network, not a
 * lookup table — teach "food" onto sleeping and it will say sleeping.
 */
export function meaningOf(brain: Brain, word: string): string {
  const bias = wordBias(brain, [word])
  if (!bias) return 'nothing yet'
  let best = -Infinity
  let bestAction: Action = 'wander'
  for (let a = 0; a < ACTION_COUNT; a++) {
    if (bias[a] > best) {
      best = bias[a]
      bestAction = ACTIONS[a]
    }
  }
  if (best < 0.12) return 'nothing yet'
  return ACTION_LABEL[bestAction]
}

// ---------------------------------------------------------------- persistence

export interface BrainSave {
  c: number[]
  a: number[]
  m: number
  w: Array<[string, number[]]>
  k: Array<[string, number[]]>
  d: number
}

export function saveBrain(brain: Brain): BrainSave {
  // Five decimal places. Rounding harder is tempting — the file is mostly
  // weights — but the concept lobe picks winners by threshold, so a rounding
  // error of a thousandth can flip which concept fires and a reloaded Luma
  // comes back subtly not itself.
  const round = (v: number): number => Math.round(v * 1e5) / 1e5
  return {
    c: Array.from(brain.wConcept, round),
    a: Array.from(brain.wAction, round),
    m: brain.maturity,
    w: [...brain.words].map(([k, v]) => [k, Array.from(v, round)]),
    k: [...brain.commands].map(([k, v]) => [k, Array.from(v, round)]),
    d: brain.decisions,
  }
}

export function loadBrain(save: BrainSave, rand: () => number): Brain {
  const brain = createBrain(rand)
  if (save.c?.length === brain.wConcept.length) brain.wConcept.set(save.c)
  if (save.a?.length === brain.wAction.length) brain.wAction.set(save.a)
  brain.maturity = clamp01(save.m ?? 0)
  brain.decisions = save.d ?? 0
  brain.words = new Map((save.w ?? []).map(([k, v]) => [k, Float32Array.from(v)]))
  brain.commands = new Map((save.k ?? []).map(([k, v]) => [k, Float32Array.from(v)]))
  brain.trace.fill(0)
  return brain
}
