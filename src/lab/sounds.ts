/**
 * sounds — creatures make sounds based on their experience.
 * Each sim event maps to a distinct little sound (eat, drink, fight, love,
 * death, play, work...), and the creature's mood shifts the pitch:
 * happy = brighter, sad/grieving = lower, afraid = panicked higher.
 * Pure data: the audio engine (renderer side) turns SoundSpec into WebAudio.
 */

export interface Mood {
  pleasure: number
  grief: number
  fear: number
}

export interface SoundSpec {
  type: 'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise'
  freq: number // start frequency (Hz)
  freqEnd: number // slide target
  duration: number // seconds
  gain: number // 0..1
  pan?: number // -1..1 stereo
}

/** Mood → pitch multiplier: joy brightens, grief lowers, fear raises. */
export function moodPitchShift(pleasure: number, grief: number, fear: number): number {
  let m = 1
  m *= 1 + (pleasure - 0.5) * 0.5 // 0.5 -> 1.0, 1.0 -> 1.25, 0.0 -> 0.75
  m *= 1 - Math.min(grief, 1) * 0.25 // grief lowers (down to 0.75)
  m *= 1 + Math.min(fear, 1) * 0.12 // fear raises (up to 1.12)
  return m
}

type BaseSpec = Omit<SoundSpec, 'pan'>
const BASE: Record<string, BaseSpec> = {
  eat: { type: 'triangle', freq: 320, freqEnd: 420, duration: 0.18, gain: 0.14 },
  drink: { type: 'sine', freq: 500, freqEnd: 250, duration: 0.3, gain: 0.16 },
  fight: { type: 'square', freq: 120, freqEnd: 70, duration: 0.22, gain: 0.22 },
  steal: { type: 'sawtooth', freq: 900, freqEnd: 700, duration: 0.12, gain: 0.12 },
  love: { type: 'sine', freq: 660, freqEnd: 990, duration: 0.4, gain: 0.18 },
  birth: { type: 'sine', freq: 880, freqEnd: 1320, duration: 0.35, gain: 0.16 },
  death: { type: 'sine', freq: 200, freqEnd: 90, duration: 0.7, gain: 0.2 },
  play: { type: 'triangle', freq: 520, freqEnd: 780, duration: 0.2, gain: 0.12 },
  gym: { type: 'triangle', freq: 520, freqEnd: 780, duration: 0.2, gain: 0.12 },
  school: { type: 'triangle', freq: 600, freqEnd: 600, duration: 0.08, gain: 0.1 },
  work: { type: 'square', freq: 150, freqEnd: 150, duration: 0.1, gain: 0.14 },
  bury: { type: 'noise', freq: 200, freqEnd: 100, duration: 0.5, gain: 0.14 },
  gift: { type: 'sine', freq: 740, freqEnd: 1110, duration: 0.25, gain: 0.12 },
  medicine: { type: 'sine', freq: 420, freqEnd: 630, duration: 0.3, gain: 0.14 },
  sleep: { type: 'sine', freq: 240, freqEnd: 180, duration: 0.6, gain: 0.08 },
  wander: { type: 'triangle', freq: 300, freqEnd: 360, duration: 0.12, gain: 0.06 },
  flee: { type: 'sawtooth', freq: 800, freqEnd: 1100, duration: 0.18, gain: 0.14 },
  drop: { type: 'sine', freq: 1000, freqEnd: 1500, duration: 0.12, gain: 0.1 },
  flinch: { type: 'square', freq: 700, freqEnd: 400, duration: 0.1, gain: 0.1 },
  default: { type: 'triangle', freq: 400, freqEnd: 400, duration: 0.1, gain: 0.08 },
}

/** Map a sim event type to a sound, shifted by the creature's mood. */
export function soundForEvent(event: string, mood: Mood): SoundSpec {
  const b = BASE[event] ?? BASE.default
  const shift = moodPitchShift(mood.pleasure, mood.grief, mood.fear)
  return {
    type: b.type,
    freq: b.freq * shift,
    freqEnd: b.freqEnd * shift,
    duration: b.duration,
    gain: b.gain,
    pan: 0,
  }
}
