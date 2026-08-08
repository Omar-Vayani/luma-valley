import { useEffect, useRef, useState } from 'react'
import { Game } from './sim/game'
import { GameView } from './render/gameview'
import type { InteractEvent } from './render/gameview'
import { SoundEngine } from './audio/sfx'
import { idbLoad, idbSave, exportSave } from './game/storage'
import { activeQuest, questProgress } from './sim/quests'
import { pickBerry as pickBerryFn, collectWood as collectWoodFn, craftTorch as craftTorchFn, toggleTorch as toggleTorchFn } from './sim/player'
import { ITEMS } from './sim/items'
import { trustLabel, triggerName } from './sim/trauma'
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

const trustColor = (t: number): string => `hsl(${Math.round(Math.min(1, Math.max(0, t)) * 120)} 70% 45%)`

const STORY_LINES: Record<string, string> = {
  q1_feed: 'Omar: "Guardian, the Luma are hungry. Walk to one and feed it — click it to open its care panel, then Feed."',
  q2_teach: 'Omar: "They learn. Teach this one the word come, and it will follow your voice."',
  q3_berry: 'Omar: "The valley provides. Pick 3 berries from the bushes to fill your pouch."',
  q4_torch: 'Omar: "Night is falling soon, and with it, the Shadow. Craft a torch from 2 wood."',
  q5_light: 'Omar: "Light your torch. The Shadow fears the flame."',
  q6_adult: 'Omar: "Care for them until one reaches adulthood. They grow up fast here."',
  q7_shadow: 'Omar: "A Shadow Beast walks the night. Stand your ground with the torch — drive it back."',
  q8_shrine: 'Omar: "Deep in the cave is the Old Shrine. Light it, and the valley will remember you."',
  q9_birth: 'Omar: "Now let new life come. Two adults will breed, and the valley grows again."',
  all: 'Omar: "You did it, Guardian. Luma Valley shines again. Thank you for giving them a home."',
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
    const g = new Game(s, 60, { gentle })
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
      onInteract: (ev) => handleInteract(ev),
      onLockChange: (l) => setLocked(l),
      onQuestHint: (t) => setToast(t),
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
      else setQuestText('Free play — the valley is yours.')
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
        setToast(`${last.name} has passed away… the valley mourns.`)
      }
    }
  }, [tick, game])

  const handleInteract = (ev: InteractEvent): void => {
    const g = gameRef.current
    if (!g) return
    if (ev.kind === 'wood') {
      if (collectWoodFn(g.player)) {
        setToast('+1 wood')
        soundRef.current?.click()
      }
    } else if (ev.kind === 'shrine') {
      g.emit('lightShrine', 1)
      viewRef.current?.lightShrine()
      soundRef.current?.voice(0.8, 'happy')
      setToast('You light the Old Shrine. The valley glows. ✨')
    } else if (ev.kind === 'pickup' && ev.itemId) {
      const item = ITEMS[ev.itemId as keyof typeof ITEMS]
      setToast(`+1 ${item?.name ?? ev.itemId}`)
      soundRef.current?.click()
    } else if (ev.kind === 'creature' && ev.creatureId != null) {
      const c = g.selectedCreature(ev.creatureId)
      if (c?.alive) {
        // feed if we have berries and they're hungry
        if (g.player.inventory.berries > 0 && c.chem.hunger > 0.4) {
          g.feed(ev.creatureId)
          g.player.inventory.berries--
          soundRef.current?.munch()
        } else if (c.chem.hunger <= 0.4) {
          setToast(`${c.name} isn't hungry right now.`)
        } else {
          setToast('No berries left — pick some from a bush!')
        }
      }
    }
    setTick((t) => t + 1)
  }

  const pickBerry = (): void => {
    const g = gameRef.current
    if (!g) return
    if (pickBerryFn(g.player)) {
      g.emit('pickBerry', 1)
      soundRef.current?.munch()
      setToast('+1 berry')
    }
  }

  const act = (fn: () => boolean | void, snd?: () => void): void => {
    fn()
    snd?.()
    setTick((t) => t + 1)
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

  return (
    <div className="app">
      <div className="mount" ref={mountRef} />

      {/* FPV intro overlay */}
      {started && !inGame && (
        <div className="fpv-hint">
          <p><strong>Click to enter the valley</strong></p>
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
          }}>▶ {isTouch ? 'Start exploring' : 'Enter the Valley'}</button>
        </div>
      )}

      <header className="topbar">
        <h1 className="logo">Luma Valley</h1>
        <div className="topbar-right">
          <span className="pill">🕊 {alive}</span>
          <span className="pill">{dayLabel}</span>
          <span className="pill">🧺 {inventory?.berries ?? 0} 🪵 {inventory?.wood ?? 0} 🔥 {inventory?.torch ?? 0}{itemCounts ? ` ${itemCounts}` : ''}</span>
          <button className="icon-btn" onClick={() => setMenu('menu')} aria-label="Menu">☰</button>
        </div>
      </header>

      {/* Quest tracker */}
      {started && quest && (
        <div className="quest-tracker">
          <span className="quest-title">{quest.title}</span>
          <span className="quest-progress">{progress}/{quest.goal}</span>
        </div>
      )}
      {started && !quest && <div className="quest-tracker quest-done">✦ {questText}</div>}

      {/* Crosshair — always visible so the player can see where they're looking */}
      {inGame && <div className="crosshair" />}

      {/* Full-screen LOOK SURFACE (touch): same synthetic events as the joystick.
          Drag anywhere to look (non-inverted); tap to interact. */}
      {isTouch && inGame && (
        <LookSurface
          onLook={(dx, dy) => {
            viewRef.current?.fps.applyLook(dx, dy)
          }}
          onTap={() => {
            viewRef.current?.interact()
          }}
        />
      )}

      {/* Torch + pickup quick actions */}
      {started && inGame && (
        <div className="quickbar">
          <button
            className={`btn btn-small ${game?.player.torchLit ? 'btn-active' : ''}`}
            onClick={() => { act(() => { if (game) toggleTorchFn(game.player) }); if (game?.player.torchLit) game?.emit('lightTorch', 1) }}
          >
            🔥 {game?.player.torchLit ? 'Torch on' : 'Torch off'}
          </button>
          <button className="btn btn-small" onClick={() => { act(() => { if (game) { if (craftTorchFn(game.player)) { game.emit('craftTorch', 1); setToast('Crafted a torch!') } else setToast('Need 2 wood to craft a torch') } }) }}>🪵 Craft torch</button>
          <button className="btn btn-small" onClick={() => { act(() => pickBerry()) }}>🫐 Pick berry</button>
        </div>
      )}

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
                <button className="btn" onClick={() => act(() => game?.feed(selected.id), () => soundRef.current?.munch())}>🍓 Feed</button>
                <button className="btn" onClick={() => act(() => game?.tickle(selected.id), () => soundRef.current?.voice(selected.traits.voicePitch, 'happy'))}>✨ Tickle</button>
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
                  {ownedItems.length === 0 && <span className="trauma-empty">your pouch is empty — search the valley</span>}
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
          {!selected.alive && <p className="grave-note">Resting in the valley. Their little life is remembered.</p>}
        </aside>
      )}

      {/* Start overlay */}
      {!started && (
        <div className="overlay">
          <div className="card">
            <h1 className="logo-big">Luma Valley</h1>
            <p className="tagline">Tiny creatures with real brains. Raise them, teach them, protect them from the Shadow.</p>
            <button className="btn btn-big" onClick={() => startNew()}>🌱 New Valley</button>
            {hasSave && (
              <button className="btn btn-big btn-ghost" onClick={() => void idbLoad(AUTOSAVE_KEY).then((d) => d && loadGame(d))}>
                ⏱ Resume valley
              </button>
            )}
            <p className="hint">First-person. WASD walk, mouse look, click to interact. Your mentor awaits at the den.</p>
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

/** Full-screen LOOK SURFACE — drag anywhere to look (non-inverted), tap to interact.
 *  Uses the same React synthetic touch/pointer events as the working joystick. */
function LookSurface({ onLook, onTap }: { onLook: (dx: number, dy: number) => void; onTap: () => void }) {
  const last = useRef<{ x: number; y: number } | null>(null)
  const downAt = useRef({ x: 0, y: 0 })
  const moved = useRef(false)

  const start = (x: number, y: number): void => {
    last.current = { x, y }
    downAt.current = { x, y }
    moved.current = false
  }
  const move = (x: number, y: number): void => {
    if (!last.current) return
    const dx = x - last.current.x
    const dy = y - last.current.y
    last.current = { x, y }
    if (Math.abs(x - downAt.current.x) + Math.abs(y - downAt.current.y) > 14) moved.current = true
    if (dx !== 0 || dy !== 0) onLook(dx, dy)
  }
  const end = (): void => {
    last.current = null
    if (!moved.current) onTap()
  }

  return (
    <div
      className="look-surface"
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse') return // desktop uses mouse free-look
        e.preventDefault()
        start(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => {
        if (!last.current) return
        e.preventDefault()
        move(e.clientX, e.clientY)
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onTouchStart={(e) => {
        const t = e.changedTouches[0]
        if (!t) return
        e.preventDefault()
        start(t.clientX, t.clientY)
      }}
      onTouchMove={(e) => {
        if (!last.current) return
        const t = Array.from(e.changedTouches)[0]
        if (!t) return
        e.preventDefault()
        move(t.clientX, t.clientY)
      }}
      onTouchEnd={end}
      onTouchCancel={end}
    />
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
