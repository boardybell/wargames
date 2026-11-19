// A test-only seed with the same records, evidence graph, and walkthrough-
// solvable content as seed one (exercise-r04), but with the mission deadline
// durations shrunk to about twenty seconds and the finale to about fifteen.
// Deadlines are durations relative to mission start in SeedDefinition tuning, so
// this is a pure tuning override, not a content fork: the walkthrough action
// scripts that win the production seed also win here, just inside a browser-
// testable window.
//
// This seed is exported through @engine/testing only. It must never enter
// src/engine/seeds/catalog.ts or the production bundle: the import-surface test
// excludes @engine/testing, and the catalog-exactness test (short-deadline-seed
// .test.ts) pins the catalog to the three production seed names so a stray
// import is caught. The marker in the name lets dist/ be grepped to prove no
// test-seed bytes shipped.
import type { SeedDefinition } from '../missions/types'
import type { ScheduledEventSpec } from '../time'
import { createProductionContext } from '../seeds/context'

/** A unique marker in the seed name so the production bundle can be grepped to
 *  prove this seed never shipped. */
export const SHORT_DEADLINE_SEED_NAME = 'e2e-short-deadline'

export const SHORT_MISSION_MS = 20_000
export const SHORT_FINALE_MS = 15_000

/** Seed one carrying its projected finale payload, lifted from the production
 *  context so the short seed is a complete, bootable definition (the raw catalog
 *  entry has finale payload null; the context projects it). */
function productionSeedOne(): SeedDefinition {
  const ctx = createProductionContext('exercise-r04')
  return ctx.seeds['exercise-r04']!
}

/** Build the short-deadline seed: seed one's content and schedules, renamed,
 *  with the deadline durations overridden to the short tuning. Schedules keep
 *  their authored offsets; only the mission/finale durations shrink, which is
 *  all the deadline math reads. */
export function makeShortDeadlineSeed(): SeedDefinition {
  const base = productionSeedOne()
  const durations: Record<string, number> = {
    outlook: SHORT_MISSION_MS,
    flights: SHORT_MISSION_MS,
    bank: SHORT_MISSION_MS,
    finale: SHORT_FINALE_MS,
  }
  // Compressing the clock shrinks the window the end-anchored warnings must fit
  // inside: a warn-30 (30s before end) is meaningless against a 20s deadline and
  // the engine rejects it as a schedule authoring error. Prune any event whose
  // end-anchored offset no longer fits (offset >= the short duration in seconds).
  // Start-anchored events that would fire after settlement are harmless and kept.
  const prune = (
    missionId: string,
    events: readonly ScheduledEventSpec[],
  ): ScheduledEventSpec[] => {
    const durationSeconds = Math.floor((durations[missionId] ?? 0) / 1000)
    return events.filter(
      (e) => e.anchor !== 'end' || e.offsetSeconds < durationSeconds,
    )
  }
  const schedules: Record<string, ScheduledEventSpec[]> = {}
  for (const [missionId, events] of Object.entries(base.schedules)) {
    schedules[missionId] = prune(missionId, events)
  }
  return {
    ...base,
    name: SHORT_DEADLINE_SEED_NAME,
    description: 'E2E SHORT DEADLINE FIXTURE. SEED ONE, COMPRESSED CLOCK.',
    missionDurationsMs: durations,
    schedules,
  }
}

export const SHORT_DEADLINE_SEED: SeedDefinition = makeShortDeadlineSeed()
