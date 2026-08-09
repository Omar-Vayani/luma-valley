import { useEffect, useRef, useState } from 'react'
import { Game } from './sim/game'
import { GameView } from './render/gameview'
import type { InteractEvent } from './render/gameview'
import { SoundEngine } from './audio/sfx'
import { idbLoad, idbSave, exportSave } from './game/storage'
import { activeQuest, questProgress } from './sim/quests'
import { toggleTorch as toggleTorchFn } from './sim/player'
import { ITEMS } from './sim/items'
import { trustLabel, triggerName } from './sim/trauma'
import type { SaveData } from './sim/save'
import { CITY_WORLD_SIZE } from './sim/city-layout'

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

const trustColor = (t: number): string => `hsl(${Math.round(Math.min(1, Math.max(0, t)) * 120)} 70% 45%)`

const STORY_LINES: Record<string, string> = {
  q1_feed: 'Warden: "Start at the Old Market. Every place in this city has a purpose."',
  q2_teach: 'Warden: "Meet a citizen. Their choices come from needs, feelings, memory, and relationships."',
  q3_berry: 'Warden: "Share market bread with a citizen and watch how trust changes."',
  q4_torch: 'Warden: "Lantern Park offers rest, water, and company without a hidden cost."',
  q5_light: 'Warden: "The Crooked Cup sells relief. Ale and cigarettes also damage judgment and create dependence."',
  q6_adult: 'Warden: "The apothecary sells medicine. Citizens can learn to seek it when hurt."',
  q7_shadow: 'Warden: "The back alley trades dream-dust. Citizens may learn to seek or avoid it from experience."',
  q8_shrine: 'Warden: "The Watch Yard is a refuge. Frightened citizens remember safe places too."',
  q9_birth: 'Warden: "Now observe. Citizens may share, argue, fight, reconcile, and raise a new generation."',
  all: 'Omar: "You did it, Guardian. The old city lives again."',
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Game | null>(null)
  const viewRef = useRef<GameView | null>(null)
  const soundRef = useRef<SoundEngine | null>(null)

  const [started, setStarted] = useState(false)
  const [locked, setLocked] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  const [menu, setMenu] = useState<MenuState>('closed')
  const [gentle, setGentle] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [names, setNames] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [word, setWord] = useState('')
  const [hasSave, setHasSave] = useState(false)
  const [questText, setQuestText] = useState('')
  const [storyDone, setStoryDone] = useState(false)
  const [exploring, setExploring] = useState(false)
  const [hasLooked, setHasLooked] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const isTouch = typeof window !== 'undefined' && (
    navigator.maxTouchPoints > 0 ||
    'ontouchstart' in window ||
    window.matchMedia?.('(pointer: coarse)').matches
  )

  const inGame = locked || isTouch || exploring

  useEffect(() => {
    void idbLoad(AUTOSAVE_KEY).then((data) => setHasSave(!!data))
  }, [])

  const startNew = (seed?: number): void => {
    const s = seed ?? Math.floor(Math.random() * 1e9)
    const g = new Game(s, CITY_WORLD_SIZE, { gentle })
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
      onSelect: (id) => { setSelectedId(id); setDetailsOpen(false) },
      onInteract: (ev) => handleInteract(ev),
      onLockChange: (l) => setLocked(l),
      onQuestHint: (t) => setToast(t),
    })
    viewRef.current = view
    // Keep the mobile playfield unobstructed until the player selects a Luma.
    setSelectedId(null)
    setHasLooked(false)
    setStarted(true)
    setTick((t) => t + 1)
  }

  const loadGame = (data: SaveData): void => {
    const g = new Game(data.seed, data.world.size, data.settings)
    g.load(data)
    setGentle(data.settings.gentle)
    bootGame(g)
  }

  // autosave
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

  // UI refresh loop
  useEffect(() => {
    if (!started) return
    const id = window.setInterval(() => setTick((t) => t + 1), 250)
    return () => window.clearInterval(id)
  }, [started])

  // Keep autonomous lives staged at the arrival square while the desktop
  // pointer-lock card is open. Mobile enters play immediately.
  useEffect(() => {
    viewRef.current?.setPaused(started && !inGame)
  }, [started, inGame])

  const game = gameRef.current
  const selected = selectedId !== null ? game?.selectedCreature(selectedId) ?? null : null
  const alive = game?.creatures.filter((c) => c.alive).length ?? 0
  const q = game?.quests
  const quest = q ? activeQuest(q) : null
  const progress = quest && q ? questProgress(q, quest.id) : 0

  // quest text updates
  useEffect(() => {
    if (!quest) {
      if (q?.completed.includes('q9_birth')) setQuestText(STORY_LINES.all)
      else setQuestText('Free play — the old city is yours to explore.')
      return
    }
    setQuestText(`${quest.title} — ${progress}/${quest.goal}${quest.blurb ? ` · ${quest.blurb}` : ''}`)
    const line = STORY_LINES[quest.id]
    if (line && !storyDone) {
      setToast(line)
      setStoryDone(true)
    }
  }, [quest?.id, progress, tick, q])

  // death toast
  useEffect(() => {
    if (!game) return
    const dead = game.creatures.filter((c) => !c.alive && c.journal.some((j) => j.text.includes('passes away')))
    if (dead.length > 0) {
      const last = dead[dead.length - 1]
      if (last.journal[last.journal.length - 1]?.text.includes('passes away')) {
        setToast(`${last.name} has passed away… the city mourns.`)
      }
    }
  }, [tick, game])

  const handleInteract = (ev: InteractEvent): void => {
    const g = gameRef.current
    if (!g) return
    if (ev.kind === 'shrine') {
      g.emit('lightShrine', 1)
      viewRef.current?.lightShrine()
      soundRef.current?.voice(0.8, 'happy')
      setToast('You light the old watch fire. The city glows. ✨')
    } else if (ev.kind === 'pickup' && ev.itemId) {
      const item = ITEMS[ev.itemId as keyof typeof ITEMS]
      setToast(`+1 ${item?.name ?? ev.itemId}`)
      soundRef.current?.click()
    } else if (ev.kind === 'creature' && ev.creatureId != null) {
      const c = g.selectedCreature(ev.creatureId)
      g.emit('meetCitizen', 1)
      if (c?.alive) setToast(`${c.name} is ${MOOD(c.chem.pleasure, c.chem.fear, c.chem.health)}. Care actions are now open.`)
    } else if (ev.kind === 'place' && ev.placeId) {
      const result = g.visitPlace(ev.placeId)
      if (ev.placeId === 'market') g.emit('visitMarket', 1)
      else if (ev.placeId === 'park') g.emit('visitPark', 1)
      else if (ev.placeId === 'tavern') g.emit('visitTavern', 1)
      else if (ev.placeId === 'apothecary') g.emit('visitApothecary', 1)
      else if (ev.placeId === 'back-alley') g.emit('visitAlley', 1)
      else if (ev.placeId === 'watch') g.emit('visitWatch', 1)
      setToast(result.msg)
      soundRef.current?.click()
    }
    setTick((t) => t + 1)
  }


  const act = (fn: () => boolean | void, snd?: () => void): void => {
    fn()
    snd?.()
    setTick((t) => t + 1)
  }

  const feedSelected = (): void => {
    if (!game || !selected) return
    const result = game.giveItem(selected.id, 'bread')
    setToast(result.msg)
    if (result.ok) soundRef.current?.munch()
    setTick((t) => t + 1)
  }

  const interact = (): void => {
    viewRef.current?.interact()
  }

  const dayLabel =
    game && game.world.state.dayTime > 0.75 ? '🌙 night'
    : game && game.world.state.dayTime > 0.35 ? '🌞 day'
      : '🌅 dawn'

  const inventory = game?.player.inventory
  const ownedItems = game ? Object.values(ITEMS).filter((item) => (game.player.inventory.items[item.id] ?? 0) > 0) : []

  const itemCounts =
    inventory?.items
      ? (Object.keys(ITEMS) as (keyof typeof ITEMS)[])
          .filter((id) => (inventory.items[id] ?? 0) > 0)
          .map((id) => `${ITEMS[id].emoji}${inventory.items[id]}`)
          .join(' ')
      : ''
  const selectedNeeds = selected ? [
    { label: 'hunger', value: selected.chem.hunger, color: '#e8876a' },
    { label: 'thirst', value: selected.chem.thirst, color: '#64aeca' },
    { label: 'tired', value: selected.chem.fatigue, color: '#9f91c7' },
    { label: 'bored', value: selected.chem.boredom, color: '#d9a942' },
    { label: 'lonely', value: selected.chem.loneliness, color: '#cf82a8' },
  ].sort((a, b) => b.value - a.value) : []
  const interactionHint = inGame ? viewRef.current?.interactionHint() ?? null : null
  const interactionFocus = inGame ? viewRef.current?.currentFocus() ?? null : null
  const urban = selected ? (selected as typeof selected & { urban?: {
    emotions?: Partial<Record<'joy' | 'sadness' | 'anger' | 'fear' | 'empathy' | 'intoxication', number>>
    currentGoal?: string | null
    knownPlaces?: Record<string, unknown>
    carriedItem?: string | null
    judgment?: number
  } }).urban : undefined

  return (
    <div className="app">
      <div className="mount" ref={mountRef} />

      {/* FPV intro overlay */}
      {started && !inGame && (
        <div className="fpv-hint">
          <p><strong>Click to enter the old city</strong></p>
          <p className="hint">{isTouch ? 'Drag to look · joystick to walk · tap to interact' : 'WASD to walk · move mouse to look · arrows/Q/E also look · Space to jump'}</p>
          <button className="btn" onClick={() => {
            if (isTouch) {
              setExploring(true)
            } else {
              viewRef.current?.fps.lock()
              // fallback: if pointer lock isn't granted (headless/permission), still enter exploring mode
              window.setTimeout(() => {
                if (!viewRef.current?.fps.isLocked) setExploring(true)
              }, 400)
            }
          }}>▶ {isTouch ? 'Start exploring' : 'Enter the City'}</button>
        </div>
      )}

      <header className="topbar">
        <h1 className="logo">Luma · Old City</h1>
        <div className="topbar-right">
          <span className="pill">🕊 {alive}</span>
          <span className="pill">{dayLabel}</span>
          <span className="pill">🧺 {itemCounts || 'empty'} · 🔥 {inventory?.torch ?? 0}</span>
          <button className="icon-btn" onClick={() => setMenu('menu')} aria-label="Menu">☰</button>
        </div>
      </header>

      {/* Quest tracker */}
      {started && quest && (
        <div className="quest-tracker">
          <span className="quest-copy"><strong>{quest.title}</strong><small>{quest.blurb}</small></span>
          <span className="quest-progress">{progress}/{quest.goal}</span>
        </div>
      )}
      {started && !quest && <div className="quest-tracker quest-done">✦ {questText}</div>}

      {/* Crosshair — always visible so the player can see where they're looking */}
      {inGame && <div className={`crosshair ${interactionFocus ? `has-focus focus-${interactionFocus.kind}` : ''}`} />}

      {/* Full-screen LOOK SURFACE (touch): same synthetic events as the joystick.
          Drag anywhere to move the world under your finger; tap to interact. */}
      {isTouch && inGame && (
        <LookSurface
          onLook={(dx, dy) => {
            // Touch uses direct manipulation: dragging right pans the world right.
            // Desktop input still routes directly to FPSControls unchanged.
            viewRef.current?.fps.applyLook(-dx * 1.6, dy * 1.6)
            if (!hasLooked) setHasLooked(true)
          }}
          onTap={interact}
        />
      )}

      {isTouch && inGame && !hasLooked && (
        <div className="control-tip">Drag the street to look around<br /><span>The city follows your finger</span></div>
      )}

      {interactionHint && <div className="interaction-prompt focus-chip">✦ {interactionHint} · {Math.round(interactionFocus?.distance ?? 0)}m · {isTouch ? 'tap or use hand' : 'click or F'}</div>}

      {/* City survival quick actions */}
      {started && inGame && !toast && (
        <div className="quickbar">
          <button
            className={`btn btn-small ${game?.player.torchLit ? 'btn-active' : ''}`}
            onClick={() => act(() => { if (game) toggleTorchFn(game.player) })}
          >
            🔥 {game?.player.torchLit ? 'Torch on' : 'Torch off'}
          </button>
          <button className="btn btn-small" onClick={() => setToast('Districts: Market = food · Park = recovery · Tavern = substances · Apothecary = medicine · Alley = danger · Watch = safety')}>🗺 City guide</button>
        </div>
      )}

      {/* Selected creature panel */}
      {started && selected && (
        <aside className={`panel action-palette ${detailsOpen ? 'panel-expanded' : 'panel-compact'}`}>
          <div className="panel-head">
            <h2>{selected.name}</h2>
            <span className={`mood mood-${MOOD(selected.chem.pleasure, selected.chem.fear, selected.chem.health)}`}>
              {MOOD(selected.chem.pleasure, selected.chem.fear, selected.chem.health)}
            </span>
            <button className="panel-close" aria-label="Close creature care" onClick={() => { setSelectedId(null); viewRef.current?.select(null) }}>×</button>
          </div>
          <p className="age">age {Math.floor(selected.age / 100)} · {selected.alive ? selected.action : 'deceased'}</p>
          {selected.alive && <div className="drive-chips">
            {selectedNeeds.slice(0, 3).map((need) => <span className="drive-chip" key={need.label}>{need.label} {Math.round(need.value * 100)}</span>)}
            {urban?.currentGoal && <span className="drive-chip">goal {urban.currentGoal}</span>}
          </div>}
          {selected.alive && <button className="details-toggle" onClick={() => setDetailsOpen((open) => !open)}>{detailsOpen ? 'Hide mind & memories' : 'Mind, memories & teaching'}</button>}
          {selected.alive && (
            <>
              <p className="needs-label">Needs · most urgent first</p>
              {selectedNeeds.map((need) => <Bar key={need.label} {...need} />)}
              <Bar label="health" value={selected.chem.health} color="#7fc27a" />
              {urban && (
                <section className="city-mind" aria-label="City cognition">
                  <span className="psyche-sub">city cognition</span>
                  <div className="emotion-row">
                    {Object.entries(urban.emotions ?? {}).map(([name, value]) => (
                      <span className="emotion-chip" key={name}>{name} {Math.round((value ?? 0) * 100)}</span>
                    ))}
                  </div>
                  <p className="city-facts">
                    goal <strong>{urban.currentGoal ?? 'none'}</strong> · judgment <strong>{Math.round((urban.judgment ?? 1) * 100)}</strong> · knows <strong>{Object.keys(urban.knownPlaces ?? {}).length}</strong> places · carrying <strong>{urban.carriedItem ?? 'nothing'}</strong>
                  </p>
                </section>
              )}
              <div className="trust">
                <span className={`trust-tag trust-${trustLabel(selected.psyche.trust)}`}>❤ {trustLabel(selected.psyche.trust)}</span>
                <div className="bar-track trust-track">
                  <div className="bar-fill" style={{ width: `${Math.round(Math.min(1, Math.max(0, selected.psyche.trust)) * 100)}%`, background: trustColor(selected.psyche.trust) }} />
                </div>
              </div>
              <div className="traumas">
                <span className="psyche-sub">traumas</span>
                {selected.psyche.memories.length > 0 ? (
                  <div className="trauma-list">
                    {selected.psyche.memories.map((m) => (
                      <span key={m.id} className="chip trauma-chip">😱 {triggerName(m.trigger)} · {Math.round(m.intensity * 100)}%</span>
                    ))}
                  </div>
                ) : (
                  <span className="trauma-empty">no lasting fears yet</span>
                )}
              </div>
              <div className="actions">
                <button className="btn" onClick={() => {
                  const result = game?.greet(selected.id)
                  if (result) setToast(result.msg)
                  soundRef.current?.voice(selected.traits.voicePitch, 'happy')
                  setTick((t) => t + 1)
                }}>👋 Greet</button>
                <button className="btn" onClick={feedSelected}>🍞 Share bread ({game?.player.inventory.items.bread ?? 0})</button>
                <button className="btn" onClick={() => act(() => game?.tickle(selected.id), () => soundRef.current?.voice(selected.traits.voicePitch, 'happy'))}>💛 Comfort / play</button>
                <button
                  className={`btn ${game?.carriedId === selected.id ? 'btn-active' : ''}`}
                  onClick={() => {
                    const next = game?.carriedId === selected.id ? null : selected.id
                    if (next === null && game) {
                      act(() => {
                        const r = game.dropCarried()
                        setToast(r.msg)
                      })
                    } else {
                      game?.setCarried(next ?? null)
                    }
                    viewRef.current?.select(next)
                    setTick((t) => t + 1)
                  }}
                >
                  {game?.carriedId === selected.id ? '🧺 Put down' : '🤲 Carry'}
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
                      act(() => game?.speak(selected.id, word.trim()))
                      setWord('')
                    }
                  }}
                />
                <button className="btn btn-small" onClick={() => { act(() => game?.speak(selected.id, word.trim() || 'come')); setWord('') }}>Speak</button>
                <div className="teach-hints">
                  {['food', 'water', 'come'].map((w) => (
                    <button key={w} className="chip" onClick={() => act(() => game?.teach(selected.id, w, w === 'food' ? 'food' : w === 'water' ? 'water' : 'come'))}>+ {w}</button>
                  ))}
                </div>
              </div>
              <div className="give">
                <span className="psyche-sub">give</span>
                <div className="give-list">
                  {ownedItems.map((item) => (
                    <button
                      key={item.id}
                      className="btn btn-small give-btn"
                      onClick={() => act(() => {
                        const r = game?.giveItem(selected.id, item.id)
                        if (r) setToast(r.msg)
                      }, () => soundRef.current?.munch())}
                    >
                      {item.emoji} {item.name} ({game?.player.inventory.items[item.id] ?? 0})
                    </button>
                  ))}
                  {ownedItems.length === 0 && <span className="trauma-empty">your pouch is empty — search the city</span>}
                </div>
              </div>
              <div className="psyche-actions">
                <button
                  className="btn btn-danger btn-small"
                  onClick={() => act(() => {
                    const r = game?.scareCreature(selected.id)
                    if (r) setToast(r.msg)
                  }, () => soundRef.current?.voice(selected.traits.voicePitch, 'sad'))}
                >
                  😱 Scare
                </button>
                <button className="btn btn-ghost" onClick={() => setMenu('journal')}>📖 Life journal</button>
              </div>
            </>
          )}
          {!selected.alive && <p className="grave-note">Resting in the old city. Their life is remembered.</p>}
        </aside>
      )}

      {/* Start overlay */}
      {!started && (
        <div className="overlay">
          <div className="card">
            <h1 className="logo-big">Luma · Old City</h1>
            <p className="tagline">Explore the city, meet its citizens, and observe the choices they make. Substances may offer short relief, but carry real health and dependence costs.</p>
            <button className="btn btn-big" onClick={() => startNew()}>🏮 Enter the City</button>
            {hasSave && (
              <button className="btn btn-big btn-ghost" onClick={() => void idbLoad(AUTOSAVE_KEY).then((d) => d && loadGame(d))}>
                ⏱ Resume city
              </button>
            )}
            <p className="hint">First-person. WASD walk, mouse look, click to meet citizens or inspect district signs.</p>
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
              <input type="checkbox" checked={gentle} onChange={(e) => { setGentle(e.target.checked); if (game) game.settings.gentle = e.target.checked; setTick((t) => t + 1) }} />
            </label>
            <label className="row">
              <span>Sound</span>
              <input type="checkbox" checked={soundOn} onChange={(e) => { setSoundOn(e.target.checked); if (soundRef.current) soundRef.current.enabled = e.target.checked }} />
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
                  <input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    const reader = new FileReader()
                    reader.onload = () => { try { loadGame(JSON.parse(String(reader.result))) } catch { setToast('Could not read that save file') } }
                    reader.readAsText(f)
                  }} />
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
                <li key={i}><span className="j-tick">age {Math.floor(j.tick / 100)}</span> {j.text}</li>
              ))}
              {selected.journal.length === 0 && <li>No memories yet.</li>}
            </ul>
            <button className="btn btn-ghost" onClick={() => setMenu('closed')}>Close</button>
          </div>
        </div>
      )}

      {/* Touch joystick */}
      {isTouch && inGame && (
        <Joystick
          onMove={(x, y) => {
            const fps = viewRef.current?.fps
            if (!fps) return
            // y: -1 (up/forward) .. 1 (down/back), x: -1 (left) .. 1 (right)
            const fwd = y < 0 ? -y : 0
            const back = y > 0 ? y : 0
            fps.setInput('KeyW', fwd > 0.3)
            fps.setInput('KeyS', back > 0.3)
            fps.setInput('KeyA', x < -0.3)
            fps.setInput('KeyD', x > 0.3)
          }}
        />
      )}

      {/* Touch look-stick REMOVED — the whole screen is the look surface now */}
      {/* One joystick (left thumb) for movement; drag anywhere else to look */}

      {/* Touch jump button */}
      {isTouch && inGame && (
        <button className="interact-btn" onPointerDown={(e) => { e.preventDefault(); interact() }} aria-label="Interact">
          🤲<span>{interactionFocus ? `${interactionFocus.kind === 'creature' ? 'Meet' : 'Visit'} ${interactionFocus.name}` : 'Walk closer'}</span>
        </button>
      )}

      {isTouch && inGame && (
        <button
          className="jump-btn"
          onPointerDown={(e) => {
            e.preventDefault()
            viewRef.current?.fps.jump()
          }}
          onTouchStart={(e) => {
            e.preventDefault()
            viewRef.current?.fps.jump()
          }}
        >
          ⬆
        </button>
      )}

      {toast && <div className="toast" onClick={() => setToast(null)}>{toast}</div>}
    </div>
  )
}

/** Full-screen LOOK SURFACE — one isolated gesture owner for mobile look.
 * Pointer Events are preferred; Touch Events are used only as an old-browser fallback. */
function LookSurface({ onLook, onTap }: { onLook: (dx: number, dy: number) => void; onTap: () => void }) {
  const activePointer = useRef<number | null>(null)
  const activeTouch = useRef<number | null>(null)
  const last = useRef({ x: 0, y: 0 })
  const downAt = useRef({ x: 0, y: 0 })
  const moved = useRef(false)
  const feedbackRef = useRef<HTMLDivElement>(null)
  const supportsPointer = typeof window !== 'undefined' && 'PointerEvent' in window

  const showFeedback = (x: number, y: number): void => {
    if (!feedbackRef.current) return
    feedbackRef.current.style.transform = `translate(${x}px, ${y}px)`
    feedbackRef.current.dataset.active = 'true'
  }
  const start = (x: number, y: number): void => {
    last.current = { x, y }
    downAt.current = { x, y }
    moved.current = false
    showFeedback(x, y)
  }
  const move = (x: number, y: number): void => {
    const dx = x - last.current.x
    const dy = y - last.current.y
    last.current = { x, y }
    showFeedback(x, y)
    if (Math.abs(x - downAt.current.x) + Math.abs(y - downAt.current.y) > 10) moved.current = true
    if (dx !== 0 || dy !== 0) onLook(dx, dy)
  }
  const end = (tap: boolean): void => {
    activePointer.current = null
    activeTouch.current = null
    if (feedbackRef.current) feedbackRef.current.dataset.active = 'false'
    if (tap && !moved.current) onTap()
  }

  return (
    <div
      className="look-surface"
      aria-label="Drag to look around"
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' || activePointer.current !== null) return
        activePointer.current = e.pointerId
        e.currentTarget.setPointerCapture(e.pointerId)
        start(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== activePointer.current) return
        move(e.clientX, e.clientY)
      }}
      onPointerUp={(e) => {
        if (e.pointerId === activePointer.current) end(true)
      }}
      onPointerCancel={(e) => {
        if (e.pointerId === activePointer.current) end(false)
      }}
      onTouchStart={(e) => {
        if (supportsPointer || activeTouch.current !== null) return
        const touch = e.changedTouches[0]
        if (!touch) return
        activeTouch.current = touch.identifier
        start(touch.clientX, touch.clientY)
      }}
      onTouchMove={(e) => {
        if (supportsPointer || activeTouch.current === null) return
        const touch = Array.from(e.changedTouches).find((item) => item.identifier === activeTouch.current)
        if (touch) move(touch.clientX, touch.clientY)
      }}
      onTouchEnd={(e) => {
        if (!supportsPointer && Array.from(e.changedTouches).some((item) => item.identifier === activeTouch.current)) end(true)
      }}
      onTouchCancel={() => end(false)}
    >
      <div ref={feedbackRef} className="look-feedback" data-active="false" />
    </div>
  )
}

function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const baseRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef<HTMLDivElement>(null)
  const active = useRef(false)
  const activeTouch = useRef<number | null>(null)
  const origin = useRef({ x: 0, y: 0 })

  const setStick = (x: number, y: number): void => {
    if (stickRef.current) stickRef.current.style.transform = `translate(${x * 28}px, ${y * 28}px)`
    onMove(x, y)
  }

  const move = (clientX: number, clientY: number): void => {
    const rect = baseRef.current!.getBoundingClientRect()
    let dx = clientX - rect.left - rect.width / 2 - origin.current.x
    let dy = clientY - rect.top - rect.height / 2 - origin.current.y
    const len = Math.hypot(dx, dy)
    const max = rect.width / 2 - 4
    if (len > max) {
      dx = (dx / len) * max
      dy = (dy / len) * max
    }
    setStick(dx / max, dy / max)
  }

  const release = (): void => {
    active.current = false
    activeTouch.current = null
    setStick(0, 0)
  }

  return (
    <div
      ref={baseRef}
      className="joystick"
      onPointerDown={(e) => {
        active.current = true
        const rect = baseRef.current!.getBoundingClientRect()
        origin.current = { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!active.current) return
        move(e.clientX, e.clientY)
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onTouchStart={(e) => {
        if (active.current) return
        const touch = e.changedTouches[0]
        if (!touch) return
        e.preventDefault()
        const rect = baseRef.current!.getBoundingClientRect()
        activeTouch.current = touch.identifier
        origin.current = { x: touch.clientX - rect.left - rect.width / 2, y: touch.clientY - rect.top - rect.height / 2 }
      }}
      onTouchMove={(e) => {
        if (active.current || activeTouch.current === null) return
        const touch = Array.from(e.changedTouches).find((item) => item.identifier === activeTouch.current)
        if (!touch) return
        e.preventDefault()
        move(touch.clientX, touch.clientY)
      }}
      onTouchEnd={release}
      onTouchCancel={release}
    >
      <div ref={stickRef} className="joystick-stick" />
    </div>
  )
}
