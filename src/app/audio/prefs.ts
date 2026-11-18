// Persisted audio preferences. One backing value per field; master is the
// single value the diegetic ENABLE SOUND? prompt (section 05) and the settings
// switch (section 06) both read and write. In-memory is the session source of
// truth (works where localStorage is blocked, e.g. private mode or a headless
// test env); localStorage persists across reloads and a corrupt read falls to
// muted defaults without throwing.
import { useSyncExternalStore } from 'react'

const PREFS_KEY = 'wargames.audio.prefs'

export interface AudioPrefs {
  readonly master: boolean
  readonly voice: boolean
  readonly effects: boolean
  readonly ambience: boolean
}

const DEFAULT_PREFS: AudioPrefs = {
  master: false,
  voice: true,
  effects: true,
  ambience: true,
}

let prefs: AudioPrefs | undefined
let masterConfigured: boolean | undefined
const listeners = new Set<() => void>()

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
  for (const listener of listeners) listener()
}

export function getAudioPrefs(): AudioPrefs {
  return load()
}

export function setAudioPref(key: keyof AudioPrefs, value: boolean): void {
  prefs = { ...load(), [key]: value }
  if (key === 'master') masterConfigured = true
  persist()
}

export type SoundPreference = 'on' | 'off'

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

export function onAudioPrefs(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useAudioPrefs(): AudioPrefs {
  return useSyncExternalStore(onAudioPrefs, getAudioPrefs, getAudioPrefs)
}

/** Test-only. */
export function __resetPrefs(): void {
  prefs = undefined
  masterConfigured = undefined
  listeners.clear()
  try {
    window.localStorage.removeItem(PREFS_KEY)
  } catch {
    // ignore
  }
}
