/**
 * brain — a small neural network per creature, and the reason two Luma with
 * the same genome and the same needs can end up with different habits.
 *
 * Architecture: context in → one hidden ReLU layer → a preference over every
 * action, softmaxed. It is trained by reward: after an action, whatever the
 * creature ended up feeling is fed back along the pathway that chose it, so a
 * creature who keeps finding food at the market grows a bias toward the market
 * that no rule in `mind.ts` put there.
 *
 * This used to run on TensorFlow.js. For a sixteen-by-twelve-by-twenty network
 * that was several hundred kilobytes of dependency and a WebGL round trip to
 * do about six hundred multiply-adds — and because the forward pass was async,
 * inference was never actually wired into the decision, so every brain in the
 * settlement trained and none of them were ever asked. Plain arrays are faster
 * here by a wide margin, synchronous, and exactly reproducible from a seed,
 * which the simulation's determinism guarantees depend on.
 *
 * Weight layout is row-major and unchanged, so saved brains still load:
 *   w1[input * hidden + h]   b1[hidden]
 *   w2[hidden * output + o]  b2[output]
 */

export interface Brain {
  inputSize: number
  outputSize: number
  learnRate: number
  hidden: number
  w1: Float32Array
  b1: Float32Array
  w2: Float32Array
  b2: Float32Array
  serialize(): { w1: number[]; b1: number[]; w2: number[]; b2: number[] }
}

export interface BrainWeights {
  w1: number[]
  b1: number[]
  w2: number[]
  b2: number[]
}

/**
 * The actions a brain can hold an opinion about, in the order of its output
 * vector. It lives here rather than beside `ActionName` so that both the
 * creature (which sizes its brain) and the simulation (which reads the
 * preferences) can import it without a cycle.
 */
export const BRAIN_ACTIONS = [
  'food', 'work', 'sleep', 'heal', 'drink', 'den', 'school', 'farm', 'park',
  'play', 'social', 'steal', 'share', 'fight', 'wander', 'idle', 'deposit',
  'withdraw',
] as const

export type BrainAction = (typeof BRAIN_ACTIONS)[number]

/** How many numbers of context a brain reads, and how many it answers with. */
export const BRAIN_INPUTS = 16
export const BRAIN_OUTPUTS = BRAIN_ACTIONS.length

const HIDDEN = 12

/** Box–Muller. Optionally seeded, so a world rebuilt from a seed is identical. */
function randn(rand: () => number): number {
  const u = Math.max(1e-8, rand())
  const v = Math.max(1e-8, rand())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function createBrain(
  inputSize: number,
  outputSize: number,
  weights?: BrainWeights,
  rand: () => number = Math.random,
): Brain {
  const hidden = HIDDEN
  // A saved brain from a build with a different action list cannot be
  // meaningfully reshaped, so it is started again rather than mangled.
  const fits = weights
    && weights.w1.length === inputSize * hidden
    && weights.b1.length === hidden
    && weights.w2.length === hidden * outputSize
    && weights.b2.length === outputSize

  const w1 = fits ? new Float32Array(weights!.w1) : new Float32Array(inputSize * hidden)
  const b1 = fits ? new Float32Array(weights!.b1) : new Float32Array(hidden)
  const w2 = fits ? new Float32Array(weights!.w2) : new Float32Array(hidden * outputSize)
  const b2 = fits ? new Float32Array(weights!.b2) : new Float32Array(outputSize)

  if (!fits) {
    // Xavier-ish: keep early activations in a range where ReLU learns
    const s1 = Math.sqrt(2 / Math.max(1, inputSize))
    const s2 = Math.sqrt(2 / hidden)
    for (let i = 0; i < w1.length; i++) w1[i] = randn(rand) * s1
    for (let i = 0; i < w2.length; i++) w2[i] = randn(rand) * s2
  }

  return {
    inputSize,
    outputSize,
    learnRate: 0.1,
    hidden,
    w1,
    b1,
    w2,
    b2,
    serialize() {
      return {
        w1: Array.from(w1),
        b1: Array.from(b1),
        w2: Array.from(w2),
        b2: Array.from(b2),
      }
    },
  }
}

/** Scratch buffers, so thinking allocates nothing on the hot path. */
const scratch = {
  hidden: new Float32Array(HIDDEN),
  out: new Float32Array(64),
}

function hiddenLayer(b: Brain, input: number[] | Float32Array): Float32Array {
  const h = scratch.hidden.length >= b.hidden ? scratch.hidden : new Float32Array(b.hidden)
  for (let j = 0; j < b.hidden; j++) {
    let sum = b.b1[j]
    for (let i = 0; i < b.inputSize; i++) {
      const x = input[i]
      if (x !== 0) sum += x * b.w1[i * b.hidden + j]
    }
    h[j] = sum > 0 ? sum : 0
  }
  return h
}

/**
 * Forward pass: context → a preference for every action, summing to one.
 * Synchronous, which is what lets it actually take part in a decision.
 */
export function thinkSync(b: Brain, input: number[] | Float32Array): number[] {
  const h = hiddenLayer(b, input)
  const out = b.outputSize <= scratch.out.length
    ? scratch.out.subarray(0, b.outputSize)
    : new Float32Array(b.outputSize)

  let max = -Infinity
  for (let k = 0; k < b.outputSize; k++) {
    let sum = b.b2[k]
    for (let j = 0; j < b.hidden; j++) {
      const hv = h[j]
      if (hv !== 0) sum += hv * b.w2[j * b.outputSize + k]
    }
    out[k] = sum
    if (sum > max) max = sum
  }

  let total = 0
  for (let k = 0; k < b.outputSize; k++) {
    const e = Math.exp(out[k] - max)
    out[k] = e
    total += e
  }
  const result = new Array<number>(b.outputSize)
  const inv = total > 0 ? 1 / total : 0
  for (let k = 0; k < b.outputSize; k++) result[k] = out[k] * inv
  return result
}

/** Kept async for callers that awaited the old tfjs implementation. */
export async function think(b: Brain, input: number[]): Promise<number[]> {
  return thinkSync(b, input)
}

/**
 * Reward learning. A policy-gradient step: push the probability of the action
 * that was taken up or down by how well it turned out, and carry that back
 * through the hidden layer.
 */
export function rewardSync(
  b: Brain, input: number[] | Float32Array, actionIndex: number, rewardValue: number,
): void {
  if (actionIndex < 0 || actionIndex >= b.outputSize) return
  const probs = thinkSync(b, input)
  const h = hiddenLayer(b, input)
  const step = rewardValue * b.learnRate

  // output layer: (onehot - p) * reward
  const g = new Float32Array(b.outputSize)
  for (let k = 0; k < b.outputSize; k++) {
    g[k] = ((k === actionIndex ? 1 : 0) - probs[k]) * step
  }

  // hidden gradient must be read from the weights *before* they move
  const hGrad = new Float32Array(b.hidden)
  for (let j = 0; j < b.hidden; j++) {
    if (h[j] <= 0) continue // ReLU is flat below zero, so nothing flows back
    let sum = 0
    for (let k = 0; k < b.outputSize; k++) sum += g[k] * b.w2[j * b.outputSize + k]
    hGrad[j] = sum
  }

  for (let j = 0; j < b.hidden; j++) {
    const hv = h[j]
    if (hv !== 0) {
      for (let k = 0; k < b.outputSize; k++) b.w2[j * b.outputSize + k] += hv * g[k]
    }
  }
  for (let k = 0; k < b.outputSize; k++) b.b2[k] += g[k]

  for (let i = 0; i < b.inputSize; i++) {
    const x = input[i]
    if (x === 0) continue
    for (let j = 0; j < b.hidden; j++) {
      if (hGrad[j] !== 0) b.w1[i * b.hidden + j] += x * hGrad[j]
    }
  }
  for (let j = 0; j < b.hidden; j++) b.b1[j] += hGrad[j] * 0.5

  // Keep the weights from running away over tens of thousands of rewards.
  clampWeights(b)
}

/** Kept async for callers that awaited the old tfjs implementation. */
export async function reward(
  b: Brain, input: number[], actionIndex: number, rewardValue: number,
): Promise<void> {
  rewardSync(b, input, actionIndex, rewardValue)
}

const LIMIT = 6

function clampWeights(b: Brain): void {
  for (let i = 0; i < b.w1.length; i++) {
    const v = b.w1[i]
    if (v > LIMIT) b.w1[i] = LIMIT
    else if (v < -LIMIT) b.w1[i] = -LIMIT
  }
  for (let i = 0; i < b.w2.length; i++) {
    const v = b.w2[i]
    if (v > LIMIT) b.w2[i] = LIMIT
    else if (v < -LIMIT) b.w2[i] = -LIMIT
  }
}

/**
 * How settled a brain's opinions are: 0 when it has no preference at all,
 * 1 when it is certain. Shown in the inspector as "learned confidence".
 */
export function brainCertainty(prefs: number[] | null): number {
  if (!prefs || prefs.length < 2) return 0
  let entropy = 0
  for (const p of prefs) {
    if (p > 1e-6) entropy -= p * Math.log(p)
  }
  const max = Math.log(prefs.length)
  return max > 0 ? 1 - entropy / max : 0
}

/** Nothing to release any more; kept so existing call sites stay valid. */
export function disposeBrain(_b: Brain): void {
  // the weights are plain arrays and are collected with the creature
}
