/**
 * Luma Valley — Test Lab V2 observer UI.
 * Mobile-first: a live world (Three.js via LabView) is the feedback.
 * No text logs — the dock acts on the world, taps inspect.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { LabView } from './render/labview'
import { createSim, type Sim } from './lab/sim'
import { deriveEmotion, type EmotionType } from './lab/emotion'

import './lab.css'

type ToolMode = 'bread' | 'money' | 'poke' | 'hit' | null

interface DockItem {
  id: 'spawn' | Exclude<ToolMode, null>
  label: string
  emoji: string
}

const DOCK: ReadonlyArray<DockItem> = [
  { id: 'spawn', label: 'spawn', emoji: '🐣' },
  { id: 'bread', label: 'bread', emoji: '🍞' },
  { id: 'money', label: 'money', emoji: '🪙' },
  { id: 'poke', label: 'poke', emoji: '✋' },
  { id: 'hit', label: 'hit', emoji: '⚔️' },
]

const EMOJI: Record<EmotionType, string> = {
  content: '🙂',
  happy: '😊',
  angry: '😠',
  afraid: '😨',
  sad: '😢',
  sleepy: '😴',
  loving: '😍',
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div className="bar">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="bar-val">{pct}</span>
    </div>
  )
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null)
  const simRef = useRef<Sim | null>(null)
  const viewRef = useRef<LabView | null>(null)
  const toolRef = useRef<ToolMode>(null)
  const pausedRef = useRef(false)

  const [, setTick] = useState(0)
  const [tool, setTool] = useState<ToolMode>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState<1 | 2>(1)

  // Boot the sim + renderer exactly once. StrictMode double-mounts in dev:
  // the cleanup disposes the previous view before the effect re-runs, and the
  // ref guard keeps two LabViews from ever existing at the same time.
  useEffect(() => {
    const mount = mountRef.current
    if (!mount || viewRef.current) return

    const params = new URLSearchParams(window.location.search)
    const seedRaw = params.get('seed')
    const parsed = seedRaw !== null ? Number(seedRaw) : NaN
    const seed = Number.isFinite(parsed) ? parsed : Math.floor(Math.random() * 1e9)

    const sim = createSim(seed)
    simRef.current = sim

    const view = new LabView(mount, sim, {
      onTapCreature: (id: number) => {
        const mode = toolRef.current
        if (mode === 'poke') {
          sim.poke(id)
          return
        }
        if (mode === 'hit') {
          sim.hit(id)
          return
        }
        setSelectedId(id)
      },
      onTapWorld: (x: number, z: number) => {
        const mode = toolRef.current
        if (mode === 'bread') {
          sim.dropFood(x, z)
          return
        }
        if (mode === 'money') {
          sim.dropMoney(x, z, 10)
          return
        }
        // No tool armed: a world tap just dismisses the open chip.
        setSelectedId(null)
      },
    })
    viewRef.current = view

    setTick((t) => t + 1)
    const id = window.setInterval(() => setTick((t) => t + 1), 300)

    return () => {
      window.clearInterval(id)
      viewRef.current?.dispose()
      viewRef.current = null
      simRef.current = null
    }
  }, [])

  const setToolMode = useCallback((mode: ToolMode): void => {
    toolRef.current = mode
    setTool(mode)
  }, [])

  const spawn = useCallback((): void => {
    simRef.current?.spawnCreature()
    setTick((t) => t + 1)
  }, [])

  const toggleTool = useCallback(
    (mode: Exclude<ToolMode, null>): void => {
      if (toolRef.current === mode) {
        setToolMode(null)
      } else {
        setToolMode(mode)
        setSelectedId(null)
      }
    },
    [setToolMode],
  )

  const togglePause = useCallback((): void => {
    const next = !pausedRef.current
    pausedRef.current = next
    setPaused(next)
    viewRef.current?.setPaused(next)
  }, [])

  const applySpeed = useCallback((s: 1 | 2): void => {
    pausedRef.current = false
    setPaused(false)
    setSpeed(s)
    viewRef.current?.setPaused(false)
    viewRef.current?.setSpeed(s)
  }, [])

  const sim = simRef.current
  const alive = sim ? sim.creatures.filter((c) => c.alive).length : 0
  const selected = selectedId !== null ? sim?.creatureById(selectedId) ?? null : null
  const emotion = selected ? deriveEmotion(selected.chem, selected.genome) : null
  const partner =
    selected && selected.partnerId !== null ? (sim?.creatureById(selected.partnerId) ?? null) : null

  return (
    <div className="app" data-lab>
      <div className="mount" ref={mountRef} />

      <header className="topbar" data-topbar>
        <h1 className="logo">Luma Lab</h1>
        <div className="topbar-right">
          <span className="pill" data-count="alive">
            🐣 {alive}
          </span>
          <div className="speed" role="group" aria-label="Simulation speed">
            <button
              type="button"
              className={`speed-btn ${paused ? 'speed-btn-active' : ''}`}
              data-speed="pause"
              aria-pressed={paused}
              aria-label={paused ? 'Resume' : 'Pause'}
              onClick={togglePause}
            >
              ⏸
            </button>
            <button
              type="button"
              className={`speed-btn ${!paused && speed === 1 ? 'speed-btn-active' : ''}`}
              data-speed="1"
              aria-pressed={!paused && speed === 1}
              onClick={() => applySpeed(1)}
            >
              1×
            </button>
            <button
              type="button"
              className={`speed-btn ${!paused && speed === 2 ? 'speed-btn-active' : ''}`}
              data-speed="2"
              aria-pressed={!paused && speed === 2}
              onClick={() => applySpeed(2)}
            >
              2×
            </button>
          </div>
        </div>
      </header>

      {selected && selected.alive && emotion && (
        <section className="chip" data-chip aria-label={`${selected.name} details`}>
          <header className="chip-head">
            <h2>{selected.name}</h2>
            <button
              type="button"
              className="chip-close"
              data-chip-close
              aria-label="Close"
              onClick={() => setSelectedId(null)}
            >
              ✕
            </button>
          </header>
          <div className="chip-mood">
            <span className="chip-emoji">{EMOJI[emotion.type]}</span>
            <span className="chip-dot" style={{ background: emotion.color }} />
            <span className="chip-mood-label">{emotion.type}</span>
            {selected.gangId !== null && <span className="chip-gang">⚔️ gang</span>}
          </div>
          <div className="chip-bars">
            <Bar label="hunger" value={selected.chem.hunger} color="#e8876a" />
            <Bar label="energy" value={selected.chem.energy} color="#e0b46a" />
            <Bar label="fear" value={selected.chem.fear} color="#9fc7e8" />
          </div>
          <div className="chip-stats">
            <span>🪙 {Math.round(selected.wallet)}</span>
            <span>🏦 {Math.round(selected.banked)}</span>
            <span className="chip-action">{selected.action}</span>
          </div>
          {partner && <p className="chip-partner">💛 {partner.name}</p>}
        </section>
      )}

      <nav className="dock" data-dock aria-label="Lab tools">
        {DOCK.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`dock-btn ${tool === item.id ? 'dock-btn-active' : ''}`}
            data-lab-tool={item.id}
            aria-pressed={tool === item.id}
            aria-label={item.label}
            onClick={() => {
              if (item.id === 'spawn') spawn()
              else toggleTool(item.id)
            }}
          >
            <span className="dock-emoji">{item.emoji}</span>
            <span className="dock-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
