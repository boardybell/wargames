// An inert injection seam read once at shell boot, before the engine binding.
// In production it does nothing and ships as a handful of dead-cheap lines: the
// window flag is never set. Under Playwright, a page.addInitScript sets
// window.__WARGAMES_E2E__.extraSeeds (SeedDefinition[] carried across the
// boundary from @engine/testing in the Node context) so the browser can run a
// test-only seed the production catalog must never contain. The bundle under
// test is byte-identical to the deployed artifact apart from this dormant
// conditional.
//
// The merge is non-mutating: extra seeds are added to the seed map and the
// per-seed context factory is wrapped so a NEW_CAMPAIGN or a restored save on an
// extra seed rebinds against the same augmented catalog. An extra seed reuses
// the production mission modules bound to its own payloads, exactly as a catalog
// seed would.
import type { EngineContext } from '@engine'
import type { SeedDefinition } from '@engine/missions/types'
import { makeOutlookMission } from '@engine/missions/outlook/module'
import type { OutlookPayload } from '@engine/missions/outlook/content'
import { makeFlightsMission } from '@engine/missions/flights/module'
import type { FlightsPayload } from '@engine/missions/flights/content'
import { makeBankMission } from '@engine/missions/bank/module'
import type { BankPayload } from '@engine/missions/bank/content'
import { makeFinaleMission } from '@engine/missions/finale/module'
import type { FinalePayload } from '@engine/missions/finale/module'

interface E2EConfig {
  readonly extraSeeds?: readonly SeedDefinition[]
}

declare global {
  interface Window {
    __WARGAMES_E2E__?: E2EConfig
  }
}

/** Read the inert e2e config off the window, or null when absent (production). */
export function readE2EConfig(): E2EConfig | null {
  if (typeof window === 'undefined') return null
  return window.__WARGAMES_E2E__ ?? null
}

/** Bind the four real mission modules to a seed's own payloads, mirroring the
 *  production context builder. An extra seed carries its finale payload on
 *  missionPayloads already (the Node builder projects it), so this reads it
 *  straight off rather than re-deriving. */
function missionsForSeed(seed: SeedDefinition): EngineContext['missions'] {
  return {
    outlook: makeOutlookMission(seed.missionPayloads.outlook as OutlookPayload),
    flights: makeFlightsMission(seed.missionPayloads.flights as FlightsPayload),
    bank: makeBankMission(seed.missionPayloads.bank as BankPayload),
    finale: makeFinaleMission(seed.missionPayloads.finale as FinalePayload),
  }
}

/** Merge any injected extra seeds into a context: add them to the seed map so a
 *  campaign on an extra seed resolves its definition. When the active seedName
 *  is an extra seed, rebind the mission modules to that seed's payloads. A no-op
 *  when nothing is injected. */
export function augmentContext(
  ctx: EngineContext,
  seedName: string,
  config: E2EConfig | null = readE2EConfig(),
): EngineContext {
  const extras = config?.extraSeeds
  if (!extras || extras.length === 0) return ctx
  const seeds = { ...ctx.seeds }
  for (const seed of extras) seeds[seed.name] = seed
  const activeExtra = extras.find((s) => s.name === seedName)
  return {
    ...ctx,
    seeds,
    missions: activeExtra ? missionsForSeed(activeExtra) : ctx.missions,
  }
}
