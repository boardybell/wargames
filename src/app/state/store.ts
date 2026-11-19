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
let contextFactory: ((seedName: string) => EngineContext) | null = null
const listeners = new Set<() => void>()

export function setContext(ctx: EngineContext): void {
  context = ctx
}

/** Register the per-seed context builder so the store can rebind the mission
 *  modules when the active campaign switches seeds (NEW_CAMPAIGN to a different
 *  seed). The mission modules close over one seed's payload, so a seed change
 *  must rebuild the context or the screens would render the prior seed's
 *  content over the new campaign. Set once at boot. */
export function setContextFactory(
  factory: (seedName: string) => EngineContext,
): void {
  contextFactory = factory
}

/** Rebuild the context for a seed when a factory is set and the current
 *  context does not already bind that seed's modules. A no-op without a
 *  factory (tests inject a fixed context) or when the seed is unchanged. */
export function rebindContextForSeed(seedName: string): void {
  if (!contextFactory) return
  context = contextFactory(seedName)
}

export function getContext(): EngineContext {
  if (!context) throw new Error('state: store used before init')
  return context
}

/** The mission order the menu renders in, from the active context. */
export function getMissionOrder(): readonly string[] {
  return getContext().missionOrder
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
