import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCampaign, dispatch } from '@engine/campaign/engine'
import { decideInitialScreen } from '@app/hero'
import { buildCtx, resetAll } from '../state/harness'

const T0 = 1_000_000

beforeEach(() => {
  resetAll()
  vi.spyOn(Date, 'now').mockReturnValue(T0)
})

afterEach(() => vi.restoreAllMocks())

describe('decideInitialScreen', () => {
  it('shows the hero for no save', () => {
    expect(decideInitialScreen(null)).toBe('hero')
  })

  it('shows the hero for a menu-phase save (campaign state preserved)', () => {
    const ctx = buildCtx()
    const state = createCampaign(ctx, 'test-seed', { extendedTime: false }, T0)
    expect(state.phase).toBe('menu')
    expect(decideInitialScreen(state)).toBe('hero')
  })

  it('skips the hero for an active mission', () => {
    const ctx = buildCtx()
    const state = dispatch(
      ctx,
      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
      { type: 'START_MISSION', missionId: 'alpha' },
      T0,
    ).state
    expect(state.phase).toBe('mission')
    expect(decideInitialScreen(state)).toBe('engine')
  })

  it('skips the hero for a pending debrief (post-settlement)', () => {
    const ctx = buildCtx()
    let state = dispatch(
      ctx,
      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
      { type: 'START_MISSION', missionId: 'alpha' },
      T0,
    ).state
    for (let i = 0; i < 3; i++) {
      state = dispatch(
        ctx,
        state,
        { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } },
        state.lastNow + 1_000,
      ).state
    }
    expect(state.phase).toBe('debrief')
    expect(decideInitialScreen(state)).toBe('engine')
  })
})
