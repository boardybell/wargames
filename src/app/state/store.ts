// The one store the whole shell reads from. It owns the current
// CampaignState and the EngineContext (seed catalog + mission registry the
// later splits assemble). No reducer logic lives here; the engine is the
// reducer. Reads go through useSyncExternalStore so React 18 concurrent
// rendering always sees a consistent snapshot. setState and setContext are
// module-private; only send, wake, and init mutate.
import { useSyncExternalStore } from 'react'
import type { EngineContext } from '@engine'
import type { CampaignState } from '@engine'

let context: EngineContext | null = null
let state: CampaignState | null = null
const listeners = new Set<() => void>()

export function setContext(ctx: EngineContext): void {
  context = ctx
}

export function getContext(): EngineContext {
  if (!context) throw new Error('state: store used before init')
  return context
}

/** Internal: the only callers are send, wake, and init. */
export function setState(next: CampaignState): void {
  state = next
  for (const listener of listeners) listener()
}

export function getState(): CampaignState {
  if (!state) throw new Error('state: store read before init')
  return state
}

export function hasState(): boolean {
  return state !== null
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Subscription hook for components. Assumes init has run. */
export function useCampaign(): CampaignState {
  return useSyncExternalStore(subscribe, getState, getState)
}

/** Test-only: drop all state so each test starts clean. */
export function __resetStore(): void {
  context = null
  state = null
  listeners.clear()
}
