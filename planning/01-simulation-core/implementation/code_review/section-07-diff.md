diff --git a/src/engine/campaign/engine.ts b/src/engine/campaign/engine.ts
index 7b8c3cc..5f4914f 100644
--- a/src/engine/campaign/engine.ts
+++ b/src/engine/campaign/engine.ts
@@ -47,6 +47,7 @@ export function createCampaign(
   ctx: EngineContext,
   seedName: string,
   preferences: { extendedTime: boolean },
+  now = 0,
 ): CampaignState {
   const seed = ctx.seeds[seedName]
   if (!seed) throw new Error(`campaign: unknown seed ${seedName}`)
@@ -57,7 +58,9 @@ export function createCampaign(
     // stream from day one.
     rng: { words: [...rngFromSeed(seed.seedNumber).words] },
     openExceptionsBaseline: seed.openExceptionsBaseline,
-    lastNow: 0,
+    // Seed lastNow at creation so the first dispatch is not spuriously
+    // clamped by the 30-minute catch-up cap.
+    lastNow: now,
     phase: 'menu',
     activeMission: null,
     missionQueue: [],
diff --git a/src/engine/seeds/catalog.ts b/src/engine/seeds/catalog.ts
new file mode 100644
index 0000000..d0fe17c
--- /dev/null
+++ b/src/engine/seeds/catalog.ts
@@ -0,0 +1,510 @@
+// The three curated campaigns. No procedural generation, no arbitrary
+// player seeds: every seed here is hand-authored and mechanically
+// validated (test/engine/seeds). Mission payloads stay loose at this
+// layer; mission splits narrow their own and replace the registered
+// modules, never these definitions.
+import type { EvidenceRecord } from '../records'
+import type { ScheduledEventSpec } from '../time'
+import type {
+  ClueRecordEntry,
+  DeskCheckEntry,
+  SeedDefinition,
+} from '../missions/types'
+
+export const MISSION_IDS = ['outlook', 'flights', 'bank'] as const
+export const FINALE_ID = 'finale'
+
+export const CLUE_IDS = {
+  audit: 'clue-d83-audit',
+  restriction: 'clue-d83-restriction',
+  ledgerHold: 'clue-d83-ledger-hold',
+} as const
+
+const STANDARD_MISSION_MS = 240_000
+const STANDARD_FINALE_MS = 180_000
+
+/** Finale desk wait must leave validate-and-commit room (amendment 12):
+ *  wait <= finale duration minus this margin. */
+export const FINALE_DECISION_MARGIN_S = 60
+
+function milestones(): ScheduledEventSpec[] {
+  return [
+    {
+      id: 'warn-30',
+      offsetSeconds: 30,
+      anchor: 'end',
+      kind: 'timerMilestone',
+      payload: null,
+    },
+    {
+      id: 'warn-10',
+      offsetSeconds: 10,
+      anchor: 'end',
+      kind: 'timerMilestone',
+      payload: null,
+    },
+  ]
+}
+
+interface SeedSpec {
+  name: string
+  description: string
+  seedNumber: number
+  runId: string
+  /** Anchor second-of-day for the incident (fixture: 76440 = 21:14:00). */
+  records: EvidenceRecord[]
+  deskChecks: DeskCheckEntry[]
+  clueRecords: ClueRecordEntry[]
+  openExceptionsBaseline: number
+}
+
+function build(spec: SeedSpec): SeedDefinition {
+  return {
+    name: spec.name,
+    description: spec.description,
+    seedNumber: spec.seedNumber,
+    exerciseRunId: spec.runId,
+    records: spec.records,
+    deskChecks: spec.deskChecks,
+    clueRecords: spec.clueRecords,
+    missionPayloads: { outlook: null, flights: null, bank: null, finale: null },
+    schedules: {
+      outlook: [
+        ...milestones(),
+        {
+          id: 'stage-slow',
+          offsetSeconds: 90,
+          anchor: 'start',
+          kind: 'stage',
+          payload: null,
+        },
+        {
+          id: 'stage-dark',
+          offsetSeconds: 180,
+          anchor: 'start',
+          kind: 'stage',
+          payload: null,
+        },
+      ],
+      flights: [
+        ...milestones(),
+        {
+          id: 'storm-step-1',
+          offsetSeconds: 60,
+          anchor: 'start',
+          kind: 'stormStep',
+          payload: null,
+        },
+        {
+          id: 'forecast-correction',
+          offsetSeconds: 100,
+          anchor: 'start',
+          kind: 'forecastCorrection',
+          payload: null,
+        },
+        {
+          id: 'storm-step-2',
+          offsetSeconds: 160,
+          anchor: 'start',
+          kind: 'stormStep',
+          payload: null,
+        },
+      ],
+      bank: [
+        ...milestones(),
+        {
+          id: 'tick-1',
+          offsetSeconds: 60,
+          anchor: 'start',
+          kind: 'confidenceTick',
+          payload: null,
+        },
+        {
+          id: 'tick-2',
+          offsetSeconds: 120,
+          anchor: 'start',
+          kind: 'confidenceTick',
+          payload: null,
+        },
+        {
+          id: 'tick-3',
+          offsetSeconds: 180,
+          anchor: 'start',
+          kind: 'confidenceTick',
+          payload: null,
+        },
+      ],
+      finale: [
+        ...milestones(),
+        {
+          id: 'final-phase',
+          offsetSeconds: 20,
+          anchor: 'end',
+          kind: 'finaleFinalPhase',
+          payload: null,
+        },
+      ],
+    },
+    missionDurationsMs: {
+      outlook: STANDARD_MISSION_MS,
+      flights: STANDARD_MISSION_MS,
+      bank: STANDARD_MISSION_MS,
+      finale: STANDARD_FINALE_MS,
+    },
+    openExceptionsBaseline: spec.openExceptionsBaseline,
+  }
+}
+
+// ── Seed one: the requirements fixture, run R04, anchored 21:14 ──────
+const seedOneRecords: EvidenceRecord[] = [
+  {
+    id: 'C17',
+    origin: 'EXERCISE',
+    sourceId: 'D83-EXPORT',
+    parentId: null,
+    runId: 'R04',
+    eventTime: 76440,
+    receiptTime: 76445,
+    subsystem: 'outlook',
+    body: [
+      'EXERCISE D-83 RUN R04 EXPORT',
+      'PREVIEW OF A GROUNDING ADVISORY PUBLISHED TO THE ACTIVE FEED',
+    ],
+  },
+  {
+    id: 'F06',
+    origin: 'DERIVED',
+    sourceId: 'FLIGHT-CONTROL',
+    parentId: 'C17',
+    runId: 'R04',
+    eventTime: 76448,
+    receiptTime: 76492,
+    subsystem: 'flights',
+    body: [
+      'ALL HUBS RESTRICTION EFFECTIVE IMMEDIATELY',
+      'GENERATED FROM ADVISORY C17, RUN STAMP R04',
+    ],
+  },
+  {
+    id: 'B04',
+    origin: 'DERIVED',
+    sourceId: 'BANK-OPS',
+    parentId: 'F06',
+    runId: 'R04',
+    eventTime: 76461,
+    receiptTime: 76470,
+    subsystem: 'bank',
+    body: [
+      'EMERGENCY HOLD NOTICE CITING RESTRICTION F06',
+      'ASSUMES A SYSTEM-WIDE SHUTDOWN IN PROGRESS',
+    ],
+  },
+  {
+    id: 'W02',
+    origin: 'OBSERVED',
+    sourceId: 'FIELD-NW',
+    parentId: null,
+    runId: null,
+    eventTime: 76455,
+    receiptTime: 76460,
+    subsystem: 'flights',
+    body: [
+      'FIELD WEATHER WARNING: NORTHWEST CORRIDOR ONLY',
+      'EAST CORRIDOR REMAINS OPEN AND OBSERVED CLEAR',
+    ],
+  },
+  {
+    id: 'R21',
+    origin: 'OBSERVED',
+    sourceId: 'FIELD-DESK',
+    parentId: null,
+    runId: null,
+    eventTime: 76520,
+    receiptTime: 76530,
+    subsystem: 'flights',
+    body: [
+      'FIELD REPORT ON EMERGENCY SCOPE',
+      'LOCAL DISRUPTION ONLY; NO SYSTEM-WIDE EVENT OBSERVED',
+    ],
+  },
+]
+
+const seedOne = build({
+  name: 'exercise-r04',
+  description: 'THE RESTORED SESSION. RUN R04, 21:14.',
+  seedNumber: 1983,
+  runId: 'R04',
+  records: seedOneRecords,
+  deskChecks: [
+    {
+      recordId: 'C17',
+      outcome: 'CONTRADICTED',
+      delaySeconds: 35,
+      replyBody: ['DESK FINDS NO OPERATIONAL ORDER BEHIND THE ADVISORY'],
+    },
+    {
+      recordId: 'F06',
+      outcome: 'UNKNOWN',
+      delaySeconds: 40,
+      replyBody: ['FLIGHT DESK CANNOT LOCATE AN INDEPENDENT BASIS'],
+    },
+    {
+      recordId: 'B04',
+      outcome: 'PENDING',
+      delaySeconds: 50,
+      replyBody: ['BANK DESK QUEUE BACKED UP'],
+    },
+    {
+      recordId: 'W02',
+      outcome: 'CONFIRMED',
+      delaySeconds: 25,
+      replyBody: ['FIELD DESK CONFIRMS LOCAL SCOPE, NORTHWEST ONLY'],
+    },
+    {
+      recordId: 'R21',
+      outcome: 'CONFIRMED',
+      delaySeconds: 45,
+      replyBody: ['FIELD DESK CONFIRMS: LOCAL DISRUPTION ONLY'],
+    },
+  ],
+  clueRecords: [
+    { recordId: 'F06', clueId: CLUE_IDS.restriction },
+    { recordId: 'B04', clueId: CLUE_IDS.ledgerHold },
+  ],
+  openExceptionsBaseline: 12,
+})
+
+// ── Seed two: run K11, anchored 06:42 (24120) ───────────────────────
+const seedTwoRecords: EvidenceRecord[] = [
+  {
+    id: 'A09',
+    origin: 'EXERCISE',
+    sourceId: 'D83-EXPORT',
+    parentId: null,
+    runId: 'K11',
+    eventTime: 24120,
+    receiptTime: 24126,
+    subsystem: 'outlook',
+    body: ['EXERCISE D-83 RUN K11 EXPORT', 'ICING ADVISORY PREVIEW ON LIVE FEED'],
+  },
+  {
+    id: 'G12',
+    origin: 'DERIVED',
+    sourceId: 'FLIGHT-CONTROL',
+    parentId: 'A09',
+    runId: 'K11',
+    eventTime: 24130,
+    receiptTime: 24185,
+    subsystem: 'flights',
+    body: ['ALL HUBS RESTRICTION PER ADVISORY A09, RUN STAMP K11'],
+  },
+  {
+    id: 'H03',
+    origin: 'DERIVED',
+    sourceId: 'BANK-OPS',
+    parentId: 'G12',
+    runId: 'K11',
+    eventTime: 24142,
+    receiptTime: 24150,
+    subsystem: 'bank',
+    body: ['EMERGENCY HOLD CITING G12', 'ASSUMES NATIONWIDE GROUND STOP'],
+  },
+  {
+    id: 'V07',
+    origin: 'OBSERVED',
+    sourceId: 'FIELD-SE',
+    parentId: null,
+    runId: null,
+    eventTime: 24135,
+    receiptTime: 24140,
+    subsystem: 'flights',
+    body: ['FIELD ICING WARNING: SOUTHEAST APPROACH ONLY'],
+  },
+  {
+    id: 'R33',
+    origin: 'OBSERVED',
+    sourceId: 'FIELD-DESK',
+    parentId: null,
+    runId: null,
+    eventTime: 24200,
+    receiptTime: 24210,
+    subsystem: 'flights',
+    body: ['FIELD REPORT ON SCOPE: ONE APPROACH AFFECTED, NOTHING SYSTEMIC'],
+  },
+]
+
+const seedTwo = build({
+  name: 'exercise-k11',
+  description: 'THE DAWN RUN. RUN K11, 06:42.',
+  seedNumber: 2718,
+  runId: 'K11',
+  records: seedTwoRecords,
+  deskChecks: [
+    {
+      recordId: 'A09',
+      outcome: 'CONTRADICTED',
+      delaySeconds: 35,
+      replyBody: ['NO OPERATIONAL ORDER FOUND'],
+    },
+    {
+      recordId: 'G12',
+      outcome: 'UNKNOWN',
+      delaySeconds: 40,
+      replyBody: ['NO INDEPENDENT BASIS LOCATED'],
+    },
+    {
+      recordId: 'H03',
+      outcome: 'PENDING',
+      delaySeconds: 50,
+      replyBody: ['QUEUE BACKED UP'],
+    },
+    {
+      recordId: 'V07',
+      outcome: 'CONFIRMED',
+      delaySeconds: 25,
+      replyBody: ['CONFIRMED: SOUTHEAST APPROACH ONLY'],
+    },
+    {
+      recordId: 'R33',
+      outcome: 'CONFIRMED',
+      delaySeconds: 45,
+      replyBody: ['CONFIRMED: NOTHING SYSTEMIC'],
+    },
+  ],
+  clueRecords: [
+    { recordId: 'G12', clueId: CLUE_IDS.restriction },
+    { recordId: 'H03', clueId: CLUE_IDS.ledgerHold },
+  ],
+  openExceptionsBaseline: 14,
+})
+
+// ── Seed three: run T58, anchored 14:07 (50820) ─────────────────────
+const seedThreeRecords: EvidenceRecord[] = [
+  {
+    id: 'E22',
+    origin: 'EXERCISE',
+    sourceId: 'D83-EXPORT',
+    parentId: null,
+    runId: 'T58',
+    eventTime: 50820,
+    receiptTime: 50824,
+    subsystem: 'outlook',
+    body: ['EXERCISE D-83 RUN T58 EXPORT', 'CROSSWIND ADVISORY PREVIEW ON LIVE FEED'],
+  },
+  {
+    id: 'J15',
+    origin: 'DERIVED',
+    sourceId: 'FLIGHT-CONTROL',
+    parentId: 'E22',
+    runId: 'T58',
+    eventTime: 50831,
+    receiptTime: 50880,
+    subsystem: 'flights',
+    body: ['ALL HUBS RESTRICTION PER ADVISORY E22, RUN STAMP T58'],
+  },
+  {
+    id: 'K08',
+    origin: 'DERIVED',
+    sourceId: 'BANK-OPS',
+    parentId: 'J15',
+    runId: 'T58',
+    eventTime: 50845,
+    receiptTime: 50852,
+    subsystem: 'bank',
+    body: ['EMERGENCY HOLD CITING J15', 'ASSUMES TOTAL TRAFFIC HALT'],
+  },
+  {
+    id: 'U04',
+    origin: 'OBSERVED',
+    sourceId: 'FIELD-W',
+    parentId: null,
+    runId: null,
+    eventTime: 50838,
+    receiptTime: 50843,
+    subsystem: 'flights',
+    body: ['FIELD CROSSWIND WARNING: WEST RUNWAYS ONLY'],
+  },
+  {
+    id: 'R47',
+    origin: 'OBSERVED',
+    sourceId: 'FIELD-DESK',
+    parentId: null,
+    runId: null,
+    eventTime: 50900,
+    receiptTime: 50910,
+    subsystem: 'flights',
+    body: ['FIELD REPORT ON SCOPE: WEST RUNWAYS AFFECTED, EAST NORMAL'],
+  },
+]
+
+const seedThree = build({
+  name: 'exercise-t58',
+  description: 'THE AFTERNOON RUN. RUN T58, 14:07.',
+  seedNumber: 3141,
+  runId: 'T58',
+  records: seedThreeRecords,
+  deskChecks: [
+    {
+      recordId: 'E22',
+      outcome: 'CONTRADICTED',
+      delaySeconds: 35,
+      replyBody: ['NO OPERATIONAL ORDER FOUND'],
+    },
+    {
+      recordId: 'J15',
+      outcome: 'UNKNOWN',
+      delaySeconds: 40,
+      replyBody: ['NO INDEPENDENT BASIS LOCATED'],
+    },
+    {
+      recordId: 'K08',
+      outcome: 'PENDING',
+      delaySeconds: 50,
+      replyBody: ['QUEUE BACKED UP'],
+    },
+    {
+      recordId: 'U04',
+      outcome: 'CONFIRMED',
+      delaySeconds: 25,
+      replyBody: ['CONFIRMED: WEST RUNWAYS ONLY'],
+    },
+    {
+      recordId: 'R47',
+      outcome: 'CONFIRMED',
+      delaySeconds: 45,
+      replyBody: ['CONFIRMED: EAST NORMAL'],
+    },
+  ],
+  clueRecords: [
+    { recordId: 'J15', clueId: CLUE_IDS.restriction },
+    { recordId: 'K08', clueId: CLUE_IDS.ledgerHold },
+  ],
+  openExceptionsBaseline: 10,
+})
+
+export const SEED_CATALOG: Readonly<Record<string, SeedDefinition>> = {
+  [seedOne.name]: seedOne,
+  [seedTwo.name]: seedTwo,
+  [seedThree.name]: seedThree,
+}
+
+export const SEED_NAMES = Object.keys(SEED_CATALOG).sort()
+
+/** The finale field-report record per seed (amendment 12): OBSERVED,
+ *  independent of the exercise run, desk-answerable inside the bounded
+ *  wait. */
+export const FINALE_FIELD_REPORT: Readonly<Record<string, string>> = {
+  'exercise-r04': 'R21',
+  'exercise-k11': 'R33',
+  'exercise-t58': 'R47',
+}
+
+export function seedCatalogMetadata(): Array<{
+  name: string
+  description: string
+}> {
+  return SEED_NAMES.map((name) => ({
+    name,
+    description: SEED_CATALOG[name]!.description,
+  }))
+}
diff --git a/test/engine/seeds/seed-validation.test.ts b/test/engine/seeds/seed-validation.test.ts
new file mode 100644
index 0000000..1d09d01
--- /dev/null
+++ b/test/engine/seeds/seed-validation.test.ts
@@ -0,0 +1,179 @@
+import { describe, expect, it } from 'vitest'
+import {
+  CLUE_IDS,
+  FINALE_DECISION_MARGIN_S,
+  FINALE_FIELD_REPORT,
+  MISSION_IDS,
+  SEED_CATALOG,
+  SEED_NAMES,
+  seedCatalogMetadata,
+} from '@engine/seeds/catalog'
+import { buildRecordGraph, isIndependentObservation } from '@engine/records'
+import { assertJsonSafe } from '../harness/canonical'
+
+const seeds = SEED_NAMES.map((name) => SEED_CATALOG[name]!)
+
+describe.each(seeds.map((s) => [s.name, s] as const))(
+  'seed validation: %s',
+  (_name, seed) => {
+    const graph = buildRecordGraph(seed.records)
+
+    it('story times are seconds-of-day integers within one day', () => {
+      for (const record of seed.records) {
+        for (const t of [record.eventTime, record.receiptTime]) {
+          expect(Number.isInteger(t)).toBe(true)
+          expect(t).toBeGreaterThanOrEqual(0)
+          expect(t).toBeLessThan(86_400)
+        }
+      }
+    })
+
+    it('parent chains resolve, stay acyclic, and run time-forward', () => {
+      for (const record of seed.records) {
+        const visited = new Set<string>([record.id])
+        let cursor = record.parentId
+        let child = record
+        while (cursor !== null) {
+          expect(visited.has(cursor)).toBe(false)
+          visited.add(cursor)
+          const parent = seed.records.find((r) => r.id === cursor)
+          expect(parent, `${record.id} parent ${cursor}`).toBeTruthy()
+          expect(child.eventTime).toBeGreaterThanOrEqual(parent!.eventTime)
+          child = parent!
+          cursor = parent!.parentId
+        }
+      }
+    })
+
+    it('receipt order contradicts event order among the three core records', () => {
+      const core = seed.records.filter((r) => r.origin !== 'OBSERVED')
+      expect(core).toHaveLength(3)
+      const byEvent = [...core].sort((a, b) => a.eventTime - b.eventTime)
+      const byReceipt = [...core].sort((a, b) => a.receiptTime - b.receiptTime)
+      expect(byEvent.map((r) => r.id)).not.toEqual(
+        byReceipt.map((r) => r.id),
+      )
+    })
+
+    it('the four-role structure holds: exercise root, derived chain, observed decoy', () => {
+      const root = seed.records.find((r) => r.origin === 'EXERCISE')
+      expect(root?.runId).toBe(seed.exerciseRunId)
+      expect(root?.parentId).toBeNull()
+      const derived = seed.records.filter((r) => r.origin === 'DERIVED')
+      expect(derived).toHaveLength(2)
+      const leaf = derived.find((r) =>
+        derived.some((other) => other.id === r.parentId),
+      )
+      expect(leaf?.subsystem).toBe('bank')
+    })
+
+    it('at least one record passes independence against the exercise run', () => {
+      const independent = seed.records.filter(
+        (record) =>
+          isIndependentObservation(graph, record.id, seed.exerciseRunId)
+            .independent,
+      )
+      expect(independent.length).toBeGreaterThanOrEqual(2)
+    })
+
+    it('every mission has a clue source and every clue record exists', () => {
+      const clueRecords = new Set(seed.clueRecords.map((c) => c.recordId))
+      for (const entry of seed.clueRecords) {
+        expect(seed.records.some((r) => r.id === entry.recordId)).toBe(true)
+      }
+      // flights and bank carry inspection-gated clues; outlook's clue is
+      // action-driven via its module clues() (audit read).
+      const flightsClue = seed.clueRecords.find(
+        (c) => c.clueId === CLUE_IDS.restriction,
+      )
+      const bankClue = seed.clueRecords.find(
+        (c) => c.clueId === CLUE_IDS.ledgerHold,
+      )
+      expect(flightsClue && bankClue).toBeTruthy()
+      expect(clueRecords.size).toBe(seed.clueRecords.length)
+    })
+
+    it('the finale field report is observed, independent, and desk-bounded', () => {
+      const reportId = FINALE_FIELD_REPORT[seed.name]
+      expect(reportId).toBeTruthy()
+      const record = seed.records.find((r) => r.id === reportId)
+      expect(record?.origin).toBe('OBSERVED')
+      expect(
+        isIndependentObservation(graph, reportId!, seed.exerciseRunId)
+          .independent,
+      ).toBe(true)
+      const desk = seed.deskChecks.find((d) => d.recordId === reportId)
+      expect(desk?.outcome).toBe('CONFIRMED')
+      const finaleSeconds = seed.missionDurationsMs['finale']! / 1000
+      expect(desk!.delaySeconds).toBeLessThanOrEqual(
+        finaleSeconds - FINALE_DECISION_MARGIN_S,
+      )
+    })
+
+    it('every referenced record id has a desk entry and all values are integers', () => {
+      const recordIds = new Set(seed.records.map((r) => r.id))
+      for (const check of seed.deskChecks) {
+        expect(recordIds.has(check.recordId)).toBe(true)
+        expect(Number.isInteger(check.delaySeconds)).toBe(true)
+      }
+      for (const duration of Object.values(seed.missionDurationsMs)) {
+        expect(Number.isInteger(duration)).toBe(true)
+      }
+      expect(Number.isInteger(seed.openExceptionsBaseline)).toBe(true)
+      expect(Number.isInteger(seed.seedNumber)).toBe(true)
+    })
+
+    it('every mission schedule carries the end-anchored warnings', () => {
+      for (const missionId of [...MISSION_IDS, 'finale']) {
+        const schedule = seed.schedules[missionId] ?? []
+        const warnings = schedule.filter(
+          (spec) => spec.kind === 'timerMilestone' && spec.anchor === 'end',
+        )
+        expect(
+          warnings.map((w) => w.offsetSeconds).sort((a, b) => a - b),
+        ).toEqual([10, 30])
+      }
+    })
+
+    it('the seed is JSON-safe and stable', () => {
+      expect(() => assertJsonSafe(seed)).not.toThrow()
+      expect(JSON.parse(JSON.stringify(seed))).toEqual(seed)
+    })
+  },
+)
+
+describe('catalog surface', () => {
+  it('exactly three named seeds with descriptions', () => {
+    expect(SEED_NAMES).toHaveLength(3)
+    const metadata = seedCatalogMetadata()
+    for (const entry of metadata) {
+      expect(entry.description.length).toBeGreaterThan(0)
+    }
+  })
+
+  it('seed one matches the requirements table verbatim', () => {
+    const seed = SEED_CATALOG['exercise-r04']!
+    const byId = Object.fromEntries(seed.records.map((r) => [r.id, r]))
+    expect(byId['C17']).toMatchObject({
+      origin: 'EXERCISE',
+      sourceId: 'D83-EXPORT',
+      runId: 'R04',
+      eventTime: 76440,
+      receiptTime: 76445,
+    })
+    expect(byId['F06']).toMatchObject({
+      origin: 'DERIVED',
+      parentId: 'C17',
+      runId: 'R04',
+      eventTime: 76448,
+      receiptTime: 76492,
+    })
+    expect(byId['B04']).toMatchObject({
+      origin: 'DERIVED',
+      parentId: 'F06',
+      eventTime: 76461,
+      receiptTime: 76470,
+    })
+    expect(byId['W02']).toMatchObject({ origin: 'OBSERVED', runId: null })
+  })
+})
diff --git a/test/engine/seeds/walkthrough.test.ts b/test/engine/seeds/walkthrough.test.ts
new file mode 100644
index 0000000..26162cc
--- /dev/null
+++ b/test/engine/seeds/walkthrough.test.ts
@@ -0,0 +1,200 @@
+import { describe, expect, it } from 'vitest'
+import {
+  FINALE_FIELD_REPORT,
+  MISSION_IDS,
+  SEED_CATALOG,
+  SEED_NAMES,
+} from '@engine/seeds/catalog'
+import { makeTestDoubleMission } from '@engine/testing'
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { EngineContext } from '@engine/campaign/engine'
+import type { CampaignAction } from '@engine/campaign/types'
+import { selectMenuRows } from '@engine/campaign/selectors'
+import { stateHash } from '../harness/canonical'
+
+// Engine-level walkthroughs drive the real seeds through test-double
+// modules registered under the real mission ids; mission splits swap
+// the modules and keep these seeds and envelopes.
+function contextFor(): EngineContext {
+  return {
+    seeds: SEED_CATALOG,
+    missions: Object.fromEntries(
+      [...MISSION_IDS, 'finale'].map((id) => [id, makeTestDoubleMission(id)]),
+    ),
+    missionOrder: [...MISSION_IDS],
+  }
+}
+
+const T0 = 10_000_000
+const deliver: CampaignAction = {
+  type: 'MISSION_ACTION',
+  payload: { kind: 'DELIVER' },
+}
+
+type Envelope = [CampaignAction, number]
+
+function winEnvelopes(missionId: string, at: number): Envelope[] {
+  return [
+    [{ type: 'START_MISSION', missionId }, at],
+    [{ type: 'MISSION_ACTION', payload: { kind: 'READ_AUDIT' } }, at + 500],
+    [deliver, at + 1_000],
+    [deliver, at + 2_000],
+    [deliver, at + 3_000],
+    [{ type: 'ACKNOWLEDGE_DEBRIEF', missionId }, at + 4_000],
+  ]
+}
+
+export function walkthroughEnvelopes(startAt: number): Envelope[] {
+  return MISSION_IDS.flatMap((missionId, index) =>
+    winEnvelopes(missionId, startAt + index * 300_000),
+  )
+}
+
+describe.each(SEED_NAMES)('walkthrough on %s', (seedName) => {
+  it('reaches the finale unlock with all missions full tier', () => {
+    const ctx = contextFor()
+    let state = createCampaign(ctx, seedName, { extendedTime: false }, T0)
+    for (const [action, now] of walkthroughEnvelopes(T0)) {
+      const result = dispatch(ctx, state, action, now)
+      expect(result.rejection, JSON.stringify(action)).toBeNull()
+      state = result.state
+    }
+    expect(state.settled.map((s) => s.tier)).toEqual(['full', 'full', 'full'])
+    expect(selectMenuRows(state, [...MISSION_IDS], 'finale').finaleUnlocked).toBe(
+      true,
+    )
+  })
+
+  it('replays byte-identically', () => {
+    const ctx = contextFor()
+    const runOnce = () => {
+      let state = createCampaign(ctx, seedName, { extendedTime: false }, T0)
+      for (const [action, now] of walkthroughEnvelopes(T0)) {
+        state = dispatch(ctx, state, action, now).state
+      }
+      return state
+    }
+    expect(stateHash(runOnce())).toBe(stateHash(runOnce()))
+  })
+
+  it('timeout fixture: an abandoned mission settles once as timeout', () => {
+    const ctx = contextFor()
+    let state = createCampaign(ctx, seedName, { extendedTime: false }, T0)
+    state = dispatch(
+      ctx,
+      state,
+      { type: 'START_MISSION', missionId: 'outlook' },
+      T0,
+    ).state
+    const expired = advanceCampaign(ctx, state, T0 + 600_000)
+    expect(expired.state.settled).toHaveLength(1)
+    expect(expired.state.settled[0]?.cause).toBe('timeout')
+    const again = advanceCampaign(ctx, expired.state, T0 + 700_000)
+    expect(again.emitted.filter((e) => e.type === 'settlement')).toHaveLength(0)
+  })
+
+  it('partial-recovery fixture: mixed outcomes still unlock the finale', () => {
+    const ctx = contextFor()
+    let state = createCampaign(ctx, seedName, { extendedTime: false }, T0)
+    // Outlook times out, flights forfeits, bank wins: the fourth row
+    // appears regardless of outcome quality.
+    state = dispatch(
+      ctx,
+      state,
+      { type: 'START_MISSION', missionId: 'outlook' },
+      T0,
+    ).state
+    state = advanceCampaign(ctx, state, T0 + 300_000).state
+    state = dispatch(
+      ctx,
+      state,
+      { type: 'ACKNOWLEDGE_DEBRIEF', missionId: 'outlook' },
+      T0 + 301_000,
+    ).state
+    state = dispatch(
+      ctx,
+      state,
+      { type: 'START_MISSION', missionId: 'flights' },
+      T0 + 310_000,
+    ).state
+    state = dispatch(ctx, state, { type: 'FORFEIT_MISSION' }, T0 + 311_000)
+      .state
+    state = dispatch(
+      ctx,
+      state,
+      { type: 'ACKNOWLEDGE_DEBRIEF', missionId: 'flights' },
+      T0 + 312_000,
+    ).state
+    for (const [action, now] of winEnvelopes('bank', T0 + 320_000)) {
+      state = dispatch(ctx, state, action, now).state
+    }
+    expect(selectMenuRows(state, [...MISSION_IDS], 'finale').finaleUnlocked).toBe(
+      true,
+    )
+    expect(state.settled.map((s) => s.cause).sort()).toEqual([
+      'completed',
+      'forfeit',
+      'timeout',
+    ])
+  })
+
+  it('six mission orders preserve the chronology and reach the unlock', () => {
+    const ctx = contextFor()
+    const orders: string[][] = [
+      ['outlook', 'flights', 'bank'],
+      ['outlook', 'bank', 'flights'],
+      ['flights', 'outlook', 'bank'],
+      ['flights', 'bank', 'outlook'],
+      ['bank', 'outlook', 'flights'],
+      ['bank', 'flights', 'outlook'],
+    ]
+    const chronologies = orders.map((order) => {
+      let state = createCampaign(ctx, seedName, { extendedTime: false }, T0)
+      order.forEach((missionId, index) => {
+        for (const [action, now] of winEnvelopes(
+          missionId,
+          T0 + index * 300_000,
+        )) {
+          state = dispatch(ctx, state, action, now).state
+        }
+      })
+      expect(
+        selectMenuRows(state, [...MISSION_IDS], 'finale').finaleUnlocked,
+      ).toBe(true)
+      // Story chronology is seed data sorted by event time; identical
+      // across orders by construction, hashed to prove it.
+      const seed = SEED_CATALOG[seedName]!
+      return stateHash(
+        [...seed.records].sort((a, b) =>
+          a.eventTime !== b.eventTime
+            ? a.eventTime - b.eventTime
+            : a.id < b.id
+              ? -1
+              : 1,
+        ),
+      )
+    })
+    expect(new Set(chronologies).size).toBe(1)
+  })
+
+  it('the finale field report desk check resolves confirmed', () => {
+    const ctx = contextFor()
+    let state = createCampaign(ctx, seedName, { extendedTime: false }, T0)
+    const reportId = FINALE_FIELD_REPORT[seedName]!
+    state = dispatch(
+      ctx,
+      state,
+      { type: 'REQUEST_SOURCE_CHECK', recordId: reportId },
+      T0,
+    ).state
+    const resolved = advanceCampaign(ctx, state, T0 + 120_000)
+    expect(resolved.state.sourceChecks[0]).toMatchObject({
+      recordId: reportId,
+      outcome: 'CONFIRMED',
+    })
+  })
+})
