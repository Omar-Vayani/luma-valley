import { useCallback, useEffect, useRef, useState } from 'react'
import { Game, type OverseerTool, type SocietyEventView } from './sim/game'
import { GameView } from './render/gameview'
import type { InteractEvent } from './render/gameview'
import { SoundEngine } from './audio/sfx'
import { idbLoad, idbSave, exportSave } from './game/storage'
import { toggleTorch as toggleTorchFn } from './sim/player'
import { trustLabel, triggerName } from './sim/trauma'
import type { SaveData } from './sim/save'
import { CITY_WORLD_SIZE } from './sim/city-layout'
import {
  TOUCH_DEADZONE,
  applyTouchLook,
  touchMoveFromOrigin,
  touchZoneAt,
  type TouchControlMode,
  type TouchMoveVec,
} from './render/fps'

import './index.css'

const AUTOSAVE_KEY = 'autosave'
const SLOTS = ['slot1', 'slot2', 'slot3']
const CONTROL_MODE_KEY = 'luma:control-mode'
const MESSAGE_MS = 5000

type MenuState = 'closed' | 'menu' | 'journal'
type HudTab = 'people' | 'society' | 'tools'
type MoodKey = 'happy' | 'scared' | 'unwell' | 'calm'

const HUD_TABS: ReadonlyArray<{ id: HudTab; label: string }> = [
  { id: 'people', label: '👥 People' },
  { id: 'society', label: '🏘 Society' },
  { id: 'tools', label: '🛠 Tools' },
]

interface HudMessage {
  id: number
  text: string
  kind: 'info' | 'warn'
}

/** Observer tool descriptor — each maps 1:1 to Game.useOverseerTool. */
interface ToolAction {
  id: OverseerTool
  label: string
  emoji: string
  kind: 'beneficial' | 'harmful'
  note: string
}

const MOOD = (pleasure: number, fear: number, health: number): MoodKey => {
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

/** Map one society event to a readable observer line (Society tab). */
function describeSocietyEvent(ev: SocietyEventView): string {
  const act = ev.actor
  const tgt = ev.target ? ` ${ev.target}` : ''
  switch (ev.kind) {
    case 'trade':
      return ev.direction === 'buy'
        ? `${act} buys ${ev.item ?? 'goods'}${tgt}${ev.money ? ` (−${Math.abs(ev.money)})` : ''}`
        : `${act} sells ${ev.item ?? 'goods'}${tgt}${ev.money ? ` (+${ev.money})` : ''}`
    case 'share': return `${act} shares ${ev.item ?? 'goods'} with ${ev.target ?? 'another citizen'}`
    case 'cooperate': return `${act} cooperates with ${ev.target ?? 'another citizen'}`
    case 'fight': return `${act} fights ${ev.target ?? 'another citizen'}`
    case 'follow': return `${act} follows ${ev.target ?? 'another citizen'}`
    case 'flee': return `${act} flees ${ev.target ?? 'a threat'}`
    case 'hoard': return `${act} hoards goods`
    case 'work': return `${act} works the yard`
    case 'death': return `${act} has died`
    case 'kind': return `${act} is treated kindly by the observer — trust grows around them`
    case 'cruel': return `${act} is treated cruelly by the observer — witnesses remember`
    default: return `${act} ${ev.kind}${tgt}`
  }
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Game | null>(null)
  const viewRef = useRef<GameView | null>(null)
  const soundRef = useRef<SoundEngine | null>(null)
  const msgIdRef = useRef(0)
  const deathPushedRef = useRef<Set<number>>(new Set())

  const [started, setStarted] = useState(false)
  const [locked, setLocked] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  const [menu, setMenu] = useState<MenuState>('closed')
  const [gentle, setGentle] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [names, setNames] = useState(true)
  const [word, setWord] = useState('')
  const [hasSave, setHasSave] = useState(false)
  const [exploring, setExploring] = useState(false)
  const [hasLooked, setHasLooked] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [hudTab, setHudTab] = useState<HudTab | null>(null)
  const [messages, setMessages] = useState<HudMessage[]>([])
  const [controlMode, setControlMode] = useState<TouchControlMode>(() => {
    try {
      return localStorage.getItem(CONTROL_MODE_KEY) === 'classic' ? 'classic' : 'split'
    } catch {
      return 'split'
    }
  })
  const isTouch = typeof window !== 'undefined' && (
    navigator.maxTouchPoints > 0 ||
    'ontouchstart' in window ||
    window.matchMedia?.('(pointer: coarse)').matches
  )

  const inGame = locked || isTouch || exploring

  const pushMessage = useCallback((text: string, kind: 'info' | 'warn' = 'info'): void => {
    const id = ++msgIdRef.current
    setMessages((prev) => [...prev.slice(-2), { id, text, kind }])
    window.setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== id))
    }, MESSAGE_MS)
  }, [])

  const dismissMessage = useCallback((id: number): void => {
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }, [])

  const changeControlMode = (mode: TouchControlMode): void => {
    setControlMode(mode)
    try {
      localStorage.setItem(CONTROL_MODE_KEY, mode)
    } catch {
      /* noop */
    }
  }

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
      onSelect: (id) => { setSelectedId(id); setDetailsOpen(false); if (id !== null) setHudTab('people') },
      onInteract: (ev) => handleInteract(ev),
      onLockChange: (l) => setLocked(l),
      onQuestHint: (t) => pushMessage(t),
    })
    viewRef.current = view
    // Keep the mobile playfield unobstructed until the player selects a Luma.
    setSelectedId(null)
    setHudTab(null)
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
  const profile = selectedId !== null ? game?.societyProfile(selectedId) ?? null : null
  const summary = game?.societySummary() ?? null
  const nameOf = (id: number): string => game?.creatures.find((c) => c.id === id)?.name ?? `citizen ${id}`

  // death messages (once per citizen)
  useEffect(() => {
    if (!game) return
    for (const c of game.creatures) {
      if (!c.alive && c.journal.some((j) => j.text.includes('passes away')) && !deathPushedRef.current.has(c.id)) {
        deathPushedRef.current.add(c.id)
        pushMessage(`${c.name} has passed away… the city mourns.`, 'warn')
      }
    }
  }, [tick, game, pushMessage])

  const handleInteract = (ev: InteractEvent): void => {
    const g = gameRef.current
    if (!g) return
    if (ev.kind === 'shrine') {
      g.emit('lightShrine', 1)
      viewRef.current?.lightShrine()
      soundRef.current?.voice(0.8, 'happy')
      pushMessage('You light the old watch fire. The city glows. ✨')
    } else if (ev.kind === 'creature' && ev.creatureId != null) {
      const c = g.selectedCreature(ev.creatureId)
      g.emit('meetCitizen', 1)
      if (c?.alive) pushMessage(`${c.name} is ${MOOD(c.chem.pleasure, c.chem.fear, c.chem.health)}. Care actions are now open.`)
    } else if (ev.kind === 'place' && ev.placeId) {
      const result = g.visitPlace(ev.placeId)
      if (ev.placeId === 'market') g.emit('visitMarket', 1)
      else if (ev.placeId === 'park') g.emit('visitPark', 1)
      else if (ev.placeId === 'tavern') g.emit('visitTavern', 1)
      else if (ev.placeId === 'apothecary') g.emit('visitApothecary', 1)
      else if (ev.placeId === 'back-alley') g.emit('visitAlley', 1)
      else if (ev.placeId === 'watch') g.emit('visitWatch', 1)
      pushMessage(result.msg)
      soundRef.current?.click()
    }
    setTick((t) => t + 1)
  }

  const act = (fn: () => boolean | void, snd?: () => void): void => {
    fn()
    snd?.()
    setTick((t) => t + 1)
  }

  /** Apply one of the six overseer tools to the focused citizen. */
  const useTool = (tool: OverseerTool): void => {
    if (!game || !selected) return
    const result = game.useOverseerTool(selected.id, tool)
    pushMessage(result.msg)
    if (result.ok) {
      if (tool === 'feed' || tool === 'heal' || tool === 'amuse') soundRef.current?.munch()
      else if (tool === 'comfort') soundRef.current?.voice(selected.traits.voicePitch, 'happy')
      else soundRef.current?.voice(selected.traits.voicePitch, 'sad')
    }
    setTick((t) => t + 1)
  }

  const interact = (): void => {
    viewRef.current?.interact()
  }

  const applyMoveVec = (vec: TouchMoveVec): void => {
    const fps = viewRef.current?.fps
    if (!fps) return
    fps.setInput('KeyW', vec.fwd > 0)
    fps.setInput('KeyS', vec.fwd < 0)
    fps.setInput('KeyA', vec.side < 0)
    fps.setInput('KeyD', vec.side > 0)
  }

  const handleTouchLook = (dx: number, dy: number): void => {
    const delta = applyTouchLook(dx, dy)
    viewRef.current?.fps.applyLook(delta.dx, delta.dy)
    if (!hasLooked) setHasLooked(true)
  }

  const joystickMove = (x: number, y: number): void => {
    const fps = viewRef.current?.fps
    if (!fps) return
    // y: -1 (up/forward) .. 1 (down/back), x: -1 (left) .. 1 (right)
    const fwd = y < 0 ? -y : 0
    const back = y > 0 ? y : 0
    fps.setInput('KeyW', fwd > TOUCH_DEADZONE)
    fps.setInput('KeyS', back > TOUCH_DEADZONE)
    fps.setInput('KeyA', x < -TOUCH_DEADZONE)
    fps.setInput('KeyD', x > TOUCH_DEADZONE)
  }

  const closeHud = (): void => setHudTab(null)

  const dayLabel =
    game && game.world.state.dayTime > 0.75 ? '🌙 night'
    : game && game.world.state.dayTime > 0.35 ? '🌞 day'
      : '🌅 dawn'

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

  const moodCounts: Record<string, number> = { happy: 0, scared: 0, unwell: 0, calm: 0 }
  for (const c of game?.creatures ?? []) {
    if (!c.alive) continue
    moodCounts[MOOD(c.chem.pleasure, c.chem.fear, c.chem.health)] += 1
  }

  const toolActions: ToolAction[] = [
    { id: 'feed', label: 'Feed', emoji: '🍞', kind: 'beneficial', note: 'eases hunger, builds trust' },
    { id: 'heal', label: 'Heal', emoji: '💊', kind: 'beneficial', note: 'restores health, eases pain' },
    { id: 'comfort', label: 'Comfort', emoji: '💛', kind: 'beneficial', note: 'calms fear and loneliness' },
    { id: 'amuse', label: 'Amuse', emoji: '🎵', kind: 'beneficial', note: 'lifts boredom and gloom' },
    { id: 'stick', label: 'Stick', emoji: '🪵', kind: 'harmful', note: 'pain and fear — witnesses remember' },
    { id: 'whip', label: 'Whip', emoji: '⚡', kind: 'harmful', note: 'severe harm; repeated lashing can kill' },
  ]

  const closePeople = (): void => {
    setHudTab(null)
    setSelectedId(null)
    viewRef.current?.select(null)
  }

  return (
    <div className="app" data-game data-control-mode={controlMode}>
      <div className="mount" ref={mountRef} />

      {/* FPV intro overlay */}
      {started && !inGame && (
        <div className="fpv-hint" data-fpv-hint>
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

      {/* Minimal top status strip */}
      <header className="topbar" data-status-strip>
        <h1 className="logo">Luma · Old City</h1>
        <div className="topbar-right">
          <span className="pill" data-status="population">🕊 {alive}</span>
          <span className="pill" data-status="day">{dayLabel}</span>
          <button className="icon-btn" onClick={() => setMenu('menu')} aria-label="Menu" data-hud="menu">☰</button>
        </div>
      </header>

      {/* Crosshair — the center camera prompt; notifications never cover it */}
      {inGame && <div className={`crosshair ${interactionFocus ? `has-focus focus-${interactionFocus.kind}` : ''}`} data-crosshair data-focus={interactionFocus?.kind ?? 'none'} />}

      {interactionHint && (
        <div className="interaction-prompt focus-chip" data-focus-chip>
          ✦ {interactionHint} · {Math.round(interactionFocus?.distance ?? 0)}m · {isTouch ? 'tap or use hand' : 'click or F'}
        </div>
      )}

      {/* Invisible split touch controls (default): left half moves from
          touch-origin displacement, right half looks. No joystick clutter. */}
      {isTouch && inGame && controlMode === 'split' && (
        <TouchSplitSurface onMoveVec={applyMoveVec} onLook={handleTouchLook} onTap={interact} />
      )}

      {/* Classic fallback: visible joystick + full-screen look surface */}
      {isTouch && inGame && controlMode === 'classic' && (
        <>
          <LookSurface marker="classic" onLook={handleTouchLook} onTap={interact} />
          <Joystick onMove={joystickMove} />
        </>
      )}

      {isTouch && inGame && !hasLooked && (
        <div className="control-tip" data-control-tip>Drag the street to look around<br /><span>The city follows your finger</span></div>
      )}

      {/* Touch action buttons — 48px targets, above the gesture surface */}
      {isTouch && inGame && (
        <button className="interact-btn" data-touch-btn="interact" onPointerDown={(e) => { e.preventDefault(); interact() }} aria-label="Interact">
          🤲<span>{interactionFocus ? `${interactionFocus.kind === 'creature' ? 'Meet' : 'Visit'} ${interactionFocus.name}` : 'Walk closer'}</span>
        </button>
      )}
      {isTouch && inGame && (
        <button
          className="jump-btn"
          data-touch-btn="jump"
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

      {/* Expandable HUD tabs */}
      {started && inGame && (
        <nav className="hud-tabs" data-hud-tabs aria-label="HUD panels">
          {HUD_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`hud-tab ${hudTab === tab.id ? 'hud-tab-active' : ''}`}
              data-hud-tab={tab.id}
              aria-pressed={hudTab === tab.id}
              onClick={() => setHudTab(hudTab === tab.id ? null : tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      )}

      {/* Expandable HUD panels */}
      {started && inGame && hudTab === 'people' && (
        <section className={`hud-panel ${detailsOpen ? 'hud-panel-expanded' : 'hud-panel-compact'}`} data-panel="people">
          {selected ? (
            <>
              <div className="panel-head">
                <h2>{selected.name}</h2>
                <span className={`mood mood-${MOOD(selected.chem.pleasure, selected.chem.fear, selected.chem.health)}`}>
                  {MOOD(selected.chem.pleasure, selected.chem.fear, selected.chem.health)}
                </span>
                <button className="panel-close" aria-label="Close citizen panel" onClick={closePeople}>×</button>
              </div>
              <p className="age">age {Math.floor(selected.age / 100)} · {selected.alive ? selected.action : 'deceased'}</p>
              {selected.alive && profile && (
                <div className="society-brief" data-society-brief>
                  <span className="brief-chip">🪙 {profile.wallet}</span>
                  <span className="brief-chip">trust <strong>{Math.round(profile.traits.trust * 100)}</strong></span>
                  <span className="brief-chip">attach <strong>{Math.round(profile.traits.attachment * 100)}</strong></span>
                  <span className="brief-chip">love <strong>{Math.round(profile.traits.love * 100)}</strong></span>
                  <span className="brief-chip">betrayal <strong>{Math.round(profile.traits.betrayal * 100)}</strong></span>
                  <span className="brief-chip">fear <strong>{Math.round(profile.traits.fear * 100)}</strong></span>
                  <span className="brief-chip">greed <strong>{Math.round(profile.traits.greed * 100)}</strong></span>
                </div>
              )}
              {selected.alive && <div className="drive-chips">
                {selectedNeeds.slice(0, 3).map((need) => <span className="drive-chip" key={need.label}>{need.label} {Math.round(need.value * 100)}</span>)}
                {urban?.currentGoal && <span className="drive-chip">goal {urban.currentGoal}</span>}
              </div>}
              {selected.alive && <button className="details-toggle" onClick={() => setDetailsOpen((open) => !open)}>{detailsOpen ? 'Hide mind, memories & relationships' : 'Mind, memories & relationships'}</button>}
              {selected.alive && (
                <>
                  {profile && profile.relationships.length > 0 && (
                    <section className="relationships" aria-label="Relationships">
                      <span className="psyche-sub">relationships</span>
                      <div className="rel-list">
                        {profile.relationships.map((r) => (
                          <div key={r.otherId} className="rel-row" data-rel={r.otherName}>
                            <span className="rel-name">{r.otherName}</span>
                            <span className="rel-facts">trust {Math.round(r.trust * 100)} · attach {Math.round(r.attachment * 100)} · love {Math.round(r.love * 100)} · betrayal {Math.round(r.betrayal * 100)} · fear {Math.round(r.fear * 100)}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                  {profile && profile.relationships.length === 0 && (
                    <span className="trauma-empty">no bonds yet — relationships form as citizens meet.</span>
                  )}
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
                      if (result) pushMessage(result.msg)
                      soundRef.current?.voice(selected.traits.voicePitch, 'happy')
                      setTick((t) => t + 1)
                    }}>👋 Greet</button>
                    <button className="btn" onClick={() => useTool('comfort')}>💛 Comfort</button>
                    <button
                      className={`btn ${game?.carriedId === selected.id ? 'btn-active' : ''}`}
                      onClick={() => {
                        const next = game?.carriedId === selected.id ? null : selected.id
                        if (next === null && game) {
                          act(() => {
                            const r = game.dropCarried()
                            pushMessage(r.msg)
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
                  <div className="psyche-actions">
                    <button className="btn btn-ghost" onClick={() => setMenu('journal')}>📖 Life journal</button>
                  </div>
                </>
              )}
              {!selected.alive && <p className="grave-note">Resting in the old city. Their life is remembered.</p>}
            </>
          ) : (
            <>
              <div className="panel-head">
                <h2>People</h2>
                <button className="panel-close" aria-label="Close people panel" onClick={closeHud}>×</button>
              </div>
              <div className="roster" data-roster>
                {(game?.creatures.filter((c) => c.alive) ?? []).map((c) => (
                  <button
                    key={c.id}
                    className="roster-row"
                    data-roster-id={c.id}
                    onClick={() => {
                      viewRef.current?.select(c.id)
                      setSelectedId(c.id)
                      setDetailsOpen(false)
                    }}
                  >
                    <span className="roster-name">{c.name}</span>
                    <span className={`mood mood-${MOOD(c.chem.pleasure, c.chem.fear, c.chem.health)}`}>{MOOD(c.chem.pleasure, c.chem.fear, c.chem.health)}</span>
                    <span className={`trust-tag trust-${trustLabel(c.psyche.trust)}`}>{trustLabel(c.psyche.trust)}</span>
                    <span className="roster-action">{c.action}</span>
                  </button>
                ))}
                {(game?.creatures.filter((c) => c.alive) ?? []).length === 0 && (
                  <p className="trauma-empty">No living citizens yet — the city is still quiet.</p>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {started && inGame && hudTab === 'society' && (
        <section className="hud-panel" data-panel="society">
          <div className="panel-head">
            <h2>Society</h2>
            <button className="panel-close" aria-label="Close society panel" onClick={closeHud}>×</button>
          </div>
          <p className="city-facts" data-society="pulse">🕊 {alive} living · {summary?.population ?? game?.creatures.length ?? 0} remembered · {dayLabel}</p>
          <h3 className="psyche-sub">city pulse</h3>
          <div className="emotion-row">
            {(['happy', 'scared', 'unwell', 'calm'] as const).map((m) => (
              <span key={m} className={`emotion-chip mood-${m}`} data-society-mood={m}>{m} {moodCounts[m]}</span>
            ))}
          </div>
          <h3 className="psyche-sub">market</h3>
          {(summary?.market.length ?? 0) > 0 ? (
            <div className="market-list" data-society="market">
              {summary!.market.map((m) => (
                <div key={m.item} className="market-row" data-market-item={m.item}>
                  <span className="item-name">{m.item}</span>
                  <span className="item-stock">{m.stock}/{m.maxStock}</span>
                  <span className="item-price">{m.price}¢</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="society-empty">market quiet — citizens are trading.</span>
          )}
          <h3 className="psyche-sub">strongest bonds</h3>
          {(summary?.bonds.length ?? 0) > 0 ? (
            <div className="bond-list" data-society="bonds">
              {summary!.bonds.map((b) => (
                <div key={`${b.a}-${b.b}`} className="bond-row">
                  <span>{nameOf(b.a)} ↔ {nameOf(b.b)}</span>
                  <span className="bond-trust">trust {Math.round(b.trust * 100)}</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="society-empty">no strong bonds yet.</span>
          )}
          <h3 className="psyche-sub">fears & conflicts</h3>
          {(summary?.fears.length ?? 0) > 0 ? (
            <div className="fear-list" data-society="fears">
              {summary!.fears.map((f) => (
                <div key={`${f.a}-${f.b}`} className="fear-row">
                  <span>{nameOf(f.a)} fears {nameOf(f.b)}</span>
                  <span className="fear-level">fear {Math.round(f.fear * 100)}</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="society-empty">no active feuds.</span>
          )}
          <h3 className="psyche-sub">recent events</h3>
          {(summary?.recentEvents.length ?? 0) > 0 ? (
            <div className="event-list" data-society="events">
              {[...summary!.recentEvents].reverse().map((ev, i) => (
                <div key={`${ev.tick}-${i}`} className="event-row" data-event={ev.kind}>
                  <span className="event-tick">t{ev.tick}</span>
                  <span>{describeSocietyEvent(ev)}</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="society-empty">the city is still settling in.</span>
          )}
        </section>
      )}

      {started && inGame && hudTab === 'tools' && (
        <section className="hud-panel" data-panel="tools">
          <div className="panel-head">
            <h2>Tools</h2>
            <button className="panel-close" aria-label="Close tools panel" onClick={closeHud}>×</button>
          </div>
          <h3 className="psyche-sub">utility</h3>
          <div className="tool-grid">
            <button className="tool-btn" data-tool="torch" data-tool-ready="true" onClick={() => act(() => { if (game) toggleTorchFn(game.player) })}>
              <span className="tool-emoji">🔥</span>
              <span className="tool-label">{game?.player.torchLit ? 'Torch on' : 'Torch off'}</span>
            </button>
          </div>
          {selected?.alive ? (
            <>
              <h3 className="psyche-sub">beneficial</h3>
              <div className="tool-grid" data-tools="beneficial">
                {toolActions.filter((tool) => tool.kind === 'beneficial').map((tool) => (
                  <button
                    key={tool.id}
                    className="tool-btn tool-beneficial"
                    data-tool={tool.id}
                    data-tool-ready="true"
                    onClick={() => useTool(tool.id)}
                  >
                    <span className="tool-emoji">{tool.emoji}</span>
                    <span className="tool-label">{tool.label}</span>
                    <span className="tool-note">{tool.note}</span>
                  </button>
                ))}
              </div>
              <h3 className="psyche-sub">harmful</h3>
              <div className="tool-grid" data-tools="harmful">
                {toolActions.filter((tool) => tool.kind === 'harmful').map((tool) => (
                  <button
                    key={tool.id}
                    className="tool-btn tool-harmful"
                    data-tool={tool.id}
                    data-tool-ready="true"
                    onClick={() => useTool(tool.id)}
                  >
                    <span className="tool-emoji">{tool.emoji}</span>
                    <span className="tool-label">{tool.label}</span>
                    <span className="tool-note">{tool.note}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="hint" data-tools="empty">Focus a citizen to open tools — feed, heal, comfort, amuse, and the harsher overseer actions.</p>
          )}
          <p className="hint">Tools report immediate effect and social consequence. Cruelty is remembered by witnesses.</p>
        </section>
      )}

      {/* Dismissible, timed, bottom-anchored status messages — never on the crosshair */}
      <div className="msg-stack" data-msg-stack>
        {messages.map((m) => (
          <div key={m.id} className={`msg msg-${m.kind}`} data-message data-message-kind={m.kind}>
            <span className="msg-text">{m.text}</span>
            <button className="msg-close" aria-label="Dismiss message" onClick={() => dismissMessage(m.id)}>×</button>
          </div>
        ))}
      </div>

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
            {isTouch && (
              <div className="row" data-setting="control-mode">
                <span>Touch controls</span>
                <div className="seg" role="group" aria-label="Touch controls">
                  <button
                    className={`btn btn-small ${controlMode === 'split' ? 'btn-active' : 'btn-ghost'}`}
                    data-value="split"
                    onClick={() => changeControlMode('split')}
                  >Invisible split</button>
                  <button
                    className={`btn btn-small ${controlMode === 'classic' ? 'btn-active' : 'btn-ghost'}`}
                    data-value="classic"
                    onClick={() => changeControlMode('classic')}
                  >Classic joystick</button>
                </div>
              </div>
            )}
            {isTouch && <p className="hint">Split: left thumb walks, right thumb looks. Classic shows the joystick ring.</p>}
            <h3>Saves</h3>
            <div className="save-rows">
              {SLOTS.map((slot, i) => (
                <div className="save-row" key={slot}>
                  <button className="btn btn-small" onClick={() => game && void idbSave(slot, game.save()).then(() => pushMessage(`saved to slot ${i + 1}`))}>Save {i + 1}</button>
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
                    reader.onload = () => { try { loadGame(JSON.parse(String(reader.result))) } catch { pushMessage('Could not read that save file') } }
                    reader.readAsText(f)
                  }} />
                </label>
              </div>
            </div>
            <p className="hint">Install: use your browser's Add to Home Screen for fullscreen play.</p>
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
    </div>
  )
}

/** Invisible split touch surface — one gesture owner for two simultaneous
 * pointers: left half = movement pad (touch-origin displacement), right
 * half = look. No visible joystick ring. Buttons/panels sit above this
 * surface and keep their own gestures. */
function TouchSplitSurface({
  onMoveVec,
  onLook,
  onTap,
}: {
  onMoveVec: (vec: TouchMoveVec) => void
  onLook: (dx: number, dy: number) => void
  onTap: () => void
}) {
  const movePointer = useRef<number | null>(null)
  const lookPointer = useRef<number | null>(null)
  const moveOrigin = useRef({ x: 0, y: 0 })
  const lookLast = useRef({ x: 0, y: 0 })
  const lookDown = useRef({ x: 0, y: 0 })
  const lookMoved = useRef(false)

  const endPointer = (pointerId: number): void => {
    if (pointerId === movePointer.current) {
      movePointer.current = null
      onMoveVec({ fwd: 0, side: 0 })
    } else if (pointerId === lookPointer.current) {
      lookPointer.current = null
      if (!lookMoved.current) onTap()
    }
  }

  return (
    <div
      className="look-surface"
      data-touch-surface="split"
      aria-label="Left side moves, right side looks"
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse') return
        const zone = touchZoneAt(e.clientX, e.currentTarget.clientWidth, 'split')
        if (zone === 'move' && movePointer.current === null) {
          movePointer.current = e.pointerId
          e.currentTarget.setPointerCapture(e.pointerId)
          moveOrigin.current = { x: e.clientX, y: e.clientY }
          onMoveVec({ fwd: 0, side: 0 })
        } else if (zone === 'look' && lookPointer.current === null) {
          lookPointer.current = e.pointerId
          e.currentTarget.setPointerCapture(e.pointerId)
          lookLast.current = { x: e.clientX, y: e.clientY }
          lookDown.current = { x: e.clientX, y: e.clientY }
          lookMoved.current = false
        }
      }}
      onPointerMove={(e) => {
        if (e.pointerId === movePointer.current) {
          onMoveVec(touchMoveFromOrigin(moveOrigin.current, { x: e.clientX, y: e.clientY }))
        } else if (e.pointerId === lookPointer.current) {
          const dx = e.clientX - lookLast.current.x
          const dy = e.clientY - lookLast.current.y
          lookLast.current = { x: e.clientX, y: e.clientY }
          if (Math.abs(e.clientX - lookDown.current.x) + Math.abs(e.clientY - lookDown.current.y) > 10) lookMoved.current = true
          if (dx !== 0 || dy !== 0) onLook(dx, dy)
        }
      }}
      onPointerUp={(e) => endPointer(e.pointerId)}
      onPointerCancel={(e) => endPointer(e.pointerId)}
    />
  )
}

/** Full-screen LOOK SURFACE — classic fallback. One isolated gesture owner
 * for mobile look. Pointer Events are preferred; Touch Events are used only
 * as an old-browser fallback. */
function LookSurface({ onLook, onTap, marker = 'classic' }: { onLook: (dx: number, dy: number) => void; onTap: () => void; marker?: string }) {
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
      data-touch-surface={marker}
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
      data-joystick
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
