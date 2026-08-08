import { clamp, int } from './rng'
import type { RNG } from './rng'

/**
 * Genetics — genes on a chromosome. Each gene has a kind and 1-2 params.
 * Breeding = per-gene crossover between parents + bounded mutation.
 * Appearance/temperament/lifespan/learning all derive from genes.
 */

export type GeneKind =
  | 'synth' // chemical synthesis rate modifier (chemical, rate)
  | 'brain' // brain params (param)
  | 'temper' // temperament: curiosity/aggression/sociability/energy (param)
  | 'appear' // appearance: hue, accentHue, size, eyeSize, voicePitch (param)
  | 'lifespan' // lifespan modifier (param)
  | 'fertility' // fertility (param)

export interface Gene {
  kind: GeneKind
  key: string
  value: number // normalized 0..1
}

export interface Genome {
  genes: Gene[]
}

const KEYS_BY_KIND: Record<GeneKind, string[]> = {
  synth: ['hunger', 'thirst', 'fatigue', 'boredom', 'loneliness', 'fear'],
  brain: ['threshold', 'leak', 'lr', 'density'],
  temper: ['curiosity', 'aggression', 'sociability', 'energy'],
  appear: ['hue', 'accentHue', 'size', 'eyeSize', 'voicePitch', 'earType', 'species'],
  lifespan: ['base'],
  fertility: ['base'],
}

export function randomGenome(rng: RNG, count = 24): Genome {
  const genes: Gene[] = []
  const kinds: GeneKind[] = ['synth', 'brain', 'temper', 'appear', 'lifespan', 'fertility']
  for (let i = 0; i < count; i++) {
    const kind = kinds[int(rng, 0, kinds.length - 1)]
    const keys = KEYS_BY_KIND[kind]
    genes.push({ kind, key: keys[int(rng, 0, keys.length - 1)], value: rng() })
  }
  return { genes }
}

export function crossover(a: Genome, b: Genome, rng: RNG, mutationRate = 0.08): Genome {
  const len = Math.max(a.genes.length, b.genes.length)
  const genes: Gene[] = []
  for (let i = 0; i < len; i++) {
    const parent = rng() < 0.5 ? a : b
    const g = parent.genes[i % parent.genes.length]
    let value = g.value
    if (rng() < mutationRate) {
      value = clamp(value + (rng() - 0.5) * 0.4, 0, 1)
    }
    genes.push({ kind: g.kind, key: g.key, value })
  }
  return { genes }
}

export function geneValue(genome: Genome, kind: GeneKind, key: string, fallback = 0.5): number {
  const g = genome.genes.find((x) => x.kind === kind && x.key === key)
  return g ? g.value : fallback
}

export function sumGene(genome: Genome, kind: GeneKind, key: string, fallback = 0.5): number {
  return genome.genes.filter((x) => x.kind === kind && x.key === key).reduce((s, x) => s + x.value, fallback)
}

export function describeGenome(genome: Genome): Record<string, number> {
  return {
    hue: geneValue(genome, 'appear', 'hue', 0.4),
    accentHue: geneValue(genome, 'appear', 'accentHue', 0.6),
    size: 0.8 + geneValue(genome, 'appear', 'size') * 0.5,
    eyeSize: 0.08 + geneValue(genome, 'appear', 'eyeSize') * 0.1,
    voicePitch: 0.5 + geneValue(genome, 'appear', 'voicePitch') * 0.6,
    earType: Math.round(geneValue(genome, 'appear', 'earType') * 2),
    species: geneValue(genome, 'appear', 'species', 0.5),
    curiosity: geneValue(genome, 'temper', 'curiosity'),
    aggression: geneValue(genome, 'temper', 'aggression'),
    sociability: geneValue(genome, 'temper', 'sociability'),
    energy: geneValue(genome, 'temper', 'energy'),
    lifespan: 1200 + geneValue(genome, 'lifespan', 'base') * 1800,
    fertility: geneValue(genome, 'fertility', 'base'),
    threshold: 0.3 + geneValue(genome, 'brain', 'threshold', 0.5) * 0.4,
    leak: 0.05 + geneValue(genome, 'brain', 'leak', 0.5) * 0.15,
    lr: 0.03 + geneValue(genome, 'brain', 'lr', 0.5) * 0.12,
    density: 0.3 + geneValue(genome, 'brain', 'density', 0.5) * 0.5,
  }
}
