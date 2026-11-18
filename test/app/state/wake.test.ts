import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { init, send, wake } from '@app/state'
import { getState } from '@app/state/store'
import { tickOnce } from '@app/state/displayClock'
import { buildCtx, memoryPort, resetAll } from './harness'

const START = 1_000_000
const nowRef = { value: START }
const perfRef = { value: 0 }
let teardown: () => void

beforeEach(() => {
  resetAll()
  nowRef.value = START
  perfRef.value = 0
  vi.spyOn(Date, 'now').mockImplementation(() => nowRef.value)
  vi.spyOn(performance, 'now').mockImplementation(() => perfRef.value)
  teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort() })
})

afterEach(() => {
  teardown()
  vi.restoreAllMocks()
})

describe('wake()', () => {
  it('advances the engine clock to Date.now and updates the store', () => {
    send({ type: 'START_MISSION', missionId: 'alpha' })
    nowRef.value = START + 5_000
    wake()
    expect(getState().lastNow).toBe(START + 5_000)
  })

  it('is wired to visibilitychange, pageshow(persisted), and focus', () => {
    const fire = (make: () => void): number => {
      nowRef.value += 1_000
      make()
      return getState().lastNow
    }
    expect(
      fire(() => document.dispatchEvent(new Event('visibilitychange'))),
    ).toBe(nowRef.value)
    expect(
      fire(() => {
        const e = new Event('pageshow')
        Object.defineProperty(e, 'persisted', { value: true })
        window.dispatchEvent(e)
      }),
    ).toBe(nowRef.value)
    expect(fire(() => window.dispatchEvent(new Event('focus')))).toBe(
      nowRef.value,
    )
  })
})

describe('self-wake guard (per endsAt instance)', () => {
  it('prevents a second self-wake for the same endsAt', () => {
    send({ type: 'START_MISSION', missionId: 'alpha' })
    perfRef.value = 10_000_000 // far past the deadline
    const spy = vi.fn()
    tickOnce(spy)
    tickOnce(spy)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('does not re-fire every frame while the settled mission stays active', () => {
    // After a timeout the engine keeps activeMission non-null until the
    // debrief is acknowledged, so activeDeadline keeps returning the same
    // endsAt. The guard must still fire exactly once across many frames.
    send({ type: 'START_MISSION', missionId: 'alpha' })
    perfRef.value = 10_000_000
    const spy = vi.fn()
    for (let i = 0; i < 10; i++) tickOnce(spy)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('a later deadline with a different endsAt still self-wakes', () => {
    send({ type: 'START_MISSION', missionId: 'alpha' })
    perfRef.value = 10_000_000
    const first = vi.fn()
    tickOnce(first)
    expect(first).toHaveBeenCalledTimes(1)
    // A new mission with a later start has a different endsAt (new key).
    nowRef.value = START + 50_000
    send({ type: 'FORFEIT_MISSION' })
    send({ type: 'ACKNOWLEDGE_DEBRIEF', missionId: 'alpha' })
    send({ type: 'START_MISSION', missionId: 'beta' })
    perfRef.value = 20_000_000
    const second = vi.fn()
    tickOnce(second)
    expect(second).toHaveBeenCalledTimes(1)
  })
})
