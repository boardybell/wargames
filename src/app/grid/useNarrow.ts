// A narrow-viewport hook driven by the shared breakpoint. jsdom provides a
// matchMedia stub in tests (mocked per case); outside a browser it reports
// not-narrow so server-free renders never throw.
import { useSyncExternalStore } from 'react'
import { COMPACT_BREAKPOINT_PX } from './constants'

const QUERY = `(max-width: ${COMPACT_BREAKPOINT_PX}px)`

function mql(): MediaQueryList | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null
  return window.matchMedia(QUERY)
}

function isNarrow(): boolean {
  return mql()?.matches ?? false
}

export function useNarrowViewport(): boolean {
  return useSyncExternalStore(
    (listener) => {
      const m = mql()
      if (!m) return () => {}
      // Older Safari exposes addListener rather than addEventListener.
      if (m.addEventListener) {
        m.addEventListener('change', listener)
        return () => m.removeEventListener('change', listener)
      }
      m.addListener(listener)
      return () => m.removeListener(listener)
    },
    isNarrow,
    () => false,
  )
}
