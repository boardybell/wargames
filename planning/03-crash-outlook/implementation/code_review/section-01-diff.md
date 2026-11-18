diff --git a/src/engine/missions/outlook/module.ts b/src/engine/missions/outlook/module.ts
new file mode 100644
index 0000000..fbe98bb
--- /dev/null
+++ b/src/engine/missions/outlook/module.ts
@@ -0,0 +1,499 @@
+// The CRASH OUTLOOK mission module and its registration under mission id
+// 'outlook'. The module is pure: it reads authored content from the seed
+// payload captured at construction, applies rules.ts outcomes, and never
+// touches Date, Math.random, or timers. Acknowledgment timing lives in
+// the substate as scheduledAckAt stamps; the engine drains seed-authored
+// start, stage, warning, and settle-tick events, and every such event
+// lets the module fold the acks that have landed by that event's now. The
+// settle tick authored at endsAt is what lets an ack scheduled exactly at
+// endsAt (the buzzer rule) be folded before the timeout settlement guard
+// runs in the same advance.
+//
+// The payload is threaded by constructing the module over it, mirroring
+// makeTestDoubleMission(id). The seed carries the same payload (the shell
+// and section 02 assemble both from one source), so reduce, evaluate,
+// terminal, and debrief read authored message truth without the engine
+// having to thread the seed into every method. Substate stays strictly
+// reference-only: ids, marks, send records, and integer counters.
+import type {
+  DebriefPayload,
+  EvaluatedOutcome,
+  FoldedConsequences,
+  MissionEvent,
+  MissionModule,
+  SeedDefinition,
+} from '../types'
+import type { SettledOutcome, SettlementCause } from '../../campaign/types'
+import type { ScheduledEventSpec } from '../../time'
+import type { OutlookPayload } from './content'
+import {
+  channelAckAt,
+  countSatisfiedDeliveries,
+  isAcknowledgedWrongDesk,
+  isSatisfiedDelivery,
+  tierFromSatisfied,
+  validateSend,
+} from './rules'
+import { outlookSaveSchema } from './types'
+import type {
+  Channel,
+  DeskId,
+  OutlookMessage,
+  OutlookState,
+  PrimaryStage,
+  RequiredKind,
+  SendRecord,
+} from './types'
+
+export const OUTLOOK_MISSION_ID = 'outlook'
+
+/** The D-83 campaign clue, surfaced by reading the audit message. Tied to
+ *  run R04 and the export feed reference in the authored content. */
+export const OUTLOOK_CLUE_ID = 'clue-D-83'
+
+const REQUIRED_KINDS: readonly RequiredKind[] = ['weather', 'payroll', 'audit']
+
+const START_EVENT_ID = 'outlook-start'
+const START_EVENT_KIND = 'outlookStart'
+const STAGE_EVENT_KIND = 'outlookStage'
+const TICK_EVENT_KIND = 'outlookTick'
+
+/** The schedule a seed authors from an OutlookPayload. A start-anchored
+ *  offset-0 event lets the module stamp its absolute deadline once time
+ *  begins; stage changes flip the primary stage in authored order;
+ *  warning offsets are engine timerMilestones (never shell timers); a
+ *  settle tick at endsAt folds any ack landing exactly on the deadline
+ *  before the timeout guard runs. Section 02 wires this into the seed's
+ *  schedules table. */
+export function outlookSchedule(
+  payload: OutlookPayload,
+): readonly ScheduledEventSpec[] {
+  const specs: ScheduledEventSpec[] = [
+    {
+      id: START_EVENT_ID,
+      offsetSeconds: 0,
+      anchor: 'start',
+      kind: START_EVENT_KIND,
+      payload: null,
+    },
+  ]
+  payload.stageChanges.forEach((change, index) => {
+    const stage = index + 1
+    specs.push({
+      id: `outlook-stage-${stage}`,
+      offsetSeconds: change.offsetSeconds,
+      anchor: 'start',
+      kind: STAGE_EVENT_KIND,
+      payload: {
+        stage,
+        warningLine: change.warningLine,
+        cueId: change.cueId,
+      },
+    })
+  })
+  payload.warningOffsets.forEach((warning, index) => {
+    specs.push({
+      id: `outlook-warn-${index}`,
+      offsetSeconds: warning.secondsBeforeEnd,
+      anchor: 'end',
+      kind: 'timerMilestone',
+      payload: { warningLine: warning.warningLine, cueId: warning.cueId },
+    })
+  })
+  specs.push({
+    id: 'outlook-tick',
+    offsetSeconds: 0,
+    anchor: 'end',
+    kind: TICK_EVENT_KIND,
+    payload: null,
+  })
+  return specs
+}
+
+function emptyDelivered(): OutlookState['deliveredRequired'] {
+  return {
+    weather: { delivered: false, correct: false },
+    payroll: { delivered: false, correct: false },
+    audit: { delivered: false, correct: false },
+  }
+}
+
+interface SendTarget {
+  readonly messageId: string
+  readonly channel: Channel
+  readonly recipient: DeskId | null
+  /** The queue slot this send drains, when dispatched from the queue.
+   *  Null for a direct SEND. The reducer removes exactly this index so it
+   *  never re-reads the raw action payload for a second source of truth. */
+  readonly queueIndex: number | null
+}
+
+function resolveSendTarget(
+  state: OutlookState,
+  action: Record<string, unknown>,
+): SendTarget | null {
+  if (action['kind'] === 'SEND_QUEUED') {
+    const index = action['index']
+    if (typeof index !== 'number' || !Number.isInteger(index)) return null
+    const queued = state.queue[index]
+    if (!queued) return null
+    return {
+      messageId: queued.messageId,
+      channel: queued.channel,
+      recipient: (action['recipient'] as DeskId | null) ?? null,
+      queueIndex: index,
+    }
+  }
+  const messageId = action['messageId']
+  const channel = action['channel']
+  if (typeof messageId !== 'string') return null
+  if (channel !== 'primary' && channel !== 'backup') return null
+  return {
+    messageId,
+    channel,
+    recipient: (action['recipient'] as DeskId | null) ?? null,
+    queueIndex: null,
+  }
+}
+
+/** Construct the CRASH OUTLOOK module over an authored payload. Mirrors
+ *  makeTestDoubleMission(id): the payload is immutable campaign content,
+ *  so closing over it keeps every method pure over (state, event). */
+export function makeOutlookMission(
+  payload: OutlookPayload,
+): MissionModule<OutlookState> {
+  const messageById = new Map<string, OutlookMessage>(
+    payload.messages.map((m) => [m.id, m]),
+  )
+
+  function recomputeDeliveries(state: OutlookState): OutlookState {
+    if (state.endsAt === null) return state
+    const endsAt = state.endsAt
+    const delivered: Record<
+      RequiredKind,
+      { delivered: boolean; correct: boolean }
+    > = {
+      weather: { delivered: false, correct: false },
+      payroll: { delivered: false, correct: false },
+      audit: { delivered: false, correct: false },
+    }
+    let auditDelivered = false
+    // Per required kind, a correct acknowledged delivery wins; absent
+    // that, an acknowledged-but-wrong-desk delivery reads as delivered
+    // (correct false) so the debrief can distinguish DELIVERED TO WRONG
+    // DESK from NOT DELIVERED. A kind with neither stays not delivered.
+    for (const kind of REQUIRED_KINDS) {
+      for (const send of state.sends) {
+        const message = messageById.get(send.messageId)
+        if (!message || message.requiredKind !== kind) continue
+        if (isSatisfiedDelivery(send, message, endsAt)) {
+          delivered[kind] = { delivered: true, correct: true }
+          if (kind === 'audit') auditDelivered = true
+          break
+        }
+        if (isAcknowledgedWrongDesk(send, message, endsAt)) {
+          delivered[kind] = { delivered: true, correct: false }
+          // No break: a later correct ack for the same kind still wins.
+        }
+      }
+    }
+    return { ...state, deliveredRequired: delivered, auditDelivered }
+  }
+
+  function foldAcks(state: OutlookState, now: number): OutlookState {
+    // A pending send folds to acknowledged only when its ack time has
+    // elapsed (now >= scheduledAckAt) AND that ack time was on or before
+    // the deadline (scheduledAckAt <= endsAt). A send scheduled to land
+    // after endsAt never acknowledges: it stays pending and counts as not
+    // delivered at settlement. endsAt null means time has not begun, so
+    // nothing folds yet.
+    const endsAt = state.endsAt
+    const sends =
+      endsAt === null
+        ? state.sends
+        : state.sends.map((send) =>
+            send.resolution === 'pending' &&
+            send.scheduledAckAt <= now &&
+            send.scheduledAckAt <= endsAt
+              ? { ...send, resolution: 'acknowledged' as const }
+              : send,
+          )
+    const folded: OutlookState = {
+      ...state,
+      sends,
+      ackAsOf: now > state.ackAsOf ? now : state.ackAsOf,
+    }
+    return recomputeDeliveries(folded)
+  }
+
+  function satisfiedCount(state: OutlookState): number {
+    // A null endsAt means time has not begun: nothing is satisfiable yet,
+    // matching terminal()'s own null guard. Never fall back to a sentinel
+    // deadline that would over-credit a pre-deadline forfeit.
+    if (state.endsAt === null) return 0
+    return countSatisfiedDeliveries(state.sends, payload.messages, state.endsAt)
+  }
+
+  function decoyCapacitySpent(state: OutlookState): number {
+    let spent = 0
+    for (const send of state.sends) {
+      if (send.channel !== 'backup') continue
+      const message = messageById.get(send.messageId)
+      if (!message) continue
+      if (message.requiredKind === null || message.supersededBy !== null) {
+        spent += 1
+      }
+    }
+    return spent
+  }
+
+  function stampDeadline(state: OutlookState, now: number): OutlookState {
+    return state.endsAt === null
+      ? { ...state, endsAt: now + state.durationMs }
+      : state
+  }
+
+  function reduceScheduled(state: OutlookState, event: MissionEvent): OutlookState {
+    const base = stampDeadline(state, event.now)
+    if (event.kind === STAGE_EVENT_KIND) {
+      const stage = (event.payload as { stage?: number } | null)?.stage
+      const next =
+        stage === 1 || stage === 2
+          ? { ...base, primaryStage: stage as PrimaryStage }
+          : base
+      return foldAcks(next, event.now)
+    }
+    // START, TICK, timerMilestone, and any other scheduled event just fold
+    // the acks that have landed by now; the shell reads the warning line
+    // and cue id off the emitted scheduledEventFired/timerMilestone event.
+    return foldAcks(base, event.now)
+  }
+
+  function reduceAction(state: OutlookState, event: MissionEvent): OutlookState {
+    const base = stampDeadline(state, event.now)
+    const action = event.payload as Record<string, unknown>
+    const kind = action['kind']
+    if (kind === 'READ') {
+      const messageId = action['messageId'] as string
+      const mark = base.messages[messageId] ?? { read: false, flagged: false }
+      const message = messageById.get(messageId)
+      const auditRead =
+        base.auditRead || message?.requiredKind === 'audit'
+      return {
+        ...base,
+        messages: { ...base.messages, [messageId]: { ...mark, read: true } },
+        auditRead,
+      }
+    }
+    if (kind === 'FLAG') {
+      const messageId = action['messageId'] as string
+      const mark = base.messages[messageId] ?? { read: false, flagged: false }
+      return {
+        ...base,
+        messages: {
+          ...base.messages,
+          [messageId]: { ...mark, flagged: !mark.flagged },
+        },
+      }
+    }
+    if (kind === 'QUEUE') {
+      const messageId = action['messageId'] as string
+      const channel = action['channel'] as Channel
+      return { ...base, queue: [...base.queue, { messageId, channel }] }
+    }
+    if (kind === 'DEQUEUE') {
+      const index = action['index'] as number
+      return { ...base, queue: base.queue.filter((_, i) => i !== index) }
+    }
+    if (kind === 'SEND' || kind === 'SEND_QUEUED') {
+      const target = resolveSendTarget(base, action)
+      if (!target) return base
+      const validity = validateSend(
+        base.primaryStage,
+        target.channel,
+        base.backupRemaining,
+      )
+      if (!validity.ok) return base
+      const message = messageById.get(target.messageId)
+      const currentVersion = message ? message.supersededBy === null : false
+      const scheduledAckAt = channelAckAt(
+        event.now,
+        base.primaryStage,
+        target.channel,
+        payload.channelTuning,
+      )
+      const record: SendRecord = {
+        messageId: target.messageId,
+        channel: target.channel,
+        recipient: target.recipient,
+        currentVersion,
+        sentAt: event.now,
+        scheduledAckAt,
+        resolution: 'pending',
+      }
+      const backupRemaining =
+        target.channel === 'backup'
+          ? base.backupRemaining - 1
+          : base.backupRemaining
+      const queue =
+        target.queueIndex === null
+          ? base.queue
+          : base.queue.filter((_, i) => i !== target.queueIndex)
+      const next: OutlookState = {
+        ...base,
+        sends: [...base.sends, record],
+        backupRemaining,
+        queue,
+      }
+      return foldAcks(next, event.now)
+    }
+    return base
+  }
+
+  return {
+    id: OUTLOOK_MISSION_ID,
+
+    init(
+      _seed: SeedDefinition,
+      _consequences: FoldedConsequences,
+      durationMs: number,
+    ): OutlookState {
+      return {
+        messages: {},
+        queue: [],
+        sends: [],
+        primaryStage: 0,
+        backupRemaining: payload.channelTuning.backupCapacity,
+        deliveredRequired: emptyDelivered(),
+        auditRead: false,
+        auditDelivered: false,
+        ackAsOf: 0,
+        durationMs,
+        endsAt: null,
+      }
+    },
+
+    validate(state, payloadIn) {
+      const action = payloadIn as Record<string, unknown> | null
+      if (!action || typeof action['kind'] !== 'string') {
+        return { valid: false, reason: 'MALFORMED ACTION' }
+      }
+      switch (action['kind']) {
+        case 'READ':
+        case 'FLAG': {
+          if (typeof action['messageId'] !== 'string') {
+            return { valid: false, reason: 'NO MESSAGE SELECTED' }
+          }
+          return { valid: true }
+        }
+        case 'QUEUE': {
+          if (typeof action['messageId'] !== 'string') {
+            return { valid: false, reason: 'NO MESSAGE SELECTED' }
+          }
+          if (
+            action['channel'] !== 'primary' &&
+            action['channel'] !== 'backup'
+          ) {
+            return { valid: false, reason: 'NO CHANNEL SELECTED' }
+          }
+          return { valid: true }
+        }
+        case 'DEQUEUE': {
+          const index = action['index']
+          if (typeof index !== 'number' || !Number.isInteger(index)) {
+            return { valid: false, reason: 'NO QUEUE SLOT SELECTED' }
+          }
+          if (!state.queue[index]) {
+            return { valid: false, reason: 'QUEUE SLOT EMPTY' }
+          }
+          return { valid: true }
+        }
+        case 'SEND':
+        case 'SEND_QUEUED': {
+          const target = resolveSendTarget(state, action)
+          if (!target) return { valid: false, reason: 'NO SEND TARGET' }
+          const validity = validateSend(
+            state.primaryStage,
+            target.channel,
+            state.backupRemaining,
+          )
+          return validity.ok
+            ? { valid: true }
+            : { valid: false, reason: validity.reason }
+        }
+        default:
+          return { valid: false, reason: 'UNKNOWN ACTION' }
+      }
+    },
+
+    reduce(state, event: MissionEvent): OutlookState {
+      return event.type === 'scheduled'
+        ? reduceScheduled(state, event)
+        : reduceAction(state, event)
+    },
+
+    clues(state) {
+      return state.auditRead ? [OUTLOOK_CLUE_ID] : []
+    },
+
+    evaluate(state, cause: SettlementCause): EvaluatedOutcome {
+      const satisfied = satisfiedCount(state)
+      const tier = tierFromSatisfied(satisfied)
+      const magnitude = payload.commsDelayedTable[tier]
+      return {
+        missionId: OUTLOOK_MISSION_ID,
+        cause,
+        tier,
+        metrics: {
+          required_delivered: satisfied,
+          decoy_capacity_spent: decoyCapacitySpent(state),
+          weather_correct: state.deliveredRequired.weather.correct ? 1 : 0,
+          payroll_correct: state.deliveredRequired.payroll.correct ? 1 : 0,
+          audit_correct: state.deliveredRequired.audit.correct ? 1 : 0,
+          weather_delivered: state.deliveredRequired.weather.delivered ? 1 : 0,
+          payroll_delivered: state.deliveredRequired.payroll.delivered ? 1 : 0,
+          audit_delivered: state.deliveredRequired.audit.delivered ? 1 : 0,
+          audit_routed: state.auditDelivered ? 1 : 0,
+        },
+        clueId: state.auditRead ? OUTLOOK_CLUE_ID : null,
+        consequences:
+          magnitude > 0
+            ? [{ id: 'cq-outlook', kind: 'commsDelayed', magnitude }]
+            : [],
+      }
+    },
+
+    terminal(state) {
+      if (state.endsAt === null) return null
+      return satisfiedCount(state) >= 3 ? 'completed' : null
+    },
+
+    debrief(outcome: SettledOutcome): DebriefPayload {
+      const satisfied = outcome.metrics['required_delivered'] ?? 0
+      const decoy = outcome.metrics['decoy_capacity_spent'] ?? 0
+      const auditRouted = outcome.metrics['audit_routed'] === 1
+      const lines: string[] = REQUIRED_KINDS.map((kind) => {
+        const correct = outcome.metrics[`${kind}_correct`] === 1
+        const delivered = outcome.metrics[`${kind}_delivered`] === 1
+        const status = correct
+          ? 'DELIVERED CORRECT'
+          : delivered
+            ? 'DELIVERED TO WRONG DESK'
+            : 'NOT DELIVERED'
+        return `REQUIRED ${kind.toUpperCase()}: ${status}`
+      })
+      lines.unshift(`DELIVERED ${satisfied} OF 3 REQUIRED`)
+      lines.push(`DECOY CAPACITY SPENT ${decoy}`)
+      lines.push(`AUDIT ROUTED: ${auditRouted ? 'YES' : 'NO'}`)
+      lines.push(`CLUE ${outcome.clueId ? 'FOUND' : 'NOT FOUND'}`)
+      return {
+        missionId: outcome.missionId,
+        headline: `${outcome.tier.toUpperCase()} (${outcome.cause.toUpperCase()})`,
+        lines,
+        clueId: outcome.clueId,
+      }
+    },
+
+    saveSchema: outlookSaveSchema,
+  }
+}
diff --git a/src/engine/missions/outlook/rules.ts b/src/engine/missions/outlook/rules.ts
new file mode 100644
index 0000000..bb6f2f0
--- /dev/null
+++ b/src/engine/missions/outlook/rules.ts
@@ -0,0 +1,130 @@
+// Pure channel math, delivery evaluation, and tiering for CRASH OUTLOOK.
+// No engine imports beyond types. Every quantity is an integer: whole
+// milliseconds for times, whole seconds for authored ETAs, whole counts
+// for capacity. Nothing here touches Date, Math.random, or timers; the
+// module calls these from validate and reduce.
+import type { OutcomeTier } from '../../campaign/types'
+import type { ChannelTuning } from './content'
+import type {
+  Channel,
+  OutlookMessage,
+  PrimaryStage,
+  SendRecord,
+} from './types'
+
+export type SendValidity =
+  | { readonly ok: true }
+  | { readonly ok: false; readonly reason: string }
+
+/** The single rule for whether a send is legal against the live stage
+ *  and remaining backup capacity. Primary is free and unlimited while the
+ *  link is up (stages 0 and 1); a dark primary (stage 2) rejects. Backup
+ *  spends one of its capacity and rejects once exhausted. Rejections cost
+ *  nothing. */
+export function validateSend(
+  stage: PrimaryStage,
+  channel: Channel,
+  backupRemaining: number,
+): SendValidity {
+  if (channel === 'primary') {
+    if (stage === 2) {
+      return { ok: false, reason: 'PRIMARY LINK DARK. ROUTE OVER BACKUP.' }
+    }
+    return { ok: true }
+  }
+  if (backupRemaining <= 0) {
+    return { ok: false, reason: 'BACKUP CAPACITY EXHAUSTED.' }
+  }
+  return { ok: true }
+}
+
+/** The acknowledgment time for a send: dispatch time plus the authored
+ *  ETA for the channel at the CURRENT stage, converted to whole
+ *  milliseconds. Primary ETA is indexed by the stage directly; the stage
+ *  is narrowed to 0 or 1 here because validateSend rejects a stage-2
+ *  (dark) primary before this path, so there is no silent stage-2 to
+ *  stage-0 fallback. */
+export function channelAckAt(
+  sentAt: number,
+  stage: PrimaryStage,
+  channel: Channel,
+  tuning: ChannelTuning,
+): number {
+  if (channel === 'backup') {
+    return sentAt + tuning.backupEtaSeconds * 1000
+  }
+  if (stage !== 0 && stage !== 1) {
+    throw new Error('outlook: primary ack requested at dark stage')
+  }
+  const stageIndex: 0 | 1 = stage
+  return sentAt + tuning.primaryEtaSeconds[stageIndex] * 1000
+}
+
+/** A satisfied required delivery needs all of: the routed message is the
+ *  current (non-superseded) version at send time, the recipient equals
+ *  the authored correctRecipient, the acknowledgment was scheduled to
+ *  land on time (scheduledAckAt <= endsAt), and the ack has ACTUALLY
+ *  LANDED (resolution acknowledged). A pending send does not satisfy: its
+ *  ack is in flight but not folded, so completion cannot fire until the
+ *  ack actually arrives at the next wake at or after its ack time (or the
+ *  endsAt settle tick folds an on-time ack before the timeout guard). A
+ *  rejected send never satisfies. Wrong anything spends and logs but does
+ *  not satisfy. */
+export function isSatisfiedDelivery(
+  send: SendRecord,
+  message: OutlookMessage,
+  endsAt: number,
+): boolean {
+  if (message.requiredKind === null) return false
+  if (message.supersededBy !== null) return false
+  if (!send.currentVersion) return false
+  if (send.resolution !== 'acknowledged') return false
+  if (send.scheduledAckAt > endsAt) return false
+  if (send.recipient !== message.correctRecipient) return false
+  return true
+}
+
+/** An acknowledged-but-wrong-desk delivery: the ack folded (resolution
+ *  acknowledged) on the current version on time, but the routed recipient
+ *  was not the authored correctRecipient. This is distinct from a
+ *  never-delivered required kind, and the debrief reports it as DELIVERED
+ *  TO WRONG DESK. It never counts toward tier. */
+export function isAcknowledgedWrongDesk(
+  send: SendRecord,
+  message: OutlookMessage,
+  endsAt: number,
+): boolean {
+  if (message.requiredKind === null) return false
+  if (message.supersededBy !== null) return false
+  if (!send.currentVersion) return false
+  if (send.resolution !== 'acknowledged') return false
+  if (send.scheduledAckAt > endsAt) return false
+  return send.recipient !== message.correctRecipient
+}
+
+/** The count of distinct requiredKinds satisfied across the send log. A
+ *  requiredKind counts at most once no matter how many sends satisfy it. */
+export function countSatisfiedDeliveries(
+  sends: readonly SendRecord[],
+  messages: readonly OutlookMessage[],
+  endsAt: number,
+): number {
+  const byId = new Map(messages.map((m) => [m.id, m]))
+  const satisfiedKinds = new Set<string>()
+  for (const send of sends) {
+    const message = byId.get(send.messageId)
+    if (!message || message.requiredKind === null) continue
+    if (isSatisfiedDelivery(send, message, endsAt)) {
+      satisfiedKinds.add(message.requiredKind)
+    }
+  }
+  return satisfiedKinds.size
+}
+
+/** The tier ladder, shared by every settlement cause. */
+export function tierFromSatisfied(count: number): OutcomeTier {
+  if (count >= 3) return 'full'
+  if (count === 2) return 'partial'
+  if (count === 1) return 'poor'
+  return 'failed'
+}
diff --git a/src/engine/missions/outlook/types.ts b/src/engine/missions/outlook/types.ts
index fc3bcd5..d0da51f 100644
--- a/src/engine/missions/outlook/types.ts
+++ b/src/engine/missions/outlook/types.ts
@@ -86,6 +86,11 @@ export interface OutlookState {
   /** The high-water event time the substate has folded acks up to. Lets
    *  terminal() reason over deliveries without a wall clock. */
   readonly ackAsOf: number
+  /** Materialized mission length in ms, from init. Integer. */
+  readonly durationMs: number
+  /** Absolute deadline in ms, stamped from the first event the module
+   *  sees. Null until then. terminal() and evaluate() read it. */
+  readonly endsAt: number | null
 }
 
 const markSchema = v.strictObject({
@@ -130,6 +135,8 @@ export const outlookSaveSchema = v.strictObject({
   auditRead: v.boolean(),
   auditDelivered: v.boolean(),
   ackAsOf: integer,
+  durationMs: integer,
+  endsAt: v.nullable(integer),
 })
 
 export type OutlookStateParsed = v.InferOutput<typeof outlookSaveSchema>
diff --git a/test/engine/missions/outlook/module.test.ts b/test/engine/missions/outlook/module.test.ts
new file mode 100644
index 0000000..d471b16
--- /dev/null
+++ b/test/engine/missions/outlook/module.test.ts
@@ -0,0 +1,519 @@
+import { describe, expect, it } from 'vitest'
+import * as v from 'valibot'
+import {
+  advanceCampaign,
+  createCampaign,
+  dispatch,
+} from '@engine/campaign/engine'
+import type { EngineContext } from '@engine/campaign/engine'
+import type { CampaignState } from '@engine/campaign/state'
+import type { CampaignAction, EngineEvent } from '@engine/campaign/types'
+import type { SeedDefinition } from '@engine/missions/types'
+import { buildTestContext } from '@engine/testing'
+import {
+  OUTLOOK_CLUE_ID,
+  makeOutlookMission,
+  outlookSchedule,
+} from '@engine/missions/outlook/module'
+import type { OutlookPayload } from '@engine/missions/outlook/content'
+import type { OutlookState } from '@engine/missions/outlook/types'
+import { FIXTURE_RECORDS } from '../../records/fixtures'
+
+// A minimal in-test payload: one of each requiredKind, one superseded
+// duplicate of the weather message, and one decoy. Not the authored
+// twelve; section 02 writes those.
+const FIXTURE_PAYLOAD: OutlookPayload = {
+  messages: [
+    {
+      id: 'M01',
+      from: 'NODE 7',
+      to: 'WEATHER DESK',
+      subject: 'STORM OUTLOOK',
+      body: ['WEATHER EVIDENCE'],
+      recordId: 'W02',
+      requiredKind: 'weather',
+      correctRecipient: 'WEATHER_DESK',
+      supersededBy: null,
+    },
+    {
+      id: 'M02',
+      from: 'NODE 7',
+      to: 'WEATHER DESK',
+      subject: 'STORM OUTLOOK REV A',
+      body: ['STALE WEATHER COPY'],
+      recordId: 'W01',
+      requiredKind: 'weather',
+      correctRecipient: 'WEATHER_DESK',
+      supersededBy: 'M01',
+    },
+    {
+      id: 'M03',
+      from: 'PAY NODE',
+      to: 'PAYROLL DESK',
+      subject: 'PAYROLL RUN',
+      body: ['PAYROLL EVIDENCE'],
+      recordId: 'B04',
+      requiredKind: 'payroll',
+      correctRecipient: 'PAYROLL_DESK',
+      supersededBy: null,
+    },
+    {
+      id: 'M04',
+      from: 'AUDIT NODE',
+      to: 'AUDIT DESK',
+      subject: 'AUDIT EXPORT',
+      body: ['AUDIT EVIDENCE', 'EXPORT FEED R04'],
+      recordId: 'C17',
+      requiredKind: 'audit',
+      correctRecipient: 'AUDIT_DESK',
+      supersededBy: null,
+    },
+    {
+      id: 'M05',
+      from: 'UNKNOWN',
+      to: null,
+      subject: 'CHAIN LETTER',
+      body: ['DECOY NOISE'],
+      recordId: null,
+      requiredKind: null,
+      correctRecipient: null,
+      supersededBy: null,
+    },
+  ],
+  channelTuning: {
+    backupCapacity: 5,
+    primaryEtaSeconds: [30, 90],
+    backupEtaSeconds: 120,
+  },
+  stageChanges: [
+    {
+      offsetSeconds: 60,
+      warningLine: 'PRIMARY LINK DEGRADING. ACK TIMES RISING.',
+      cueId: 'tone-fall-1',
+    },
+    {
+      offsetSeconds: 120,
+      warningLine: 'PRIMARY LINK DARK. BACKUP REMAINS USABLE TO THE DEADLINE.',
+      cueId: 'tone-fall-2',
+    },
+    {
+      offsetSeconds: 180,
+      warningLine: 'STAGE THREE RESERVED.',
+      cueId: 'tone-fall-3',
+    },
+  ],
+  warningOffsets: [
+    {
+      secondsBeforeEnd: 30,
+      warningLine: 'THIRTY SECONDS TO DEADLINE.',
+      cueId: 'tone-warn-30',
+    },
+    {
+      secondsBeforeEnd: 10,
+      warningLine: 'TEN SECONDS TO DEADLINE.',
+      cueId: 'tone-warn-10',
+    },
+  ],
+  commsDelayedTable: {
+    full: 0,
+    partial: 10,
+    poor: 20,
+    failed: 30,
+  },
+}
+
+const DURATION_MS = 240_000
+const T0 = 1_000_000
+
+const outlookModule = makeOutlookMission(FIXTURE_PAYLOAD)
+
+function makeOutlookContext(): EngineContext {
+  const overrides: Partial<SeedDefinition> = {
+    missionPayloads: { outlook: FIXTURE_PAYLOAD },
+    schedules: { outlook: [...outlookSchedule(FIXTURE_PAYLOAD)] },
+    missionDurationsMs: { outlook: DURATION_MS },
+  }
+  return buildTestContext(FIXTURE_RECORDS, overrides, {
+    missions: { outlook: outlookModule },
+    missionOrder: ['outlook'],
+  })
+}
+
+const ctx = makeOutlookContext()
+
+function fresh(extended = false): CampaignState {
+  return createCampaign(ctx, 'test-seed', { extendedTime: extended })
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
+function sub(state: CampaignState): OutlookState {
+  return state.activeMission?.substate as OutlookState
+}
+
+function send(messageId: string, recipient: string, channel = 'primary') {
+  return {
+    type: 'MISSION_ACTION' as const,
+    payload: { kind: 'SEND', messageId, channel, recipient },
+  }
+}
+
+describe('outlook init', () => {
+  it('produces the empty starting state', () => {
+    const started = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
+    ])
+    const s = sub(started.state)
+    expect(s.queue).toEqual([])
+    expect(s.sends).toEqual([])
+    expect(s.primaryStage).toBe(0)
+    expect(s.backupRemaining).toBe(5)
+    expect(s.deliveredRequired.weather.delivered).toBe(false)
+    expect(s.deliveredRequired.payroll.delivered).toBe(false)
+    expect(s.deliveredRequired.audit.delivered).toBe(false)
+    expect(s.auditRead).toBe(false)
+  })
+
+  it('round-trips the engine-produced substate through the saveSchema', () => {
+    const started = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
+    ])
+    const schema = ctx.missions['outlook']!.saveSchema
+    const substate = started.state.activeMission?.substate
+    const revived = v.parse(schema, JSON.parse(JSON.stringify(substate)))
+    expect(revived).toEqual(substate)
+  })
+})
+
+describe('outlook schedule', () => {
+  it('fires stage changes in authored order via scheduledEventFired', () => {
+    const emitted = advanceCampaign(
+      ctx,
+      run(fresh(), [
+        [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
+      ]).state,
+      T0 + 130_000,
+    ).emitted
+    const stageFires = emitted
+      .filter((e) => e.type === 'scheduledEventFired' && e.kind === 'outlookStage')
+      .map((e) => (e as { id: string }).id)
+    expect(stageFires).toEqual(['outlook-stage-1', 'outlook-stage-2'])
+  })
+
+  it('flips primaryStage 0 to 1 to 2 as its stage events fire', () => {
+    const started = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
+    ]).state
+    const atStage1 = advanceCampaign(ctx, started, T0 + 70_000).state
+    expect(sub(atStage1).primaryStage).toBe(1)
+    const atStage2 = advanceCampaign(ctx, atStage1, T0 + 130_000).state
+    expect(sub(atStage2).primaryStage).toBe(2)
+  })
+
+  it('rejects a direct primary send once the primary is dark', () => {
+    const started = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
+    ]).state
+    const dark = advanceCampaign(ctx, started, T0 + 130_000).state
+    const rejected = dispatch(ctx, dark, send('M01', 'WEATHER_DESK'), T0 + 131_000)
+    expect(rejected.rejection?.rejected).toBe(true)
+    expect(sub(rejected.state).sends).toHaveLength(0)
+  })
+})
+
+describe('outlook read and flag', () => {
+  it('toggles read and flag marks', () => {
+    const started = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
+      [{ type: 'MISSION_ACTION', payload: { kind: 'READ', messageId: 'M05' } }, T0 + 1_000],
+      [{ type: 'MISSION_ACTION', payload: { kind: 'FLAG', messageId: 'M05' } }, T0 + 2_000],
+    ])
+    const s = sub(started.state)
+    expect(s.messages['M05']?.read).toBe(true)
+    expect(s.messages['M05']?.flagged).toBe(true)
+  })
+})
+
+describe('outlook queue', () => {
+  it('QUEUE is free and stores messageId and channel only', () => {
+    const started = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
+      [
+        { type: 'MISSION_ACTION', payload: { kind: 'QUEUE', messageId: 'M01', channel: 'backup' } },
+        T0 + 1_000,
+      ],
+    ])
+    const s = sub(started.state)
+    expect(s.queue).toEqual([{ messageId: 'M01', channel: 'backup' }])
+    expect(s.backupRemaining).toBe(5)
+    expect(s.sends).toHaveLength(0)
+  })
+
+  it('dispatching a queued primary send to a dark primary rejects and leaves it queued', () => {
+    const queued = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
+      [
+        {
+          type: 'MISSION_ACTION',
+          payload: { kind: 'QUEUE', messageId: 'M01', channel: 'primary' },
+        },
+        T0 + 1_000,
+      ],
+    ]).state
+    const dark = advanceCampaign(ctx, queued, T0 + 130_000).state
+    const dispatched = dispatch(
+      ctx,
+      dark,
+      {
+        type: 'MISSION_ACTION',
+        payload: { kind: 'SEND_QUEUED', index: 0, recipient: 'WEATHER_DESK' },
+      },
+      T0 + 131_000,
+    )
+    expect(dispatched.rejection?.rejected).toBe(true)
+    expect(sub(dispatched.state).queue).toHaveLength(1)
+    expect(sub(dispatched.state).sends).toHaveLength(0)
+  })
+})
+
+describe('outlook sends and acknowledgments', () => {
+  it('backup send spends capacity and logs a send record', () => {
+    const started = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
+      [send('M01', 'WEATHER_DESK', 'backup'), T0 + 1_000],
+    ])
+    const s = sub(started.state)
+    expect(s.backupRemaining).toBe(4)
+    expect(s.sends).toHaveLength(1)
+    expect(s.sends[0]?.scheduledAckAt).toBe(T0 + 1_000 + 120_000)
+  })
+
+  it('primary send spends no capacity and uses stage 0 ETA', () => {
+    const started = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
+      [send('M01', 'WEATHER_DESK', 'primary'), T0 + 1_000],
+    ])
+    const s = sub(started.state)
+    expect(s.backupRemaining).toBe(5)
+    expect(s.sends[0]?.scheduledAckAt).toBe(T0 + 1_000 + 30_000)
+  })
+
+  it('a send stays pending until a later wake folds its ack, then is delivered', () => {
+    // Primary stage-0 ack lands at T0 + 31s. Advancing to T0 + 40s fires
+    // no event (the first stage change is at 60s), so nothing folds and
+    // the delivery is still pending even though wall time passed its ack.
+    const started = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
+      [send('M01', 'WEATHER_DESK', 'primary'), T0 + 1_000],
+    ]).state
+    const quiet = advanceCampaign(ctx, started, T0 + 40_000).state
+    expect(sub(quiet).sends[0]?.resolution).toBe('pending')
+    expect(sub(quiet).deliveredRequired.weather.delivered).toBe(false)
+    // The stage-1 event at 60s is the next wake past the ack time: it
+    // folds the ack and the delivery lands.
+    const folded = advanceCampaign(ctx, quiet, T0 + 70_000).state
+    expect(sub(folded).sends[0]?.resolution).toBe('acknowledged')
+    expect(sub(folded).deliveredRequired.weather.delivered).toBe(true)
+    expect(sub(folded).deliveredRequired.weather.correct).toBe(true)
+  })
+
+  it('wrong recipient spends and logs but does not satisfy the delivery', () => {
+    const started = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
+      [send('M01', 'PAYROLL_DESK', 'primary'), T0 + 1_000],
+    ]).state
+    const later = advanceCampaign(ctx, started, T0 + 70_000).state
+    expect(sub(later).sends).toHaveLength(1)
+    expect(sub(later).deliveredRequired.weather.correct).toBe(false)
+  })
+
+  it('a superseded message spends but never satisfies its requiredKind', () => {
+    const started = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
+      [send('M02', 'WEATHER_DESK', 'primary'), T0 + 1_000],
+    ]).state
+    const later = advanceCampaign(ctx, started, T0 + 70_000).state
+    expect(sub(later).sends).toHaveLength(1)
+    expect(sub(later).deliveredRequired.weather.delivered).toBe(false)
+  })
+
+  it('an acknowledged delivery to the wrong desk reads as DELIVERED TO WRONG DESK and does not count toward tier', () => {
+    // M01 (weather) correctly to WEATHER_DESK, M03 (payroll) routed to the
+    // wrong desk. Advance past a wake so both acks fold.
+    const started = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
+      [send('M01', 'WEATHER_DESK', 'primary'), T0 + 1_000],
+      [send('M03', 'AUDIT_DESK', 'primary'), T0 + 2_000],
+    ]).state
+    const folded = advanceCampaign(ctx, started, T0 + 70_000).state
+    const s = sub(folded)
+    expect(s.deliveredRequired.weather).toEqual({ delivered: true, correct: true })
+    // Payroll acked but to the wrong desk: delivered true, correct false.
+    expect(s.deliveredRequired.payroll).toEqual({ delivered: true, correct: false })
+    // Only the correct weather delivery counts toward tier.
+    const timedOut = advanceCampaign(ctx, folded, T0 + DURATION_MS + 1_000).state
+    const outcome = timedOut.settled.find((o) => o.missionId === 'outlook')!
+    expect(outcome.metrics['required_delivered']).toBe(1)
+    const debrief = outlookModule.debrief!(outcome)
+    expect(debrief.lines).toContain('REQUIRED PAYROLL: DELIVERED TO WRONG DESK')
+    expect(debrief.lines).toContain('REQUIRED WEATHER: DELIVERED CORRECT')
+    expect(debrief.lines).toContain('REQUIRED AUDIT: NOT DELIVERED')
+  })
+})
+
+describe('outlook settlement', () => {
+  it('completes early when the third correct ack LANDS, not at send dispatch', () => {
+    // Three correct primary stage-0 sends near T0. Their acks are
+    // scheduled at send + 30s (about T0 + 31s..33s), well before the 240s
+    // deadline. No scheduled event fires between the sends and 60s, so at
+    // SEND dispatch the acks are still pending and the mission must NOT
+    // have settled. Completion fires only when a later wake past the third
+    // ack time folds the acks.
+    const sent = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
+      [send('M01', 'WEATHER_DESK', 'primary'), T0 + 1_000],
+      [send('M03', 'PAYROLL_DESK', 'primary'), T0 + 2_000],
+      [send('M04', 'AUDIT_DESK', 'primary'), T0 + 3_000],
+    ])
+    expect(sent.emitted.filter((e) => e.type === 'settlement')).toHaveLength(0)
+    expect(sent.state.phase).toBe('mission')
+    // A wake just before the third ack time (T0 + 33s) still has it
+    // pending, so no completion: fold only resolves acks whose time has
+    // elapsed, and here nothing has advanced past them via an event yet.
+    const beforeThird = advanceCampaign(ctx, sent.state, T0 + 32_000)
+    expect(beforeThird.emitted.filter((e) => e.type === 'settlement')).toHaveLength(0)
+    expect(beforeThird.state.phase).toBe('mission')
+    // The stage-1 event at 60s is the next wake, now well past all three
+    // ack times (<= 33s): it folds the three acks and the third landing
+    // settles the mission completed, mid-mission, far from the deadline.
+    const done = advanceCampaign(ctx, beforeThird.state, T0 + 70_000)
+    const settlements = done.emitted.filter((e) => e.type === 'settlement')
+    expect(settlements).toHaveLength(1)
+    expect(settlements[0]).toMatchObject({ cause: 'completed', tier: 'full' })
+    expect(done.state.phase).toBe('debrief')
+    expect(done.state.lastNow).toBeLessThan(T0 + DURATION_MS)
+  })
+
+  it('times out and settles exactly once when nothing is delivered', () => {
+    const base = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
+    ]).state
+    const timedOut = advanceCampaign(ctx, base, T0 + DURATION_MS + 1_000)
+    const settlements = timedOut.emitted.filter((e) => e.type === 'settlement')
+    expect(settlements).toHaveLength(1)
+    expect(settlements[0]).toMatchObject({ cause: 'timeout', tier: 'failed' })
+  })
+
+  it('buzzer: an ack scheduled exactly at endsAt folds at the deadline tick and settles completed, draining before the timeout guard', () => {
+    // Backup ETA is 120s. Send three on backup at endsAt - 120s so their
+    // acks are scheduled to land exactly at endsAt. At SEND dispatch the
+    // acks are pending, so NOTHING settles yet. The settle tick authored
+    // at endsAt folds the three boundary acks (scheduledAt == endsAt,
+    // on-time) before the timeout guard runs, so advancing to endsAt
+    // settles completed, never timeout.
+    const endsAt = T0 + DURATION_MS
+    const sendAt = endsAt - 120_000
+    const queued = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
+      [send('M01', 'WEATHER_DESK', 'backup'), sendAt],
+      [send('M03', 'PAYROLL_DESK', 'backup'), sendAt],
+      [send('M04', 'AUDIT_DESK', 'backup'), sendAt],
+    ])
+    // At dispatch the boundary acks are pending: no settlement on SEND.
+    expect(queued.emitted.filter((e) => e.type === 'settlement')).toHaveLength(0)
+    expect(queued.state.phase).toBe('mission')
+    expect(sub(queued.state).sends.every((s) => s.resolution === 'pending')).toBe(true)
+    // Advance exactly to endsAt: the tick folds the on-time acks before
+    // the timeout guard, so the deadline settles completed.
+    const buzzer = advanceCampaign(ctx, queued.state, endsAt)
+    const settlements = buzzer.emitted.filter((e) => e.type === 'settlement')
+    expect(settlements).toHaveLength(1)
+    expect(settlements[0]).toMatchObject({ cause: 'completed', tier: 'full' })
+    // Advancing past the deadline must not settle a second time.
+    const after = advanceCampaign(ctx, buzzer.state, endsAt + 1_000)
+    expect(after.emitted.filter((e) => e.type === 'settlement')).toHaveLength(0)
+  })
+
+  it('a mission short of three acks at endsAt settles timeout, not completed', () => {
+    // Only two correct backup sends on time. Their acks fold at the
+    // endsAt tick but the third is missing, so the deadline settles
+    // timeout at a partial tier, exactly once.
+    const endsAt = T0 + DURATION_MS
+    const sendAt = endsAt - 120_000
+    const queued = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
+      [send('M01', 'WEATHER_DESK', 'backup'), sendAt],
+      [send('M03', 'PAYROLL_DESK', 'backup'), sendAt],
+    ])
+    expect(queued.emitted.filter((e) => e.type === 'settlement')).toHaveLength(0)
+    const buzzer = advanceCampaign(ctx, queued.state, endsAt)
+    const settlements = buzzer.emitted.filter((e) => e.type === 'settlement')
+    expect(settlements).toHaveLength(1)
+    expect(settlements[0]).toMatchObject({ cause: 'timeout', tier: 'partial' })
+    // The two on-time acks still folded to acknowledged at the tick.
+    const outcome = buzzer.state.settled.find((o) => o.missionId === 'outlook')!
+    expect(outcome.metrics['required_delivered']).toBe(2)
+  })
+
+  it('forfeit settles once at the current acknowledged satisfied count', () => {
+    const base = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
+      [send('M01', 'WEATHER_DESK', 'primary'), T0 + 1_000],
+    ]).state
+    // Advance past the stage-1 wake at 60s so the single correct ack folds
+    // to acknowledged, then forfeit: the satisfied count is a real
+    // acknowledged delivery, so the tier is poor (one), not failed.
+    const acked = advanceCampaign(ctx, base, T0 + 70_000).state
+    expect(sub(acked).sends[0]?.resolution).toBe('acknowledged')
+    const forfeited = dispatch(ctx, acked, { type: 'FORFEIT_MISSION' }, T0 + 71_000)
+    const settlements = forfeited.emitted.filter((e) => e.type === 'settlement')
+    expect(settlements).toHaveLength(1)
+    expect(settlements[0]).toMatchObject({ cause: 'forfeit', tier: 'poor' })
+  })
+})
+
+describe('outlook clue flow', () => {
+  it('reading the audit message emits clueFound exactly once even when read twice, and it survives a timeout', () => {
+    const read = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
+      [{ type: 'MISSION_ACTION', payload: { kind: 'READ', messageId: 'M04' } }, T0 + 1_000],
+      [{ type: 'MISSION_ACTION', payload: { kind: 'READ', messageId: 'M04' } }, T0 + 2_000],
+    ])
+    const clueEvents = read.emitted.filter((e) => e.type === 'clueFound')
+    expect(clueEvents).toHaveLength(1)
+    expect(clueEvents[0]).toMatchObject({ clueId: OUTLOOK_CLUE_ID })
+    // Clue survives a mission that then times out.
+    const timedOut = advanceCampaign(ctx, read.state, T0 + DURATION_MS + 1_000)
+    expect(timedOut.state.cluesFound).toContain(OUTLOOK_CLUE_ID)
+  })
+})
+
+describe('outlook debrief', () => {
+  it('reports per-delivery outcomes, decoy capacity spent, and the clue flag', () => {
+    const base = run(fresh(), [
+      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
+      [{ type: 'MISSION_ACTION', payload: { kind: 'READ', messageId: 'M04' } }, T0 + 500],
+      [send('M01', 'WEATHER_DESK', 'primary'), T0 + 1_000],
+      [send('M05', 'WEATHER_DESK', 'backup'), T0 + 2_000],
+    ]).state
+    const timedOut = advanceCampaign(ctx, base, T0 + DURATION_MS + 1_000).state
+    const outcome = timedOut.settled.find((o) => o.missionId === 'outlook')!
+    const payload = outlookModule.debrief!(outcome)
+    expect(payload.missionId).toBe('outlook')
+    expect(payload.clueId).toBe(OUTLOOK_CLUE_ID)
+    expect(payload.lines.some((l) => l.includes('WEATHER'))).toBe(true)
+    expect(payload.lines.some((l) => l.includes('DECOY'))).toBe(true)
+  })
+})
diff --git a/test/engine/missions/outlook/rules.test.ts b/test/engine/missions/outlook/rules.test.ts
index 22f1058..7953d24 100644
--- a/test/engine/missions/outlook/rules.test.ts
+++ b/test/engine/missions/outlook/rules.test.ts
@@ -2,6 +2,7 @@ import { describe, expect, it } from 'vitest'
 import {
   channelAckAt,
   countSatisfiedDeliveries,
+  isAcknowledgedWrongDesk,
   isSatisfiedDelivery,
   tierFromSatisfied,
   validateSend,
@@ -140,11 +141,43 @@ describe('isSatisfiedDelivery: supersession, recipient, ack timing', () => {
     ).toBe(false)
   })
 
-  it('a pending (unacknowledged) send does not satisfy', () => {
+  it('a pending send does NOT satisfy until its ack has folded', () => {
     expect(
       isSatisfiedDelivery(send({ resolution: 'pending' }), weatherMsg, endsAt),
     ).toBe(false)
   })
+
+  it('a rejected send never satisfies', () => {
+    expect(
+      isSatisfiedDelivery(send({ resolution: 'rejected' }), weatherMsg, endsAt),
+    ).toBe(false)
+  })
+})
+
+describe('isAcknowledgedWrongDesk', () => {
+  const endsAt = 1_200_000
+
+  it('an acknowledged ack to the wrong desk reads as wrong-desk, not satisfied', () => {
+    const wrong = send({ recipient: 'PAYROLL_DESK', resolution: 'acknowledged' })
+    expect(isAcknowledgedWrongDesk(wrong, weatherMsg, endsAt)).toBe(true)
+    expect(isSatisfiedDelivery(wrong, weatherMsg, endsAt)).toBe(false)
+  })
+
+  it('a correct acknowledged ack is not a wrong-desk delivery', () => {
+    expect(
+      isAcknowledgedWrongDesk(send({ resolution: 'acknowledged' }), weatherMsg, endsAt),
+    ).toBe(false)
+  })
+
+  it('a pending wrong-desk send is not a wrong-desk delivery until it folds', () => {
+    expect(
+      isAcknowledgedWrongDesk(
+        send({ recipient: 'PAYROLL_DESK', resolution: 'pending' }),
+        weatherMsg,
+        endsAt,
+      ),
+    ).toBe(false)
+  })
 })
 
 describe('tiering', () => {
diff --git a/test/engine/missions/outlook/saveSchema.test.ts b/test/engine/missions/outlook/saveSchema.test.ts
index 68f34da..620a49d 100644
--- a/test/engine/missions/outlook/saveSchema.test.ts
+++ b/test/engine/missions/outlook/saveSchema.test.ts
@@ -39,6 +39,8 @@ const populated: OutlookState = {
   auditRead: true,
   auditDelivered: false,
   ackAsOf: 1_030_000,
+  durationMs: 240_000,
+  endsAt: 1_240_000,
 }
 
 describe('outlook saveSchema', () => {
