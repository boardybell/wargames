import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { init, getMultiTabNotice, send } from '@app/state'
import { isPaused } from '@app/state/saveBinding'
import { SAVE_KEYS } from '@app/state/saveBinding'
import { buildCtx, memoryPort, resetAll } from './harness'

const START = 1_000_000
let teardown: () => void

beforeEach(() => {
  resetAll()
  vi.spyOn(Date, 'now').mockReturnValue(START)
  teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort() })
})

afterEach(() => {
  teardown()
  vi.restoreAllMocks()
})

describe('multi-tab', () => {
  it('a foreign save-key storage event raises the notice and pauses writes', () => {
    expect(getMultiTabNotice()).toBe(false)
    const event = new Event('storage') as StorageEvent
    Object.defineProperty(event, 'key', { value: SAVE_KEYS[0] })
    window.dispatchEvent(event)
    expect(getMultiTabNotice()).toBe(true)
    expect(isPaused()).toBe(true)
  })

  it('ignores storage events for unrelated keys', () => {
    const event = new Event('storage') as StorageEvent
    Object.defineProperty(event, 'key', { value: 'some.other.key' })
    window.dispatchEvent(event)
    expect(getMultiTabNotice()).toBe(false)
    expect(isPaused()).toBe(false)
  })

  it('once paused, local writes do not reach the port', () => {
    const port = memoryPort()
    resetAll()
    vi.spyOn(Date, 'now').mockReturnValue(START)
    const down = init({ ctx: buildCtx(), seedName: 'test-seed', port })
    const event = new Event('storage') as StorageEvent
    Object.defineProperty(event, 'key', { value: SAVE_KEYS[1] })
    window.dispatchEvent(event)
    delete port.store[SAVE_KEYS[0]]
    send({ type: 'START_MISSION', missionId: 'alpha' }) // immediate flush attempt
    expect(port.store[SAVE_KEYS[0]]).toBeUndefined()
    down()
  })
})
