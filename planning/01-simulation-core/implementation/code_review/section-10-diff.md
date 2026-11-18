diff --git a/src/engine/campaign/selectors.ts b/src/engine/campaign/selectors.ts
index 8cd6cd8..cc90831 100644
--- a/src/engine/campaign/selectors.ts
+++ b/src/engine/campaign/selectors.ts
@@ -24,6 +24,16 @@ export function selectSettledOutcome(
   return state.settled.find((s) => s.missionId === missionId) ?? null
 }
 
+/** Per-mission settled metrics for the finale's projections and the
+ *  earned-why readback (amendment 4). Null when the mission has not
+ *  settled; the returned record is the outcome's own metrics object. */
+export function selectSettledMetrics(
+  state: CampaignState,
+  missionId: string,
+): Readonly<Record<string, number>> | null {
+  return state.settled.find((s) => s.missionId === missionId)?.metrics ?? null
+}
+
 /** Real service outcomes: integer damage the same orders produced.
  *  Mission modules express them through the service_cost metric. */
 export function selectServiceOutcomes(state: CampaignState): number {
diff --git a/src/engine/index.ts b/src/engine/index.ts
index 45de203..c068114 100644
--- a/src/engine/index.ts
+++ b/src/engine/index.ts
@@ -1,3 +1,100 @@
-// Public engine surface. Section 10 finalizes this; until then it carries
-// the version marker the foundation smoke test imports.
+// The public engine surface. One rule: all player-driven mutation goes
+// through dispatch. No logic lives here; everything is re-exported from an
+// internal module, and the import-surface test pins this list exactly so a
+// new export cannot leak in untested.
+//
+// Signature note: createCampaign, dispatch, advanceCampaign, and runBranch
+// take a leading EngineContext (the seed catalog + mission registry) that
+// emerged during implementation; the shell assembles one ctx per session
+// and threads it. EngineContext is therefore part of the surface.
 export const ENGINE_VERSION = '0.1.0'
+
+export {
+  createCampaign,
+  dispatch,
+  advanceCampaign,
+  isMissionSettled,
+} from './campaign/engine'
+// EngineContext is public because the ctx (seed catalog + mission registry)
+// is threaded through createCampaign/dispatch/advanceCampaign/runBranch; the
+// shell assembles one per session. BriefingLine stays internal.
+export type { EngineContext } from './campaign/engine'
+
+export {
+  selectMenuRows,
+  selectOpenExceptions,
+  selectServiceOutcomes,
+  selectSettledOutcome,
+  selectSettledMetrics,
+  selectCorroboration,
+  selectCampaignBegun,
+} from './campaign/selectors'
+export type { MenuRow } from './campaign/selectors'
+
+export { snapshot, runBranch } from './branch'
+export type {
+  FrozenCampaignState,
+  BranchKind,
+  BranchProjection,
+  BranchStep,
+  BranchResult,
+  StagedViability,
+  ViabilityThreshold,
+} from './branch'
+export { BRANCH_KINDS } from './branch'
+
+export {
+  buildRecordGraph,
+  getRecord,
+  trace,
+  isIndependentObservation,
+  corroborationValue,
+} from './records'
+export type {
+  EvidenceRecord,
+  RecordGraph,
+  TraceResult,
+  Verdict,
+  SourceCheckOutcome,
+} from './records'
+
+export {
+  encodeSave,
+  decodeSave,
+  runMigrations,
+  loadCampaign,
+  persistCampaign,
+} from './save'
+export type {
+  StoragePort,
+  SavePayload,
+  RecoveryFlag,
+  LoadResult,
+  PersistResult,
+  Migration,
+} from './save'
+
+export { seedCatalogMetadata, SEED_NAMES } from './seeds/catalog'
+
+export type { CampaignState } from './campaign/state'
+export type {
+  CampaignAction,
+  EngineEvent,
+  SettledOutcome,
+  SettlementCause,
+  OutcomeTier,
+  Consequence,
+  SourceCheckResult,
+  CampaignPhase,
+  DispatchResult,
+} from './campaign/types'
+// MissionModule/MissionRegistry/SeedDefinition are the seams later splits
+// implement (missions) and assemble into an EngineContext; they are public
+// for that reason. MissionRuntime, AppliedMarker, and BriefingLine stay
+// internal — consumers read them via CampaignState, never by name.
+export type {
+  MissionModule,
+  MissionRegistry,
+  SeedDefinition,
+  DebriefPayload,
+} from './missions/types'
diff --git a/test/engine/api/public-surface.test.ts b/test/engine/api/public-surface.test.ts
new file mode 100644
index 0000000..ccb8e79
--- /dev/null
+++ b/test/engine/api/public-surface.test.ts
@@ -0,0 +1,109 @@
+import { describe, expect, it } from 'vitest'
+import * as Engine from '@engine'
+import * as Testing from '@engine/testing'
+import { buildCtx, T0 } from '../properties/helpers'
+import { stateHash } from '../harness/canonical'
+import type { CampaignAction } from '@engine'
+
+// The pinned public value surface. A new runtime export must be added here
+// deliberately, or this test fails — that is the leak guard.
+const EXPECTED_EXPORTS = [
+  'ENGINE_VERSION',
+  'createCampaign',
+  'dispatch',
+  'advanceCampaign',
+  'isMissionSettled',
+  'selectMenuRows',
+  'selectOpenExceptions',
+  'selectServiceOutcomes',
+  'selectSettledOutcome',
+  'selectSettledMetrics',
+  'selectCorroboration',
+  'selectCampaignBegun',
+  'snapshot',
+  'runBranch',
+  'BRANCH_KINDS',
+  'buildRecordGraph',
+  'getRecord',
+  'trace',
+  'isIndependentObservation',
+  'corroborationValue',
+  'encodeSave',
+  'decodeSave',
+  'runMigrations',
+  'loadCampaign',
+  'persistCampaign',
+  'seedCatalogMetadata',
+  'SEED_NAMES',
+]
+
+describe('public surface', () => {
+  it('exports exactly the documented runtime set, nothing more', () => {
+    const actual = Object.keys(Engine).sort()
+    expect(actual).toEqual([...EXPECTED_EXPORTS].sort())
+  })
+
+  it('importing @engine/testing does not widen the @engine surface', () => {
+    const engineKeys = new Set(Object.keys(Engine))
+    for (const key of Object.keys(Testing)) {
+      expect(engineKeys.has(key)).toBe(false)
+    }
+  })
+
+  it('dispatch reaches the full action set through the public export', () => {
+    const ctx = buildCtx()
+    let state = Engine.createCampaign(ctx, 'test-seed', { extendedTime: false })
+    const reached = new Set<string>()
+    const run = (action: CampaignAction, now: number): void => {
+      reached.add(action.type)
+      state = Engine.dispatch(ctx, state, action, now).state
+    }
+    let now = T0 + 1_000
+    run({ type: 'SET_PREFERENCE', preference: 'extendedTime', value: true }, now++)
+    run({ type: 'START_MISSION', missionId: 'alpha' }, now++)
+    run({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } }, now++)
+    run({ type: 'INSPECT_RECORD', recordId: 'C17' }, now++)
+    run({ type: 'REQUEST_SOURCE_CHECK', recordId: 'C17' }, now++)
+    run({ type: 'FORFEIT_MISSION' }, now++)
+    run({ type: 'ACKNOWLEDGE_DEBRIEF', missionId: 'alpha' }, now++)
+    run({ type: 'NEW_CAMPAIGN', seedName: 'test-seed' }, now++)
+    expect(reached).toEqual(
+      new Set([
+        'SET_PREFERENCE',
+        'START_MISSION',
+        'MISSION_ACTION',
+        'INSPECT_RECORD',
+        'REQUEST_SOURCE_CHECK',
+        'FORFEIT_MISSION',
+        'ACKNOWLEDGE_DEBRIEF',
+        'NEW_CAMPAIGN',
+      ]),
+    )
+  })
+
+  it('exported selectors are pure (state unchanged by observation)', () => {
+    const ctx = buildCtx()
+    let state = Engine.createCampaign(ctx, 'test-seed', { extendedTime: false })
+    state = Engine.dispatch(
+      ctx,
+      state,
+      { type: 'START_MISSION', missionId: 'alpha' },
+      T0 + 1_000,
+    ).state
+    state = Engine.dispatch(
+      ctx,
+      state,
+      { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } },
+      T0 + 2_000,
+    ).state
+    const before = stateHash(state)
+    Engine.selectMenuRows(state, ['alpha', 'beta', 'gamma'], 'finale')
+    Engine.selectOpenExceptions(state)
+    Engine.selectServiceOutcomes(state)
+    Engine.selectSettledOutcome(state, 'alpha')
+    Engine.selectSettledMetrics(state, 'alpha')
+    Engine.selectCorroboration(state, 'C17')
+    Engine.selectCampaignBegun(state)
+    expect(stateHash(state)).toBe(before)
+  })
+})
diff --git a/test/engine/properties/determinism-run-twice.test.ts b/test/engine/properties/determinism-run-twice.test.ts
new file mode 100644
index 0000000..c770759
--- /dev/null
+++ b/test/engine/properties/determinism-run-twice.test.ts
@@ -0,0 +1,74 @@
+import { describe, expect, it } from 'vitest'
+import { createCampaign } from '@engine/campaign/engine'
+import {
+  buildCtx,
+  foldEnvelopes,
+  jsonSafetyViolations,
+  timeoutLog,
+  walkthroughLog,
+  MISSION_IDS,
+  T0,
+} from './helpers'
+import { canonicalStringify, stateHash } from '../harness/canonical'
+
+function freshRun(log: ReturnType<typeof walkthroughLog>) {
+  const ctx = buildCtx()
+  const initial = createCampaign(ctx, 'test-seed', { extendedTime: false }, T0)
+  return foldEnvelopes(ctx, initial, log)
+}
+
+describe('canonical helper sanity at the integration level', () => {
+  it('key insertion order does not affect the hash', () => {
+    const a = { x: 1, y: { p: 2, q: 3 } }
+    const b = { y: { q: 3, p: 2 }, x: 1 }
+    expect(stateHash(a)).toBe(stateHash(b))
+  })
+
+  it('negative zero hashes identically to positive zero', () => {
+    expect(stateHash({ v: -0 })).toBe(stateHash({ v: 0 }))
+  })
+})
+
+describe('run-twice determinism', () => {
+  it('a full walkthrough folds to a bit-identical final state', () => {
+    const log = walkthroughLog(MISSION_IDS)
+    const first = freshRun(log)
+    const second = freshRun(log)
+    expect(second.state).toStrictEqual(first.state)
+    expect(stateHash(second.state)).toBe(stateHash(first.state))
+  })
+
+  it('reproduces the identical emitted event sequence', () => {
+    const log = walkthroughLog(MISSION_IDS)
+    const first = freshRun(log)
+    const second = freshRun(log)
+    expect(canonicalStringify(second.emitted)).toBe(
+      canonicalStringify(first.emitted),
+    )
+  })
+
+  it('a timeout walkthrough is equally deterministic', () => {
+    const log = timeoutLog()
+    const first = freshRun(log)
+    const second = freshRun(log)
+    expect(second.state).toStrictEqual(first.state)
+    expect(stateHash(second.state)).toBe(stateHash(first.state))
+    // The expiry path actually settled the mission.
+    expect(first.state.settled.some((s) => s.cause === 'timeout')).toBe(true)
+  })
+
+  it('discriminates: a different log produces a different hash (no stuck hash)', () => {
+    // Guards against a degenerate stateHash that returns a constant, which
+    // would make every determinism assertion pass vacuously.
+    const full = freshRun(walkthroughLog(MISSION_IDS))
+    const timed = freshRun(timeoutLog())
+    expect(stateHash(full.state)).not.toBe(stateHash(timed.state))
+  })
+
+  it('every intermediate state along the fold is JSON-safe', () => {
+    const run = freshRun(walkthroughLog(MISSION_IDS))
+    for (const state of run.trail) {
+      expect(jsonSafetyViolations(state)).toEqual([])
+    }
+  })
+})
diff --git a/test/engine/properties/helpers.ts b/test/engine/properties/helpers.ts
new file mode 100644
index 0000000..3dbaad0
--- /dev/null
+++ b/test/engine/properties/helpers.ts
@@ -0,0 +1,130 @@
+// Shared fixtures and folds for the cross-cutting property suites. Every
+// suite replays envelopes identically through this fold so determinism is
+// compared on one code path. Scoped to the permanent test-double mission:
+// the real seed missions land in splits 03-06, which bring their own
+// walkthrough fixtures; here the three test-double missions (alpha, beta,
+// gamma) carry the determinism story at the engine-core level.
+import { buildTestContext } from '@engine/testing'
+import { dispatch } from '@engine/campaign/engine'
+import type { EngineContext } from '@engine/campaign/engine'
+import type { CampaignAction, EngineEvent } from '@engine/campaign/types'
+import type { CampaignState } from '@engine/campaign/state'
+import { FIXTURE_RECORDS } from '../records/fixtures'
+
+export interface Envelope {
+  readonly action: CampaignAction
+  readonly now: number
+}
+
+export const T0 = 1_000_000
+export const MISSION_IDS = ['alpha', 'beta', 'gamma'] as const
+
+export function buildCtx(): EngineContext {
+  return buildTestContext(FIXTURE_RECORDS)
+}
+
+export interface FoldResult {
+  readonly state: CampaignState
+  readonly emitted: readonly EngineEvent[]
+  /** State after each envelope, including the initial, for replay slicing. */
+  readonly trail: readonly CampaignState[]
+}
+
+export function foldEnvelopes(
+  ctx: EngineContext,
+  initial: CampaignState,
+  log: readonly Envelope[],
+): FoldResult {
+  let state = initial
+  const emitted: EngineEvent[] = []
+  const trail: CampaignState[] = [state]
+  for (const { action, now } of log) {
+    const result = dispatch(ctx, state, action, now)
+    state = result.state
+    emitted.push(...result.emitted)
+    trail.push(state)
+  }
+  return { state, emitted, trail }
+}
+
+/** A full three-mission walkthrough over the test double: each mission
+ *  started, delivered to completion, and its debrief acknowledged, so the
+ *  finale gate unlocks. now values strictly increase. */
+export function walkthroughLog(
+  order: readonly string[] = MISSION_IDS,
+): Envelope[] {
+  const log: Envelope[] = []
+  let now = T0 + 1_000
+  for (const missionId of order) {
+    log.push({ action: { type: 'START_MISSION', missionId }, now })
+    now += 1_000
+    for (let i = 0; i < 3; i++) {
+      log.push({
+        action: { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } },
+        now,
+      })
+      now += 1_000
+    }
+    log.push({
+      action: { type: 'ACKNOWLEDGE_DEBRIEF', missionId },
+      now,
+    })
+    now += 1_000
+  }
+  return log
+}
+
+/** A walkthrough whose first mission is allowed to time out: start alpha,
+ *  then let the deadline pass before any delivery completes. Exercises the
+ *  expiry settlement path under replay. */
+export function timeoutLog(): Envelope[] {
+  const start = T0 + 1_000
+  // Mission duration is 240_000 ms; cross it with a wide margin.
+  const pastDeadline = start + 240_000 + 60_000
+  return [
+    { action: { type: 'START_MISSION', missionId: 'alpha' }, now: start },
+    { action: { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } }, now: start + 1_000 },
+    // This envelope's now is past the deadline: advance settles the mission
+    // by timeout before the action is considered.
+    { action: { type: 'INSPECT_RECORD', recordId: 'C17' }, now: pastDeadline },
+  ]
+}
+
+const DISALLOWED = new Set(['[object Map]', '[object Set]', '[object Date]'])
+
+/** Walk a value asserting it is JSON-safe: finite numbers only, no
+ *  undefined, NaN, Infinity, Map, Set, Date. Returns a list of violations
+ *  (empty when clean) with their paths. */
+export function jsonSafetyViolations(value: unknown, path = '$'): string[] {
+  const out: string[] = []
+  const visit = (v: unknown, p: string): void => {
+    if (v === null) return
+    if (typeof v === 'number') {
+      if (!Number.isFinite(v)) out.push(`${p}: non-finite number`)
+      return
+    }
+    if (typeof v === 'undefined') {
+      out.push(`${p}: undefined`)
+      return
+    }
+    if (typeof v === 'string' || typeof v === 'boolean') return
+    if (Array.isArray(v)) {
+      v.forEach((el, i) => visit(el, `${p}[${i}]`))
+      return
+    }
+    if (typeof v === 'object') {
+      const tag = Object.prototype.toString.call(v)
+      if (DISALLOWED.has(tag)) {
+        out.push(`${p}: ${tag}`)
+        return
+      }
+      for (const key of Object.keys(v as Record<string, unknown>)) {
+        visit((v as Record<string, unknown>)[key], `${p}.${key}`)
+      }
+      return
+    }
+    out.push(`${p}: ${typeof v}`)
+  }
+  visit(value, path)
+  return out
+}
diff --git a/test/engine/properties/model-commands.test.ts b/test/engine/properties/model-commands.test.ts
new file mode 100644
index 0000000..6c32a67
--- /dev/null
+++ b/test/engine/properties/model-commands.test.ts
@@ -0,0 +1,291 @@
+import { describe, expect, it } from 'vitest'
+import fc from 'fast-check'
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { EngineContext } from '@engine/campaign/engine'
+import type { CampaignAction, EngineEvent } from '@engine/campaign/types'
+import type { CampaignState } from '@engine/campaign/state'
+import { buildCtx, jsonSafetyViolations, T0 } from './helpers'
+import { canonicalStringify, stateHash } from '../harness/canonical'
+
+// The model tracks only enough to be informational; the system under test is
+// the public dispatch over the test-double mission, and the INVARIANTS do the
+// heavy lifting, not model-vs-real output equality.
+interface Model {
+  lastNow: number
+}
+
+// The real holder carries cross-command accumulators so suite-wide invariants
+// (settlement exactly once, clue firing once, timeout reachability) can be
+// checked as the sequence runs.
+interface Real {
+  ctx: EngineContext
+  state: CampaignState
+  settleCounts: Map<string, number>
+  cluesSeen: Set<string>
+}
+
+const MISSION_IDS = ['alpha', 'beta', 'gamma'] as const
+const RECORD_IDS = ['C17', 'F06', 'B04', 'W02'] as const
+const MAX_DELTA = 400_000 // wider than the 240_000 deadline so timeouts fire
+
+function everyNumberIsInteger(value: unknown): boolean {
+  let ok = true
+  const visit = (v: unknown): void => {
+    if (typeof v === 'number') {
+      if (!Number.isInteger(v)) ok = false
+      return
+    }
+    if (v && typeof v === 'object') {
+      for (const k of Object.keys(v as Record<string, unknown>)) {
+        visit((v as Record<string, unknown>)[k])
+      }
+    }
+  }
+  visit(value)
+  return ok
+}
+
+function queueSorted(
+  queue: readonly { scheduledAt: number; id: string }[],
+): boolean {
+  for (let i = 1; i < queue.length; i++) {
+    const a = queue[i - 1]!
+    const b = queue[i]!
+    if (
+      a.scheduledAt > b.scheduledAt ||
+      (a.scheduledAt === b.scheduledAt && a.id > b.id)
+    ) {
+      return false
+    }
+  }
+  return true
+}
+
+function applyAndCheck(
+  real: Real,
+  model: Model,
+  action: CampaignAction,
+  delta: number,
+): void {
+  const before = real.state
+  const now = before.lastNow + delta
+  const beforeHash = stateHash(before)
+  const result = dispatch(real.ctx, before, action, now)
+  const after = result.state
+  real.state = after
+  model.lastNow = after.lastNow
+
+  // lastNow never decreases.
+  expect(after.lastNow).toBeGreaterThanOrEqual(before.lastNow)
+  // A rejected action changes nothing BEYOND the clock advance that dispatch
+  // always performs first. Compare against a pure advance to the same now:
+  // the rejected action must add no effect of its own.
+  if (result.rejection) {
+    const advancedOnly = advanceCampaign(real.ctx, before, now)
+    expect(stateHash(after)).toBe(stateHash(advancedOnly.state))
+    // The rejected action also adds no emitted event beyond the advance's own.
+    expect(canonicalStringify(result.emitted)).toBe(
+      canonicalStringify(advancedOnly.emitted),
+    )
+  }
+  void beforeHash
+  // Both queues stay sorted by (scheduledAt, id).
+  expect(queueSorted(after.missionQueue)).toBe(true)
+  expect(queueSorted(after.campaignQueue)).toBe(true)
+  // State stays JSON-safe and integer-valued.
+  expect(jsonSafetyViolations(after)).toEqual([])
+  expect(everyNumberIsInteger(after)).toBe(true)
+  // NEW_CAMPAIGN deliberately starts a fresh campaign, so the within-campaign
+  // monotonicity invariants (settled immutable, clues only grow, each mission
+  // settles once) are reset at that boundary rather than asserted across it.
+  const isReset = action.type === 'NEW_CAMPAIGN'
+  if (!isReset) {
+    // Settled outcomes are immutable once written.
+    for (const prior of before.settled) {
+      const now2 = after.settled.find((s) => s.missionId === prior.missionId)
+      expect(now2).toBeDefined()
+      expect(canonicalStringify(now2)).toBe(canonicalStringify(prior))
+    }
+    // cluesFound grows monotonically.
+    expect(after.cluesFound.length).toBeGreaterThanOrEqual(
+      before.cluesFound.length,
+    )
+  }
+  // Emitted-event invariants: settlement and clueFound fire at most once per id.
+  for (const event of result.emitted as EngineEvent[]) {
+    if (event.type === 'settlement') {
+      const n = (real.settleCounts.get(event.missionId) ?? 0) + 1
+      real.settleCounts.set(event.missionId, n)
+      expect(n).toBe(1)
+    }
+    if (event.type === 'clueFound') {
+      expect(real.cluesSeen.has(event.clueId)).toBe(false)
+      real.cluesSeen.add(event.clueId)
+    }
+  }
+  // Fresh campaign: positively assert the reset produced a clean slate
+  // (this is the regression the exemption would otherwise mask), then clear
+  // the cross-command accumulators so the next campaign's first settlement
+  // of a mission is not seen as a second one.
+  if (isReset) {
+    expect(after.settled).toHaveLength(0)
+    expect(after.cluesFound).toHaveLength(0)
+    expect(after.appliedConsequences).toHaveLength(0)
+    expect(after.activeMission).toBeNull()
+    real.settleCounts.clear()
+    real.cluesSeen.clear()
+  }
+}
+
+type Cmd = fc.Command<Model, Real>
+
+function cmd(
+  name: string,
+  action: (missionOrRecord: string) => CampaignAction,
+  arg: string,
+  delta: number,
+): Cmd {
+  return {
+    check: () => true, // run invalid actions too; rejection-is-a-no-op is an invariant
+    run: (model, real) => applyAndCheck(real, model, action(arg), delta),
+    toString: () => `${name}(${arg}, +${delta})`,
+  }
+}
+
+const missionArb = fc.constantFrom(...MISSION_IDS)
+const recordArb = fc.constantFrom(...RECORD_IDS)
+const deltaArb = fc.nat({ max: MAX_DELTA })
+
+const commandArb = fc.commands(
+  [
+    fc
+      .tuple(missionArb, deltaArb)
+      .map(([m, d]) =>
+        cmd('Start', (id) => ({ type: 'START_MISSION', missionId: id }), m, d),
+      ),
+    fc
+      .tuple(fc.constantFrom('DELIVER', 'DECOY', 'READ_AUDIT', 'POISON'), deltaArb)
+      .map(([k, d]) =>
+        cmd(
+          'Mission',
+          () => ({ type: 'MISSION_ACTION', payload: { kind: k } }),
+          k,
+          d,
+        ),
+      ),
+    deltaArb.map((d) =>
+      cmd('Forfeit', () => ({ type: 'FORFEIT_MISSION' }), '', d),
+    ),
+    fc
+      .tuple(missionArb, deltaArb)
+      .map(([m, d]) =>
+        cmd(
+          'Ack',
+          (id) => ({ type: 'ACKNOWLEDGE_DEBRIEF', missionId: id }),
+          m,
+          d,
+        ),
+      ),
+    fc
+      .tuple(recordArb, deltaArb)
+      .map(([r, d]) =>
+        cmd('Inspect', (id) => ({ type: 'INSPECT_RECORD', recordId: id }), r, d),
+      ),
+    fc
+      .tuple(recordArb, deltaArb)
+      .map(([r, d]) =>
+        cmd(
+          'SourceCheck',
+          (id) => ({ type: 'REQUEST_SOURCE_CHECK', recordId: id }),
+          r,
+          d,
+        ),
+      ),
+    fc
+      .tuple(fc.boolean(), deltaArb)
+      .map(([v, d]) =>
+        cmd(
+          'SetPref',
+          () => ({ type: 'SET_PREFERENCE', preference: 'extendedTime', value: v }),
+          String(v),
+          d,
+        ),
+      ),
+    deltaArb.map((d) =>
+      cmd('New', () => ({ type: 'NEW_CAMPAIGN', seedName: 'test-seed' }), '', d),
+    ),
+    // A deadline-crossing advance: a benign action with a delta guaranteed
+    // to exceed the 240_000 ms mission duration, so expiry is reliably
+    // reachable (not left to the chance of a large nat).
+    fc
+      .integer({ min: 241_000, max: MAX_DELTA })
+      .map((d) =>
+        cmd(
+          'CrossDeadline',
+          () => ({
+            type: 'SET_PREFERENCE',
+            preference: 'extendedTime',
+            value: false,
+          }),
+          'tick',
+          d,
+        ),
+      ),
+  ],
+  { maxCommands: 40 },
+)
+
+describe('model-based command suite', () => {
+  it('upholds every invariant across generated command sequences', () => {
+    fc.assert(
+      fc.property(commandArb, (cmds) => {
+        const setup = () => {
+          const ctx = buildCtx()
+          const real: Real = {
+            ctx,
+            state: createCampaign(
+              ctx,
+              'test-seed',
+              { extendedTime: false },
+              T0,
+            ),
+            settleCounts: new Map(),
+            cluesSeen: new Set(),
+          }
+          return { model: { lastNow: T0 }, real }
+        }
+        fc.modelRun(setup, cmds)
+      }),
+      { numRuns: 200 },
+    )
+  })
+
+  it('a deadline-crossing clock settles the active mission by timeout, once', () => {
+    // Targeted precondition for timeout reachability (the plan permits this
+    // over purely-random reachability): start a mission, then advance past
+    // its deadline. The expiry must settle it as 'timeout' and emit exactly
+    // one settlement event for it.
+    const ctx = buildCtx()
+    let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, T0)
+    state = dispatch(
+      ctx,
+      state,
+      { type: 'START_MISSION', missionId: 'alpha' },
+      T0 + 1_000,
+    ).state
+    const endsAt = state.activeMission!.endsAt
+    const crossed = dispatch(
+      ctx,
+      state,
+      { type: 'SET_PREFERENCE', preference: 'extendedTime', value: false },
+      endsAt + 60_000,
+    )
+    const settlements = crossed.emitted.filter((e) => e.type === 'settlement')
+    expect(settlements).toHaveLength(1)
+    expect(crossed.state.settled.some((s) => s.cause === 'timeout')).toBe(true)
+  })
+})
diff --git a/test/engine/properties/sabotage.test.ts b/test/engine/properties/sabotage.test.ts
new file mode 100644
index 0000000..9995e2d
--- /dev/null
+++ b/test/engine/properties/sabotage.test.ts
@@ -0,0 +1,89 @@
+import { describe, expect, it } from 'vitest'
+import { buildTestContext, makeTestDoubleMission } from '@engine/testing'
+import { createCampaign } from '@engine/campaign/engine'
+import type { MissionModule } from '@engine/missions/types'
+import {
+  foldEnvelopes,
+  walkthroughLog,
+  MISSION_IDS,
+  T0,
+  type Envelope,
+} from './helpers'
+import { FIXTURE_RECORDS } from '../records/fixtures'
+import { stateHash } from '../harness/canonical'
+
+// A short log that leaves the mission ACTIVE, so the tainted substate is
+// still present in state at the end (a completed mission discards substate
+// at settlement, which would wash the sabotage out).
+const activeLog: Envelope[] = [
+  { action: { type: 'START_MISSION', missionId: 'alpha' }, now: T0 + 1_000 },
+  {
+    action: { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } },
+    now: T0 + 2_000,
+  },
+]
+
+// The harness must actually catch nondeterminism, or the run-twice suites
+// prove nothing. Inject it through a test-only mission whose reduce reads
+// Math.random — a seam that never touches src/engine/** (the lint gate
+// protects that) and leaves nothing behind.
+function sabotagedMission(id: string): MissionModule {
+  const base = makeTestDoubleMission(id)
+  return {
+    ...base,
+    reduce(state, event) {
+      const looseReduce = base.reduce as (s: unknown, e: unknown) => unknown
+      const next = looseReduce(state, event) as {
+        inputLog?: unknown[]
+        [k: string]: unknown
+      }
+      // Ambient entropy pushed into inputLog, a field the test-double schema
+      // permits, so a future substate re-validation could not silently strip
+      // the taint and turn this into a false green. Identical logs now
+      // diverge run to run.
+      return {
+        ...next,
+        inputLog: [...(next.inputLog ?? []), `taint:${Math.random()}`],
+      }
+    },
+  } as MissionModule
+}
+
+describe('sabotage: the harness detects divergence', () => {
+  it('a Math.random-tainted mission breaks run-twice (proving the check bites)', () => {
+    const run = () => {
+      const ctx = buildTestContext(FIXTURE_RECORDS, undefined, {
+        missions: {
+          alpha: sabotagedMission('alpha'),
+          beta: sabotagedMission('beta'),
+          gamma: sabotagedMission('gamma'),
+        },
+      })
+      const initial = createCampaign(
+        ctx,
+        'test-seed',
+        { extendedTime: false },
+        T0,
+      )
+      return foldEnvelopes(ctx, initial, activeLog).state
+    }
+    const a = run()
+    const b = run()
+    expect(stateHash(a)).not.toBe(stateHash(b))
+  })
+
+  it('control: the un-sabotaged mission is deterministic under the same harness', () => {
+    const log = walkthroughLog(MISSION_IDS)
+    const run = () => {
+      const ctx = buildTestContext(FIXTURE_RECORDS)
+      const initial = createCampaign(
+        ctx,
+        'test-seed',
+        { extendedTime: false },
+        T0,
+      )
+      return foldEnvelopes(ctx, initial, log).state
+    }
+    expect(stateHash(run())).toBe(stateHash(run()))
+  })
+})
diff --git a/test/engine/properties/six-permutation.test.ts b/test/engine/properties/six-permutation.test.ts
new file mode 100644
index 0000000..5ec5d19
--- /dev/null
+++ b/test/engine/properties/six-permutation.test.ts
@@ -0,0 +1,96 @@
+import { describe, expect, it } from 'vitest'
+import { createCampaign } from '@engine/campaign/engine'
+import { selectMenuRows } from '@engine/campaign/selectors'
+import type { CampaignState } from '@engine/campaign/state'
+import {
+  buildCtx,
+  foldEnvelopes,
+  walkthroughLog,
+  MISSION_IDS,
+  T0,
+} from './helpers'
+import { canonicalStringify } from '../harness/canonical'
+
+function permutations<T>(items: readonly T[]): T[][] {
+  if (items.length <= 1) return [[...items]]
+  const out: T[][] = []
+  items.forEach((item, i) => {
+    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
+    for (const p of permutations(rest)) out.push([item, ...p])
+  })
+  return out
+}
+
+function playOrder(order: readonly string[]): CampaignState {
+  const ctx = buildCtx()
+  const initial = createCampaign(ctx, 'test-seed', { extendedTime: false }, T0)
+  return foldEnvelopes(ctx, initial, walkthroughLog(order)).state
+}
+
+// The ORDER-INDEPENDENT terminal facts of the campaign, derived from the
+// actual end state of each play order (not a static constant). What
+// legitimately differs by order — settleSeq, lastNow, the exact
+// consequence-application targets, the queues — is excluded; what must be
+// invariant is included.
+function terminalFingerprint(state: CampaignState): string {
+  return canonicalStringify({
+    settled: [...state.settled]
+      .sort((a, b) => (a.missionId < b.missionId ? -1 : 1))
+      .map((s) => ({
+        missionId: s.missionId,
+        tier: s.tier,
+        cause: s.cause,
+        clueId: s.clueId,
+        metrics: s.metrics,
+      })),
+    acknowledged: [...state.acknowledgedDebriefs].sort(),
+    cluesFound: [...state.cluesFound].sort(),
+    finaleUnlocked: selectMenuRows(state, MISSION_IDS, 'finale').finaleUnlocked,
+  })
+}
+
+describe('six-permutation outcome invariance', () => {
+  const orders = permutations(MISSION_IDS)
+
+  it('generates all six orderings', () => {
+    expect(orders).toHaveLength(6)
+  })
+
+  it('every ordering reaches the finale gate with all three settled full', () => {
+    for (const order of orders) {
+      const state = playOrder(order)
+      expect(selectMenuRows(state, MISSION_IDS, 'finale').finaleUnlocked).toBe(
+        true,
+      )
+      expect(state.settled.map((s) => s.missionId).sort()).toEqual([
+        'alpha',
+        'beta',
+        'gamma',
+      ])
+      expect(state.settled.every((s) => s.tier === 'full')).toBe(true)
+    }
+  })
+
+  it('the terminal outcome facts are byte-identical across all six orderings', () => {
+    // Derived from each run's real end state, so a settlement that depended
+    // on play order (a bug) would split the set. It does not.
+    const fingerprints = orders.map((order) =>
+      terminalFingerprint(playOrder(order)),
+    )
+    expect(new Set(fingerprints).size).toBe(1)
+  })
+
+  it('the fingerprint actually discriminates (not a constant)', () => {
+    // Negative anchor: a campaign that did NOT play to completion must
+    // produce a different fingerprint, so the invariance above is a real
+    // equality, not a function that returns the same string for everything.
+    const complete = terminalFingerprint(playOrder(MISSION_IDS))
+    const ctx = buildCtx()
+    const partial = foldEnvelopes(
+      ctx,
+      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
+      walkthroughLog(['alpha']),
+    ).state
+    expect(terminalFingerprint(partial)).not.toBe(complete)
+  })
+})
diff --git a/test/engine/properties/snapshot-replay.test.ts b/test/engine/properties/snapshot-replay.test.ts
new file mode 100644
index 0000000..a3c185d
--- /dev/null
+++ b/test/engine/properties/snapshot-replay.test.ts
@@ -0,0 +1,51 @@
+import { describe, expect, it } from 'vitest'
+import { createCampaign } from '@engine/campaign/engine'
+import { snapshot } from '@engine/branch'
+import {
+  buildCtx,
+  foldEnvelopes,
+  walkthroughLog,
+  MISSION_IDS,
+  T0,
+} from './helpers'
+import { canonicalStringify, stateHash } from '../harness/canonical'
+
+// Replaying the suffix of an envelope log on top of a snapshot taken at the
+// midpoint reproduces the full run's final state exactly. The snapshot is
+// frozen; replay runs on a fresh unfrozen structured clone, exactly as the
+// branch runner does.
+describe('snapshot-replay equivalence', () => {
+  const log = walkthroughLog(MISSION_IDS)
+  const ctx = buildCtx()
+  const initial = createCampaign(ctx, 'test-seed', { extendedTime: false }, T0)
+  const full = foldEnvelopes(ctx, initial, log)
+
+  // trail[k] is the state after k envelopes; pick early, middle, late.
+  const indices = [1, Math.floor(log.length / 2), log.length - 1]
+
+  for (const k of indices) {
+    it(`replaying envelopes after index ${k} matches the full run`, () => {
+      const snap = snapshot(full.trail[k]!)
+      const resumed = structuredClone(snap)
+      const suffix = log.slice(k)
+      const replayed = foldEnvelopes(ctx, resumed, suffix)
+      expect(replayed.state).toStrictEqual(full.state)
+      expect(stateHash(replayed.state)).toBe(stateHash(full.state))
+      // The replayed suffix also reproduces the full run's emitted tail,
+      // so the event stream is as deterministic as the state.
+      const fullTail = foldEnvelopes(ctx, full.trail[k]!, suffix).emitted
+      expect(canonicalStringify(replayed.emitted)).toBe(
+        canonicalStringify(fullTail),
+      )
+    })
+  }
+
+  it('the snapshot taken for replay is never mutated by the replay', () => {
+    const k = indices[1]!
+    const snap = snapshot(full.trail[k]!)
+    const snapHash = stateHash(snap)
+    const resumed = structuredClone(snap)
+    foldEnvelopes(ctx, resumed, log.slice(k))
+    expect(stateHash(snap)).toBe(snapHash)
+  })
+})
