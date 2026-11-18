// The reduce-glow preference. It toggles the single crt-reduce-glow class on
// the document root, which the CRT stylesheet (section 03) scopes to drop the
// outer text-shadow halos and the breathing layer for every glass container
// beneath. Session state, not persisted here.
import { useSyncExternalStore } from 'react'

let on = false
const listeners = new Set<() => void>()

export function getReduceGlow(): boolean {
  return on
}

export function setReduceGlow(value: boolean): void {
  on = value
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('crt-reduce-glow', value)
  }
  for (const listener of listeners) listener()
}

export function useReduceGlow(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getReduceGlow,
    getReduceGlow,
  )
}

/** Test-only. */
export function __resetReduceGlow(): void {
  on = false
  listeners.clear()
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('crt-reduce-glow')
  }
}
