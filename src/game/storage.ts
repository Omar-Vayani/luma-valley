import type { SaveData } from '../sim/save'

const DB_NAME = 'luma-valley'
const DB_VERSION = 1
const STORE = 'saves'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

export async function idbSave(key: string, data: SaveData): Promise<void> {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(data, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // IndexedDB unavailable — fall back to localStorage (small worlds fit)
    try {
      localStorage.setItem('luma:' + key, JSON.stringify(data))
    } catch {
      /* noop */
    }
  }
}

export async function idbLoad(key: string): Promise<SaveData | null> {
  try {
    const db = await openDb()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => resolve((req.result as SaveData) ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    const raw = localStorage.getItem('luma:' + key)
    if (!raw) return null
    try {
      return JSON.parse(raw) as SaveData
    } catch {
      return null
    }
  }
}

export async function idbRemove(key: string): Promise<void> {
  try {
    const db = await openDb()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    localStorage.removeItem('luma:' + key)
  }
}

export async function exportSave(data: SaveData): Promise<void> {
  const json = JSON.stringify(data, null, 1)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `luma-valley-${new Date().toISOString().slice(0, 10)}.luma.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadBytes(name: string, bytes: Uint8Array, type: string): void {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
