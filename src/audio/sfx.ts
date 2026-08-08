/**
 * sfx — procedural WebAudio: creature voices (pitch from genome), munch,
 * hurt, happy chirps, plus soft valley ambience (water/wind/birds).
 * No audio assets; everything synthesized.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  enabled = true

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      if (!AC) return null
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.5
      this.master.connect(this.ctx.destination)
      // noise buffer for wind/water
      const len = this.ctx.sampleRate * 2
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const data = this.noiseBuf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  resume(): void {
    this.ensure()
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol = 0.15,
    slideTo?: number,
  ): void {
    if (!this.enabled) return
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, ctx.currentTime)
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur)
    osc.connect(gain)
    gain.connect(this.master)
    osc.start()
    osc.stop(ctx.currentTime + dur + 0.05)
  }

  voice(pitch: number, mood: 'happy' | 'sad' | 'neutral' = 'neutral'): void {
    const base = 300 + pitch * 500
    if (mood === 'happy') {
      this.tone(base, 0.12, 'sine', 0.12, base * 1.4)
      setTimeout(() => this.tone(base * 1.3, 0.14, 'sine', 0.1, base * 1.6), 90)
    } else if (mood === 'sad') {
      this.tone(base * 0.8, 0.3, 'triangle', 0.1, base * 0.6)
    } else {
      this.tone(base, 0.1, 'sine', 0.08, base * 0.95)
    }
  }

  munch(): void {
    this.tone(180, 0.06, 'square', 0.05)
    setTimeout(() => this.tone(160, 0.06, 'square', 0.05), 80)
  }

  hurt(): void {
    this.tone(400, 0.2, 'sawtooth', 0.08, 200)
  }

  click(): void {
    this.tone(700, 0.04, 'sine', 0.06)
  }

  /** Gentle valley ambience: filtered noise (wind/water) + sparse birds. */
  ambience(seconds = 0): void {
    const ctx = this.ensure()
    if (!ctx || !this.master || !this.noiseBuf) return
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420
    const gain = ctx.createGain()
    gain.gain.value = 0.018
    src.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    src.start()
    // sparse bird chirps
    const chirp = () => {
      if (!this.enabled) return
      const f = 1800 + Math.random() * 1400
      this.tone(f, 0.07, 'sine', 0.02, f * 1.2)
      setTimeout(() => {
        if (Math.random() < 0.6) this.tone(f * 0.9, 0.06, 'sine', 0.015)
      }, 90)
    }
    const id = window.setInterval(chirp, 6000)
    ;(src as any)._stop = () => {
      window.clearInterval(id)
      src.stop()
    }
    void seconds
  }
}
