/**
 * memory — episodic memory + learned facts + vendettas + place preferences.
 * Small, capped, JSON-safe. Drives utility bias and fight targets.
 */
export type FactKey = 'bankIsSafe' | 'someoneStoleFromMe' | 'iAmInAGang' | 'partnerIsHere'

export interface Episode {
  kind: string
  entityId: number | null
  valence: number // -1..1
  intensity: number
  tick: number
}

export interface MemoryState {
  episodes: Episode[]
  facts: Partial<Record<FactKey, number>>
  vendettas: Record<number, number> // creatureId -> intensity
  placePrefs: Record<string, number> // towerId -> 0..1 positive bias
}

const EPISODE_CAP = 12
const PLACE_DECAY = 0.02

export function createMemory(): MemoryState {
  return { episodes: [], facts: {}, vendettas: {}, placePrefs: {} }
}

export function remember(m: MemoryState, kind: string, entityId: number | null, valence: number, intensity: number, tick: number): void {
  m.episodes.push({ kind, entityId, valence, intensity, tick })
  if (m.episodes.length > EPISODE_CAP) m.episodes.shift()
}

export function learnFact(m: MemoryState, key: FactKey, strength = 1): void {
  m.facts[key] = Math.min(1, (m.facts[key] ?? 0) + strength)
}

export function knowsFact(m: MemoryState, key: FactKey): boolean {
  return (m.facts[key] ?? 0) > 0.5
}

export function addVendetta(m: MemoryState, creatureId: number, intensity = 1): void {
  m.vendettas[creatureId] = Math.min(1, (m.vendettas[creatureId] ?? 0) + intensity)
}

export function hasVendetta(m: MemoryState, creatureId: number): boolean {
  return (m.vendettas[creatureId] ?? 0) > 0.4
}

export function preferPlace(m: MemoryState, towerId: string, amount = 1): void {
  m.placePrefs[towerId] = Math.min(1, (m.placePrefs[towerId] ?? 0) + amount)
}

export function placePreference(m: MemoryState, towerId: string): number {
  return m.placePrefs[towerId] ?? 0
}

export function decayMemory(m: MemoryState): void {
  for (const key of Object.keys(m.placePrefs)) {
    m.placePrefs[key] = Math.max(0, (m.placePrefs[key] ?? 0) - PLACE_DECAY)
  }
  for (const id of Object.keys(m.vendettas)) {
    const n = Number(id)
    m.vendettas[n] = Math.max(0, (m.vendettas[n] ?? 0) - 0.005)
    if ((m.vendettas[n] ?? 0) < 0.01) delete m.vendettas[n]
  }
}
