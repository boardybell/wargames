// Branch-trace playback. Renders BranchStep entries sequentially at a
// watchable pace with one timer and no animation library. Under reduced motion
// playback is instant (all steps present at once); a SKIP control jumps to the
// final state; every step's results stay readable after a skip. An empty array
// renders a stable terminal state without throwing. Split 06 authors the real
// step content; split 01 owns the BranchStep type.
import { useEffect, useRef, useState } from 'react'
import type { BranchStep } from '@engine'
import { useReducedMotion } from '../a11y/motion'
import './grid.css'

export interface PlayBranchTraceProps {
  readonly steps: readonly BranchStep[]
  /** Milliseconds between revealed steps (one timer, not an animation lib). */
  readonly stepMs?: number
  readonly onDone?: () => void
}

const DEFAULT_STEP_MS = 400

export function PlayBranchTrace({
  steps,
  stepMs = DEFAULT_STEP_MS,
  onDone,
}: PlayBranchTraceProps) {
  const reduced = useReducedMotion()
  // A content signature keyed to the steps, not the array identity: a caller
  // passing an inline array gives a new reference every render, which must not
  // rewind an in-flight trace. Only a change of actual step content restarts.
  const signature = steps.map((s) => s.step).join('|')
  const [revealed, setRevealed] = useState(() =>
    reduced || steps.length <= 1 ? steps.length : 1,
  )
  const doneFired = useRef(false)

  useEffect(() => {
    // A new sequence (or a motion-preference flip) is the only thing that
    // restarts playback and re-arms the done latch.
    doneFired.current = false
    if (reduced || steps.length <= 1) {
      setRevealed(steps.length)
      return
    }
    setRevealed(1)
    let count = 1
    let timer: ReturnType<typeof setTimeout>
    const tick = (): void => {
      count += 1
      setRevealed(count)
      if (count < steps.length) timer = setTimeout(tick, stepMs)
    }
    timer = setTimeout(tick, stepMs)
    return () => clearTimeout(timer)
    // Keyed by the content signature, not the steps reference, so an inline
    // array prop does not rewind an in-flight trace.
  }, [signature, reduced, stepMs])

  useEffect(() => {
    if (revealed >= steps.length && steps.length > 0 && !doneFired.current) {
      doneFired.current = true
      onDone?.()
    }
  }, [revealed, steps.length, onDone])

  const skip = (): void => setRevealed(steps.length)
  const complete = revealed >= steps.length

  return (
    <div className="branch-trace" data-testid="branch-trace">
      {steps.length === 0 ? (
        <p className="branch-trace-empty" data-testid="branch-trace-empty">
          NO BRANCH DATA
        </p>
      ) : (
        <ol className="branch-trace-steps">
          {steps.slice(0, revealed).map((s) => (
            <li
              className="branch-trace-step"
              data-testid="branch-step"
              data-step={s.step}
              key={s.step}
            >
              <span className="branch-step-label">{s.label}</span>
              <span className="branch-step-detail">{s.detail}</span>
            </li>
          ))}
        </ol>
      )}
      {!complete ? (
        <button
          type="button"
          className="branch-trace-skip"
          data-testid="branch-skip"
          onClick={skip}
        >
          SKIP
        </button>
      ) : null}
    </div>
  )
}
