/**
 * audio — a small procedural mixer, and the rules that stop it being awful.
 *
 * The old build had no rules at all: every event in the valley played at full
 * volume wherever it happened, with a single 40 ms global throttle. That is
 * why one creature could hold a sound on repeat indefinitely, and why a death
 * two hundred metres away arrived at full blast in your ear.
 *
 * Three rules fix it, and they are the whole of this file's design:
 *
 * 1. **Everything is positional.** A sound has a place, and its gain falls off
 *    with distance to silence at `hearingRange`. Beyond that it is not played
 *    at all, so a busy valley costs nothing to be far away from.
 * 2. **Every sound has a cooldown, per source.** Two chirps from the same
 *    creature inside its cooldown is one chirp. This is what makes a
 *    stampeding creature sound like a creature rather than a machine gun.
 * 3. **Some sounds happen once, ever.** Anything in `ONCE_PER_SOURCE` is
 *    remembered and never repeated for the same creature.
 *
 * There is also a ceiling on how many voices can be alive at once, because the
 * cheapest way to make a scene sound stressful is to let it play everything.
 */

export type SoundName =
  | 'chirp' | 'happy' | 'hurt' | 'afraid' | 'eat' | 'drink' | 'snore'
  | 'greet' | 'play' | 'door' | 'splash' | 'learn' | 'step' | 'pick' | 'pet'

interface Spec {
  type: OscillatorType | 'noise'
  /** starting frequency */
  freq: number
  /** frequency at the end of the sound */
  freqEnd: number
  duration: number
  gain: number
  /** the shortest gap between two of these from the same source, in seconds */
  cooldown: number
}

/**
 * Deliberately quiet and deliberately short. Nothing here rings, because a
 * long tail is what turns a village into a drone.
 */
const SPECS: Record<SoundName, Spec> = {
  chirp: { type: 'sine', freq: 620, freqEnd: 780, duration: 0.1, gain: 0.16, cooldown: 2.2 },
  greet: { type: 'sine', freq: 520, freqEnd: 700, duration: 0.16, gain: 0.2, cooldown: 3.5 },
  happy: { type: 'triangle', freq: 700, freqEnd: 980, duration: 0.18, gain: 0.22, cooldown: 1.2 },
  hurt: { type: 'sawtooth', freq: 340, freqEnd: 180, duration: 0.2, gain: 0.28, cooldown: 1.4 },
  afraid: { type: 'sine', freq: 880, freqEnd: 520, duration: 0.14, gain: 0.18, cooldown: 2.6 },
  eat: { type: 'triangle', freq: 260, freqEnd: 200, duration: 0.08, gain: 0.14, cooldown: 1.1 },
  drink: { type: 'sine', freq: 300, freqEnd: 380, duration: 0.09, gain: 0.12, cooldown: 1.3 },
  snore: { type: 'sine', freq: 150, freqEnd: 110, duration: 0.5, gain: 0.1, cooldown: 4.5 },
  play: { type: 'square', freq: 640, freqEnd: 880, duration: 0.1, gain: 0.12, cooldown: 1.8 },
  door: { type: 'noise', freq: 900, freqEnd: 200, duration: 0.16, gain: 0.14, cooldown: 1 },
  splash: { type: 'noise', freq: 1400, freqEnd: 300, duration: 0.22, gain: 0.16, cooldown: 0.8 },
  learn: { type: 'triangle', freq: 780, freqEnd: 1180, duration: 0.22, gain: 0.22, cooldown: 0.6 },
  step: { type: 'noise', freq: 420, freqEnd: 130, duration: 0.06, gain: 0.07, cooldown: 0.16 },
  pick: { type: 'triangle', freq: 480, freqEnd: 620, duration: 0.09, gain: 0.16, cooldown: 0.25 },
  pet: { type: 'sine', freq: 420, freqEnd: 560, duration: 0.2, gain: 0.16, cooldown: 0.6 },
}

/** Sounds a given source is only ever allowed to make once. */
const ONCE_PER_SOURCE = new Set<SoundName>([])

const MAX_VOICES = 8

/**
 * The rules about what is allowed to make a noise, kept apart from the
 * WebAudio plumbing so they can be tested without a browser. This is where
 * "the same sound over and over for ever" is actually prevented.
 */
export class SoundGate {
  private lastPlayed = new Map<string, number>()
  private playedOnce = new Set<string>()

  allow(name: SoundName, source: number | string, now: number): boolean {
    const spec = SPECS[name]
    if (!spec) return false
    const key = `${source}:${name}`

    if (ONCE_PER_SOURCE.has(name)) {
      if (this.playedOnce.has(key)) return false
      this.playedOnce.add(key)
    }

    const last = this.lastPlayed.get(key)
    if (last != null && now - last < spec.cooldown) return false
    this.lastPlayed.set(key, now)
    return true
  }

  /** How long this sound must wait between plays from one source. */
  cooldownOf(name: SoundName): number {
    return SPECS[name]?.cooldown ?? 0
  }

  reset(): void {
    this.lastPlayed.clear()
    this.playedOnce.clear()
  }
}

/**
 * How loud something at this distance should be, and zero past the range.
 * Pure, so the falloff can be checked directly.
 */
export function falloffAt(distance: number, range: number): number {
  if (distance >= range) return 0
  const t = Math.max(0, (distance - 1.5) / Math.max(0.001, range - 1.5))
  return (1 - t) * (1 - t)
}

export interface Listener {
  x: number
  z: number
}

export class Audio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null

  private volume = 0.55
  private range = 22
  private muted = false

  private gate = new SoundGate()
  private voices = 0

  private listener: Listener = { x: 0, z: 0 }

  /** Must be called from a user gesture, or the browser will not allow sound. */
  unlock(): void {
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctor) return
        this.ctx = new Ctor()
        this.master = this.ctx.createGain()
        this.master.gain.value = this.muted ? 0 : this.volume
        this.master.connect(this.ctx.destination)
      } catch {
        this.ctx = null
      }
    }
    if (this.ctx?.state === 'suspended') void this.ctx.resume()
  }

  get ready(): boolean {
    return this.ctx != null
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v))
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.master) this.master.gain.value = muted ? 0 : this.volume
  }

  /** How far away something can be and still be heard at all. */
  setHearingRange(metres: number): void {
    this.range = Math.max(4, metres)
  }

  get hearingRange(): number {
    return this.range
  }

  setListener(x: number, z: number): void {
    this.listener.x = x
    this.listener.z = z
  }

  /**
   * How loud something at this distance would be, 0 outside the range. Public
   * because the HUD draws the same falloff as a ring on the map.
   */
  attenuation(x: number, z: number): number {
    return falloffAt(Math.hypot(x - this.listener.x, z - this.listener.z), this.range)
  }

  /**
   * Play a sound at a place. `source` identifies who made it, so the cooldown
   * and the once-only rule can be applied per creature rather than globally.
   */
  play(name: SoundName, x: number, z: number, source: number | string = 'world', strength = 1): void {
    if (!this.ctx || !this.master || this.muted) return
    const spec = SPECS[name]
    if (!spec) return

    // out of earshot costs nothing, and is checked before the cooldown so a
    // distant creature does not use up its own quiet period unheard
    const falloff = this.attenuation(x, z)
    if (falloff <= 0.002) return
    if (this.voices >= MAX_VOICES) return
    if (!this.gate.allow(name, source, this.ctx.currentTime)) return

    this.emit(spec, falloff * Math.max(0, Math.min(1, strength)), this.pan(x, z))
  }

  /** A sound with no place in the world: the interface, mostly. */
  playFlat(name: SoundName, strength = 1): void {
    if (!this.ctx || !this.master || this.muted) return
    const spec = SPECS[name]
    if (!spec) return
    if (!this.gate.allow(name, 'ui', this.ctx.currentTime)) return
    this.emit(spec, strength, 0)
  }

  /** −1 hard left to +1 hard right, from where the listener is. */
  private pan(x: number, z: number): number {
    const dx = x - this.listener.x
    const dz = z - this.listener.z
    const d = Math.hypot(dx, dz) || 1
    return Math.max(-1, Math.min(1, dx / d)) * 0.6
  }

  private emit(spec: Spec, gainScale: number, pan: number): void {
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master) return

    const t0 = ctx.currentTime
    const gain = ctx.createGain()
    const peak = Math.max(0.0002, spec.gain * gainScale)
    // a short attack rather than a click, then an exponential tail
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.duration)

    const panner = ctx.createStereoPanner?.()
    if (panner) {
      panner.pan.value = pan
      gain.connect(panner)
      panner.connect(master)
    } else {
      gain.connect(master)
    }

    this.voices++
    const done = (): void => {
      this.voices = Math.max(0, this.voices - 1)
    }

    if (spec.type === 'noise') {
      if (!this.noise) {
        const length = Math.floor(ctx.sampleRate * 0.5)
        this.noise = ctx.createBuffer(1, length, ctx.sampleRate)
        const data = this.noise.getChannelData(0)
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
      }
      const src = ctx.createBufferSource()
      src.buffer = this.noise
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(Math.max(80, spec.freq), t0)
      filter.frequency.exponentialRampToValueAtTime(Math.max(60, spec.freqEnd), t0 + spec.duration)
      src.connect(filter)
      filter.connect(gain)
      src.onended = done
      src.start(t0)
      src.stop(t0 + spec.duration)
      return
    }

    const osc = ctx.createOscillator()
    osc.type = spec.type
    osc.frequency.setValueAtTime(spec.freq, t0)
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, spec.freqEnd), t0 + spec.duration)
    osc.connect(gain)
    osc.onended = done
    osc.start(t0)
    osc.stop(t0 + spec.duration)
  }

  dispose(): void {
    void this.ctx?.close()
    this.ctx = null
    this.master = null
  }
}
