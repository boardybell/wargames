import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { init, send } from '@app/state'
import { getState } from '@app/state/store'
import { onEngineEvent } from '@app/state/events'
import { buildCtx, memoryPort, resetAll } from './harness'

let teardown: () => void

beforeEach(() => {
  resetAll()
  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
  teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort() })
})

afterEach(() => {
  teardown()
  vi.restoreAllMocks()
})

describe('send()', () => {
  it('wraps dispatch with a Date.now sample and updates the store', () => {
    expect(getState().activeMission).toBeNull()
    const result = send({ type: 'START_MISSION', missionId: 'alpha' })
    expect(result.rejected).toBe(false)
    expect(getState().activeMission?.missionId).toBe('alpha')
  })

  it('surfaces a rejection with no material change when no time has passed', () => {
    const before = getState()
    const events: string[] = []
    onEngineEvent((e) => events.push(e.type))
    // No active mission yet, and no time gap: a mission action is refused and
    // nothing material changes.
    const result = send({
      type: 'MISSION_ACTION',
      payload: { kind: 'DELIVER' },
    })
    expect(result.rejected).toBe(true)
    if (result.rejected) expect(typeof result.reason).toBe('string')
    expect(getState().lastNow).toBe(before.lastNow)
    expect(getState().activeMission).toBeNull()
    expect(events).toEqual([])
  })

  it('a rejection at the deadline boundary still relays the settlement', () => {
    // Start a mission, then send a rejectable action AFTER the deadline has
    // passed. The engine advances time first, settles the mission by timeout,
    // and emits a settlement even though the action itself is refused. That
    // settlement must not be swallowed.
    send({ type: 'START_MISSION', missionId: 'alpha' })
    const endsAt = getState().activeMission!.endsAt
    const events: string[] = []
    onEngineEvent((e) => events.push(e.type))
    vi.spyOn(Date, 'now').mockReturnValue(endsAt + 60_000)
    // ACKNOWLEDGE_DEBRIEF for a mission not yet in debrief is rejectable, but
    // the pre-reduce advance settles alpha by timeout first.
    const result = send({ type: 'START_MISSION', missionId: 'beta' })
    expect(result.rejected).toBe(true)
    expect(events).toContain('settlement')
    expect(getState().lastNow).toBe(endsAt + 60_000)
    expect(getState().settled.some((s) => s.cause === 'timeout')).toBe(true)
  })
})
