diff --git a/eslint.config.js b/eslint.config.js
index ed9f721..57a0f10 100644
--- a/eslint.config.js
+++ b/eslint.config.js
@@ -15,6 +15,14 @@ export default tseslint.config(
     ignores: ['dist/', 'node_modules/', 'planning/', 'coverage/'],
   },
   ...tseslint.configs.recommended,
+  {
+    rules: {
+      '@typescript-eslint/no-unused-vars': [
+        'error',
+        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
+      ],
+    },
+  },
   {
     files: ['src/engine/**/*.ts'],
     rules: {
diff --git a/src/engine/campaign/engine.ts b/src/engine/campaign/engine.ts
new file mode 100644
index 0000000..d3e5d1a
--- /dev/null
+++ b/src/engine/campaign/engine.ts
@@ -0,0 +1,501 @@
+// The dispatch choke point: every player mutation flows through here,
+// time passes only via the embedded advance, and the emitted list is
+// the structural exactly-once side channel. Replay folds over the
+// (action, now) envelope log reproduce state exactly; emitted exists so
+// the shell never diffs state.
+import { advanceToNow, materializeSchedule } from '../time'
+import type { ProcessedEvent, TimeSlice } from '../time'
+import { rngFromSeed } from '../rng'
+import type {
+  FoldedConsequences,
+  MissionRegistry,
+  SeedDefinition,
+} from '../missions/types'
+import type { CampaignState } from './state'
+import type {
+  CampaignAction,
+  CampaignPhase,
+  Consequence,
+  DispatchResult,
+  EngineEvent,
+  MissionId,
+  SettledOutcome,
+  SettlementCause,
+} from './types'
+
+export interface EngineContext {
+  readonly seeds: Readonly<Record<string, SeedDefinition>>
+  readonly missions: MissionRegistry
+  /** The three playable missions, in menu order. */
+  readonly missionOrder: readonly MissionId[]
+}
+
+/** Per-kind aggregate caps (integer units), applied once to the sum,
+ *  never pairwise, so folding is order-independent. */
+export const CONSEQUENCE_CAPS: Readonly<Record<string, number>> = {
+  commsDelayed: 40,
+  flightsDisrupted: 40,
+  paymentsDelayed: 40,
+}
+
+export function createCampaign(
+  ctx: EngineContext,
+  seedName: string,
+  preferences: { extendedTime: boolean },
+): CampaignState {
+  const seed = ctx.seeds[seedName]
+  if (!seed) throw new Error(`campaign: unknown seed ${seedName}`)
+  return {
+    seedName,
+    rng: { words: [...rngFromSeed(seed.seedNumber).words] },
+    lastNow: 0,
+    phase: 'menu',
+    activeMission: null,
+    missionQueue: [],
+    campaignQueue: [],
+    settled: [],
+    acknowledgedDebriefs: [],
+    startedMissionIds: [],
+    cluesFound: [],
+    sourceChecks: [],
+    inspectedRecords: [],
+    appliedConsequences: [],
+    preferences: { extendedTime: preferences.extendedTime },
+  }
+}
+
+function slice(state: CampaignState): TimeSlice {
+  return {
+    lastNow: state.lastNow,
+    missionQueue: state.missionQueue,
+    campaignQueue: state.campaignQueue,
+    endsAt: state.activeMission?.endsAt ?? null,
+    missionSettled:
+      state.activeMission === null ||
+      state.settled.some((s) => s.missionId === state.activeMission?.missionId),
+  }
+}
+
+function mergeClues(
+  state: CampaignState,
+  ids: readonly string[],
+  emitted: EngineEvent[],
+): CampaignState {
+  const fresh = ids.filter((id) => !state.cluesFound.includes(id))
+  if (fresh.length === 0) return state
+  for (const clueId of fresh) emitted.push({ type: 'clueFound', clueId })
+  return { ...state, cluesFound: [...state.cluesFound, ...fresh].sort() }
+}
+
+function changePhase(
+  state: CampaignState,
+  to: CampaignPhase,
+  emitted: EngineEvent[],
+): CampaignState {
+  if (state.phase === to) return state
+  emitted.push({ type: 'phaseChanged', from: state.phase, to })
+  return { ...state, phase: to }
+}
+
+function settle(
+  ctx: EngineContext,
+  state: CampaignState,
+  cause: SettlementCause,
+  emitted: EngineEvent[],
+): CampaignState {
+  const runtime = state.activeMission
+  if (!runtime) return state
+  if (state.settled.some((s) => s.missionId === runtime.missionId)) {
+    return state
+  }
+  const module = ctx.missions[runtime.missionId]
+  if (!module) throw new Error(`campaign: unknown mission ${runtime.missionId}`)
+  const outcome: SettledOutcome = module.evaluate(runtime.substate, cause)
+  emitted.push({
+    type: 'settlement',
+    missionId: runtime.missionId,
+    cause,
+    tier: outcome.tier,
+  })
+  let next: CampaignState = {
+    ...state,
+    settled: [...state.settled, outcome].sort((a, b) =>
+      a.missionId < b.missionId ? -1 : 1,
+    ),
+    activeMission: null,
+    missionQueue: [],
+  }
+  if (outcome.clueId) next = mergeClues(next, [outcome.clueId], emitted)
+  next = changePhase(next, 'debrief', emitted)
+  return next
+}
+
+function pollMission(
+  ctx: EngineContext,
+  state: CampaignState,
+  emitted: EngineEvent[],
+): CampaignState {
+  const runtime = state.activeMission
+  if (!runtime) return state
+  const module = ctx.missions[runtime.missionId]
+  if (!module) throw new Error(`campaign: unknown mission ${runtime.missionId}`)
+  let next = state
+  if (module.clues) {
+    next = mergeClues(next, module.clues(runtime.substate), emitted)
+  }
+  const terminal = module.terminal?.(runtime.substate) ?? null
+  if (terminal !== null) {
+    next = settle(ctx, next, terminal, emitted)
+  }
+  return next
+}
+
+function resolveDeskReply(
+  state: CampaignState,
+  event: ProcessedEvent,
+  emitted: EngineEvent[],
+): CampaignState {
+  const payload = event.payload as {
+    recordId: string
+    outcome: 'CONFIRMED' | 'CONTRADICTED' | 'PENDING' | 'UNKNOWN'
+    requestedDuringMission: string | null
+  }
+  const arrivedAfterSettlement =
+    payload.requestedDuringMission !== null &&
+    state.settled.some((s) => s.missionId === payload.requestedDuringMission)
+  emitted.push({
+    type: 'sourceCheckResolved',
+    recordId: payload.recordId,
+    outcome: payload.outcome,
+    arrivedAfterSettlement,
+  })
+  return {
+    ...state,
+    sourceChecks: [
+      ...state.sourceChecks,
+      {
+        recordId: payload.recordId,
+        outcome: payload.outcome,
+        resolvedAt: event.scheduledAt,
+        arrivedAfterSettlement,
+      },
+    ],
+  }
+}
+
+function applyProcessedEvent(
+  ctx: EngineContext,
+  state: CampaignState,
+  event: ProcessedEvent,
+  emitted: EngineEvent[],
+): CampaignState {
+  if (event.queue === 'campaign') {
+    if (event.kind === 'deskReply') {
+      return resolveDeskReply(state, event, emitted)
+    }
+    emitted.push({
+      type: 'scheduledEventFired',
+      id: event.id,
+      kind: event.kind,
+      queue: 'campaign',
+    })
+    return state
+  }
+  if (event.kind === 'timerMilestone') {
+    emitted.push({ type: 'timerMilestone', id: event.id })
+  } else if (event.kind === 'finaleFinalPhase') {
+    emitted.push({ type: 'finaleFinalPhase' })
+  } else {
+    emitted.push({
+      type: 'scheduledEventFired',
+      id: event.id,
+      kind: event.kind,
+      queue: 'mission',
+    })
+  }
+  const runtime = state.activeMission
+  if (!runtime) return state
+  const module = ctx.missions[runtime.missionId]
+  if (!module) throw new Error(`campaign: unknown mission ${runtime.missionId}`)
+  const substate = module.reduce(runtime.substate, {
+    type: 'scheduled',
+    id: event.id,
+    kind: event.kind,
+    payload: event.payload,
+    now: event.scheduledAt,
+  })
+  let next: CampaignState = {
+    ...state,
+    activeMission: { ...runtime, substate },
+  }
+  next = pollMission(ctx, next, emitted)
+  return next
+}
+
+function advance(
+  ctx: EngineContext,
+  state: CampaignState,
+  rawNow: number,
+  emitted: EngineEvent[],
+): CampaignState {
+  const result = advanceToNow(slice(state), rawNow)
+  if (
+    result.slice.lastNow === state.lastNow &&
+    result.processed.length === 0 &&
+    !result.timedOut
+  ) {
+    // Provable no-op: same reference, so a repeat rejection cannot even
+    // churn object identity.
+    return state
+  }
+  let next: CampaignState = {
+    ...state,
+    lastNow: result.slice.lastNow,
+    missionQueue: [...result.slice.missionQueue],
+    campaignQueue: [...result.slice.campaignQueue],
+  }
+  for (const event of result.processed) {
+    next = applyProcessedEvent(ctx, next, event, emitted)
+  }
+  if (result.timedOut) {
+    next = settle(ctx, next, 'timeout', emitted)
+  }
+  return next
+}
+
+/** Wake entry: time passes, nothing else. */
+export function advanceCampaign(
+  ctx: EngineContext,
+  state: CampaignState,
+  now: number,
+): DispatchResult<CampaignState> {
+  const emitted: EngineEvent[] = []
+  const next = advance(ctx, state, now, emitted)
+  return { state: next, emitted, rejection: null }
+}
+
+function foldConsequences(
+  state: CampaignState,
+  target: MissionId,
+  emitted: EngineEvent[],
+): { folded: FoldedConsequences; markers: CampaignState['appliedConsequences'] } {
+  const pending: Consequence[] = state.settled
+    .flatMap((outcome) => outcome.consequences)
+    .filter(
+      (consequence) =>
+        !state.appliedConsequences.some(
+          (marker) =>
+            marker.consequenceId === consequence.id &&
+            marker.targetMissionId === target,
+        ),
+    )
+    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
+  const sums: Record<string, number> = {}
+  for (const consequence of pending) {
+    sums[consequence.kind] = (sums[consequence.kind] ?? 0) + consequence.magnitude
+  }
+  const byKind: Record<string, number> = {}
+  for (const [kind, sum] of Object.entries(sums)) {
+    byKind[kind] = Math.min(sum, CONSEQUENCE_CAPS[kind] ?? sum)
+  }
+  const markers = [...state.appliedConsequences]
+  for (const consequence of pending) {
+    markers.push({ consequenceId: consequence.id, targetMissionId: target })
+    emitted.push({
+      type: 'consequenceApplied',
+      consequenceId: consequence.id,
+      targetMissionId: target,
+    })
+  }
+  markers.sort((a, b) =>
+    a.consequenceId !== b.consequenceId
+      ? a.consequenceId < b.consequenceId
+        ? -1
+        : 1
+      : a.targetMissionId < b.targetMissionId
+        ? -1
+        : 1,
+  )
+  return { folded: { byKind }, markers }
+}
+
+function reduceAction(
+  ctx: EngineContext,
+  state: CampaignState,
+  action: CampaignAction,
+  now: number,
+  emitted: EngineEvent[],
+): CampaignState | { reason: string } {
+  const seed = ctx.seeds[state.seedName]
+  if (!seed) throw new Error(`campaign: unknown seed ${state.seedName}`)
+
+  switch (action.type) {
+    case 'START_MISSION': {
+      if (state.phase !== 'menu') return { reason: 'NOT IN MENU' }
+      const module = ctx.missions[action.missionId]
+      if (!module) return { reason: 'UNKNOWN MISSION' }
+      if (state.settled.some((s) => s.missionId === action.missionId)) {
+        return { reason: 'MISSION SETTLED' }
+      }
+      const durationMs = seed.missionDurationsMs[action.missionId]
+      if (durationMs === undefined) return { reason: 'NO DURATION AUTHORED' }
+      const { folded, markers } = foldConsequences(
+        state,
+        action.missionId,
+        emitted,
+      )
+      const duration = state.preferences.extendedTime ? 'extended' : 'standard'
+      const { queue, endsAt } = materializeSchedule(
+        seed.schedules[action.missionId] ?? [],
+        now,
+        duration,
+        durationMs,
+      )
+      const substate = module.init(seed, folded, endsAt - now)
+      emitted.push({ type: 'missionStarted', missionId: action.missionId })
+      let next: CampaignState = {
+        ...state,
+        appliedConsequences: markers,
+        startedMissionIds: state.startedMissionIds.includes(action.missionId)
+          ? state.startedMissionIds
+          : [...state.startedMissionIds, action.missionId].sort(),
+        activeMission: { missionId: action.missionId, endsAt, substate },
+        missionQueue: queue,
+      }
+      next = changePhase(next, 'mission', emitted)
+      next = pollMission(ctx, next, emitted)
+      return next
+    }
+    case 'FORFEIT_MISSION': {
+      if (state.phase !== 'mission' || !state.activeMission) {
+        return { reason: 'NO ACTIVE MISSION' }
+      }
+      return settle(ctx, state, 'forfeit', emitted)
+    }
+    case 'ACKNOWLEDGE_DEBRIEF': {
+      if (!state.settled.some((s) => s.missionId === action.missionId)) {
+        return { reason: 'NOT SETTLED' }
+      }
+      if (state.acknowledgedDebriefs.includes(action.missionId)) {
+        return { reason: 'ALREADY ACKNOWLEDGED' }
+      }
+      emitted.push({ type: 'debriefAcknowledged', missionId: action.missionId })
+      let next: CampaignState = {
+        ...state,
+        acknowledgedDebriefs: [
+          ...state.acknowledgedDebriefs,
+          action.missionId,
+        ].sort(),
+      }
+      if (next.phase === 'debrief') next = changePhase(next, 'menu', emitted)
+      return next
+    }
+    case 'INSPECT_RECORD': {
+      let next: CampaignState = state.inspectedRecords.includes(action.recordId)
+        ? state
+        : {
+            ...state,
+            inspectedRecords: [
+              ...state.inspectedRecords,
+              action.recordId,
+            ].sort(),
+          }
+      const clueEntry = seed.clueRecords.find(
+        (entry) => entry.recordId === action.recordId,
+      )
+      if (clueEntry) next = mergeClues(next, [clueEntry.clueId], emitted)
+      return next
+    }
+    case 'REQUEST_SOURCE_CHECK': {
+      const entry = seed.deskChecks.find(
+        (check) => check.recordId === action.recordId,
+      )
+      if (!entry) return { reason: 'NO DESK FOR RECORD' }
+      const replyId = `desk-${action.recordId}-${state.campaignQueue.length + state.sourceChecks.length}`
+      if (state.campaignQueue.some((e) => e.id === replyId)) {
+        return { reason: 'CHECK PENDING' }
+      }
+      return {
+        ...state,
+        campaignQueue: [
+          ...state.campaignQueue,
+          {
+            id: replyId,
+            scheduledAt: now + entry.delaySeconds * 1000,
+            kind: 'deskReply',
+            payload: {
+              recordId: action.recordId,
+              outcome: entry.outcome,
+              requestedDuringMission: state.activeMission?.missionId ?? null,
+            },
+          },
+        ],
+      }
+    }
+    case 'SET_PREFERENCE': {
+      if (
+        action.preference === 'extendedTime' &&
+        state.startedMissionIds.length > 0
+      ) {
+        return { reason: 'CAMPAIGN HAS BEGUN' }
+      }
+      return {
+        ...state,
+        preferences: { ...state.preferences, extendedTime: action.value },
+      }
+    }
+    case 'NEW_CAMPAIGN': {
+      if (!ctx.seeds[action.seedName]) return { reason: 'UNKNOWN SEED' }
+      emitted.push({ type: 'campaignReset', seedName: action.seedName })
+      return {
+        ...createCampaign(ctx, action.seedName, state.preferences),
+        lastNow: now,
+      }
+    }
+    case 'MISSION_ACTION': {
+      const runtime = state.activeMission
+      if (state.phase !== 'mission' || !runtime) {
+        return { reason: 'NO ACTIVE MISSION' }
+      }
+      const module = ctx.missions[runtime.missionId]
+      if (!module) throw new Error(`campaign: unknown mission ${runtime.missionId}`)
+      const validity = module.validate(runtime.substate, action.payload)
+      if (!validity.valid) return { reason: validity.reason }
+      const substate = module.reduce(runtime.substate, {
+        type: 'action',
+        id: `action-${now}`,
+        kind: 'action',
+        payload: action.payload,
+        now,
+      })
+      let next: CampaignState = {
+        ...state,
+        activeMission: { ...runtime, substate },
+      }
+      next = pollMission(ctx, next, emitted)
+      return next
+    }
+  }
+}
+
+/** The envelope choke point: clamp and drain first, then validate and
+ *  reduce. Rejected actions return the input state untouched (same
+ *  reference) beside the drain result. */
+export function dispatch(
+  ctx: EngineContext,
+  state: CampaignState,
+  action: CampaignAction,
+  now: number,
+): DispatchResult<CampaignState> {
+  const emitted: EngineEvent[] = []
+  const advanced = advance(ctx, state, now, emitted)
+  const reduced = reduceAction(ctx, advanced, action, advanced.lastNow, emitted)
+  if (reduced && 'reason' in reduced && !('seedName' in reduced)) {
+    return {
+      state: advanced,
+      emitted,
+      rejection: { rejected: true, reason: reduced.reason },
+    }
+  }
+  return { state: reduced as CampaignState, emitted, rejection: null }
+}
diff --git a/src/engine/campaign/selectors.ts b/src/engine/campaign/selectors.ts
new file mode 100644
index 0000000..388943b
--- /dev/null
+++ b/src/engine/campaign/selectors.ts
@@ -0,0 +1,68 @@
+// Pure selectors over one state: WOPR's tally and the real service
+// outcomes diverge by construction because they read the same facts
+// with different values. The divergence is the game's thesis.
+import { corroborationValue } from '../records'
+import type { CampaignState } from './state'
+import type { MissionId } from './types'
+
+/** WOPR counts forced inactivity as resolution: settled missions and
+ *  the standing exceptions they closed. Mission modules express their
+ *  forced-inactivity facts through the wopr_resolved metric. */
+export function selectOpenExceptions(state: CampaignState): number {
+  let open = 0
+  for (const outcome of state.settled) {
+    open -= outcome.metrics['wopr_resolved'] ?? 0
+  }
+  return open
+}
+
+/** Real service outcomes: integer damage the same orders produced.
+ *  Mission modules express them through the service_cost metric. */
+export function selectServiceOutcomes(state: CampaignState): number {
+  let cost = 0
+  for (const outcome of state.settled) {
+    cost += outcome.metrics['service_cost'] ?? 0
+  }
+  return cost
+}
+
+export interface MenuRow {
+  readonly missionId: MissionId
+  readonly settled: boolean
+  readonly acknowledged: boolean
+}
+
+export function selectMenuRows(
+  state: CampaignState,
+  missionOrder: readonly MissionId[],
+  finaleId: MissionId,
+): { rows: MenuRow[]; finaleUnlocked: boolean } {
+  const rows = missionOrder.map((missionId) => ({
+    missionId,
+    settled: state.settled.some((s) => s.missionId === missionId),
+    acknowledged: state.acknowledgedDebriefs.includes(missionId),
+  }))
+  const finaleUnlocked = missionOrder.every((missionId) =>
+    state.acknowledgedDebriefs.includes(missionId),
+  )
+  return {
+    rows: finaleUnlocked
+      ? [...rows, { missionId: finaleId, settled: false, acknowledged: false }]
+      : rows,
+    finaleUnlocked,
+  }
+}
+
+/** Corroboration earned for a record from completed source checks. */
+export function selectCorroboration(
+  state: CampaignState,
+  recordId: string,
+): number {
+  return state.sourceChecks
+    .filter((check) => check.recordId === recordId)
+    .reduce((sum, check) => sum + corroborationValue(check.outcome), 0)
+}
+
+export function selectCampaignBegun(state: CampaignState): boolean {
+  return state.startedMissionIds.length > 0
+}
diff --git a/src/engine/campaign/state.ts b/src/engine/campaign/state.ts
new file mode 100644
index 0000000..5c60566
--- /dev/null
+++ b/src/engine/campaign/state.ts
@@ -0,0 +1,76 @@
+// The valibot schema is the source of truth for CampaignState; the TS
+// type derives via InferOutput so schema and type cannot drift. Mission
+// substate is an open JSON-safe slot here; the save layer composes the
+// per-mission saveSchema at load (section 08).
+import * as v from 'valibot'
+
+const integer = v.pipe(v.number(), v.integer())
+
+const scheduledEventSchema = v.object({
+  id: v.string(),
+  scheduledAt: integer,
+  kind: v.string(),
+  payload: v.unknown(),
+})
+
+const rngStateSchema = v.object({
+  words: v.array(v.pipe(v.number(), v.finite())),
+})
+
+const consequenceSchema = v.object({
+  id: v.string(),
+  kind: v.picklist(['commsDelayed', 'flightsDisrupted', 'paymentsDelayed']),
+  magnitude: integer,
+})
+
+const settledOutcomeSchema = v.object({
+  missionId: v.string(),
+  cause: v.picklist(['completed', 'collapsed', 'timeout', 'forfeit']),
+  tier: v.picklist(['full', 'partial', 'poor', 'failed']),
+  metrics: v.record(v.string(), integer),
+  clueId: v.nullable(v.string()),
+  consequences: v.array(consequenceSchema),
+  endingId: v.optional(v.picklist(['recovery', 'containment', 'failure'])),
+})
+
+const appliedMarkerSchema = v.object({
+  consequenceId: v.string(),
+  targetMissionId: v.string(),
+})
+
+const sourceCheckResultSchema = v.object({
+  recordId: v.string(),
+  outcome: v.picklist(['CONFIRMED', 'CONTRADICTED', 'PENDING', 'UNKNOWN']),
+  resolvedAt: integer,
+  arrivedAfterSettlement: v.boolean(),
+})
+
+const missionRuntimeSchema = v.object({
+  missionId: v.string(),
+  endsAt: integer,
+  /** Mission substate: opaque JSON-safe value validated per mission by
+   *  the composed saveSchema at load. */
+  substate: v.unknown(),
+})
+
+export const campaignStateSchema = v.object({
+  seedName: v.string(),
+  rng: rngStateSchema,
+  lastNow: integer,
+  phase: v.picklist(['menu', 'mission', 'debrief', 'finale', 'ended']),
+  activeMission: v.nullable(missionRuntimeSchema),
+  missionQueue: v.array(scheduledEventSchema),
+  campaignQueue: v.array(scheduledEventSchema),
+  settled: v.array(settledOutcomeSchema),
+  acknowledgedDebriefs: v.array(v.string()),
+  startedMissionIds: v.array(v.string()),
+  cluesFound: v.array(v.string()),
+  sourceChecks: v.array(sourceCheckResultSchema),
+  inspectedRecords: v.array(v.string()),
+  appliedConsequences: v.array(appliedMarkerSchema),
+  preferences: v.object({ extendedTime: v.boolean() }),
+})
+
+export type CampaignState = v.InferOutput<typeof campaignStateSchema>
+
+export type MissionRuntime = v.InferOutput<typeof missionRuntimeSchema>
diff --git a/src/engine/campaign/types.ts b/src/engine/campaign/types.ts
new file mode 100644
index 0000000..77ac3f9
--- /dev/null
+++ b/src/engine/campaign/types.ts
@@ -0,0 +1,123 @@
+// Campaign vocabulary: actions players dispatch, events the engine
+// emits, and the settled facts both scoreboards derive from. The
+// valibot schema in state.ts is the source of truth for persisted
+// shapes; these are the hand-authored unions it composes.
+import type { SourceCheckOutcome } from '../records'
+
+export type MissionId = string
+
+export type SettlementCause = 'completed' | 'collapsed' | 'timeout' | 'forfeit'
+
+export type OutcomeTier = 'full' | 'partial' | 'poor' | 'failed'
+
+export type ConsequenceKind =
+  | 'commsDelayed'
+  | 'flightsDisrupted'
+  | 'paymentsDelayed'
+
+export interface Consequence {
+  readonly id: string
+  readonly kind: ConsequenceKind
+  /** Integer magnitude in the kind's smallest unit. */
+  readonly magnitude: number
+}
+
+export interface SettledOutcome {
+  readonly missionId: MissionId
+  readonly cause: SettlementCause
+  readonly tier: OutcomeTier
+  /** Integer service metrics, mission-defined keys. */
+  readonly metrics: Record<string, number>
+  readonly clueId: string | null
+  readonly consequences: Consequence[]
+  /** Finale only (amendment 11). */
+  readonly endingId?: 'recovery' | 'containment' | 'failure'
+}
+
+export interface AppliedMarker {
+  readonly consequenceId: string
+  readonly targetMissionId: MissionId
+}
+
+export interface SourceCheckResult {
+  readonly recordId: string
+  readonly outcome: SourceCheckOutcome
+  readonly resolvedAt: number
+  readonly arrivedAfterSettlement: boolean
+}
+
+export interface CampaignPreferences {
+  readonly extendedTime: boolean
+}
+
+// Player-driven actions: commands and buttons both produce these; the
+// envelope log of (action, now) pairs is the canonical campaign record.
+export type CampaignAction =
+  | { readonly type: 'START_MISSION'; readonly missionId: MissionId }
+  | { readonly type: 'FORFEIT_MISSION' }
+  | { readonly type: 'ACKNOWLEDGE_DEBRIEF'; readonly missionId: MissionId }
+  | { readonly type: 'INSPECT_RECORD'; readonly recordId: string }
+  | { readonly type: 'REQUEST_SOURCE_CHECK'; readonly recordId: string }
+  | {
+      readonly type: 'SET_PREFERENCE'
+      readonly preference: 'extendedTime'
+      readonly value: boolean
+    }
+  | { readonly type: 'NEW_CAMPAIGN'; readonly seedName: string }
+  | {
+      readonly type: 'MISSION_ACTION'
+      readonly payload: unknown
+    }
+
+// The emitted side channel (amendment 1): entries correspond one to one
+// with queue deletions and settlement transitions, so exactly-once
+// consumption downstream is structural. Replay folds use state only.
+export type EngineEvent =
+  | { readonly type: 'missionStarted'; readonly missionId: MissionId }
+  | {
+      readonly type: 'scheduledEventFired'
+      readonly id: string
+      readonly kind: string
+      readonly queue: 'mission' | 'campaign'
+    }
+  | { readonly type: 'timerMilestone'; readonly id: string }
+  | {
+      readonly type: 'settlement'
+      readonly missionId: MissionId
+      readonly cause: SettlementCause
+      readonly tier: OutcomeTier
+    }
+  | {
+      readonly type: 'phaseChanged'
+      readonly from: CampaignPhase
+      readonly to: CampaignPhase
+    }
+  | {
+      readonly type: 'consequenceApplied'
+      readonly consequenceId: string
+      readonly targetMissionId: MissionId
+    }
+  | {
+      readonly type: 'sourceCheckResolved'
+      readonly recordId: string
+      readonly outcome: SourceCheckOutcome
+      readonly arrivedAfterSettlement: boolean
+    }
+  | { readonly type: 'debriefAcknowledged'; readonly missionId: MissionId }
+  | { readonly type: 'clueFound'; readonly clueId: string }
+  | { readonly type: 'finaleFinalPhase' }
+  | { readonly type: 'branchRunCompleted'; readonly branch: string }
+  | { readonly type: 'campaignReset'; readonly seedName: string }
+
+export type CampaignPhase = 'menu' | 'mission' | 'debrief' | 'finale' | 'ended'
+
+export interface RejectionResult {
+  readonly rejected: true
+  readonly reason: string
+}
+
+export interface DispatchResult<State> {
+  readonly state: State
+  readonly emitted: readonly EngineEvent[]
+  readonly rejection: RejectionResult | null
+}
diff --git a/src/engine/missions/types.ts b/src/engine/missions/types.ts
new file mode 100644
index 0000000..2796069
--- /dev/null
+++ b/src/engine/missions/types.ts
@@ -0,0 +1,82 @@
+// The mission-module seam. Section 05 needs the shape to route
+// dispatch; section 06 builds the lifecycle depth and the permanent
+// test double on top of exactly this interface. Section 07 tightens
+// SeedDefinition's payload typing per mission.
+import type { GenericSchema } from 'valibot'
+import type { EvidenceRecord, SourceCheckOutcome } from '../records'
+import type { ScheduledEventSpec } from '../time'
+import type {
+  Consequence,
+  MissionId,
+  SettledOutcome,
+  SettlementCause,
+} from '../campaign/types'
+
+export interface DeskCheckEntry {
+  readonly recordId: string
+  readonly outcome: SourceCheckOutcome
+  readonly delaySeconds: number
+  readonly replyBody: readonly string[]
+}
+
+export interface ClueRecordEntry {
+  readonly recordId: string
+  readonly clueId: string
+}
+
+export interface SeedDefinition {
+  readonly name: string
+  readonly description: string
+  readonly seedNumber: number
+  readonly exerciseRunId: string
+  readonly records: readonly EvidenceRecord[]
+  readonly deskChecks: readonly DeskCheckEntry[]
+  readonly clueRecords: readonly ClueRecordEntry[]
+  /** Opaque per-mission payloads; mission splits narrow their own. */
+  readonly missionPayloads: Readonly<Record<MissionId, unknown>>
+  readonly schedules: Readonly<Record<MissionId, readonly ScheduledEventSpec[]>>
+  readonly missionDurationsMs: Readonly<Record<MissionId, number>>
+}
+
+export interface FoldedConsequences {
+  /** Aggregate magnitude per kind after canonical folding and the
+   *  per-kind cap, integers. */
+  readonly byKind: Readonly<Record<string, number>>
+}
+
+export interface MissionEvent {
+  readonly type: 'action' | 'scheduled'
+  readonly id: string
+  readonly kind: string
+  readonly payload: unknown
+  readonly now: number
+}
+
+export type Validity =
+  | { readonly valid: true }
+  | { readonly valid: false; readonly reason: string }
+
+export interface MissionModule<S = unknown> {
+  readonly id: MissionId
+  init(
+    seed: SeedDefinition,
+    consequences: FoldedConsequences,
+    durationMs: number,
+  ): S
+  validate(state: S, payload: unknown): Validity
+  reduce(state: S, event: MissionEvent): S
+  evaluate(state: S, cause: SettlementCause): SettledOutcome
+  /** Amendment 7: polled after every reduce and drain; non-null
+   *  settles immediately with that cause. */
+  terminal?(state: S): 'completed' | 'collapsed' | null
+  /** Amendment 6: polled after every reduce; new ids merge
+   *  monotonically into cluesFound with clueFound events. */
+  clues?(state: S): readonly string[]
+  /** Consequences this mission emits are carried on its
+   *  SettledOutcome; evaluate() authors them. */
+  readonly saveSchema: GenericSchema<S>
+}
+
+export type MissionRegistry = Readonly<Record<MissionId, MissionModule>>
+
+export type { Consequence }
diff --git a/test/engine/campaign/campaign.test.ts b/test/engine/campaign/campaign.test.ts
new file mode 100644
index 0000000..743936b
--- /dev/null
+++ b/test/engine/campaign/campaign.test.ts
@@ -0,0 +1,395 @@
+import { describe, expect, it } from 'vitest'
+import * as v from 'valibot'
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import { campaignStateSchema } from '@engine/campaign/state'
+import type { CampaignState } from '@engine/campaign/state'
+import type { CampaignAction, EngineEvent } from '@engine/campaign/types'
+import {
+  selectCampaignBegun,
+  selectMenuRows,
+  selectOpenExceptions,
+  selectServiceOutcomes,
+} from '@engine/campaign/selectors'
+import { stateHash } from '../harness/canonical'
+import { MISSIONS, makeContext } from './fixtures'
+
+const ctx = makeContext()
+const T0 = 1_000_000
+
+function fresh(): CampaignState {
+  return createCampaign(ctx, 'test-seed', { extendedTime: false })
+}
+
+function run(
+  state: CampaignState,
+  envelopes: Array<[CampaignAction, number]>,
+): { state: CampaignState; emitted: EngineEvent[] } {
+  let current = state
+  const emitted: EngineEvent[] = []
+  for (const [action, now] of envelopes) {
+    const result = dispatch(ctx, current, action, now)
+    current = result.state
+    emitted.push(...result.emitted)
+  }
+  return { state: current, emitted }
+}
+
+const deliver: CampaignAction = {
+  type: 'MISSION_ACTION',
+  payload: { kind: 'DELIVER' },
+}
+
+function winMission(
+  state: CampaignState,
+  missionId: string,
+  startAt: number,
+): { state: CampaignState; emitted: EngineEvent[] } {
+  return run(state, [
+    [{ type: 'START_MISSION', missionId }, startAt],
+    [deliver, startAt + 1_000],
+    [deliver, startAt + 2_000],
+    [deliver, startAt + 3_000],
+    [{ type: 'ACKNOWLEDGE_DEBRIEF', missionId }, startAt + 4_000],
+  ])
+}
+
+describe('schema as source of truth', () => {
+  it('a fresh campaign parses through the valibot schema', () => {
+    expect(() => v.parse(campaignStateSchema, fresh())).not.toThrow()
+  })
+})
+
+describe('dispatch rejection discipline', () => {
+  it('rejects unknown-phase actions and returns the drained state unchanged', () => {
+    const start = fresh()
+    const result = dispatch(ctx, start, { type: 'FORFEIT_MISSION' }, T0)
+    expect(result.rejection?.reason).toBe('NO ACTIVE MISSION')
+    expect(result.state.phase).toBe('menu')
+    const again = dispatch(ctx, result.state, { type: 'FORFEIT_MISSION' }, T0)
+    expect(again.state).toBe(result.state)
+  })
+
+  it('rejects invalid mission actions via the module validator', () => {
+    const started = dispatch(
+      ctx,
+      fresh(),
+      { type: 'START_MISSION', missionId: 'alpha' },
+      T0,
+    )
+    // Rejection returns the DRAINED state: time passed, the action did
+    // not. Compare against the pure-wake baseline at the same now.
+    const drained = advanceCampaign(ctx, started.state, T0 + 1_000)
+    const bad = dispatch(
+      ctx,
+      started.state,
+      { type: 'MISSION_ACTION', payload: { nope: true } },
+      T0 + 1_000,
+    )
+    expect(bad.rejection?.reason).toBe('MALFORMED ACTION')
+    expect(stateHash(bad.state)).toBe(stateHash(drained.state))
+  })
+})
+
+describe('mission lifecycle and settlement permanence', () => {
+  it('any mission can start first; completion settles once via terminal()', () => {
+    for (const missionId of MISSIONS) {
+      const { state, emitted } = winMission(fresh(), missionId, T0)
+      const settlements = emitted.filter((e) => e.type === 'settlement')
+      expect(settlements).toEqual([
+        { type: 'settlement', missionId, cause: 'completed', tier: 'full' },
+      ])
+      expect(state.phase).toBe('menu')
+      expect(state.settled).toHaveLength(1)
+    }
+  })
+
+  it('timeout settles exactly once and survives re-advances', () => {
+    const started = dispatch(
+      ctx,
+      fresh(),
+      { type: 'START_MISSION', missionId: 'alpha' },
+      T0,
+    )
+    const expired = advanceCampaign(ctx, started.state, T0 + 300_000)
+    expect(
+      expired.emitted.filter((e) => e.type === 'settlement'),
+    ).toHaveLength(1)
+    const again = advanceCampaign(ctx, expired.state, T0 + 400_000)
+    expect(again.emitted.filter((e) => e.type === 'settlement')).toHaveLength(0)
+    expect(expired.state.settled[0]?.cause).toBe('timeout')
+  })
+
+  it('forfeit routes to evaluate with cause forfeit', () => {
+    const { state } = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'beta' }, T0],
+      [{ type: 'FORFEIT_MISSION' }, T0 + 5_000],
+    ])
+    expect(state.settled[0]?.cause).toBe('forfeit')
+  })
+
+  it('terminal() collapsed settles with cause collapsed', () => {
+    const { state, emitted } = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'beta' }, T0],
+      [{ type: 'MISSION_ACTION', payload: { kind: 'POISON' } }, T0 + 1_000],
+    ])
+    expect(state.settled[0]?.cause).toBe('collapsed')
+    expect(
+      emitted.find((e) => e.type === 'settlement' && e.cause === 'collapsed'),
+    ).toBeTruthy()
+  })
+
+  it('a settled mission cannot restart', () => {
+    const won = winMission(fresh(), 'alpha', T0)
+    const retry = dispatch(
+      ctx,
+      won.state,
+      { type: 'START_MISSION', missionId: 'alpha' },
+      T0 + 10_000,
+    )
+    expect(retry.rejection?.reason).toBe('MISSION SETTLED')
+  })
+})
+
+describe('consequence folding', () => {
+  function loseMission(state: CampaignState, missionId: string, at: number) {
+    return run(state, [
+      [{ type: 'START_MISSION', missionId }, at],
+      [{ type: 'FORFEIT_MISSION' }, at + 1_000],
+      [{ type: 'ACKNOWLEDGE_DEBRIEF', missionId }, at + 2_000],
+    ])
+  }
+
+  it('applies a consequence once per target mission, to multiple targets', () => {
+    const afterLoss = loseMission(fresh(), 'alpha', T0)
+    const startBeta = dispatch(
+      ctx,
+      afterLoss.state,
+      { type: 'START_MISSION', missionId: 'beta' },
+      T0 + 10_000,
+    )
+    expect(
+      startBeta.emitted.filter((e) => e.type === 'consequenceApplied'),
+    ).toHaveLength(1)
+    const betaRuntime = startBeta.state.activeMission
+    expect(
+      (betaRuntime?.substate as { inbound: Record<string, number> }).inbound,
+    ).toEqual({ commsDelayed: 10 })
+    const forfeitBeta = run(startBeta.state, [
+      [{ type: 'FORFEIT_MISSION' }, T0 + 11_000],
+      [{ type: 'ACKNOWLEDGE_DEBRIEF', missionId: 'beta' }, T0 + 12_000],
+    ])
+    const startGamma = dispatch(
+      ctx,
+      forfeitBeta.state,
+      { type: 'START_MISSION', missionId: 'gamma' },
+      T0 + 20_000,
+    )
+    const gammaApplied = startGamma.emitted.filter(
+      (e) => e.type === 'consequenceApplied',
+    )
+    expect(gammaApplied.map((e) => e.consequenceId).sort()).toEqual([
+      'cq-alpha',
+      'cq-beta',
+    ])
+    const inbound = (
+      startGamma.state.activeMission?.substate as {
+        inbound: Record<string, number>
+      }
+    ).inbound
+    expect(inbound).toEqual({ commsDelayed: 20 })
+  })
+
+  it('folded initial conditions are order-independent across permutations', () => {
+    const orders: Array<[string, string]> = [
+      ['alpha', 'beta'],
+      ['beta', 'alpha'],
+    ]
+    const inbounds = orders.map(([first, second]) => {
+      let state = fresh()
+      state = loseMission(state, first, T0).state
+      state = loseMission(state, second, T0 + 50_000).state
+      const started = dispatch(
+        ctx,
+        state,
+        { type: 'START_MISSION', missionId: 'gamma' },
+        T0 + 100_000,
+      )
+      return (
+        started.state.activeMission?.substate as {
+          inbound: Record<string, number>
+        }
+      ).inbound
+    })
+    expect(inbounds[0]).toEqual(inbounds[1])
+  })
+})
+
+describe('clues', () => {
+  it('mission clues() merges monotonically with exactly one clueFound', () => {
+    const { state, emitted } = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'alpha' }, T0],
+      [{ type: 'MISSION_ACTION', payload: { kind: 'READ_AUDIT' } }, T0 + 500],
+      [{ type: 'MISSION_ACTION', payload: { kind: 'READ_AUDIT' } }, T0 + 600],
+    ])
+    expect(emitted.filter((e) => e.type === 'clueFound')).toHaveLength(1)
+    expect(state.cluesFound).toEqual(['clue-alpha'])
+  })
+
+  it('a clue survives a failed mission', () => {
+    const { state } = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'alpha' }, T0],
+      [{ type: 'MISSION_ACTION', payload: { kind: 'READ_AUDIT' } }, T0 + 500],
+      [{ type: 'FORFEIT_MISSION' }, T0 + 1_000],
+    ])
+    expect(state.settled[0]?.cause).toBe('forfeit')
+    expect(state.cluesFound).toContain('clue-alpha')
+  })
+
+  it('clueRecords: inspecting a designated record logs its clue exactly once', () => {
+    const { state, emitted } = run(fresh(), [
+      [{ type: 'INSPECT_RECORD', recordId: 'F06' }, T0],
+      [{ type: 'INSPECT_RECORD', recordId: 'F06' }, T0 + 100],
+      [{ type: 'INSPECT_RECORD', recordId: 'W02' }, T0 + 200],
+    ])
+    expect(emitted.filter((e) => e.type === 'clueFound')).toHaveLength(1)
+    expect(state.cluesFound).toEqual(['clue-restriction'])
+    expect(state.inspectedRecords).toEqual(['F06', 'W02'])
+  })
+})
+
+describe('source checks on the campaign queue', () => {
+  it('schedules a desk reply and resolves it at its time', () => {
+    const requested = dispatch(
+      ctx,
+      fresh(),
+      { type: 'REQUEST_SOURCE_CHECK', recordId: 'W02' },
+      T0,
+    )
+    expect(requested.state.campaignQueue).toHaveLength(1)
+    const resolved = advanceCampaign(ctx, requested.state, T0 + 25_000)
+    const event = resolved.emitted.find(
+      (e) => e.type === 'sourceCheckResolved',
+    )
+    expect(event).toEqual({
+      type: 'sourceCheckResolved',
+      recordId: 'W02',
+      outcome: 'CONFIRMED',
+      arrivedAfterSettlement: false,
+    })
+    expect(resolved.state.sourceChecks[0]?.outcome).toBe('CONFIRMED')
+  })
+
+  it('a reply scheduled past endsAt survives settlement with the marker', () => {
+    const { state } = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'alpha' }, T0],
+      [{ type: 'REQUEST_SOURCE_CHECK', recordId: 'C17' }, T0 + 1_000],
+    ])
+    expect(state.campaignQueue).toHaveLength(1)
+    const afterTimeout = advanceCampaign(ctx, state, T0 + 300_000)
+    expect(afterTimeout.state.settled).toHaveLength(1)
+    const late = advanceCampaign(ctx, afterTimeout.state, T0 + 500_000)
+    const check = late.state.sourceChecks[0]
+    expect(check?.outcome).toBe('CONTRADICTED')
+    expect(check?.arrivedAfterSettlement).toBe(true)
+  })
+})
+
+describe('menu, preferences, scoreboards, reset', () => {
+  it('the fourth row appears only after all three debriefs acknowledge', () => {
+    let state = fresh()
+    for (const [index, missionId] of MISSIONS.entries()) {
+      expect(
+        selectMenuRows(state, [...MISSIONS], 'finale').finaleUnlocked,
+      ).toBe(false)
+      state = winMission(state, missionId, T0 + index * 50_000).state
+    }
+    const menu = selectMenuRows(state, [...MISSIONS], 'finale')
+    expect(menu.finaleUnlocked).toBe(true)
+    expect(menu.rows.map((r) => r.missionId)).toEqual([
+      ...MISSIONS,
+      'finale',
+    ])
+  })
+
+  it('extended time locks after the first mission start', () => {
+    const before = dispatch(
+      ctx,
+      fresh(),
+      { type: 'SET_PREFERENCE', preference: 'extendedTime', value: true },
+      T0,
+    )
+    expect(before.rejection).toBeNull()
+    expect(before.state.preferences.extendedTime).toBe(true)
+    const started = dispatch(
+      ctx,
+      before.state,
+      { type: 'START_MISSION', missionId: 'alpha' },
+      T0 + 1_000,
+    )
+    expect(selectCampaignBegun(started.state)).toBe(true)
+    const locked = dispatch(
+      ctx,
+      started.state,
+      { type: 'SET_PREFERENCE', preference: 'extendedTime', value: false },
+      T0 + 2_000,
+    )
+    expect(locked.rejection?.reason).toBe('CAMPAIGN HAS BEGUN')
+  })
+
+  it('extended time doubles endsAt at mission start', () => {
+    const extended = run(fresh(), [
+      [{ type: 'SET_PREFERENCE', preference: 'extendedTime', value: true }, T0],
+      [{ type: 'START_MISSION', missionId: 'alpha' }, T0 + 1_000],
+    ])
+    expect(extended.state.activeMission?.endsAt).toBe(T0 + 1_000 + 480_000)
+  })
+
+  it('scoreboards derive from the same settled facts and diverge', () => {
+    const { state } = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'alpha' }, T0],
+      [{ type: 'FORFEIT_MISSION' }, T0 + 1_000],
+    ])
+    expect(selectOpenExceptions(state)).toBe(-3)
+    expect(selectServiceOutcomes(state)).toBe(30)
+  })
+
+  it('NEW_CAMPAIGN resets outcomes and emits campaignReset', () => {
+    const won = winMission(fresh(), 'alpha', T0)
+    const reset = dispatch(
+      ctx,
+      won.state,
+      { type: 'NEW_CAMPAIGN', seedName: 'test-seed' },
+      T0 + 90_000,
+    )
+    expect(reset.emitted.some((e) => e.type === 'campaignReset')).toBe(true)
+    expect(reset.state.settled).toEqual([])
+    expect(reset.state.lastNow).toBe(T0 + 90_000)
+  })
+})
+
+describe('emitted replay determinism', () => {
+  it('replaying the same envelope log reproduces state and emitted exactly', () => {
+    const log: Array<[CampaignAction, number]> = [
+      [{ type: 'START_MISSION', missionId: 'alpha' }, T0],
+      [deliver, T0 + 70_000],
+      [{ type: 'REQUEST_SOURCE_CHECK', recordId: 'W02' }, T0 + 80_000],
+      [deliver, T0 + 120_000],
+      [deliver, T0 + 230_000],
+    ]
+    const a = run(fresh(), log)
+    const b = run(fresh(), log)
+    expect(stateHash(a.state)).toBe(stateHash(b.state))
+    expect(a.emitted).toEqual(b.emitted)
+    const milestones = a.emitted.filter((e) => e.type === 'timerMilestone')
+    expect(milestones.map((e) => e.id)).toEqual(['warn-30', 'warn-10'])
+  })
+
+  it('every reducer output stays JSON-safe', () => {
+    const { state } = winMission(fresh(), 'alpha', T0)
+    expect(() => stateHash(state)).not.toThrow()
+  })
+})
diff --git a/test/engine/campaign/fixtures.ts b/test/engine/campaign/fixtures.ts
new file mode 100644
index 0000000..c9d3da7
--- /dev/null
+++ b/test/engine/campaign/fixtures.ts
@@ -0,0 +1,70 @@
+import type { EngineContext } from '@engine/campaign/engine'
+import type { SeedDefinition } from '@engine/missions/types'
+import { FIXTURE_RECORDS } from '../records/fixtures'
+import { makeStubMission } from './stub-mission'
+
+export const MISSIONS = ['alpha', 'beta', 'gamma'] as const
+
+export const TEST_SEED: SeedDefinition = {
+  name: 'test-seed',
+  description: 'campaign machine fixture seed',
+  seedNumber: 1984,
+  exerciseRunId: 'R04',
+  records: FIXTURE_RECORDS,
+  deskChecks: [
+    {
+      recordId: 'W02',
+      outcome: 'CONFIRMED',
+      delaySeconds: 20,
+      replyBody: ['FIELD DESK CONFIRMS LOCAL SCOPE'],
+    },
+    {
+      recordId: 'C17',
+      outcome: 'CONTRADICTED',
+      delaySeconds: 400,
+      replyBody: ['DESK FINDS NO OPERATIONAL BASIS'],
+    },
+  ],
+  clueRecords: [{ recordId: 'F06', clueId: 'clue-restriction' }],
+  missionPayloads: { alpha: null, beta: null, gamma: null },
+  schedules: {
+    alpha: [
+      {
+        id: 'warn-30',
+        offsetSeconds: 30,
+        anchor: 'end',
+        kind: 'timerMilestone',
+        payload: null,
+      },
+      {
+        id: 'warn-10',
+        offsetSeconds: 10,
+        anchor: 'end',
+        kind: 'timerMilestone',
+        payload: null,
+      },
+      {
+        id: 'mid-stage',
+        offsetSeconds: 60,
+        anchor: 'start',
+        kind: 'stage',
+        payload: null,
+      },
+    ],
+    beta: [],
+    gamma: [],
+  },
+  missionDurationsMs: { alpha: 240_000, beta: 240_000, gamma: 240_000 },
+}
+
+export function makeContext(): EngineContext {
+  return {
+    seeds: { 'test-seed': TEST_SEED },
+    missions: {
+      alpha: makeStubMission('alpha'),
+      beta: makeStubMission('beta'),
+      gamma: makeStubMission('gamma'),
+    },
+    missionOrder: [...MISSIONS],
+  }
+}
diff --git a/test/engine/campaign/stub-mission.ts b/test/engine/campaign/stub-mission.ts
new file mode 100644
index 0000000..c0dd4a5
--- /dev/null
+++ b/test/engine/campaign/stub-mission.ts
@@ -0,0 +1,116 @@
+// Minimal stub mission for campaign-machine specs: deliver 3 of 5
+// tokens before the deadline, one decoy, one consequence emitted.
+// Section 06 supersedes it with the permanent test double.
+import * as v from 'valibot'
+import type {
+  FoldedConsequences,
+  MissionEvent,
+  MissionModule,
+  SeedDefinition,
+} from '@engine/missions/types'
+import type { SettledOutcome, SettlementCause } from '@engine/campaign/types'
+
+export interface StubState {
+  delivered: number
+  goal: number
+  decoySent: boolean
+  poisoned: boolean
+  auditRead: boolean
+  inbound: Record<string, number>
+}
+
+const stubSchema = v.object({
+  delivered: v.pipe(v.number(), v.integer()),
+  goal: v.pipe(v.number(), v.integer()),
+  decoySent: v.boolean(),
+  poisoned: v.boolean(),
+  auditRead: v.boolean(),
+  inbound: v.record(v.string(), v.pipe(v.number(), v.integer())),
+})
+
+export type StubAction =
+  | { kind: 'DELIVER' }
+  | { kind: 'DECOY' }
+  | { kind: 'POISON' }
+  | { kind: 'READ_AUDIT' }
+
+export function makeStubMission(id: string): MissionModule<StubState> {
+  return {
+    id,
+    init(
+      _seed: SeedDefinition,
+      consequences: FoldedConsequences,
+      _durationMs: number,
+    ): StubState {
+      return {
+        delivered: 0,
+        goal: 3,
+        decoySent: false,
+        poisoned: false,
+        auditRead: false,
+        inbound: { ...consequences.byKind },
+      }
+    },
+    validate(state, payload) {
+      const action = payload as StubAction
+      if (!action || typeof action.kind !== 'string') {
+        return { valid: false, reason: 'MALFORMED ACTION' }
+      }
+      if (action.kind === 'DELIVER' && state.delivered >= state.goal) {
+        return { valid: false, reason: 'GOAL ALREADY MET' }
+      }
+      return { valid: true }
+    },
+    reduce(state, event: MissionEvent): StubState {
+      if (event.type === 'action') {
+        const action = event.payload as StubAction
+        if (action.kind === 'DELIVER') {
+          return { ...state, delivered: state.delivered + 1 }
+        }
+        if (action.kind === 'DECOY') return { ...state, decoySent: true }
+        if (action.kind === 'POISON') return { ...state, poisoned: true }
+        if (action.kind === 'READ_AUDIT') return { ...state, auditRead: true }
+      }
+      return state
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
+                  magnitude: 10,
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
+    saveSchema: stubSchema,
+  }
+}
