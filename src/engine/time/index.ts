// Time passes through exactly one door: advanceToNow. Wall clock
// arrives as an argument, never ambiently; the lastNow high-water mark
// makes backward system-clock jumps harmless; processed events leave
// their queue, so catch-up is idempotent by construction.

export type EventAnchor = 'start' | 'end'

export interface ScheduledEventSpec {
  readonly id: string
  /** Seconds from mission start (anchor 'start', scales with extended
   *  duration) or seconds before endsAt (anchor 'end', NEVER scales: a
   *  30-second warning always fires at T minus 30). */
  readonly offsetSeconds: number
  readonly anchor: EventAnchor
  readonly kind: string
  readonly payload: unknown
}

export interface ScheduledEvent {
  readonly id: string
  /** Absolute epoch ms once materialized. */
  readonly scheduledAt: number
  readonly kind: string
  readonly payload: unknown
}

export type MissionDuration = 'standard' | 'extended'

export interface TimeSlice {
  readonly lastNow: number
  readonly missionQueue: readonly ScheduledEvent[]
  readonly campaignQueue: readonly ScheduledEvent[]
  readonly endsAt: number | null
  readonly missionSettled: boolean
}

export type QueueName = 'mission' | 'campaign'

export interface ProcessedEvent extends ScheduledEvent {
  readonly queue: QueueName
}

export interface DrainResult {
  readonly slice: TimeSlice
  /** In (scheduledAt, id) order, tagged with the queue of origin so the
   *  caller routes reducers and deletions correctly. */
  readonly processed: readonly ProcessedEvent[]
  /** True iff the timeout condition fired in this call; settlement
   *  itself is the campaign layer's job and its settled flag is the
   *  exactly-once guard. */
  readonly timedOut: boolean
}

/** Safety rail only: missions are at most eight minutes. Spans beyond
 *  the cap clamp, record the clamped lastNow, and leave later events
 *  for the following wake. */
export const CATCH_UP_CAP_MS = 30 * 60 * 1000

function compareEvents(
  a: { scheduledAt: number; id: string },
  b: { scheduledAt: number; id: string },
): number {
  if (a.scheduledAt !== b.scheduledAt) return a.scheduledAt - b.scheduledAt
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Standard: start-anchored at startNow + offset, endsAt = startNow +
 *  standardDurationMs. Extended: duration doubles, start-anchored
 *  offsets scale by two; end-anchored offsets always materialize as
 *  endsAt - offset. All integer ms. */
export function materializeSchedule(
  specs: readonly ScheduledEventSpec[],
  startNow: number,
  duration: MissionDuration,
  standardDurationMs: number,
): { queue: ScheduledEvent[]; endsAt: number } {
  if (!Number.isInteger(startNow) || !Number.isInteger(standardDurationMs)) {
    throw new Error('time: startNow and standardDurationMs must be integers')
  }
  const scale = duration === 'extended' ? 2 : 1
  const endsAt = startNow + standardDurationMs * scale
  const seen = new Set<string>()
  const queue = specs.map((spec) => {
    if (seen.has(spec.id)) {
      throw new Error(`time: duplicate event id ${spec.id}`)
    }
    seen.add(spec.id)
    if (!Number.isInteger(spec.offsetSeconds) || spec.offsetSeconds < 0) {
      throw new Error(
        `time: offsetSeconds must be a non-negative integer (${spec.id})`,
      )
    }
    const scheduledAt =
      spec.anchor === 'end'
        ? endsAt - spec.offsetSeconds * 1000
        : startNow + spec.offsetSeconds * 1000 * scale
    if (scheduledAt < startNow) {
      throw new Error(
        `time: end-anchored offset exceeds mission duration (${spec.id})`,
      )
    }
    return {
      id: spec.id,
      scheduledAt,
      kind: spec.kind,
      payload: spec.payload,
    }
  })
  queue.sort(compareEvents)
  return { queue, endsAt }
}

/** The only way time passes. Clamp now to the high-water mark and the
 *  catch-up cap, drain both queues merged in (scheduledAt, id) order
 *  (full ties resolve mission before campaign) deleting as processed,
 *  then report timeout if the deadline passed with the mission
 *  unsettled. Pure: returns a new slice. The plan's optional onTimeout
 *  callback was dropped in favor of the timedOut flag alone; the
 *  campaign layer sequences settlement from the flag, and its settled
 *  flag is the exactly-once guard (timedOut stays true on repeat calls
 *  until the caller settles). */
export function advanceToNow(slice: TimeSlice, rawNow: number): DrainResult {
  if (!Number.isInteger(rawNow)) {
    throw new Error(`time: rawNow must be an integer, got ${rawNow}`)
  }
  const floor = Math.max(rawNow, slice.lastNow)
  const now = Math.min(floor, slice.lastNow + CATCH_UP_CAP_MS)

  const due: ProcessedEvent[] = []
  const missionRemainder: ScheduledEvent[] = []
  const campaignRemainder: ScheduledEvent[] = []

  for (const event of slice.missionQueue) {
    if (event.scheduledAt <= now) due.push({ ...event, queue: 'mission' })
    else missionRemainder.push(event)
  }
  for (const event of slice.campaignQueue) {
    if (event.scheduledAt <= now) due.push({ ...event, queue: 'campaign' })
    else campaignRemainder.push(event)
  }
  // Stable sort plus mission-first insertion makes mission-before-
  // campaign the documented rule on full (scheduledAt, id) ties.
  due.sort(compareEvents)

  const timedOut =
    slice.endsAt !== null && !slice.missionSettled && now >= slice.endsAt

  return {
    slice: {
      lastNow: now,
      missionQueue: missionRemainder,
      campaignQueue: campaignRemainder,
      endsAt: slice.endsAt,
      missionSettled: slice.missionSettled,
    },
    processed: due,
    timedOut,
  }
}
