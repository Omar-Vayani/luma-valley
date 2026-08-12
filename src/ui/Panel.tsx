/**
 * Panel — the shell every full-screen surface shares.
 *
 * One chrome, one close affordance, one scroll region. Opening any of these
 * releases the pointer lock and stops the world hearing the keyboard, which
 * is the whole reason typing used to walk you into a wall.
 */
import { useEffect, type ReactNode } from 'react'

export interface PanelProps {
  title: string
  hint?: string
  narrow?: boolean
  onClose: () => void
  children: ReactNode
  tabs?: { id: string; label: string }[]
  activeTab?: string
  onTab?: (id: string) => void
  testId?: string
}

export function Panel({
  title, hint, narrow, onClose, children, tabs, activeTab, onTab, testId,
}: PanelProps): React.ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className={`panel${narrow ? ' narrow' : ''}`} data-panel={testId ?? title.toLowerCase()}>
        <header>
          <h2>{title}</h2>
          {hint && <span className="hint">{hint}</span>}
          <button className="close" onClick={onClose} aria-label="Close">✕</button>
        </header>
        {tabs && (
          <nav className="tabs">
            {tabs.map((t) => (
              <button
                key={t.id}
                className={activeTab === t.id ? 'on' : ''}
                onClick={() => onTab?.(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        )}
        <div className="body">{children}</div>
      </section>
    </div>
  )
}
