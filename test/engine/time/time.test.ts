import { describe, expect, it } from 'vitest'
import {
  CATCH_UP_CAP_MS,
  advanceToNow,
  materializeSchedule,
} from '@engine/time'
import type { ScheduledEventSpec, TimeSlice } from '@engine/time'
import { stateHash } from '../harness/canonical'

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v)
    Object.freeze(value)
  }
  return value
}

const START = 1_000_000
const STANDARD_MS = 240_000

const specs: ScheduledEventSpec[] = [
  { id: 'stage-1', offsetSeconds: 60, anchor: 'start', kind: 'stage', payload: null },
  { id: 'stage-2', offsetSeconds: 120, anchor: 'start', kind: 'stage', payload: null },
  { id: 'warn-30', offsetSeconds: 30, anchor: 'end', kind: 'timerMilestone', payload: null },
  { id: 'warn-10', offsetSeconds: 10, anchor: 'end', kind: 'timerMilestone', payload: null },
]

function slice(overrides: Partial<TimeSlice> = {}): TimeSlice {
  const { queue, endsAt } = materializeSchedule(specs, START, 'standard', STANDARD_MS)
  return {
    lastNow: START,
    missionQueue: queue,
    campaignQueue: [],
    endsAt,
    missionSettled: false,
    ...overrides,
  }
}

describe('materializeSchedule', () => {
  it('materializes start-anchored offsets and endsAt for standard duration', () => {
    const { queue, endsAt } = materializeSchedule(specs, START, 'standard', STANDARD_MS)
    expect(endsAt).toBe(START + 240_000)
    const byId = Object.fromEntries(queue.map((e) => [e.id, e.scheduledAt]))
    expect(byId['stage-1']).toBe(START + 60_000)
    expect(byId['stage-2']).toBe(START + 120_000)
  })

  it('end-anchored offsets anchor to endsAt and NEVER scale under extended time', () => {
    const std = materializeSchedule(specs, START, 'standard', STANDARD_MS)
    const ext = materializeSchedule(specs, START, 'extended', STANDARD_MS)
    expect(ext.endsAt).toBe(START + 480_000)
    const stdById = Object.fromEntries(std.queue.map((e) => [e.id, e.scheduledAt]))
    const extById = Object.fromEntries(ext.queue.map((e) => [e.id, e.scheduledAt]))
    expect(stdById['warn-30']).toBe(std.endsAt - 30_000)
    expect(extById['warn-30']).toBe(ext.endsAt - 30_000)
    expect(extById['warn-10']).toBe(ext.endsAt - 10_000)
    expect(extById['stage-1']).toBe(START + 120_000)
    expect(extById['stage-2']).toBe(START + 240_000)
  })

  it('returns the queue sorted by (scheduledAt, id)', () => {
    const { queue } = materializeSchedule(specs, START, 'standard', STANDARD_MS)
    const keys = queue.map((e) => [e.scheduledAt, e.id] as const)
    const sorted = [...keys].sort((a, b) =>
      a[0] !== b[0] ? a[0] - b[0] : a[1] < b[1] ? -1 : 1,
    )
    expect(keys).toEqual(sorted)
  })

  it('rejects non-integer inputs', () => {
    expect(() =>
      materializeSchedule(
        [{ id: 'x', offsetSeconds: 1.5, anchor: 'start', kind: 'k', payload: null }],
        START,
        'standard',
        STANDARD_MS,
      ),
    ).toThrow(/integer/)
  })

  it('rejects duplicate ids and end-anchored offsets beyond the duration', () => {
    expect(() =>
      materializeSchedule([specs[0]!, { ...specs[1]!, id: 'stage-1' }], START, 'standard', STANDARD_MS),
    ).toThrow(/duplicate/)
    expect(() =>
      materializeSchedule(
        [{ id: 'huge', offsetSeconds: 999, anchor: 'end', kind: 'k', payload: null }],
        START,
        'standard',
        STANDARD_MS,
      ),
    ).toThrow(/exceeds mission duration/)
  })

  it('accepts deep-frozen specs without mutating them', () => {
    const frozen = deepFreeze(specs.map((s) => ({ ...s })))
    expect(() =>
      materializeSchedule(frozen, START, 'standard', STANDARD_MS),
    ).not.toThrow()
  })

  it('a materialized slice survives a JSON round trip deep-equal', () => {
    const s = slice()
    expect(JSON.parse(JSON.stringify(s))).toEqual(s)
  })
})

describe('advanceToNow drain discipline', () => {
  it('drains due events from both queues merged in (scheduledAt, id) order', () => {
    const s = slice({
      campaignQueue: [
        { id: 'a-desk', scheduledAt: START + 60_000, kind: 'desk', payload: null },
        { id: 'z-desk', scheduledAt: START + 90_000, kind: 'desk', payload: null },
      ],
    })
    const result = advanceToNow(s, START + 120_000)
    expect(result.processed.map((e) => e.id)).toEqual([
      'a-desk',
      'stage-1',
      'z-desk',
      'stage-2',
    ])
    expect(result.processed.map((e) => e.queue)).toEqual([
      'campaign',
      'mission',
      'campaign',
      'mission',
    ])
  })

  it('breaks scheduledAt ties by id', () => {
    const s = slice({
      campaignQueue: [
        { id: 'aaa', scheduledAt: START + 60_000, kind: 'desk', payload: null },
      ],
    })
    const result = advanceToNow(s, START + 60_000)
    expect(result.processed.map((e) => e.id)).toEqual(['aaa', 'stage-1'])
  })

  it('deletes processed events: a double wake drains nothing the second time', () => {
    const first = advanceToNow(slice(), START + 120_000)
    const second = advanceToNow(first.slice, START + 120_000)
    expect(second.processed).toEqual([])
    expect(stateHash(second.slice)).toBe(stateHash(first.slice))
  })

  it('clamps a backward now to lastNow: nothing un-fires, lastNow never decreases', () => {
    const first = advanceToNow(slice(), START + 120_000)
    const back = advanceToNow(first.slice, START + 30_000)
    expect(back.processed).toEqual([])
    expect(back.slice.lastNow).toBe(START + 120_000)
    expect(stateHash(back.slice)).toBe(stateHash(first.slice))
  })

  it('is pure and frozen-input safe', () => {
    const s = deepFreeze(slice())
    const before = stateHash(s)
    const result = advanceToNow(s, START + 120_000)
    expect(stateHash(s)).toBe(before)
    expect(result.slice).not.toBe(s)
  })
})

describe('timeout settlement', () => {
  it('reports timeout exactly once when now passes endsAt', () => {
    const first = advanceToNow(slice(), START + 300_000)
    expect(first.timedOut).toBe(true)
    const settled = { ...first.slice, missionSettled: true }
    const second = advanceToNow(settled, START + 310_000)
    expect(second.timedOut).toBe(false)
  })

  it('drains due events before reporting timeout in the same call', () => {
    const result = advanceToNow(slice(), START + 400_000)
    expect(result.processed.map((e) => e.id)).toEqual([
      'stage-1',
      'stage-2',
      'warn-30',
      'warn-10',
    ])
    expect(result.timedOut).toBe(true)
  })

  it('an event scheduled exactly at endsAt drains before the timeout guard', () => {
    const s = slice({
      campaignQueue: [
        {
          id: 'buzzer',
          scheduledAt: START + STANDARD_MS,
          kind: 'ack',
          payload: null,
        },
      ],
    })
    const result = advanceToNow(s, START + STANDARD_MS)
    expect(result.processed.some((e) => e.id === 'buzzer')).toBe(true)
    expect(result.timedOut).toBe(true)
  })

  it('does not report timeout when endsAt is null', () => {
    const result = advanceToNow(
      slice({ endsAt: null, missionQueue: [] }),
      START + 900_000,
    )
    expect(result.timedOut).toBe(false)
  })
})

describe('timeout contract details', () => {
  it('rejects a non-integer rawNow before it can freeze the clock', () => {
    expect(() => advanceToNow(slice(), NaN)).toThrow(/integer/)
    expect(() => advanceToNow(slice(), 1.5)).toThrow(/integer/)
  })

  it('timedOut stays true on repeat advances until the caller settles', () => {
    const first = advanceToNow(slice(), START + 300_000)
    expect(first.timedOut).toBe(true)
    const second = advanceToNow(first.slice, START + 301_000)
    expect(second.timedOut).toBe(true)
    const third = advanceToNow(
      { ...second.slice, missionSettled: true },
      START + 302_000,
    )
    expect(third.timedOut).toBe(false)
  })

  it('timeout compares against the clamped now, not rawNow', () => {
    const farDeadline = START + CATCH_UP_CAP_MS + 120_000
    const s = slice({ endsAt: farDeadline, missionQueue: [] })
    const first = advanceToNow(s, farDeadline + 1)
    expect(first.timedOut).toBe(false)
    expect(first.slice.lastNow).toBe(START + CATCH_UP_CAP_MS)
    const second = advanceToNow(first.slice, farDeadline + 1)
    expect(second.timedOut).toBe(true)
  })
})

describe('catch-up cap', () => {
  it('clamps spans beyond the cap and records the clamped lastNow', () => {
    const far = START + CATCH_UP_CAP_MS + 600_000
    const beyond = {
      id: 'later',
      scheduledAt: START + CATCH_UP_CAP_MS + 300_000,
      kind: 'desk',
      payload: null,
    }
    const s = slice({ campaignQueue: [beyond], missionQueue: [], endsAt: null })
    const first = advanceToNow(s, far)
    expect(first.slice.lastNow).toBe(START + CATCH_UP_CAP_MS)
    expect(first.processed).toEqual([])
    const second = advanceToNow(first.slice, far)
    expect(second.processed.map((e) => e.id)).toEqual(['later'])
  })
})
