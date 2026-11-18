// Local UI state for which overlay is open, plus the corrupt-notice
// session-dismissed bit. This is shell UI state, never engine state, and it
// does not persist (the corrupt dismissal lasts only the session). Settings
// and help are overlays, not engine phases: opening one never changes the
// screen router.
import { useSyncExternalStore } from 'react'

export type OverlayKind = 'pause' | 'settings' | 'newCampaign' | 'help'

let overlay: OverlayKind | null = null
let corruptDismissed = false
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function getOverlay(): OverlayKind | null {
  return overlay
}

export function openOverlay(kind: OverlayKind): void {
  overlay = kind
  notify()
}

export function closeOverlay(): void {
  overlay = null
  notify()
}

export function isCorruptDismissed(): boolean {
  return corruptDismissed
}

export function dismissCorrupt(): void {
  corruptDismissed = true
  notify()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useOverlay(): OverlayKind | null {
  return useSyncExternalStore(subscribe, getOverlay, getOverlay)
}

export function useCorruptDismissed(): boolean {
  return useSyncExternalStore(subscribe, isCorruptDismissed, isCorruptDismissed)
}

/** Test-only. */
export function __resetDialogState(): void {
  overlay = null
  corruptDismissed = false
  listeners.clear()
}
