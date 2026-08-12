/**
 * Mind — why did they just do that?
 *
 * The whole promise of the game is that behaviour has readable causes, so this
 * shows the actual scores the utility function produced, the beliefs feeding
 * it, and the relationships weighting it. Nothing here is generated prose:
 * it is the state the decision was made from.
 */
import { useMemo, useState } from 'react'
import type { Sim } from '../../lab/sim'
import { inspectCreature } from '../../lab/inspect'
import { Panel } from '../Panel'

export interface MindProps {
  sim: Sim
  creatureId: number | null
  onClose: () => void
  onPick: (id: number) => void
}

function Bar({ label, value, tint }: { label: string; value: number; tint?: string }): React.ReactElement {
  return (
    <div className="meter" style={{ marginBottom: 4 }}>
      <span style={{ width: 74, fontSize: 11 }}>{label}</span>
      <span className="track">
        <span
          className="fill"
          style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: tint ?? 'var(--cool)' }}
        />
      </span>
      <span className="faint" style={{ width: 30, textAlign: 'right', fontFamily: 'var(--mono)' }}>
        {Math.round(value * 100)}
      </span>
    </div>
  )
}

export function Mind({ sim, creatureId, onClose, onPick }: MindProps): React.ReactElement {
  const [tab, setTab] = useState('now')
  const creature = creatureId != null ? sim.creatureById(creatureId) : null
  const report = useMemo(
    () => (creature ? inspectCreature(sim, creature) : null),
    [sim, creature],
  )

  if (!report || !creature) {
    const living = sim.creatures.filter((c) => c.alive).slice(0, 24)
    return (
      <Panel title="Mind" onClose={onClose} testId="mind" hint="pick someone">
        <p className="muted small" style={{ marginTop: 0 }}>
          Look at a Luma and press I, or choose one here.
        </p>
        <div className="pack-grid">
          {living.map((c) => (
            <button className="pack-item" key={c.id} onClick={() => onPick(c.id)}>
              <span className="name">{c.name}</span>
              <span className="count">{c.action}</span>
            </button>
          ))}
        </div>
      </Panel>
    )
  }

  return (
    <Panel
      title={report.name}
      hint={`${report.stage} · ${report.mood} · ${report.standing}`}
      onClose={onClose}
      testId="mind"
      tabs={[
        { id: 'now', label: 'Right now' },
        { id: 'who', label: 'Who they are' },
        { id: 'body', label: 'Body & habits' },
        { id: 'ties', label: 'Ties' },
        { id: 'life', label: 'Life' },
      ]}
      activeTab={tab}
      onTab={setTab}
    >
      {tab === 'now' && (
        <div data-mind-now>
          <div className="card" style={{ marginBottom: 12 }}>
            <b>{report.action}</b>
            {report.intention && <span className="muted small"> — committed to {report.intention}</span>}
            <div className="small muted" style={{ marginTop: 6 }}>
              {report.reasoning.map((r, i) => <div key={i}>{r}</div>)}
            </div>
          </div>

          <h3 className="section">Needs</h3>
          {report.needs.map((n) => (
            <Bar
              key={n.key} label={n.key} value={n.value}
              tint={n.value < 0.3 ? 'var(--bad)' : n.value > 0.7 ? 'var(--good)' : undefined}
            />
          ))}

          <h3 className="section">What it weighed</h3>
          <div data-mind-scores>
            {report.topScores.map((s) => (
              <Bar key={s.action} label={s.action} value={Math.min(1, s.score)} tint="var(--accent)" />
            ))}
          </div>

          {(report.illness > 0.05 || report.injury > 0.05 || report.intoxication > 0.05) && (
            <>
              <h3 className="section">Condition</h3>
              {report.illness > 0.05 && <Bar label="illness" value={report.illness} tint="var(--bad)" />}
              {report.injury > 0.05 && <Bar label="injury" value={report.injury} tint="var(--bad)" />}
              {report.intoxication > 0.05 && (
                <Bar label="intoxicated" value={report.intoxication} tint="#b06ad0" />
              )}
            </>
          )}

          <h3 className="section">How much of this is learned</h3>
          <Bar label="experience" value={report.learned} tint="var(--cool)" />
          <p className="small faint" style={{ marginTop: 2 }}>
            {report.learned < 0.05
              ? 'Acting almost entirely on instinct so far.'
              : report.learned < 0.4
                ? 'Beginning to have preferences of their own.'
                : 'Their own experience now outweighs a good deal of instinct.'}
          </p>
        </div>
      )}

      {tab === 'who' && (
        <div>
          <h3 className="section">Personality</h3>
          {report.personality.map((p) => <Bar key={p.key} label={p.key} value={p.value} />)}

          <h3 className="section">Feelings</h3>
          {report.emotions.filter((e) => e.value > 0.08).map((e) => (
            <Bar key={e.key} label={e.key} value={e.value} tint="var(--accent)" />
          ))}

          <h3 className="section">Habits</h3>
          <div data-mind-habits className="small muted">
            {report.habits.length === 0 && 'No settled routine yet.'}
            {report.habits.map((h) => (
              <span key={h.key} style={{ marginRight: 10 }}>{h.key} {Math.round(h.value * 100)}%</span>
            ))}
          </div>

          <h3 className="section">What they believe</h3>
          <div data-mind-beliefs>
            {report.beliefKeys.length === 0 && <p className="muted small">Nothing they would swear to.</p>}
            {report.beliefKeys.map((b) => (
              <p className="small" key={b.key} style={{ margin: '3px 0' }}>
                {b.key} <span className="faint">({Math.round(b.confidence * 100)}% sure, {b.source})</span>
              </p>
            ))}
          </div>
        </div>
      )}

      {tab === 'body' && (
        <div data-mind-body>
          <h3 className="section">Schooling</h3>
          <Bar label="education" value={report.education / 5} tint="var(--good)" />
          <p className="small faint" style={{ marginTop: 2 }}>
            {report.education === 0
              ? 'Never been to the schoolhouse.'
              : `${report.education} of 5. Earns about ${Math.round(report.education * 12)}% more for the same day's work.`}
          </p>

          <h3 className="section">Trade</h3>
          <p className="small muted">
            {report.role
              ? `Holds the ${report.role} role, and is paid out of that building's till.`
              : 'No claimed trade. Takes day work at the workyard when the belly demands it.'}
          </p>

          <h3 className="section">Habits</h3>
          {report.habitsOfSubstance.length === 0 && (
            <p className="muted small">Nothing they cannot put down.</p>
          )}
          {report.habitsOfSubstance.map((h) => (
            <div className="card" key={h.id} style={{ marginBottom: 6 }}>
              <div className="row">
                <b>{h.name}</b>
                <span className="faint small" style={{ marginLeft: 'auto' }}>
                  {h.since > 9000 ? 'not for a long while' : `${Math.round(h.since / 6)}s since the last`}
                </span>
              </div>
              <Bar label="dependence" value={h.dependence} tint="var(--bad)" />
              <Bar label="tolerance" value={h.tolerance} tint="#b06ad0" />
              <p className="small faint" style={{ margin: '4px 0 0' }}>
                {h.dependence > 0.5
                  ? 'Would spend the rent on it.'
                  : h.dependence > 0.25
                    ? 'Notices when there is none.'
                    : 'A taste, not yet a need.'}
                {h.tolerance > 0.4 ? ' Needs far more than they used to for the same evening.' : ''}
              </p>
            </div>
          ))}

          <h3 className="section">Words they have for things</h3>
          {report.vocabulary.length === 0 && (
            <p className="muted small">No words yet. Teach them one, or let them hear one.</p>
          )}
          <div className="row small" style={{ flexWrap: 'wrap', gap: '6px 12px' }} data-mind-vocabulary>
            {report.vocabulary.map((v) => (
              <span key={v.concept} title={`${Math.round(v.strength * 100)}% sure`}>
                <b style={{ color: 'var(--accent)' }}>{v.word}</b>
                <span className="faint"> = {v.concept}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {tab === 'ties' && (
        <div>
          <h3 className="section">Family</h3>
          <p className="small muted" data-mind-family>
            {report.family.partner ? `partner: ${report.family.partner}. ` : ''}
            {report.family.parents.length ? `parents: ${report.family.parents.join(', ')}. ` : ''}
            {report.family.children.length ? `children: ${report.family.children.join(', ')}.` : ''}
            {!report.family.partner && !report.family.parents.length && !report.family.children.length
              && 'No family in Haven.'}
          </p>

          <h3 className="section">Relationships</h3>
          {report.relationships.length === 0 && <p className="muted small">Keeps to themselves.</p>}
          {report.relationships.map((r) => (
            <div className="card" key={r.id} style={{ marginBottom: 6 }}>
              <div className="row"><b>{r.name}</b></div>
              <Bar label="trust" value={r.trust} />
              <Bar label="warmth" value={r.friend} tint="var(--good)" />
              {r.romance > 0.05 && <Bar label="romance" value={r.romance} tint="#e8637f" />}
            </div>
          ))}

          <h3 className="section">Owed</h3>
          <p className="small muted">
            Owes {Math.round(report.owes)} · owed {Math.round(report.owed)} · {report.wallet} in pocket,{' '}
            {report.banked} banked
          </p>
          {report.promises.length > 0 && (
            <div data-mind-promises>
              <h3 className="section">Promises made to them</h3>
              {report.promises.map((p, i) => <p className="small" key={i}>{p}</p>)}
            </div>
          )}
        </div>
      )}

      {tab === 'life' && (
        <div data-mind-life>
          {report.life.length === 0 && <p className="muted small">Nothing has happened to them yet.</p>}
          {report.life.map((e, i) => (
            <div className="entry" key={i}>
              <p>
                {e.text}
                {e.because && <span className="story-because">because {e.because}</span>}
              </p>
            </div>
          ))}
          <h3 className="section">Recently said</h3>
          {report.recentTalk.map((t, i) => (
            <p className="small muted" key={i} style={{ margin: '3px 0' }}>“{t}”</p>
          ))}
        </div>
      )}
    </Panel>
  )
}
