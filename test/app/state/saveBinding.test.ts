import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCampaign, encodeSave } from '@engine'
import { init, send, wake, getRecoveryFlag } from '@app/state'
import { SAVE_KEYS } from '@app/state/saveBinding'
import { buildCtx, memoryPort, resetAll } from './harness'

const START = 1_000_000
const [PRIMARY, BACKUP] = SAVE_KEYS

function freshSave(): string {
  return encodeSave(
    createCampaign(buildCtx(), 'test-seed', { extendedTime: false }, START),
  )
}

describe('save binding scheduling', () => {
  let port: ReturnType<typeof memoryPort>
  let teardown: () => void

  beforeEach(() => {
    resetAll()
    vi.useFakeTimers()
    vi.setSystemTime(START)
    port = memoryPort()
    teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port })
  })

  afterEach(() => {
    teardown()
    vi.useRealTimers()
  })

  it('debounces an ordinary action write (600 ms)', () => {
    send({ type: 'START_MISSION', missionId: 'alpha' }) // immediate
    delete port.store[PRIMARY]
    send({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
    vi.advanceTimersByTime(599)
    expect(port.store[PRIMARY]).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(port.store[PRIMARY]).toBeDefined()
  })

  it('flushes immediately on an irreversible action (START_MISSION)', () => {
    delete port.store[PRIMARY]
    send({ type: 'START_MISSION', missionId: 'alpha' })
    expect(port.store[PRIMARY]).toBeDefined() // no timer advance needed
  })

  it('flushes immediately on a settlement', () => {
    send({ type: 'START_MISSION', missionId: 'alpha' })
    delete port.store[PRIMARY]
    send({ type: 'FORFEIT_MISSION' }) // settles -> settlement event
    expect(port.store[PRIMARY]).toBeDefined()
  })

  it('visibilitychange to hidden flushes a pending debounced write', () => {
    send({ type: 'START_MISSION', missionId: 'alpha' })
    delete port.store[PRIMARY]
    send({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
    expect(port.store[PRIMARY]).toBeUndefined()
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(port.store[PRIMARY]).toBeDefined()
  })

  it('pagehide flushes a pending debounced write', () => {
    send({ type: 'START_MISSION', missionId: 'alpha' })
    delete port.store[PRIMARY]
    send({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
    expect(port.store[PRIMARY]).toBeUndefined()
    window.dispatchEvent(new Event('pagehide'))
    expect(port.store[PRIMARY]).toBeDefined()
  })

  it('lifecycle wakes coalesce and do not starve a pending ordinary write', () => {
    send({ type: 'START_MISSION', missionId: 'alpha' })
    delete port.store[PRIMARY]
    send({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } }) // debounce at +600
    vi.advanceTimersByTime(300)
    wake() // non-settlement wake: must NOT restart the debounce timer
    wake()
    vi.advanceTimersByTime(300) // reaches the original 600 ms window
    expect(port.store[PRIMARY]).toBeDefined()
  })
})

describe('recovery flag surfacing', () => {
  afterEach(() => {
    resetAll()
    vi.restoreAllMocks()
  })

  const bootWith = (seed: Record<string, string>): void => {
    resetAll()
    vi.spyOn(Date, 'now').mockReturnValue(START)
    init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort(seed) })
  }

  it('clean on an intact primary', () => {
    bootWith({ [PRIMARY]: freshSave() })
    expect(getRecoveryFlag()).toBe('clean')
  })

  it('recovered-backup when the primary is corrupt but backup is good', () => {
    bootWith({ [PRIMARY]: 'garbage', [BACKUP]: freshSave() })
    expect(getRecoveryFlag()).toBe('recovered-backup')
  })

  it('reset when both slots are corrupt', () => {
    bootWith({ [PRIMARY]: 'garbage', [BACKUP]: 'also garbage' })
    expect(getRecoveryFlag()).toBe('reset')
  })
})
