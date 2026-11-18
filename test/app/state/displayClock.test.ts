import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { init, send } from '@app/state'
import { remainingTime, tickOnce } from '@app/state/displayClock'
import { buildCtx, memoryPort, resetAll } from './harness'

describe('remainingTime (pure derivation)', () => {
  it('subtracts the monotonic perf delta from the deadline', () => {
    // endsAt 1000, engine lastNow 600, captured at perf 50, now perf 90.
    expect(remainingTime(1000, 600, 50, 90)).toBe(360)
  })

  it('never increases as perf advances (monotonic non-increasing)', () => {
    const a = remainingTime(5000, 1000, 0, 100)
    const b = remainingTime(5000, 1000, 0, 200)
    expect(b).toBeLessThan(a)
  })

  it('clamps at zero once the deadline has passed', () => {
    expect(remainingTime(100, 600, 50, 1000)).toBe(0)
  })

  it('reads no wall clock: a Date.now jump cannot change the result', () => {
    const spy = vi.spyOn(Date, 'now')
    remainingTime(1000, 600, 50, 90)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('display ticker does not drive the engine', () => {
  const START = 1_000_000
  let teardown: () => void

  beforeEach(() => {
    resetAll()
    vi.spyOn(Date, 'now').mockReturnValue(START)
    vi.spyOn(performance, 'now').mockReturnValue(0)
    teardown = init({
      ctx: buildCtx(),
      seedName: 'test-seed',
      port: memoryPort(),
    })
  })

  afterEach(() => {
    teardown()
    vi.restoreAllMocks()
  })

  it('does not self-wake while the deadline is still ahead', () => {
    send({ type: 'START_MISSION', missionId: 'alpha' })
    // perf.now stays at 0, deadline is 240s out: remaining > 0.
    const spy = vi.fn()
    tickOnce(spy)
    expect(spy).not.toHaveBeenCalled()
  })
})
