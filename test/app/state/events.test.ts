import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { init, send, wake } from '@app/state'
import { onEngineEvent } from '@app/state/events'
import type { EngineEvent } from '@engine'
import { buildCtx, memoryPort, resetAll } from './harness'

const START = 1_000_000
const nowRef = { value: START }
let teardown: () => void

beforeEach(() => {
  resetAll()
  nowRef.value = START
  vi.spyOn(Date, 'now').mockImplementation(() => nowRef.value)
  teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort() })
})

afterEach(() => {
  teardown()
  vi.restoreAllMocks()
})

describe('emitted relay', () => {
  it('relays a settlement to every registered consumer exactly once', () => {
    const a: EngineEvent[] = []
    const b: EngineEvent[] = []
    onEngineEvent((e) => a.push(e))
    onEngineEvent((e) => b.push(e))
    send({ type: 'START_MISSION', missionId: 'alpha' })
    send({ type: 'FORFEIT_MISSION' })
    expect(a.filter((e) => e.type === 'settlement')).toHaveLength(1)
    expect(b.filter((e) => e.type === 'settlement')).toHaveLength(1)
  })

  it('a catch-up wake relays the crossed timerMilestone events in order, once', () => {
    send({ type: 'START_MISSION', missionId: 'alpha' })
    const seen: string[] = []
    onEngineEvent((e) => {
      if (e.type === 'timerMilestone') seen.push(e.id)
    })
    // Cross warn-30 (endsAt-30s) and warn-10 (endsAt-10s) without expiring.
    nowRef.value = START + 240_000 - 5_000
    wake()
    expect(seen).toEqual(['warn-30', 'warn-10'])
  })

  it('a second wake with the same now relays no events', () => {
    send({ type: 'START_MISSION', missionId: 'alpha' })
    nowRef.value = START + 240_000 - 5_000
    wake()
    const after: string[] = []
    onEngineEvent((e) => after.push(e.type))
    wake()
    expect(after).toEqual([])
  })
})
