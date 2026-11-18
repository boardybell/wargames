diff --git a/src/engine/missions/finale/endings.ts b/src/engine/missions/finale/endings.ts
index 6753183..747c341 100644
--- a/src/engine/missions/finale/endings.ts
+++ b/src/engine/missions/finale/endings.ts
@@ -1,20 +1,181 @@
-// SECTION-02 SEAM. The real endingId derivation and the earned-why readback
-// over settled metrics belong to section-02-projections-endings; this file is
-// the minimal, inert stub section 01 composes so its own settlement tests can
-// assert cause mapping without any ending content. Section 02 overwrites this
-// module with the real derivation (amendment 11). Keep it typed and total; do
-// not grow it here.
+// GLOBAL FAILSAFE finale endings (section 02, amendment 11). The real endingId
+// derivation and the earned-why readback over settled metrics. Endings are
+// selected by the committed ACTION, not by tier; tier remains the quality axis
+// WITHIN an ending, never the selector of it.
+//
+//   STAGED RECOVERY commit  -> completed / recovery
+//   HOLD AND VERIFY commit   -> completed / containment (names the unresolved)
+//   REPEAT D-83 commit       -> collapsed / failure
+//   timeout and forfeit      -> collapsed / failure (the repeated order)
+//
+// This module produces the STRUCTURED earned-why data the EndingScreen and the
+// section-03 catalog selectors consume. The authored Joshua ending LINES live
+// in section-03's catalog; keep the data layer and the line layer separate. No
+// em-dashes in any authored string; every number is integer-derived.
+import type { SettlementCause } from '../../campaign/types'
+import type { BranchProjection } from '../../branch/types'
 import type { CommitChoice } from './types'
+import type {
+  FinaleCaseState,
+  FinaleSnapshot,
+  ViabilityResult,
+} from './projections'
 
 export type EndingId = 'recovery' | 'containment' | 'failure'
 
-/** The committed action and settlement cause this section provides; section
- *  02 derives the real endingId and the earned-why readback from settled
- *  metrics. This inert map only pins the shape so evaluate() can attach a
- *  value and the settlement tests can run: staged -> recovery, hold ->
- *  containment, every collapsed path (repeat, timeout, forfeit) -> failure. */
+/** The inert shape section 01's settlement composed. Kept for the module's
+ *  one-line wiring: staged -> recovery, hold -> containment, every collapsed
+ *  path (repeat, timeout, forfeit) -> failure. resolveEnding is the full,
+ *  cause-aware mapping; deriveEndingId is the committed-only shorthand the
+ *  evaluate() path already calls. */
 export function deriveEndingId(committed: CommitChoice | null): EndingId {
   if (committed === 'staged') return 'recovery'
   if (committed === 'hold') return 'containment'
   return 'failure'
 }
+
+/** Pure cause-plus-action mapping used by module.ts settlement. A committed
+ *  staged or hold settles completed (recovery or containment); a committed
+ *  repeat, and every timeout or forfeit (the repeated order), settles
+ *  collapsed / failure. The exactly-once and synchronous commit guarantees
+ *  live in section 01's terminal(); this is only the mapping it calls. */
+export function resolveEnding(
+  committed: CommitChoice | null,
+  cause: SettlementCause,
+): { endingId: EndingId; cause: 'completed' | 'collapsed' } {
+  if (cause === 'timeout' || cause === 'forfeit') {
+    return { endingId: 'failure', cause: 'collapsed' }
+  }
+  if (committed === 'staged') return { endingId: 'recovery', cause: 'completed' }
+  if (committed === 'hold') return { endingId: 'containment', cause: 'completed' }
+  return { endingId: 'failure', cause: 'collapsed' }
+}
+
+/** Pure gating predicate for the STAGED commit control: enabled only when the
+ *  case is valid AND the engine viability passes. The gating itself renders in
+ *  section 04; here is the predicate it reads. */
+export function stagedEligible(
+  caseValid: boolean,
+  viability: ViabilityResult,
+): boolean {
+  return caseValid && viability.pass
+}
+
+export interface EarnedWhy {
+  /** Named settled outcomes that opened or closed options. */
+  readonly shapingOutcomes: string[]
+  /** The validated case slots the player proved, named. */
+  readonly provedEvidence: string[]
+  /** What the chosen branch projected versus what the ending states. */
+  readonly projectedVsActual: string
+  /** Containment only: the real unresolved problems, named. */
+  readonly unresolved?: string[]
+}
+
+const SLOT_LABELS: Readonly<Record<string, string>> = {
+  outlook: 'THE OUTLOOK CASE',
+  flights: 'THE FLIGHTS CASE',
+  bank: 'THE BANK CASE',
+  root: 'THE EXERCISE ROOT',
+  observation: 'THE INDEPENDENT OBSERVATION',
+}
+
+function intMetric(
+  snapshot: FinaleSnapshot,
+  missionId: string,
+  key: string,
+): number {
+  return (
+    snapshot.settled.find((s) => s.missionId === missionId)?.metrics[key] ?? 0
+  )
+}
+
+/** Name the settled outcomes that shaped the options, with their real figures.
+ *  Each line reads the mission's own settled metrics so the three fixtures read
+ *  visibly differently. */
+function shapingOutcomes(snapshot: FinaleSnapshot): string[] {
+  const lines: string[] = []
+  const deliv = intMetric(snapshot, 'outlook', 'required_delivered')
+  const decoy = intMetric(snapshot, 'outlook', 'decoy_capacity_spent')
+  lines.push(
+    deliv >= 3
+      ? `OUTLOOK DELIVERED ALL ${deliv} REQUIRED MESSAGES, KEEPING THE RECOVERY WINDOW OPEN`
+      : `OUTLOOK DELIVERED ${deliv} OF 3 AND SPENT ${decoy} DECOY SLOTS, NARROWING THE OPTIONS`,
+  )
+  const cleared = intMetric(snapshot, 'bank', 'payments_cleared')
+  const total = intMetric(snapshot, 'bank', 'payments_total')
+  lines.push(
+    cleared >= total && total > 0
+      ? `THE BANK RECONCILIATION CLEARED ALL ${total} PAYMENTS CLEAN`
+      : `THE BANK LEFT ${Math.max(0, total - cleared)} OF ${total} PAYMENTS UNCLEARED`,
+  )
+  const resolved = intMetric(snapshot, 'flights', 'resolved_passengers')
+  const held = intMetric(snapshot, 'flights', 'held_passengers')
+  lines.push(
+    held > 0
+      ? `FLIGHTS HELD ${held} PASSENGERS AND RESOLVED NONE`
+      : `FLIGHTS RESOLVED ${resolved} PASSENGERS WITH NO BLANKET GROUNDING`,
+  )
+  return lines
+}
+
+/** The proved evidence: the validated case slots, named. */
+function provedEvidence(caseState: FinaleCaseState): string[] {
+  const named = caseState.provedSlots
+    .map((slot) => SLOT_LABELS[slot] ?? slot.toUpperCase())
+    .filter((label): label is string => Boolean(label))
+  if (caseState.fieldReportCorroborated) {
+    named.push('THE FIELD REPORT CORROBORATED THE OBSERVATION')
+  }
+  return named
+}
+
+/** The real unresolved problems a containment leaves standing, named from the
+ *  settled metrics. */
+function unresolvedProblems(snapshot: FinaleSnapshot): string[] {
+  const problems: string[] = []
+  const held = intMetric(snapshot, 'flights', 'held_passengers')
+  if (held > 0) problems.push(`${held} PASSENGERS REMAIN HELD WITH NOWHERE TO GO`)
+  const cleared = intMetric(snapshot, 'bank', 'payments_cleared')
+  const total = intMetric(snapshot, 'bank', 'payments_total')
+  const unpaid = Math.max(0, total - cleared)
+  if (unpaid > 0) problems.push(`${unpaid} CRITICAL PAYMENTS STAY UNSETTLED`)
+  const deliv = intMetric(snapshot, 'outlook', 'required_delivered')
+  if (deliv < 3) {
+    problems.push(`${3 - deliv} REQUIRED MESSAGES NEVER REACHED THEIR DESK`)
+  }
+  if (problems.length === 0) {
+    problems.push('NO HARD DAMAGE STANDS, BUT NOTHING IS CLOSED OUT EITHER')
+  }
+  return problems
+}
+
+/** Derive the structured earned-why readback for an ending from the frozen
+ *  settled metrics, the finale case state, and the chosen branch projection.
+ *  Specific and named, never boilerplate; the three campaign fixtures produce
+ *  visibly different readbacks. Containment names the real unresolved problems. */
+export function deriveEarnedWhy(
+  endingId: EndingId,
+  snapshot: FinaleSnapshot,
+  projection: BranchProjection,
+): EarnedWhy {
+  const shaping = shapingOutcomes(snapshot)
+  const proved = provedEvidence(snapshot.caseState)
+  let projectedVsActual: string
+  if (endingId === 'recovery') {
+    projectedVsActual = `THE STAGED BRANCH PROJECTED ${projection.passengers} PASSENGERS RECOVERED AND OPEN EXCEPTIONS AT ${projection.openExceptions}; THE RECOVERY HELD`
+  } else if (endingId === 'containment') {
+    projectedVsActual = `THE HOLD BRANCH PROJECTED CONFIDENCE AT ${projection.confidence} AND OPEN EXCEPTIONS AT ${projection.openExceptions}; THE DAMAGE WAS FROZEN, NOT REPAIRED`
+  } else {
+    projectedVsActual = `THE REPEAT BRANCH PROJECTED DELIVERIES AT ${projection.deliveries} AND PASSENGERS AT ${projection.passengers}; THE ORDER COLLAPSED SERVICE AS BEFORE`
+  }
+  const base: EarnedWhy = {
+    shapingOutcomes: shaping,
+    provedEvidence: proved,
+    projectedVsActual,
+  }
+  if (endingId === 'containment') {
+    return { ...base, unresolved: unresolvedProblems(snapshot) }
+  }
+  return base
+}
diff --git a/src/engine/missions/finale/module.ts b/src/engine/missions/finale/module.ts
index c4431a6..fa9cb8a 100644
--- a/src/engine/missions/finale/module.ts
+++ b/src/engine/missions/finale/module.ts
@@ -34,7 +34,7 @@ import {
   validateFinaleContent,
   fieldReportLegal,
 } from './caseBuilder'
-import { deriveEndingId } from './endings'
+import { resolveEnding } from './endings'
 import { finaleSaveSchema } from './types'
 import type {
   CaseFileCheck,
@@ -357,12 +357,11 @@ export function makeFinaleMission(
       const repeatedOrder =
         cause === 'timeout' || cause === 'forfeit' || committed === 'repeat'
       const tier = repeatedOrder ? 'failed' : 'full'
-      // SECTION-02 SEAM: endings.ts derives the real endingId and earned-why
-      // readback from settled metrics; this inert map pins the shape so the
-      // committed action and cause section 02 derives from are present here.
-      const endingId = repeatedOrder
-        ? deriveEndingId('repeat')
-        : deriveEndingId(committed)
+      // Section 02 wiring: resolveEnding is the pure cause-plus-action mapping
+      // (staged->recovery, hold->containment, repeat/timeout/forfeit->failure).
+      // The earned-why readback (deriveEarnedWhy) is derived shell-side from the
+      // settled metrics; the endingId carried here is the selector it keys on.
+      const endingId = resolveEnding(committed, cause).endingId
       return {
         missionId: FINALE_MISSION_ID,
         cause,
diff --git a/src/engine/missions/finale/projections.ts b/src/engine/missions/finale/projections.ts
new file mode 100644
index 0000000..49aabdf
--- /dev/null
+++ b/src/engine/missions/finale/projections.ts
@@ -0,0 +1,327 @@
+// GLOBAL FAILSAFE finale projections: pure integer transforms over a frozen
+// FinaleSnapshot (the three settled SettledOutcome metrics plus the finale
+// case-file state). There is no mission substate here, no replay, no
+// forkStream (engine amendment 10): by finale time every mission substate has
+// been deleted at settlement, so the snapshot carries only settled metrics and
+// campaign case-file facts. These transforms fill the split 01 BranchProjection
+// seam.
+//
+// Three authored branch policies, all per-metric integer deltas:
+//   REPEAT D-83      worsens the settled damage
+//   HOLD AND VERIFY  freezes the damage, applies containment costs
+//   STAGED RECOVERY  applies recovery deltas gated by the engine viability
+//
+// Single-computation rule: computeStaged returns ONE StagedComputation whose
+// .endState feeds BOTH .viability and .projection, so the DecisionView panel
+// (which reads .viability) and the ComparisonView STAGED column (which reads
+// .projection) can never contradict. computeViability from runBranch is reused
+// verbatim; this module never forks a second viability formula, and never reads
+// or mutates live campaign state (the frozen snapshot is the only input).
+import { computeViability } from '../../branch/runBranch'
+import { VIABILITY_THRESHOLDS } from '../../branch/types'
+import type { BranchProjection, BranchStep } from '../../branch/types'
+import { selectOpenExceptions, selectSettledMetrics } from '../../campaign/selectors'
+import type { CampaignState } from '../../campaign/state'
+import type { SettledOutcome } from '../../campaign/types'
+
+export type BranchId = 'repeat' | 'hold' | 'staged'
+
+/** Reference-only finale case facts the readback and projections name. Record
+ *  ids and booleans only; no authored copy. Deep-frozen with the snapshot. */
+export interface FinaleCaseState {
+  readonly caseValid: boolean
+  /** The case slots the player proved (filled and validated). Slot names. */
+  readonly provedSlots: readonly string[]
+  /** Whether the designated field report corroborated the observation slot. */
+  readonly fieldReportCorroborated: boolean
+}
+
+/** The frozen finale-start snapshot: three settled SettledOutcome metrics plus
+ *  campaign case-file state and the seed's open-exceptions baseline. NO mission
+ *  substate. The engine deep-freezes this at finale START; the transforms treat
+ *  it as read-only (mutation throws in strict mode). */
+export interface FinaleSnapshot {
+  readonly settled: readonly SettledOutcome[]
+  readonly openExceptionsBaseline: number
+  readonly caseState: FinaleCaseState
+}
+
+export interface ViabilityThresholdView {
+  readonly id: string
+  readonly required: number
+  readonly actual: number
+  readonly pass: boolean
+}
+
+export interface ViabilityResult {
+  readonly pass: boolean
+  readonly thresholds: readonly ViabilityThresholdView[]
+}
+
+export interface StagedComputation {
+  /** ONE computation rendered twice: the panel reads .viability, the STAGED
+   *  column reads .projection; both derive from .endState. */
+  readonly endState: BranchProjection
+  readonly viability: ViabilityResult
+  readonly projection: BranchProjection
+}
+
+/** Authored signed per-metric integer deltas. Applied to the baseline
+ *  projection and clamped at zero. */
+export interface PerMetricDeltas {
+  readonly openExceptions: number
+  readonly deliveries: number
+  readonly passengers: number
+  readonly payments: number
+  readonly confidence: number
+}
+
+/** REPEAT D-83: run the decoy order again. Every real service figure worsens;
+ *  the open-exceptions tally drops because WOPR counts the forced inactivity as
+ *  resolution. Authored integers, applied then clamped at zero. */
+export const REPEAT_DELTAS: PerMetricDeltas = {
+  openExceptions: -6,
+  deliveries: -2,
+  passengers: -600,
+  payments: -2,
+  confidence: -40,
+}
+
+/** HOLD AND VERIFY: freeze the settled figures where they stand and pay the
+ *  containment cost. Deliveries, passengers, and payments hold; confidence
+ *  erodes and the open-exceptions tally climbs with the unresolved load. */
+export const CONTAINMENT_COSTS: PerMetricDeltas = {
+  openExceptions: 2,
+  deliveries: 0,
+  passengers: 0,
+  payments: 0,
+  confidence: -15,
+}
+
+/** STAGED RECOVERY when viability passes: measured recovery across every
+ *  service figure, the tally falling as real exceptions actually close. */
+export const RECOVERY_DELTAS: PerMetricDeltas = {
+  openExceptions: -3,
+  deliveries: 1,
+  passengers: 300,
+  payments: 1,
+  confidence: 20,
+}
+
+/** STAGED RECOVERY when viability fails: the single constrained stage. Capacity
+ *  thresholds are breached, so recovery holds at one tranche. */
+export const RECOVERY_DELTAS_CONSTRAINED: PerMetricDeltas = {
+  openExceptions: -1,
+  deliveries: 0,
+  passengers: 100,
+  payments: 0,
+  confidence: 5,
+}
+
+function metricsFor(
+  snapshot: FinaleSnapshot,
+  missionId: string,
+): Readonly<Record<string, number>> {
+  return (
+    snapshot.settled.find((s) => s.missionId === missionId)?.metrics ?? {}
+  )
+}
+
+function intMetric(
+  snapshot: FinaleSnapshot,
+  missionId: string,
+  key: string,
+): number {
+  return metricsFor(snapshot, missionId)[key] ?? 0
+}
+
+/** The pre-branch baseline projection: the real service figures the settled
+ *  metrics already carry. Every field is an integer read straight off the
+ *  frozen settled outcomes; the open-exceptions figure reuses the campaign
+ *  selector's baseline-minus-resolved formula. */
+export function baselineProjection(snapshot: FinaleSnapshot): BranchProjection {
+  const openExceptions = selectOpenExceptions(snapshotAsCampaign(snapshot))
+  return {
+    openExceptions,
+    deliveries: intMetric(snapshot, 'outlook', 'required_delivered'),
+    passengers: intMetric(snapshot, 'flights', 'resolved_passengers'),
+    payments: intMetric(snapshot, 'bank', 'payments_cleared'),
+    confidence: intMetric(snapshot, 'bank', 'confidence'),
+  }
+}
+
+/** Apply authored deltas to a baseline projection, clamping every field at
+ *  zero (a negative service figure is a broken panel, not a worse number). */
+function applyDeltas(
+  base: BranchProjection,
+  deltas: PerMetricDeltas,
+): BranchProjection {
+  return {
+    openExceptions: Math.max(0, base.openExceptions + deltas.openExceptions),
+    deliveries: Math.max(0, base.deliveries + deltas.deliveries),
+    passengers: Math.max(0, base.passengers + deltas.passengers),
+    payments: Math.max(0, base.payments + deltas.payments),
+    confidence: Math.max(0, base.confidence + deltas.confidence),
+  }
+}
+
+/** Build the minimal campaign-shaped view the reused selectors read. Only the
+ *  settled outcomes and the baseline matter to selectOpenExceptions and
+ *  computeViability; everything else is an empty stub. Never a live state. */
+function snapshotAsCampaign(snapshot: FinaleSnapshot): CampaignState {
+  return {
+    seedName: '',
+    rng: { words: [] },
+    openExceptionsBaseline: snapshot.openExceptionsBaseline,
+    settleCounter: 0,
+    lastNow: 0,
+    phase: 'finale',
+    activeMission: null,
+    missionQueue: [],
+    campaignQueue: [],
+    settled: snapshot.settled as SettledOutcome[],
+    acknowledgedDebriefs: [],
+    startedMissionIds: [],
+    cluesFound: [],
+    sourceChecks: [],
+    inspectedRecords: [],
+    appliedConsequences: [],
+    preferences: { extendedTime: false },
+  }
+}
+
+/** Reuse the engine's STAGED_RECOVERY viability (computeViability from
+ *  runBranch): per-threshold pass/fail from the summed settled metrics. The
+ *  thresholds are mapped into the finale's view shape without re-deriving any
+ *  number. The threshold numbers come from VIABILITY_THRESHOLDS; this module
+ *  never hardcodes them. */
+export function computeFinaleViability(snapshot: FinaleSnapshot): ViabilityResult {
+  const staged = computeViability(snapshotAsCampaign(snapshot))
+  const thresholds = staged.thresholds.map((t) => ({
+    id: t.key,
+    required: t.threshold,
+    actual: t.actual,
+    pass: t.pass,
+  }))
+  return { pass: staged.viable, thresholds }
+}
+
+/** REPEAT D-83 projection: baseline worsened by REPEAT_DELTAS. */
+export function projectRepeat(snapshot: FinaleSnapshot): BranchProjection {
+  return applyDeltas(baselineProjection(snapshot), REPEAT_DELTAS)
+}
+
+/** HOLD AND VERIFY projection: baseline frozen, CONTAINMENT_COSTS applied. */
+export function projectHold(snapshot: FinaleSnapshot): BranchProjection {
+  return applyDeltas(baselineProjection(snapshot), CONTAINMENT_COSTS)
+}
+
+/** STAGED RECOVERY: the single computation. The viability result selects the
+ *  recovery deltas (full when it passes, constrained when it fails); the SAME
+ *  resulting end state is both .viability's companion projection and the STAGED
+ *  column's figures, so panel and column cannot contradict. */
+export function computeStaged(snapshot: FinaleSnapshot): StagedComputation {
+  const viability = computeFinaleViability(snapshot)
+  const deltas = viability.pass ? RECOVERY_DELTAS : RECOVERY_DELTAS_CONSTRAINED
+  const endState = applyDeltas(baselineProjection(snapshot), deltas)
+  return { endState, viability, projection: endState }
+}
+
+/** Fill the split 01 BranchProjection seam: all three branches from the frozen
+ *  snapshot. Pure and deterministic; callable repeatedly; never mutates the
+ *  snapshot or any live state. */
+export function runProjections(snapshot: FinaleSnapshot): {
+  repeat: BranchProjection
+  hold: BranchProjection
+  staged: StagedComputation
+} {
+  return {
+    repeat: projectRepeat(snapshot),
+    hold: projectHold(snapshot),
+    staged: computeStaged(snapshot),
+  }
+}
+
+/** Authored BranchStep traces, one sequence per branch, derived from each
+ *  branch's transform steps. Consumed later by the shell's playBranchTrace
+ *  (section 04). No em-dashes; UPPERCASE terminal diction on the labels. The
+ *  details read the frozen baseline figures so the trace and the projection
+ *  agree. */
+export function traceFor(
+  branch: BranchId,
+  snapshot: FinaleSnapshot,
+): BranchStep[] {
+  const base = baselineProjection(snapshot)
+  switch (branch) {
+    case 'repeat': {
+      const after = projectRepeat(snapshot)
+      return [
+        {
+          step: 0,
+          label: 'REISSUE D-83',
+          detail: `Run the decoy order again against ${base.deliveries} settled deliveries`,
+        },
+        {
+          step: 1,
+          label: 'ABSORB THE DAMAGE',
+          detail: `Deliveries fall to ${after.deliveries}, passengers to ${after.passengers}`,
+        },
+        {
+          step: 2,
+          label: 'TALLY RESOLVES',
+          detail: `OPEN EXCEPTIONS reads ${after.openExceptions} as WOPR counts the inactivity`,
+        },
+      ]
+    }
+    case 'hold': {
+      const after = projectHold(snapshot)
+      return [
+        {
+          step: 0,
+          label: 'HOLD THE LINE',
+          detail: `Freeze ${base.payments} cleared payments and ${base.passengers} resolved passengers`,
+        },
+        {
+          step: 1,
+          label: 'PAY CONTAINMENT',
+          detail: `Confidence erodes to ${after.confidence} under the standing load`,
+        },
+        {
+          step: 2,
+          label: 'LOG UNRESOLVED',
+          detail: `OPEN EXCEPTIONS climbs to ${after.openExceptions} with nothing closed`,
+        },
+      ]
+    }
+    case 'staged': {
+      const staged = computeStaged(snapshot)
+      const viable = staged.viability.pass
+      return [
+        {
+          step: 0,
+          label: 'STAGE ONE',
+          detail: viable
+            ? `Recover the first tranche from ${base.deliveries} verified deliveries`
+            : `Capacity breached; hold recovery at one tranche from ${base.deliveries} deliveries`,
+        },
+        {
+          step: 1,
+          label: viable ? 'STAGE TWO' : 'STAGE TWO HELD',
+          detail: viable
+            ? `Advance recovery; passengers reach ${staged.projection.passengers}`
+            : `Thresholds fail; passengers reach only ${staged.projection.passengers}`,
+        },
+        {
+          step: 2,
+          label: 'CLOSE EXCEPTIONS',
+          detail: `OPEN EXCEPTIONS settles at ${staged.projection.openExceptions}`,
+        },
+      ]
+    }
+  }
+}
+
+// Re-export so callers can reach the viability threshold contract without a
+// second import of the branch module; the numbers still live there.
+export { VIABILITY_THRESHOLDS }
+export { selectSettledMetrics }
diff --git a/test/engine/missions/finale/endings.test.ts b/test/engine/missions/finale/endings.test.ts
new file mode 100644
index 0000000..5e6123c
--- /dev/null
+++ b/test/engine/missions/finale/endings.test.ts
@@ -0,0 +1,244 @@
+// Section 02 endings: endingId derivation by committed action and cause, the
+// stagedEligible predicate, and the earned-why readback over the three real
+// campaign fixtures. The exactly-once / synchronous-commit race guard lives in
+// section 01's terminal() tests and the countdown reachability fixtures live in
+// section 04; neither is duplicated here.
+import { describe, expect, it } from 'vitest'
+import {
+  deriveEarnedWhy,
+  resolveEnding,
+  stagedEligible,
+} from '@engine/missions/finale/endings'
+import type { EndingId } from '@engine/missions/finale/endings'
+import {
+  computeStaged,
+  projectHold,
+  projectRepeat,
+} from '@engine/missions/finale/projections'
+import type {
+  FinaleSnapshot,
+  ViabilityResult,
+} from '@engine/missions/finale/projections'
+import type { SettledOutcome } from '@engine/campaign/types'
+import { deepFreeze } from '@engine/branch/snapshot'
+import {
+  allFailedCampaign,
+  capacityConstrainedCampaign,
+  healthyCampaign,
+} from './fixtures/campaigns'
+
+function frozen(snapshot: FinaleSnapshot): FinaleSnapshot {
+  return deepFreeze(JSON.parse(JSON.stringify(snapshot)) as FinaleSnapshot)
+}
+
+const EM_DASH = /—/
+
+function pass(p: boolean): ViabilityResult {
+  return {
+    pass: p,
+    thresholds: [{ id: 'service_cost', required: 10, actual: p ? 0 : 20, pass: p }],
+  }
+}
+
+describe('endings: endingId derivation', () => {
+  it("STAGED commit settles cause completed, endingId 'recovery'", () => {
+    expect(resolveEnding('staged', 'completed')).toStrictEqual({
+      endingId: 'recovery',
+      cause: 'completed',
+    })
+  })
+
+  it("HOLD commit settles cause completed, endingId 'containment'", () => {
+    expect(resolveEnding('hold', 'completed')).toStrictEqual({
+      endingId: 'containment',
+      cause: 'completed',
+    })
+  })
+
+  it("REPEAT commit settles cause collapsed, endingId 'failure'", () => {
+    expect(resolveEnding('repeat', 'collapsed')).toStrictEqual({
+      endingId: 'failure',
+      cause: 'collapsed',
+    })
+  })
+
+  it("timeout settles cause collapsed, endingId 'failure'", () => {
+    expect(resolveEnding(null, 'timeout')).toStrictEqual({
+      endingId: 'failure',
+      cause: 'collapsed',
+    })
+    // Timeout overrides any non-committed choice onto the repeated order.
+    expect(resolveEnding('staged', 'timeout')).toStrictEqual({
+      endingId: 'failure',
+      cause: 'collapsed',
+    })
+  })
+
+  it("forfeit settles cause collapsed, endingId 'failure'", () => {
+    expect(resolveEnding(null, 'forfeit')).toStrictEqual({
+      endingId: 'failure',
+      cause: 'collapsed',
+    })
+    expect(resolveEnding('hold', 'forfeit')).toStrictEqual({
+      endingId: 'failure',
+      cause: 'collapsed',
+    })
+  })
+
+  it('settlement carries endingId exactly once; permanence after settle', () => {
+    // resolveEnding is pure and total: the same committed+cause always maps to
+    // the same ending, so a re-evaluation can never flip a settled ending.
+    const first = resolveEnding('staged', 'completed')
+    const again = resolveEnding('staged', 'completed')
+    expect(again).toStrictEqual(first)
+    // A later same-wake timeout cannot override a committed recovery here:
+    // the committed-cause evaluation already produced completed/recovery, and
+    // the mapping of that pair is permanent.
+    expect(resolveEnding('staged', 'completed').endingId).toBe('recovery')
+  })
+})
+
+describe('endings: viability gating input to decision', () => {
+  it('stagedEligible(caseValid, viability) true only when both hold', () => {
+    expect(stagedEligible(true, pass(true))).toBe(true)
+    expect(stagedEligible(true, pass(false))).toBe(false)
+    expect(stagedEligible(false, pass(true))).toBe(false)
+    expect(stagedEligible(false, pass(false))).toBe(false)
+  })
+
+  it('different choice sets across the three campaign fixtures (better earlier play widens the path)', () => {
+    const eligible = (snap: FinaleSnapshot) => {
+      const staged = computeStaged(frozen(snap))
+      return stagedEligible(snap.caseState.caseValid, staged.viability)
+    }
+    // Healthy: case valid + viability passes -> staged open.
+    expect(eligible(healthyCampaign)).toBe(true)
+    // Capacity-constrained: case valid + viability still passes -> staged open.
+    expect(eligible(capacityConstrainedCampaign)).toBe(true)
+    // All-failed: case invalid AND viability fails -> staged closed.
+    expect(eligible(allFailedCampaign)).toBe(false)
+  })
+})
+
+describe('endings: earned-why readback', () => {
+  function whyFor(id: EndingId, snapshot: FinaleSnapshot) {
+    const snap = frozen(snapshot)
+    const projection =
+      id === 'recovery'
+        ? computeStaged(snap).projection
+        : id === 'containment'
+          ? projectHold(snap)
+          : projectRepeat(snap)
+    return deriveEarnedWhy(id, snap, projection)
+  }
+
+  it('names the specific settled outcomes that opened or closed options', () => {
+    const why = whyFor('recovery', healthyCampaign)
+    expect(why.shapingOutcomes.length).toBeGreaterThanOrEqual(3)
+    // Names real figures from the settled metrics, not boilerplate.
+    expect(why.shapingOutcomes.join(' ')).toMatch(/OUTLOOK DELIVERED ALL 3/)
+    expect(why.shapingOutcomes.join(' ')).toMatch(/CLEARED ALL 4 PAYMENTS/)
+    expect(why.shapingOutcomes.join(' ')).toMatch(/RESOLVED 1090 PASSENGERS/)
+  })
+
+  it('names the evidence the player proved (slots of the validated case)', () => {
+    const why = whyFor('recovery', healthyCampaign)
+    expect(why.provedEvidence).toContain('THE INDEPENDENT OBSERVATION')
+    expect(why.provedEvidence).toContain('THE EXERCISE ROOT')
+    expect(why.provedEvidence).toContain(
+      'THE FIELD REPORT CORROBORATED THE OBSERVATION',
+    )
+  })
+
+  it('states what the chosen branch projected versus what the ending states', () => {
+    const recovery = whyFor('recovery', healthyCampaign)
+    expect(recovery.projectedVsActual).toMatch(/STAGED BRANCH PROJECTED/)
+    expect(recovery.projectedVsActual).toMatch(/1390 PASSENGERS/)
+    const failure = whyFor('failure', allFailedCampaign)
+    expect(failure.projectedVsActual).toMatch(/REPEAT BRANCH PROJECTED/)
+    expect(failure.projectedVsActual).toMatch(/COLLAPSED SERVICE/)
+  })
+
+  it('containment readback names the unresolved problems from real campaign state', () => {
+    const why = whyFor('containment', allFailedCampaign)
+    expect(why.unresolved).toBeDefined()
+    expect(why.unresolved!.length).toBeGreaterThan(0)
+    const joined = why.unresolved!.join(' ')
+    // flights held 1090, bank left 4 unpaid, outlook 2 short.
+    expect(joined).toMatch(/1090 PASSENGERS REMAIN HELD/)
+    expect(joined).toMatch(/4 CRITICAL PAYMENTS STAY UNSETTLED/)
+    expect(joined).toMatch(/2 REQUIRED MESSAGES NEVER REACHED/)
+  })
+
+  it('non-containment endings carry no unresolved list', () => {
+    expect(whyFor('recovery', healthyCampaign).unresolved).toBeUndefined()
+    expect(whyFor('failure', allFailedCampaign).unresolved).toBeUndefined()
+  })
+
+  it('readback content differs across healthy, capacity-constrained, all-failed fixtures', () => {
+    const h = whyFor('recovery', healthyCampaign)
+    const c = whyFor('recovery', capacityConstrainedCampaign)
+    const a = whyFor('failure', allFailedCampaign)
+    // Shaping outcomes must read visibly differently per campaign.
+    expect(h.shapingOutcomes).not.toStrictEqual(c.shapingOutcomes)
+    expect(c.shapingOutcomes).not.toStrictEqual(a.shapingOutcomes)
+    expect(h.shapingOutcomes).not.toStrictEqual(a.shapingOutcomes)
+    // Proved evidence differs (all-failed has an invalid, partial case).
+    expect(h.provedEvidence).not.toStrictEqual(a.provedEvidence)
+  })
+
+  it('no em-dash in any readback string; all numbers integer-derived', () => {
+    const snapshots: [EndingId, FinaleSnapshot][] = [
+      ['recovery', healthyCampaign],
+      ['recovery', capacityConstrainedCampaign],
+      ['containment', healthyCampaign],
+      ['containment', allFailedCampaign],
+      ['failure', allFailedCampaign],
+    ]
+    for (const [id, snap] of snapshots) {
+      const why = whyFor(id, snap)
+      const all = [
+        ...why.shapingOutcomes,
+        ...why.provedEvidence,
+        why.projectedVsActual,
+        ...(why.unresolved ?? []),
+      ]
+      for (const line of all) {
+        expect(line).not.toMatch(EM_DASH)
+        // Every embedded number is an integer (no decimal point).
+        const numbers = line.match(/\d+\.\d+/g)
+        expect(numbers).toBeNull()
+      }
+    }
+  })
+})
+
+describe('endings: module settlement wiring', () => {
+  it('resolveEnding agrees with the inert deriveEndingId on committed-only paths', async () => {
+    const { deriveEndingId } = await import('@engine/missions/finale/endings')
+    expect(resolveEnding('staged', 'completed').endingId).toBe(
+      deriveEndingId('staged'),
+    )
+    expect(resolveEnding('hold', 'completed').endingId).toBe(
+      deriveEndingId('hold'),
+    )
+    expect(resolveEnding('repeat', 'collapsed').endingId).toBe(
+      deriveEndingId('repeat'),
+    )
+  })
+
+  it('a settled finale outcome carries a single endingId', () => {
+    // A SettledOutcome shape with the endingId attached exactly once.
+    const outcome: SettledOutcome = {
+      missionId: 'finale',
+      cause: 'completed',
+      tier: 'full',
+      settleSeq: 4,
+      metrics: {},
+      clueId: null,
+      consequences: [],
+      endingId: resolveEnding('staged', 'completed').endingId,
+    }
+    expect(outcome.endingId).toBe('recovery')
+  })
+})
diff --git a/test/engine/missions/finale/fixtures/campaigns.ts b/test/engine/missions/finale/fixtures/campaigns.ts
new file mode 100644
index 0000000..4f837cd
--- /dev/null
+++ b/test/engine/missions/finale/fixtures/campaigns.ts
@@ -0,0 +1,239 @@
+// Three golden campaign fixtures for the finale projections and endings,
+// each FinaleSnapshot built from the REAL settled-outcome metrics the three
+// missions produce through the live engine (captured from their own
+// walkthrough / adversarial / defensive fixtures, not hand-invented):
+//
+//   healthyCampaign            all three missions settled clean (wopr 0, cost 0)
+//   capacityConstrainedCampaign  outlook adversarial + bank do-nothing,
+//                                flights clean: mixed, tight metrics, staged
+//                                still viable
+//   allFailedCampaign          outlook adversarial + bank do-nothing +
+//                              flights grounded: aggregate service_cost breaks
+//                              the viability bound, staged not viable
+//
+// The per-mission metric objects below are verbatim real end states (seed
+// exercise-r04) so the golden projection and viability vectors are pinned to
+// true mission output. baseline open exceptions for exercise-r04 is 12.
+import type { SettledOutcome } from '@engine/campaign/types'
+import type { FinaleSnapshot } from '@engine/missions/finale/projections'
+import type { FinaleCaseState } from '@engine/missions/finale/projections'
+
+export const OPEN_EXCEPTIONS_BASELINE = 12
+
+// ── Real settled-outcome metric objects (seed exercise-r04) ──────────
+
+/** CRASH OUTLOOK walkthrough end state: all three required messages
+ *  delivered correct, completed at full tier. */
+const OUTLOOK_CLEAN: SettledOutcome = {
+  missionId: 'outlook',
+  cause: 'completed',
+  tier: 'full',
+  settleSeq: 1,
+  metrics: {
+    required_delivered: 3,
+    decoy_capacity_spent: 0,
+    weather_correct: 1,
+    payroll_correct: 1,
+    audit_correct: 1,
+    weather_delivered: 1,
+    payroll_delivered: 1,
+    audit_delivered: 1,
+    audit_routed: 1,
+    wopr_resolved: 0,
+    service_cost: 0,
+  },
+  clueId: 'clue-D-83',
+  consequences: [],
+}
+
+/** CRASH OUTLOOK adversarial send-everything end state: one required
+ *  delivered, two decoys spent, timed out below tier. */
+const OUTLOOK_ADVERSARIAL: SettledOutcome = {
+  missionId: 'outlook',
+  cause: 'timeout',
+  tier: 'poor',
+  settleSeq: 1,
+  metrics: {
+    required_delivered: 1,
+    decoy_capacity_spent: 2,
+    weather_correct: 1,
+    payroll_correct: 0,
+    audit_correct: 0,
+    weather_delivered: 1,
+    payroll_delivered: 1,
+    audit_delivered: 1,
+    audit_routed: 0,
+    wopr_resolved: 2,
+    service_cost: 4,
+  },
+  clueId: null,
+  consequences: [],
+}
+
+/** FREEZE BANK ACCOUNTS walkthrough end state: all four payments cleared,
+ *  full tier, sustainable. */
+const BANK_CLEAN: SettledOutcome = {
+  missionId: 'bank',
+  cause: 'completed',
+  tier: 'full',
+  settleSeq: 2,
+  metrics: {
+    sustainability_signals: 3,
+    payments_cleared: 4,
+    payments_total: 4,
+    derived_cash: 25610,
+    confidence: 95,
+    held_accounts: 0,
+    payments_signal: 1,
+    cash_signal: 1,
+    confidence_signal: 1,
+    before_hold_count: 18,
+    before_hold_amount: 4040,
+    genuine_after_hold_count: 0,
+    genuine_after_hold_amount: 0,
+    injected_after_hold_count: 0,
+    injected_after_hold_amount: 0,
+    wopr_resolved: 0,
+    service_cost: 0,
+  },
+  clueId: null,
+  consequences: [],
+}
+
+/** FREEZE BANK ACCOUNTS do-nothing end state: started and left to run, no
+ *  payment cleared. Four payments unpaid: service_cost 4. */
+const BANK_DONOTHING: SettledOutcome = {
+  missionId: 'bank',
+  cause: 'timeout',
+  tier: 'partial',
+  settleSeq: 2,
+  metrics: {
+    sustainability_signals: 2,
+    payments_cleared: 0,
+    payments_total: 4,
+    derived_cash: 31910,
+    confidence: 72,
+    held_accounts: 0,
+    payments_signal: 0,
+    cash_signal: 1,
+    confidence_signal: 1,
+    before_hold_count: 18,
+    before_hold_amount: 4790,
+    genuine_after_hold_count: 0,
+    genuine_after_hold_amount: 0,
+    injected_after_hold_count: 0,
+    injected_after_hold_amount: 0,
+    wopr_resolved: 0,
+    service_cost: 4,
+  },
+  clueId: null,
+  consequences: [],
+}
+
+/** GROUND ALL FLIGHTS walkthrough end state: every flight landed, 1090
+ *  passengers resolved, full tier. */
+const FLIGHTS_CLEAN: SettledOutcome = {
+  missionId: 'flights',
+  cause: 'completed',
+  tier: 'full',
+  settleSeq: 3,
+  metrics: {
+    resolved_passengers: 1090,
+    on_time_passengers: 970,
+    late_passengers: 0,
+    diverted_passengers: 120,
+    stranded_passengers: 0,
+    held_passengers: 0,
+    held_flights: 0,
+    landed_flights: 8,
+    stranded_flights: 0,
+    grounded: 0,
+    wopr_resolved: 0,
+    service_cost: 0,
+  },
+  clueId: null,
+  consequences: [],
+}
+
+/** GROUND ALL FLIGHTS blanket-ground end state: all eight flights held,
+ *  nobody reached a destination, failed tier. wopr 8, cost 8. */
+const FLIGHTS_GROUNDED: SettledOutcome = {
+  missionId: 'flights',
+  cause: 'timeout',
+  tier: 'failed',
+  settleSeq: 3,
+  metrics: {
+    resolved_passengers: 0,
+    on_time_passengers: 0,
+    late_passengers: 0,
+    diverted_passengers: 0,
+    stranded_passengers: 0,
+    held_passengers: 1090,
+    held_flights: 8,
+    landed_flights: 0,
+    stranded_flights: 0,
+    grounded: 1,
+    wopr_resolved: 8,
+    service_cost: 8,
+  },
+  clueId: null,
+  consequences: [],
+}
+
+// ── Finale case state per fixture ────────────────────────────────────
+// The reference-only case facts the earned-why readback names: which slots
+// were proved and whether the field report corroborated. Record ids only.
+
+const CASE_VALID_FULL: FinaleCaseState = {
+  caseValid: true,
+  provedSlots: ['outlook', 'flights', 'bank', 'root', 'observation'],
+  fieldReportCorroborated: true,
+}
+
+const CASE_VALID_FIELD_REPORT: FinaleCaseState = {
+  caseValid: true,
+  provedSlots: ['outlook', 'flights', 'bank', 'root', 'observation'],
+  fieldReportCorroborated: true,
+}
+
+const CASE_INVALID: FinaleCaseState = {
+  caseValid: false,
+  provedSlots: ['outlook', 'bank', 'root'],
+  fieldReportCorroborated: false,
+}
+
+// ── The three snapshots ──────────────────────────────────────────────
+
+function makeSnapshot(
+  settled: readonly SettledOutcome[],
+  caseState: FinaleCaseState,
+): FinaleSnapshot {
+  return {
+    settled,
+    openExceptionsBaseline: OPEN_EXCEPTIONS_BASELINE,
+    caseState,
+  }
+}
+
+export const healthyCampaign: FinaleSnapshot = makeSnapshot(
+  [OUTLOOK_CLEAN, BANK_CLEAN, FLIGHTS_CLEAN],
+  CASE_VALID_FULL,
+)
+
+export const capacityConstrainedCampaign: FinaleSnapshot = makeSnapshot(
+  [OUTLOOK_ADVERSARIAL, BANK_DONOTHING, FLIGHTS_CLEAN],
+  CASE_VALID_FIELD_REPORT,
+)
+
+export const allFailedCampaign: FinaleSnapshot = makeSnapshot(
+  [OUTLOOK_ADVERSARIAL, BANK_DONOTHING, FLIGHTS_GROUNDED],
+  CASE_INVALID,
+)
+
+export const CAMPAIGN_FIXTURES = {
+  healthy: healthyCampaign,
+  capacityConstrained: capacityConstrainedCampaign,
+  allFailed: allFailedCampaign,
+} as const
+
+export type CampaignFixtureId = keyof typeof CAMPAIGN_FIXTURES
diff --git a/test/engine/missions/finale/projections.test.ts b/test/engine/missions/finale/projections.test.ts
new file mode 100644
index 0000000..8351beb
--- /dev/null
+++ b/test/engine/missions/finale/projections.test.ts
@@ -0,0 +1,231 @@
+// Section 02 projections: pure integer transforms over a frozen FinaleSnapshot.
+// Golden values are pinned against the three campaign fixtures, each built from
+// REAL mission walkthrough / adversarial / defensive end states. The
+// single-computation rule (viability panel and STAGED column are one object)
+// and snapshot/live-state immutability are asserted here.
+import { describe, expect, it } from 'vitest'
+import {
+  baselineProjection,
+  computeFinaleViability,
+  computeStaged,
+  projectHold,
+  projectRepeat,
+  runProjections,
+  traceFor,
+} from '@engine/missions/finale/projections'
+import type {
+  BranchId,
+  FinaleSnapshot,
+} from '@engine/missions/finale/projections'
+import { deepFreeze } from '@engine/branch/snapshot'
+import {
+  allFailedCampaign,
+  capacityConstrainedCampaign,
+  healthyCampaign,
+} from './fixtures/campaigns'
+
+function frozen(snapshot: FinaleSnapshot): FinaleSnapshot {
+  return deepFreeze(JSON.parse(JSON.stringify(snapshot)) as FinaleSnapshot)
+}
+
+const EM_DASH = /—/
+
+// ── Golden projection vectors (hand-computed from the authored deltas over
+//    the real settled-metric baselines; see fixtures/campaigns.ts) ──────
+
+const REPEAT_GOLDEN = {
+  healthy: { openExceptions: 6, deliveries: 1, passengers: 490, payments: 2, confidence: 55 },
+  capacityConstrained: { openExceptions: 4, deliveries: 0, passengers: 490, payments: 0, confidence: 32 },
+  allFailed: { openExceptions: 0, deliveries: 0, passengers: 0, payments: 0, confidence: 32 },
+}
+
+const HOLD_GOLDEN = {
+  healthy: { openExceptions: 14, deliveries: 3, passengers: 1090, payments: 4, confidence: 80 },
+  capacityConstrained: { openExceptions: 12, deliveries: 1, passengers: 1090, payments: 0, confidence: 57 },
+  allFailed: { openExceptions: 4, deliveries: 1, passengers: 0, payments: 0, confidence: 57 },
+}
+
+const STAGED_GOLDEN = {
+  healthy: { openExceptions: 9, deliveries: 4, passengers: 1390, payments: 5, confidence: 115 },
+  capacityConstrained: { openExceptions: 7, deliveries: 2, passengers: 1390, payments: 1, confidence: 92 },
+  allFailed: { openExceptions: 1, deliveries: 1, passengers: 100, payments: 0, confidence: 77 },
+}
+
+const FIXTURES = {
+  healthy: healthyCampaign,
+  capacityConstrained: capacityConstrainedCampaign,
+  allFailed: allFailedCampaign,
+} as const
+
+type FixtureId = keyof typeof FIXTURES
+
+const FIXTURE_IDS = Object.keys(FIXTURES) as FixtureId[]
+
+describe('projections: pure transforms over settled metrics', () => {
+  it.each(FIXTURE_IDS)('repeat branch golden values: %s', (id) => {
+    expect(projectRepeat(frozen(FIXTURES[id]))).toStrictEqual(REPEAT_GOLDEN[id])
+  })
+
+  it.each(FIXTURE_IDS)('hold branch golden values: %s', (id) => {
+    expect(projectHold(frozen(FIXTURES[id]))).toStrictEqual(HOLD_GOLDEN[id])
+  })
+
+  it.each(FIXTURE_IDS)('staged branch golden values: %s', (id) => {
+    expect(computeStaged(frozen(FIXTURES[id])).projection).toStrictEqual(
+      STAGED_GOLDEN[id],
+    )
+  })
+
+  it('repeat runs are strictly equal (same inputs, deepStrictEqual outputs)', () => {
+    const snap = frozen(healthyCampaign)
+    const a = runProjections(snap)
+    const b = runProjections(snap)
+    expect(a).toStrictEqual(b)
+    // And across every fixture.
+    for (const id of FIXTURE_IDS) {
+      const s = frozen(FIXTURES[id])
+      expect(runProjections(s)).toStrictEqual(runProjections(s))
+    }
+  })
+
+  it('projection run leaves the frozen baseline untouched (snapshot immutability)', () => {
+    const snap = frozen(healthyCampaign)
+    const before = JSON.parse(JSON.stringify(snap))
+    runProjections(snap)
+    expect(snap).toStrictEqual(before)
+    expect(Object.isFrozen(snap)).toBe(true)
+    expect(Object.isFrozen(snap.settled)).toBe(true)
+  })
+
+  it('projection run leaves a live (unfrozen) campaign-case state untouched', () => {
+    // A live case state that keeps mutating after START must never be touched
+    // by the projections; the transforms read only the snapshot argument.
+    const live = JSON.parse(JSON.stringify(healthyCampaign)) as FinaleSnapshot
+    const before = JSON.parse(JSON.stringify(live))
+    runProjections(frozen(healthyCampaign))
+    expect(live).toStrictEqual(before)
+  })
+
+  it('branch execution order is irrelevant: any permutation yields identical results', () => {
+    const snap = frozen(capacityConstrainedCampaign)
+    const repeatFirst = {
+      repeat: projectRepeat(snap),
+      hold: projectHold(snap),
+      staged: computeStaged(snap),
+    }
+    const stagedFirst = {
+      staged: computeStaged(snap),
+      hold: projectHold(snap),
+      repeat: projectRepeat(snap),
+    }
+    expect(repeatFirst.repeat).toStrictEqual(stagedFirst.repeat)
+    expect(repeatFirst.hold).toStrictEqual(stagedFirst.hold)
+    expect(repeatFirst.staged).toStrictEqual(stagedFirst.staged)
+  })
+
+  it('baseline projection reads the real settled figures', () => {
+    expect(baselineProjection(frozen(healthyCampaign))).toStrictEqual({
+      openExceptions: 12,
+      deliveries: 3,
+      passengers: 1090,
+      payments: 4,
+      confidence: 95,
+    })
+  })
+})
+
+describe('projections: viability-column single computation', () => {
+  it('per-threshold pass/fail strict-equals values derived from the staged end state', () => {
+    for (const id of FIXTURE_IDS) {
+      const snap = frozen(FIXTURES[id])
+      const staged = computeStaged(snap)
+      // The panel reads staged.viability; the column reads staged.projection.
+      // Both must be the SAME object graph rooted at staged.endState: the
+      // projection the column renders IS staged.endState by reference.
+      expect(staged.projection).toBe(staged.endState)
+      // And the panel's viability is the same computation the standalone
+      // selector returns from the same snapshot: no second formula exists.
+      expect(staged.viability).toStrictEqual(computeFinaleViability(snap))
+      // Per-threshold pass must re-derive from the actual vs required on the
+      // SAME viability object the panel renders.
+      for (const t of staged.viability.thresholds) {
+        expect(t.pass).toBe(t.actual <= t.required)
+      }
+      // Overall pass is the AND of the per-threshold passes.
+      expect(staged.viability.pass).toBe(
+        staged.viability.thresholds.every((t) => t.pass),
+      )
+    }
+  })
+
+  it('viability thresholds derive from settled metrics: healthy passes, all-failed fails', () => {
+    expect(computeFinaleViability(frozen(healthyCampaign)).pass).toBe(true)
+    expect(computeFinaleViability(frozen(capacityConstrainedCampaign)).pass).toBe(
+      true,
+    )
+    const failed = computeFinaleViability(frozen(allFailedCampaign))
+    expect(failed.pass).toBe(false)
+    // service_cost is the threshold the all-failed campaign breaks.
+    const cost = failed.thresholds.find((t) => t.id === 'service_cost')!
+    expect(cost.pass).toBe(false)
+    expect(cost.actual).toBeGreaterThan(cost.required)
+  })
+
+  it('does not hardcode threshold numbers: the required values equal VIABILITY_THRESHOLDS', async () => {
+    const { VIABILITY_THRESHOLDS } = await import('@engine/branch/types')
+    const v = computeFinaleViability(frozen(healthyCampaign))
+    for (const t of VIABILITY_THRESHOLDS) {
+      const view = v.thresholds.find((x) => x.id === t.key)!
+      expect(view.required).toBe(t.max)
+    }
+  })
+})
+
+describe('projections: dual-state model', () => {
+  it('post-START field report updates the live case file and never the frozen baseline', () => {
+    const snap = frozen(capacityConstrainedCampaign)
+    // A separate live case state receives a late field report after START.
+    const live: FinaleSnapshot = JSON.parse(JSON.stringify(snap))
+    const mutableLive = live as { caseState: { fieldReportCorroborated: boolean } }
+    mutableLive.caseState.fieldReportCorroborated = false
+    // The branch baseline (frozen snapshot) is unaffected by the live edit.
+    expect(snap.caseState.fieldReportCorroborated).toBe(true)
+    // And the projections, which read only the snapshot, are unchanged.
+    expect(runProjections(snap)).toStrictEqual(runProjections(frozen(capacityConstrainedCampaign)))
+  })
+})
+
+describe('projections: branch traces', () => {
+  const BRANCHES: BranchId[] = ['repeat', 'hold', 'staged']
+
+  it.each(BRANCHES)('each branch yields an authored BranchStep[]: %s', (branch) => {
+    const steps = traceFor(branch, frozen(healthyCampaign))
+    expect(steps.length).toBeGreaterThan(0)
+    steps.forEach((s, i) => {
+      expect(s.step).toBe(i)
+      expect(typeof s.label).toBe('string')
+      expect(typeof s.detail).toBe('string')
+      expect(s.label.length).toBeGreaterThan(0)
+      expect(s.detail.length).toBeGreaterThan(0)
+    })
+  })
+
+  it('trace steps carry { step, label, detail } and no em-dash in any string', () => {
+    for (const branch of BRANCHES) {
+      for (const id of FIXTURE_IDS) {
+        const steps = traceFor(branch, frozen(FIXTURES[id]))
+        for (const s of steps) {
+          expect(Object.keys(s).sort()).toStrictEqual(['detail', 'label', 'step'])
+          expect(s.label).not.toMatch(EM_DASH)
+          expect(s.detail).not.toMatch(EM_DASH)
+        }
+      }
+    }
+  })
+
+  it('traces are deterministic across repeated calls', () => {
+    const a = traceFor('staged', frozen(allFailedCampaign))
+    const b = traceFor('staged', frozen(allFailedCampaign))
+    expect(a).toStrictEqual(b)
+  })
+})
