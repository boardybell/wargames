// The production EngineContext: the three curated seeds plus a finale payload
// derived per seed, with the four real mission modules (CRASH OUTLOOK, GROUND
// ALL FLIGHTS, FREEZE BANK ACCOUNTS, GLOBAL FAILSAFE) registered under their
// ids. The catalog seeds ship with finale payload null because the finale
// payload is a projection of the seed (its record graph, its exercise run, its
// exercise-export root, and the designated field report), not an independently
// authored block. This module computes that projection once and makes it the
// single ctx the shell boots on. No procedural generation: every input is the
// hand-authored catalog.
import type { EngineContext } from '../campaign/engine'
import type { EvidenceRecord } from '../records'
import type { SeedDefinition } from '../missions/types'
import { makeOutlookMission } from '../missions/outlook/module'
import type { OutlookPayload } from '../missions/outlook/content'
import { makeFlightsMission } from '../missions/flights/module'
import type { FlightsPayload } from '../missions/flights/content'
import { makeBankMission } from '../missions/bank/module'
import type { BankPayload } from '../missions/bank/content'
import { makeFinaleMission } from '../missions/finale/module'
import type { FinalePayload } from '../missions/finale/module'
import {
  FINALE_FIELD_REPORT,
  MISSION_IDS,
  FINALE_ID,
  SEED_CATALOG,
} from './catalog'

/** The exercise-export root of a seed: its single EXERCISE-origin record. The
 *  finale case builder treats this id as the claim's root source, so it is a
 *  derived fact of the seed, not a separate authored value. Throws when a seed
 *  has not exactly one EXERCISE record, which the catalog validators forbid. */
function exerciseRootId(records: readonly EvidenceRecord[]): string {
  const roots = records.filter((r) => r.origin === 'EXERCISE')
  if (roots.length !== 1) {
    throw new Error(
      `context: seed must have exactly one EXERCISE record, found ${roots.length}`,
    )
  }
  return roots[0]!.id
}

/** Project the finale payload from a seed: the whole record graph, the seed's
 *  exercise run as the claimed run, its exercise-export root, and the
 *  seed-designated field report. */
function finalePayloadFor(seed: SeedDefinition): FinalePayload {
  const fieldReportId = FINALE_FIELD_REPORT[seed.name]
  if (!fieldReportId) {
    throw new Error(`context: no finale field report mapped for seed ${seed.name}`)
  }
  return {
    records: seed.records,
    claimRunId: seed.exerciseRunId,
    rootRecordId: exerciseRootId(seed.records),
    fieldReportId,
  }
}

/** The seed the engine binds to carries the finale payload on its
 *  missionPayloads, so the finale selector (which reads it off the active seed)
 *  resolves it. The catalog definition stays untouched upstream; this is a
 *  non-mutating augmentation applied only in the production context. */
function withFinalePayload(seed: SeedDefinition): SeedDefinition {
  return {
    ...seed,
    missionPayloads: {
      ...seed.missionPayloads,
      finale: finalePayloadFor(seed),
    },
  }
}

/** Build the single production EngineContext the shell boots on: every seed
 *  carrying its derived finale payload, the four real mission modules bound to
 *  the active seed's payloads, and the three playable missions in menu order.
 *  Deterministic and pure; no I/O. */
export function createProductionContext(seedName: string): EngineContext {
  const base = SEED_CATALOG[seedName]
  if (!base) throw new Error(`context: unknown seed ${seedName}`)

  const seeds: Record<string, SeedDefinition> = {}
  for (const [name, def] of Object.entries(SEED_CATALOG)) {
    seeds[name] = withFinalePayload(def)
  }
  const seed = seeds[seedName]!

  const outlook = seed.missionPayloads.outlook as OutlookPayload
  const flights = seed.missionPayloads.flights as FlightsPayload
  const bank = seed.missionPayloads.bank as BankPayload
  const finale = seed.missionPayloads[FINALE_ID] as FinalePayload

  return {
    seeds,
    missions: {
      [MISSION_IDS[0]]: makeOutlookMission(outlook),
      [MISSION_IDS[1]]: makeFlightsMission(flights),
      [MISSION_IDS[2]]: makeBankMission(bank),
      [FINALE_ID]: makeFinaleMission(finale),
    },
    missionOrder: [...MISSION_IDS],
  }
}

/** The seed a fresh campaign starts from: the restored session, run R04. The
 *  catalog's seed one and the requirements fixture. */
export const DEFAULT_SEED_NAME = 'exercise-r04'
