import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { registerWarnings } from '@app/audio'
import { relayEvents, __resetConsumers } from '@app/state/events'
import { installMockAudio, resetAudio, type MockContext } from './harness'

let ctx: MockContext
let unregister: () => void

beforeEach(() => {
  resetAudio()
  __resetConsumers()
  ctx = installMockAudio('running').ctx
  unregister = registerWarnings()
})

afterEach(() => {
  unregister()
  __resetConsumers()
  resetAudio()
})

describe('timer warnings', () => {
  it('a relayed timerMilestone fires its warning cue exactly once', () => {
    const before = ctx.sources.length
    relayEvents([{ type: 'timerMilestone', id: 'warn-30' }])
    expect(ctx.sources.length).toBeGreaterThan(before)
    const after = ctx.sources.length
    // Double-delivering the same milestone id does not fire a second time.
    relayEvents([{ type: 'timerMilestone', id: 'warn-30' }])
    expect(ctx.sources.length).toBe(after)
  })

  it('no warning fires without an emitted event (no wall-clock path)', () => {
    expect(ctx.sources.length).toBe(0)
  })

  it('a non-warning event fires no cue', () => {
    const before = ctx.sources.length
    relayEvents([{ type: 'debriefAcknowledged', missionId: 'alpha' }])
    expect(ctx.sources.length).toBe(before)
  })

  it('a phase change clears the guard so the same milestone id warns next mission', () => {
    relayEvents([{ type: 'timerMilestone', id: 'warn-30' }])
    const afterFirst = ctx.sources.length
    expect(afterFirst).toBeGreaterThan(0)
    // Same id again this mission: suppressed.
    relayEvents([{ type: 'timerMilestone', id: 'warn-30' }])
    expect(ctx.sources.length).toBe(afterFirst)
    // Mission boundary: the engine reuses the id, so the guard must reset.
    relayEvents([{ type: 'phaseChanged', from: 'mission', to: 'debrief' }])
    relayEvents([{ type: 'timerMilestone', id: 'warn-30' }])
    expect(ctx.sources.length).toBeGreaterThan(afterFirst)
  })
})
