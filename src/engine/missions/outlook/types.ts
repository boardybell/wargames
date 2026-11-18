// CRASH OUTLOOK substate and its reference-only save schema. The one
// discipline this file enforces structurally: the persisted substate
// carries ids, marks, send records, and integer counters only. Authored
// copy (bodies, subjects, sender lines) lives exclusively in the
// immutable seed payload, never in a save. If a test can smuggle a body
// array into a parsed substate, this schema is wrong.
import * as v from 'valibot'

const integer = v.pipe(v.number(), v.integer())

/** The three recipient desks a required message can be routed to, plus
 *  the null slot a decoy or superseded message carries. Desk-check logic
 *  is engine-owned; this module only needs the desk labels to line up
 *  with authored correctRecipient truth. */
export type DeskId = 'WEATHER_DESK' | 'PAYROLL_DESK' | 'AUDIT_DESK'

export type RequiredKind = 'weather' | 'payroll' | 'audit'

export type Channel = 'primary' | 'backup'

export type PrimaryStage = 0 | 1 | 2

export type SendResolution = 'pending' | 'acknowledged' | 'rejected'

/** Authored message truth. Lives in the seed payload only; the substate
 *  never copies body/subject/from. */
export interface OutlookMessage {
  readonly id: string
  readonly from: string
  readonly to: string | null
  readonly subject: string
  readonly body: readonly string[]
  readonly recordId: string | null
  readonly requiredKind: RequiredKind | null
  readonly correctRecipient: DeskId | null
  readonly supersededBy: string | null
}

/** A parked route: message id and channel only. Stage, capacity, and ETA
 *  are never captured at queue time; a dispatch re-evaluates them live. */
export interface QueuedSend {
  readonly messageId: string
  readonly channel: Channel
}

/** One dispatched send. Captures the version validity at send time, the
 *  routed recipient, the channel, the dispatch time, the computed ack
 *  time, and the resolution. No authored copy. */
export interface SendRecord {
  readonly messageId: string
  readonly channel: Channel
  readonly recipient: DeskId | null
  /** True iff the routed message was the current (non-superseded)
   *  version at the moment of dispatch. */
  readonly currentVersion: boolean
  readonly sentAt: number
  readonly scheduledAckAt: number
  readonly resolution: SendResolution
}

/** Per-message marks the player toggles. Ids and booleans only. */
export interface MessageMark {
  readonly read: boolean
  readonly flagged: boolean
}

/** Per requiredKind delivery truth, derived from the send log at mark
 *  time. delivered means an acknowledgment landed by the deadline;
 *  correct means the routed recipient matched authored truth on the
 *  current version. */
export interface DeliveredRequired {
  readonly delivered: boolean
  readonly correct: boolean
}

export interface OutlookState {
  /** read/flag marks per message id. Ids and marks only, never bodies. */
  readonly messages: Readonly<Record<string, MessageMark>>
  readonly queue: readonly QueuedSend[]
  readonly sends: readonly SendRecord[]
  readonly primaryStage: PrimaryStage
  readonly backupRemaining: number
  readonly deliveredRequired: Readonly<Record<RequiredKind, DeliveredRequired>>
  readonly auditRead: boolean
  readonly auditDelivered: boolean
  /** The high-water event time the substate has folded acks up to. Lets
   *  terminal() reason over deliveries without a wall clock. */
  readonly ackAsOf: number
}

const markSchema = v.strictObject({
  read: v.boolean(),
  flagged: v.boolean(),
})

const queuedSendSchema = v.strictObject({
  messageId: v.string(),
  channel: v.picklist(['primary', 'backup']),
})

const sendRecordSchema = v.strictObject({
  messageId: v.string(),
  channel: v.picklist(['primary', 'backup']),
  recipient: v.nullable(v.picklist(['WEATHER_DESK', 'PAYROLL_DESK', 'AUDIT_DESK'])),
  currentVersion: v.boolean(),
  sentAt: integer,
  scheduledAckAt: integer,
  resolution: v.picklist(['pending', 'acknowledged', 'rejected']),
})

const deliveredRequiredSchema = v.strictObject({
  delivered: v.boolean(),
  correct: v.boolean(),
})

/** The reference-only save schema. strictObject at every level means any
 *  field that could carry authored copy (a body array, a subject string)
 *  is structurally rejected. */
export const outlookSaveSchema = v.strictObject({
  messages: v.record(v.string(), markSchema),
  queue: v.array(queuedSendSchema),
  sends: v.array(sendRecordSchema),
  primaryStage: v.picklist([0, 1, 2]),
  backupRemaining: integer,
  deliveredRequired: v.strictObject({
    weather: deliveredRequiredSchema,
    payroll: deliveredRequiredSchema,
    audit: deliveredRequiredSchema,
  }),
  auditRead: v.boolean(),
  auditDelivered: v.boolean(),
  ackAsOf: integer,
})

export type OutlookStateParsed = v.InferOutput<typeof outlookSaveSchema>
