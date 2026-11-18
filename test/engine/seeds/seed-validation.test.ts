import { describe, expect, it } from 'vitest'
import {
  FINALE_DECISION_MARGIN_S,
  FINALE_FIELD_REPORT,
  MISSION_IDS,
  SEED_CATALOG,
  SEED_NAMES,
  seedCatalogMetadata,
} from '@engine/seeds/catalog'
import { buildRecordGraph, isIndependentObservation } from '@engine/records'
import { assertJsonSafe } from '../harness/canonical'

const seeds = SEED_NAMES.map((name) => SEED_CATALOG[name]!)

describe.each(seeds.map((s) => [s.name, s] as const))(
  'seed validation: %s',
  (_name, seed) => {
    const graph = buildRecordGraph(seed.records)

    it('story times are seconds-of-day integers within one day', () => {
      for (const record of seed.records) {
        for (const t of [record.eventTime, record.receiptTime]) {
          expect(Number.isInteger(t)).toBe(true)
          expect(t).toBeGreaterThanOrEqual(0)
          expect(t).toBeLessThan(86_400)
        }
      }
    })

    it('parent chains resolve, stay acyclic, and run time-forward', () => {
      for (const record of seed.records) {
        const visited = new Set<string>([record.id])
        let cursor = record.parentId
        let child = record
        while (cursor !== null) {
          expect(visited.has(cursor)).toBe(false)
          visited.add(cursor)
          const parent = seed.records.find((r) => r.id === cursor)
          expect(parent, `${record.id} parent ${cursor}`).toBeTruthy()
          expect(child.eventTime).toBeGreaterThanOrEqual(parent!.eventTime)
          child = parent!
          cursor = parent!.parentId
        }
      }
    })

    it('receipt order contradicts event order among the three core records', () => {
      const core = seed.records.filter((r) => r.origin !== 'OBSERVED')
      expect(core).toHaveLength(3)
      const byEvent = [...core].sort((a, b) => a.eventTime - b.eventTime)
      const byReceipt = [...core].sort((a, b) => a.receiptTime - b.receiptTime)
      // The inversion must swap the derived pair: the leaf (bank) is
      // received before the mid (flights) even though it happened later.
      const bankId = core.find((r) => r.subsystem === 'bank')!.id
      const flightsId = core.find((r) => r.subsystem === 'flights')!.id
      const receiptIds = byReceipt.map((r) => r.id)
      const eventIds = byEvent.map((r) => r.id)
      expect(receiptIds.indexOf(bankId)).toBeLessThan(
        receiptIds.indexOf(flightsId),
      )
      expect(eventIds.indexOf(flightsId)).toBeLessThan(
        eventIds.indexOf(bankId),
      )
    })

    it('the role structure holds: exercise root, derived chain, two observed (decoy + field report)', () => {
      const root = seed.records.find((r) => r.origin === 'EXERCISE')
      expect(root?.runId).toBe(seed.exerciseRunId)
      expect(root?.parentId).toBeNull()
      const derived = seed.records.filter((r) => r.origin === 'DERIVED')
      expect(derived).toHaveLength(2)
      const leaf = derived.find((r) =>
        derived.some((other) => other.id === r.parentId),
      )
      expect(leaf?.subsystem).toBe('bank')
      const observed = seed.records.filter((r) => r.origin === 'OBSERVED')
      expect(observed).toHaveLength(2)
      // One is the local-scope decoy occurring during the incident; the
      // other is the finale field report (the later OBSERVED record).
      const fieldReportId = FINALE_FIELD_REPORT[seed.name]
      const decoy = observed.find((r) => r.id !== fieldReportId)
      expect(decoy, 'a distinct decoy OBSERVED record').toBeTruthy()
      expect(decoy!.eventTime).toBeLessThan(
        observed.find((r) => r.id === fieldReportId)!.eventTime,
      )
    })

    it('independence discriminates: observed pass, exercise and derived fail', () => {
      const run = seed.exerciseRunId
      for (const record of seed.records) {
        const verdict = isIndependentObservation(graph, record.id, run)
        if (record.origin === 'OBSERVED') {
          expect(verdict.independent, record.id).toBe(true)
        } else {
          expect(verdict.independent, record.id).toBe(false)
        }
      }
      const independentCount = seed.records.filter(
        (r) => isIndependentObservation(graph, r.id, run).independent,
      ).length
      expect(independentCount).toBe(2)
    })

    it('every mission has a clue source: inspection-gated or module-driven', () => {
      const clueRecords = new Set(seed.clueRecords.map((c) => c.recordId))
      for (const entry of seed.clueRecords) {
        expect(seed.records.some((r) => r.id === entry.recordId)).toBe(true)
      }
      expect(clueRecords.size).toBe(seed.clueRecords.length)
      // flights and bank are inspection-gated via clueRecords; outlook is
      // module-driven via clues() (audit read, built in split 03). Assert
      // the clueRecords cover exactly the inspection-gated missions and
      // name the outlook exemption so a dropped clue source fails here.
      const inspectionGated = new Set(
        seed.clueRecords.map((c) => {
          const record = seed.records.find((r) => r.id === c.recordId)!
          return record.subsystem
        }),
      )
      expect([...inspectionGated].sort()).toEqual(['bank', 'flights'])
      const MODULE_CLUE_MISSIONS = new Set(['outlook'])
      for (const missionId of MISSION_IDS) {
        const covered =
          inspectionGated.has(missionId) || MODULE_CLUE_MISSIONS.has(missionId)
        expect(covered, `${missionId} clue source`).toBe(true)
      }
    })

    it('the finale field report is observed, independent, and desk-bounded in both durations', () => {
      const reportId = FINALE_FIELD_REPORT[seed.name]
      expect(reportId).toBeTruthy()
      const record = seed.records.find((r) => r.id === reportId)
      expect(record?.origin).toBe('OBSERVED')
      expect(
        isIndependentObservation(graph, reportId!, seed.exerciseRunId)
          .independent,
      ).toBe(true)
      const desk = seed.deskChecks.find((d) => d.recordId === reportId)
      expect(desk?.outcome).toBe('CONFIRMED')
      // The desk delay is absolute seconds; the deadline only grows under
      // extended time, so STANDARD duration is the tight bound. Assert it,
      // and confirm extended (doubled) stays safe too.
      const standardSeconds = seed.missionDurationsMs['finale']! / 1000
      expect(desk!.delaySeconds).toBeLessThanOrEqual(
        standardSeconds - FINALE_DECISION_MARGIN_S,
      )
      const extendedSeconds = standardSeconds * 2
      expect(desk!.delaySeconds).toBeLessThanOrEqual(
        extendedSeconds - FINALE_DECISION_MARGIN_S,
      )
    })

    it('every referenced record id has a desk entry and all values are integers', () => {
      const recordIds = new Set(seed.records.map((r) => r.id))
      for (const check of seed.deskChecks) {
        expect(recordIds.has(check.recordId)).toBe(true)
        expect(Number.isInteger(check.delaySeconds)).toBe(true)
      }
      for (const duration of Object.values(seed.missionDurationsMs)) {
        expect(Number.isInteger(duration)).toBe(true)
      }
      expect(Number.isInteger(seed.openExceptionsBaseline)).toBe(true)
      expect(Number.isInteger(seed.seedNumber)).toBe(true)
    })

    it('every mission schedule carries the end-anchored warnings', () => {
      for (const missionId of [...MISSION_IDS, 'finale']) {
        const schedule = seed.schedules[missionId] ?? []
        const warnings = schedule.filter(
          (spec) => spec.kind === 'timerMilestone' && spec.anchor === 'end',
        )
        expect(
          warnings.map((w) => w.offsetSeconds).sort((a, b) => a - b),
        ).toEqual([10, 30])
      }
    })

    it('the seed is JSON-safe and stable', () => {
      expect(() => assertJsonSafe(seed)).not.toThrow()
      expect(JSON.parse(JSON.stringify(seed))).toEqual(seed)
    })
  },
)

describe('catalog surface', () => {
  it('exactly three named seeds with descriptions', () => {
    expect(SEED_NAMES).toHaveLength(3)
    const metadata = seedCatalogMetadata()
    for (const entry of metadata) {
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })

  it('seed one matches the requirements table verbatim', () => {
    const seed = SEED_CATALOG['exercise-r04']!
    const byId = Object.fromEntries(seed.records.map((r) => [r.id, r]))
    expect(byId['C17']).toMatchObject({
      origin: 'EXERCISE',
      sourceId: 'D83-EXPORT',
      runId: 'R04',
      eventTime: 76440,
      receiptTime: 76445,
    })
    expect(byId['F06']).toMatchObject({
      origin: 'DERIVED',
      parentId: 'C17',
      runId: 'R04',
      eventTime: 76448,
      receiptTime: 76492,
    })
    expect(byId['B04']).toMatchObject({
      origin: 'DERIVED',
      parentId: 'F06',
      eventTime: 76461,
      receiptTime: 76470,
    })
    expect(byId['W02']).toMatchObject({ origin: 'OBSERVED', runId: null })
    // R21 is the deliberate fifth record: the post-incident finale field
    // report, OBSERVED and independent, distinct from the W02 decoy.
    expect(byId['R21']).toMatchObject({
      origin: 'OBSERVED',
      runId: null,
      parentId: null,
    })
    expect(byId['R21']!.eventTime).toBeGreaterThan(byId['W02']!.eventTime)
    expect(FINALE_FIELD_REPORT['exercise-r04']).toBe('R21')
  })
})
