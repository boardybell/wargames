// The motion preference. A tiny subscribable store holds the in-app override,
// composed with a live prefers-reduced-motion media query: the override wins
// unless it is 'system'. Section 06 settings writes the override; the type-in,
// push-in, grid, and cabinet all read the hook. Contract: consumers sample the
// preference when starting an animation; a mid-flight change never cancels a
// running animation, which is structural here because this module holds no
// animation references at all. The override persists to localStorage under one
// key; a corrupt or missing read falls back to 'system'. jsdom on this Node
// has no window.localStorage, so an in-memory value is the session source of
// truth and localStorage is mirrored when present.
import { useSyncExternalStore } from 'react'

export type MotionOverride = 'system' | 'reduced' | 'full'

const STORE_KEY = 'wg-motion-override'
const OVERRIDES: ReadonlySet<string> = new Set(['system', 'reduced', 'full'])

let override: MotionOverride = readPersisted()
const listeners = new Set<() => void>()

function readPersisted(): MotionOverride {
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY)
    if (raw && OVERRIDES.has(raw)) return raw as MotionOverride
  } catch {
    // No storage, or a corrupt read: fall back to following the system.
  }
  return 'system'
}

function persist(value: MotionOverride): void {
  try {
    globalThis.localStorage?.setItem(STORE_KEY, value)
  } catch {
    // Storage is optional; the in-memory value remains the source of truth.
  }
}

function systemReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** The composed truth: an explicit override wins, else the system setting. */
export function prefersReducedMotion(): boolean {
  if (override === 'reduced') return true
  if (override === 'full') return false
  return systemReducedMotion()
}

export function getMotionOverride(): MotionOverride {
  return override
}

export function setMotionOverride(next: MotionOverride): void {
  override = next
  persist(next)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  // Re-render on a live system-preference change too, not just override writes.
  const mql =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null
  const onMedia = (): void => listener()
  if (mql) {
    if (mql.addEventListener) mql.addEventListener('change', onMedia)
    else mql.addListener(onMedia)
  }
  return () => {
    listeners.delete(listener)
    if (mql) {
      if (mql.removeEventListener) mql.removeEventListener('change', onMedia)
      else mql.removeListener(onMedia)
    }
  }
}

/** True means reduce motion. The primary hook (the section 09 name). */
export function useMotionPreference(): boolean {
  return useSyncExternalStore(
    subscribe,
    prefersReducedMotion,
    prefersReducedMotion,
  )
}

/** Alias kept for the sections that adopted the stand-in name. */
export const useReducedMotion = useMotionPreference

/** Test-only. Re-reads persistence so a corrupt-store test can assert the
 *  fallback, and so each test starts from whatever storage holds (nothing, in
 *  jsdom, which means 'system'). */
export function __resetMotion(): void {
  listeners.clear()
  override = readPersisted()
}
