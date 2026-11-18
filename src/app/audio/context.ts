// AudioContext lifecycle. One context, created suspended at boot. resume() is
// safe to call synchronously from any user-gesture handler (iOS requires the
// call inside the gesture, so nothing async wraps the underlying resume). A
// statechange listener re-arms a one-shot gesture resume after an interruption
// (phone call, Siri, backgrounding). Master gain stays at 0 until the prefs say
// enabled, so resuming is always safe regardless of mute state.
import {
  browserAudioPort,
  type ContextLike,
  type WebAudioPort,
} from './port'

let port: WebAudioPort = browserAudioPort
let context: ContextLike | null = null
let created = false
let reGesture: (() => void) | null = null
let onStateChange: (() => void) | null = null

export function setAudioPortImpl(next: WebAudioPort): void {
  port = next
}

export function getPort(): WebAudioPort {
  return port
}

function armGestureReresume(): void {
  if (reGesture || typeof document === 'undefined') return
  const onGesture = (): void => {
    disarmGestureReresume()
    resumeAudio()
  }
  reGesture = onGesture
  document.addEventListener('pointerdown', onGesture, { once: true })
  document.addEventListener('keydown', onGesture, { once: true })
}

function disarmGestureReresume(): void {
  if (!reGesture || typeof document === 'undefined') return
  document.removeEventListener('pointerdown', reGesture)
  document.removeEventListener('keydown', reGesture)
  reGesture = null
}

export function getAudioContext(): ContextLike | null {
  if (!created) {
    created = true
    context = port.create()
    if (context) {
      onStateChange = (): void => {
        if (context && context.state !== 'running') armGestureReresume()
      }
      context.addEventListener('statechange', onStateChange)
    }
  }
  return context
}

export function resumeAudio(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  disarmGestureReresume()
  try {
    // Must fire synchronously inside the gesture; swallow any failure.
    void ctx.resume()
  } catch {
    // A dead context never breaks gameplay.
  }
}

export function nowSeconds(): number {
  const ctx = getAudioContext()
  return ctx ? port.now(ctx) : 0
}

/** Test-only. */
export function __resetContext(): void {
  disarmGestureReresume()
  if (context && onStateChange) {
    context.removeEventListener('statechange', onStateChange)
  }
  onStateChange = null
  port = browserAudioPort
  context = null
  created = false
}
