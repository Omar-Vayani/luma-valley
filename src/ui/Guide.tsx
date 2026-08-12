/** Guide — the controls, and the one idea behind the game. */

interface Props {
  onClose: () => void
}

const KEYS: Array<[string, string]> = [
  ['W A S D', 'walk'],
  ['Shift', 'jog'],
  ['Space', 'jump'],
  ['E', 'talk to a Luma · hold on a bush to pick berries'],
  ['F', 'offer a berry to whoever you are facing'],
  ['Left click', 'a hand on the head — they like it, and learn from it'],
  ['Right click', 'a swat — they will not forget it'],
  ['N', "open the mind of the Luma you are facing"],
  ['O', 'settings'],
  ['Esc', 'close a panel · release the mouse'],
]

export function Guide({ onClose }: Props): React.ReactElement {
  return (
    <div className="panel centred">
      <header>
        <h2>Luma Haven</h2>
        <span className="sub">a valley, and six minds in it</span>
        <span className="spacer" />
        <button className="close" onClick={onClose} aria-label="close">×</button>
      </header>

      <div className="body">
        <p className="hint">
          Each Luma is run by a small neural network with no scripted behaviour
          in it at all. They have drives that rise on their own, and they learn
          which of their actions make those drives fall. Feed one and it learns
          that you are worth going to. Hit one and it learns the opposite, and
          will keep its distance long after the bruise has gone.
        </p>
        <p className="hint">
          Words work the same way. A word heard while something is happening
          attaches itself to whatever the mind was doing at that moment, so you
          teach &ldquo;food&rdquo; by saying it while they eat. Press{' '}
          <kbd>N</kbd> to watch any of this happening.
        </p>

        <div className="keys">
          {KEYS.map(([key, what]) => (
            <div key={key} style={{ display: 'contents' }}>
              <kbd>{key}</kbd>
              <span>{what}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="footer">
        <span className="spacer" style={{ marginLeft: 'auto' }} />
        <button className="button primary" onClick={onClose}>Go outside</button>
      </div>
    </div>
  )
}
