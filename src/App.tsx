import { useEffect, useRef, useState } from 'react'
import { Game } from './sim/game'
import { GameView } from './render/gameview'
import { SoundEngine } from './audio/sfx'
import { idbLoad, idbSave, exportSave } from './game/storage'
import type { SaveData } from './sim/save'
import './index.css'

const AUTOSAVE_KEY = 'autosave'
const SLOTS = ['slot1', 'slot2', 'slot3']

type MenuState = 'closed' | 'menu' | 'journal'

const MOOD = (pleasure: number, fear: number, health: number): string => {
  if (fear > 0.5) return 'scared'
  if (pleasure > 0.55) return 'happy'
  if (health < 0.35) return 'unwell'
  return 'calm'
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
  const gameRef = useRef<Game | null>(null)
  const viewRef = useRef<GameView | null>(null)
  const soundRef = useRef<SoundEngine | null>(null)

  const [started, setStarted] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  const [menu, setMenu] = useState<MenuState>('closed')
  const [gentle, setGentle] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [follow, setFollow] = useState(false)
  const [names, setNames] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [word, setWord] = useState('')
  const [hasSave, setHasSave] = useState(false)

  // ── boot: restore autosave if present ──
  useEffect(() => {
    void idbLoad(AUTOSAVE_KEY).then((data) => {
      setHasSave(!!data)
    })
  }, [])

  const startNew = (seed?: number): void => {
    const s = seed ?? Math.floor(Math.random() * 1e9)
    const g = new Game(s, 40, { gentle })
    g.spawnInitial(5)
    bootGame(g)
  }

  const bootGame = (g: Game): void => {
    const sound = soundRef.current ?? new SoundEngine()
    soundRef.current = sound
    sound.ambience()
    gameRef.current = g

    if (viewRef.current) viewRef.current.dispose()
    const view = new GameView(mountRef.current!, g, sound, {
      onSelect: (id) => setSelectedId(id),
    })
    viewRef.current = view
    setSelectedId(g.creatures[0]?.id ?? null)
    setStarted(true)
    setTick((t) => t + 1)
  }

  const loadGame = (data: SaveData): void => {
    const g = new Game(data.seed, data.world.size, data.settings)
    g.load(data)
    setGentle(data.settings.gentle)
    bootGame(g)
  }

  // autosave every 12s
  useEffect(() => {
    if (!started) return
    const id = window.setInterval(() => {
      if (gameRef.current) void idbSave(AUTOSAVE_KEY, gameRef.current.save())
    }, 12000)
    const onHide = () => {
      if (gameRef.current) void idbSave(AUTOSAVE_KEY, gameRef.current.save())
    }
    window.addEventListener('beforeunload', onHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('beforeunload', onHide)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [started])

  // UI refresh loop (~4/s)
  useEffect(() => {
    if (!started) return
    const id = window.setInterval(() => setTick((t) => t + 1), 250)
    return () => window.clearInterval(id)
  }, [started])

  const game = gameRef.current
  const selected = selectedId !== null ? game?.selectedCreature(selectedId) ?? null : null
  const g = game! // panel/menu only render when game exists
  const alive = game?.creatures.filter((c) => c.alive).length ?? 0

  // death toast
  useEffect(() => {
    if (!game) return
    const dead = game.creatures.filter((c) => !c.alive && c.journal.some((j) => j.text.includes('passes away')))
    if (dead.length > 0) {
      const last = dead[dead.length - 1]
      if (last.journal[last.journal.length - 1]?.text.includes('passes away')) {
        setToast(`${last.name} has passed away…`)
      }
    }
  }, [tick, game])

  const act = (fn: () => boolean | void, sound?: () => void): void => {
    fn()
    sound?.()
    setTick((t) => t + 1)
  }

  const dayLabel =
    game && game.world.state.dayTime > 0.75 ? '🌙 night'
    : game && game.world.state.dayTime > 0.35 ? '🌞 day'
      : '🌅 dawn'

  return (
    <div className="app">
      <div className="mount" ref={mountRef} />

      {/* Top bar */}
      <header className="topbar">
        <h1 className="logo">Luma Valley</h1>
        <div className="topbar-right">
          <span className="pill">{alive} creatures</span>
          <span className="pill">{dayLabel}</span>
          <button className="icon-btn" onClick={() => setMenu('menu')} aria-label="Menu">☰</button>
        </div>
      </header>

      {/* Selected creature panel */}
      {started && selected && (
        <aside className="panel">
          <div className="panel-head">
            <h2>{selected.name}</h2>
            <span className={`mood mood-${MOOD(selected.chem.pleasure, selected.chem.fear, selected.chem.health)}`}>
              {MOOD(selected.chem.pleasure, selected.chem.fear, selected.chem.health)}
            </span>
          </div>
          <p className="age">age {Math.floor(selected.age / 100)} · {selected.alive ? selected.action : 'deceased'}</p>
          {selected.alive && (
            <>
              <Bar label="hunger" value={selected.chem.hunger} color="#e8876a" />
              <Bar label="thirst" value={selected.chem.thirst} color="#7fb6de" />
              <Bar label="tired" value={selected.chem.fatigue} color="#b7a7d8" />
              <Bar label="bored" value={selected.chem.boredom} color="#f0c46a" />
              <Bar label="lonely" value={selected.chem.loneliness} color="#e0a0c0" />
              <Bar label="health" value={selected.chem.health} color="#7fc27a" />
              <div className="actions">
                <button className="btn" onClick={() => act(() => g.feed(selected.id), () => soundRef.current?.munch())}>🍓 Feed</button>
                <button className="btn" onClick={() => act(() => g.tickle(selected.id), () => soundRef.current?.voice(selected.traits.voicePitch, 'happy'))}>✨ Tickle</button>
                <button
                  className={`btn ${g.carriedId === selected.id ? 'btn-active' : ''}`}
                  onClick={() => {
                    const next = g.carriedId === selected.id ? null : selected.id
                    g.setCarried(next)
                    viewRef.current?.select(next)
                    setTick((t) => t + 1)
                  }}
                >
                  {g.carriedId === selected.id ? '🧺 Put down' : '🤲 Carry'}
                </button>
              </div>
              <div className="teach">
                <input
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  placeholder="teach a word…"
                  maxLength={20}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && word.trim()) {
                      act(() => g.speak(selected.id, word.trim()))
                      setWord('')
                    }
                  }}
                />
                <button className="btn btn-small" onClick={() => { act(() => g.speak(selected.id, word.trim() || 'come')); setWord('') }}>Speak</button>
                <div className="teach-hints">
                  {['food', 'water', 'come'].map((w) => (
                    <button key={w} className="chip" onClick={() => act(() => g.teach(selected.id, w, w === 'food' ? 'food' : w === 'water' ? 'water' : 'come'))}>+ {w}</button>
                  ))}
                </div>
              </div>
              <button className="btn btn-ghost" onClick={() => setMenu('journal')}>📖 Life journal</button>
            </>
          )}
          {!selected.alive && (
            <p className="grave-note">Resting in the valley. Their little life is remembered.</p>
          )}
        </aside>
      )}

      {/* Start overlay */}
      {!started && (
        <div className="overlay">
          <div className="card">
            <h1 className="logo-big">Luma Valley</h1>
            <p className="tagline">Tiny creatures with real brains. Raise them, teach them, love them.</p>
            <button className="btn btn-big" onClick={() => startNew()}>🌱 New Valley</button>
            {hasSave && (
              <button className="btn btn-big btn-ghost" onClick={() => void idbLoad(AUTOSAVE_KEY).then((d) => d && loadGame(d))}>
                ⏱ Resume valley
              </button>
            )}
            <p className="hint">Tap a creature to care for it · drag to look around · gentle mode in ☰</p>
          </div>
        </div>
      )}

      {/* Menu modal */}
      {menu === 'menu' && (
        <div className="overlay" onClick={() => setMenu('closed')}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            <h2>Menu</h2>
            <label className="row">
              <span>Gentle mode (no permadeath from hunger)</span>
              <input type="checkbox" checked={gentle} onChange={(e) => { setGentle(e.target.checked); if (g) g.settings.gentle = e.target.checked; setTick((t) => t + 1) }} />
            </label>
            <label className="row">
              <span>Sound</span>
              <input type="checkbox" checked={soundOn} onChange={(e) => { setSoundOn(e.target.checked); if (soundRef.current) soundRef.current.enabled = e.target.checked }} />
            </label>
            <label className="row">
              <span>Follow selected creature</span>
              <input type="checkbox" checked={follow} onChange={(e) => { setFollow(e.target.checked); viewRef.current?.setFollow(e.target.checked) }} />
            </label>
            <label className="row">
              <span>Show name labels</span>
              <input type="checkbox" checked={names} onChange={(e) => { setNames(e.target.checked); viewRef.current?.setShowNames(e.target.checked) }} />
            </label>
            <h3>Saves</h3>
            <div className="save-rows">
              {SLOTS.map((slot, i) => (
                <div className="save-row" key={slot}>
                  <button className="btn btn-small" onClick={() => game && void idbSave(slot, game.save()).then(() => setToast(`saved to slot ${i + 1}`))}>Save {i + 1}</button>
                  <button className="btn btn-small btn-ghost" onClick={() => void idbLoad(slot).then((d) => d && loadGame(d))}>Load {i + 1}</button>
                </div>
              ))}
              <div className="save-row">
                <button className="btn btn-small" onClick={() => game && void exportSave(game.save())}>⬇ Export</button>
                <label className="btn btn-small btn-ghost">
                  ⬆ Import
                  <input
                    type="file"
                    accept=".json,application/json"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      const reader = new FileReader()
                      reader.onload = () => {
                        try {
                          loadGame(JSON.parse(String(reader.result)))
                        } catch {
                          setToast('Could not read that save file')
                        }
                      }
                      reader.readAsText(f)
                    }}
                  />
                </label>
              </div>
            </div>
            <button className="btn btn-ghost" onClick={() => setMenu('closed')}>Close</button>
          </div>
        </div>
      )}

      {/* Journal modal */}
      {menu === 'journal' && selected && (
        <div className="overlay" onClick={() => setMenu('closed')}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            <h2>{selected.name}'s life</h2>
            <ul className="journal">
              {[...selected.journal].reverse().map((j, i) => (
                <li key={i}>
                  <span className="j-tick">age {Math.floor(j.tick / 100)}</span> {j.text}
                </li>
              ))}
              {selected.journal.length === 0 && <li>No memories yet.</li>}
            </ul>
            <button className="btn btn-ghost" onClick={() => setMenu('closed')}>Close</button>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  )
}
