diff --git a/eslint.config.js b/eslint.config.js
index c37d5b0..c1588f9 100644
--- a/eslint.config.js
+++ b/eslint.config.js
@@ -16,7 +16,9 @@ export default tseslint.config(
   },
   ...tseslint.configs.recommended,
   {
-    files: ['test/**'],
+    // Test tree plus the test-double export, which keeps interface
+    // parameters it deliberately ignores.
+    files: ['test/**', 'src/engine/testing/**'],
     rules: {
       '@typescript-eslint/no-unused-vars': [
         'error',
diff --git a/src/engine/testing/index.ts b/src/engine/testing/index.ts
new file mode 100644
index 0000000..20706b2
--- /dev/null
+++ b/src/engine/testing/index.ts
@@ -0,0 +1,198 @@
+// The permanent test-double mission (amendment 5): exported for every
+// downstream split's test tree, excluded from the shipped public
+// surface and the production bundle. It exercises the full lifecycle:
+// both terminal causes, a clues() path, consequence emission, a
+// timerMilestone schedule, and a reference-only substate schema. It
+// also records every input it sees so tests can prove missions receive
+// draws and times only through events.
+import * as v from 'valibot'
+import type {
+  FoldedConsequences,
+  MissionEvent,
+  MissionModule,
+  SeedDefinition,
+} from '../missions/types'
+import type {
+  SettledOutcome,
+  SettlementCause,
+} from '../campaign/types'
+import type { EngineContext } from '../campaign/engine'
+import type { ScheduledEventSpec } from '../time'
+import type { EvidenceRecord } from '../records'
+
+export interface TestDoubleState {
+  delivered: number
+  goal: number
+  decoySent: boolean
+  poisoned: boolean
+  auditRead: boolean
+  inbound: Record<string, number>
+  /** Every event input observed, proving nothing arrives ambiently. */
+  inputLog: string[]
+}
+
+export const testDoubleSchema = v.object({
+  delivered: v.pipe(v.number(), v.integer()),
+  goal: v.pipe(v.number(), v.integer()),
+  decoySent: v.boolean(),
+  poisoned: v.boolean(),
+  auditRead: v.boolean(),
+  inbound: v.record(v.string(), v.pipe(v.number(), v.integer())),
+  inputLog: v.array(v.string()),
+})
+
+export type TestDoubleAction =
+  | { kind: 'DELIVER' }
+  | { kind: 'DECOY' }
+  | { kind: 'POISON' }
+  | { kind: 'READ_AUDIT' }
+
+const CONSEQUENCE_MAGNITUDES: Record<string, number> = {
+  alpha: 30,
+  beta: 20,
+  gamma: 5,
+}
+
+export function makeTestDoubleMission(
+  id: string,
+): MissionModule<TestDoubleState> {
+  return {
+    id,
+    init(
+      _seed: SeedDefinition,
+      consequences: FoldedConsequences,
+      _durationMs: number,
+    ): TestDoubleState {
+      return {
+        delivered: 0,
+        goal: 3,
+        decoySent: false,
+        poisoned: false,
+        auditRead: false,
+        inbound: { ...consequences.byKind },
+        inputLog: [],
+      }
+    },
+    validate(state, payload) {
+      const action = payload as TestDoubleAction
+      if (!action || typeof action.kind !== 'string') {
+        return { valid: false, reason: 'MALFORMED ACTION' }
+      }
+      if (action.kind === 'DELIVER' && state.delivered >= state.goal) {
+        return { valid: false, reason: 'GOAL ALREADY MET' }
+      }
+      return { valid: true }
+    },
+    reduce(state, event: MissionEvent): TestDoubleState {
+      const logged = {
+        ...state,
+        inputLog: [...state.inputLog, `${event.type}:${event.id}@${event.now}`],
+      }
+      if (event.type === 'action') {
+        const action = event.payload as TestDoubleAction
+        if (action.kind === 'DELIVER') {
+          return { ...logged, delivered: logged.delivered + 1 }
+        }
+        if (action.kind === 'DECOY') return { ...logged, decoySent: true }
+        if (action.kind === 'POISON') return { ...logged, poisoned: true }
+        if (action.kind === 'READ_AUDIT') return { ...logged, auditRead: true }
+      }
+      return logged
+    },
+    evaluate(state, cause: SettlementCause): SettledOutcome {
+      const tier =
+        state.delivered >= state.goal
+          ? 'full'
+          : state.delivered === 2
+            ? 'partial'
+            : state.delivered === 1
+              ? 'poor'
+              : 'failed'
+      return {
+        missionId: id,
+        cause,
+        tier,
+        metrics: {
+          wopr_resolved: state.goal - state.delivered,
+          service_cost: (state.goal - state.delivered) * 10,
+        },
+        clueId: state.auditRead ? `clue-${id}` : null,
+        consequences:
+          tier === 'full'
+            ? []
+            : [
+                {
+                  id: `cq-${id}`,
+                  kind: 'commsDelayed',
+                  magnitude: CONSEQUENCE_MAGNITUDES[id] ?? 10,
+                },
+              ],
+      }
+    },
+    terminal(state) {
+      if (state.poisoned) return 'collapsed'
+      if (state.delivered >= state.goal) return 'completed'
+      return null
+    },
+    clues(state) {
+      return state.auditRead ? [`clue-${id}`] : []
+    },
+    saveSchema: testDoubleSchema,
+  }
+}
+
+const TEST_SCHEDULE: ScheduledEventSpec[] = [
+  {
+    id: 'warn-30',
+    offsetSeconds: 30,
+    anchor: 'end',
+    kind: 'timerMilestone',
+    payload: null,
+  },
+  {
+    id: 'warn-10',
+    offsetSeconds: 10,
+    anchor: 'end',
+    kind: 'timerMilestone',
+    payload: null,
+  },
+  {
+    id: 'mid-stage',
+    offsetSeconds: 60,
+    anchor: 'start',
+    kind: 'stage',
+    payload: null,
+  },
+]
+
+/** A ready-to-use context over three test-double missions and the
+ *  supplied record graph; the campaign and downstream suites build on
+ *  this one helper. */
+export function buildTestContext(
+  records: readonly EvidenceRecord[],
+  overrides: Partial<SeedDefinition> = {},
+): EngineContext {
+  const seed: SeedDefinition = {
+    name: 'test-seed',
+    description: 'test-double fixture seed',
+    seedNumber: 1984,
+    exerciseRunId: 'R04',
+    records,
+    deskChecks: [],
+    clueRecords: [],
+    missionPayloads: { alpha: null, beta: null, gamma: null },
+    schedules: { alpha: TEST_SCHEDULE, beta: [], gamma: [] },
+    missionDurationsMs: { alpha: 240_000, beta: 240_000, gamma: 240_000 },
+    openExceptionsBaseline: 12,
+    ...overrides,
+  }
+  return {
+    seeds: { [seed.name]: seed },
+    missions: {
+      alpha: makeTestDoubleMission('alpha'),
+      beta: makeTestDoubleMission('beta'),
+      gamma: makeTestDoubleMission('gamma'),
+    },
+    missionOrder: ['alpha', 'beta', 'gamma'],
+  }
+}
diff --git a/test/engine/campaign/fixtures.ts b/test/engine/campaign/fixtures.ts
index 453e898..804a1bb 100644
--- a/test/engine/campaign/fixtures.ts
+++ b/test/engine/campaign/fixtures.ts
@@ -1,7 +1,7 @@
 import type { EngineContext } from '@engine/campaign/engine'
 import type { SeedDefinition } from '@engine/missions/types'
 import { FIXTURE_RECORDS } from '../records/fixtures'
-import { makeStubMission } from './stub-mission'
+import { makeTestDoubleMission } from '@engine/testing'
 
 export const MISSIONS = ['alpha', 'beta', 'gamma'] as const
 
@@ -74,9 +74,9 @@ export function makeContext(): EngineContext {
   return {
     seeds: { 'test-seed': TEST_SEED },
     missions: {
-      alpha: makeStubMission('alpha'),
-      beta: makeStubMission('beta'),
-      gamma: makeStubMission('gamma'),
+      alpha: makeTestDoubleMission('alpha'),
+      beta: makeTestDoubleMission('beta'),
+      gamma: makeTestDoubleMission('gamma'),
     },
     missionOrder: [...MISSIONS],
   }
diff --git a/test/engine/campaign/stub-mission.ts b/test/engine/campaign/stub-mission.ts
deleted file mode 100644
index d5ab33a..0000000
--- a/test/engine/campaign/stub-mission.ts
+++ /dev/null
@@ -1,116 +0,0 @@
-// Minimal stub mission for campaign-machine specs: deliver 3 of 5
-// tokens before the deadline, one decoy, one consequence emitted.
-// Section 06 supersedes it with the permanent test double.
-import * as v from 'valibot'
-import type {
-  FoldedConsequences,
-  MissionEvent,
-  MissionModule,
-  SeedDefinition,
-} from '@engine/missions/types'
-import type { SettledOutcome, SettlementCause } from '@engine/campaign/types'
-
-export interface StubState {
-  delivered: number
-  goal: number
-  decoySent: boolean
-  poisoned: boolean
-  auditRead: boolean
-  inbound: Record<string, number>
-}
-
-const stubSchema = v.object({
-  delivered: v.pipe(v.number(), v.integer()),
-  goal: v.pipe(v.number(), v.integer()),
-  decoySent: v.boolean(),
-  poisoned: v.boolean(),
-  auditRead: v.boolean(),
-  inbound: v.record(v.string(), v.pipe(v.number(), v.integer())),
-})
-
-export type StubAction =
-  | { kind: 'DELIVER' }
-  | { kind: 'DECOY' }
-  | { kind: 'POISON' }
-  | { kind: 'READ_AUDIT' }
-
-export function makeStubMission(id: string): MissionModule<StubState> {
-  return {
-    id,
-    init(
-      _seed: SeedDefinition,
-      consequences: FoldedConsequences,
-      _durationMs: number,
-    ): StubState {
-      return {
-        delivered: 0,
-        goal: 3,
-        decoySent: false,
-        poisoned: false,
-        auditRead: false,
-        inbound: { ...consequences.byKind },
-      }
-    },
-    validate(state, payload) {
-      const action = payload as StubAction
-      if (!action || typeof action.kind !== 'string') {
-        return { valid: false, reason: 'MALFORMED ACTION' }
-      }
-      if (action.kind === 'DELIVER' && state.delivered >= state.goal) {
-        return { valid: false, reason: 'GOAL ALREADY MET' }
-      }
-      return { valid: true }
-    },
-    reduce(state, event: MissionEvent): StubState {
-      if (event.type === 'action') {
-        const action = event.payload as StubAction
-        if (action.kind === 'DELIVER') {
-          return { ...state, delivered: state.delivered + 1 }
-        }
-        if (action.kind === 'DECOY') return { ...state, decoySent: true }
-        if (action.kind === 'POISON') return { ...state, poisoned: true }
-        if (action.kind === 'READ_AUDIT') return { ...state, auditRead: true }
-      }
-      return state
-    },
-    evaluate(state, cause: SettlementCause): SettledOutcome {
-      const tier =
-        state.delivered >= state.goal
-          ? 'full'
-          : state.delivered === 2
-            ? 'partial'
-            : state.delivered === 1
-              ? 'poor'
-              : 'failed'
-      return {
-        missionId: id,
-        cause,
-        tier,
-        metrics: {
-          wopr_resolved: state.goal - state.delivered,
-          service_cost: (state.goal - state.delivered) * 10,
-        },
-        clueId: state.auditRead ? `clue-${id}` : null,
-        consequences:
-          tier === 'full'
-            ? []
-            : [
-                {
-                  id: `cq-${id}`,
-                  kind: 'commsDelayed',
-                  magnitude: ({ alpha: 30, beta: 20, gamma: 5 } as Record<string, number>)[id] ?? 10,
-                },
-              ],
-      }
-    },
-    terminal(state) {
-      if (state.poisoned) return 'collapsed'
-      if (state.delivered >= state.goal) return 'completed'
-      return null
-    },
-    clues(state) {
-      return state.auditRead ? [`clue-${id}`] : []
-    },
-    saveSchema: stubSchema,
-  }
-}
diff --git a/test/engine/missions/interface.test.ts b/test/engine/missions/interface.test.ts
new file mode 100644
index 0000000..7a82f74
--- /dev/null
+++ b/test/engine/missions/interface.test.ts
@@ -0,0 +1,82 @@
+import { describe, expect, it } from 'vitest'
+import * as v from 'valibot'
+import {
+  buildTestContext,
+  makeTestDoubleMission,
+  testDoubleSchema,
+} from '@engine/testing'
+import type { TestDoubleState } from '@engine/testing'
+import { createCampaign, dispatch } from '@engine/campaign/engine'
+import { FIXTURE_RECORDS } from '../records/fixtures'
+
+const ctx = buildTestContext(FIXTURE_RECORDS, {
+  deskChecks: [
+    {
+      recordId: 'W02',
+      outcome: 'CONFIRMED',
+      delaySeconds: 20,
+      replyBody: ['CONFIRMED'],
+    },
+  ],
+  clueRecords: [{ recordId: 'F06', clueId: 'clue-restriction' }],
+})
+const T0 = 1_000_000
+
+describe('mission-module lifecycle through the engine', () => {
+  it('substate round-trips through the saveSchema and rejects corruption', () => {
+    const module = makeTestDoubleMission('alpha')
+    const substate = module.init(
+      ctx.seeds['test-seed']!,
+      { byKind: { commsDelayed: 5 } },
+      240_000,
+    )
+    const revived = v.parse(testDoubleSchema, JSON.parse(JSON.stringify(substate)))
+    expect(revived).toEqual(substate)
+    const corrupted = { ...substate, delivered: 'three' }
+    expect(() => v.parse(testDoubleSchema, corrupted)).toThrow()
+  })
+
+  it('missions see draws and times only through events (input log proof)', () => {
+    const started = dispatch(
+      ctx,
+      createCampaign(ctx, 'test-seed', { extendedTime: false }),
+      { type: 'START_MISSION', missionId: 'alpha' },
+      T0,
+    )
+    const acted = dispatch(
+      ctx,
+      started.state,
+      { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } },
+      T0 + 70_000,
+    )
+    const substate = acted.state.activeMission?.substate as TestDoubleState
+    // The drained mid-stage event arrives with its SCHEDULED time, the
+    // action with the envelope now: every input is event-carried.
+    expect(substate.inputLog).toEqual([
+      `scheduled:mid-stage@${T0 + 60_000}`,
+      'action:action-0@1070000',
+    ])
+  })
+
+  it('extended duration doubles endsAt and scales start-anchored offsets only', () => {
+    const extended = dispatch(
+      ctx,
+      {
+        ...createCampaign(ctx, 'test-seed', { extendedTime: true }),
+      },
+      { type: 'START_MISSION', missionId: 'alpha' },
+      T0,
+    )
+    expect(extended.state.activeMission?.endsAt).toBe(T0 + 480_000)
+    const queue = extended.state.missionQueue
+    const byId = Object.fromEntries(queue.map((e) => [e.id, e.scheduledAt]))
+    expect(byId['mid-stage']).toBe(T0 + 120_000)
+    expect(byId['warn-30']).toBe(T0 + 480_000 - 30_000)
+    expect(byId['warn-10']).toBe(T0 + 480_000 - 10_000)
+  })
+
+  it('the test double registers through the shared context helper', () => {
+    expect(Object.keys(ctx.missions).sort()).toEqual(['alpha', 'beta', 'gamma'])
+    expect(ctx.missionOrder).toEqual(['alpha', 'beta', 'gamma'])
+  })
+})
