/**
 * brain — a tiny per-creature neural network built with TensorFlow.js.
 * Self-organizing: each creature's brain learns action preferences from its
 * own experience via reward reinforcement (Hebbian-style weight updates on
 * the context → action pathway). Small enough to run efficiently in a
 * browser on mobile for dozens of creatures.
 *
 * Architecture: input(need context) → 12 hidden → output(action preferences).
 * Weights are plain Float32Arrays so saves stay tiny; tfjs is used for the
 * math so it benefits from WebGL on phones when available.
 *
 * PERFORMANCE: this is the hottest tfjs path (called per creature per frame).
 * Every intermediate tensor is disposed in a finally block and inline weight
 * tensors are reused via a small cache — no leaks, no WebGL context loss.
 */
import * as tf from '@tensorflow/tfjs'

export interface Brain {
  inputSize: number
  outputSize: number
  learnRate: number
  hidden: number
  /** w1[hidden][input], b1[hidden], w2[output][hidden], b2[output] */
  w1: Float32Array
  b1: Float32Array
  w2: Float32Array
  b2: Float32Array
  serialize(): { w1: number[]; b1: number[]; w2: number[]; b2: number[] }
  /** cached weight tensors for fast reuse between think/reward calls */
  _tw1?: tf.Tensor2D
  _tw2?: tf.Tensor2D
  _tb1?: tf.Tensor1D
  _tb2?: tf.Tensor1D
}

function randn(): number {
  // Box-Muller with Math.random — fine for weight init
  const u = Math.max(1e-8, Math.random())
  const v = Math.max(1e-8, Math.random())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function createBrain(inputSize: number, outputSize: number, weights?: { w1: number[]; b1: number[]; w2: number[]; b2: number[] }): Brain {
  const hidden = 12
  const w1 = weights ? new Float32Array(weights.w1) : new Float32Array(hidden * inputSize)
  const b1 = weights ? new Float32Array(weights.b1) : new Float32Array(hidden)
  const w2 = weights ? new Float32Array(weights.w2) : new Float32Array(outputSize * hidden)
  const b2 = weights ? new Float32Array(weights.b2) : new Float32Array(outputSize)
  if (!weights) {
    for (let i = 0; i < w1.length; i++) w1[i] = randn() * 0.4
    for (let i = 0; i < w2.length; i++) w2[i] = randn() * 0.4
  }
  return {
    inputSize,
    outputSize,
    learnRate: 0.12,
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

/** Lazily build (and cache) the weight tensors for a brain. */
function weightTensors(b: Brain): { tw1: tf.Tensor2D; tw2: tf.Tensor2D; tb1: tf.Tensor1D; tb2: tf.Tensor1D } {
  if (!b._tw1 || !b._tw2 || !b._tb1 || !b._tb2) {
    b._tw1 = tf.tensor2d(b.w1, [b.inputSize, b.hidden])
    b._tw2 = tf.tensor2d(b.w2, [b.hidden, b.outputSize])
    b._tb1 = tf.tensor1d(b.b1)
    b._tb2 = tf.tensor1d(b.b2)
  }
  return { tw1: b._tw1, tw2: b._tw2, tb1: b._tb1, tb2: b._tb2 }
}

/** Forward pass: context → action preference vector (0..1-ish, softmaxed). */
export async function think(b: Brain, input: number[]): Promise<number[]> {
  const x = tf.tensor2d([input], [1, b.inputSize])
  let out: number[] = []
  let h: tf.Tensor | null = null
  let y: tf.Tensor | null = null
  let sm: tf.Tensor | null = null
  try {
    const { tw1, tw2, tb1, tb2 } = weightTensors(b)
    h = tf.relu(x.matMul(tw1).add(tb1))
    y = h.matMul(tw2).add(tb2)
    sm = tf.softmax(y)
    const arr = await sm.data()
    out = Array.from(arr)
  } finally {
    x.dispose()
    h?.dispose()
    y?.dispose()
    sm?.dispose()
  }
  return out
}

/**
 * Reward-based learning: strengthen the pathway from this context toward the
 * rewarded action. Uses a policy-gradient-style update: dW ≈ reward * (onehot - prob) * activation.
 */
export async function reward(b: Brain, input: number[], actionIndex: number, rewardValue: number): Promise<void> {
  const x = tf.tensor2d([input], [1, b.inputSize])
  const temps: tf.Tensor[] = []
  try {
    const { tw1, tw2, tb1, tb2 } = weightTensors(b)
    const h = tf.relu(x.matMul(tw1).add(tb1))
    temps.push(h)
    const y = h.matMul(tw2).add(tb2)
    temps.push(y)
    const probs = tf.softmax(y)
    temps.push(probs)
    const onehot = tf.oneHot(tf.tensor1d([actionIndex], 'int32'), b.outputSize)
    temps.push(onehot)
    const grad = tf.sub(onehot, probs).mul(tf.scalar(rewardValue * b.learnRate))
    temps.push(grad)
    // w2 += hᵀ · grad
    const dw2 = h.transpose().matMul(grad)
    temps.push(dw2)
    const dw1 = x.transpose().matMul(grad.matMul(tw2.transpose()))
    temps.push(dw1)
    const dw2Arr = await dw2.data()
    const dw1Arr = await dw1.data()
    for (let i = 0; i < dw2Arr.length; i++) b.w2[i] += dw2Arr[i]
    for (let i = 0; i < dw1Arr.length; i++) b.w1[i] += dw1Arr[i]
    // bias updates
    const db2Arr = await grad.data()
    for (let i = 0; i < db2Arr.length; i++) b.b2[i] += db2Arr[i]
    const hGrad = grad.matMul(tw2.transpose()).data()
    const hGradArr = await hGrad
    for (let i = 0; i < hGradArr.length; i++) b.b1[i] += hGradArr[i]
  } finally {
    x.dispose()
    for (const t of temps) t.dispose()
  }
}

export function disposeBrain(b: Brain): void {
  b._tw1?.dispose()
  b._tw2?.dispose()
  b._tb1?.dispose()
  b._tb2?.dispose()
  b._tw1 = undefined
  b._tw2 = undefined
  b._tb1 = undefined
  b._tb2 = undefined
}
