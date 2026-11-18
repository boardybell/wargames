diff --git a/src/engine/time/index.ts b/src/engine/time/index.ts
new file mode 100644
index 0000000..64d053a
--- /dev/null
+++ b/src/engine/time/index.ts
@@ -0,0 +1,139 @@
+// Time passes through exactly one door: advanceToNow. Wall clock
+// arrives as an argument, never ambiently; the lastNow high-water mark
+// makes backward system-clock jumps harmless; processed events leave
+// their queue, so catch-up is idempotent by construction.
+
+export type EventAnchor = 'start' | 'end'
+
+export interface ScheduledEventSpec {
+  readonly id: string
+  /** Seconds from mission start (anchor 'start', scales with extended
+   *  duration) or seconds before endsAt (anchor 'end', NEVER scales: a
+   *  30-second warning always fires at T minus 30). */
+  readonly offsetSeconds: number
+  readonly anchor: EventAnchor
+  readonly kind: string
+  readonly payload: unknown
+}
+
+export interface ScheduledEvent {
+  readonly id: string
+  /** Absolute epoch ms once materialized. */
+  readonly scheduledAt: number
+  readonly kind: string
+  readonly payload: unknown
+}
+
+export type MissionDuration = 'standard' | 'extended'
+
+export interface TimeSlice {
+  readonly lastNow: number
+  readonly missionQueue: readonly ScheduledEvent[]
+  readonly campaignQueue: readonly ScheduledEvent[]
+  readonly endsAt: number | null
+  readonly missionSettled: boolean
+}
+
+export type QueueName = 'mission' | 'campaign'
+
+export interface ProcessedEvent extends ScheduledEvent {
+  readonly queue: QueueName
+}
+
+export interface DrainResult {
+  readonly slice: TimeSlice
+  /** In (scheduledAt, id) order, tagged with the queue of origin so the
+   *  caller routes reducers and deletions correctly. */
+  readonly processed: readonly ProcessedEvent[]
+  /** True iff the timeout condition fired in this call; settlement
+   *  itself is the campaign layer's job and its settled flag is the
+   *  exactly-once guard. */
+  readonly timedOut: boolean
+}
+
+/** Safety rail only: missions are at most eight minutes. Spans beyond
+ *  the cap clamp, record the clamped lastNow, and leave later events
+ *  for the following wake. */
+export const CATCH_UP_CAP_MS = 30 * 60 * 1000
+
+function compareEvents(
+  a: { scheduledAt: number; id: string },
+  b: { scheduledAt: number; id: string },
+): number {
+  if (a.scheduledAt !== b.scheduledAt) return a.scheduledAt - b.scheduledAt
+  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
+}
+
+/** Standard: start-anchored at startNow + offset, endsAt = startNow +
+ *  standardDurationMs. Extended: duration doubles, start-anchored
+ *  offsets scale by two; end-anchored offsets always materialize as
+ *  endsAt - offset. All integer ms. */
+export function materializeSchedule(
+  specs: readonly ScheduledEventSpec[],
+  startNow: number,
+  duration: MissionDuration,
+  standardDurationMs: number,
+): { queue: ScheduledEvent[]; endsAt: number } {
+  if (!Number.isInteger(startNow) || !Number.isInteger(standardDurationMs)) {
+    throw new Error('time: startNow and standardDurationMs must be integers')
+  }
+  const scale = duration === 'extended' ? 2 : 1
+  const endsAt = startNow + standardDurationMs * scale
+  const queue = specs.map((spec) => {
+    if (!Number.isInteger(spec.offsetSeconds) || spec.offsetSeconds < 0) {
+      throw new Error(
+        `time: offsetSeconds must be a non-negative integer (${spec.id})`,
+      )
+    }
+    const scheduledAt =
+      spec.anchor === 'end'
+        ? endsAt - spec.offsetSeconds * 1000
+        : startNow + spec.offsetSeconds * 1000 * scale
+    return {
+      id: spec.id,
+      scheduledAt,
+      kind: spec.kind,
+      payload: spec.payload,
+    }
+  })
+  queue.sort(compareEvents)
+  return { queue, endsAt }
+}
+
+/** The only way time passes. Clamp now to the high-water mark and the
+ *  catch-up cap, drain both queues merged in (scheduledAt, id) order
+ *  deleting as processed, then report timeout if the deadline passed
+ *  with the mission unsettled. Pure: returns a new slice. */
+export function advanceToNow(slice: TimeSlice, rawNow: number): DrainResult {
+  const floor = Math.max(rawNow, slice.lastNow)
+  const now = Math.min(floor, slice.lastNow + CATCH_UP_CAP_MS)
+
+  const due: ProcessedEvent[] = []
+  const missionRemainder: ScheduledEvent[] = []
+  const campaignRemainder: ScheduledEvent[] = []
+
+  for (const event of slice.missionQueue) {
+    if (event.scheduledAt <= now) due.push({ ...event, queue: 'mission' })
+    else missionRemainder.push(event)
+  }
+  for (const event of slice.campaignQueue) {
+    if (event.scheduledAt <= now) due.push({ ...event, queue: 'campaign' })
+    else campaignRemainder.push(event)
+  }
+  due.sort(compareEvents)
+
+  const timedOut =
+    slice.endsAt !== null && !slice.missionSettled && now >= slice.endsAt
+
+  return {
+    slice: {
+      lastNow: now,
+      missionQueue: missionRemainder,
+      campaignQueue: campaignRemainder,
+      endsAt: slice.endsAt,
+      missionSettled: slice.missionSettled,
+    },
+    processed: due,
+    timedOut,
+  }
+}
diff --git a/test/engine/time/time.test.ts b/test/engine/time/time.test.ts
new file mode 100644
index 0000000..ea7a92a
--- /dev/null
+++ b/test/engine/time/time.test.ts
@@ -0,0 +1,201 @@
+import { describe, expect, it } from 'vitest'
+import {
+  CATCH_UP_CAP_MS,
+  advanceToNow,
+  materializeSchedule,
+} from '@engine/time'
+import type { ScheduledEventSpec, TimeSlice } from '@engine/time'
+import { stateHash } from '../harness/canonical'
+
+function deepFreeze<T>(value: T): T {
+  if (value && typeof value === 'object') {
+    for (const v of Object.values(value)) deepFreeze(v)
+    Object.freeze(value)
+  }
+  return value
+}
+
+const START = 1_000_000
+const STANDARD_MS = 240_000
+
+const specs: ScheduledEventSpec[] = [
+  { id: 'stage-1', offsetSeconds: 60, anchor: 'start', kind: 'stage', payload: null },
+  { id: 'stage-2', offsetSeconds: 120, anchor: 'start', kind: 'stage', payload: null },
+  { id: 'warn-30', offsetSeconds: 30, anchor: 'end', kind: 'warning', payload: null },
+  { id: 'warn-10', offsetSeconds: 10, anchor: 'end', kind: 'warning', payload: null },
+]
+
+function slice(overrides: Partial<TimeSlice> = {}): TimeSlice {
+  const { queue, endsAt } = materializeSchedule(specs, START, 'standard', STANDARD_MS)
+  return {
+    lastNow: START,
+    missionQueue: queue,
+    campaignQueue: [],
+    endsAt,
+    missionSettled: false,
+    ...overrides,
+  }
+}
+
+describe('materializeSchedule', () => {
+  it('materializes start-anchored offsets and endsAt for standard duration', () => {
+    const { queue, endsAt } = materializeSchedule(specs, START, 'standard', STANDARD_MS)
+    expect(endsAt).toBe(START + 240_000)
+    const byId = Object.fromEntries(queue.map((e) => [e.id, e.scheduledAt]))
+    expect(byId['stage-1']).toBe(START + 60_000)
+    expect(byId['stage-2']).toBe(START + 120_000)
+  })
+
+  it('end-anchored offsets anchor to endsAt and NEVER scale under extended time', () => {
+    const std = materializeSchedule(specs, START, 'standard', STANDARD_MS)
+    const ext = materializeSchedule(specs, START, 'extended', STANDARD_MS)
+    expect(ext.endsAt).toBe(START + 480_000)
+    const stdById = Object.fromEntries(std.queue.map((e) => [e.id, e.scheduledAt]))
+    const extById = Object.fromEntries(ext.queue.map((e) => [e.id, e.scheduledAt]))
+    expect(stdById['warn-30']).toBe(std.endsAt - 30_000)
+    expect(extById['warn-30']).toBe(ext.endsAt - 30_000)
+    expect(extById['warn-10']).toBe(ext.endsAt - 10_000)
+    expect(extById['stage-1']).toBe(START + 120_000)
+    expect(extById['stage-2']).toBe(START + 240_000)
+  })
+
+  it('returns the queue sorted by (scheduledAt, id)', () => {
+    const { queue } = materializeSchedule(specs, START, 'standard', STANDARD_MS)
+    const keys = queue.map((e) => [e.scheduledAt, e.id] as const)
+    const sorted = [...keys].sort((a, b) =>
+      a[0] !== b[0] ? a[0] - b[0] : a[1] < b[1] ? -1 : 1,
+    )
+    expect(keys).toEqual(sorted)
+  })
+
+  it('rejects non-integer inputs', () => {
+    expect(() =>
+      materializeSchedule(
+        [{ id: 'x', offsetSeconds: 1.5, anchor: 'start', kind: 'k', payload: null }],
+        START,
+        'standard',
+        STANDARD_MS,
+      ),
+    ).toThrow(/integer/)
+  })
+})
+
+describe('advanceToNow drain discipline', () => {
+  it('drains due events from both queues merged in (scheduledAt, id) order', () => {
+    const s = slice({
+      campaignQueue: [
+        { id: 'a-desk', scheduledAt: START + 60_000, kind: 'desk', payload: null },
+        { id: 'z-desk', scheduledAt: START + 90_000, kind: 'desk', payload: null },
+      ],
+    })
+    const result = advanceToNow(s, START + 120_000)
+    expect(result.processed.map((e) => e.id)).toEqual([
+      'a-desk',
+      'stage-1',
+      'z-desk',
+      'stage-2',
+    ])
+    expect(result.processed.map((e) => e.queue)).toEqual([
+      'campaign',
+      'mission',
+      'campaign',
+      'mission',
+    ])
+  })
+
+  it('breaks scheduledAt ties by id', () => {
+    const s = slice({
+      campaignQueue: [
+        { id: 'aaa', scheduledAt: START + 60_000, kind: 'desk', payload: null },
+      ],
+    })
+    const result = advanceToNow(s, START + 60_000)
+    expect(result.processed.map((e) => e.id)).toEqual(['aaa', 'stage-1'])
+  })
+
+  it('deletes processed events: a double wake drains nothing the second time', () => {
+    const first = advanceToNow(slice(), START + 120_000)
+    const second = advanceToNow(first.slice, START + 120_000)
+    expect(second.processed).toEqual([])
+    expect(stateHash(second.slice)).toBe(stateHash(first.slice))
+  })
+
+  it('clamps a backward now to lastNow: nothing un-fires, lastNow never decreases', () => {
+    const first = advanceToNow(slice(), START + 120_000)
+    const back = advanceToNow(first.slice, START + 30_000)
+    expect(back.processed).toEqual([])
+    expect(back.slice.lastNow).toBe(START + 120_000)
+    expect(stateHash(back.slice)).toBe(stateHash(first.slice))
+  })
+
+  it('is pure and frozen-input safe', () => {
+    const s = deepFreeze(slice())
+    const before = stateHash(s)
+    const result = advanceToNow(s, START + 120_000)
+    expect(stateHash(s)).toBe(before)
+    expect(result.slice).not.toBe(s)
+  })
+})
+
+describe('timeout settlement', () => {
+  it('reports timeout exactly once when now passes endsAt', () => {
+    const first = advanceToNow(slice(), START + 300_000)
+    expect(first.timedOut).toBe(true)
+    const settled = { ...first.slice, missionSettled: true }
+    const second = advanceToNow(settled, START + 310_000)
+    expect(second.timedOut).toBe(false)
+  })
+
+  it('drains due events before reporting timeout in the same call', () => {
+    const result = advanceToNow(slice(), START + 400_000)
+    expect(result.processed.map((e) => e.id)).toEqual([
+      'stage-1',
+      'stage-2',
+      'warn-30',
+      'warn-10',
+    ])
+    expect(result.timedOut).toBe(true)
+  })
+
+  it('an event scheduled exactly at endsAt drains before the timeout guard', () => {
+    const s = slice({
+      campaignQueue: [
+        {
+          id: 'buzzer',
+          scheduledAt: START + STANDARD_MS,
+          kind: 'ack',
+          payload: null,
+        },
+      ],
+    })
+    const result = advanceToNow(s, START + STANDARD_MS)
+    expect(result.processed.some((e) => e.id === 'buzzer')).toBe(true)
+    expect(result.timedOut).toBe(true)
+  })
+
+  it('does not report timeout when endsAt is null', () => {
+    const result = advanceToNow(
+      slice({ endsAt: null, missionQueue: [] }),
+      START + 900_000,
+    )
+    expect(result.timedOut).toBe(false)
+  })
+})
+
+describe('catch-up cap', () => {
+  it('clamps spans beyond the cap and records the clamped lastNow', () => {
+    const far = START + CATCH_UP_CAP_MS + 600_000
+    const beyond = {
+      id: 'later',
+      scheduledAt: START + CATCH_UP_CAP_MS + 300_000,
+      kind: 'desk',
+      payload: null,
+    }
+    const s = slice({ campaignQueue: [beyond], missionQueue: [], endsAt: null })
+    const first = advanceToNow(s, far)
+    expect(first.slice.lastNow).toBe(START + CATCH_UP_CAP_MS)
+    expect(first.processed).toEqual([])
+    const second = advanceToNow(first.slice, far)
+    expect(second.processed.map((e) => e.id)).toEqual(['later'])
+  })
+})
