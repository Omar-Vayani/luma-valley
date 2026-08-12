/**
 * Settings — graphics, simulation, and the saves.
 *
 * The quality presets exist because the same build should be pleasant on a
 * gaming laptop and survivable on a tablet; everything else here is the
 * simulation's own knobs, which were always meant to be visible.
 */
import { useRef, useState } from 'react'
import type { Sim } from '../../lab/sim'
import { applyPreset, saveSettings, type QualityPreset } from '../../lab/settings'
import { saveSim, loadSim, type LabSave } from '../../lab/save'
import { hasWorldSlot, loadWorldBlob, saveWorldBlob } from '../../lab/creature-storage'
import type { PlayerProgress } from '../../game/progress'
import { Panel } from '../Panel'

export interface SettingsProps {
  sim: Sim
  progress: PlayerProgress
  onClose: () => void
  onQuality: (q: QualityPreset) => void
  onSensitivity: (v: number) => void
  sensitivity: number
  onToast: (text: string, kind: 'info' | 'good' | 'bad') => void
  onReload: (save: LabSave) => void
  sound: boolean
  onSound: (on: boolean) => void
}

const QUALITIES: QualityPreset[] = ['low', 'medium', 'high', 'ultra']

export function Settings({
  sim, progress, onClose, onQuality, onSensitivity, sensitivity, onToast, onReload,
  sound, onSound,
}: SettingsProps): React.ReactElement {
  const [, force] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const redraw = (): void => force((n) => n + 1)

  const set = <K extends keyof Sim['settings']>(key: K, value: Sim['settings'][K]): void => {
    sim.settings[key] = value
    saveSettings(sim.settings)
    redraw()
  }

  return (
    <Panel title="Settings" onClose={onClose} testId="settings" hint="saved as you change them">
      <h3 className="section">Picture</h3>
      <div className="setting">
        <label>
          Quality
          <small>shadow detail, draw distance, ground cover, post-processing</small>
        </label>
        <div className="segmented" data-quality>
          {QUALITIES.map((q) => (
            <button
              key={q}
              className={sim.settings.quality === q ? 'on' : ''}
              onClick={() => {
                Object.assign(sim.settings, applyPreset(sim.settings, q))
                saveSettings(sim.settings)
                onQuality(q)
                redraw()
              }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
      <div className="setting">
        <label>Name tags<small>floating names over nearby Luma</small></label>
        <input
          type="checkbox" checked={sim.settings.showLabels}
          onChange={(e) => set('showLabels', e.target.checked)}
        />
      </div>
      <div className="setting">
        <label>Particles<small>hearts, coins, chips of stone</small></label>
        <input
          type="checkbox" checked={sim.settings.showParticles}
          onChange={(e) => set('showParticles', e.target.checked)}
        />
      </div>
      <div className="setting">
        <label>Sound</label>
        <input type="checkbox" checked={sound} onChange={(e) => onSound(e.target.checked)} data-sound />
      </div>

      <h3 className="section">Controls</h3>
      <div className="setting">
        <label>Mouse sensitivity</label>
        <input
          type="range" min={0} max={1} step={0.01} value={sensitivity}
          onChange={(e) => onSensitivity(Number(e.target.value))}
        />
      </div>

      <h3 className="section">The settlement</h3>
      <div className="setting">
        <label>
          Population cap
          <small>births pause at this many living Luma</small>
        </label>
        <input
          type="range" min={6} max={40} step={1} value={sim.settings.populationCap}
          onChange={(e) => set('populationCap', Number(e.target.value))}
          data-population-cap
        />
        <b style={{ width: 26, textAlign: 'right' }}>{sim.settings.populationCap}</b>
      </div>
      <div className="setting">
        <label>
          Minds per tick
          <small>how many get a full re-think each step; higher is smarter and costlier</small>
        </label>
        <input
          type="range" min={1} max={12} step={1} value={sim.settings.aiBatchSize}
          onChange={(e) => set('aiBatchSize', Number(e.target.value))}
        />
        <b style={{ width: 26, textAlign: 'right' }}>{sim.settings.aiBatchSize}</b>
      </div>
      <div className="setting">
        <label>
          Gentle mode
          <small>nobody starves and nobody is killed</small>
        </label>
        <input
          type="checkbox" checked={sim.settings.gentleMode}
          onChange={(e) => set('gentleMode', e.target.checked)}
        />
      </div>
      <div className="setting">
        <label>
          Newcomers
          <small>travellers settle in Haven when the population thins</small>
        </label>
        <input
          type="checkbox" checked={sim.settings.allowNewcomers}
          onChange={(e) => set('allowNewcomers', e.target.checked)}
        />
      </div>

      <h3 className="section">Voice</h3>
      <div className="setting">
        <label>
          Optional cloud dialogue
          <small>never required; the settlement has its own voice and works offline</small>
        </label>
        <input
          type="checkbox" checked={sim.settings.optionalCloudAi}
          onChange={(e) => set('optionalCloudAi', e.target.checked)}
          data-cloud-ai
        />
      </div>
      {sim.settings.optionalCloudAi && (
        <div className="setting">
          <label>Endpoint</label>
          <input
            className="field" style={{ width: 260 }}
            value={sim.settings.cloudEndpoint}
            onChange={(e) => set('cloudEndpoint', e.target.value)}
            data-cloud-endpoint
          />
        </div>
      )}

      <h3 className="section">Saves</h3>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }} data-save-slots>
        {[1, 2, 3].map((slot) => (
          <span key={slot} className="row" style={{ gap: 4 }}>
            <button
              className="btn"
              onClick={() => {
                saveWorldBlob(JSON.stringify(saveSim(sim)), slot)
                onToast(`Saved to slot ${slot}.`, 'good')
                redraw()
              }}
            >
              Save {slot}
            </button>
            <button
              className="btn"
              disabled={!hasWorldSlot(slot)}
              onClick={() => {
                const raw = loadWorldBlob(slot)
                if (!raw) return
                onReload(JSON.parse(raw) as LabSave)
                onToast(`Loaded slot ${slot}.`, 'good')
              }}
            >
              Load
            </button>
          </span>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8, gap: 6 }}>
        <button
          className="btn"
          data-export-save
          onClick={() => {
            const blob = new Blob(
              [JSON.stringify({ world: saveSim(sim), progress })],
              { type: 'application/json' },
            )
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `haven-day${Math.floor(sim.time / 1200) + 1}.luma.json`
            a.click()
            URL.revokeObjectURL(url)
          }}
        >
          Export
        </button>
        <button className="btn" data-import-save onClick={() => fileRef.current?.click()}>Import</button>
        <input
          ref={fileRef} type="file" accept=".json,.luma.json" hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            try {
              const parsed = JSON.parse(await file.text()) as { world?: LabSave } & LabSave
              const world = parsed.world ?? parsed
              loadSim(world)
              onReload(world)
              onToast('World imported.', 'good')
            } catch {
              onToast('That file did not read as a Haven save.', 'bad')
            }
          }}
        />
      </div>
    </Panel>
  )
}
