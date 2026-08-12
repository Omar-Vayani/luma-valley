/**
 * Board — what Haven is asking for.
 *
 * Every line here was read off the simulation a moment ago: somebody is
 * genuinely hungry and genuinely broke, a shelf is genuinely empty. Taking one
 * on is optional, and letting it expire has the consequence it would have had
 * anyway, which is the difference between this and a quest log.
 */
import type { Sim } from '../../lab/sim'
import {
  abandonRequest, acceptRequest, MAX_ACTIVE, objectiveFor,
  type Request, type RequestBoard,
} from '../../game/requests'
import { Panel } from '../Panel'
import { Icon, type IconName } from '../Icon'

const GLYPH: Record<Request['kind'], IconName> = {
  feed: 'food', heal: 'heart', gift: 'star', company: 'mind', deliver: 'pack',
  restock: 'food', visit: 'map', mediate: 'village', mourn: 'journal',
}

export interface BoardProps {
  sim: Sim
  board: RequestBoard
  onClose: () => void
  onChanged: () => void
}

export function Board({ sim, board, onClose, onChanged }: BoardProps): React.ReactElement {
  return (
    <Panel
      title="The Notice Board"
      hint={`${board.active.length} of ${MAX_ACTIVE} taken on`}
      onClose={onClose}
      testId="board"
    >
      <h3 className="section">You are doing</h3>
      {board.active.length === 0 && <p className="muted small">Nothing. Take something on below.</p>}
      {board.active.map((r) => (
        <div className="request" key={r.id} data-request={r.id}>
          <span className="mark"><Icon name={GLYPH[r.kind]} size={16} /></span>
          <div className="grow">
            <h4>{r.title}</h4>
            <p>{objectiveFor(r)}</p>
            {r.coins > 0 && <div className="reward">{r.coins} coins on completion</div>}
          </div>
          <button className="btn" onClick={() => { abandonRequest(board, r.id); onChanged() }}>
            Put back
          </button>
        </div>
      ))}

      <h3 className="section">Asked for</h3>
      {board.open.length === 0 && (
        <p className="muted small">
          Nothing pinned up. Haven only asks when it actually needs something — come back
          when somebody is in trouble.
        </p>
      )}
      {board.open.map((r) => {
        const giver = sim.creatureById(r.giverId)
        return (
          <div className="request" key={r.id} data-request={r.id}>
            <span className="mark"><Icon name={GLYPH[r.kind]} size={16} /></span>
            <div className="grow">
              <h4>{r.title}</h4>
              <p>{r.detail}</p>
              <div className="reward">
                {r.coins > 0 ? `${r.coins} coins · ` : ''}
                standing +{Math.round(r.standing * 100)}
                {giver ? ` · ${giver.name} is ${giver.psyche.mood}` : ''}
              </div>
            </div>
            <button
              className="btn primary"
              disabled={board.active.length >= MAX_ACTIVE}
              onClick={() => { acceptRequest(board, r.id); onChanged() }}
            >
              Take it
            </button>
          </div>
        )
      })}

      {board.closed.length > 0 && (
        <>
          <h3 className="section">Settled</h3>
          {board.closed.slice(0, 8).map((c) => (
            <p className="small" key={c.id} style={{ color: c.ok ? 'var(--good)' : 'var(--faint)' }}>
              {c.ok ? '✓' : '✕'} {c.title}
            </p>
          ))}
        </>
      )}
    </Panel>
  )
}
