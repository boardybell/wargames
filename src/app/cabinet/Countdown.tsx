// The deadline display. Dot-matrix numerals (styled spans in the Glass TTY
// font, no images) on wide layouts, swapped for an in-terminal countdown line
// below the shared breakpoint; exactly one is in the DOM at a time. Remaining
// time is endsAt minus the section-02 repaint clock, clamped at zero. This
// never reads Date.now(): the display clock's monotonic performance.now delta
// on top of the engine's clamped lastNow is the whole defense against a
// backward wall-clock jump, and routing around it would reopen that hole. The
// countdown never feeds the announcer; milestone readouts come from engine
// timerMilestone events, not this display.
import { useEffect, useReducer } from 'react'
import { remainingFor, subscribeTick } from '../state'
import { useNarrowViewport } from '../grid'
import './cabinet.css'

export interface CountdownProps {
  /** The active deadline in engine time. */
  readonly endsAt: number
}

function format(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

// Precondition: the display clock has been captured at least once (send/wake
// call captureClock, and init() wakes at boot). Before any capture the clock
// reads from zero; the clamp keeps that a floor, never a negative.
export function Countdown({ endsAt }: CountdownProps) {
  const [, repaint] = useReducer((n: number) => n + 1, 0)
  const narrow = useNarrowViewport()

  // Repaint on each display tick; remaining time is recomputed fresh so it is
  // never a stale cached snapshot.
  useEffect(() => subscribeTick(repaint), [])

  const text = format(remainingFor(endsAt))

  if (narrow) {
    return (
      <span className="countdown-line" role="timer" data-testid="countdown-line">
        T MINUS {text}
      </span>
    )
  }

  return (
    <span
      className="countdown-dotmatrix"
      role="timer"
      data-testid="countdown-dotmatrix"
      aria-label={`T minus ${text}`}
    >
      {text.split('').map((ch, i) => (
        <span className="countdown-digit" aria-hidden="true" key={i}>
          {ch}
        </span>
      ))}
    </span>
  )
}
