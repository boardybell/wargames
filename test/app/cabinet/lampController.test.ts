import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LampController, INITIAL_LAMP_STATE } from '@app/cabinet'
import { relayEvents, __resetConsumers } from '@app/state/events'
import type { EngineEvent } from '@engine'

let controller: LampController
let teardown: () => void

beforeEach(() => {
  __resetConsumers()
  controller = new LampController()
  teardown = controller.register()
})
afterEach(() => {
  teardown()
  __resetConsumers()
})

const settlement = (tier: 'full' | 'failed'): EngineEvent => ({
  type: 'settlement',
  missionId: 'alpha',
  cause: tier === 'failed' ? 'timeout' : 'completed',
  tier,
})

describe('LampController mapping', () => {
  it('phaseChanged moves the phase bank', () => {
    relayEvents([{ type: 'phaseChanged', from: 'menu', to: 'mission' }])
    expect(controller.getState().phase).toBe('mission')
  })

  it('settlement lights the good or bad settlement lamp by tier', () => {
    relayEvents([settlement('full')])
    expect(controller.getState().settlement).toBe('good')
    relayEvents([settlement('failed')])
    expect(controller.getState().settlement).toBe('bad')
  })

  it('branchRunCompleted lights the branch bank', () => {
    relayEvents([{ type: 'branchRunCompleted', branch: 'staged' }])
    expect(controller.getState().branchComplete).toBe(true)
  })

  it('finaleFinalPhase raises the alarm', () => {
    relayEvents([{ type: 'finaleFinalPhase' }])
    expect(controller.getState().alarm).toBe(true)
  })

  it('no event leaves bank state untouched', () => {
    expect(controller.getState()).toEqual(INITIAL_LAMP_STATE)
    // An ignored event kind changes nothing.
    relayEvents([{ type: 'clueFound', clueId: 'x' }])
    expect(controller.getState()).toEqual(INITIAL_LAMP_STATE)
  })

  it('the red alarm activates only on finaleFinalPhase, not on a failed settlement', () => {
    relayEvents([settlement('failed')])
    expect(controller.getState().alarm).toBe(false)
    relayEvents([
      { type: 'phaseChanged', from: 'mission', to: 'debrief' },
      { type: 'branchRunCompleted', branch: 'staged' },
    ])
    expect(controller.getState().alarm).toBe(false)
  })

  it('registering twice does not double-apply events (prior subscription disposed)', () => {
    const changes = vi.fn()
    controller.subscribe(changes)
    // beforeEach already registered once; a second register must dispose the
    // first so the relay does not fan out to two live subscriptions.
    const second = controller.register()
    relayEvents([{ type: 'phaseChanged', from: 'menu', to: 'mission' }])
    expect(changes).toHaveBeenCalledTimes(1)
    second()
  })

  it('changes once per relevant event in an ordered batch (consequenceApplied is ignored)', () => {
    const changes = vi.fn()
    controller.subscribe(changes)
    relayEvents([
      settlement('full'),
      { type: 'consequenceApplied', consequenceId: 'c1', targetMissionId: 'beta' },
    ])
    expect(changes).toHaveBeenCalledTimes(1)
    expect(controller.getState().settlement).toBe('good')
  })
})
