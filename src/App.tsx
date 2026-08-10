/**
 * Luma Lab — Test Lab V2 observer UI.
 * Mobile-first, landscape-friendly: the live world (Three.js via LabView)
 * is the feedback. No text logs — the dock acts on the world, taps inspect.
 * The player is a DISTINCT human-like character (sim.player), never a
 * creature: it moves with the joystick/WASD, fights, equips, and holds its
 * own inventory (data-player-inv). Tools: spawn + bread/money placement + a
 * Benevolence group (comfort, heal, gift) and a Malice group (poke, hit,
 * scare, rob).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { LabView } from './render/labview'
import { createSim, type Sim } from './lab/sim'
import { deriveEmotion, type EmotionType } from './lab/emotion'
import { DRIVE_KEYS, driveTitles, type DriveKey } from './lab/drives'
import { TOWERS } from './lab/world'
import { SUBSTANCES } from './lab/substances'
import { dist } from './lab/util'
import type { ItemId } from './lab/inventory'

import './lab.css'

type ToolMode =
  | 'bread'
  | 'money'
  | 'comfort'
  | 'heal'
  | 'gift'
  | 'poke'
  | 'hit'
  | 'scare'
  | 'rob'
  | null

type ToolGroup = 'benevolence' | 'malice' | null

interface ToolDef {
  id: Exclude<ToolMode, null>
  label: string
  emoji: string
  onCreature: boolean // true = act on tapped creature, false = place on world
}

const GROUP_TOOLS: Record<NonNullable<ToolGroup>, ToolDef[]> = {
  benevolence: [
    { id: 'comfort', label: 'comfort', emoji: '🫂', onCreature: true },
    { id: 'heal', label: 'heal', emoji: '✨', onCreature: true },
    { id: 'gift', label: 'gift', emoji: '💝', onCreature: true },
  ],
  malice: [
    { id: 'poke', label: 'poke', emoji: '✋', onCreature: true },
    { id: 'hit', label: 'hit', emoji: '💥', onCreature: true },
    { id: 'scare', label: 'scare', emoji: '👻', onCreature: true },
    { id: 'rob', label: 'rob', emoji: '🫳', onCreature: true },
  ],
}

const EMOJI: Record<EmotionType, string> = {
  content: '🙂',
  happy: '😊',
  angry: '😠',
  afraid: '😨',
  sad: '😢',
  sleepy: '😴',
  loving: '😍',
}

// Substance pills in the addictions group (only shown when level > 0.05).
const SUBSTANCE_EMOJI: Record<string, string> = {
  brew: '🍺',
  herb: '🌿',
  spark: '✨',
  tonic: '💊',
}

// Tiny icons for every item the player or a creature can hold.
const ITEM_EMOJI: Record<ItemId, string> = {
  bread: '🍞',
  medicine: '💊',
  brew: '🍺',
  herb: '🌿',
  spark: '✨',
  tonic: '🧪',
  stick: '🪓',
}

// Compact drive labels for the drives row (full titles live in the tooltip).
const DRIVE_SHORT: Record<DriveKey, string> = {
  importance: 'Im',
  approval: 'Ap',
  ego: 'Eg',
  tribalism: 'Tr',
  conformity: 'Co',
  reciprocity: 'Re',
  lossAversion: 'Lo',
  greed: 'Gr',
  curiosity: 'Cu',
  legacy: 'Le',
}

/** How close the player must be to a creature to fight it. */
const FIGHT_RANGE = 3

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
  const [openGroup, setOpenGroup] = useState<ToolGroup>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState<1 | 2 | 10>(1)
  const [showMore, setShowMore] = useState(false)
  const [muted, setMuted] = useState(false)

  // first-person (player) mode — ALWAYS on: you are the visitor. No observer.
  const [viewMode, setViewMode] = useState<'observer' | 'first-person'>('first-person')
  const [pointerLocked, setPointerLocked] = useState(false)
  const [joyVec, setJoyVec] = useState({ x: 0, y: 0 })
  const joyPointerRef = useRef<number | null>(null)
  const joyCenterRef = useRef({ x: 0, y: 0 })
  const lookPointerRef = useRef<number | null>(null)
  const lookLastRef = useRef({ x: 0, y: 0 })
  const lookDownRef = useRef({ x: 0, y: 0, t: 0 })
  const lookMovedRef = useRef(false)

  // coarse pointer = touch screen (joystick + look zone), fine = mouse (WASD)
  const isTouch = useMemo(
    () => window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window,
    [],
  )

  // orientation: the game plays LANDSCAPE and loads in it automatically.
  const [landscape, setLandscape] = useState(() => window.matchMedia?.('(orientation: landscape)').matches ?? true)
  const [rotateHint, setRotateHint] = useState(false)
  useEffect(() => {
    // ask the browser to stay landscape (best-effort; iOS needs fullscreen)
    try {
      const so = (window.screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } }).orientation
      if (so?.lock && typeof so.lock === 'function') {
        void so.lock('landscape').catch(() => undefined)
      }
    } catch {
      // orientation lock unavailable (desktop / old browsers) — fine
    }
    const mq = window.matchMedia?.('(orientation: landscape)')
    if (!mq) return
    const onChange = (): void => setLandscape(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  useEffect(() => {
    const mq = window.matchMedia?.('(orientation: portrait) and (max-width: 599px)')
    if (!mq) return
    const onChange = (): void => setRotateHint(mq.matches)
    setRotateHint(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

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
        const def = Object.values(GROUP_TOOLS).flat().find((d) => d.id === mode)
        if (def?.onCreature) {
          if (mode === 'comfort') sim.comfort(id)
          else if (mode === 'heal') sim.heal(id)
          else if (mode === 'gift') sim.gift(id, 8)
          else if (mode === 'poke') sim.poke(id)
          else if (mode === 'hit') sim.hit(id)
          else if (mode === 'scare') sim.scare(id)
          else if (mode === 'rob') sim.rob(id)
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
    // The game is FIRST-PERSON ONLY — you start as the visitor immediately.
    view.setFirstPerson(1)
    setViewMode('first-person')

    setTick((t) => t + 1)
    const id = window.setInterval(() => setTick((t) => t + 1), 300)

    return () => {
      window.clearInterval(id)
      viewRef.current?.dispose()
      viewRef.current = null
      simRef.current = null
    }
  }, [])

  // Collapse the chip's expanded details whenever a different creature is selected.
  useEffect(() => {
    setShowMore(false)
  }, [selectedId])

  // Mirror pointer-lock state (label on the capture button).
  useEffect(() => {
    const onChange = (): void => {
      setPointerLocked(viewRef.current?.pointerLocked ?? false)
    }
    document.addEventListener('pointerlockchange', onChange)
    return () => document.removeEventListener('pointerlockchange', onChange)
  }, [])

  const setToolMode = useCallback((mode: ToolMode): void => {
    toolRef.current = mode
    setTool(mode)
  }, [])

  const spawn = useCallback((): void => {
    simRef.current?.spawnCreature()
    setTick((t) => t + 1)
  }, [])

  const toggleTool = useCallback((mode: Exclude<ToolMode, null>): void => {
    if (toolRef.current === mode) {
      setToolMode(null)
      setOpenGroup(null)
    } else {
      setToolMode(mode)
      setOpenGroup(null)
      setSelectedId(null)
    }
  }, [setToolMode])

  const toggleGroup = useCallback((group: NonNullable<ToolGroup>): void => {
    setOpenGroup((prev) => {
      const next = prev === group ? null : group
      if (!next) {
        setToolMode(null)
      }
      return next
    })
  }, [setToolMode])

  const togglePause = useCallback((): void => {
    const next = !pausedRef.current
    pausedRef.current = next
    setPaused(next)
    viewRef.current?.setPaused(next)
  }, [])

  const applySpeed = useCallback((s: 1 | 2 | 10): void => {
    pausedRef.current = false
    setPaused(false)
    setSpeed(s)
    viewRef.current?.setPaused(false)
    viewRef.current?.setSpeed(s)
  }, [])

  // ── player mode (a distinct character — never a creature) ──

  const socializePlayer = useCallback((): void => {
    simRef.current?.playerSocialize()
    setTick((t) => t + 1)
  }, [])

  const usePlayerItem = useCallback((id: ItemId): void => {
    simRef.current?.playerUseItem(id)
    setTick((t) => t + 1)
  }, [])

  const applyJoystick = useCallback((x: number, y: number): void => {
    setJoyVec({ x, y })
    if (viewRef.current) viewRef.current.joystick = { x, y }
  }, [])

  const updateJoyFromPointer = useCallback((clientX: number, clientY: number): void => {
    const c = joyCenterRef.current
    const dx = clientX - c.x
    const dy = clientY - c.y
    const R = 48 // thumb travel radius (px)
    const len = Math.hypot(dx, dy)
    const cl = len > R ? R / len : 1
    applyJoystick((dx * cl) / R, (-dy * cl) / R) // up on the stick = forward
  }, [applyJoystick])

  // The joystick base stays fixed where it was first touched (its own center),
  // so the thumb never jumps and the deflection reads predictably.
  const onJoyPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>): void => {
    if (joyPointerRef.current !== null) return
    joyPointerRef.current = e.pointerId
    const rect = e.currentTarget.getBoundingClientRect()
    joyCenterRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    e.currentTarget.setPointerCapture(e.pointerId)
    updateJoyFromPointer(e.clientX, e.clientY)
  }, [updateJoyFromPointer])

  const onJoyPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>): void => {
    if (joyPointerRef.current !== e.pointerId) return
    updateJoyFromPointer(e.clientX, e.clientY)
  }, [updateJoyFromPointer])

  const onJoyPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>): void => {
    if (joyPointerRef.current !== e.pointerId) return
    joyPointerRef.current = null
    applyJoystick(0, 0)
  }, [applyJoystick])

  const onLookPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>): void => {
    if (lookPointerRef.current !== null) return
    lookPointerRef.current = e.pointerId
    lookLastRef.current = { x: e.clientX, y: e.clientY }
    lookDownRef.current = { x: e.clientX, y: e.clientY, t: performance.now() }
    lookMovedRef.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const onLookPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>): void => {
    if (lookPointerRef.current !== e.pointerId) return
    const last = lookLastRef.current
    const dx = e.clientX - last.x
    const dy = e.clientY - last.y
    lookLastRef.current = { x: e.clientX, y: e.clientY }
    if (Math.hypot(dx, dy) > 3) lookMovedRef.current = true
    // drag right (dx+) looks right; drag UP (dy− on screen) looks up → negate dy
    viewRef.current?.playerLook(dx * 0.008, -dy * 0.008)
  }, [])

  const onLookPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>): void => {
    if (lookPointerRef.current !== e.pointerId) return
    lookPointerRef.current = null
    // a still tap on the look zone raycasts like any other tap
    if (!lookMovedRef.current && performance.now() - lookDownRef.current.t < 350) {
      viewRef.current?.tapAt(e.clientX, e.clientY)
    }
  }, [])

  const sim = simRef.current
  const alive = sim ? sim.creatures.filter((c) => c.alive).length : 0
  const playerC = sim?.player ?? null
  const fpOn = viewMode === 'first-person' && playerC?.alive === true
  const selected = selectedId !== null ? sim?.creatureById(selectedId) ?? null : null
  const emotion = selected ? deriveEmotion(selected.chem, selected.genome) : null
  const partner =
    selected && selected.partnerId !== null ? (sim?.creatureById(selected.partnerId) ?? null) : null
  const knownCount = selected ? TOWERS.filter((t) => selected.knowsTower(t.id)).length : 0

  // nearest creature the player can fight right now (selected one preferred)
  let fightTarget: number | null = null
  if (sim && playerC?.alive) {
    if (selectedId !== null) {
      const c = sim.creatureById(selectedId)
      if (c?.alive && dist(playerC.pos.x, playerC.pos.z, c.pos.x, c.pos.z) <= FIGHT_RANGE) {
        fightTarget = c.id
      }
    }
    if (fightTarget === null) {
      let bestD = FIGHT_RANGE
      for (const c of sim.creatures) {
        if (!c.alive) continue
        const d = dist(playerC.pos.x, playerC.pos.z, c.pos.x, c.pos.z)
        if (d < bestD) {
          bestD = d
          fightTarget = c.id
        }
      }
    }
  }

  const fightPlayer = useCallback((): void => {
    const s = simRef.current
    if (!s || fightTarget === null) return
    s.playerFight(fightTarget)
    setTick((t) => t + 1)
  }, [fightTarget])

  return (
    <div className="app" data-lab data-landscape={landscape}>
      <div className="mount" ref={mountRef} />

      {/* polite rotate hint — portrait phones; never blocks the game */}
      {rotateHint && (
        <div className="rotate-hint" data-rotate-hint aria-hidden="true">
          <span className="rotate-icon">📱</span> rotate for best view
        </div>
      )}

      {/* touch controls: full-screen look zone + thumb joystick (player mode) */}
      {fpOn && isTouch && (
        <>
          <div
            className="fp-look"
            data-look
            onPointerDown={onLookPointerDown}
            onPointerMove={onLookPointerMove}
            onPointerUp={onLookPointerUp}
            onPointerCancel={onLookPointerUp}
            onLostPointerCapture={() => {
              lookPointerRef.current = null
            }}
          />
          <div
            className="fp-joystick"
            data-joystick
            onPointerDown={onJoyPointerDown}
            onPointerMove={onJoyPointerMove}
            onPointerUp={onJoyPointerUp}
            onPointerCancel={onJoyPointerUp}
            onLostPointerCapture={() => {
              joyPointerRef.current = null
              applyJoystick(0, 0)
            }}
          >
            <div
              className="fp-joystick-thumb"
              data-joystick-thumb
              style={{ transform: `translate(${joyVec.x * 48}px, ${-joyVec.y * 48}px)` }}
            />
          </div>
        </>
      )}

      {/* desktop pointer lock (player mode only) */}
      {viewMode === 'first-person' && !isTouch && (
        <button
          type="button"
          className="fp-btn"
          data-pointerlock
          aria-pressed={pointerLocked}
          aria-label={pointerLocked ? 'Release mouse control' : 'Capture mouse control (WASD)'}
          onClick={() => {
            const view = viewRef.current
            if (!view) return
            if (pointerLocked) view.exitPointerLock()
            else view.requestPointerLock()
          }}
        >
          {pointerLocked ? '🔓' : '🔒'}
        </button>
      )}

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
            <button
              type="button"
              className={`speed-btn ${!paused && speed === 10 ? 'speed-btn-active' : ''}`}
              data-speed="10"
              aria-pressed={!paused && speed === 10}
              onClick={() => applySpeed(10)}
            >
              10×
            </button>
          </div>
          <button
            type="button"
            className="speed-btn sound-btn"
            data-sound={muted ? 'off' : 'on'}
            aria-pressed={!muted}
            aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
            onClick={() => {
              const next = !muted
              setMuted(next)
              viewRef.current?.sound.setEnabled(!next)
              viewRef.current?.sound.unlock()
            }}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          {/* first-person is the ONLY mode — you are the visitor, always */}
          <span className="view-toggle" data-view-mode="first-person" aria-hidden="true">
            <span className="dock-emoji">🧍</span>
            <span className="dock-label">you</span>
          </span>
        </div>
      </header>

      {/* player HUD — compact, only while the player is out in the world */}
      {fpOn && playerC && (
        <section className="player-hud" data-player-hud aria-label="player status">
          <div className="player-status">
            <span className="mini-bar" title="health">
              <span className="mini-bar-icon">❤️</span>
              <span className="mini-bar-track">
                <span
                  className="mini-bar-fill"
                  style={{ width: `${Math.round(playerC.health * 100)}%`, background: '#e8876a' }}
                />
              </span>
            </span>
            <span className="mini-bar" title="hunger">
              <span className="mini-bar-icon">🍞</span>
              <span className="mini-bar-track">
                <span
                  className="mini-bar-fill"
                  style={{ width: `${Math.round(playerC.hunger * 100)}%`, background: '#e0b46a' }}
                />
              </span>
            </span>
            <span className="player-weapon" title={playerC.weapon ? 'equipped' : 'no weapon'}>
              {playerC.weapon === 'stick' ? '🪓' : '✊'}
            </span>
          </div>
          <div className="player-inv" data-player-inv role="group" aria-label="player inventory">
            <span className="player-wallet" data-player-wallet title="wallet">
              🪙 {Math.round(playerC.wallet)}
            </span>
            {Object.entries(playerC.inventory.items).map(([id, n]) => (
              <button
                key={id}
                type="button"
                className={`player-inv-item ${playerC.weapon === id ? 'player-inv-equipped' : ''}`}
                data-player-item={id}
                aria-label={`use ${id}`}
                title={playerC.weapon === id ? `${id} (equipped)` : `use ${id}`}
                onClick={() => usePlayerItem(id as ItemId)}
              >
                <span className="player-inv-emoji">{ITEM_EMOJI[id as ItemId] ?? '📦'}</span>
                <span className="player-inv-count">×{n}</span>
              </button>
            ))}
            {fightTarget !== null && (
              <button
                type="button"
                className="player-fight"
                data-player-fight
                aria-label="fight the creature ahead"
                title="fight"
                onClick={fightPlayer}
              >
                ⚔️
              </button>
            )}
          </div>
        </section>
      )}

      {selected && selected.alive && emotion && (
        <section
          className={`chip ${showMore ? 'chip-expanded' : ''}`}
          data-chip
          aria-label={`${selected.name} details`}
        >
          <header className="chip-head">
            <span className="chip-emoji">{EMOJI[emotion.type]}</span>
            <span className="chip-dot" style={{ background: emotion.color }} />
            <h2>{selected.name}</h2>
            <span className="chip-mood-label">{emotion.type}</span>
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
          <div className="chip-bars">
            <Bar label="hunger" value={selected.chem.hunger} color="#e8876a" />
            <Bar label="energy" value={selected.chem.energy} color="#e0b46a" />
            <Bar label="strength" value={selected.chem.strength} color="#c96f3d" />
          </div>
          <div className="chip-stats">
            <span>🪙 {Math.round(selected.wallet)}</span>
            <span>🏦 {Math.round(selected.banked)}</span>
            {selected.weapon && <span>🪓 {selected.weapon}</span>}
            <span className="chip-knowledge" title="buildings known">
              🗺️ {knownCount}/{TOWERS.length}
            </span>
            <span className="chip-action">{selected.action}</span>
          </div>
          {Object.keys(selected.inventory.items).length > 0 && (
            <div className="chip-inv" data-chip-inv>
              {Object.entries(selected.inventory.items).map(([id, n]) => (
                <span key={id} className="chip-inv-item" title={id}>
                  {ITEM_EMOJI[id as ItemId] ?? '📦'}×{n}
                </span>
              ))}
            </div>
          )}
          <div className="chip-knowledge-track" aria-hidden="true">
            <div
              className="chip-knowledge-fill"
              style={{ width: `${Math.round((knownCount / TOWERS.length) * 100)}%` }}
            />
          </div>
          <button
            type="button"
            className="show-more-btn"
            data-show-more
            aria-expanded={showMore}
            aria-controls="chip-extra"
            onClick={() => setShowMore((s) => !s)}
          >
            {showMore ? '▲ show less' : '▼ show more'}
          </button>
          {showMore && (
            <div className="chip-extra" id="chip-extra">
              <div className="chip-group">
                <span className="chip-group-title">survival</span>
                <div className="chip-bars">
                  <Bar label="health" value={selected.chem.health} color="#7fb57f" />
                  <Bar label="pleasure" value={selected.chem.pleasure} color="#c98ae0" />
                  <Bar label="social" value={selected.chem.social} color="#7fc4d9" />
                  <Bar label="fear" value={selected.chem.fear} color="#9fc7e8" />
                </div>
              </div>
              <div className="chip-group">
                <span className="chip-group-title">mind</span>
                <div className="chip-meta">
                  {selected.chem.grief > 0.05 && (
                    <span className="chip-pill">🕯️ grief {Math.round(selected.chem.grief * 100)}</span>
                  )}
                  {selected.jealousy > 0.05 && (
                    <span className="chip-pill">💚 jealousy {Math.round(selected.jealousy * 100)}</span>
                  )}
                  {selected.chem.intoxication > 0.05 && (
                    <span className="chip-pill">🌀 drunk {Math.round(selected.chem.intoxication * 100)}</span>
                  )}
                  {selected.chem.grief <= 0.05 &&
                    selected.jealousy <= 0.05 &&
                    selected.chem.intoxication <= 0.05 && <span className="chip-meta-empty">calm & clear</span>}
                </div>
              </div>
              <div className="chip-group">
                <span className="chip-group-title">society</span>
                <div className="chip-meta">
                  <span className="chip-pill">🎓 {Math.round(selected.education)}</span>
                  {selected.gangId !== null && <span className="chip-pill">⚔️ gang {selected.gangId}</span>}
                  {partner && <span className="chip-pill">💞 {partner.name}</span>}
                  <span className="chip-pill">💞 bonds: {Object.keys(selected.bonds).length}</span>
                </div>
                {selected.gratitude[0] > 0.2 && <p className="chip-grateful">💛 grateful to you</p>}
              </div>
              <div className="chip-group">
                <span className="chip-group-title">addictions</span>
                <div className="chip-meta">
                  {SUBSTANCES.filter((s) => (selected.chem.addiction[s.id] ?? 0) > 0.05).map((s) => (
                    <span key={s.id} className="chip-pill">
                      {SUBSTANCE_EMOJI[s.id]} {s.name} {Math.round((selected.chem.addiction[s.id] ?? 0) * 100)}
                    </span>
                  ))}
                  {!SUBSTANCES.some((s) => (selected.chem.addiction[s.id] ?? 0) > 0.05) && (
                    <span className="chip-meta-empty">clean</span>
                  )}
                </div>
              </div>
              <div className="chip-group">
                <span className="chip-group-title">knowledge map</span>
                <div className="kmap" role="group" aria-label="buildings known">
                  {TOWERS.map((t) => (
                    <span
                      key={t.id}
                      className={`kmap-cell ${selected.knowsTower(t.id) ? 'kmap-cell-known' : ''}`}
                      title={`${t.label}${selected.knowsTower(t.id) ? '' : ' (unknown)'}`}
                    >
                      {t.icon}
                    </span>
                  ))}
                </div>
              </div>
              <div className="chip-group">
                <span className="chip-group-title">drives</span>
                <div className="drives-row" role="group" aria-label="drives">
                  {DRIVE_KEYS.map((k) => (
                    <span
                      key={k}
                      className="drive-item"
                      title={`${k}: ${driveTitles[k]} (${Math.round(selected.drives[k] * 100)})`}
                    >
                      <span
                        className="drive-dot"
                        style={{ opacity: 0.15 + selected.drives[k] * 0.85 }}
                      />
                      <span className="drive-key">{DRIVE_SHORT[k]}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Tool palettes open above the dock */}
      {openGroup && (
        <div className="tool-palette" data-tool-palette={openGroup} aria-label={`${openGroup} tools`}>
          {GROUP_TOOLS[openGroup].map((def) => (
            <button
              key={def.id}
              type="button"
              className={`palette-btn ${tool === def.id ? 'palette-btn-active' : ''}`}
              data-lab-tool={def.id}
              aria-pressed={tool === def.id}
              aria-label={def.label}
              onClick={() => toggleTool(def.id)}
            >
              <span className="dock-emoji">{def.emoji}</span>
              <span className="dock-label">{def.label}</span>
            </button>
          ))}
        </div>
      )}

      <nav className="dock" data-dock aria-label="Lab tools">
        <button
          type="button"
          className="dock-btn"
          data-lab-tool="spawn"
          aria-label="spawn"
          onClick={spawn}
        >
          <span className="dock-emoji">🐣</span>
          <span className="dock-label">spawn</span>
        </button>
        {viewMode === 'first-person' && (
          <button
            type="button"
            className="dock-btn"
            data-lab-tool="social"
            aria-label="bond with a nearby creature"
            onClick={socializePlayer}
          >
            <span className="dock-emoji">💞</span>
            <span className="dock-label">bond</span>
          </button>
        )}
        <button
          type="button"
          className={`dock-btn ${tool === 'bread' ? 'dock-btn-active' : ''}`}
          data-lab-tool="bread"
          aria-pressed={tool === 'bread'}
          aria-label="drop bread"
          onClick={() => toggleTool('bread')}
        >
          <span className="dock-emoji">🍞</span>
          <span className="dock-label">bread</span>
        </button>
        <button
          type="button"
          className={`dock-btn ${tool === 'money' ? 'dock-btn-active' : ''}`}
          data-lab-tool="money"
          aria-pressed={tool === 'money'}
          aria-label="drop money"
          onClick={() => toggleTool('money')}
        >
          <span className="dock-emoji">🪙</span>
          <span className="dock-label">money</span>
        </button>
        <button
          type="button"
          className={`dock-btn ${openGroup === 'benevolence' || GROUP_TOOLS.benevolence.some((d) => d.id === tool) ? 'dock-btn-active' : ''}`}
          data-dock-group="benevolence"
          aria-pressed={openGroup === 'benevolence'}
          aria-label="benevolence tools"
          onClick={() => toggleGroup('benevolence')}
        >
          <span className="dock-emoji">💖</span>
          <span className="dock-label">kind</span>
        </button>
        <button
          type="button"
          className={`dock-btn ${openGroup === 'malice' || GROUP_TOOLS.malice.some((d) => d.id === tool) ? 'dock-btn-active' : ''}`}
          data-dock-group="malice"
          aria-pressed={openGroup === 'malice'}
          aria-label="malice tools"
          onClick={() => toggleGroup('malice')}
        >
          <span className="dock-emoji">⚔️</span>
          <span className="dock-label">mean</span>
        </button>
      </nav>
    </div>
  )
}
