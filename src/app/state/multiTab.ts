// Single-active-tab enforcement. A window storage event for a save key means
// another tab wrote it (the writing tab never receives its own event). On
// detection, raise the GAME OPEN IN ANOTHER TAB notice and pause local writes
// until reload. Single active tab is a documented limitation; no leader
// election is attempted.
import { pauseWrites, SAVE_KEYS } from './saveBinding'

let notice = false
const listeners = new Set<() => void>()

export function getMultiTabNotice(): boolean {
  return notice
}

export function onMultiTabNotice(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function handleStorage(event: StorageEvent): void {
  if (event.key && (SAVE_KEYS as readonly string[]).includes(event.key)) {
    if (!notice) {
      notice = true
      pauseWrites()
      for (const listener of listeners) listener()
    }
  }
}

export function registerMultiTab(): () => void {
  window.addEventListener('storage', handleStorage)
  return () => {
    window.removeEventListener('storage', handleStorage)
  }
}

/** Test-only. */
export function __resetMultiTab(): void {
  notice = false
  listeners.clear()
}
