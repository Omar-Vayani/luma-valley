/**
 * audio — a tiny WebAudio engine that turns sim events into sounds.
 * Uses the pure soundForEvent specs; no external assets.
 * Must be unlocked by a user gesture (browsers block autoplay).
 */

import { soundForEvent, type SoundSpec } from './sounds'

export class SoundEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private enabled = true
  private lastPlay = 0
  private noiseBuffer: AudioBuffer | null = null

  /** Call from a user gesture (first tap) so the browser allows audio. */
  unlock(): void {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!AC) return
        this.ctx = new AC()
        this.master = this.ctx.createGain()
        this.master.gain.value = 0.6
        this.master.connect(this.ctx.destination)
      } catch {
        this.ctx = null
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume()
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    if (on) this.unlock()
  }

  get isEnabled(): boolean {
    return this.enabled
  }

  /** Play the sound for a sim event, with the creature's mood shaping pitch. */
  playEvent(event: string, mood: { pleasure: number; grief: number; fear: number }, volume = 1): void {
    if (!this.enabled) return
    const now = performance.now()
    if (now - this.lastPlay < 40) return // throttle so bursts don't blast
    this.lastPlay = now
    const spec = soundForEvent(event, mood)
    this.playSpec(spec, volume)
  }

  playSpec(spec: SoundSpec, volume = 1): void {
    if (!this.enabled || !this.ctx || !this.master) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const gain = ctx.createGain()
    const v = Math.min(0.9, spec.gain * volume)
    gain.gain.setValueAtTime(v, t0)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.duration)
    gain.connect(this.master)

    if (spec.type === 'noise') {
      // filtered noise burst (bury, thunder-ish sounds)
      if (!this.noiseBuffer) {
        const len = Math.floor(ctx.sampleRate * 0.5)
        this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate)
        const d = this.noiseBuffer.getChannelData(0)
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      }
      const src = ctx.createBufferSource()
      src.buffer = this.noiseBuffer
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(Math.max(80, spec.freq), t0)
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, spec.freqEnd), t0 + spec.duration)
      src.connect(filter)
      filter.connect(gain)
      src.start(t0)
      src.stop(t0 + spec.duration)
      return
    }

    const osc = ctx.createOscillator()
    osc.type = spec.type
    osc.frequency.setValueAtTime(spec.freq, t0)
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, spec.freqEnd), t0 + spec.duration)
    osc.connect(gain)
    osc.start(t0)
    osc.stop(t0 + spec.duration)
  }
}
