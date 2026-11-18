// Pure channel math, delivery evaluation, and tiering for CRASH OUTLOOK.
// No engine imports beyond types. Every quantity is an integer: whole
// milliseconds for times, whole seconds for authored ETAs, whole counts
// for capacity. Nothing here touches Date, Math.random, or timers; the
// module calls these from validate and reduce.
import type { OutcomeTier } from '../../campaign/types'
import type { ChannelTuning } from './content'
import type {
  Channel,
  OutlookMessage,
  PrimaryStage,
  SendRecord,
} from './types'

export type SendValidity =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

/** The single rule for whether a send is legal against the live stage
 *  and remaining backup capacity. Primary is free and unlimited while the
 *  link is up (stages 0 and 1); a dark primary (stage 2) rejects. Backup
 *  spends one of its capacity and rejects once exhausted. Rejections cost
 *  nothing. */
export function validateSend(
  stage: PrimaryStage,
  channel: Channel,
  backupRemaining: number,
): SendValidity {
  if (channel === 'primary') {
    if (stage === 2) {
      return { ok: false, reason: 'PRIMARY LINK DARK. ROUTE OVER BACKUP.' }
    }
    return { ok: true }
  }
  if (backupRemaining <= 0) {
    return { ok: false, reason: 'BACKUP CAPACITY EXHAUSTED.' }
  }
  return { ok: true }
}

/** The acknowledgment time for a send: dispatch time plus the authored
 *  ETA for the channel at the CURRENT stage, converted to whole
 *  milliseconds. Primary ETA is indexed by the stage directly; the stage
 *  is narrowed to 0 or 1 here because validateSend rejects a stage-2
 *  (dark) primary before this path, so there is no silent stage-2 to
 *  stage-0 fallback. */
export function channelAckAt(
  sentAt: number,
  stage: PrimaryStage,
  channel: Channel,
  tuning: ChannelTuning,
): number {
  if (channel === 'backup') {
    return sentAt + tuning.backupEtaSeconds * 1000
  }
  if (stage !== 0 && stage !== 1) {
    throw new Error('outlook: primary ack requested at dark stage')
  }
  const stageIndex: 0 | 1 = stage
  return sentAt + tuning.primaryEtaSeconds[stageIndex] * 1000
}

/** A satisfied required delivery needs all of: the routed message is the
 *  current (non-superseded) version at send time, the recipient equals
 *  the authored correctRecipient, the acknowledgment was scheduled to
 *  land on time (scheduledAckAt <= endsAt), and the ack has ACTUALLY
 *  LANDED (resolution acknowledged). A pending send does not satisfy: its
 *  ack is in flight but not folded, so completion cannot fire until the
 *  ack actually arrives at the next wake at or after its ack time (or the
 *  endsAt settle tick folds an on-time ack before the timeout guard). A
 *  rejected send never satisfies. Wrong anything spends and logs but does
 *  not satisfy. */
export function isSatisfiedDelivery(
  send: SendRecord,
  message: OutlookMessage,
  endsAt: number,
): boolean {
  if (message.requiredKind === null) return false
  if (message.supersededBy !== null) return false
  if (!send.currentVersion) return false
  if (send.resolution !== 'acknowledged') return false
  if (send.scheduledAckAt > endsAt) return false
  if (send.recipient !== message.correctRecipient) return false
  return true
}

/** An acknowledged-but-wrong-desk delivery: the ack folded (resolution
 *  acknowledged) on the current version on time, but the routed recipient
 *  was not the authored correctRecipient. This is distinct from a
 *  never-delivered required kind, and the debrief reports it as DELIVERED
 *  TO WRONG DESK. It never counts toward tier. */
export function isAcknowledgedWrongDesk(
  send: SendRecord,
  message: OutlookMessage,
  endsAt: number,
): boolean {
  if (message.requiredKind === null) return false
  if (message.supersededBy !== null) return false
  if (!send.currentVersion) return false
  if (send.resolution !== 'acknowledged') return false
  if (send.scheduledAckAt > endsAt) return false
  return send.recipient !== message.correctRecipient
}

/** The count of distinct requiredKinds satisfied across the send log. A
 *  requiredKind counts at most once no matter how many sends satisfy it. */
export function countSatisfiedDeliveries(
  sends: readonly SendRecord[],
  messages: readonly OutlookMessage[],
  endsAt: number,
): number {
  const byId = new Map(messages.map((m) => [m.id, m]))
  const satisfiedKinds = new Set<string>()
  for (const send of sends) {
    const message = byId.get(send.messageId)
    if (!message || message.requiredKind === null) continue
    if (isSatisfiedDelivery(send, message, endsAt)) {
      satisfiedKinds.add(message.requiredKind)
    }
  }
  return satisfiedKinds.size
}

/** The tier ladder, shared by every settlement cause. */
export function tierFromSatisfied(count: number): OutcomeTier {
  if (count >= 3) return 'full'
  if (count === 2) return 'partial'
  if (count === 1) return 'poor'
  return 'failed'
}
