/**
 * Hud — everything drawn over the world while you are playing.
 *
 * Rules it follows: nothing sits in the middle of the screen except the
 * crosshair and what the crosshair is telling you; the corners hold state you
 * glance at, not read; and anything that needs reading is a panel, not a HUD
 * element.
 */
import { memo } from 'react'
import type { ItemId } from '../lab/inventory'
import { itemName } from '../lab/items'
import type { HudSnapshot } from '../render/world-view'
import { itemGradient } from './item-visuals'
import { Icon, type IconName } from './Icon'

export interface ToastItem {
  id: number
  text: string
  kind: 'info' | 'good' | 'bad' | 'story'
  leaving?: boolean
}

export interface HudProps {
  hud: HudSnapshot
  hotbar: (ItemId | null)[]
  counts: Partial<Record<ItemId, number>>
  selected: number
  onSelect: (index: number) => void
  toasts: ToastItem[]
  regionTitle: { name: string; key: number } | null
  objectives: string[]
  standing: { title: string; value: number }
  showPerf: boolean
  onOpen: (panel: PanelId) => void
  openPanel: PanelId | null
}

export type PanelId =
  | 'talk' | 'pack' | 'journal' | 'society' | 'mind' | 'board' | 'atlas' | 'settings' | 'guide'

const TOOLS: { id: PanelId; icon: IconName; key: string; title: string }[] = [
  { id: 'board', icon: 'board', key: 'R', title: 'Requests' },
  { id: 'pack', icon: 'pack', key: 'Tab', title: 'Pack & crafting' },
  { id: 'journal', icon: 'journal', key: 'J', title: 'Journal' },
  { id: 'society', icon: 'village', key: 'H', title: 'Haven' },
  { id: 'mind', icon: 'mind', key: 'I', title: 'Mind' },
  { id: 'atlas', icon: 'map', key: 'M', title: 'Map' },
  { id: 'settings', icon: 'settings', key: 'O', title: 'Settings' },
  { id: 'guide', icon: 'help', key: 'F1', title: 'Controls' },
]

function Crosshair({ active, hold }: { active: boolean; hold: number }): React.ReactElement {
  const circumference = 2 * Math.PI * 14
  return (
    <div className={`crosshair${active ? ' active' : ''}`}>
      <i className="dot" />
      <i className="arm up" />
      <i className="arm down" />
      <i className="arm left" />
      <i className="arm right" />
      {hold > 0 && (
        <svg className="ring" viewBox="0 0 34 34">
          <circle cx="17" cy="17" r="14" stroke="rgba(0,0,0,0.45)" />
          <circle
            cx="17" cy="17" r="14" stroke="#e8a44c"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - hold)}
          />
        </svg>
      )}
    </div>
  )
}

function Vitals({ hud, standing }: { hud: HudSnapshot; standing: HudProps['standing'] }): React.ReactElement {
  return (
    <div className="vitals">
      <div className="meter health">
        <span className="glyph"><Icon name="heart" size={13} /></span>
        <span className="track"><span className="fill" style={{ width: `${hud.health * 100}%` }} /></span>
      </div>
      <div className="meter food">
        <span className="glyph"><Icon name="food" size={13} /></span>
        <span className="track"><span className="fill" style={{ width: `${hud.hunger * 100}%` }} /></span>
      </div>
      <div className="standing">
        standing <b>{standing.title}</b>
      </div>
    </div>
  )
}

function Hotbar({
  hotbar, counts, selected, onSelect,
}: Pick<HudProps, 'hotbar' | 'counts' | 'selected' | 'onSelect'>): React.ReactElement {
  const held = hotbar[selected]
  return (
    <>
      {held && (
        <div className="held-name">
          {itemName(held)} · {counts[held] ?? 0}
        </div>
      )}
      <div className="hotbar" data-hotbar>
        {hotbar.map((item, i) => {
          const count = item ? counts[item] ?? 0 : 0
          return (
            <button
              key={i}
              className={`slot${i === selected ? ' on' : ''}${!item || !count ? ' empty' : ''}`}
              onClick={() => onSelect(i)}
              data-slot={i}
              aria-label={item ? itemName(item) : `empty slot ${i + 1}`}
            >
              <span className="n">{i + 1}</span>
              {item && count > 0 && (
                <>
                  <span className="icon" style={{ background: itemGradient(item) }} />
                  <span className="count">{count}</span>
                </>
              )}
            </button>
          )
        })}
      </div>
    </>
  )
}

function Perf({ hud }: { hud: HudSnapshot }): React.ReactElement {
  return (
    <div className="perf" data-perf-overlay>
      <div><b>{hud.fps.toFixed(0)}</b> fps · <b>{hud.frameMs.toFixed(1)}</b> ms</div>
      <div>sim <b>{hud.simMs.toFixed(1)}</b> ms · pop <b>{hud.population}</b></div>
      <div>draws <b>{hud.draws}</b> · tris <b>{(hud.triangles / 1000).toFixed(0)}k</b></div>
    </div>
  )
}

function HudView(props: HudProps): React.ReactElement {
  const { hud, toasts, regionTitle, objectives, standing, showPerf, onOpen, openPanel } = props
  const dialPos = Math.min(100, Math.max(0, timeFraction(hud) * 100))

  return (
    <div className="hud" data-hud>
      <Crosshair active={!!hud.prompt} hold={hud.hold} />

      {hud.gaze && !hud.prompt && (
        <div className="gaze">
          <div className="name">{hud.gaze.name}</div>
          <div className="sub">
            {hud.gaze.job ? `${hud.gaze.job} · ` : ''}{hud.gaze.action}
          </div>
          <div className="bar"><span style={{ width: `${hud.gaze.health * 100}%` }} /></div>
        </div>
      )}

      {hud.prompt && (
        <div className="prompt" data-prompt>
          <span className="keycap">{hud.promptKey}</span>
          <span>{hud.prompt}</span>
        </div>
      )}

      <div className="status">
        <div className="place">{hud.region ?? 'The Valley'}</div>
        <div className="clock">
          <span className="sun-dial"><i style={{ left: `${dialPos}%` }} /></span>
          <b>{hud.time}</b>
          <span>{hud.phase}</span>
          <span className="faint">day {hud.day}</span>
        </div>
      </div>

      {showPerf && <Perf hud={hud} />}

      <div className="toolbar">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tool${openPanel === t.id ? ' on' : ''}`}
            title={`${t.title} (${t.key})`}
            onClick={() => onOpen(t.id)}
            data-tool={t.id}
            aria-label={t.title}
          >
            <Icon name={t.icon} />
          </button>
        ))}
      </div>

      {objectives.length > 0 && (
        <div className="tracker" data-tracker>
          <h4>Doing</h4>
          <ul>
            {objectives.map((o) => <li key={o}>{o}</li>)}
          </ul>
        </div>
      )}

      <Vitals hud={hud} standing={standing} />
      <Hotbar {...props} />

      <div className="toasts" data-toasts>
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}${t.leaving ? ' leaving' : ''}`}>{t.text}</div>
        ))}
      </div>

      {regionTitle && (
        <div className="region-title" key={regionTitle.key}>
          <h2>{regionTitle.name}</h2>
          <span />
        </div>
      )}
    </div>
  )
}

/** Where the sun sits on the little dial, from the clock string. */
function timeFraction(hud: HudSnapshot): number {
  const [h, m] = hud.time.split(':').map(Number)
  return ((h + m / 60) % 24) / 24
}

export const Hud = memo(HudView)
