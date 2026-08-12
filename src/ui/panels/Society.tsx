/**
 * Society — what kind of place Haven has become.
 *
 * The chronicle is the important half: every line is something the simulation
 * did, with the reason it did it, because a settlement that steals from itself
 * is only interesting if you can see why.
 */
import { useMemo, useState } from 'react'
import type { Sim } from '../../lab/sim'
import { inspectSociety } from '../../lab/inspect'
import { markSeen } from '../../lab/story'
import { Panel } from '../Panel'

export interface SocietyProps {
  sim: Sim
  onClose: () => void
}

export function Society({ sim, onClose }: SocietyProps): React.ReactElement {
  const [tab, setTab] = useState('chronicle')
  const report = useMemo(() => {
    const r = inspectSociety(sim)
    markSeen(sim.stories, sim.time)
    return r
  }, [sim])

  return (
    <Panel
      title="Haven"
      hint={`${report.population} living · ${report.households} households`}
      onClose={onClose}
      testId="society"
      tabs={[
        { id: 'chronicle', label: 'Chronicle' },
        { id: 'people', label: 'People' },
        { id: 'trade', label: 'Trade' },
      ]}
      activeTab={tab}
      onTab={setTab}
    >
      {tab === 'chronicle' && (
        <div data-society-stories>
          {report.sinceLastVisit.length > 0 && (
            <>
              <h3 className="section">Since you last looked</h3>
              <div data-society-since>
                {report.sinceLastVisit.map((s, i) => (
                  <div className="entry" key={i}><p>{s}</p></div>
                ))}
              </div>
            </>
          )}
          <h3 className="section">What Haven is talking about</h3>
          {report.stories.length === 0 && <p className="muted small">A quiet week.</p>}
          {report.stories.map((s, i) => (
            <div className="entry" key={i}>
              <p>
                {s.text}
                {s.because && <span className="story-because">because {s.because}</span>}
              </p>
            </div>
          ))}
          {report.overheard.length > 0 && (
            <>
              <h3 className="section">Overheard</h3>
              <div data-society-overheard>
                {report.overheard.slice(0, 8).map((o, i) => (
                  <p className="muted small" key={i} style={{ margin: '3px 0' }}>“{o}”</p>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'people' && (
        <div>
          <h3 className="section">How they expect each other to behave</h3>
          <div className="grid" data-society-norms style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
            {report.norms.map((n) => (
              <div className="card" key={n.key}>
                <div className="row small">
                  <span>{n.key}</span>
                  <b style={{ marginLeft: 'auto' }}>{Math.round(n.value * 100)}%</b>
                </div>
              </div>
            ))}
          </div>

          <h3 className="section">Work</h3>
          <div data-society-jobs>
            <p className="small">
              <span className="faint">staffed: </span>
              {report.staffed.length ? report.staffed.join(', ') : 'nobody has claimed a trade'}
            </p>
            {report.vacancies.length > 0 && (
              <p className="small"><span className="faint">unfilled: </span>{report.vacancies.join(', ')}</p>
            )}
            {report.leader && <p className="small"><span className="faint">most respected: </span>{report.leader}</p>}
          </div>

          {report.sharedWords.length > 0 && (
            <>
              <h3 className="section">Words they agree on</h3>
              <p className="small muted">
                {report.sharedWords.map((w) => `${w.word} = ${w.concept}`).join(' · ')}
              </p>
            </>
          )}
        </div>
      )}

      {tab === 'trade' && (
        <div>
          <h3 className="section">Empty shelves</h3>
          <div data-society-shortages>
            {report.shortages.length === 0 && <p className="muted small">Everything is in stock.</p>}
            {report.shortages.map((s) => (
              <p className="small" key={s.good}>
                <b>no {s.good}</b> <span className="story-because">{s.cause}</span>
              </p>
            ))}
          </div>

          <h3 className="section">Tills</h3>
          <div className="stat-grid">
            {report.tills.map((t) => (
              <div className="stat" key={t.tower}>
                <b>{Math.round(t.till)}</b>
                <span>{t.tower}</span>
              </div>
            ))}
          </div>

          <h3 className="section">The state of things</h3>
          <p className="small muted">
            Wealth spread {Math.round(report.inequality * 100)}% uneven · {report.debts} open debts ·{' '}
            {report.closed.length ? `closed now: ${report.closed.join(', ')}` : 'every door is open'}
          </p>
        </div>
      )}
    </Panel>
  )
}
