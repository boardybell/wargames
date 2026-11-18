import { describe, expect, it } from 'vitest'
import * as Engine from '@engine'
import * as Testing from '@engine/testing'
import { buildCtx, T0 } from '../properties/helpers'
import { stateHash } from '../harness/canonical'
import type { CampaignAction } from '@engine'

// The pinned public value surface. A new runtime export must be added here
// deliberately, or this test fails — that is the leak guard.
const EXPECTED_EXPORTS = [
  'ENGINE_VERSION',
  'createCampaign',
  'dispatch',
  'advanceCampaign',
  'isMissionSettled',
  'selectMenuRows',
  'selectOpenExceptions',
  'selectServiceOutcomes',
  'selectSettledOutcome',
  'selectSettledMetrics',
  'selectCorroboration',
  'selectCampaignBegun',
  'snapshot',
  'runBranch',
  'BRANCH_KINDS',
  'buildRecordGraph',
  'getRecord',
  'trace',
  'isIndependentObservation',
  'corroborationValue',
  'encodeSave',
  'decodeSave',
  'runMigrations',
  'loadCampaign',
  'persistCampaign',
  'seedCatalogMetadata',
  'SEED_NAMES',
]

describe('public surface', () => {
  it('exports exactly the documented runtime set, nothing more', () => {
    const actual = Object.keys(Engine).sort()
    expect(actual).toEqual([...EXPECTED_EXPORTS].sort())
  })

  it('importing @engine/testing does not widen the @engine surface', () => {
    const engineKeys = new Set(Object.keys(Engine))
    for (const key of Object.keys(Testing)) {
      expect(engineKeys.has(key)).toBe(false)
    }
  })

  it('dispatch reaches the full action set through the public export', () => {
    const ctx = buildCtx()
    let state = Engine.createCampaign(ctx, 'test-seed', { extendedTime: false })
    const reached = new Set<string>()
    const run = (action: CampaignAction, now: number): void => {
      reached.add(action.type)
      state = Engine.dispatch(ctx, state, action, now).state
    }
    let now = T0 + 1_000
    run({ type: 'SET_PREFERENCE', preference: 'extendedTime', value: true }, now++)
    run({ type: 'START_MISSION', missionId: 'alpha' }, now++)
    run({ type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } }, now++)
    run({ type: 'INSPECT_RECORD', recordId: 'C17' }, now++)
    run({ type: 'REQUEST_SOURCE_CHECK', recordId: 'C17' }, now++)
    run({ type: 'FORFEIT_MISSION' }, now++)
    run({ type: 'ACKNOWLEDGE_DEBRIEF', missionId: 'alpha' }, now++)
    run({ type: 'NEW_CAMPAIGN', seedName: 'test-seed' }, now++)
    expect(reached).toEqual(
      new Set([
        'SET_PREFERENCE',
        'START_MISSION',
        'MISSION_ACTION',
        'INSPECT_RECORD',
        'REQUEST_SOURCE_CHECK',
        'FORFEIT_MISSION',
        'ACKNOWLEDGE_DEBRIEF',
        'NEW_CAMPAIGN',
      ]),
    )
  })

  it('exported selectors are pure (state unchanged by observation)', () => {
    const ctx = buildCtx()
    let state = Engine.createCampaign(ctx, 'test-seed', { extendedTime: false })
    state = Engine.dispatch(
      ctx,
      state,
      { type: 'START_MISSION', missionId: 'alpha' },
      T0 + 1_000,
    ).state
    state = Engine.dispatch(
      ctx,
      state,
      { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } },
      T0 + 2_000,
    ).state
    const before = stateHash(state)
    Engine.selectMenuRows(state, ['alpha', 'beta', 'gamma'], 'finale')
    Engine.selectOpenExceptions(state)
    Engine.selectServiceOutcomes(state)
    Engine.selectSettledOutcome(state, 'alpha')
    Engine.selectSettledMetrics(state, 'alpha')
    Engine.selectCorroboration(state, 'C17')
    Engine.selectCampaignBegun(state)
    expect(stateHash(state)).toBe(before)
  })
})
