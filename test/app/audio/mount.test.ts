import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mountAudio, currentGeneration, enqueue } from '@app/audio'
import { relayEvents, __resetConsumers } from '@app/state/events'
import { installMockAudio, resetAudio, type MockContext } from './harness'

let ctx: MockContext
let teardown: () => void

beforeEach(() => {
  resetAudio()
  __resetConsumers()
  ctx = installMockAudio('running').ctx
  teardown = mountAudio()
})

afterEach(() => {
  teardown()
  __resetConsumers()
  resetAudio()
})

describe('mountAudio bootstrap', () => {
  it('subscribes warnings to the engine relay so a milestone fires a cue', () => {
    const before = ctx.sources.length
    relayEvents([{ type: 'timerMilestone', id: 'warn-10' }])
    expect(ctx.sources.length).toBeGreaterThan(before)
  })

  it('advances the generation token on a phase change', () => {
    const before = currentGeneration()
    relayEvents([{ type: 'phaseChanged', from: 'menu', to: 'mission' }])
    expect(currentGeneration()).toBe(before + 1)
  })

  it('a phase change drops a cue queued under the prior token', () => {
    enqueue('confirm') // captures the current token
    const before = ctx.sources.length
    // The phase change increments the token and drains: the stale cue drops.
    relayEvents([{ type: 'phaseChanged', from: 'menu', to: 'mission' }])
    expect(ctx.sources.length).toBe(before)
  })

  it('teardown unsubscribes: a later milestone fires nothing', () => {
    teardown()
    const before = ctx.sources.length
    relayEvents([{ type: 'timerMilestone', id: 'warn-10' }])
    expect(ctx.sources.length).toBe(before)
  })
})
