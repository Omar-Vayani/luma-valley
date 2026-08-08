import { describe, expect, it } from 'vitest'
import { Brain } from './brain'
import { mulberry32 } from './rng'

function mkBrain(rng = mulberry32(1)) {
  return new Brain(
    { sensors: 4, hidden: 6, motors: 3, density: 0.6, threshold: 0.5, leak: 0.1, bias: 0.2, lr: 0.1, elDecay: 0.8 },
    rng,
  )
}

describe('brain', () => {
  it('constructs the right neuron counts', () => {
    const b = mkBrain()
    expect(b.neurons.length).toBe(4 + 6 + 3)
    expect(b.sensors.length).toBe(4)
    expect(b.motors.length).toBe(3)
  })

  it('has dendrites wired across lobes', () => {
    const b = mkBrain()
    expect(b.dendrites.length).toBeGreaterThan(0)
    // every dendrite references valid neurons
    for (const d of b.dendrites) {
      expect(d.from).toBeGreaterThanOrEqual(0)
      expect(d.to).toBeLessThan(b.neurons.length)
    }
  })

  it('is deterministic for the same seed', () => {
    const a = mkBrain(mulberry32(7))
    const b = mkBrain(mulberry32(7))
    expect(a.neurons.map((n) => n.th)).toEqual(b.neurons.map((n) => n.th))
    expect(a.dendrites.map((d) => d.weight)).toEqual(b.dendrites.map((d) => d.weight))
  })

  it('high input produces motor activation over time', () => {
    const b = mkBrain()
    // force a direct sensor->motor route by checking outputs change
    b.setInputs([1, 0, 0, 0])
    const before = b.outputs()
    for (let i = 0; i < 40; i++) b.tick()
    const after = b.outputs()
    expect(after.some((v, i) => v !== before[i])).toBe(true)
  })

  it('reinforcement strengthens recently active dendrites', () => {
    const b = mkBrain(mulberry32(99))
    // set a sensor active, tick to raise eligibility, then reinforce positive
    b.setInputs([1, 0, 0, 0])
    b.tick()
    b.tick()
    const activeBefore = b.dendrites
      .filter((d) => b.neurons[d.from].act > 0.1)
      .map((d) => d.weight)
    b.reinforce(1)
    const activeAfter = b.dendrites
      .filter((d) => b.neurons[d.from].act > 0.1)
      .map((d) => d.weight)
    // weights of active dendrites should have increased
    for (let i = 0; i < activeBefore.length; i++) {
      expect(activeAfter[i]).toBeGreaterThan(activeBefore[i])
    }
  })

  it('reinforcement weakens on punishment', () => {
    const b = mkBrain(mulberry32(5))
    b.setInputs([0, 1, 0, 0])
    b.tick()
    b.tick()
    const activeBefore = b.dendrites
      .filter((d) => b.neurons[d.from].act > 0.1)
      .map((d) => d.weight)
    b.reinforce(-1)
    const activeAfter = b.dendrites
      .filter((d) => b.neurons[d.from].act > 0.1)
      .map((d) => d.weight)
    for (let i = 0; i < activeBefore.length; i++) {
      expect(activeAfter[i]).toBeLessThan(activeBefore[i])
    }
  })

  it('weights stay clamped in [-1, 1]', () => {
    const b = mkBrain()
    b.setInputs([1, 1, 1, 1])
    for (let i = 0; i < 20; i++) b.tick()
    for (let i = 0; i < 30; i++) b.reinforce(1)
    for (const d of b.dendrites) {
      expect(d.weight).toBeGreaterThanOrEqual(-1)
      expect(d.weight).toBeLessThanOrEqual(1)
    }
  })

  it('snapshot/restore round-trips', () => {
    const b = mkBrain(mulberry32(123))
    b.setInputs([1, 0, 0.5, 1])
    for (let i = 0; i < 10; i++) b.tick()
    b.reinforce(0.5)
    const snap = b.snapshot()
    const r = Brain.restore(snap)
    expect(r.neurons).toEqual(b.neurons)
    expect(r.dendrites).toEqual(b.dendrites)
    expect(r.outputs()).toEqual(b.outputs())
  })
})
