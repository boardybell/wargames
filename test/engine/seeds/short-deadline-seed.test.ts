// The short-deadline fixture seed shares seed one's records, evidence graph,
// and walkthrough-solvable content, overriding only the deadline tuning. These
// node-level checks pin the two halves the e2e matrix depends on: the tuning is
// actually short, and the SHIPPED catalog never contains this seed.
import { describe, expect, it } from 'vitest'
import { buildRecordGraph, isIndependentObservation } from '@engine/records'
import { SEED_CATALOG, SEED_NAMES } from '@engine/seeds/catalog'
import { createProductionContext } from '@engine/seeds/context'
import {
  SHORT_DEADLINE_SEED,
  SHORT_DEADLINE_SEED_NAME,
  SHORT_FINALE_MS,
  SHORT_MISSION_MS,
} from '@engine/testing'
import { assertJsonSafe } from '../harness/canonical'

const PRODUCTION_SEED_NAMES = ['exercise-k11', 'exercise-r04', 'exercise-t58']

describe('short-deadline fixture seed', () => {
  it('shrinks every mission deadline to about twenty seconds and the finale to about fifteen', () => {
    // Assert the tuning values directly: the whole point of the seed is a
    // browser-testable countdown.
    expect(SHORT_MISSION_MS).toBe(20_000)
    expect(SHORT_FINALE_MS).toBe(15_000)
    expect(SHORT_DEADLINE_SEED.missionDurationsMs).toEqual({
      outlook: SHORT_MISSION_MS,
      flights: SHORT_MISSION_MS,
      bank: SHORT_MISSION_MS,
      finale: SHORT_FINALE_MS,
    })
    for (const ms of Object.values(SHORT_DEADLINE_SEED.missionDurationsMs)) {
      expect(Number.isInteger(ms)).toBe(true)
      expect(ms).toBeGreaterThan(0)
    }
  })

  it('keeps seed one content: same records, acyclic time-forward graph, independent observation present', () => {
    const seedOne = createProductionContext('exercise-r04').seeds['exercise-r04']!
    // Same record graph (content, not a fork): identical record set.
    expect(SHORT_DEADLINE_SEED.records).toEqual(seedOne.records)
    const graph = buildRecordGraph(SHORT_DEADLINE_SEED.records)
    // Parent chains resolve, stay acyclic, and run time-forward.
    for (const record of SHORT_DEADLINE_SEED.records) {
      const visited = new Set<string>([record.id])
      let cursor = record.parentId
      let child = record
      while (cursor !== null) {
        expect(visited.has(cursor)).toBe(false)
        visited.add(cursor)
        const parent = SHORT_DEADLINE_SEED.records.find((r) => r.id === cursor)
        expect(parent, `${record.id} parent ${cursor}`).toBeTruthy()
        expect(child.eventTime).toBeGreaterThanOrEqual(parent!.eventTime)
        child = parent!
        cursor = parent!.parentId
      }
    }
    // An independent OBSERVED record exists against the exercise run (the W02
    // weather corroborator), the finale's corroboration lever.
    const claimRunId = SHORT_DEADLINE_SEED.exerciseRunId
    const hasIndependent = SHORT_DEADLINE_SEED.records.some(
      (r) =>
        r.origin === 'OBSERVED' &&
        isIndependentObservation(graph, r.id, claimRunId).independent,
    )
    expect(hasIndependent).toBe(true)
  })

  it('is JSON-safe end to end (encode-decode round-trips through a save)', () => {
    assertJsonSafe(SHORT_DEADLINE_SEED)
  })

  it('is NOT in the shipped catalog: exactly the three production seeds remain', () => {
    expect(SEED_NAMES).toEqual(PRODUCTION_SEED_NAMES)
    expect(Object.keys(SEED_CATALOG).sort()).toEqual(PRODUCTION_SEED_NAMES)
    expect(SEED_NAMES).not.toContain(SHORT_DEADLINE_SEED_NAME)
    expect(SEED_CATALOG[SHORT_DEADLINE_SEED_NAME]).toBeUndefined()
  })
})
