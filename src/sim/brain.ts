import { clamp } from './rng'
import type { RNG } from './rng'

/**
 * Brain — a small recurrent neural net with sensor/hidden/motor lobes.
 * Neurons carry stimulation, threshold, state (soma) and leak, like the
 * original Creatures brain. Dendrites carry weights and an eligibility
 * trace so the brain can learn from reward/punishment (Hebbian + chemical
 * gating): what you were JUST doing gets strengthened when pleasure hits.
 */

export type NeuronType = 'sensor' | 'hidden' | 'motor'

export interface Neuron {
  id: number
  type: NeuronType
  /** stimulation — current summed input */
  st: number
  /** threshold — activation fires when state crosses it */
  th: number
  /** state (soma potential) */
  sg: number
  /** leak — how fast state decays */
  leak: number
  /** bias — tonic input */
  bias: number
  /** activation — output 0..1 */
  act: number
}

export interface Dendrite {
  from: number
  to: number
  weight: number
  /** eligibility trace for learning */
  el: number
}

export interface BrainConfig {
  sensors: number
  hidden: number
  motors: number
  /** connectivity density hidden wiring */
  density: number
  threshold: number
  leak: number
  bias: number
  /** learning rate for reinforcement */
  lr: number
  /** eligibility decay */
  elDecay: number
}

export interface BrainSnapshot {
  neurons: Neuron[]
  dendrites: Dendrite[]
  config: BrainConfig
}

export class Brain {
  neurons: Neuron[]
  dendrites: Dendrite[]
  config: BrainConfig
  sensorCount: number
  motorCount: number

  constructor(config: BrainConfig, rng: RNG) {
    this.config = config
    this.sensorCount = config.sensors
    this.motorCount = config.motors
    const n = config.sensors + config.hidden + config.motors
    this.neurons = []
    for (let i = 0; i < n; i++) {
      const type: NeuronType =
        i < config.sensors ? 'sensor' : i < config.sensors + config.hidden ? 'hidden' : 'motor'
      this.neurons.push({
        id: i,
        type,
        st: 0,
        th: config.threshold * (0.6 + rng() * 0.8),
        sg: 0,
        leak: config.leak * (0.5 + rng() * 1.0),
        bias: config.bias * (rng() * 2 - 1),
        act: 0,
      })
    }
    this.dendrites = []
    // sensors -> hidden, hidden -> hidden (recurrent), hidden -> motors
    const connect = (fromType: NeuronType, toType: NeuronType, weightRange: [number, number]) => {
      for (const to of this.neurons) {
        if (to.type !== toType) continue
        for (const from of this.neurons) {
          if (from.type !== fromType) continue
          if (rng() > config.density) continue
          const w = weightRange[0] + rng() * (weightRange[1] - weightRange[0])
          this.dendrites.push({ from: from.id, to: to.id, weight: w, el: 0 })
        }
      }
    }
    connect('sensor', 'hidden', [-1, 1])
    connect('hidden', 'hidden', [-1, 1])
    connect('hidden', 'motor', [-1, 1])
    // a few direct sensor->motor for hardwired instincts
    connect('sensor', 'motor', [-1, 1])
    if (this.dendrites.length === 0) {
      // guarantee at least one path so brains are never empty
      this.dendrites.push({ from: 0, to: config.sensors + config.hidden, weight: 0.1, el: 0 })
    }
  }

  get sensors(): Neuron[] {
    return this.neurons.slice(0, this.sensorCount)
  }

  get motors(): Neuron[] {
    return this.neurons.slice(this.neurons.length - this.motorCount)
  }

  /** Set sensor activations (0..1 each). */
  setInputs(values: number[]): void {
    for (let i = 0; i < this.sensorCount && i < values.length; i++) {
      const s = this.neurons[i]
      s.act = clamp(values[i], 0, 1)
      s.st = s.act
    }
  }

  /** One tick: propagate, update state/activation, decay eligibility. */
  tick(): void {
    // compute stimulation for hidden + motor
    for (const n of this.neurons) {
      if (n.type === 'sensor') continue
      let total = n.bias
      for (const d of this.dendrites) {
        if (d.to !== n.id) continue
        const from = this.neurons[d.from]
        total += from.act * d.weight
      }
      n.st = total
      n.sg += total
      if (n.sg > n.th) {
        // fire: activation rises toward 1
        n.act = clamp(n.act + (1 - n.act) * 0.35, 0, 1)
        n.sg = 0
      } else {
        n.act *= 1 - n.leak
      }
    }
    // decay eligibility traces
    for (const d of this.dendrites) {
      const from = this.neurons[d.from]
      if (from.act > 0.1) d.el = 1
      d.el *= this.config.elDecay
    }
  }

  /**
   * Reinforce from a reward/punishment signal (-1..1).
   * Weights of recently-active dendrites move toward the signal.
   */
  reinforce(signal: number): void {
    if (signal === 0) return
    const lr = this.config.lr
    for (const d of this.dendrites) {
      if (d.el <= 0.001) continue
      d.weight = clamp(d.weight + lr * d.el * signal, -1, 1)
    }
  }

  /** Motor activation vector (normalized-ish 0..1). */
  outputs(): number[] {
    return this.motors.map((m) => m.act)
  }

  snapshot(): BrainSnapshot {
    return {
      neurons: this.neurons.map((n) => ({ ...n })),
      dendrites: this.dendrites.map((d) => ({ ...d })),
      config: { ...this.config },
    }
  }

  static restore(snap: BrainSnapshot): Brain {
    const b = new Brain(snap.config, () => 0)
    b.neurons = snap.neurons.map((n) => ({ ...n }))
    b.dendrites = snap.dendrites.map((d) => ({ ...d }))
    b.sensorCount = snap.config.sensors
    b.motorCount = snap.config.motors
    return b
  }
}
