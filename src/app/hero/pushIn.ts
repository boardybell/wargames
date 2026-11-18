// The hand-rolled FLIP push-in (WAAPI, no View Transitions API). Single-use:
// a guard prevents re-entry whether the second attempt arrives mid-animation
// or after. The photo layer dollies so the glass fills the viewport while the
// terminal, mounted beneath at opacity 0, crossfades up near the end. Under
// reduced motion the dolly collapses to a short crossfade. No filters or
// shadows animate; will-change is scoped strictly to the push window.
import type { Rect } from './glassRect'

export const PUSH_IN_MS = 700
export const CROSSFADE_AT_MS = 450
export const REDUCED_MS = 250
const OVERSHOOT = 1.04
// Camera-dolly easing: accelerate into the screen.
const DOLLY_EASING = 'cubic-bezier(0.7, 0, 0.84, 0)'

export interface PushInHandles {
  readonly photoEl: HTMLElement
  readonly terminalEl: HTMLElement
  readonly glass: Rect
  readonly viewport: { readonly w: number; readonly h: number }
}

export interface PushInOptions {
  readonly reducedMotion: boolean
  /** Remove will-change, unmount the photo, move focus to the terminal, play
   *  the activation cue, start the greeting type-in, then reveal the rows. */
  onFinish(): void
}

let invoked = false

export function isPushInInvoked(): boolean {
  return invoked
}

export function runPushIn(handles: PushInHandles, options: PushInOptions): void {
  if (invoked) return // single-use, re-entry safe
  invoked = true

  let finished = false
  const finish = (): void => {
    if (finished) return // idempotent: event, promise, or safety net, whichever first
    finished = true
    handles.photoEl.style.willChange = ''
    options.onFinish()
  }
  // Safety net: if the WAAPI finish event is ever missed (a cancelled
  // animation, a backgrounded tab, an element removed mid-run), the scene must
  // not hang on the photo forever. This fires once, idempotently.
  const totalMs = options.reducedMotion ? REDUCED_MS : PUSH_IN_MS
  setTimeout(finish, totalMs + 150)

  if (options.reducedMotion) {
    handles.terminalEl.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: REDUCED_MS, fill: 'forwards' },
    )
    const fade = handles.photoEl.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: REDUCED_MS, fill: 'forwards' },
    )
    attachFinish(fade, finish)
    return
  }

  handles.photoEl.style.willChange = 'transform'
  const k =
    Math.max(
      handles.viewport.w / handles.glass.w,
      handles.viewport.h / handles.glass.h,
    ) * OVERSHOOT
  const glassCx = handles.glass.x + handles.glass.w / 2
  const glassCy = handles.glass.y + handles.glass.h / 2
  const tx = handles.viewport.w / 2 - glassCx
  const ty = handles.viewport.h / 2 - glassCy

  const dolly = handles.photoEl.animate(
    [
      { transform: 'translate(0px, 0px) scale(1)' },
      { transform: `translate(${tx}px, ${ty}px) scale(${k})` },
    ],
    { duration: PUSH_IN_MS, easing: DOLLY_EASING, fill: 'forwards' },
  )

  // Crossfade the terminal up near the end; a settle from 1.02 to 1 covers
  // sub-pixel register residue at the handoff.
  const crossfadeTimer = setTimeout(() => {
    handles.terminalEl.animate(
      [
        { opacity: 0, transform: 'scale(1.02)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      { duration: PUSH_IN_MS - CROSSFADE_AT_MS, fill: 'forwards' },
    )
    handles.photoEl.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: PUSH_IN_MS - CROSSFADE_AT_MS, fill: 'forwards' },
    )
  }, CROSSFADE_AT_MS)

  attachFinish(dolly, () => {
    clearTimeout(crossfadeTimer)
    finish()
  })
}

function attachFinish(animation: Animation, onFinish: () => void): void {
  // WAAPI finish event; fall back to the promise where available.
  if (typeof animation.addEventListener === 'function') {
    animation.addEventListener('finish', onFinish, { once: true })
  } else if (animation.finished) {
    void animation.finished.then(onFinish).catch(() => {})
  }
}

/** Test-only: re-arm the single-use guard. */
export function __resetPushIn(): void {
  invoked = false
}
