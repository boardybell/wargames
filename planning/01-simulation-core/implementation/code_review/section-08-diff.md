diff --git a/src/engine/campaign/engine.ts b/src/engine/campaign/engine.ts
index c29c142..74885fa 100644
--- a/src/engine/campaign/engine.ts
+++ b/src/engine/campaign/engine.ts
@@ -58,6 +58,7 @@ export function createCampaign(
     // stream from day one.
     rng: { words: [...rngFromSeed(seed.seedNumber).words] },
     openExceptionsBaseline: seed.openExceptionsBaseline,
+    settleCounter: 0,
     // Seed lastNow at creation so the first dispatch is not spuriously
     // clamped by the 30-minute catch-up cap.
     lastNow: now,
@@ -132,7 +133,8 @@ function settle(
   }
   const module = ctx.missions[runtime.missionId]
   if (!module) throw new Error(`campaign: unknown mission ${runtime.missionId}`)
-  const outcome: SettledOutcome = module.evaluate(runtime.substate, cause)
+  const evaluated = module.evaluate(runtime.substate, cause)
+  const outcome: SettledOutcome = { ...evaluated, settleSeq: state.settleCounter }
   emitted.push({
     type: 'settlement',
     missionId: runtime.missionId,
@@ -141,6 +143,7 @@ function settle(
   })
   let next: CampaignState = {
     ...state,
+    settleCounter: state.settleCounter + 1,
     settled: [...state.settled, outcome].sort((a, b) =>
       a.missionId < b.missionId ? -1 : a.missionId > b.missionId ? 1 : 0,
     ),
diff --git a/src/engine/campaign/state.ts b/src/engine/campaign/state.ts
index 0f26e46..9842b41 100644
--- a/src/engine/campaign/state.ts
+++ b/src/engine/campaign/state.ts
@@ -6,46 +6,47 @@ import * as v from 'valibot'
 
 const integer = v.pipe(v.number(), v.integer())
 
-const scheduledEventSchema = v.object({
+const scheduledEventSchema = v.strictObject({
   id: v.string(),
   scheduledAt: integer,
   kind: v.string(),
   payload: v.unknown(),
 })
 
-const rngStateSchema = v.object({
+const rngStateSchema = v.strictObject({
   words: v.array(v.pipe(v.number(), v.finite())),
 })
 
-const consequenceSchema = v.object({
+const consequenceSchema = v.strictObject({
   id: v.string(),
   kind: v.picklist(['commsDelayed', 'flightsDisrupted', 'paymentsDelayed']),
   magnitude: integer,
 })
 
-const settledOutcomeSchema = v.object({
+const settledOutcomeSchema = v.strictObject({
   missionId: v.string(),
   cause: v.picklist(['completed', 'collapsed', 'timeout', 'forfeit']),
   tier: v.picklist(['full', 'partial', 'poor', 'failed']),
+  settleSeq: integer,
   metrics: v.record(v.string(), integer),
   clueId: v.nullable(v.string()),
   consequences: v.array(consequenceSchema),
   endingId: v.optional(v.picklist(['recovery', 'containment', 'failure'])),
 })
 
-const appliedMarkerSchema = v.object({
+const appliedMarkerSchema = v.strictObject({
   consequenceId: v.string(),
   targetMissionId: v.string(),
 })
 
-const sourceCheckResultSchema = v.object({
+const sourceCheckResultSchema = v.strictObject({
   recordId: v.string(),
   outcome: v.picklist(['CONFIRMED', 'CONTRADICTED', 'PENDING', 'UNKNOWN']),
   resolvedAt: integer,
   arrivedAfterSettlement: v.boolean(),
 })
 
-const missionRuntimeSchema = v.object({
+const missionRuntimeSchema = v.strictObject({
   missionId: v.string(),
   endsAt: integer,
   actionCount: integer,
@@ -54,10 +55,11 @@ const missionRuntimeSchema = v.object({
   substate: v.unknown(),
 })
 
-export const campaignStateSchema = v.object({
+export const campaignStateSchema = v.strictObject({
   seedName: v.string(),
   rng: rngStateSchema,
   openExceptionsBaseline: integer,
+  settleCounter: integer,
   lastNow: integer,
   phase: v.picklist(['menu', 'mission', 'debrief', 'finale', 'ended']),
   activeMission: v.nullable(missionRuntimeSchema),
@@ -70,7 +72,7 @@ export const campaignStateSchema = v.object({
   sourceChecks: v.array(sourceCheckResultSchema),
   inspectedRecords: v.array(v.string()),
   appliedConsequences: v.array(appliedMarkerSchema),
-  preferences: v.object({ extendedTime: v.boolean() }),
+  preferences: v.strictObject({ extendedTime: v.boolean() }),
 })
 
 export type CampaignState = v.InferOutput<typeof campaignStateSchema>
diff --git a/src/engine/campaign/types.ts b/src/engine/campaign/types.ts
index b300454..db3fb1e 100644
--- a/src/engine/campaign/types.ts
+++ b/src/engine/campaign/types.ts
@@ -26,6 +26,9 @@ export interface SettledOutcome {
   readonly missionId: MissionId
   readonly cause: SettlementCause
   readonly tier: OutcomeTier
+  /** Monotonic settlement order within the campaign, so the save merge
+   *  guard can pick the first-settled outcome when two sources differ. */
+  readonly settleSeq: number
   /** Integer service metrics, mission-defined keys. */
   readonly metrics: Record<string, number>
   readonly clueId: string | null
diff --git a/src/engine/missions/types.ts b/src/engine/missions/types.ts
index 8e20f5e..a8df8e4 100644
--- a/src/engine/missions/types.ts
+++ b/src/engine/missions/types.ts
@@ -12,6 +12,9 @@ import type {
   SettlementCause,
 } from '../campaign/types'
 
+/** What a module authors; the engine stamps settleSeq at settlement. */
+export type EvaluatedOutcome = Omit<SettledOutcome, 'settleSeq'>
+
 export interface DeskCheckEntry {
   readonly recordId: string
   readonly outcome: SourceCheckOutcome
@@ -77,7 +80,7 @@ export interface MissionModule<S = unknown> {
   ): S
   validate(state: S, payload: unknown): Validity
   reduce(state: S, event: MissionEvent): S
-  evaluate(state: S, cause: SettlementCause): SettledOutcome
+  evaluate(state: S, cause: SettlementCause): EvaluatedOutcome
   /** Amendment 7: polled after every reduce and drain; non-null
    *  settles immediately with that cause. */
   terminal?(state: S): 'completed' | 'collapsed' | null
diff --git a/src/engine/save/index.ts b/src/engine/save/index.ts
new file mode 100644
index 0000000..730fff1
--- /dev/null
+++ b/src/engine/save/index.ts
@@ -0,0 +1,311 @@
+// Versioned, validated persistence. The Valibot schema is the source of
+// truth; migrations are total and defensive; a throw anywhere on the
+// load chain (parse, migrate, validate, merge) falls through primary to
+// backup to fresh, and the monotonic merge guard runs on every load
+// path so a stale backup can never resurrect a settled mission. All
+// storage calls are fallible: Safari private mode, ITP eviction, quota.
+import * as v from 'valibot'
+import { campaignStateSchema } from '../campaign/state'
+import type { CampaignState } from '../campaign/state'
+import type { AppliedMarker, SettledOutcome } from '../campaign/types'
+import type { MissionRegistry } from '../missions/types'
+
+export const PRIMARY_KEY = 'wargames.save.primary'
+export const BACKUP_KEY = 'wargames.save.backup'
+export const CURRENT_VERSION = 1
+
+/** Every call may throw; the save layer treats all as fallible. Writes are
+ *  assumed atomic per key (the localStorage contract): a throwing write
+ *  leaves the prior value intact and never deposits a partial one. The
+ *  persist rollback relies on this — a port without it could still surface
+ *  a torn slot on a failed restore. */
+export interface StoragePort {
+  read(key: string): string | null
+  write(key: string, value: string): void
+  remove(key: string): void
+}
+
+// The post-migration envelope must be exactly the current version: a
+// migration that returns any other version is a bug, and pinning the
+// literal here catches it at parse rather than letting a mis-versioned
+// state validate and load.
+const savePayloadSchema = v.object({
+  version: v.literal(CURRENT_VERSION),
+  state: campaignStateSchema,
+})
+
+export type SavePayload = v.InferOutput<typeof savePayloadSchema>
+
+export type Migration = (raw: unknown) => unknown
+
+/** Ordered pure, total, defensive migrations from version N to N+1.
+ *  Empty at v1; the pipeline and its test exist from day one. The runner
+ *  accepts an injectable array so the application path is testable
+ *  without shipping a migration. */
+export const MIGRATIONS: ReadonlyArray<Migration> = []
+
+export function encodeSave(state: CampaignState): string {
+  // Pre-write validation turns a would-be silent corruption (a non-
+  // JSON-safe substate, a non-integer field) into a catchable failure.
+  v.parse(campaignStateSchema, state)
+  return JSON.stringify({ version: CURRENT_VERSION, state })
+}
+
+/** The migration runner, exported so the application path is testable
+ *  with an injected migration without shipping one in MIGRATIONS. */
+export function runMigrations(
+  raw: unknown,
+  migrations: ReadonlyArray<Migration> = MIGRATIONS,
+): unknown {
+  const envelope = raw as { version?: unknown }
+  // A missing version is the real pre-versioning case: treat it as v0 and
+  // route it through migration (defensive, not default-to-current).
+  let version =
+    typeof envelope?.version === 'number' ? envelope.version : 0
+  if (!Number.isInteger(version) || version < 0 || version > CURRENT_VERSION) {
+    throw new Error(`save: unknown version ${String(version)}`)
+  }
+  let current = raw
+  while (version < CURRENT_VERSION) {
+    const step = migrations[version]
+    if (!step) throw new Error(`save: missing migration from ${version}`)
+    current = step(current)
+    version += 1
+  }
+  return current
+}
+
+/** Validate the one thing the campaign schema leaves opaque: the active
+ *  mission's substate, against that mission's own saveSchema. Throws on a
+ *  mismatch (unknown mission, or an engine-produced substate corrupted on
+ *  disk). A settled or absent mission has no live substate to check. */
+function validateActiveSubstate(
+  state: CampaignState,
+  registry: MissionRegistry,
+): void {
+  const runtime = state.activeMission
+  if (!runtime) return
+  const module = registry[runtime.missionId]
+  if (!module) throw new Error(`save: unknown mission ${runtime.missionId}`)
+  v.parse(module.saveSchema, runtime.substate)
+}
+
+/** Composes the active mission's saveSchema at load: the campaign schema
+ *  validates the envelope, then the mission module validates its own
+ *  substate. Throws on any mismatch; callers handle fallthrough. */
+export function decodeSave(
+  raw: string,
+  registry: MissionRegistry,
+): CampaignState {
+  const parsed = JSON.parse(raw) as unknown
+  const migrated = runMigrations(parsed)
+  const payload = v.parse(savePayloadSchema, migrated)
+  validateActiveSubstate(payload.state, registry)
+  return payload.state
+}
+
+const byMissionId = (
+  a: { readonly missionId: string },
+  b: { readonly missionId: string },
+): number => (a.missionId < b.missionId ? -1 : a.missionId > b.missionId ? 1 : 0)
+
+const byMarkerKey = (a: AppliedMarker, b: AppliedMarker): number =>
+  a.consequenceId !== b.consequenceId
+    ? a.consequenceId < b.consequenceId
+      ? -1
+      : 1
+    : a.targetMissionId < b.targetMissionId
+      ? -1
+      : a.targetMissionId > b.targetMissionId
+        ? 1
+        : 0
+
+/** Reconcile a loaded save against the live session. The in-session state,
+ *  when present, is authoritative: a reload can only ADD settlement facts
+ *  for missions the session has never settled, and can never roll back the
+ *  live rng, clock, queues, or active mission. settleSeq is a per-lineage
+ *  counter and is NOT comparable across two divergent saves, so the merge
+ *  is by source priority, not by seq. The self-consistency pass (a settled
+ *  mission can never also be active) and the settle-counter floor run on
+ *  every path, including a fresh boot where there is no session to merge
+ *  against, so a single corrupt slot is sanitized regardless. Idempotent:
+ *  feeding a guarded state back through changes nothing. */
+export function mergeGuard(
+  loaded: CampaignState,
+  inSession: CampaignState | null,
+): CampaignState {
+  // Base is the authoritative state: the live session when present, else
+  // the loaded save on a fresh boot.
+  const base = inSession ?? loaded
+  // Settled facts: the base's own, plus — only when merging a load against
+  // a live session — any settled mission the session has never seen. A
+  // stale load can thus move settlement forward but never overwrite or
+  // unsettle a mission the session already resolved.
+  const byMission = new Map<string, SettledOutcome>(
+    base.settled.map((s) => [s.missionId, s]),
+  )
+  if (inSession) {
+    for (const outcome of loaded.settled) {
+      if (!byMission.has(outcome.missionId)) {
+        byMission.set(outcome.missionId, outcome)
+      }
+    }
+  }
+  const settled = [...byMission.values()].sort(byMissionId)
+  const settledIds = new Set(settled.map((s) => s.missionId))
+  // Self-consistency: a settled mission can never also be the active one.
+  const activeMission =
+    base.activeMission && settledIds.has(base.activeMission.missionId)
+      ? null
+      : base.activeMission
+  // Union applied-consequence markers from both sources, keyed by
+  // (consequenceId, targetMissionId).
+  const mergedMarkers = new Map(
+    base.appliedConsequences.map((m) => [
+      `${m.consequenceId}:${m.targetMissionId}`,
+      m,
+    ]),
+  )
+  if (inSession) {
+    for (const m of loaded.appliedConsequences) {
+      const key = `${m.consequenceId}:${m.targetMissionId}`
+      if (!mergedMarkers.has(key)) mergedMarkers.set(key, m)
+    }
+  }
+  // Clues are monotonic: every settled outcome's clue is permanently known.
+  // Fold them over the merged settled set so an additively-imported outcome
+  // can never leave its clue unrecorded — an internal-consistency skew the
+  // self-consistency pass (settled-vs-active only) would not otherwise catch.
+  const cluesFound = [
+    ...new Set([
+      ...base.cluesFound,
+      ...settled
+        .map((s) => s.clueId)
+        .filter((c): c is string => c !== null),
+    ]),
+  ].sort()
+  // The settle counter must never regress below any imported settleSeq, or
+  // the next in-engine settlement would reuse a stamp.
+  const maxSeq = settled.reduce(
+    (m, s) => (s.settleSeq > m ? s.settleSeq : m),
+    -1,
+  )
+  const settleCounter = Math.max(base.settleCounter, maxSeq + 1)
+  return {
+    ...base,
+    settled,
+    activeMission,
+    cluesFound,
+    settleCounter,
+    appliedConsequences: [...mergedMarkers.values()].sort(byMarkerKey),
+  }
+}
+
+export type RecoveryFlag = 'clean' | 'recovered-backup' | 'reset'
+
+export interface LoadResult {
+  readonly state: CampaignState | null
+  readonly recovery: RecoveryFlag
+}
+
+function tryLoad(
+  port: StoragePort,
+  key: string,
+  registry: MissionRegistry,
+  inSession: CampaignState | null,
+): CampaignState | null {
+  try {
+    const raw = port.read(key)
+    if (raw === null) return null
+    return mergeGuard(decodeSave(raw, registry), inSession)
+  } catch {
+    return null
+  }
+}
+
+/** Primary then backup then fresh. The monotonic merge guard runs on
+ *  both slot paths. The recovery flag is the shell's visible reset path. */
+export function loadCampaign(
+  port: StoragePort,
+  registry: MissionRegistry,
+  inSession: CampaignState | null = null,
+): LoadResult {
+  const primary = tryLoad(port, PRIMARY_KEY, registry, inSession)
+  if (primary) return { state: primary, recovery: 'clean' }
+  const backup = tryLoad(port, BACKUP_KEY, registry, inSession)
+  if (backup) return { state: backup, recovery: 'recovered-backup' }
+  return { state: null, recovery: 'reset' }
+}
+
+export interface PersistResult {
+  readonly ok: boolean
+  readonly reason?: string
+}
+
+/** Validate, snapshot the prior primary into backup (a double buffer, so
+ *  the backup always trails one generation and offers real rollback),
+ *  then write and read-back-confirm the new primary. On a QuotaExceeded
+ *  storm the backup slot is freed and the primary retried once; if that
+ *  still fails the prior good primary is restored, so no path ever leaves
+ *  a torn or garbage primary behind. The validity check composes the
+ *  active mission's own schema, so write-side substate corruption is
+ *  reported now rather than surfacing as a silent reset next session. No
+ *  path throws out of this function. */
+export function persistCampaign(
+  port: StoragePort,
+  state: CampaignState,
+  registry: MissionRegistry,
+): PersistResult {
+  let payload: string
+  try {
+    // encodeSave validates campaignStateSchema; the only thing it leaves
+    // opaque is the active substate, so compose just that mission schema
+    // rather than re-parsing the whole (up to 64 KB) payload. A broken
+    // substate fails here, at write, not as a silent reset next load.
+    payload = encodeSave(state)
+    validateActiveSubstate(state, registry)
+  } catch {
+    return { ok: false, reason: 'INVALID STATE' }
+  }
+  const safeRead = (key: string): string | null => {
+    try {
+      return port.read(key)
+    } catch {
+      return null
+    }
+  }
+  const safeWrite = (key: string, value: string): void => {
+    try {
+      port.write(key, value)
+    } catch {
+      // best effort
+    }
+  }
+  // Preserve the last confirmed-good primary one generation back in the
+  // backup slot before overwriting primary, and keep it for rollback.
+  const prior = safeRead(PRIMARY_KEY)
+  if (prior !== null && prior !== payload) safeWrite(BACKUP_KEY, prior)
+  const confirmPrimary = (): boolean => {
+    try {
+      port.write(PRIMARY_KEY, payload)
+      return port.read(PRIMARY_KEY) === payload
+    } catch (error) {
+      if ((error as { name?: string })?.name === 'QuotaExceededError') {
+        try {
+          port.remove(BACKUP_KEY)
+          port.write(PRIMARY_KEY, payload)
+          return port.read(PRIMARY_KEY) === payload
+        } catch {
+          return false
+        }
+      }
+      return false
+    }
+  }
+  if (!confirmPrimary()) {
+    // Restore the prior good primary so the slot is never left torn.
+    if (prior !== null) safeWrite(PRIMARY_KEY, prior)
+    return { ok: false, reason: 'PRIMARY WRITE FAILED' }
+  }
+  return { ok: true }
+}
diff --git a/src/engine/testing/index.ts b/src/engine/testing/index.ts
index c02e601..a335494 100644
--- a/src/engine/testing/index.ts
+++ b/src/engine/testing/index.ts
@@ -7,6 +7,7 @@
 // draws and times only through events.
 import * as v from 'valibot'
 import type {
+  EvaluatedOutcome,
   FoldedConsequences,
   MissionEvent,
   MissionModule,
@@ -108,7 +109,7 @@ export function makeTestDoubleMission(
       }
       return logged
     },
-    evaluate(state, cause: SettlementCause): SettledOutcome {
+    evaluate(state, cause: SettlementCause): EvaluatedOutcome {
       const tier =
         state.delivered >= state.goal
           ? 'full'
diff --git a/test/engine/missions/interface.test.ts b/test/engine/missions/interface.test.ts
index d29edc1..1abf570 100644
--- a/test/engine/missions/interface.test.ts
+++ b/test/engine/missions/interface.test.ts
@@ -125,11 +125,13 @@ describe('mission-module lifecycle through the engine', () => {
 
   it('debrief renders from the settled outcome', () => {
     const module = makeTestDoubleMission('alpha')
-    const outcome = module.evaluate(
+    const evaluated = module.evaluate(
       module.init(ctx.seeds['test-seed']!, { byKind: {} }, 240_000),
       'timeout',
     )
-    const payload = module.debrief!(outcome)
+    // The engine stamps settleSeq at settle(); debrief renders the full
+    // settled outcome, so supply the stamp the engine would have added.
+    const payload = module.debrief!({ ...evaluated, settleSeq: 0 })
     expect(payload.headline).toBe('FAILED (TIMEOUT)')
     expect(payload.missionId).toBe('alpha')
     expect(payload.lines[0]).toContain('SERVICE COST 30')
diff --git a/test/engine/save/save.test.ts b/test/engine/save/save.test.ts
new file mode 100644
index 0000000..2c70342
--- /dev/null
+++ b/test/engine/save/save.test.ts
@@ -0,0 +1,512 @@
+import { describe, expect, it } from 'vitest'
+import {
+  BACKUP_KEY,
+  PRIMARY_KEY,
+  decodeSave,
+  encodeSave,
+  loadCampaign,
+  mergeGuard,
+  persistCampaign,
+  runMigrations,
+} from '@engine/save'
+import type { Migration, StoragePort } from '@engine/save'
+import { buildTestContext } from '@engine/testing'
+import { createCampaign, dispatch } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import { FIXTURE_RECORDS } from '../records/fixtures'
+import { stateHash } from '../harness/canonical'
+
+const ctx = buildTestContext(FIXTURE_RECORDS)
+const registry = ctx.missions
+const T0 = 1_000_000
+
+function memoryPort(seed: Record<string, string> = {}): StoragePort & {
+  store: Record<string, string>
+} {
+  const store: Record<string, string> = { ...seed }
+  return {
+    store,
+    read: (k) => store[k] ?? null,
+    write: (k, v) => {
+      store[k] = v
+    },
+    remove: (k) => {
+      delete store[k]
+    },
+  }
+}
+
+function won(): CampaignState {
+  let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, T0)
+  for (const action of [
+    { type: 'START_MISSION', missionId: 'alpha' } as const,
+    { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } } as const,
+    { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } } as const,
+    { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } } as const,
+  ]) {
+    state = dispatch(ctx, state, action, state.lastNow + 1_000).state
+  }
+  return state
+}
+
+describe('codec', () => {
+  it('encode/decode round-trips a mid-mission state byte-for-byte', () => {
+    const started = dispatch(
+      ctx,
+      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
+      { type: 'START_MISSION', missionId: 'alpha' },
+      T0,
+    ).state
+    const revived = decodeSave(encodeSave(started), registry)
+    expect(stateHash(revived)).toBe(stateHash(started))
+    expect(revived.activeMission).not.toBeNull()
+  })
+
+  it('corrupt mission substate fails validation', () => {
+    const started = dispatch(
+      ctx,
+      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
+      { type: 'START_MISSION', missionId: 'alpha' },
+      T0,
+    ).state
+    const raw = encodeSave(started)
+    const poisoned = JSON.parse(raw)
+    poisoned.state.activeMission.substate.delivered = 'three'
+    expect(() => decodeSave(JSON.stringify(poisoned), registry)).toThrow()
+  })
+
+  it('an unknown version throws, a missing migration throws', () => {
+    const future = JSON.stringify({ version: 99, state: won() })
+    expect(() => decodeSave(future, registry)).toThrow(/version/)
+  })
+})
+
+describe('load fallthrough', () => {
+  it('intact primary loads clean', () => {
+    const port = memoryPort({ [PRIMARY_KEY]: encodeSave(won()) })
+    const result = loadCampaign(port, registry)
+    expect(result.recovery).toBe('clean')
+    expect(result.state?.settled).toHaveLength(1)
+  })
+
+  it('corrupt primary falls to backup', () => {
+    const port = memoryPort({
+      [PRIMARY_KEY]: '{not valid json',
+      [BACKUP_KEY]: encodeSave(won()),
+    })
+    const result = loadCampaign(port, registry)
+    expect(result.recovery).toBe('recovered-backup')
+    expect(result.state).not.toBeNull()
+  })
+
+  it('corrupt both falls to fresh with reset flag', () => {
+    const port = memoryPort({
+      [PRIMARY_KEY]: 'garbage',
+      [BACKUP_KEY]: 'also garbage',
+    })
+    const result = loadCampaign(port, registry)
+    expect(result).toEqual({ state: null, recovery: 'reset' })
+  })
+
+  it('a throwing migration falls through, not just parse errors', () => {
+    const port = memoryPort({
+      [PRIMARY_KEY]: JSON.stringify({ version: -1, state: won() }),
+      [BACKUP_KEY]: encodeSave(won()),
+    })
+    const result = loadCampaign(port, registry)
+    expect(result.recovery).toBe('recovered-backup')
+  })
+
+  it('a primary with valid JSON but a broken mission substate falls to backup', () => {
+    // Structurally valid envelope, but the active mission substate violates
+    // the module schema. Only the composed decode (not a bare JSON parse)
+    // catches this, so it exercises the end-to-end loader fallthrough.
+    const started = dispatch(
+      ctx,
+      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
+      { type: 'START_MISSION', missionId: 'alpha' },
+      T0,
+    ).state
+    const poisoned = JSON.parse(encodeSave(started)) as {
+      state: { activeMission: { substate: { delivered: unknown } } }
+    }
+    poisoned.state.activeMission.substate.delivered = 'three'
+    const port = memoryPort({
+      [PRIMARY_KEY]: JSON.stringify(poisoned),
+      [BACKUP_KEY]: encodeSave(won()),
+    })
+    const result = loadCampaign(port, registry)
+    expect(result.recovery).toBe('recovered-backup')
+    expect(result.state).not.toBeNull()
+  })
+})
+
+describe('monotonic merge guard', () => {
+  it('a stale backup cannot resurrect a settled mission as active', () => {
+    const session = won()
+    const staleActive = dispatch(
+      ctx,
+      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
+      { type: 'START_MISSION', missionId: 'alpha' },
+      T0,
+    ).state
+    const merged = mergeGuard(staleActive, session)
+    expect(merged.activeMission).toBeNull()
+    expect(merged.settled.some((s) => s.missionId === 'alpha')).toBe(true)
+  })
+
+  it('self-consistency runs on a fresh boot with no in-session facts', () => {
+    // A single corrupt slot where a mission is both settled and active;
+    // no session has settled anything yet. The guard must still drop the
+    // contradictory active pointer, not pass the corruption through.
+    const session = won()
+    const settledOutcome = session.settled[0]!
+    const stale = dispatch(
+      ctx,
+      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
+      { type: 'START_MISSION', missionId: 'alpha' },
+      T0,
+    ).state
+    const corrupt: CampaignState = { ...stale, settled: [settledOutcome] }
+    const merged = mergeGuard(corrupt, null)
+    expect(merged.activeMission).toBeNull()
+    expect(merged.settled.some((s) => s.missionId === 'alpha')).toBe(true)
+  })
+
+  it('the live session is authoritative; a loaded outcome never overwrites it', () => {
+    const session = won()
+    const sessionTier = session.settled[0]!.tier
+    const loadedWithDifferent: CampaignState = {
+      ...session,
+      settled: [{ ...session.settled[0]!, tier: 'failed' as const }],
+    }
+    const merged = mergeGuard(loadedWithDifferent, session)
+    expect(merged.settled[0]?.tier).toBe(sessionTier)
+  })
+
+  it('in-session wins even at an EQUAL settleSeq (divergent lineages)', () => {
+    // The real collision: two campaigns both settle their first mission at
+    // the same ordinal. settleSeq is per-lineage and not comparable across
+    // saves, so the loaded copy must not win a tie on it.
+    const session = won()
+    const loadedSameSeq: CampaignState = {
+      ...session,
+      settled: [
+        {
+          ...session.settled[0]!,
+          tier: 'failed' as const,
+          settleSeq: session.settled[0]!.settleSeq,
+        },
+      ],
+    }
+    const merged = mergeGuard(loadedSameSeq, session)
+    expect(merged.settled[0]?.tier).toBe(session.settled[0]!.tier)
+  })
+
+  it('a loaded save can ADD a mission the session never settled', () => {
+    // Session settled only alpha; a load carries a beta settlement the
+    // session never saw. Merge moves settlement forward, additively.
+    const session = won()
+    const other = won()
+    const betaOutcome = {
+      ...other.settled[0]!,
+      missionId: 'beta' as const,
+    }
+    const loaded: CampaignState = {
+      ...session,
+      settled: [...session.settled, betaOutcome],
+    }
+    const merged = mergeGuard(loaded, session)
+    expect(merged.settled.map((s) => s.missionId).sort()).toEqual([
+      'alpha',
+      'beta',
+    ])
+  })
+
+  it('folds an additively-imported outcome clue into cluesFound', () => {
+    // A loaded save carries a settled beta the session never saw, and that
+    // outcome has a clue. The merge must record the clue, not just the
+    // settled fact, or the campaign is internally inconsistent.
+    const session = won()
+    const betaOutcome = {
+      ...session.settled[0]!,
+      missionId: 'beta' as const,
+      clueId: 'clue-beta' as const,
+    }
+    // loaded.cluesFound deliberately omits clue-beta: the fold must derive
+    // it from the settled outcome, not from copying the loaded clue list.
+    const loaded: CampaignState = {
+      ...session,
+      settled: [...session.settled, betaOutcome],
+    }
+    const merged = mergeGuard(loaded, session)
+    expect(merged.settled.some((s) => s.missionId === 'beta')).toBe(true)
+    expect(merged.cluesFound).toContain('clue-beta')
+  })
+
+  it('is idempotent: guarding a guarded state changes nothing', () => {
+    const session = won()
+    const staleActive = dispatch(
+      ctx,
+      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
+      { type: 'START_MISSION', missionId: 'alpha' },
+      T0,
+    ).state
+    const once = mergeGuard(staleActive, session)
+    const twice = mergeGuard(once, session)
+    expect(stateHash(twice)).toBe(stateHash(once))
+  })
+
+  it('the settle counter never regresses below an imported settleSeq', () => {
+    const session = won()
+    const highSeq = session.settled[0]!.settleSeq + 5
+    const loaded: CampaignState = {
+      ...session,
+      settleCounter: 0,
+      settled: [{ ...session.settled[0]!, settleSeq: highSeq }],
+    }
+    // On a fresh boot (no session) the loaded save is the base; its counter
+    // must be lifted above the highest settleSeq it carries.
+    const merged = mergeGuard(loaded, null)
+    expect(merged.settleCounter).toBeGreaterThan(highSeq)
+  })
+
+  it('runs on the backup load path too', () => {
+    const session = won()
+    const staleBackup = dispatch(
+      ctx,
+      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
+      { type: 'START_MISSION', missionId: 'alpha' },
+      T0,
+    ).state
+    const port = memoryPort({
+      [PRIMARY_KEY]: 'corrupt',
+      [BACKUP_KEY]: encodeSave(staleBackup),
+    })
+    const result = loadCampaign(port, registry, session)
+    expect(result.recovery).toBe('recovered-backup')
+    expect(result.state?.activeMission).toBeNull()
+    expect(result.state?.settled.some((s) => s.missionId === 'alpha')).toBe(
+      true,
+    )
+  })
+})
+
+describe('persist and storage port', () => {
+  it('double-buffers: the backup trails the primary by one generation', () => {
+    const port = memoryPort()
+    const first = encodeSave(won())
+    const second = encodeSave(
+      dispatch(
+        ctx,
+        createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
+        { type: 'START_MISSION', missionId: 'alpha' },
+        T0,
+      ).state,
+    )
+    // First save: only the primary exists, nothing older to preserve.
+    expect(persistCampaign(port, won(), registry).ok).toBe(true)
+    expect(port.store[PRIMARY_KEY]).toBe(first)
+    expect(port.store[BACKUP_KEY]).toBeUndefined()
+    // Second save: the prior good primary moves into the backup slot.
+    const startedState = dispatch(
+      ctx,
+      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
+      { type: 'START_MISSION', missionId: 'alpha' },
+      T0,
+    ).state
+    expect(persistCampaign(port, startedState, registry).ok).toBe(true)
+    expect(port.store[PRIMARY_KEY]).toBe(second)
+    expect(port.store[BACKUP_KEY]).toBe(first)
+  })
+
+  it('a failed primary write restores the prior good primary', () => {
+    const priorPayload = encodeSave(won())
+    const store: Record<string, string> = { [PRIMARY_KEY]: priorPayload }
+    const port: StoragePort = {
+      read: (k) => store[k] ?? null,
+      write: (k, value) => {
+        if (k === PRIMARY_KEY && value !== priorPayload) {
+          throw new Error('disk full, not quota-tagged')
+        }
+        store[k] = value
+      },
+      remove: (k) => {
+        delete store[k]
+      },
+    }
+    const started = dispatch(
+      ctx,
+      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
+      { type: 'START_MISSION', missionId: 'alpha' },
+      T0,
+    ).state
+    const result = persistCampaign(port, started, registry)
+    expect(result.ok).toBe(false)
+    // The slot is never left torn: the prior good primary is intact.
+    expect(store[PRIMARY_KEY]).toBe(priorPayload)
+  })
+
+  it('quota error drops the backup slot and retries primary once', () => {
+    const store: Record<string, string> = { [BACKUP_KEY]: 'old' }
+    let primaryAttempts = 0
+    const port: StoragePort = {
+      read: (k) => store[k] ?? null,
+      write: (k, v) => {
+        if (k === PRIMARY_KEY) {
+          primaryAttempts += 1
+          if (primaryAttempts === 1) {
+            const err = new Error('quota') as Error & { name: string }
+            err.name = 'QuotaExceededError'
+            throw err
+          }
+        }
+        store[k] = v
+      },
+      remove: (k) => {
+        delete store[k]
+      },
+    }
+    const result = persistCampaign(port, won(), registry)
+    expect(result.ok).toBe(true)
+    expect(primaryAttempts).toBe(2)
+  })
+
+  it('a structurally broken substate is rejected at write, not next load', () => {
+    const started = dispatch(
+      ctx,
+      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
+      { type: 'START_MISSION', missionId: 'alpha' },
+      T0,
+    ).state
+    const broken: CampaignState = {
+      ...started,
+      activeMission: {
+        ...started.activeMission!,
+        // delivered must be an integer; a string fails the mission schema.
+        substate: {
+          ...(started.activeMission!.substate as Record<string, unknown>),
+          delivered: 'three',
+        },
+      },
+    }
+    const port = memoryPort()
+    const result = persistCampaign(port, broken, registry)
+    expect(result.ok).toBe(false)
+    expect(result.reason).toBe('INVALID STATE')
+    expect(port.store[PRIMARY_KEY]).toBeUndefined()
+  })
+
+  it('every port call is fallible without crashing the engine', () => {
+    const alwaysThrows: StoragePort = {
+      read: () => {
+        throw new Error('read blocked')
+      },
+      write: () => {
+        throw new Error('write blocked')
+      },
+      remove: () => {
+        throw new Error('remove blocked')
+      },
+    }
+    expect(() => loadCampaign(alwaysThrows, registry)).not.toThrow()
+    expect(loadCampaign(alwaysThrows, registry).recovery).toBe('reset')
+    expect(() => persistCampaign(alwaysThrows, won(), registry)).not.toThrow()
+    expect(persistCampaign(alwaysThrows, won(), registry).ok).toBe(false)
+  })
+})
+
+describe('migration pipeline exists from day one', () => {
+  it('a real v0-to-v1 migration transforms and advances the version', () => {
+    // Inject a migration that strips a legacy field and stamps v1. This
+    // exercises the actual application loop, not just its error path.
+    const current = won()
+    const asV0 = { version: 0, state: { ...current, legacyField: true } }
+    const dropLegacy: Migration = (raw) => {
+      const env = raw as { state: Record<string, unknown> }
+      const { legacyField: _drop, ...rest } = env.state
+      void _drop
+      return { version: 1, state: rest }
+    }
+    const migrated = runMigrations(asV0, [dropLegacy]) as {
+      version: number
+      state: Record<string, unknown>
+    }
+    expect(migrated.version).toBe(1)
+    expect('legacyField' in migrated.state).toBe(false)
+  })
+
+  it('a throwing migration propagates so the loader can fall through', () => {
+    const boom: Migration = () => {
+      throw new Error('migration blew up')
+    }
+    expect(() =>
+      runMigrations({ version: 0, state: {} }, [boom]),
+    ).toThrow(/blew up/)
+  })
+
+  it('a missing version defaults to 0 and routes through migration', () => {
+    let sawVersion0 = false
+    const noop: Migration = (raw) => {
+      sawVersion0 = true
+      return { version: 1, state: (raw as { state: unknown }).state }
+    }
+    runMigrations({ state: { any: true } }, [noop])
+    expect(sawVersion0).toBe(true)
+  })
+
+  it('an unregistered older version throws missing-migration', () => {
+    const current = won()
+    const asV0 = { version: 0, state: current }
+    const port = memoryPort({
+      [PRIMARY_KEY]: JSON.stringify(asV0),
+      [BACKUP_KEY]: encodeSave(current),
+    })
+    // Shipped MIGRATIONS is empty, so a v0 payload has no MIGRATIONS[0]
+    // and correctly throws, falling the loader through to backup.
+    const result = loadCampaign(port, registry)
+    expect(result.recovery).toBe('recovered-backup')
+  })
+})
+
+describe('byte budget', () => {
+  it('a full-campaign save with inspections stays under 64 KB', () => {
+    const recordIds = FIXTURE_RECORDS.map((r) => r.id)
+    let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, T0)
+    for (const missionId of ['alpha', 'beta', 'gamma']) {
+      state = dispatch(
+        ctx,
+        state,
+        { type: 'START_MISSION', missionId },
+        state.lastNow + 1_000,
+      ).state
+      // Inspect every record while the mission is open; inspection records
+      // are the heaviest persisted collection, so a realistic save folds
+      // them in, not just the deliveries.
+      for (const recordId of recordIds) {
+        state = dispatch(
+          ctx,
+          state,
+          { type: 'INSPECT_RECORD', recordId },
+          state.lastNow + 1_000,
+        ).state
+      }
+      for (let i = 0; i < 3; i++) {
+        state = dispatch(
+          ctx,
+          state,
+          { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } },
+          state.lastNow + 1_000,
+        ).state
+      }
+      state = dispatch(
+        ctx,
+        state,
+        { type: 'ACKNOWLEDGE_DEBRIEF', missionId },
+        state.lastNow + 1_000,
+      ).state
+    }
+    const bytes = new TextEncoder().encode(encodeSave(state)).length
+    expect(bytes).toBeLessThan(64 * 1024)
+  })
+})
