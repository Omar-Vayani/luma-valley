/**
 * Guide — the controls, and the shortest possible explanation of the point.
 */
import { Panel } from '../Panel'

const CONTROLS: [string, string][] = [
  ['Move', 'W A S D'],
  ['Look', 'Mouse'],
  ['Sprint', 'Shift'],
  ['Jump', 'Space'],
  ['Crouch', 'Ctrl'],
  ['Interact / gather', 'E (hold for hard work)'],
  ['Give or use what you hold', 'Left click'],
  ['Set it down in the world', 'Right click'],
  ['Drop it', 'Q'],
  ['Choose a hotbar slot', '1 – 9 or scroll'],
  ['Pack and crafting', 'Tab'],
  ['Notice board', 'R'],
  ['Journal', 'J'],
  ['Haven', 'H'],
  ['Mind of whoever you are looking at', 'I'],
  ['Map', 'M'],
  ['Settings', 'O'],
  ['Pause / resume', 'P'],
  ['Speed', '1× 2× 5× with , and .'],
  ['Performance overlay', 'F3'],
  ['Close anything', 'Esc'],
]

export function Guide({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <Panel title="How to play" onClose={onClose} testId="guide">
      <p className="muted" style={{ marginTop: 0 }}>
        You are a person living in a valley with the Luma. They are not waiting for
        you: they get hungry, take jobs, fall in love, hold grudges, and die of old
        age whether or not you are watching. Nothing here is on rails.
      </p>
      <h3 className="section">Somewhere to start</h3>
      <ul className="muted small" style={{ lineHeight: 1.65, paddingLeft: 18 }}>
        <li>Walk to the plaza and read the notice board (<b>R</b>). Take one request.</li>
        <li>Pick berries off the hedges and cut grain in the western fields (<b>hold E</b>).</li>
        <li>Bake at a hearth, mix remedies at the apothecary (<b>Tab</b> → crafting).</li>
        <li>Give someone what they need (<b>left click</b> while looking at them).</li>
        <li>Ask a Luma why they did something, then check the answer in <b>I</b>.</li>
        <li>Follow the roads out. Twelve places in the valley have a story attached.</li>
      </ul>
      <h3 className="section">Controls</h3>
      <div className="keys" data-help-keys>
        {CONTROLS.map(([what, key]) => (
          <div key={what}><span>{what}</span><span className="keycap">{key}</span></div>
        ))}
      </div>
    </Panel>
  )
}
