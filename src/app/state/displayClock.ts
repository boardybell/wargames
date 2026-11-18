// The display clock. Countdown rendering reads a monotonic performance.now()
// delta on top of the engine's clamped lastNow, captured at the last wake or
// dispatch. Date.now() is never read for display, so a backward wall-clock
// jump cannot make a countdown gain time while the engine refuses to
// un-expire a deadline: the engine's lastNow clamp and this display share one
// truth, reconciled at every wake. The ticker only repaints; it never calls
// dispatch or advanceToNow for display. It does own one edge: a deadline that
// passes while the tab stays visible with no interaction triggers exactly one
// self-wake, guarded per endsAt instance.
import { getState, hasState } from './store'

/** Pure: displayed remaining ms for a deadline, clamped at zero. */
export function remainingTime(
  endsAt: number,
  engineLastNow: number,
  perfAtCapture: number,
  perfNow: number,
): number {
  const elapsed = perfNow - perfAtCapture
  return Math.max(0, endsAt - (engineLastNow + elapsed))
}

let engineLastNow = 0
let perfAtCapture = 0

/** Internal: send and wake call this with the new clamped lastNow. */
export function captureClock(lastNow: number): void {
  engineLastNow = lastNow
  perfAtCapture = performance.now()
}

/** Current displayed remaining ms for a deadline, using the captured pair. */
export function remainingFor(endsAt: number): number {
  return remainingTime(endsAt, engineLastNow, perfAtCapture, performance.now())
}

// Self-wake guard: a Set of endsAt instances already self-woken, so the
// finale's own later deadline still self-wakes after a mission's guard trips
// (a new deadline is a new key). Not an app-level boolean.
const selfWoken = new Set<number>()
const tickSubscribers = new Set<() => void>()
let rafId: number | null = null

export function subscribeTick(listener: () => void): () => void {
  tickSubscribers.add(listener)
  return () => {
    tickSubscribers.delete(listener)
  }
}

function activeDeadline(): number | null {
  if (!hasState()) return null
  return getState().activeMission?.endsAt ?? null
}

/** One frame of work: self-wake if the active deadline just hit zero, then
 *  ping repaint subscribers. Exposed for deterministic testing without rAF.
 *  The guard entry for the current deadline persists across frames so a
 *  settled-yet-still-active mission (the engine keeps activeMission until
 *  the debrief is acknowledged) is not re-woken every frame; stale entries
 *  for superseded deadlines are pruned so the Set never grows unbounded. */
export function tickOnce(wakeFn: () => void): void {
  const endsAt = activeDeadline()
  // Only the current active deadline can self-wake; drop every other key.
  for (const key of selfWoken) {
    if (key !== endsAt) selfWoken.delete(key)
  }
  if (endsAt !== null && !selfWoken.has(endsAt) && remainingFor(endsAt) <= 0) {
    selfWoken.add(endsAt)
    wakeFn()
  }
  for (const listener of tickSubscribers) listener()
}

export function startTicker(wakeFn: () => void): void {
  if (rafId !== null) return
  const loop = (): void => {
    tickOnce(wakeFn)
    rafId = requestAnimationFrame(loop)
  }
  rafId = requestAnimationFrame(loop)
}

export function stopTicker(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

/** Test-only. */
export function __resetClock(): void {
  engineLastNow = 0
  perfAtCapture = 0
  selfWoken.clear()
  tickSubscribers.clear()
  stopTicker()
}
