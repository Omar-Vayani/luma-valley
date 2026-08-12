/**
 * Journal — what you have found out about this valley.
 *
 * Three things live here: the places you have stood next to and what they
 * turned out to mean, the history the schoolhouse teaches, and a count of
 * what you have actually done. The point of the landmark pages is that Haven
 * is old and had reasons for its shape before you arrived.
 */
import { useState } from 'react'
import { LANDMARKS, TIMELINE } from '../../world/lore'
import { standingRank, type PlayerProgress } from '../../game/progress'
import { Panel } from '../Panel'

export interface JournalProps {
  progress: PlayerProgress
  tick: number
  onClose: () => void
}

export function Journal({ progress, tick, onClose }: JournalProps): React.ReactElement {
  const [tab, setTab] = useState('places')
  const rank = standingRank(progress.standing)
  const found = progress.discovered.length

  return (
    <Panel
      title="Journal"
      hint={`${found} of ${LANDMARKS.length} places found`}
      onClose={onClose}
      testId="journal"
      tabs={[
        { id: 'places', label: 'Places' },
        { id: 'history', label: 'History' },
        { id: 'you', label: 'You' },
      ]}
      activeTab={tab}
      onTab={setTab}
    >
      {tab === 'places' && (
        <div data-journal-places>
          {LANDMARKS.map((l) => {
            const known = progress.discovered.includes(l.id)
            return (
              <div className="entry" key={l.id}>
                <h4>{known ? l.name : '· · ·'}</h4>
                <p>{known ? l.text : 'Somewhere in the valley you have not walked yet.'}</p>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'history' && (
        <div data-journal-history>
          <p className="muted small" style={{ marginTop: 0 }}>
            As the schoolhouse tells it. Two centuries, six families that arrived out
            of nine that set out, and one flood everybody still plans around.
          </p>
          {TIMELINE.map((era) => (
            <div className="entry" key={era.title}>
              <span className="when">{era.yearsAgo} years ago</span>
              <h4>{era.title}</h4>
              <p>{era.text}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'you' && (
        <div data-journal-you>
          <div className="card" style={{ marginBottom: 14 }}>
            <b style={{ fontSize: 16 }}>{rank.title}</b>
            <p className="muted small" style={{ margin: '4px 0 0' }}>{rank.blurb}</p>
          </div>
          <div className="stat-grid">
            <div className="stat"><b>{progress.deeds}</b><span>requests kept</span></div>
            <div className="stat"><b>{progress.met.length}</b><span>Luma met</span></div>
            <div className="stat"><b>{progress.gathered}</b><span>things gathered</span></div>
            <div className="stat"><b>{progress.crafted}</b><span>things made</span></div>
            <div className="stat"><b>{found}</b><span>places found</span></div>
            <div className="stat"><b>{Math.floor(tick / 1200) + 1}</b><span>days in the valley</span></div>
          </div>

          <h3 className="section">Notes</h3>
          {progress.journal.length === 0 && <p className="muted small">Nothing written down yet.</p>}
          {progress.journal.slice(0, 40).map((e) => (
            <div className="entry" key={e.id}>
              <h4>{e.title}</h4>
              <p>{e.text}</p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
