/**
 * Settings — graphics, sound and the one control the brief asked for by name:
 * how far away you can hear things.
 */
import type { QualityPreset, Settings as SettingsState } from '../render/quality'

interface Props {
  settings: SettingsState
  onChange: (next: SettingsState) => void
  onClose: () => void
  onNewValley: () => void
}

const PRESETS: QualityPreset[] = ['low', 'medium', 'high']

export function Settings({ settings, onChange, onClose, onNewValley }: Props): React.ReactElement {
  const set = <K extends keyof SettingsState>(key: K, value: SettingsState[K]): void => {
    onChange({ ...settings, [key]: value })
  }

  return (
    <div className="panel centred">
      <header>
        <h2>Settings</h2>
        <span className="spacer" />
        <button className="close" onClick={onClose} aria-label="close">×</button>
      </header>

      <div className="body">
        <div className="field">
          <span>Graphics</span>
          <div className="segmented">
            {PRESETS.map((p) => (
              <button
                key={p}
                className={settings.quality === p ? 'on' : ''}
                onClick={() => set('quality', p)}
              >
                {p}
              </button>
            ))}
          </div>
          <span className="readout" />
        </div>

        <div className="field">
          <span>Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.volume}
            onChange={(e) => set('volume', Number(e.target.value))}
          />
          <span className="readout">{Math.round(settings.volume * 100)}%</span>
        </div>

        <div className="field">
          <span>Hearing range</span>
          <input
            type="range"
            min={6}
            max={60}
            step={1}
            value={settings.hearingRange}
            onChange={(e) => set('hearingRange', Number(e.target.value))}
          />
          <span className="readout">{settings.hearingRange} m</span>
        </div>
        <p className="hint">
          Nothing further away than this is audible at all, and everything
          inside it fades with distance. Turn it down if the hamlet is busier
          than you want it to be.
        </p>

        <div className="field">
          <span>Look sensitivity</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.sensitivity}
            onChange={(e) => set('sensitivity', Number(e.target.value))}
          />
          <span className="readout">{Math.round(settings.sensitivity * 100)}%</span>
        </div>

        <div className="field">
          <span>Names</span>
          <div className="segmented">
            <button className={settings.showNames ? 'on' : ''} onClick={() => set('showNames', true)}>
              shown
            </button>
            <button className={!settings.showNames ? 'on' : ''} onClick={() => set('showNames', false)}>
              hidden
            </button>
          </div>
          <span className="readout" />
        </div>
      </div>

      <div className="footer">
        <button className="button" onClick={onNewValley}>Start a new valley</button>
        <span className="spacer" style={{ marginLeft: 'auto' }} />
        <button className="button primary" onClick={onClose}>Done</button>
      </div>
    </div>
  )
}
