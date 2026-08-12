/**
 * App — the shell around the game.
 *
 * Owns the simulation, the player's own progress, and which panel is open.
 * Everything three-dimensional belongs to WorldView; React never touches the
 * scene. The one rule worth stating: whenever a panel is open the world stops
 * hearing the keyboard, so typing is always typing.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import './ui/theme.css'

import { createSim, type Sim } from './lab/sim'
import { loadSim, saveSim, type LabSave } from './lab/save'
import { loadWorldBackup, loadWorldBlob, saveWorldBlob } from './lab/creature-storage'
import { loadSettings, saveSettings, type QualityPreset } from './lab/settings'
import { countItem, type ItemId } from './lab/inventory'
import { itemName } from './lab/items'
import { formatStory, storiesSince } from './lab/story'

import { WorldView, type HudSnapshot } from './render/world-view'
import { equipTraveller, seedStarterSociety } from './game/seed'
import {
  createProgress, loadProgress, migrateProgress, saveProgress, standingRank,
  type PlayerProgress,
} from './game/progress'
import {
  createBoard, objectiveFor, onGive, onLandmark, onTalk, scanRequests,
  type RequestBoard,
} from './game/requests'
import { pruneNodes } from './game/gather'

import { Hud, type PanelId, type ToastItem } from './ui/Hud'
import { Talk } from './ui/panels/Talk'
import { Pack } from './ui/panels/Pack'
import { Journal } from './ui/panels/Journal'
import { Society } from './ui/panels/Society'
import { Mind } from './ui/panels/Mind'
import { Board } from './ui/panels/Board'
import { Atlas } from './ui/panels/Atlas'
import { Settings } from './ui/panels/Settings'
import { Guide } from './ui/panels/Guide'

const AUTOSAVE_EVERY = 20000
const SENSITIVITY_KEY = 'luma-haven-sensitivity'

const EMPTY_HUD: HudSnapshot = {
  time: '10:00', phase: 'morning', day: 1, region: null, prompt: null, promptKey: 'E',
  hold: 0, gaze: null, health: 1, hunger: 1, swimming: false, underwater: false,
  population: 0, fps: 60, frameMs: 16, simMs: 0, draws: 0, triangles: 0, locked: false,
}

const PANEL_KEYS: Record<string, PanelId> = {
  Tab: 'pack',
  KeyR: 'board',
  KeyJ: 'journal',
  KeyH: 'society',
  KeyI: 'mind',
  KeyM: 'atlas',
  KeyO: 'settings',
  F1: 'guide',
  Slash: 'guide',
}

function bootSim(): { sim: Sim; fresh: boolean } {
  const settings = loadSettings()
  const params = new URLSearchParams(location.search)
  if (!params.has('fresh')) {
    for (const raw of [loadWorldBlob(), loadWorldBackup()]) {
      if (!raw) continue
      try {
        const sim = loadSim(JSON.parse(raw) as LabSave)
        Object.assign(sim.settings, settings)
        return { sim, fresh: false }
      } catch {
        // fall through to the next candidate, then to a new world
      }
    }
  }
  const sim = createSim(Math.floor(Math.random() * 1e9))
  Object.assign(sim.settings, settings)
  seedStarterSociety(sim)
  equipTraveller(sim)
  return { sim, fresh: true }
}

export default function App(): React.ReactElement {
  const mountRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<WorldView | null>(null)
  const simRef = useRef<Sim | null>(null)
  const progressRef = useRef<PlayerProgress>(createProgress())
  const boardRef = useRef<RequestBoard>(createBoard())
  const toastId = useRef(1)
  const lastStoryTick = useRef(0)

  const [ready, setReady] = useState(false)
  const [loadState, setLoadState] = useState({ fraction: 0, label: 'waking the valley' })
  const [hud, setHud] = useState<HudSnapshot>(EMPTY_HUD)
  const [panel, setPanel] = useState<PanelId | null>(null)
  const [talkId, setTalkId] = useState<number | null>(null)
  const [mindId, setMindId] = useState<number | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [regionTitle, setRegionTitle] = useState<{ name: string; key: number } | null>(null)
  const [slot, setSlot] = useState(0)
  const [showPerf, setShowPerf] = useState(false)
  const [locked, setLocked] = useState(false)
  const [, forceRender] = useState(0)
  const [sound, setSound] = useState(true)
  const [sensitivity, setSensitivity] = useState(() => {
    const raw = Number(localStorage.getItem(SENSITIVITY_KEY))
    return Number.isFinite(raw) && raw > 0 ? raw : 0.45
  })

  const redraw = useCallback(() => forceRender((n) => n + 1), [])

  const toast = useCallback((text: string, kind: ToastItem['kind'] = 'info') => {
    const id = toastId.current++
    setToasts((prev) => [...prev.slice(-4), { id, text, kind }])
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
    }, 5200)
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5600)
  }, [])

  // ---------------------------------------------------------------- boot

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const { sim, fresh } = bootSim()
    simRef.current = sim
    const progress = new URLSearchParams(location.search).has('fresh')
      ? createProgress()
      : migrateProgress(loadProgress())
    progressRef.current = progress
    lastStoryTick.current = sim.time

    const view = new WorldView(mount, sim, progress, {
      onHud: setHud,
      onToast: (text, kind) => toast(text, kind),
      onTalk: (id) => {
        setTalkId(id)
        setMindId(id)
        setPanel('talk')
      },
      onDiscover: (landmark) => {
        toast(`Found ${landmark.name} — ${landmark.short}`, 'good')
        const advanced = onLandmark(boardRef.current, landmark.id)
        if (advanced) toast(objectiveFor(advanced), 'info')
      },
      onRegion: (name) => setRegionTitle({ name, key: Date.now() }),
      onLoadProgress: (fraction, label) => setLoadState({ fraction, label }),
      onGave: (creatureId, item) => {
        const outcome = onGive(sim, boardRef.current, progress, creatureId, item, sim.time)
        if (outcome) {
          toast(outcome.message, 'good')
          if (outcome.coins) toast(`+${outcome.coins} coins`, 'good')
        }
      },
      onGathered: () => redraw(),
      onPointerLock: setLocked,
    })
    viewRef.current = view
    view.input.setSensitivity(sensitivity)
    view.sound.setEnabled(sound)
    if (import.meta.env.DEV) {
      // a handle for the screenshot harness and for poking at a live world
      ;(window as unknown as { luma?: unknown }).luma = { view, sim, progress, board: boardRef.current }
    }

    let cancelled = false
    void view.load().then(() => {
      if (cancelled) return
      view.setQuality(sim.settings.quality)
      view.start()
      setReady(true)
      if (fresh) {
        toast('You come down the South Road into Haven.', 'story')
        setTimeout(() => setPanel('guide'), 900)
      }
    })

    return () => {
      cancelled = true
      view.dispose()
      viewRef.current = null
    }
    // deliberately once: the world is built one time per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------- keys

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.input.onKey = (code, event) => {
      const el = document.activeElement as HTMLElement | null
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

      if (code === 'Escape') {
        if (panel) {
          event.preventDefault()
          setPanel(null)
        }
        return
      }
      if (typing) return

      if (code === 'Tab') event.preventDefault()

      const target = PANEL_KEYS[code]
      if (target) {
        event.preventDefault()
        if (target === 'mind') setMindId(view.gazeTarget ?? mindId)
        setPanel((current) => (current === target ? null : target))
        return
      }

      if (code.startsWith('Digit')) {
        const n = Number(code.slice(5))
        if (n >= 1 && n <= 9) {
          setSlot(n - 1)
          return
        }
      }

      switch (code) {
        case 'KeyE':
          if (!panel) view.interact()
          break
        case 'KeyQ':
          if (!panel) view.dropHeld(progressRef.current.hotbar[slot])
          break
        case 'F3':
          event.preventDefault()
          setShowPerf((v) => !v)
          break
        case 'KeyP':
          setPaused((p) => !p)
          break
        case 'Comma':
          view.setSpeed(1)
          toast('Speed 1×')
          break
        case 'Period':
          view.setSpeed(3)
          toast('Speed 3×')
          break
        default:
          break
      }
    }
    return () => {
      if (view.input) view.input.onKey = null
    }
  })

  const [paused, setPaused] = useState(false)
  useEffect(() => {
    // Opening a panel does not stop the valley. It used to, which meant you
    // could read the journal for ten minutes and wonder why nobody had moved,
    // and it made a conversation a freeze-frame instead of something someone
    // could walk away from. Pausing is P, and only P.
    viewRef.current?.setPaused(paused)
  }, [paused])

  useEffect(() => {
    viewRef.current?.setUiCaptured(panel !== null)
  }, [panel])

  useEffect(() => {
    viewRef.current?.setHeld(progressRef.current.hotbar[slot] ?? null)
  }, [slot, panel])

  useEffect(() => {
    viewRef.current?.input.setSensitivity(sensitivity)
    localStorage.setItem(SENSITIVITY_KEY, String(sensitivity))
  }, [sensitivity])

  useEffect(() => {
    viewRef.current?.sound.setEnabled(sound)
  }, [sound])

  // ------------------------------------------------------------ mouse acts

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      const view = viewRef.current
      if (!view || panel) return
      if (!view.pointerLocked) return
      const held = progressRef.current.hotbar[slot]
      if (e.button === 0) view.useHeld(held)
      if (e.button === 2) view.place(held)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [panel, slot])

  useEffect(() => {
    const onWheel = (): void => {
      const view = viewRef.current
      if (!view || panel) return
      const notches = view.input.takeWheel()
      if (notches) setSlot((s) => (s + notches + 9) % 9)
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => window.removeEventListener('wheel', onWheel)
  }, [panel])

  // ------------------------------------------------------- background work

  useEffect(() => {
    const timer = setInterval(() => {
      const sim = simRef.current
      if (!sim) return
      scanRequests(sim, boardRef.current, sim.time)
      pruneNodes(progressRef.current, sim.time)

      // surface the settlement's own news, sparingly
      const fresh = storiesSince(sim.stories, lastStoryTick.current, 2)
      if (fresh.length) {
        lastStoryTick.current = sim.time
        for (const story of fresh) {
          if (story.significance < 0.45) continue
          toast(formatStory(story), 'story')
        }
      }
      redraw()
    }, 2500)
    return () => clearInterval(timer)
  }, [toast, redraw])

  useEffect(() => {
    const timer = setInterval(() => {
      const sim = simRef.current
      if (!sim) return
      saveWorldBlob(JSON.stringify(saveSim(sim)))
      saveProgress(progressRef.current)
    }, AUTOSAVE_EVERY)
    return () => clearInterval(timer)
  }, [])

  // ---------------------------------------------------------------- render

  const sim = simRef.current
  const progress = progressRef.current
  const board = boardRef.current

  // recomputed on every render on purpose: the inventory mutates in place
  const counts: Partial<Record<ItemId, number>> = {}
  if (sim) {
    for (const id of progress.hotbar) {
      if (id) counts[id] = countItem(sim.player.inventory, id)
    }
  }

  const objectives = board.active.map(objectiveFor)
  const standing = standingRank(progress.standing)
  const playerPos = viewRef.current?.playerPosition() ?? { x: 0, z: 0, yaw: 0 }

  const closePanel = useCallback(() => setPanel(null), [])

  return (
    <div className="game" data-game>
      <div className="viewport" ref={mountRef} />

      {ready && sim && (
        <Hud
          hud={hud}
          hotbar={progress.hotbar}
          counts={counts}
          selected={slot}
          onSelect={setSlot}
          toasts={toasts}
          regionTitle={regionTitle}
          objectives={objectives}
          standing={{ title: standing.title, value: progress.standing }}
          showPerf={showPerf}
          onOpen={(id) => {
            if (id === 'mind') setMindId(viewRef.current?.gazeTarget ?? mindId)
            setPanel((current) => (current === id ? null : id))
          }}
          openPanel={panel}
        />
      )}

      {ready && sim && !locked && !panel && (
        <div
          className="enter"
          data-enter
          onClick={() => viewRef.current?.requestLock()}
        >
          <div className="box">
            <h3>Click to look around</h3>
            <p>WASD to walk · E to interact · Esc to let the mouse go</p>
          </div>
        </div>
      )}

      {sim && panel === 'talk' && talkId != null && (
        <Talk
          sim={sim}
          creatureId={talkId}
          distance={viewRef.current?.distanceTo(talkId) ?? 99}
          voice={sim.settings.optionalCloudAi && sim.settings.cloudEndpoint ? 'your service' : "Haven's own"}
          onClose={closePanel}
          onSpoke={(id) => {
            const outcome = onTalk(sim, board, progress, id, sim.time)
            if (outcome) toast(outcome.message, 'good')
            redraw()
          }}
        />
      )}

      {sim && panel === 'pack' && (
        <Pack
          sim={sim}
          progress={progress}
          playerX={playerPos.x}
          playerZ={playerPos.z}
          onClose={closePanel}
          onChanged={redraw}
          onToast={toast}
        />
      )}

      {panel === 'journal' && (
        <Journal progress={progress} tick={sim?.time ?? 0} onClose={closePanel} />
      )}

      {sim && panel === 'society' && <Society sim={sim} onClose={closePanel} />}

      {sim && panel === 'mind' && (
        <Mind sim={sim} creatureId={mindId} onClose={closePanel} onPick={setMindId} />
      )}

      {sim && panel === 'board' && (
        <Board sim={sim} board={board} onClose={closePanel} onChanged={redraw} />
      )}

      {panel === 'atlas' && (
        <Atlas progress={progress} player={playerPos} onClose={closePanel} />
      )}

      {sim && panel === 'settings' && (
        <Settings
          sim={sim}
          progress={progress}
          sensitivity={sensitivity}
          onSensitivity={setSensitivity}
          onQuality={(q: QualityPreset) => {
            viewRef.current?.setQuality(q)
            saveSettings(sim.settings)
          }}
          onClose={closePanel}
          onToast={toast}
          sound={sound}
          onSound={setSound}
          onReload={(save) => {
            const next = loadSim(save)
            simRef.current = next
            location.reload()
          }}
        />
      )}

      {panel === 'guide' && <Guide onClose={closePanel} />}

      <div className={`loading${ready ? ' done' : ''}`} data-loading>
        <div className="inner">
          <h1>Luma Haven</h1>
          <p className="tag">a valley that does not wait for you</p>
          <div className="bar"><i style={{ width: `${Math.round(loadState.fraction * 100)}%` }} /></div>
          <p className="what">{loadState.label}…</p>
        </div>
      </div>
    </div>
  )
}

export { itemName }
