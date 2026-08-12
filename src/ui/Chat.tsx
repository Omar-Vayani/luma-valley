/**
 * Chat — talking to a Luma.
 *
 * Two things this panel has to get right, both of which were broken before.
 *
 * **The transcript is kept.** Lines are written into the `ChatStore` the
 * moment they are said, and the store writes through to disk. Closing the
 * panel, walking away, or reloading the page does not lose the conversation;
 * reopening it shows what you said last time.
 *
 * **The reply is already there.** `talk()` is synchronous, so the answer is
 * appended in the same event as the question. There is no spinner in this
 * component because there is nothing to wait for.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { talk } from '../sim/speech'
import type { ChatLine, ChatStore } from '../sim/save'
import type { Creature } from '../sim/creature'
import type { Sim } from '../sim/sim'

interface Props {
  sim: Sim
  creature: Creature
  store: ChatStore
  onClose: () => void
  onOpenMind: () => void
}

const SUGGESTIONS = ['hello', 'how are you', 'what are you doing', 'good', 'come']

export function Chat({ sim, creature, store, onClose, onOpenMind }: Props): React.ReactElement {
  const [lines, setLines] = useState<ChatLine[]>(() => store.lines(creature.id))
  const [draft, setDraft] = useState('')
  const [understanding, setUnderstanding] = useState<number | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLines(store.lines(creature.id))
    setUnderstanding(null)
    inputRef.current?.focus()
  }, [creature.id, store])

  useLayoutEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [lines])

  const say = (text: string): void => {
    const trimmed = text.trim()
    if (!trimmed) return
    setDraft('')

    // write both sides through the store, so the transcript survives anything
    store.append(creature.id, { from: 'you', text: trimmed, at: sim.time })
    const reply = talk(sim, creature, trimmed)
    creature.said = reply.text
    creature.saidAt = performance.now() / 1000
    const updated = store.append(creature.id, { from: 'them', text: reply.text, at: sim.time })

    setLines(updated)
    setUnderstanding(reply.understanding)
  }

  const distance = sim.playerDistance(creature)
  const tooFar = distance > 9
  const frightened = creature.drives.fear > 0.5 || creature.threat > 0.65

  return (
    <div className="panel side">
      <header>
        <h2>{creature.name}</h2>
        <span className="sub">
          {frightened ? 'frightened of you' : creature.trust > 0.6 ? 'fond of you' : 'curious'}
          {' · '}
          {distance.toFixed(0)} m
        </span>
        <span className="spacer" />
        <button className="button quiet" onClick={onOpenMind}>mind</button>
        <button className="close" onClick={onClose} aria-label="close">×</button>
      </header>

      <div className="chat-log" ref={logRef}>
        {lines.length === 0 ? (
          <p className="chat-empty">
            Say anything. {creature.name} will not understand most of it yet —
            words only come to mean something once they have been heard
            alongside the thing they describe.
          </p>
        ) : (
          lines.map((line, i) => (
            <div key={i} className={`chat-line ${line.from}`}>
              {line.text}
              {line.from === 'them' && i === lines.length - 1 && understanding != null && (
                <span className="meta">
                  understood {Math.round(understanding * 100)}% of that
                </span>
              )}
            </div>
          ))
        )}
      </div>

      <div className="chips">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip" onClick={() => say(s)} disabled={tooFar}>
            {s}
          </button>
        ))}
        {lines.length > 0 && (
          <button
            className="chip"
            onClick={() => {
              store.clear(creature.id)
              setLines([])
            }}
          >
            clear
          </button>
        )}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          say(draft)
        }}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={tooFar ? `too far away to talk` : `say something to ${creature.name}`}
          disabled={tooFar}
          maxLength={120}
        />
        <button className="button primary" type="submit" disabled={tooFar || !draft.trim()}>
          say
        </button>
      </form>
    </div>
  )
}
