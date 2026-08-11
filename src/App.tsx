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
import { GOODS, marketPrice, priceTrend } from './lab/economy'
import { CONCEPTS } from './lab/language'
import { inspectCreature, inspectSociety, type InspectReport, type SocietyReport } from './lab/inspect'
import {
  loadSettings, saveSettings, applyPreset, type GameSettings, type QualityPreset,
} from './lab/settings'
import { avgFrameMs } from './lab/lod'
import { saveSim, loadSim } from './lab/save'
import { applySocialEvent } from './lab/socialbond'
import { ensureCoupleHousehold, adoptChild } from './lab/household'
import { transmitCulture } from './lab/norms'
import { fixtureAt } from './lab/interact'
import { addItem } from './lab/inventory'
import { markSeen } from './lab/story'
import { phaseBreakdown } from './lab/lod'
import { createCloudProvider, polishTurn } from './lab/dialogue-provider'
import { saveWorldBlob, loadWorldBlob, loadWorldBackup, hasWorldSlot } from './lab/creature-storage'

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
  water: '💧',
  medicine: '💊',
  brew: '🍺',
  herb: '🌿',
  spark: '✨',
  tonic: '🧪',
  stick: '🪓',
  cloak: '🧥',
  trinket: '🔮',
  gem: '💎',
  satchel: '🎒',
  timber: '🪵',
  grain: '🌾',
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

function SocietyPanel({ report, onClose }: { report: SocietyReport; onClose: () => void }) {
  return (
    <section className="society" data-society aria-label="society pulse">
      <header className="society-head">
        <h2>🏘️ Haven</h2>
        <button type="button" className="society-close" data-society-close aria-label="Close society panel" onClick={onClose}>✕</button>
      </header>
      <p className="society-line">
        {report.population} Luma · {report.households} households · inequality {report.inequality.toFixed(2)}
      </p>
      <p className="society-line">
        {report.leader ? `Most respected: ${report.leader}` : 'No one stands out yet'}
      </p>
      {report.sinceLastVisit.length > 0 && (
        <>
          <h3>since you last looked</h3>
          <div className="society-since" data-society-since>
            {report.sinceLastVisit.map((line, i) => (
              <div key={`${line}-${i}`}>{line}</div>
            ))}
          </div>
        </>
      )}
      <h3>what people are talking about</h3>
      <div className="society-stories" data-society-stories>
        {report.stories.length === 0 && <span className="society-empty">nothing much has happened yet</span>}
        {report.stories.map((s) => (
          <div key={`${s.tick}-${s.text}`} className="story-line" data-story-kind={s.kind}>
            <span className="story-text">{s.text}</span>
            {s.because && <span className="story-because"> — {s.because}</span>}
          </div>
        ))}
      </div>
      {report.shortages.length > 0 && (
        <>
          <h3>shortages</h3>
          <div className="society-shortages" data-society-shortages>
            {report.shortages.map((s) => (
              <div key={s.good}>no {s.good}: {s.cause}</div>
            ))}
          </div>
        </>
      )}
      <h3>norms</h3>
      <div className="society-norms" data-society-norms>
        {report.norms.map((n) => (
          <Bar key={n.key} label={n.key} value={n.value} color="#c9a44f" />
        ))}
      </div>
      <h3>work</h3>
      <div className="society-jobs" data-society-jobs>
        {report.staffed.length === 0 && <span className="society-empty">nobody has taken a role yet</span>}
        {report.staffed.map((s) => (
          <span key={s} className="chip">{s}</span>
        ))}
        {report.vacancies.map((v) => (
          <span key={v} className="chip chip-dim">{v}: vacant</span>
        ))}
      </div>
      {report.sharedWords.length > 0 && (
        <>
          <h3>shared words</h3>
          <div className="society-words" data-society-words>
            {report.sharedWords.map((w) => (
              <span key={w.concept} className="chip">{w.concept} = <b>{w.word}</b></span>
            ))}
          </div>
        </>
      )}
      {report.overheard.length > 0 && (
        <>
          <h3>overheard</h3>
          <div className="society-overheard" data-society-overheard>
            {report.overheard.map((line, i) => (
              <div key={`${line}-${i}`}>{line}</div>
            ))}
          </div>
        </>
      )}
      {report.chronicle.length > 0 && (
        <>
          <h3>chronicle</h3>
          <div className="society-chronicle" data-society-chronicle>
            {report.chronicle.map((line, i) => (
              <div key={`${line}-${i}`}>{line}</div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function InspectorPanel({ report, onClose }: { report: InspectReport; onClose: () => void }) {
  return (
    <section className="inspector" data-inspector aria-label="mind inspector">
      <header className="inspector-head">
        <h2>🧠 {report.name}</h2>
        <button type="button" className="inspector-close" data-inspector-close aria-label="Close inspector" onClick={onClose}>✕</button>
      </header>
      <p className="inspector-mood">
        {report.stage} · {report.emotion} · {report.mood} · {report.action}
        {report.intention ? ` → ${report.intention}` : ''}
        {report.role ? ` · ${report.role}` : ''}
      </p>
      <ul className="inspector-reason" data-inspector-reason>
        {report.reasoning.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="inspector-scores" data-inspector-scores>
        {report.topScores.map((s) => (
          <span key={s.action} className="chip">{s.action} {s.score}</span>
        ))}
      </div>
      <div className="inspector-grid">
        <div>
          <h3>needs</h3>
          {report.needs.slice(0, 6).map((n) => (
            <Bar key={n.key} label={n.key} value={n.value} color="#7a9" />
          ))}
        </div>
        <div>
          <h3>bonds</h3>
          {report.relationships.length === 0 && <p className="inspector-empty">none yet</p>}
          {report.relationships.map((r) => (
            <div key={r.id} className="inspector-bond">
              {r.name} · trust {r.trust.toFixed(1)} · friend {r.friend.toFixed(1)}
            </div>
          ))}
        </div>
      </div>
      <div className="inspector-meta">
        <span>🪙 {Math.round(report.wallet)} / 🏦 {Math.round(report.banked)}</span>
        <span>~{report.costKb} KB mind</span>
        <span>{report.job}</span>
        {report.illness > 0.05 && <span>🤒 illness {report.illness.toFixed(2)}</span>}
        {report.injury > 0.05 && <span>🩹 injury {report.injury.toFixed(2)}</span>}
      </div>
      <div className="inspector-family" data-inspector-family>
        <h3>family</h3>
        <div>
          {report.family.partner ? `partner: ${report.family.partner}` : 'no partner'}
          {report.family.parents.length > 0 ? ` · parents: ${report.family.parents.join(', ')}` : ''}
          {report.family.children.length > 0 ? ` · children: ${report.family.children.join(', ')}` : ''}
        </div>
      </div>
      {report.habits.length > 0 && (
        <div className="inspector-habits" data-inspector-habits>
          <h3>habits</h3>
          {report.habits.map((h) => (
            <span key={h.key} className="chip">{h.key} {h.value.toFixed(2)}</span>
          ))}
        </div>
      )}
      {report.beliefKeys.length > 0 && (
        <div className="inspector-beliefs" data-inspector-beliefs>
          <h3>beliefs</h3>
          {report.beliefKeys.map((b) => (
            <div key={b.key}>
              {b.key} = {b.value.toFixed(2)} (sure {b.confidence.toFixed(2)}, {b.source})
            </div>
          ))}
        </div>
      )}
      {report.promises.length > 0 && (
        <div className="inspector-promises" data-inspector-promises>
          <h3>promises</h3>
          {report.promises.map((p) => (
            <div key={p}>{p}</div>
          ))}
        </div>
      )}
      {report.life.length > 0 && (
        <div className="inspector-life" data-inspector-life>
          <h3>life so far</h3>
          {report.life.map((e) => (
            <div key={`${e.tick}-${e.text}`}>
              {e.text}
              {e.because && <span className="story-because"> — {e.because}</span>}
            </div>
          ))}
        </div>
      )}
      {(report.owes > 0 || report.owed > 0) && (
        <div className="inspector-debts" data-inspector-debts>
          <h3>obligations</h3>
          {report.owes > 0 && <div>owes {report.owes} coins</div>}
          {report.owed > 0 && <div>is owed {report.owed} coins</div>}
        </div>
      )}
      {report.memories.length > 0 && (
        <div className="inspector-mem" data-inspector-mem>
          <h3>memories</h3>
          {report.memories.map((m) => (
            <div key={m}>{m}</div>
          ))}
        </div>
      )}
      {report.recentTalk.length > 0 && (
        <div className="inspector-talk" data-inspector-talk>
          <h3>recent talk</h3>
          {report.recentTalk.map((t) => (
            <div key={t}>{t}</div>
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * A first session should open on a place with history, not eight strangers.
 * Two households already exist, with partners bonded and children born into
 * them; everyone else arrives as an unattached newcomer.
 */
function seedStarterSociety(sim: Sim): void {
  const cap = sim.settings.populationCap
  const total = Math.min(9, cap)
  const made: ReturnType<Sim['spawnCreature']>[] = []
  for (let i = 0; i < total; i++) {
    const angle = (i / total) * Math.PI * 2
    made.push(sim.spawnCreature(undefined, Math.cos(angle) * 14, Math.sin(angle) * 14))
  }
  // somebody is standing in the plaza when you arrive, so the first thing you
  // can do is talk to a neighbour rather than walk across an empty square
  if (made[0]) made[0].pos = { x: 2.5, z: 2.5 }
  // pair the first two couples and give each a child
  for (const [a, b] of [[0, 1], [2, 3]] as const) {
    const one = made[a]
    const two = made[b]
    if (!one || !two || one === two) continue
    one.partnerId = two.id
    two.partnerId = one.id
    one.chem.bond = 0.75
    two.chem.bond = 0.75
    one.bonds[two.id] = 0.7
    two.bonds[one.id] = 0.7
    applySocialEvent(one.social, two.id, 'flirt', 2)
    applySocialEvent(two.social, one.id, 'flirt', 2)
    ensureCoupleHousehold(sim.society, one, two, 0)
  }
  const kidA = made[4]
  const kidB = made[5]
  if (kidA && made[0] && made[1]) {
    kidA.age = 120
    kidA.stage = 'child'
    kidA.parentIds = [made[0].id, made[1].id]
    adoptChild(sim.society, made[0], kidA)
    transmitCulture(made[0], kidA)
  }
  if (kidB && made[2] && made[3]) {
    kidB.age = 260
    kidB.stage = 'child'
    kidB.parentIds = [made[2].id, made[3].id]
    adoptChild(sim.society, made[2], kidB)
    transmitCulture(made[2], kidB)
  }
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
  const [marketOpen, setMarketOpen] = useState(false)
  const [teachOpen, setTeachOpen] = useState(false)
  const [teachConcept, setTeachConcept] = useState<string>(CONCEPTS[0])
  const [teachWord, setTeachWord] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatText, setChatText] = useState('')
  const [chatReply, setChatReply] = useState<string | null>(null)
  const [inspectOpen, setInspectOpen] = useState(false)
  const [societyOpen, setSocietyOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings())
  const [perfMs, setPerfMs] = useState(0)
  const [perfOverlay, setPerfOverlay] = useState(false)
  const [saveNote, setSaveNote] = useState<string | null>(null)
  // the controls card opens itself the first time somebody plays
  const [helpOpen, setHelpOpen] = useState(() => {
    try {
      return localStorage.getItem('luma-haven-seen-help') !== '1'
    } catch {
      return true
    }
  })

  // view mode: first-person (you ARE the visitor) or top view (watch the world)
  const [viewMode, setViewMode] = useState<'observer' | 'first-person'>('first-person')
  const [pointerLocked, setPointerLocked] = useState(false)
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

    let sim = createSim(seed)
    // restore autosave when present (unless ?fresh=1 or explicit seed);
    // a corrupt newest save falls back to the previous one before giving up
    const fresh = params.get('fresh') === '1'
    if (!fresh && seedRaw === null) {
      const blob = loadWorldBlob()
      if (blob) {
        try {
          sim = loadSim(JSON.parse(blob))
        } catch {
          const backup = loadWorldBackup()
          try {
            sim = backup ? loadSim(JSON.parse(backup)) : createSim(seed)
          } catch {
            sim = createSim(seed)
          }
        }
      }
    }
    sim.settings = { ...loadSettings() }
    if (sim.creatures.filter((c) => c.alive).length === 0) {
      seedStarterSociety(sim)
      // you arrive with what a traveller carries: something to eat, something
      // to drink, and something worth giving away
      addItem(sim.player.inventory, 'bread', 2, 0)
      addItem(sim.player.inventory, 'water', 1, 0)
      addItem(sim.player.inventory, 'trinket', 1, 0)
    }
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
        setChatOpen(true)
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
    view.applySettings?.(sim.settings)
    // The game is FIRST-PERSON ONLY — you start as the visitor immediately.
    view.setFirstPerson(1)
    setViewMode('first-person')

    setTick((t) => t + 1)
    const id = window.setInterval(() => setTick((t) => t + 1), 300)
    // autosave every ~20s
    const saveId = window.setInterval(() => {
      const s = simRef.current
      if (!s) return
      try {
        saveWorldBlob(JSON.stringify(saveSim(s)))
      } catch {
        // ignore quota
      }
    }, 20000)
    const perfId = window.setInterval(() => {
      const s = simRef.current
      if (s) setPerfMs(avgFrameMs(s.lod))
    }, 1000)

    return () => {
      window.clearInterval(id)
      window.clearInterval(saveId)
      window.clearInterval(perfId)
      // final autosave
      if (simRef.current) {
        try {
          saveWorldBlob(JSON.stringify(saveSim(simRef.current)))
        } catch {
          /* ignore */
        }
      }
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

  /**
   * Keyboard access. Every panel has a key, so nothing is mouse-only, and Esc
   * closes whatever is open. Typing in a text field is left alone.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'
      if (typing) {
        if (e.key === 'Escape') target?.blur()
        return
      }
      const closeAll = (): void => {
        setChatOpen(false)
        setInspectOpen(false)
        setSocietyOpen(false)
        setSettingsOpen(false)
        setMarketOpen(false)
        setTeachOpen(false)
        setHelpOpen(false)
      }
      switch (e.key) {
        case 'F3':
          e.preventDefault()
          setPerfOverlay((v) => !v)
          break
        case 'Escape':
          closeAll()
          break
        case 't': case 'T':
          setChatOpen((o) => !o)
          break
        case 'i': case 'I':
          setInspectOpen((o) => !o)
          break
        case 'h': case 'H':
          setSocietyOpen((o) => !o)
          break
        case 'g': case 'G':
          setSettingsOpen((o) => !o)
          break
        case 'm': case 'M':
          setMarketOpen((o) => !o)
          break
        case '?': case '/':
          setHelpOpen((o) => !o)
          break
        case ' ':
          e.preventDefault()
          togglePause()
          break
        case '1':
          applySpeed(1)
          break
        case '2':
          applySpeed(2)
          break
        case '3':
          applySpeed(10)
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [applySpeed, togglePause])

  // ── player mode (a distinct character — never a creature) ──
  const toggleViewMode = useCallback((): void => {
    const view = viewRef.current
    const sim = simRef.current
    if (!view || !sim) return
    if (viewMode === 'observer') {
      // back into the visitor's eyes — revive if needed
      if (!sim.player.alive) {
        sim.player.health = 1
        sim.player.alive = true
        sim.player.pos = { x: 0, z: 0 }
      }
      view.setFirstPerson(1)
      setViewMode('first-person')
    } else {
      view.setFirstPerson(null) // observer / top view camera
      setViewMode('observer')
    }
  }, [viewMode])

  const socializePlayer = useCallback((): void => {
    simRef.current?.playerSocialize()
    setTick((t) => t + 1)
  }, [])

  const submitTeach = useCallback((): void => {
    const sim = simRef.current
    const word = teachWord.trim()
    if (!sim || !word) return
    sim.playerTeach(teachConcept, word)
    sim.playerSay(teachConcept)
    setTeachWord('')
    setTeachOpen(false)
    setTick((t) => t + 1)
  }, [teachConcept, teachWord])

  const submitChat = useCallback((): void => {
    const sim = simRef.current
    const text = chatText.trim()
    if (!sim || !text) return
    const turn = sim.playerTalk(text, selectedId ?? undefined)
    setChatReply(turn?.text ?? 'No one nearby to hear you.')
    setChatText('')
    setTick((t) => t + 1)

    // Optional: if the player has pointed the game at their own dialogue
    // service, let it rephrase the line. The local reply is already on screen,
    // so a slow or broken service simply never changes anything.
    if (!turn || !settings.optionalCloudAi || !settings.cloudEndpoint) return
    const speaker = sim.creatureById(turn.speakerId)
    if (!speaker) return
    const provider = createCloudProvider({ endpoint: settings.cloudEndpoint })
    void polishTurn(provider, turn, speaker.name, speaker.psyche?.mood ?? 'calm').then((polished) => {
      if (polished.text !== turn.text) setChatReply(polished.text)
    })
  }, [chatText, selectedId, settings.optionalCloudAi, settings.cloudEndpoint])

  const updateSettings = useCallback((patch: Partial<GameSettings>): void => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      if (simRef.current) simRef.current.settings = next
      viewRef.current?.applySettings?.(next)
      return next
    })
  }, [])

  const setQuality = useCallback((q: QualityPreset): void => {
    setSettings((prev) => {
      const next = applyPreset(prev, q)
      saveSettings(next)
      if (simRef.current) simRef.current.settings = next
      viewRef.current?.applySettings?.(next)
      return next
    })
  }, [])

  const manualSave = useCallback((slot?: number): void => {
    const s = simRef.current
    if (!s) return
    const ok = saveWorldBlob(JSON.stringify(saveSim(s)), slot)
    setSaveNote(ok ? `saved${slot ? ` to slot ${slot}` : ''}` : 'save failed (storage full?)')
    window.setTimeout(() => setSaveNote(null), 2500)
    setTick((t) => t + 1)
  }, [])

  const loadSlot = useCallback((slot: number): void => {
    const blob = loadWorldBlob(slot)
    if (!blob) {
      setSaveNote(`slot ${slot} is empty`)
      window.setTimeout(() => setSaveNote(null), 2500)
      return
    }
    try {
      const next = loadSim(JSON.parse(blob))
      next.settings = { ...settings }
      simRef.current = next
      viewRef.current?.swapSim(next)
      setSelectedId(null)
      setSaveNote(`loaded slot ${slot}`)
    } catch {
      setSaveNote(`slot ${slot} is unreadable — kept current world`)
    }
    window.setTimeout(() => setSaveNote(null), 2500)
    setTick((t) => t + 1)
  }, [settings])

  const exportSave = useCallback((): void => {
    const s = simRef.current
    if (!s) return
    const blob = new Blob([JSON.stringify(saveSim(s))], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `luma-haven-${Date.now()}.luma.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const importSave = useCallback((file: File): void => {
    void file.text().then((text) => {
      try {
        const next = loadSim(JSON.parse(text))
        next.settings = { ...settings }
        simRef.current = next
        viewRef.current?.swapSim(next)
        setSelectedId(null)
        setSaveNote('world imported')
      } catch {
        setSaveNote('that file could not be read')
      }
      window.setTimeout(() => setSaveNote(null), 2500)
      setTick((t) => t + 1)
    })
  }, [settings])

  const usePlayerItem = useCallback((id: ItemId): void => {
    simRef.current?.playerUseItem(id)
    setTick((t) => t + 1)
  }, [])

  const giveItemToNearby = useCallback((id: ItemId): void => {
    const s = simRef.current
    if (!s) return
    const note = s.playerGive(id, selectedId ?? undefined)
    setSaveNote(note ?? 'nobody close enough to hand it to')
    window.setTimeout(() => setSaveNote(null), 2200)
    setTick((t) => t + 1)
  }, [selectedId])

  const dropPlayerItem = useCallback((id: ItemId): void => {
    const s = simRef.current
    if (!s) return
    if (s.playerDrop(id)) {
      setSaveNote(`dropped the ${id}`)
      window.setTimeout(() => setSaveNote(null), 1800)
    }
    setTick((t) => t + 1)
  }, [])

  const useFixture = useCallback((action: 'rest' | 'toggle' | 'take' | 'store'): void => {
    const s = simRef.current
    if (!s) return
    const note = s.playerUseFixture(action)
    if (note) {
      setSaveNote(note)
      window.setTimeout(() => setSaveNote(null), 2000)
    }
    setTick((t) => t + 1)
  }, [])

  const applyJoystick = useCallback((x: number, y: number): void => {
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

  // Floating joystick: wherever you touch the LEFT half of the screen becomes
  // the stick's center. This lets the thumb rest anywhere and keeps the camera
  // out of it (stopPropagation on the move zone).
  const onJoyPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>): void => {
    if (joyPointerRef.current !== null) return
    e.stopPropagation()
    joyPointerRef.current = e.pointerId
    joyCenterRef.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
    updateJoyFromPointer(e.clientX, e.clientY)
  }, [updateJoyFromPointer])

  const onJoyPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>): void => {
    if (joyPointerRef.current !== e.pointerId) return
    e.stopPropagation()
    updateJoyFromPointer(e.clientX, e.clientY)
  }, [updateJoyFromPointer])

  const onJoyPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>): void => {
    if (joyPointerRef.current !== e.pointerId) return
    e.stopPropagation()
    joyPointerRef.current = null
    applyJoystick(0, 0)
  }, [applyJoystick])

  const onLookPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>): void => {
    if (lookPointerRef.current !== null) return
    e.stopPropagation()
    lookPointerRef.current = e.pointerId
    lookLastRef.current = { x: e.clientX, y: e.clientY }
    lookDownRef.current = { x: e.clientX, y: e.clientY, t: performance.now() }
    lookMovedRef.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const onLookPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>): void => {
    if (lookPointerRef.current !== e.pointerId) return
    e.stopPropagation()
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
    e.stopPropagation()
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

  // which voice is speaking for the Luma right now
  const voiceLabel = !settings.optionalCloudAi
    ? "Haven's own"
    : settings.cloudEndpoint
      ? `your service (${new URL(settings.cloudEndpoint, 'http://x').host || 'configured'})`
      : "Haven's own — no endpoint set"

  // what furniture is within arm's reach right now (contextual prompts)
  const nearFixture = sim && playerC?.alive
    ? fixtureAt(sim.fixtures, playerC.pos.x, playerC.pos.z)
    : undefined

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

      {/* touch controls: LEFT half = move (floating joystick, invisible),
          RIGHT half = look. The move zone stops propagation so touching it
          NEVER moves the camera. */}
      {fpOn && isTouch && (
        <>
          <div
            className="fp-move"
            data-move
            onPointerDown={onJoyPointerDown}
            onPointerMove={onJoyPointerMove}
            onPointerUp={onJoyPointerUp}
            onPointerCancel={onJoyPointerUp}
            onLostPointerCapture={() => {
              joyPointerRef.current = null
              applyJoystick(0, 0)
            }}
          />
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
        <h1 className="logo">Luma Haven</h1>
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
          {/* market: goods + price trends (the economy, made legible) */}
          <button
            type="button"
            className="speed-btn market-btn"
            data-market-btn
            aria-pressed={marketOpen}
            aria-label={marketOpen ? 'Close market prices' : 'Open market prices'}
            onClick={() => setMarketOpen((o) => !o)}
          >
            📈
          </button>
          {/* teach words: type a word for a concept — creatures nearby learn it */}
          <button
            type="button"
            className="speed-btn teach-btn"
            data-teach-btn
            aria-pressed={teachOpen}
            aria-label={teachOpen ? 'Close word teaching' : 'Teach creatures a word'}
            onClick={() => setTeachOpen((o) => !o)}
          >
            💬
          </button>
          {/* talk: typed natural language with nearby Luma */}
          <button
            type="button"
            className="speed-btn talk-btn"
            data-talk-btn
            aria-pressed={chatOpen}
            aria-label={chatOpen ? 'Close talk' : 'Talk to a Luma'}
            onClick={() => setChatOpen((o) => !o)}
          >
            🗨️
          </button>
          {/* mind inspector */}
          <button
            type="button"
            className="speed-btn inspect-btn"
            data-inspect-btn
            aria-pressed={inspectOpen}
            aria-label={inspectOpen ? 'Close mind inspector' : 'Open mind inspector'}
            onClick={() => setInspectOpen((o) => !o)}
          >
            🧠
          </button>
          {/* controls card */}
          <button
            type="button"
            className="speed-btn help-btn"
            data-help-btn
            aria-pressed={helpOpen}
            aria-label={helpOpen ? 'Close controls' : 'Show controls'}
            onClick={() => setHelpOpen((o) => !o)}
          >
            ❔
          </button>
          {/* society pulse */}
          <button
            type="button"
            className="speed-btn society-btn"
            data-society-btn
            aria-pressed={societyOpen}
            aria-label={societyOpen ? 'Close society panel' : 'Open society panel'}
            onClick={() => setSocietyOpen((o) => !o)}
          >
            🏘️
          </button>
          {/* settings */}
          <button
            type="button"
            className="speed-btn settings-btn"
            data-settings-btn
            aria-pressed={settingsOpen}
            aria-label={settingsOpen ? 'Close settings' : 'Open settings'}
            onClick={() => setSettingsOpen((o) => !o)}
          >
            ⚙️
          </button>
          {/* view toggle: first-person ↔ top view */}
          <button
            type="button"
            className="view-toggle"
            data-view-mode={viewMode}
            aria-pressed={viewMode === 'first-person'}
            aria-label={viewMode === 'observer' ? 'Enter first-person view' : 'Switch to top view'}
            onClick={toggleViewMode}
          >
            <span className="dock-emoji">{viewMode === 'observer' ? '🧍' : '🗺️'}</span>
            <span className="dock-label">{viewMode === 'observer' ? 'be' : 'top'}</span>
          </button>
        </div>
      </header>

      {/* market popover: current price + ▲▼ trend per good, and the market day */}
      {marketOpen && sim && (
        <section className="market" data-market aria-label="market prices">
          <header className="market-head">
            <h2>📈 market</h2>
            <span className="market-day" data-market-day>
              day {sim.economy.day}
            </span>
            <button
              type="button"
              className="market-close"
              data-market-close
              aria-label="Close market prices"
              onClick={() => setMarketOpen(false)}
            >
              ✕
            </button>
          </header>
          <ul className="market-list" data-market-list>
            {GOODS.map((id) => {
              const trend = priceTrend(sim.economy, id)
              return (
                <li key={id} className="market-row" data-market-good={id}>
                  <span className="market-good">
                    {ITEM_EMOJI[id as ItemId] ?? '🪓'} {id}
                  </span>
                  <span className="market-price">🪙 {marketPrice(sim.economy, id)}</span>
                  <span
                    className={`market-trend market-trend-${trend}`}
                    data-market-trend={trend}
                    aria-label={trend === 'up' ? 'price rising' : trend === 'down' ? 'price falling' : 'price flat'}
                  >
                    {trend === 'up' ? '▲' : trend === 'down' ? '▼' : '—'}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* teach popover: pick a concept + type a word — creatures nearby learn it */}
      {teachOpen && sim && (
        <section className="teach" data-teach aria-label="teach a word">
          <header className="teach-head">
            <h2>💬 teach a word</h2>
            <button
              type="button"
              className="teach-close"
              data-teach-close
              aria-label="Close word teaching"
              onClick={() => setTeachOpen(false)}
            >
              ✕
            </button>
          </header>
          <div className="teach-concepts" data-teach-concepts role="group" aria-label="pick a concept">
            {CONCEPTS.map((c) => (
              <button
                key={c}
                type="button"
                className={`chip teach-concept ${teachConcept === c ? 'active' : ''}`}
                data-teach-concept={c}
                aria-pressed={teachConcept === c}
                onClick={() => setTeachConcept(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="teach-row">
            <input
              className="teach-input"
              data-teach-word
              type="text"
              maxLength={12}
              placeholder={`word for "${teachConcept}"…`}
              value={teachWord}
              onChange={(e) => setTeachWord(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitTeach()
              }}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="dock-btn teach-submit"
              data-teach-submit
              disabled={!teachWord.trim()}
              onClick={submitTeach}
            >
              teach
            </button>
          </div>
          {playerC && playerC.language && Array.from(playerC.language.vocab.entries()).length > 0 && (
            <div className="teach-vocab" data-teach-vocab aria-label="words you know">
              {Array.from(playerC.language.vocab.entries()).map(([concept, entry]) => (
                <span key={concept} className="chip vocab-chip" data-vocab={concept}>
                  {concept} <b>{entry.word}</b>
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* natural-language talk panel */}
      {chatOpen && sim && (
        <section className="talk" data-talk aria-label="talk with luma">
          <header className="talk-head">
            <h2>🗨️ talk{selected ? ` · ${selected.name}` : ''}</h2>
            <button type="button" className="talk-close" data-talk-close aria-label="Close talk" onClick={() => setChatOpen(false)}>✕</button>
          </header>
          <p className="talk-hint">
            Type naturally — greet, ask how they feel, ask to buy bread, ask for help, warn them about someone.
          </p>
          <p className="talk-voice" data-talk-voice>
            voice: <b>{voiceLabel}</b>
          </p>
          <div className="talk-row">
            <input
              className="talk-input"
              data-talk-input
              type="text"
              maxLength={120}
              placeholder={selected ? `say something to ${selected.name}…` : 'say something to the nearest Luma…'}
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitChat()
              }}
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" className="dock-btn talk-submit" data-talk-submit disabled={!chatText.trim()} onClick={submitChat}>
              say
            </button>
          </div>
          {chatReply && (
            <p className="talk-reply" data-talk-reply>{chatReply}</p>
          )}
        </section>
      )}

      {/* mind inspector */}
      {inspectOpen && sim && selected && (
        <InspectorPanel report={inspectCreature(sim, selected)} onClose={() => setInspectOpen(false)} />
      )}

      {/* society pulse */}
      {societyOpen && sim && (
        <SocietyPanel
          report={inspectSociety(sim)}
          onClose={() => {
            markSeen(sim.stories, sim.time)
            setSocietyOpen(false)
          }}
        />
      )}

      {/* performance overlay (F3) */}
      {perfOverlay && sim && (
        <section className="perf" data-perf-overlay aria-label="performance overlay">
          <div>frame {perfMs.toFixed(1)} ms</div>
          <div>sim {sim.lod.lastCpuMs.toFixed(1)} ms</div>
          <div>luma {sim.creatures.filter((c) => c.alive).length}/{settings.populationCap}</div>
          <div>ai batch {settings.aiBatchSize} · {settings.quality}</div>
          <div>tick {sim.time}</div>
          <div className="perf-split" data-perf-phases>
            {phaseBreakdown(sim.lod).map((p) => (
              <div key={p.phase}>
                {p.phase.padEnd(8, '\u00a0')} {p.ms.toFixed(2)} ms {Math.round(p.share * 100)}%
              </div>
            ))}
          </div>
        </section>
      )}

      {saveNote && (
        <div className="save-note" data-save-note role="status">{saveNote}</div>
      )}

      {/* controls card — shown on a first visit, and from the ? button after */}
      {helpOpen && (
        <section className="help" data-help aria-label="controls">
          <header className="help-head">
            <h2>Luma Haven</h2>
            <button
              type="button"
              className="help-close"
              data-help-close
              aria-label="Close controls"
              onClick={() => {
                setHelpOpen(false)
                try {
                  localStorage.setItem('luma-haven-seen-help', '1')
                } catch {
                  /* private mode — the card just shows again next time */
                }
              }}
            >
              ✕
            </button>
          </header>
          <p className="help-intro">
            You live here too. The Luma around you have their own needs, families, and
            opinions — including about you.
          </p>
          <dl className="help-list">
            <dt>W A S D</dt><dd>walk · click 🔒 to capture the mouse for looking</dd>
            <dt>click a Luma</dt><dd>select them and open a conversation</dd>
            <dt>🗨️</dt><dd>say anything: greet, ask how they are, ask to buy bread, ask for help</dd>
            <dt>🧠</dt><dd>why did they do that — needs, beliefs, bonds, their life so far</dd>
            <dt>🏘️</dt><dd>what the settlement is talking about, and what changed while you were away</dd>
            <dt>🤝 ⤵️</dt><dd>hand an item over, or drop it</dd>
            <dt>😴 🚪 🫳</dt><dd>appear when a bed, door, or chest is within reach</dd>
            <dt>⚙️ · F3</dt><dd>settings and saves · performance overlay</dd>
          </dl>
          <p className="help-keys">
            Keys: <b>T</b> talk · <b>I</b> inspect · <b>H</b> Haven · <b>M</b> market ·
            <b> G</b> settings · <b>?</b> this card · <b>Space</b> pause · <b>1 2 3</b> speed ·
            <b> Esc</b> close
          </p>
        </section>
      )}

      {/* settings + performance */}
      {settingsOpen && (
        <section className="settings" data-settings aria-label="settings">
          <header className="settings-head">
            <h2>⚙️ settings</h2>
            <button type="button" className="settings-close" data-settings-close aria-label="Close settings" onClick={() => setSettingsOpen(false)}>✕</button>
          </header>
          <h3 className="settings-section">your world</h3>
          <div className="settings-row settings-saves" data-save-slots>
            {[1, 2, 3].map((slot) => (
              <span key={slot} className="slot-pair">
                <button type="button" className="chip" data-save-slot={slot} onClick={() => manualSave(slot)}>
                  save {slot}
                </button>
                <button
                  type="button"
                  className="chip"
                  data-load-slot={slot}
                  disabled={!hasWorldSlot(slot)}
                  onClick={() => loadSlot(slot)}
                >
                  load {slot}
                </button>
              </span>
            ))}
          </div>
          <div className="settings-row">
            <button type="button" className="chip" data-export-save onClick={exportSave}>
              export to a file
            </button>
            <label className="chip" data-import-save>
              import a file
              <input
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) importSave(file)
                  e.target.value = ''
                }}
              />
            </label>
            <button type="button" className="chip" data-manual-save onClick={() => manualSave()}>
              save now
            </button>
          </div>
          <h3 className="settings-section">performance</h3>
          <div className="settings-row">
            <span>quality</span>
            {(['low', 'medium', 'high'] as QualityPreset[]).map((q) => (
              <button
                key={q}
                type="button"
                className={`chip ${settings.quality === q ? 'active' : ''}`}
                data-quality={q}
                aria-pressed={settings.quality === q}
                onClick={() => setQuality(q)}
              >
                {q}
              </button>
            ))}
          </div>
          <label className="settings-row">
            <span>population cap</span>
            <input
              type="range"
              min={4}
              max={32}
              value={settings.populationCap}
              data-pop-cap
              onChange={(e) => updateSettings({ populationCap: Number(e.target.value) })}
            />
            <b>{settings.populationCap}</b>
          </label>
          <label className="settings-row">
            <span>AI batch</span>
            <input
              type="range"
              min={1}
              max={12}
              value={settings.aiBatchSize}
              data-ai-batch
              onChange={(e) => updateSettings({ aiBatchSize: Number(e.target.value) })}
            />
            <b>{settings.aiBatchSize}</b>
          </label>
          <label className="settings-row">
            <span>gentle mode</span>
            <input
              type="checkbox"
              checked={settings.gentleMode}
              data-gentle
              onChange={(e) => updateSettings({ gentleMode: e.target.checked })}
            />
          </label>
          <label className="settings-row">
            <span>own dialogue service</span>
            <input
              type="checkbox"
              checked={settings.optionalCloudAi}
              data-cloud-ai
              onChange={(e) => updateSettings({ optionalCloudAi: e.target.checked })}
            />
            <span className="settings-hint">off = the game's own voice</span>
          </label>
          {settings.optionalCloudAi && (
            <label className="settings-row">
              <span>endpoint</span>
              <input
                type="text"
                className="talk-input"
                data-cloud-endpoint
                placeholder="http://localhost:11434/haven"
                value={settings.cloudEndpoint}
                onChange={(e) => updateSettings({ cloudEndpoint: e.target.value.trim() })}
              />
            </label>
          )}
          <div className="settings-row" data-perf>
            <span>frame cost</span>
            <b>{perfMs.toFixed(1)} ms</b>
            <span className="settings-hint">target ~16ms for 60fps</span>
          </div>
          <label className="settings-row">
            <span>perf overlay (F3)</span>
            <input
              type="checkbox"
              checked={perfOverlay}
              data-perf-toggle
              onChange={(e) => setPerfOverlay(e.target.checked)}
            />
          </label>
        </section>
      )}

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
              <span key={id} className="player-inv-slot">
                <button
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
                <button
                  type="button"
                  className="player-inv-mini"
                  data-player-give={id}
                  aria-label={`give ${id} to the creature in front of you`}
                  title="give"
                  onClick={() => giveItemToNearby(id as ItemId)}
                >
                  🤝
                </button>
                <button
                  type="button"
                  className="player-inv-mini"
                  data-player-drop={id}
                  aria-label={`drop ${id}`}
                  title="drop"
                  onClick={() => dropPlayerItem(id as ItemId)}
                >
                  ⤵️
                </button>
              </span>
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
            {nearFixture && (
              <span className="fixture-actions" data-fixture-actions>
                <span className="fixture-label" data-fixture-kind={nearFixture.kind}>
                  {nearFixture.kind}
                </span>
                {nearFixture.kind === 'bed' && (
                  <button type="button" className="player-inv-item" data-fixture-rest onClick={() => useFixture('rest')}>
                    😴
                  </button>
                )}
                {nearFixture.kind === 'door' && (
                  <button type="button" className="player-inv-item" data-fixture-door onClick={() => useFixture('toggle')}>
                    🚪
                  </button>
                )}
                {nearFixture.kind === 'container' && (
                  <>
                    <button type="button" className="player-inv-item" data-fixture-take onClick={() => useFixture('take')}>
                      🫳
                    </button>
                    <button type="button" className="player-inv-item" data-fixture-store onClick={() => useFixture('store')}>
                      📦
                    </button>
                  </>
                )}
              </span>
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
