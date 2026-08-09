/**
 * genetics — heritable personality for ball-creatures.
 * Every gene is 0..1. Children get a crossover of both parents' genes plus
 * bounded mutation, so susceptibilities (aggression, theft, addiction…) pass down.
 */
export const GENE_NAMES = [
  'aggression',
  'theft',
  'greed',
  'sociability',
  'loyalty',
  'fearfulness',
  'energy',
  'addictionProne',
  'learning',
  'curiosity',
  'lovePropensity',
  'courage',
] as const

export type GeneName = (typeof GENE_NAMES)[number]

export type Genome = Record<GeneName, number>

export function randomGenome(rng: () => number): Genome {
  const g = {} as Genome
  for (const name of GENE_NAMES) g[name] = rng()
  return g
}

/** Crossover: per-gene pick from a or b. rng() < 0.5 → a. */
export function crossover(a: Genome, b: Genome, rng: () => number): Genome {
  const child = {} as Genome
  for (const name of GENE_NAMES) child[name] = rng() < 0.5 ? a[name] : b[name]
  return child
}

/** Mutate: each gene mutates with probability rate; delta in [-0.25, +0.25], clamped. */
export function mutate(g: Genome, rate: number, rng: () => number): Genome {
  const out = {} as Genome
  for (const name of GENE_NAMES) {
    if (rng() < rate) {
      out[name] = Math.min(1, Math.max(0, g[name] + (rng() - 0.5) * 0.5))
    } else {
      out[name] = g[name]
    }
  }
  return out
}
