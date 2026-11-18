// Motion-preference stand-in. Section 09 owns the real useMotionPreference
// hook that composes the media query with an in-app override; this reads the
// media query plus a session in-app override so settings can flip motion now
// and every consumer sees one truth.
import { useSyncExternalStore } from 'react'

export type MotionOverride = 'reduce' | 'full' | null // null = follow system

let override: MotionOverride = null
const listeners = new Set<() => void>()

function systemReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** The composed truth: an explicit override wins, else the system setting. */
export function prefersReducedMotion(): boolean {
  if (override === 'reduce') return true
  if (override === 'full') return false
  return systemReducedMotion()
}

export function getMotionOverride(): MotionOverride {
  return override
}

export function setMotionOverride(next: MotionOverride): void {
  override = next
  for (const listener of listeners) listener()
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    prefersReducedMotion,
    prefersReducedMotion,
  )
}

/** Test-only. */
export function __resetMotion(): void {
  override = null
  listeners.clear()
}
