// Shared frame for every LIST GAMES entry (design: docs/games-design-review.md,
// CROSS-CUTTING). The shell owns layout and the commands every game has: title,
// objective, status metrics, HOW TO PLAY, RESTART (with an inline confirmation
// while a game is in progress) and EXIT TO GAMES. Games pass content slots and
// callbacks; the shell never inspects game state.
//
// Layout: one bounded column (~1100px). `main` is the board or table; `side`
// is the current decision and a short report. On phones everything becomes one
// vertical scroll surface: main, side, then history.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import './gameui.css'

export type Tone = 'normal' | 'dim' | 'amber' | 'red' | 'good'

export interface Metric {
  readonly label: string
  readonly value: ReactNode
  readonly tone?: Tone
  /** Accessible / title text when value is terse. */
  readonly title?: string
}

export interface GameShellProps {
  /** Slug for data-testid="game-<slug>". */
  readonly slug: string
  readonly title: string
  /** One line: what the player is trying to do. */
  readonly objective?: ReactNode
  /** Current phase / decision label, e.g. YOUR TURN, SELECT THREE CARDS. */
  readonly phase?: ReactNode
  readonly phaseTone?: Tone
  readonly metrics?: readonly Metric[]
  /** Rules, shown in a collapsible HOW TO PLAY panel. */
  readonly help?: ReactNode
  /** Restart the current game. Omit to hide RESTART. */
  readonly onRestart?: () => void
  /** True while a game is under way: RESTART asks for a one-tap confirmation. */
  readonly inProgress?: boolean
  readonly restartLabel?: string
  readonly onExit: () => void
  /** Visual layout family. */
  readonly layout?: 'table' | 'board' | 'wide'
  /** Board / table. */
  readonly children: ReactNode
  /** Decision panel: current controls, result. */
  readonly side?: ReactNode
  /** Report / history, rendered under side (desktop) or last (phone). */
  readonly report?: ReactNode
  /** Extra toolbar items (difficulty / mode selectors). */
  readonly toolbar?: ReactNode
  /** Polite live announcement of the last completed action. */
  readonly announce?: string
}

export function GameShell(p: GameShellProps) {
  const [confirming, setConfirming] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const helpId = useId()
  const layout = p.layout ?? 'board'
  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(t)
  }, [confirming])

  const restart = (): void => {
    if (!p.onRestart) return
    if (p.inProgress && !confirming) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    p.onRestart()
  }

  return (
    <div className={`wg-screen gs-shell gs-${layout}`} data-testid={`game-${p.slug}`}>
      <header className="gs-head">
        <div className="gs-id">
          <h1 className="gs-title">{p.title}</h1>
          {p.objective && <p className="gs-objective">{p.objective}</p>}
        </div>
        <nav className="gs-cmds" aria-label="Game commands">
          {p.toolbar}
          {p.help && (
            <button
              type="button"
              className="gs-btn gs-quiet"
              aria-expanded={helpOpen}
              aria-controls={helpId}
              onClick={() => setHelpOpen((o) => !o)}
              data-testid="game-help"
            >
              HOW TO PLAY
            </button>
          )}
          {p.onRestart && (
            <button
              type="button"
              className={`gs-btn gs-quiet${confirming ? ' gs-warn' : ''}`}
              onClick={restart}
              data-testid="game-restart"
            >
              {confirming ? 'CONFIRM RESTART' : (p.restartLabel ?? 'RESTART')}
            </button>
          )}
          <button type="button" className="gs-btn gs-quiet" onClick={p.onExit} data-testid="game-exit">
            EXIT TO GAMES
          </button>
        </nav>
      </header>
      {helpOpen && p.help && (
        <section id={helpId} className="gs-help" aria-label="How to play">
          {p.help}
        </section>
      )}
      {(p.phase || (p.metrics && p.metrics.length > 0)) && (
        <div className="gs-status">
          {p.phase && (
            <div className={`gs-phase gs-tone-${p.phaseTone ?? 'amber'}`} data-testid="game-phase">
              {p.phase}
            </div>
          )}
          {p.metrics && p.metrics.length > 0 && <Metrics items={p.metrics} />}
        </div>
      )}
      <div className="gs-body">
        <main className="gs-main">{p.children}</main>
        {(p.side || p.report) && (
          <aside className="gs-side">
            {p.side}
            {p.report}
          </aside>
        )}
      </div>
      <div className="gs-sr" role="status" aria-live="polite">
        {p.announce ?? ''}
      </div>
    </div>
  )
}

export function Metrics({ items }: { items: readonly Metric[] }) {
  return (
    <dl className="gs-metrics">
      {items.map((m) => (
        <div key={m.label} className={`gs-metric gs-tone-${m.tone ?? 'normal'}`} title={m.title}>
          <dt>{m.label}</dt>
          <dd>{m.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export interface ActionProps {
  readonly children: ReactNode
  readonly onClick: () => void
  readonly disabled?: boolean
  /** Shown under the button when disabled. */
  readonly reason?: string
  readonly variant?: 'primary' | 'secondary' | 'danger'
  readonly pressed?: boolean
  readonly testId?: string
  readonly shortcut?: string
  readonly autoFocus?: boolean
  readonly label?: string
}

/** A 44px command button with an optional disabled reason and shortcut hint. */
export function Action(p: ActionProps) {
  return (
    <span className="gs-action">
      <button
        type="button"
        className={`gs-btn gs-${p.variant ?? 'secondary'}`}
        onClick={p.onClick}
        disabled={p.disabled}
        aria-pressed={p.pressed}
        aria-label={p.label}
        data-testid={p.testId}
        autoFocus={p.autoFocus}
        aria-keyshortcuts={p.shortcut}
      >
        {p.children}
        {p.shortcut && <kbd className="gs-kbd">{p.shortcut}</kbd>}
      </button>
      {p.disabled && p.reason && <span className="gs-reason">{p.reason}</span>}
    </span>
  )
}

export function ActionBar({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="gs-actions" role="group" aria-label={label ?? 'Actions'}>
      {children}
    </div>
  )
}

/** A titled panel inside the side column or main area. */
export function Panel({ title, children, tone, className }: { title?: ReactNode; children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <section className={`gs-panel gs-tone-${tone ?? 'normal'}${className ? ` ${className}` : ''}`}>
      {title && <h2 className="gs-panel-title">{title}</h2>}
      {children}
    </section>
  )
}

export type Outcome = 'win' | 'lose' | 'draw'

export interface GameResultProps {
  readonly outcome: Outcome
  readonly headline: string
  /** Why it ended, in one sentence of terminal voice. */
  readonly reason: ReactNode
  readonly metrics?: readonly Metric[]
  readonly children?: ReactNode
  readonly testId?: string
}

export function GameResult(p: GameResultProps) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <section
      ref={ref}
      tabIndex={-1}
      className={`gs-result gs-result-${p.outcome}`}
      data-testid={p.testId ?? 'game-result'}
      data-outcome={p.outcome}
      aria-label="Result"
    >
      <div className="gs-result-head">{p.headline}</div>
      <div className="gs-result-reason">{p.reason}</div>
      {p.metrics && <Metrics items={p.metrics} />}
      {p.children && <div className="gs-actions">{p.children}</div>}
    </section>
  )
}

export type EventKind = 'info' | 'good' | 'bad' | 'warn'
export interface ReportEvent {
  readonly id: number
  readonly text: string
  readonly kind?: EventKind
}

/** LAST ACTION plus expandable history. Events are typed; never infer tone from text. */
export function GameReport({ events, title, max = 60 }: { events: readonly ReportEvent[]; title?: string; max?: number }) {
  const [open, setOpen] = useState(false)
  if (events.length === 0) return null
  const last = events[events.length - 1]!
  // The last "turn" is every event sharing the final batch id prefix; games
  // pass batches by giving them consecutive ids, so show up to the last 4.
  const recent = events.slice(-4)
  const older = events.slice(0, -4).slice(-max)
  return (
    <section className="gs-report" aria-label={title ?? 'Report'} data-testid="game-report">
      <h2 className="gs-panel-title">{title ?? 'LAST ACTION'}</h2>
      <ol className="gs-events">
        {recent.map((e) => (
          <li key={e.id} className={`gs-ev gs-ev-${e.kind ?? 'info'}${e === last ? ' gs-ev-last' : ''}`}>
            {e.text}
          </li>
        ))}
      </ol>
      {older.length > 0 && (
        <>
          <button type="button" className="gs-link" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'HIDE HISTORY' : `HISTORY (${older.length})`}
          </button>
          {open && (
            <ol className="gs-events gs-history">
              {older.map((e) => (
                <li key={e.id} className={`gs-ev gs-ev-${e.kind ?? 'info'}`}>
                  {e.text}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  )
}

/** Small segmented choice (difficulty, mode). Uses aria-pressed. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (v: T) => void
  testId?: string
}) {
  return (
    <div className="gs-seg" role="group" aria-label={label} data-testid={testId}>
      <span className="gs-seg-label">{label}</span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="gs-btn gs-quiet"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Labeled bar (health, armor, population) with optional threshold marker. */
export function Bar({
  label,
  value,
  max,
  tone,
  marker,
  markerLabel,
  showValue = true,
}: {
  label: string
  value: number
  max: number
  tone?: Tone
  marker?: number
  markerLabel?: string
  showValue?: boolean
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className={`gs-bar gs-tone-${tone ?? 'normal'}`}>
      <span className="gs-bar-label">{label}</span>
      <span
        className="gs-bar-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <span className="gs-bar-fill" style={{ width: `${pct}%` }} />
        {marker !== undefined && (
          <span className="gs-bar-marker" style={{ left: `${(marker / max) * 100}%` }} title={markerLabel} />
        )}
      </span>
      {showValue && (
        <span className="gs-bar-value">
          {value}/{max}
        </span>
      )}
    </div>
  )
}
