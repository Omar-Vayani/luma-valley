/** Graphics settings. Three presets, because nobody wants a slider wall. */
export type QualityPreset = 'low' | 'medium' | 'high'

export interface QualityProfile {
  pixelRatio: number
  shadows: boolean
  shadowMapSize: number
  shadowDistance: number
  bloom: boolean
  bloomStrength: number
  msaa: number
  /** fraction of the undergrowth kept */
  groundCover: number
  grade: boolean
}

export const QUALITY: Record<QualityPreset, QualityProfile> = {
  low: {
    pixelRatio: 1, shadows: false, shadowMapSize: 1024, shadowDistance: 45,
    bloom: false, bloomStrength: 0, msaa: 0, groundCover: 0.3, grade: false,
  },
  medium: {
    pixelRatio: 1.25, shadows: true, shadowMapSize: 2048, shadowDistance: 65,
    bloom: true, bloomStrength: 0.18, msaa: 0, groundCover: 0.65, grade: true,
  },
  high: {
    pixelRatio: 1.5, shadows: true, shadowMapSize: 3072, shadowDistance: 85,
    bloom: true, bloomStrength: 0.24, msaa: 4, groundCover: 1, grade: true,
  },
}

export interface Settings {
  quality: QualityPreset
  /** master volume, 0..1 */
  volume: number
  /** how far away a sound can still be heard, in metres */
  hearingRange: number
  sensitivity: number
  showNames: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'high',
  volume: 0.55,
  hearingRange: 22,
  sensitivity: 0.5,
  showNames: true,
}

const KEY = 'luma.settings.v3'

export function loadSettings(): Settings {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // not worth caring about
  }
}
