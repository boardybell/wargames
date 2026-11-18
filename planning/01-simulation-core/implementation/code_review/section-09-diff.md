diff --git a/src/engine/branch/index.ts b/src/engine/branch/index.ts
new file mode 100644
index 0000000..9e36f22
--- /dev/null
+++ b/src/engine/branch/index.ts
@@ -0,0 +1,18 @@
+// Branch machinery public surface, consumed by src/engine/index.ts and
+// surfaced on the engine API in section-10.
+export { snapshot, deepClone, deepFreeze } from './snapshot'
+export type { FrozenCampaignState } from './snapshot'
+export { runBranch, computeViability } from './runBranch'
+export {
+  BRANCH_KINDS,
+  BRANCH_INDEX,
+  VIABILITY_THRESHOLDS,
+} from './types'
+export type {
+  BranchKind,
+  BranchProjection,
+  BranchStep,
+  BranchResult,
+  StagedViability,
+  ViabilityThreshold,
+} from './types'
diff --git a/src/engine/branch/runBranch.ts b/src/engine/branch/runBranch.ts
new file mode 100644
index 0000000..dd3da1e
--- /dev/null
+++ b/src/engine/branch/runBranch.ts
@@ -0,0 +1,190 @@
+// The zero-player branch runner. A branch run clones the frozen snapshot,
+// forks its own RNG stream, steps a fixed scripted policy through the SAME
+// reducers live play uses (dispatch from section-05), records a compact
+// step trace, and projects integer service metrics from the clone's end
+// state. Running a branch never touches the frozen snapshot or live state,
+// and the same branch on the same snapshot is bit-identical every time.
+import { forkStream } from '../rng'
+import { dispatch } from '../campaign/engine'
+import type { EngineContext } from '../campaign/engine'
+import type { CampaignState } from '../campaign/state'
+import { deepClone } from './snapshot'
+import type { FrozenCampaignState } from './snapshot'
+import {
+  BRANCH_INDEX,
+  VIABILITY_THRESHOLDS,
+} from './types'
+import type {
+  BranchKind,
+  BranchProjection,
+  BranchResult,
+  BranchStep,
+  StagedViability,
+  ViabilityThreshold,
+} from './types'
+
+// Branch time is discrete step counts; each step's synthetic now is derived
+// from the snapshot's lastNow plus a fixed offset and exists only inside the
+// clone. Small offsets keep steps inside the mission deadline.
+const STEP_MS = 1000
+
+interface ScriptStep {
+  readonly payload: unknown
+  readonly label: string
+  readonly detail: string
+}
+
+function intOr(value: unknown, fallback: number): number {
+  return typeof value === 'number' && Number.isInteger(value) ? value : fallback
+}
+
+/** Sum each settled metric and compare to its integer threshold. Pure over
+ *  the snapshot's settled outcomes; returns the per-threshold detail so the
+ *  shell and split 06 can show why staged recovery is or is not viable. */
+export function computeViability(snap: FrozenCampaignState): StagedViability {
+  const totals: Record<string, number> = {}
+  for (const outcome of snap.settled) {
+    for (const key of Object.keys(outcome.metrics)) {
+      totals[key] = (totals[key] ?? 0) + outcome.metrics[key]!
+    }
+  }
+  const thresholds: ViabilityThreshold[] = VIABILITY_THRESHOLDS.map((t) => {
+    const actual = totals[t.key] ?? 0
+    return { key: t.key, actual, threshold: t.max, pass: actual <= t.max }
+  })
+  return { viable: thresholds.every((t) => t.pass), thresholds }
+}
+
+// The three scripted policies. SPLIT-06 SEAM: split 06 replaces these with
+// the real finale policies (pure transforms over settled metrics plus the
+// exception selector). Here they are fixed zero-player scripts against the
+// permanent test-double mission, authored so their end states genuinely
+// differ, which is what the distinctness guarantee is proven against.
+function policyScript(
+  kind: BranchKind,
+  viability: StagedViability,
+): readonly ScriptStep[] {
+  switch (kind) {
+    case 'REPEAT_D83':
+      // Escalation: act on the decoy as if genuine, then force a response.
+      // Burns capacity on a false alarm.
+      return [
+        {
+          payload: { kind: 'DECOY' },
+          label: 'ESCALATE',
+          detail: 'Act on the decoy as if the emergency were real',
+        },
+        {
+          payload: { kind: 'DELIVER' },
+          label: 'FORCE',
+          detail: 'Push a forced response under the assumed emergency',
+        },
+      ]
+    case 'HOLD_AND_VERIFY':
+      // Passive: withhold action pending verification; let deadlines run.
+      return [
+        {
+          payload: { kind: 'READ_AUDIT' },
+          label: 'VERIFY',
+          detail: 'Withhold action and read the audit trail first',
+        },
+      ]
+    case 'STAGED_RECOVERY':
+      // Measured: act in stages gated by viability, avoiding the decoy.
+      return viability.viable
+        ? [
+            {
+              payload: { kind: 'DELIVER' },
+              label: 'STAGE 1',
+              detail: 'Deliver the first verified tranche',
+            },
+            {
+              payload: { kind: 'DELIVER' },
+              label: 'STAGE 2',
+              detail: 'Advance recovery; thresholds remain satisfied',
+            },
+          ]
+        : [
+            {
+              payload: { kind: 'DELIVER' },
+              label: 'STAGE 1 (CONSTRAINED)',
+              detail: 'Capacity thresholds breached; hold at one stage',
+            },
+          ]
+  }
+}
+
+/** SPLIT-06 SEAM: honest-but-simple integer projection over the test-double
+ *  mission's end state. Split 06 fills the real computation by pulling
+ *  mission selectors; the fields and their integer/JSON-safe contract are
+ *  fixed here. Values must differ across the three policies so the
+ *  distinctness guarantee is meaningful. */
+function project(
+  snap: FrozenCampaignState,
+  endState: CampaignState,
+): BranchProjection {
+  const substate = (endState.activeMission?.substate ?? {}) as Record<
+    string,
+    unknown
+  >
+  const delivered = intOr(substate['delivered'], 0)
+  const goal = intOr(substate['goal'], 3)
+  const decoySent = substate['decoySent'] === true
+  // Clamp at zero so split 06 inherits a safe contract: confidence and
+  // passengers are never negative regardless of policy or goal.
+  const openExceptions = Math.max(0, snap.openExceptionsBaseline - delivered)
+  const passengers = Math.max(0, delivered * 1000 - (decoySent ? 500 : 0))
+  const payments = delivered * 250 + (decoySent ? 0 : 100)
+  const confidence = Math.max(
+    0,
+    100 - (decoySent ? 40 : 0) - (goal - delivered) * 10,
+  )
+  return { openExceptions, deliveries: delivered, passengers, payments, confidence }
+}
+
+/** Run one zero-player branch against a frozen snapshot. Pure: the frozen
+ *  snapshot is never passed to a reducer, and the result is JSON-safe and
+ *  reproducible. */
+export function runBranch(
+  ctx: EngineContext,
+  snap: FrozenCampaignState,
+  kind: BranchKind,
+): BranchResult {
+  const viability = computeViability(snap)
+  // Clone first: an unfrozen working copy. Reducers run only on the clone;
+  // forking the RNG off the snapshot's state gives this branch its own
+  // 2^64-separated stream, so branch order never changes the result.
+  const cloned = deepClone(snap as CampaignState)
+  // forkStream returns an RngState with a readonly words array; the campaign
+  // state's rng carries a mutable one, so materialize a fresh array.
+  const forked = forkStream(cloned.rng, BRANCH_INDEX[kind])
+  let current: CampaignState = {
+    ...cloned,
+    rng: { words: [...forked.words] },
+  }
+  const steps = policyScript(kind, viability)
+  const trace: BranchStep[] = []
+  steps.forEach((scripted, i) => {
+    const now = snap.lastNow + (i + 1) * STEP_MS
+    const result = dispatch(
+      ctx,
+      current,
+      { type: 'MISSION_ACTION', payload: scripted.payload },
+      now,
+    )
+    // A rejected action would otherwise be a silent no-op that still records
+    // a trace step and skews the projection with zero signal. The scaffold
+    // policies assume a live active mission; fail loud if that breaks (e.g.
+    // a branch run on a post-settlement snapshot). Split 06's real policies,
+    // which don't dispatch mission actions at all, bypass this path.
+    if (result.rejection) {
+      throw new Error(
+        `branch policy produced an invalid action: ${result.rejection.reason}`,
+      )
+    }
+    current = result.state
+    trace.push({ step: i, label: scripted.label, detail: scripted.detail })
+  })
+  const projection = project(snap, current)
+  return { kind, projection, trace, viability }
+}
diff --git a/src/engine/branch/snapshot.ts b/src/engine/branch/snapshot.ts
new file mode 100644
index 0000000..ca3b48d
--- /dev/null
+++ b/src/engine/branch/snapshot.ts
@@ -0,0 +1,51 @@
+// Deep clone + deep freeze of CampaignState. All campaign state is JSON-safe
+// plain data (no Map, Set, Date, class instances), so a structural recursive
+// clone of plain objects and arrays is sufficient, and the deep freeze is the
+// hard, under-test guarantee that a branch run cannot mutate the snapshot.
+import type { CampaignState } from '../campaign/state'
+
+/** The snapshot handed to runBranch: a frozen CampaignState. The runtime
+ *  freeze is the actual guarantee; the type is the ordinary state so
+ *  callers read it without ceremony. */
+export type FrozenCampaignState = CampaignState
+
+type Json =
+  | null
+  | boolean
+  | number
+  | string
+  | readonly Json[]
+  | { readonly [k: string]: Json }
+
+/** Structural recursive clone of JSON-safe data. Returns a fresh object
+ *  graph sharing no references with the input. */
+export function deepClone<T>(value: T): T {
+  return cloneJson(value as unknown as Json) as unknown as T
+}
+
+function cloneJson(value: Json): Json {
+  if (value === null || typeof value !== 'object') return value
+  if (Array.isArray(value)) return value.map(cloneJson)
+  const out: Record<string, Json> = {}
+  for (const key of Object.keys(value)) {
+    out[key] = cloneJson((value as Record<string, Json>)[key] as Json)
+  }
+  return out
+}
+
+/** Recursively Object.freeze every object and array in the graph. */
+export function deepFreeze<T>(value: T): T {
+  if (value !== null && typeof value === 'object') {
+    for (const key of Object.keys(value as Record<string, unknown>)) {
+      deepFreeze((value as Record<string, unknown>)[key])
+    }
+    Object.freeze(value)
+  }
+  return value
+}
+
+/** Clone then freeze: the returned snapshot is an untouched comparand for
+ *  the side-effect-free guarantee and a frozen input for branch runs. */
+export function snapshot(state: CampaignState): FrozenCampaignState {
+  return deepFreeze(deepClone(state))
+}
diff --git a/src/engine/branch/types.ts b/src/engine/branch/types.ts
new file mode 100644
index 0000000..0df3276
--- /dev/null
+++ b/src/engine/branch/types.ts
@@ -0,0 +1,76 @@
+// Zero-player branch machinery types. The finale (split 06) runs three
+// futures against a frozen snapshot of the live campaign; this split owns
+// the framework and its determinism guarantees, not the real projection
+// computation. BranchProjection is defined here; split 06 populates it for
+// real by pulling mission selectors. Everything is JSON-safe: finite
+// integers, strings, booleans, arrays, plain objects.
+
+export type BranchKind = 'REPEAT_D83' | 'HOLD_AND_VERIFY' | 'STAGED_RECOVERY'
+
+export const BRANCH_KINDS: readonly BranchKind[] = [
+  'REPEAT_D83',
+  'HOLD_AND_VERIFY',
+  'STAGED_RECOVERY',
+]
+
+// Stable per-kind stream index: each branch draws from its own
+// 2^64-separated RNG stream forked off the snapshot, so running the three
+// branches in any order yields bit-identical per-kind results.
+export const BRANCH_INDEX: Readonly<Record<BranchKind, number>> = {
+  REPEAT_D83: 0,
+  HOLD_AND_VERIFY: 1,
+  STAGED_RECOVERY: 2,
+}
+
+export interface BranchProjection {
+  /** All fields integer, smallest unit. Split-06 seam fills the real
+   *  derivation; here they are honest-but-simple over the test double. */
+  readonly openExceptions: number
+  readonly deliveries: number
+  readonly passengers: number
+  readonly payments: number
+  readonly confidence: number
+}
+
+// Pinned by the split 02 shell review: the shell animates these entries
+// in its character grid (skippable, instant under reduced motion); split
+// 06 authors the real labels and details.
+export interface BranchStep {
+  readonly step: number
+  readonly label: string
+  readonly detail: string
+}
+
+export interface ViabilityThreshold {
+  readonly key: string
+  readonly actual: number
+  readonly threshold: number
+  readonly pass: boolean
+}
+
+export interface StagedViability {
+  readonly viable: boolean
+  /** Per-threshold detail so the shell and split 06 can show WHY staged
+   *  recovery is or is not viable. */
+  readonly thresholds: readonly ViabilityThreshold[]
+}
+
+export interface BranchResult {
+  readonly kind: BranchKind
+  readonly projection: BranchProjection
+  readonly trace: readonly BranchStep[]
+  /** Present for every kind for a uniform surface; only STAGED_RECOVERY
+   *  gates its stages on it. */
+  readonly viability: StagedViability
+}
+
+// Integer service thresholds shaped by settled outcomes: better earlier
+// outcomes keep these totals low and widen finale recovery options.
+// Summed across settled metrics and compared <= threshold.
+export const VIABILITY_THRESHOLDS: readonly {
+  readonly key: string
+  readonly max: number
+}[] = [
+  { key: 'wopr_resolved', max: 2 },
+  { key: 'service_cost', max: 20 },
+]
diff --git a/test/engine/branch/runBranch.test.ts b/test/engine/branch/runBranch.test.ts
new file mode 100644
index 0000000..9a4082f
--- /dev/null
+++ b/test/engine/branch/runBranch.test.ts
@@ -0,0 +1,159 @@
+import { describe, expect, it } from 'vitest'
+import { runBranch, snapshot, BRANCH_KINDS } from '@engine/branch'
+import type { BranchKind } from '@engine/branch'
+import { buildTestContext } from '@engine/testing'
+import { createCampaign, dispatch } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import { FIXTURE_RECORDS } from '../records/fixtures'
+import { canonicalStringify, stateHash } from '../harness/canonical'
+
+const ctx = buildTestContext(FIXTURE_RECORDS)
+const T0 = 1_000_000
+
+function step(state: CampaignState, action: Parameters<typeof dispatch>[2]) {
+  return dispatch(ctx, state, action, state.lastNow + 1_000).state
+}
+
+// A mid-campaign fixture with a live active mission (no settled outcomes),
+// so projections read the test-double substate and viability is satisfied.
+function midCampaign(): CampaignState {
+  return step(
+    createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
+    { type: 'START_MISSION', missionId: 'alpha' },
+  )
+}
+
+// Settle alpha with a chosen outcome, then leave beta active. 'full' gives
+// healthy settled metrics (viable); 'failed' gives capacity-constrained
+// metrics (not viable).
+function withSettledAlpha(kind: 'full' | 'failed'): CampaignState {
+  let s = step(
+    createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
+    { type: 'START_MISSION', missionId: 'alpha' },
+  )
+  if (kind === 'full') {
+    s = step(s, { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
+    s = step(s, { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
+    s = step(s, { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
+  } else {
+    s = step(s, { type: 'FORFEIT_MISSION' })
+  }
+  s = step(s, { type: 'ACKNOWLEDGE_DEBRIEF', missionId: 'alpha' })
+  return step(s, { type: 'START_MISSION', missionId: 'beta' })
+}
+
+describe('runBranch side-effect freedom', () => {
+  it('leaves the frozen snapshot and the live state unchanged', () => {
+    const live = midCampaign()
+    const liveHash = stateHash(live)
+    const snap = snapshot(live)
+    const snapHash = stateHash(snap)
+    for (const kind of BRANCH_KINDS) runBranch(ctx, snap, kind)
+    expect(stateHash(snap)).toBe(snapHash)
+    expect(stateHash(live)).toBe(liveHash)
+  })
+})
+
+describe('runBranch determinism', () => {
+  it('returns strictly equal projection and trace on repeated runs', () => {
+    const snap = snapshot(midCampaign())
+    for (const kind of BRANCH_KINDS) {
+      const a = runBranch(ctx, snap, kind)
+      const b = runBranch(ctx, snap, kind)
+      expect(canonicalStringify(a)).toBe(canonicalStringify(b))
+    }
+  })
+
+  it('is order-independent across branch kinds (forked streams)', () => {
+    const snap = snapshot(midCampaign())
+    const forward: BranchKind[] = [
+      'REPEAT_D83',
+      'HOLD_AND_VERIFY',
+      'STAGED_RECOVERY',
+    ]
+    const reversed: BranchKind[] = [
+      'STAGED_RECOVERY',
+      'REPEAT_D83',
+      'HOLD_AND_VERIFY',
+    ]
+    const first = new Map(
+      forward.map((k) => [k, canonicalStringify(runBranch(ctx, snap, k))]),
+    )
+    for (const k of reversed) {
+      expect(canonicalStringify(runBranch(ctx, snap, k))).toBe(first.get(k))
+    }
+  })
+})
+
+describe('runBranch policy divergence', () => {
+  it('the three kinds produce pairwise-distinct projections', () => {
+    const snap = snapshot(midCampaign())
+    const projections = BRANCH_KINDS.map((k) =>
+      canonicalStringify(runBranch(ctx, snap, k).projection),
+    )
+    expect(new Set(projections).size).toBe(BRANCH_KINDS.length)
+  })
+})
+
+describe('STAGED_RECOVERY viability', () => {
+  it('flips on settled-outcome thresholds, exposing the threshold values', () => {
+    const healthy = snapshot(withSettledAlpha('full'))
+    const constrained = snapshot(withSettledAlpha('failed'))
+    const good = runBranch(ctx, healthy, 'STAGED_RECOVERY')
+    const poor = runBranch(ctx, constrained, 'STAGED_RECOVERY')
+    expect(good.viability.viable).toBe(true)
+    expect(poor.viability.viable).toBe(false)
+    // The threshold values are visible so the shell can show why.
+    const woprThreshold = poor.viability.thresholds.find(
+      (t) => t.key === 'wopr_resolved',
+    )
+    expect(woprThreshold).toBeDefined()
+    expect(woprThreshold!.pass).toBe(false)
+    expect(woprThreshold!.threshold).toBe(2)
+    // Viability actually gates the policy: constrained holds at one stage.
+    expect(good.trace.length).toBeGreaterThan(poor.trace.length)
+  })
+})
+
+describe('runBranch surfaces invalid scripted actions', () => {
+  it('throws rather than silently skewing when a policy action is rejected', () => {
+    // A fully-settled, acknowledged campaign has no active mission, so the
+    // scaffold policies (which dispatch MISSION_ACTIONs) produce a rejected
+    // action. That must fail loud, not record a no-op step with a wrong
+    // projection. (Split 06's real policies never dispatch mission actions.)
+    let s = step(
+      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
+      { type: 'START_MISSION', missionId: 'alpha' },
+    )
+    s = step(s, { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
+    s = step(s, { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
+    s = step(s, { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
+    s = step(s, { type: 'ACKNOWLEDGE_DEBRIEF', missionId: 'alpha' })
+    const snap = snapshot(s)
+    expect(snap.activeMission).toBeNull()
+    expect(() => runBranch(ctx, snap, 'STAGED_RECOVERY')).toThrow(
+      /invalid action/,
+    )
+  })
+})
+
+describe('runBranch JSON-safety and integer discipline', () => {
+  it('projection and trace survive a JSON round trip', () => {
+    const snap = snapshot(midCampaign())
+    for (const kind of BRANCH_KINDS) {
+      const result = runBranch(ctx, snap, kind)
+      const round = JSON.parse(JSON.stringify(result))
+      expect(round).toEqual(result)
+    }
+  })
+
+  it('every projection numeric field is an integer', () => {
+    const snap = snapshot(midCampaign())
+    for (const kind of BRANCH_KINDS) {
+      const p = runBranch(ctx, snap, kind).projection
+      for (const value of Object.values(p)) {
+        expect(Number.isInteger(value)).toBe(true)
+      }
+    }
+  })
+})
diff --git a/test/engine/branch/snapshot.test.ts b/test/engine/branch/snapshot.test.ts
new file mode 100644
index 0000000..e9b858b
--- /dev/null
+++ b/test/engine/branch/snapshot.test.ts
@@ -0,0 +1,58 @@
+import { describe, expect, it } from 'vitest'
+import { snapshot } from '@engine/branch'
+import { buildTestContext } from '@engine/testing'
+import { createCampaign, dispatch } from '@engine/campaign/engine'
+import { FIXTURE_RECORDS } from '../records/fixtures'
+
+const ctx = buildTestContext(FIXTURE_RECORDS)
+const T0 = 1_000_000
+
+function midCampaign() {
+  return dispatch(
+    ctx,
+    createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
+    { type: 'START_MISSION', missionId: 'alpha' },
+    T0,
+  ).state
+}
+
+describe('snapshot deep freeze', () => {
+  it('freezes the top level and every nested object and array', () => {
+    const snap = snapshot(midCampaign())
+    expect(Object.isFrozen(snap)).toBe(true)
+    expect(Object.isFrozen(snap.rng)).toBe(true)
+    expect(Object.isFrozen(snap.rng.words)).toBe(true)
+    expect(Object.isFrozen(snap.activeMission)).toBe(true)
+    expect(Object.isFrozen(snap.activeMission?.substate)).toBe(true)
+    expect(Object.isFrozen(snap.campaignQueue)).toBe(true)
+    expect(Object.isFrozen(snap.settled)).toBe(true)
+  })
+
+  it('mutating a nested path throws in strict mode', () => {
+    const snap = snapshot(midCampaign())
+    expect(() => {
+      ;(snap as { lastNow: number }).lastNow = 0
+    }).toThrow()
+    expect(() => {
+      ;(snap.rng.words as number[])[0] = 0
+    }).toThrow()
+    expect(() => {
+      ;(snap.activeMission!.substate as { delivered: number }).delivered = 99
+    }).toThrow()
+  })
+
+  it('is a structural clone sharing no references with the source', () => {
+    const live = midCampaign()
+    const snap = snapshot(live)
+    expect(snap).not.toBe(live)
+    expect(snap.rng).not.toBe(live.rng)
+    expect(snap.rng.words).not.toBe(live.rng.words)
+    expect(snap.activeMission).not.toBe(live.activeMission)
+  })
+
+  it('survives a JSON round trip unchanged (JSON-safe)', () => {
+    const snap = snapshot(midCampaign())
+    const round = JSON.parse(JSON.stringify(snap))
+    expect(round).toEqual(snap)
+  })
+})
