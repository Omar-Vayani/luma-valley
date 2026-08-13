/**
 * Neural — the interface onto a Luma's mind.
 *
 * This is the panel the whole game is built around, and it is a *read* of the
 * live network, never a summary written for the player. Every bar is an
 * activation, every synapse is a weight, and the numbers move because the
 * creature is thinking, not because something is animating them. If it says
 * the creature is about to run away, the creature is about to run away.
 */
import { useEffect, useRef, useState } from 'react'
import {
  ACTION_LABEL, SENSE_LABEL, snapshot, type BrainSnapshot,
} from '../sim/brain'
import { DRIVE_KEYS, DRIVE_LABEL } from '../sim/drives'
import type { Creature } from '../sim/creature'
import type { Sim } from '../sim/sim'

interface Props {
  sim: Sim
  creature: Creature
  onClose: () => void
}

function Meter({ label, value, colour }: { label: string; value: number; colour?: string }): React.ReactElement {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className="meter">
      <span>{label}</span>
      <div className="track">
        <div className="fill" style={{ width: `${pct}%`, background: colour }} />
      </div>
      <span className="value">{value.toFixed(2)}</span>
    </div>
  )
}

export function Neural({ sim, creature, onClose }: Props): React.ReactElement {
  const [shot, setShot] = useState<BrainSnapshot | null>(null)
  const [drives, setDrives] = useState(() => ({ ...creature.drives }))
  const [feelings, setFeelings] = useState({ trust: creature.trust, threat: creature.threat })
  const frame = useRef(0)

  // Poll rather than subscribe: the simulation has no idea React exists, and
  // ten reads a second is both plenty to watch a mind by and far cheaper than
  // pushing every change through state.
  useEffect(() => {
    let alive = true
    const tick = (): void => {
      if (!alive) return
      setShot(snapshot(creature.brain, () => true))
      setDrives({ ...creature.drives })
      setFeelings({ trust: creature.trust, threat: creature.threat })
      frame.current = window.setTimeout(tick, 100)
    }
    tick()
    return () => {
      alive = false
      window.clearTimeout(frame.current)
    }
  }, [creature])

  if (!shot) return <div className="panel wide" />

  const rewardClass = shot.reward > 0.02 ? 'good' : shot.reward < -0.02 ? 'bad' : 'flat'
  const maxScore = Math.max(0.5, ...shot.decision.map((d) => Math.abs(d.score)))

  return (
    <div className="panel wide">
      <header>
        <h2>{creature.name}&rsquo;s mind</h2>
        <span className="sub">
          {shot.decisions} decisions · {Math.round(shot.maturity * 100)}% settled ·{' '}
          {Math.floor(creature.age / 60)}m old
        </span>
        <span className="spacer" />
        <span className={`reward ${rewardClass}`}>
          reward {shot.reward >= 0 ? '+' : ''}{shot.reward.toFixed(2)}
        </span>
        <button className="close" onClick={onClose} aria-label="close">×</button>
      </header>

      <div className="body">
        <div className="neural-grid">
          {/* ---- what it wants -------------------------------------------- */}
          <section className="lobe">
            <h3>
              Drives
              <span className="note">what it is trying to quiet</span>
            </h3>
            {DRIVE_KEYS.map((key) => (
              <Meter
                key={key}
                label={DRIVE_LABEL[key]}
                value={drives[key]}
                colour={
                  key === 'fear' || key === 'pain'
                    ? 'var(--bad)'
                    : drives[key] > 0.7
                      ? 'var(--warn)'
                      : undefined
                }
              />
            ))}
            <div style={{ height: 4 }} />
            <Meter label="Trusts you" value={feelings.trust} colour="var(--good)" />
            <Meter label="Fears you" value={feelings.threat} colour="var(--bad)" />
          </section>

          {/* ---- what it can tell ------------------------------------------ */}
          <section className="lobe">
            <h3>
              Perception lobe
              <span className="note">one neuron per sense</span>
            </h3>
            {shot.perception
              .filter((p) => !DRIVE_KEYS.includes(p.key as never))
              .map((p) => (
                <Meter key={p.key} label={SENSE_LABEL[p.key] ?? p.key} value={p.value} />
              ))}
          </section>

          {/* ---- what it has made of it ------------------------------------ */}
          <section className="lobe">
            <h3>
              Concept lobe
              <span className="note">learned by association</span>
            </h3>
            <div className="concepts">
              {shot.concept.map((v, i) => (
                <div
                  key={i}
                  className="concept-cell"
                  title={`concept ${i + 1}: ${v.toFixed(3)}`}
                  style={{
                    background: v > 0
                      ? `rgba(224, 176, 98, ${0.15 + v * 0.85})`
                      : 'rgba(255,255,255,0.05)',
                    borderColor: v > 0.3 ? 'var(--accent)' : 'transparent',
                  }}
                />
              ))}
            </div>
            <p className="hint">
              Senses that keep firing together end up sharing a neuron. Only the
              strongest few stay lit, so a situation is three concepts rather
              than a smear across sixteen.
            </p>
            {shot.strongest.length > 0 && (
              <div className="vocab">
                {shot.strongest.slice(0, 5).map((s, i) => (
                  <div className="vocab-row" key={i}>
                    <b>{s.from} → {s.to}</b>
                    <span style={{ color: s.weight > 0 ? 'var(--good)' : 'var(--bad)' }}>
                      {s.weight > 0 ? '+' : ''}{s.weight.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ---- what it is going to do ------------------------------------ */}
          <section className="lobe">
            <h3>
              Decision lobe
              <span className="note">trained by reward</span>
            </h3>
            <div className="actions-list">
              {shot.decision.map((d) => {
                const width = (Math.abs(d.score) / maxScore) * 50
                const allowed = sim.canDo(creature, d.action)
                return (
                  <div
                    key={d.action}
                    className={`action-row${d.action === shot.chosen ? ' chosen' : ''}${allowed ? '' : ' blocked'}`}
                    title={allowed ? undefined : 'not possible right now'}
                  >
                    <span>{ACTION_LABEL[d.action]}</span>
                    <div className="action-bar">
                      <div className="mid" />
                      {d.score >= 0
                        ? <div className="pos" style={{ width: `${width}%` }} />
                        : <div className="neg" style={{ width: `${width}%` }} />}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="hint">
              Doing <b>{ACTION_LABEL[shot.chosen]}</b>, with{' '}
              {Math.round(shot.confidence * 100)}% conviction.
            </p>
          </section>
        </div>

        {/* ---- vocabulary --------------------------------------------------- */}
        <section className="lobe">
          <h3>
            Vocabulary
            <span className="note">
              {shot.vocabulary.length === 0 ? 'nothing yet' : `${shot.vocabulary.length} words heard`}
            </span>
          </h3>
          {shot.vocabulary.length === 0 ? (
            <p className="hint">
              Say a word while they are doing something and it will attach
              itself to whatever their mind is doing at that moment. Feed them
              while saying &ldquo;food&rdquo; and the word will come to mean
              eating, because that is what was going on when they heard it.
            </p>
          ) : (
            <div className="vocab">
              {shot.vocabulary.map((w) => (
                <div className="vocab-row" key={w.word}>
                  <b>{w.word}</b>
                  <span>
                    {w.means} · {Math.round(w.strength * 100)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
