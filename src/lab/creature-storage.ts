/**
 * creature-storage — per-creature persistent storage with a 3MB budget.
 * Each creature's learned state (brain weights, vocabulary, memories) is
 * stored under its own key so it survives sessions and can grow vast.
 * Uses localStorage when available (browser); falls back to an in-memory
 * map in tests/SSR so the sim never depends on the DOM.
 */

export const CREATURE_STORAGE_BYTES = 3 * 1024 * 1024

export interface CreatureStorage {
  get(id: number): string | null
  set(id: number, value: string): void
  usage(id: number): number
}

function browserStorage(): CreatureStorage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return {
        get(id: number): string | null {
          return window.localStorage.getItem(`luma-creature-${id}`)
        },
        set(id: number, value: string): void {
          window.localStorage.setItem(`luma-creature-${id}`, value)
        },
        usage(id: number): number {
          return (window.localStorage.getItem(`luma-creature-${id}`) ?? '').length
        },
      }
    }
  } catch {
    // private mode / quota — fall through to memory
  }
  return null
}

/** In-memory fallback (tests, SSR, private mode). */
function memoryStorage(): CreatureStorage {
  const map = new Map<number, string>()
  return {
    get(id: number): string | null {
      return map.get(id) ?? null
    },
    set(id: number, value: string): void {
      map.set(id, value)
    },
    usage(id: number): number {
      return (map.get(id) ?? '').length
    },
  }
}

export function createStorage(_namespace = 'luma-lab'): CreatureStorage {
  return browserStorage() ?? memoryStorage()
}

/** Rough byte size of a JSON-serializable blob. */
export function estimateBytes(blob: unknown): number {
  try {
    return JSON.stringify(blob).length
  } catch {
    return 0
  }
}

export function saveCreatureState(storage: CreatureStorage, id: number, state: unknown): void {
  const json = JSON.stringify(state)
  // enforce the per-creature budget — never exceed 3MB
  if (json.length > CREATURE_STORAGE_BYTES) {
    // trim the least-important learned detail (oldest vocabulary words) is
    // handled by the caller; here we just refuse to blow the budget
    return
  }
  storage.set(id, json)
}

export function loadCreatureState(storage: CreatureStorage, id: number): unknown | null {
  const json = storage.get(id)
  if (!json) return null
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

const WORLD_KEY = 'luma-haven-world'

/** Autosave slot 0; manual slots 1..3. */
function worldKey(slot = 0): string {
  return slot === 0 ? WORLD_KEY : `${WORLD_KEY}-slot${slot}`
}

/** Autosave the whole world blob (versioned LabSave JSON). */
export function saveWorldBlob(json: string, slot = 0): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false
    // keep a one-deep backup of the autosave so a corrupt write is recoverable
    if (slot === 0) {
      const previous = window.localStorage.getItem(worldKey(0))
      if (previous) window.localStorage.setItem(`${WORLD_KEY}-backup`, previous)
    }
    window.localStorage.setItem(worldKey(slot), json)
    return true
  } catch {
    return false
  }
}

export function loadWorldBlob(slot = 0): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage.getItem(worldKey(slot))
  } catch {
    return null
  }
}

/** The previous autosave, used when the newest one fails to parse. */
export function loadWorldBackup(): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage.getItem(`${WORLD_KEY}-backup`)
  } catch {
    return null
  }
}

export function hasWorldSlot(slot: number): boolean {
  return loadWorldBlob(slot) !== null
}
