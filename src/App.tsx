/**
 * App — the shell.
 *
 * Owns one simulation, one view and the panel that happens to be open. React
 * does not drive the game loop and does not hold any world state; it reads a
 * snapshot the view publishes ten times a second and renders the interface
 * from that.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './ui/theme.css'
import { Hud, type PanelId } from './ui/Hud'
import { Chat } from './ui/Chat'
import { Neural } from './ui/Neural'
import { Settings } from './ui/Settings'
import { Guide } from './ui/Guide'
import { WorldView, type HudSnapshot } from './render/view'
import { loadSettings, saveSettings, type Settings as SettingsState } from './render/quality'
import { createSim, type Sim } from './sim/sim'
import { ChatStore, clearWorld, loadWorld, saveWorld } from './sim/save'

declare global {
  interface Window {
    luma?: { sim: Sim; view: WorldView }
  }
}

const EMPTY_HUD: HudSnapshot = {
  gaze: { kind: 'none', id: null, name: '', prompt: '', inReach: false },
  berries: 0,
  dayPhase: 0.3,
  clock: '07:00',
  talkingTo: null,
  nearby: [],
  fps: 60,
}

export default function App(): React.ReactElement {
  const mount = useRef<HTMLDivElement>(null)
  const viewRef = useRef<WorldView | null>(null)
  const simRef = useRef<Sim | null>(null)

  const [ready, setReady] = useState(false)
  const [hud, setHud] = useState<HudSnapshot>(EMPTY_HUD)
  const [panel, setPanel] = useState<PanelId>('guide')
  const [subject, setSubject] = useState<number | null>(null)
  const [settings, setSettings] = useState<SettingsState>(() => loadSettings())
  const [toasts, setToasts] = useState<Array<{ id: number; text: string }>>([])

  const chatStore = useMemo(() => new ChatStore(), [])

  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random()
    setToasts((list) => [...list.slice(-2), { id, text }])
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 2600)
  }, [])

  // --- boot ----------------------------------------------------------------
  useEffect(() => {
    const container = mount.current
    if (!container) return
    let disposed = false

    const sim = loadWorld() ?? createSim()
    simRef.current = sim

    const view = new WorldView(container, sim, loadSettings(), {
      onHud: setHud,
      onOpenChat: (id) => {
        setSubject(id)
        setPanel('chat')
      },
      onToast: toast,
    })
    viewRef.current = view

    void view.load().then(() => {
      if (disposed) return
      view.start()
      setReady(true)
    })

    // The handle the playtest script drives the game through. It is the same
    // objects the game itself uses — a test that pokes a mock proves nothing
    // about the thing you ship.
    window.luma = { sim, view }

    return () => {
      disposed = true
      view.dispose()
      viewRef.current = null
      delete window.luma
    }
  }, [toast])

  // --- autosave -------------------------------------------------------------
  useEffect(() => {
    const handle = window.setInterval(() => {
      const sim = simRef.current
      if (sim) saveWorld(sim)
    }, 20000)
    const onLeave = (): void => {
      const sim = simRef.current
      if (sim) saveWorld(sim)
    }
    window.addEventListener('beforeunload', onLeave)
    return () => {
      window.clearInterval(handle)
      window.removeEventListener('beforeunload', onLeave)
      onLeave()
    }
  }, [])

  // --- the panel owns the mouse while it is open ----------------------------
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.setUiCaptured(panel !== null)
    view.setTalkingTo(panel === 'chat' || panel === 'mind' ? subject : null)
    if (panel === null) {
      const creature = subject != null ? simRef.current?.creature(subject) : null
      if (creature) simRef.current?.stopListening(creature)
    }
  }, [panel, subject])

  // --- keys React owns ------------------------------------------------------
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.input.onKey = (code, event) => {
      if (code === 'Escape') {
        setPanel((current) => (current === null ? null : null))
        return
      }
      // everything else only applies while the world has the keyboard
      if (panel !== null) return
      if (code === 'KeyO') setPanel('settings')
      if (code === 'F1' || code === 'Slash') {
        event.preventDefault()
        setPanel('guide')
      }
      if (code === 'KeyN') {
        const looked = view.gazeTarget()
        if (looked != null) {
          setSubject(looked)
          setPanel('mind')
        } else {
          toast('look at a Luma to open its mind')
        }
      }
    }
    return () => {
      view.input.onKey = null
    }
  }, [panel, toast])

  useEffect(() => {
    viewRef.current?.applySettings(settings)
    saveSettings(settings)
  }, [settings])

  const creature = subject != null ? simRef.current?.creature(subject) ?? null : null
  const sim = simRef.current

  const closePanel = useCallback(() => setPanel(null), [])

  const startNewValley = useCallback(() => {
    clearWorld()
    chatStore.clearAll()
    window.location.reload()
  }, [chatStore])

  return (
    <div className="app">
      <div className="viewport" ref={mount} onClick={() => viewRef.current?.audio.unlock()} />

      {ready && (
        <Hud
          hud={hud}
          toasts={toasts}
          onOpen={setPanel}
          onSelect={(id) => {
            setSubject(id)
            setPanel('chat')
          }}
        />
      )}

      {panel !== null && (
        <div
          className="panel-scrim"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closePanel()
          }}
        >
          {panel === 'chat' && sim && creature && (
            <Chat
              sim={sim}
              creature={creature}
              store={chatStore}
              onClose={closePanel}
              onOpenMind={() => setPanel('mind')}
            />
          )}
          {panel === 'mind' && sim && creature && (
            <Neural sim={sim} creature={creature} onClose={closePanel} />
          )}
          {panel === 'settings' && (
            <Settings
              settings={settings}
              onChange={setSettings}
              onClose={closePanel}
              onNewValley={startNewValley}
            />
          )}
          {panel === 'guide' && <Guide onClose={closePanel} />}
        </div>
      )}

      {!ready && (
        <div className="boot">
          <h1>Luma Haven</h1>
          <p>waking the valley…</p>
        </div>
      )}
    </div>
  )
}
