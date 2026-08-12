/**
 * progress — everything the *player* accumulates, as opposed to everything
 * the settlement does on its own.
 *
 * The simulation in `src/lab` does not know you exist beyond a position and an
 * inventory, and that is the right split: this module holds the discoveries,
 * standing, gathered nodes and built things that belong to your particular
 * visit, and serialises them alongside the world save.
 */
import type { ItemId } from '../lab/inventory'

export type PlaceableKind = 'lantern' | 'fence' | 'marker'

/** What it costs to set one down, and what you get back for picking it up. */
export const PLACEABLE_COST: Record<PlaceableKind, ItemId> = {
  lantern: 'lantern',
  fence: 'timber',
  marker: 'stone',
}

export const PLACEABLE_LABEL: Record<PlaceableKind, string> = {
  lantern: 'lantern',
  fence: 'fence post',
  marker: 'stone marker',
}

export interface PlacedProp {
  id: string
  kind: PlaceableKind
  x: number
  y: number
  z: number
  rot: number
  /** tick it was placed, so the journal can say when */
  tick: number
}

export type JournalKind = 'landmark' | 'deed' | 'note' | 'first'

export interface JournalEntry {
  id: string
  kind: JournalKind
  tick: number
  title: string
  text: string
}

export interface PlayerProgress {
  version: 2
  /** landmark ids you have stood next to */
  discovered: string[]
  /** region ids you have walked through */
  visited: string[]
  /** node id -> the tick it grows back */
  nodes: Record<string, number>
  placed: PlacedProp[]
  /** 0..1 — how Haven regards you */
  standing: number
  /** counters worth showing on a stats screen */
  deeds: number
  gathered: number
  crafted: number
  meals: number
  /** creature ids you have spoken with */
  met: number[]
  journal: JournalEntry[]
  /** nine slots, by item, in the order you arranged them */
  hotbar: (ItemId | null)[]
  seenIntro: boolean
  nextPropId: number
}

export const HOTBAR_SLOTS = 9

export function createProgress(): PlayerProgress {
  return {
    version: 2,
    discovered: [],
    visited: [],
    nodes: {},
    placed: [],
    standing: 0.1,
    deeds: 0,
    gathered: 0,
    crafted: 0,
    meals: 0,
    met: [],
    journal: [],
    hotbar: ['bread', 'water', 'berry', null, null, null, null, null, null],
    seenIntro: false,
    nextPropId: 1,
  }
}

/** Merge a loaded blob over the defaults so old saves keep working. */
export function migrateProgress(raw: unknown): PlayerProgress {
  const base = createProgress()
  if (!raw || typeof raw !== 'object') return base
  const p = raw as Partial<PlayerProgress>
  return {
    ...base,
    ...p,
    version: 2,
    discovered: p.discovered ?? [],
    visited: p.visited ?? [],
    nodes: p.nodes ?? {},
    placed: p.placed ?? [],
    met: p.met ?? [],
    journal: p.journal ?? [],
    hotbar: normaliseHotbar(p.hotbar),
  }
}

function normaliseHotbar(bar: unknown): (ItemId | null)[] {
  const out: (ItemId | null)[] = Array(HOTBAR_SLOTS).fill(null)
  if (Array.isArray(bar)) {
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const v = bar[i]
      out[i] = typeof v === 'string' ? (v as ItemId) : null
    }
  }
  return out
}

// ---------------------------------------------------------------- journal

export function addJournal(p: PlayerProgress, entry: Omit<JournalEntry, 'id'>): JournalEntry | null {
  const id = `${entry.kind}:${entry.title}`
  if (p.journal.some((e) => e.id === id)) return null
  const made: JournalEntry = { id, ...entry }
  p.journal.unshift(made)
  if (p.journal.length > 200) p.journal.length = 200
  return made
}

/** Record a first meeting. Returns true the first time only. */
export function meet(p: PlayerProgress, creatureId: number): boolean {
  if (p.met.includes(creatureId)) return false
  p.met.push(creatureId)
  return true
}

// ---------------------------------------------------------------- standing

/**
 * Standing moves slowly and asymmetrically: helping nudges it up, being seen
 * to take moves it down harder. Haven forgives, but it does not forget fast.
 */
export function adjustStanding(p: PlayerProgress, delta: number): void {
  const scaled = delta > 0 ? delta : delta * 1.6
  p.standing = Math.max(0, Math.min(1, p.standing + scaled))
}

export interface StandingRank {
  title: string
  blurb: string
}

export function standingRank(standing: number): StandingRank {
  if (standing < 0.08) return { title: 'Outsider', blurb: 'Doors close as you pass.' }
  if (standing < 0.2) return { title: 'Stranger', blurb: 'Politely ignored.' }
  if (standing < 0.36) return { title: 'Newcomer', blurb: 'Recognised, not yet counted.' }
  if (standing < 0.55) return { title: 'Neighbour', blurb: 'Greeted by name.' }
  if (standing < 0.72) return { title: 'Trusted', blurb: 'Asked for favours.' }
  if (standing < 0.88) return { title: 'Kin of Haven', blurb: 'Fed without asking.' }
  return { title: 'Keeper of the Well', blurb: 'The settlement counts you as its own.' }
}

// ---------------------------------------------------------------- placing

export function placeProp(
  p: PlayerProgress,
  kind: PlaceableKind,
  x: number,
  y: number,
  z: number,
  rot: number,
  tick: number,
): PlacedProp {
  const prop: PlacedProp = { id: `p${p.nextPropId++}`, kind, x, y, z, rot, tick }
  p.placed.push(prop)
  return prop
}

export function removeProp(p: PlayerProgress, id: string): PlacedProp | null {
  const i = p.placed.findIndex((x) => x.id === id)
  if (i < 0) return null
  return p.placed.splice(i, 1)[0]
}

/** The placed prop within reach of a point, nearest first. */
export function propNear(p: PlayerProgress, x: number, z: number, reach = 2.4): PlacedProp | null {
  let best: PlacedProp | null = null
  let bestD = reach
  for (const prop of p.placed) {
    const d = Math.hypot(prop.x - x, prop.z - z)
    if (d < bestD) {
      bestD = d
      best = prop
    }
  }
  return best
}

// ---------------------------------------------------------------- storage

const KEY = 'luma-haven-progress-v2'

export function saveProgress(p: PlayerProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // private mode / quota — the world save is the one that matters
  }
}

export function loadProgress(): PlayerProgress {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return createProgress()
    return migrateProgress(JSON.parse(raw))
  } catch {
    return createProgress()
  }
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nothing to do
  }
}
