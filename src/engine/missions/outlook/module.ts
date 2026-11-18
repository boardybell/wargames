// The CRASH OUTLOOK mission module and its registration under mission id
// 'outlook'. The module is pure: it reads authored content from the seed
// payload captured at construction, applies rules.ts outcomes, and never
// touches Date, Math.random, or timers. Acknowledgment timing lives in
// the substate as scheduledAckAt stamps; the engine drains seed-authored
// start, stage, warning, and settle-tick events, and every such event
// lets the module fold the acks that have landed by that event's now. The
// settle tick authored at endsAt is what lets an ack scheduled exactly at
// endsAt (the buzzer rule) be folded before the timeout settlement guard
// runs in the same advance.
//
// The payload is threaded by constructing the module over it, mirroring
// makeTestDoubleMission(id). The seed carries the same payload (the shell
// and section 02 assemble both from one source), so reduce, evaluate,
// terminal, and debrief read authored message truth without the engine
// having to thread the seed into every method. Substate stays strictly
// reference-only: ids, marks, send records, and integer counters.
import type {
  DebriefPayload,
  EvaluatedOutcome,
  FoldedConsequences,
  MissionEvent,
  MissionModule,
  SeedDefinition,
} from '../types'
import type { SettledOutcome, SettlementCause } from '../../campaign/types'
import type { ScheduledEventSpec } from '../../time'
import type { OutlookPayload } from './content'
import {
  channelAckAt,
  countSatisfiedDeliveries,
  isAcknowledgedWrongDesk,
  isSatisfiedDelivery,
  tierFromSatisfied,
  validateSend,
} from './rules'
import { outlookSaveSchema } from './types'
import type {
  Channel,
  DeskId,
  OutlookMessage,
  OutlookState,
  PrimaryStage,
  RequiredKind,
  SendRecord,
} from './types'

export const OUTLOOK_MISSION_ID = 'outlook'

/** The D-83 campaign clue, surfaced by reading the audit message. Tied to
 *  run R04 and the export feed reference in the authored content. */
export const OUTLOOK_CLUE_ID = 'clue-D-83'

const REQUIRED_KINDS: readonly RequiredKind[] = ['weather', 'payroll', 'audit']

const START_EVENT_ID = 'outlook-start'
const START_EVENT_KIND = 'outlookStart'
const STAGE_EVENT_KIND = 'outlookStage'
const TICK_EVENT_KIND = 'outlookTick'

/** The schedule a seed authors from an OutlookPayload. A start-anchored
 *  offset-0 event lets the module stamp its absolute deadline once time
 *  begins; stage changes flip the primary stage in authored order;
 *  warning offsets are engine timerMilestones (never shell timers); a
 *  settle tick at endsAt folds any ack landing exactly on the deadline
 *  before the timeout guard runs. Section 02 wires this into the seed's
 *  schedules table. */
export function outlookSchedule(
  payload: OutlookPayload,
): readonly ScheduledEventSpec[] {
  const specs: ScheduledEventSpec[] = [
    {
      id: START_EVENT_ID,
      offsetSeconds: 0,
      anchor: 'start',
      kind: START_EVENT_KIND,
      payload: null,
    },
  ]
  payload.stageChanges.forEach((change, index) => {
    const stage = index + 1
    specs.push({
      id: `outlook-stage-${stage}`,
      offsetSeconds: change.offsetSeconds,
      anchor: 'start',
      kind: STAGE_EVENT_KIND,
      payload: {
        stage,
        warningLine: change.warningLine,
        cueId: change.cueId,
      },
    })
  })
  payload.warningOffsets.forEach((warning, index) => {
    specs.push({
      id: `outlook-warn-${index}`,
      offsetSeconds: warning.secondsBeforeEnd,
      anchor: 'end',
      kind: 'timerMilestone',
      payload: { warningLine: warning.warningLine, cueId: warning.cueId },
    })
  })
  specs.push({
    id: 'outlook-tick',
    offsetSeconds: 0,
    anchor: 'end',
    kind: TICK_EVENT_KIND,
    payload: null,
  })
  return specs
}

function emptyDelivered(): OutlookState['deliveredRequired'] {
  return {
    weather: { delivered: false, correct: false },
    payroll: { delivered: false, correct: false },
    audit: { delivered: false, correct: false },
  }
}

interface SendTarget {
  readonly messageId: string
  readonly channel: Channel
  readonly recipient: DeskId | null
  /** The queue slot this send drains, when dispatched from the queue.
   *  Null for a direct SEND. The reducer removes exactly this index so it
   *  never re-reads the raw action payload for a second source of truth. */
  readonly queueIndex: number | null
}

function resolveSendTarget(
  state: OutlookState,
  action: Record<string, unknown>,
): SendTarget | null {
  if (action['kind'] === 'SEND_QUEUED') {
    const index = action['index']
    if (typeof index !== 'number' || !Number.isInteger(index)) return null
    const queued = state.queue[index]
    if (!queued) return null
    return {
      messageId: queued.messageId,
      channel: queued.channel,
      recipient: (action['recipient'] as DeskId | null) ?? null,
      queueIndex: index,
    }
  }
  const messageId = action['messageId']
  const channel = action['channel']
  if (typeof messageId !== 'string') return null
  if (channel !== 'primary' && channel !== 'backup') return null
  return {
    messageId,
    channel,
    recipient: (action['recipient'] as DeskId | null) ?? null,
    queueIndex: null,
  }
}

/** Construct the CRASH OUTLOOK module over an authored payload. Mirrors
 *  makeTestDoubleMission(id): the payload is immutable campaign content,
 *  so closing over it keeps every method pure over (state, event). */
export function makeOutlookMission(
  payload: OutlookPayload,
): MissionModule<OutlookState> {
  const messageById = new Map<string, OutlookMessage>(
    payload.messages.map((m) => [m.id, m]),
  )

  function recomputeDeliveries(state: OutlookState): OutlookState {
    if (state.endsAt === null) return state
    const endsAt = state.endsAt
    const delivered: Record<
      RequiredKind,
      { delivered: boolean; correct: boolean }
    > = {
      weather: { delivered: false, correct: false },
      payroll: { delivered: false, correct: false },
      audit: { delivered: false, correct: false },
    }
    let auditDelivered = false
    // Per required kind, a correct acknowledged delivery wins; absent
    // that, an acknowledged-but-wrong-desk delivery reads as delivered
    // (correct false) so the debrief can distinguish DELIVERED TO WRONG
    // DESK from NOT DELIVERED. A kind with neither stays not delivered.
    for (const kind of REQUIRED_KINDS) {
      for (const send of state.sends) {
        const message = messageById.get(send.messageId)
        if (!message || message.requiredKind !== kind) continue
        if (isSatisfiedDelivery(send, message, endsAt)) {
          delivered[kind] = { delivered: true, correct: true }
          if (kind === 'audit') auditDelivered = true
          break
        }
        if (isAcknowledgedWrongDesk(send, message, endsAt)) {
          delivered[kind] = { delivered: true, correct: false }
          // No break: a later correct ack for the same kind still wins.
        }
      }
    }
    return { ...state, deliveredRequired: delivered, auditDelivered }
  }

  function foldAcks(state: OutlookState, now: number): OutlookState {
    // A pending send folds to acknowledged only when its ack time has
    // elapsed (now >= scheduledAckAt) AND that ack time was on or before
    // the deadline (scheduledAckAt <= endsAt). A send scheduled to land
    // after endsAt never acknowledges: it stays pending and counts as not
    // delivered at settlement. endsAt null means time has not begun, so
    // nothing folds yet.
    const endsAt = state.endsAt
    const sends =
      endsAt === null
        ? state.sends
        : state.sends.map((send) =>
            send.resolution === 'pending' &&
            send.scheduledAckAt <= now &&
            send.scheduledAckAt <= endsAt
              ? { ...send, resolution: 'acknowledged' as const }
              : send,
          )
    const folded: OutlookState = {
      ...state,
      sends,
      ackAsOf: now > state.ackAsOf ? now : state.ackAsOf,
    }
    return recomputeDeliveries(folded)
  }

  function satisfiedCount(state: OutlookState): number {
    // A null endsAt means time has not begun: nothing is satisfiable yet,
    // matching terminal()'s own null guard. Never fall back to a sentinel
    // deadline that would over-credit a pre-deadline forfeit.
    if (state.endsAt === null) return 0
    return countSatisfiedDeliveries(state.sends, payload.messages, state.endsAt)
  }

  function decoyCapacitySpent(state: OutlookState): number {
    let spent = 0
    for (const send of state.sends) {
      if (send.channel !== 'backup') continue
      const message = messageById.get(send.messageId)
      if (!message) continue
      if (message.requiredKind === null || message.supersededBy !== null) {
        spent += 1
      }
    }
    return spent
  }

  function stampDeadline(state: OutlookState, now: number): OutlookState {
    return state.endsAt === null
      ? { ...state, endsAt: now + state.durationMs }
      : state
  }

  function reduceScheduled(state: OutlookState, event: MissionEvent): OutlookState {
    const base = stampDeadline(state, event.now)
    if (event.kind === STAGE_EVENT_KIND) {
      const stage = (event.payload as { stage?: number } | null)?.stage
      const next =
        stage === 1 || stage === 2
          ? { ...base, primaryStage: stage as PrimaryStage }
          : base
      return foldAcks(next, event.now)
    }
    // START, TICK, timerMilestone, and any other scheduled event just fold
    // the acks that have landed by now; the shell reads the warning line
    // and cue id off the emitted scheduledEventFired/timerMilestone event.
    return foldAcks(base, event.now)
  }

  function reduceAction(state: OutlookState, event: MissionEvent): OutlookState {
    const base = stampDeadline(state, event.now)
    const action = event.payload as Record<string, unknown>
    const kind = action['kind']
    if (kind === 'READ') {
      const messageId = action['messageId'] as string
      const mark = base.messages[messageId] ?? { read: false, flagged: false }
      const message = messageById.get(messageId)
      const auditRead =
        base.auditRead || message?.requiredKind === 'audit'
      return {
        ...base,
        messages: { ...base.messages, [messageId]: { ...mark, read: true } },
        auditRead,
      }
    }
    if (kind === 'FLAG') {
      const messageId = action['messageId'] as string
      const mark = base.messages[messageId] ?? { read: false, flagged: false }
      return {
        ...base,
        messages: {
          ...base.messages,
          [messageId]: { ...mark, flagged: !mark.flagged },
        },
      }
    }
    if (kind === 'QUEUE') {
      const messageId = action['messageId'] as string
      const channel = action['channel'] as Channel
      return { ...base, queue: [...base.queue, { messageId, channel }] }
    }
    if (kind === 'DEQUEUE') {
      const index = action['index'] as number
      return { ...base, queue: base.queue.filter((_, i) => i !== index) }
    }
    if (kind === 'SEND' || kind === 'SEND_QUEUED') {
      const target = resolveSendTarget(base, action)
      if (!target) return base
      const validity = validateSend(
        base.primaryStage,
        target.channel,
        base.backupRemaining,
      )
      if (!validity.ok) return base
      const message = messageById.get(target.messageId)
      const currentVersion = message ? message.supersededBy === null : false
      const scheduledAckAt = channelAckAt(
        event.now,
        base.primaryStage,
        target.channel,
        payload.channelTuning,
      )
      const record: SendRecord = {
        messageId: target.messageId,
        channel: target.channel,
        recipient: target.recipient,
        currentVersion,
        sentAt: event.now,
        scheduledAckAt,
        resolution: 'pending',
      }
      const backupRemaining =
        target.channel === 'backup'
          ? base.backupRemaining - 1
          : base.backupRemaining
      const queue =
        target.queueIndex === null
          ? base.queue
          : base.queue.filter((_, i) => i !== target.queueIndex)
      const next: OutlookState = {
        ...base,
        sends: [...base.sends, record],
        backupRemaining,
        queue,
      }
      return foldAcks(next, event.now)
    }
    return base
  }

  return {
    id: OUTLOOK_MISSION_ID,

    init(
      _seed: SeedDefinition,
      _consequences: FoldedConsequences,
      durationMs: number,
    ): OutlookState {
      return {
        messages: {},
        queue: [],
        sends: [],
        primaryStage: 0,
        backupRemaining: payload.channelTuning.backupCapacity,
        deliveredRequired: emptyDelivered(),
        auditRead: false,
        auditDelivered: false,
        ackAsOf: 0,
        durationMs,
        endsAt: null,
      }
    },

    validate(state, payloadIn) {
      const action = payloadIn as Record<string, unknown> | null
      if (!action || typeof action['kind'] !== 'string') {
        return { valid: false, reason: 'MALFORMED ACTION' }
      }
      switch (action['kind']) {
        case 'READ':
        case 'FLAG': {
          if (typeof action['messageId'] !== 'string') {
            return { valid: false, reason: 'NO MESSAGE SELECTED' }
          }
          return { valid: true }
        }
        case 'QUEUE': {
          if (typeof action['messageId'] !== 'string') {
            return { valid: false, reason: 'NO MESSAGE SELECTED' }
          }
          if (
            action['channel'] !== 'primary' &&
            action['channel'] !== 'backup'
          ) {
            return { valid: false, reason: 'NO CHANNEL SELECTED' }
          }
          return { valid: true }
        }
        case 'DEQUEUE': {
          const index = action['index']
          if (typeof index !== 'number' || !Number.isInteger(index)) {
            return { valid: false, reason: 'NO QUEUE SLOT SELECTED' }
          }
          if (!state.queue[index]) {
            return { valid: false, reason: 'QUEUE SLOT EMPTY' }
          }
          return { valid: true }
        }
        case 'SEND':
        case 'SEND_QUEUED': {
          const target = resolveSendTarget(state, action)
          if (!target) return { valid: false, reason: 'NO SEND TARGET' }
          const validity = validateSend(
            state.primaryStage,
            target.channel,
            state.backupRemaining,
          )
          return validity.ok
            ? { valid: true }
            : { valid: false, reason: validity.reason }
        }
        default:
          return { valid: false, reason: 'UNKNOWN ACTION' }
      }
    },

    reduce(state, event: MissionEvent): OutlookState {
      return event.type === 'scheduled'
        ? reduceScheduled(state, event)
        : reduceAction(state, event)
    },

    clues(state) {
      return state.auditRead ? [OUTLOOK_CLUE_ID] : []
    },

    evaluate(state, cause: SettlementCause): EvaluatedOutcome {
      const satisfied = satisfiedCount(state)
      const tier = tierFromSatisfied(satisfied)
      const magnitude = payload.commsDelayedTable[tier]
      const decoy = decoyCapacitySpent(state)
      // Campaign-divergence metrics the selectors read (campaign/selectors.ts),
      // on the same real-scale convention the flights module uses.
      //   wopr_resolved: forced inactivity WOPR counts as resolved = the three
      //     required messages the player did NOT deliver, i.e. the quiet-inbox
      //     holds WOPR rewards. 3 - required_delivered, clamped >= 0. Clean
      //     walkthrough delivers all three (0); deliver-nothing posts 3.
      //   service_cost: the real damage = required messages not delivered
      //     correctly (3 - required_delivered) PLUS any backup/decoy capacity
      //     misspent on non-required or stale traffic. Message-scale integer,
      //     >= 0, deterministic. Clean walkthrough ~0; blanket inactivity high.
      const woprResolved = Math.max(0, 3 - satisfied)
      // DELIBERATE: the undelivered-message count (3 - satisfied) is counted
      // in BOTH wopr_resolved and service_cost. WOPR credits the holds as
      // resolved; the campaign bills the same holds as real damage. That
      // double-count IS the divergence by design; do not "fix" the coupling.
      const serviceCost = woprResolved + decoy
      return {
        missionId: OUTLOOK_MISSION_ID,
        cause,
        tier,
        metrics: {
          required_delivered: satisfied,
          decoy_capacity_spent: decoy,
          weather_correct: state.deliveredRequired.weather.correct ? 1 : 0,
          payroll_correct: state.deliveredRequired.payroll.correct ? 1 : 0,
          audit_correct: state.deliveredRequired.audit.correct ? 1 : 0,
          weather_delivered: state.deliveredRequired.weather.delivered ? 1 : 0,
          payroll_delivered: state.deliveredRequired.payroll.delivered ? 1 : 0,
          audit_delivered: state.deliveredRequired.audit.delivered ? 1 : 0,
          audit_routed: state.auditDelivered ? 1 : 0,
          wopr_resolved: woprResolved,
          service_cost: serviceCost,
        },
        clueId: state.auditRead ? OUTLOOK_CLUE_ID : null,
        consequences:
          magnitude > 0
            ? [{ id: 'cq-outlook', kind: 'commsDelayed', magnitude }]
            : [],
      }
    },

    terminal(state) {
      if (state.endsAt === null) return null
      return satisfiedCount(state) >= 3 ? 'completed' : null
    },

    debrief(outcome: SettledOutcome): DebriefPayload {
      const satisfied = outcome.metrics['required_delivered'] ?? 0
      const decoy = outcome.metrics['decoy_capacity_spent'] ?? 0
      const auditRouted = outcome.metrics['audit_routed'] === 1
      const lines: string[] = REQUIRED_KINDS.map((kind) => {
        const correct = outcome.metrics[`${kind}_correct`] === 1
        const delivered = outcome.metrics[`${kind}_delivered`] === 1
        const status = correct
          ? 'DELIVERED CORRECT'
          : delivered
            ? 'DELIVERED TO WRONG DESK'
            : 'NOT DELIVERED'
        return `REQUIRED ${kind.toUpperCase()}: ${status}`
      })
      lines.unshift(`DELIVERED ${satisfied} OF 3 REQUIRED`)
      lines.push(`DECOY CAPACITY SPENT ${decoy}`)
      lines.push(`AUDIT ROUTED: ${auditRouted ? 'YES' : 'NO'}`)
      lines.push(`CLUE ${outcome.clueId ? 'FOUND' : 'NOT FOUND'}`)
      return {
        missionId: outcome.missionId,
        headline: `${outcome.tier.toUpperCase()} (${outcome.cause.toUpperCase()})`,
        lines,
        clueId: outcome.clueId,
      }
    },

    saveSchema: outlookSaveSchema,
  }
}
