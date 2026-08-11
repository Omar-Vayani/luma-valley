/**
 * settings — configurable graphics + simulation knobs for the target laptop.
 * Defaults aim for ~60 FPS at medium quality without maxing out the machine.
 * All values are plain JSON-safe so they persist with the save / localStorage.
 */

export type QualityPreset = 'low' | 'medium' | 'high'

export interface GameSettings {
  /** Visual quality preset — drives pixel ratio, particles, labels. */
  quality: QualityPreset
  /** Max living creatures. Births pause when this is reached. */
  populationCap: number
  /** How many creatures get a full mind re-score each sim tick (time-slice). */
  aiBatchSize: number
  /** Distant creatures (beyond this) update AI less often. */
  lodNear: number
  /** Beyond this, only chemistry/aging tick (sleeping LOD). */
  lodFar: number
  /** Sim ticks per second (independent of render FPS). */
  simHz: number
  /** Pixel ratio cap (1 = sharp on 1x, 2 = retina-ish). */
  pixelRatioCap: number
  /** Show floating name/emotion labels. */
  showLabels: boolean
  /** Show particle FX (hearts, coins, Zzz). */
  showParticles: boolean
  /** Gentle mode: no starvation / violent permadeath. */
  gentleMode: boolean
  /** Travellers occasionally settle in Haven when the population thins. */
  allowNewcomers: boolean
  /** Optional richer dialogue from a service you supply (never required). */
  optionalCloudAi: boolean
  /**
   * Where that service lives. Blank means the game uses its own voice, which
   * is the default and works offline forever.
   */
  cloudEndpoint: string
}

export const DEFAULT_SETTINGS: GameSettings = {
  quality: 'medium',
  populationCap: 16,
  aiBatchSize: 4,
  lodNear: 28,
  lodFar: 55,
  simHz: 6,
  pixelRatioCap: 1.5,
  showLabels: true,
  showParticles: true,
  gentleMode: false,
  allowNewcomers: true,
  optionalCloudAi: false,
  cloudEndpoint: '',
}

export function settingsForPreset(quality: QualityPreset): Partial<GameSettings> {
  if (quality === 'low') {
    return {
      quality,
      populationCap: 10,
      aiBatchSize: 2,
      pixelRatioCap: 1,
      showLabels: false,
      showParticles: false,
      lodNear: 20,
      lodFar: 40,
    }
  }
  if (quality === 'high') {
    return {
      quality,
      populationCap: 24,
      aiBatchSize: 6,
      pixelRatioCap: 2,
      showLabels: true,
      showParticles: true,
      lodNear: 36,
      lodFar: 70,
    }
  }
  return { ...DEFAULT_SETTINGS }
}

export function applyPreset(base: GameSettings, quality: QualityPreset): GameSettings {
  return { ...base, ...settingsForPreset(quality) }
}

const STORAGE_KEY = 'luma-haven-settings-v1'

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<GameSettings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s: GameSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // private mode / quota — ignore
  }
}
