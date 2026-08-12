/**
 * Talk — a conversation with one Luma.
 *
 * You type in natural language and the settlement's own parser reads it; the
 * reply carries whether they believed you and whether they will act on it,
 * which matters more than the words. The panel keeps hold of who you are
 * speaking to rather than re-picking the nearest body every line, which is
 * why answers used to come from the wrong person.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Sim } from '../../lab/sim'
import type { DialogueTurn } from '../../lab/dialogue'
import { deriveEmotion } from '../../lab/emotion'
import { Panel } from '../Panel'

export interface TalkProps {
  sim: Sim
  creatureId: number
  distance: number
  onClose: () => void
  onSpoke: (creatureId: number) => void
  voice: string
}

const OPENERS = [
  'hello', 'how are you?', 'are you hungry?', 'who do you trust?',
  'what happened here?', 'where can I find bread?', 'I brought you something',
  'do you need help?', 'tell me about your family',
]

export function Talk({ sim, creatureId, distance, onClose, onSpoke, voice }: TalkProps): React.ReactElement {
  const creature = sim.creatureById(creatureId)
  const [text, setText] = useState('')
  const [turns, setTurns] = useState<DialogueTurn[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [creatureId])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [turns])

  const mood = useMemo(
    () => (creature ? deriveEmotion(creature.chem, creature.genome) : null),
    [creature],
  )

  if (!creature) {
    return (
      <Panel title="Talk" narrow onClose={onClose} testId="talk">
        <p className="muted">They are not here any more.</p>
      </Panel>
    )
  }

  const outOfEarshot = distance > 6.5

  const say = (line: string): void => {
    const trimmed = line.trim()
    if (!trimmed) return
    const turn = sim.playerTalk(trimmed, creatureId)
    setText('')
    setTurns((prev) => [
      ...prev.slice(-14),
      {
        speakerId: 0, listenerId: creatureId, text: trimmed,
        semantic: { kind: 'greet' } as DialogueTurn['semantic'],
        believed: true, obeyed: false, tick: sim.time,
      },
      ...(turn ? [turn] : []),
    ])
    onSpoke(creatureId)
  }

  return (
    <Panel
      title={creature.name}
      hint={`${creature.stage}${creature.job ? ` · ${creature.job}` : ''} · ${creature.psyche.mood}`}
      narrow
      onClose={onClose}
      testId="talk"
    >
      <div className="row small muted" style={{ marginBottom: 10 }}>
        <span
          style={{
            width: 10, height: 10, borderRadius: '50%',
            background: mood?.color ?? '#888', display: 'inline-block',
          }}
        />
        <span data-talk-voice>voice: {voice}</span>
        {outOfEarshot && <span style={{ marginLeft: 'auto', color: 'var(--bad)' }}>out of earshot</span>}
      </div>

      <div className="talk-log" ref={logRef} data-talk-log>
        {turns.length === 0 && (
          <p className="muted small">
            Say anything. Greet them, ask how they are, ask for something, warn them
            about someone, or offer help. They answer out of what they actually
            know and feel — and they can refuse, or lie.
          </p>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`line${t.speakerId === 0 ? ' you' : ''}`}>
            <span className="who">{t.speakerId === 0 ? 'you' : creature.name}</span>
            <span className="what">
              {t.text}
              {t.speakerId !== 0 && !t.believed && <span className="why">they do not believe you</span>}
              {t.speakerId !== 0 && t.obeyed && <span className="why">they will act on it</span>}
            </span>
          </div>
        ))}
      </div>

      <div className="suggestions">
        {OPENERS.slice(0, 6).map((o) => (
          <button key={o} className="chip" onClick={() => say(o)} disabled={outOfEarshot}>{o}</button>
        ))}
      </div>

      <form
        className="talk-input"
        onSubmit={(e) => {
          e.preventDefault()
          say(text)
        }}
      >
        <input
          ref={inputRef}
          className="field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={outOfEarshot ? 'Step closer to be heard' : `Say something to ${creature.name}`}
          disabled={outOfEarshot}
          data-talk-input
        />
        <button className="btn primary" type="submit" disabled={outOfEarshot || !text.trim()}>Say</button>
      </form>
    </Panel>
  )
}
