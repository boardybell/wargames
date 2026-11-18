// Minimal audio stand-in. Section 07 builds the real AudioContext graph and
// cues; this provides exactly what the hero scene (section 05) and settings
// (section 06) consume: a resume port spied in tests, a single persisted
// master sound preference both the sound prompt and the settings switch read
// and write (never a shadow copy), and no-op cue hooks section 07 fills in.

import { useSyncExternalStore } from 'react'

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

// The full preference set section 07 persists. master is the single value the
// diegetic hero prompt and the settings master switch both back (no shadow
// copy). A corrupt read falls to muted defaults.
export interface AudioPrefs {
  readonly master: boolean
  readonly voice: boolean
  readonly effects: boolean
  readonly ambience: boolean
}

const PREFS_KEY = 'wargames.audio.prefs'
const DEFAULT_PREFS: AudioPrefs = {
  master: false,
  voice: true,
  effects: true,
  ambience: true,
}

const prefListeners = new Set<() => void>()
// In-memory is the session source of truth (and works where localStorage is
// blocked, e.g. Safari private mode or a headless test env); localStorage is
// the cross-reload persistence layer, read lazily and written on set.
let prefs: AudioPrefs | undefined
// Whether master was ever explicitly configured (so the hero prompt, which
// gates on this, does not reappear once answered).
let masterConfigured: boolean | undefined

function load(): AudioPrefs {
  if (prefs !== undefined) return prefs
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AudioPrefs> & {
        configured?: boolean
      }
      prefs = {
        master: parsed.master ?? DEFAULT_PREFS.master,
        voice: parsed.voice ?? DEFAULT_PREFS.voice,
        effects: parsed.effects ?? DEFAULT_PREFS.effects,
        ambience: parsed.ambience ?? DEFAULT_PREFS.ambience,
      }
      masterConfigured = parsed.configured ?? true
      return prefs
    }
  } catch {
    // Corrupt or unavailable: muted defaults.
  }
  prefs = DEFAULT_PREFS
  masterConfigured = false
  return prefs
}

function persist(): void {
  try {
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ ...load(), configured: masterConfigured }),
    )
  } catch {
    // In-memory still backs the session.
  }
  for (const listener of prefListeners) listener()
}

export function getAudioPrefs(): AudioPrefs {
  return load()
}

export function setAudioPref(key: keyof AudioPrefs, value: boolean): void {
  prefs = { ...load(), [key]: value }
  if (key === 'master') masterConfigured = true
  persist()
}

export function getSoundPreference(): SoundPreference | null {
  load()
  if (!masterConfigured) return null
  return load().master ? 'on' : 'off'
}

export function hasSoundPreference(): boolean {
  load()
  return masterConfigured === true
}

export function setSoundPreference(value: SoundPreference): void {
  setAudioPref('master', value === 'on')
}

export function onSoundPreference(listener: () => void): () => void {
  prefListeners.add(listener)
  return () => {
    prefListeners.delete(listener)
  }
}

/** Reactive view of the audio prefs for the settings dialog. */
export function useAudioPrefs(): AudioPrefs {
  return useSyncExternalStore(onSoundPreference, getAudioPrefs, getAudioPrefs)
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
  prefs = undefined
  masterConfigured = undefined
  try {
    window.localStorage.removeItem(PREFS_KEY)
    window.localStorage.removeItem(PREF_KEY)
  } catch {
    // ignore
  }
}
