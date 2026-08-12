/**
 * Hud — three small things in the corners, and a dot in the middle.
 *
 * The old build boxed the screen in with bars, a hotbar, a notice feed and
 * eight panel buttons, which is most of why it felt agitated. What is left is
 * the time, what you are carrying, who is near you, and what pressing a key
 * would do.
 */
import type { HudSnapshot } from '../render/view'

export type PanelId = 'chat' | 'mind' | 'settings' | 'guide' | null

interface Props {
  hud: HudSnapshot
  toasts: Array<{ id: number; text: string }>
  onOpen: (panel: PanelId) => void
  onSelect: (id: number) => void
}

export function Hud({ hud, toasts, onOpen, onSelect }: Props): React.ReactElement {
  const { gaze } = hud
  const active = gaze.kind !== 'none' && gaze.prompt.length > 0

  return (
    <div className="hud">
      <div className={`crosshair${active && gaze.inReach ? ' active' : ''}`}>
        <div className="dot" />
        {gaze.prompt && <div className="prompt">{gaze.prompt}</div>}
      </div>

      <div className="corner top-left">
        <span className="clock">{hud.clock}</span>
        <span className="berries">
          <span className="berry-dot" />
          {hud.berries}
        </span>
      </div>

      <div className="corner top-right">
        <button className="icon-button" title="Settings (O)" onClick={() => onOpen('settings')}>
          ⚙
        </button>
        <button className="icon-button" title="Controls (F1)" onClick={() => onOpen('guide')}>
          ?
        </button>
      </div>

      {hud.nearby.length > 0 && (
        <div className="corner bottom-left">
          <span className="hud-title">Nearby</span>
          {hud.nearby.map((c) => (
            <button
              key={c.id}
              className="nearby-row"
              onClick={() => onSelect(c.id)}
              style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left' }}
            >
              <span className="swatch" style={{ background: c.mood }} />
              {c.name}
              {c.alarm > 0.35 && <span className="alarm">!</span>}
              <span className="distance">{c.distance.toFixed(0)}m</span>
            </button>
          ))}
        </div>
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>{t.text}</div>
        ))}
      </div>
    </div>
  )
}
