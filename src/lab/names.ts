/**
 * names — a name pool that guarantees uniqueness.
 * Two-part names from curated syllable lists; the pool tracks used names
 * and appends a numeric suffix if the two-part space is exhausted, so a
 * creature NEVER shares a name with another (even across 1000+ spawns).
 */

export const NAME_PARTS = {
  first: ['Bli', 'Zor', 'Nix', 'Flo', 'Grim', 'Pip', 'Quil', 'Rux', 'Sni', 'Tuk', 'Vel', 'Wix', 'Yum', 'Zep', 'Axi', 'Bez', 'Cub', 'Dex', 'Emi', 'Fiz'],
  last: ['bop', 'zap', 'nip', 'fum', 'glot', 'po', 'quack', 'rid', 'sprock', 'tum', 'vee', 'womp', 'yip', 'zook', 'adel', 'ber', 'cotto', 'dor', 'ecko', 'fen'],
}

export interface NamePool {
  used: Set<string>
  usedCount: number
}

export function createNamePool(): NamePool {
  return { used: new Set(), usedCount: 0 }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Pick a unique name. `rand` is 0..1. Falls back to numeric suffixes if needed. */
export function pickName(pool: NamePool, rand: number): string {
  const f = NAME_PARTS.first[Math.floor(rand * NAME_PARTS.first.length) % NAME_PARTS.first.length]
  const l = NAME_PARTS.last[Math.floor((rand * 13 + 7) * 100) % NAME_PARTS.last.length]
  let base = capitalize(f) + capitalize(l)
  let name = base
  let i = 1
  while (pool.used.has(name)) {
    name = `${base}${i}`
    i++
  }
  pool.used.add(name)
  pool.usedCount++
  return name
}
