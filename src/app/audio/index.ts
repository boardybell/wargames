// Minimal audio stand-in. Section 07 builds the real AudioContext graph and
// cues; this provides exactly what the hero scene (section 05) and settings
// (section 06) consume: a resume port spied in tests, a single persisted
// master sound preference both the sound prompt and the settings switch read
// and write (never a shadow copy), and no-op cue hooks section 07 fills in.

const PREF_KEY = 'wargames.sound'

export interface AudioPort {
  /** Resume the (boot-suspended) AudioContext. Must be called synchronously
   *  inside a user-gesture handler. */
  resume(): void
}

// A real-browser port lazily creates one suspended AudioContext. Tests inject
// a spy port via setAudioPort.
let port: AudioPort = {
  resume: () => {
    void getAudioContext()?.resume()
  },
}

let ctx: AudioContext | null = null
let ctxTried = false

function getAudioContext(): AudioContext | null {
  if (ctxTried) return ctx
  ctxTried = true
  const Ctor =
    typeof window !== 'undefined'
      ? (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext)
      : undefined
  if (Ctor) {
    ctx = new Ctor()
    // Created suspended; resumed only on a user gesture.
    void ctx.suspend?.()
  }
  return ctx
}

export function setAudioPort(next: AudioPort): void {
  port = next
}

export function resumeAudio(): void {
  port.resume()
}

export type SoundPreference = 'on' | 'off'

const prefListeners = new Set<() => void>()
// In-memory is the session source of truth (and works where localStorage is
// blocked, e.g. Safari private mode or a headless test env); localStorage is
// the cross-reload persistence layer, read lazily and written on set.
let pref: SoundPreference | null | undefined

function loadPref(): SoundPreference | null {
  if (pref !== undefined) return pref
  try {
    const raw = window.localStorage.getItem(PREF_KEY)
    pref = raw === 'on' || raw === 'off' ? raw : null
  } catch {
    pref = null
  }
  return pref
}

export function getSoundPreference(): SoundPreference | null {
  return loadPref()
}

export function hasSoundPreference(): boolean {
  return loadPref() !== null
}

export function setSoundPreference(value: SoundPreference): void {
  pref = value
  try {
    window.localStorage.setItem(PREF_KEY, value)
  } catch {
    // Persistence unavailable; the in-memory value still backs this session.
  }
  for (const listener of prefListeners) listener()
}

export function onSoundPreference(listener: () => void): () => void {
  prefListeners.add(listener)
  return () => {
    prefListeners.delete(listener)
  }
}

// Cue hooks: section 07 fills these with real buffers. No-ops keep the hero
// and terminal callable now.
export function playActivationCue(): void {
  // section 07
}

export function playKeyTick(): void {
  // section 07
}

/** Test-only. */
export function __resetAudio(): void {
  port = { resume: () => void getAudioContext()?.resume() }
  prefListeners.clear()
  pref = null
  try {
    window.localStorage.removeItem(PREF_KEY)
  } catch {
    // ignore
  }
}
