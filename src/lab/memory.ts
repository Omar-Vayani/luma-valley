/**
 * memory — episodic memory + learned facts + vendettas + place preferences,
 * with importance scoring, consolidation, and forgetting.
 *
 * Episodes are cheap and numerous; consolidation folds repeated similar
 * episodes into stronger semantic summaries, then the weakest episodes are
 * forgotten. This keeps a long-lived creature's mind compact but meaningful.
 */
export type FactKey = 'bankIsSafe' | 'someoneStoleFromMe' | 'hasGang' | 'partnerIsHere' | 'placeIsNice'

export interface Episode {
  kind: string
  entityId: number | null
  valence: number // -1..1
  intensity: number
  tick: number
  /** how strongly this memory resists forgetting (recomputed on consolidation) */
  importance?: number
}

/** A consolidated pattern distilled from many similar episodes. */
export interface SemanticSummary {
  kind: string
  entityId: number | null
  avgValence: number
  count: number
  lastTick: number
}

export interface MemoryState {
  episodes: Episode[]
  facts: Partial<Record<FactKey, number>>
  vendettas: Record<number, number> // creatureId -> intensity
  placePrefs: Record<string, number> // towerId -> 0..1 positive bias
  seenPlaces: Record<string, number> // towerId -> how many times visited
  /** consolidated long-term patterns, keyed by `${kind}:${entityId}` */
  semantic?: Record<string, SemanticSummary>
}

const EPISODE_CAP = 12
const CONSOLIDATE_AT = 6
const PLACE_DECAY = 0.02

export function createMemory(): MemoryState {
  return { episodes: [], facts: {}, vendettas: {}, placePrefs: {}, seenPlaces: {}, semantic: {} }
}

export function remember(m: MemoryState, kind: string, entityId: number | null, valence: number, intensity: number, tick: number): void {
  m.episodes.push({ kind, entityId, valence, intensity, tick, importance: episodeImportance(valence, intensity) })
  if (m.episodes.length > EPISODE_CAP) {
    consolidate(m, tick)
    forgetWeakest(m, EPISODE_CAP - 2)
  }
}

/** Emotional intensity and extremeness make a memory stick. */
export function episodeImportance(valence: number, intensity: number): number {
  return Math.min(1, Math.abs(valence) * 0.6 + intensity * 0.6)
}

/**
 * Fold repeated similar episodes into semantic summaries.
 * "Kiko stole from me three times" becomes a durable pattern even after the
 * individual episodes are forgotten.
 */
export function consolidate(m: MemoryState, tick: number): void {
  if (!m.semantic) m.semantic = {}
  if (m.episodes.length < CONSOLIDATE_AT) return
  const groups = new Map<string, Episode[]>()
  for (const ep of m.episodes) {
    const key = `${ep.kind}:${ep.entityId ?? 'world'}`
    const list = groups.get(key) ?? []
    list.push(ep)
    groups.set(key, list)
  }
  for (const [key, list] of groups) {
    if (list.length < 2) continue
    const avg = list.reduce((s, e) => s + e.valence, 0) / list.length
    const existing = m.semantic[key]
    if (existing) {
      const total = existing.count + list.length
      existing.avgValence = (existing.avgValence * existing.count + avg * list.length) / total
      existing.count = total
      existing.lastTick = tick
    } else {
      m.semantic[key] = {
        kind: list[0].kind,
        entityId: list[0].entityId,
        avgValence: avg,
        count: list.length,
        lastTick: tick,
      }
    }
  }
  // cap semantic store
  const keys = Object.keys(m.semantic)
  if (keys.length > 24) {
    keys.sort((a, b) => m.semantic![a].count - m.semantic![b].count)
    for (let i = 0; i < keys.length - 24; i++) delete m.semantic[keys[i]]
  }
}

/** Drop the least important episodes — creatures forget the mundane. */
export function forgetWeakest(m: MemoryState, keep = 12): void {
  if (m.episodes.length <= keep) return
  const scored = [...m.episodes].sort(
    (a, b) => (a.importance ?? episodeImportance(a.valence, a.intensity)) -
      (b.importance ?? episodeImportance(b.valence, b.intensity)),
  )
  const doomed = new Set(scored.slice(0, m.episodes.length - keep))
  m.episodes = m.episodes.filter((e) => !doomed.has(e))
}

/** What the creature has generalized about someone/something (−1..1). */
export function semanticFeeling(m: MemoryState, kind: string, entityId: number | null): number {
  const s = m.semantic?.[`${kind}:${entityId ?? 'world'}`]
  return s ? s.avgValence : 0
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

/** Approximate memory footprint in KB (for the inspector budget readout). */
export function memoryFootprintKb(m: MemoryState): number {
  const episodes = m.episodes.length * 0.06
  const semantic = Object.keys(m.semantic ?? {}).length * 0.05
  const rest = (Object.keys(m.placePrefs).length + Object.keys(m.vendettas).length) * 0.02
  return Math.round((episodes + semantic + rest) * 100) / 100
}
