/**
 * genetics — heritable tendencies for Luma.
 * Every gene is 0..1. Children get a crossover of both parents' genes plus
 * bounded mutation, so susceptibilities (aggression, theft, addiction…) and
 * physical traits (size, metabolism, fertility) pass down without dictating
 * who a creature becomes — experience does the rest.
 */
export const GENE_NAMES = [
  // temperament
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
  // body & physiology
  'size',
  'metabolism',
  'fertility',
  'senses',
  'emotionality',
  'resilience',
  'longevity',
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
  for (const name of GENE_NAMES) child[name] = pick(a, b, name, rng)
  return child
}

function pick(a: Genome, b: Genome, name: GeneName, rng: () => number): number {
  const av = a[name] ?? rng()
  const bv = b[name] ?? rng()
  return rng() < 0.5 ? av : bv
}

/** Mutate: each gene mutates with probability rate; delta in [-0.25, +0.25], clamped. */
export function mutate(g: Genome, rate: number, rng: () => number): Genome {
  const out = {} as Genome
  for (const name of GENE_NAMES) {
    const base = g[name] ?? rng()
    if (rng() < rate) {
      out[name] = Math.min(1, Math.max(0, base + (rng() - 0.5) * 0.5))
    } else {
      out[name] = base
    }
  }
  return out
}

/** Fill any missing genes (old saves) with neutral values. */
export function completeGenome(partial: Partial<Genome>): Genome {
  const g = {} as Genome
  for (const name of GENE_NAMES) g[name] = partial[name] ?? 0.5
  return g
}

// ── expressed physical traits ────────────────────────────────────────────

/** Rendered body scale (0.8–1.3) from the size gene. */
export function bodyScale(g: Genome): number {
  return 0.8 + (g.size ?? 0.5) * 0.5
}

/** How fast needs drain — high metabolism eats more, tires faster. */
export function metabolicRate(g: Genome): number {
  return 0.75 + (g.metabolism ?? 0.5) * 0.6
}

/** How far a creature notices events (learning by sight, gossip range). */
export function senseRange(g: Genome, base: number): number {
  return base * (0.75 + (g.senses ?? 0.5) * 0.6)
}

/** Chance modifier for conception when conditions allow. */
export function fertilityFactor(g: Genome): number {
  return 0.3 + (g.fertility ?? 0.5) * 0.9
}

/** Resistance to illness and substance harm (0 = frail, 1 = hardy). */
export function resilienceFactor(g: Genome): number {
  return 0.3 + (g.resilience ?? 0.5) * 0.7
}

/** How strongly events swing this creature's emotions. */
export function emotionalGain(g: Genome): number {
  return 0.6 + (g.emotionality ?? 0.5) * 0.9
}
