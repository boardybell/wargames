// The type-in effect hook. Reveals authored text character by character at a
// period-plausible rate, firing a key-tick cue per character; any key, click,
// or tap completes it instantly via complete(). The full text is the caller's
// responsibility to keep in the DOM for assistive tech (the hook returns only
// a visibleCount for visual clipping). Under reduced motion the reveal is
// instant and onComplete still fires exactly once.
import { useCallback, useEffect, useRef, useState } from 'react'

/** Per-character reveal interval, in the 20 to 45 ms band. */
export const CHAR_INTERVAL_MS = 30

export interface TypeInOptions {
  readonly text: string
  readonly onTick?: () => void
  readonly onComplete?: () => void
  /** Injected; section 09 provides the real useMotionPreference hook. */
  readonly reducedMotion: boolean
}

export interface TypeInState {
  readonly visibleCount: number
  readonly running: boolean
  readonly complete: () => void
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useTypeIn(options: TypeInOptions): TypeInState {
  const { text, onTick, onComplete, reducedMotion } = options
  const full = text.length
  const instant = reducedMotion || prefersReducedMotion()

  const [visibleCount, setVisibleCount] = useState(instant ? full : 0)
  const [running, setRunning] = useState(!instant && full > 0)
  const completedRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  const onTickRef = useRef(onTick)
  onCompleteRef.current = onComplete
  onTickRef.current = onTick

  const fireComplete = useCallback(() => {
    if (!completedRef.current) {
      completedRef.current = true
      onCompleteRef.current?.()
    }
  }, [])

  const complete = useCallback(() => {
    setVisibleCount(full)
    setRunning(false)
    fireComplete()
  }, [full, fireComplete])

  useEffect(() => {
    // A new text (or a motion-preference flip) restarts cleanly: clear the
    // completion latch and reset the visible count so onComplete fires again
    // for the new string and a shorter string cannot render a stale tail.
    completedRef.current = false
    if (instant || full === 0) {
      setVisibleCount(full)
      setRunning(false)
      fireComplete()
      return
    }
    setVisibleCount(0)
    setRunning(true)
    let revealed = 0
    const id = setInterval(() => {
      revealed += 1
      setVisibleCount(revealed)
      onTickRef.current?.()
      if (revealed >= full) {
        clearInterval(id)
        setRunning(false)
        fireComplete()
      }
    }, CHAR_INTERVAL_MS)
    return () => clearInterval(id)
    // Re-run only when the text or the motion decision changes.
  }, [text, instant, full, fireComplete])

  return { visibleCount, running, complete }
}
