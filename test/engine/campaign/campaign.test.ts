import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import { campaignStateSchema } from '@engine/campaign/state'
import type { CampaignState } from '@engine/campaign/state'
import type { CampaignAction, EngineEvent } from '@engine/campaign/types'
import {
  selectCampaignBegun,
  selectCorroboration,
  selectMenuRows,
  selectOpenExceptions,
  selectServiceOutcomes,
  selectSettledOutcome,
} from '@engine/campaign/selectors'
import { assertJsonSafe, stateHash } from '../harness/canonical'
import { MISSIONS, TEST_SEED, makeContext } from './fixtures'

const ctx = makeContext()
const T0 = 1_000_000

function fresh(): CampaignState {
  return createCampaign(ctx, 'test-seed', { extendedTime: false })
}

function run(
  state: CampaignState,
  envelopes: Array<[CampaignAction, number]>,
): { state: CampaignState; emitted: EngineEvent[] } {
  let current = state
  const emitted: EngineEvent[] = []
  for (const [action, now] of envelopes) {
    const result = dispatch(ctx, current, action, now)
    current = result.state
    emitted.push(...result.emitted)
  }
  return { state: current, emitted }
}

const deliver: CampaignAction = {
  type: 'MISSION_ACTION',
  payload: { kind: 'DELIVER' },
}

function winMission(
  state: CampaignState,
  missionId: string,
  startAt: number,
): { state: CampaignState; emitted: EngineEvent[] } {
  return run(state, [
    [{ type: 'START_MISSION', missionId }, startAt],
    [deliver, startAt + 1_000],
    [deliver, startAt + 2_000],
    [deliver, startAt + 3_000],
    [{ type: 'ACKNOWLEDGE_DEBRIEF', missionId }, startAt + 4_000],
  ])
}

describe('schema as source of truth', () => {
  it('a fresh campaign parses through the valibot schema', () => {
    expect(() => v.parse(campaignStateSchema, fresh())).not.toThrow()
  })
})

describe('dispatch rejection discipline', () => {
  it('rejects unknown-phase actions and returns the drained state unchanged', () => {
    const start = fresh()
    const result = dispatch(ctx, start, { type: 'FORFEIT_MISSION' }, T0)
    expect(result.rejection?.reason).toBe('NO ACTIVE MISSION')
    expect(result.state.phase).toBe('menu')
    const again = dispatch(ctx, result.state, { type: 'FORFEIT_MISSION' }, T0)
    expect(again.state).toBe(result.state)
  })

  it('rejects invalid mission actions via the module validator', () => {
    const started = dispatch(
      ctx,
      fresh(),
      { type: 'START_MISSION', missionId: 'alpha' },
      T0,
    )
    // Rejection returns the DRAINED state: time passed, the action did
    // not. Compare against the pure-wake baseline at the same now.
    const drained = advanceCampaign(ctx, started.state, T0 + 1_000)
    const bad = dispatch(
      ctx,
      started.state,
      { type: 'MISSION_ACTION', payload: { nope: true } },
      T0 + 1_000,
    )
    expect(bad.rejection?.reason).toBe('MALFORMED ACTION')
    expect(stateHash(bad.state)).toBe(stateHash(drained.state))
  })
})

describe('mission lifecycle and settlement permanence', () => {
  it('any mission can start first; completion settles once via terminal()', () => {
    for (const missionId of MISSIONS) {
      const { state, emitted } = winMission(fresh(), missionId, T0)
      const settlements = emitted.filter((e) => e.type === 'settlement')
      expect(settlements).toEqual([
        { type: 'settlement', missionId, cause: 'completed', tier: 'full' },
      ])
      expect(state.phase).toBe('menu')
      expect(state.settled).toHaveLength(1)
    }
  })

  it('timeout settles exactly once and survives re-advances', () => {
    const started = dispatch(
      ctx,
      fresh(),
      { type: 'START_MISSION', missionId: 'alpha' },
      T0,
    )
    const expired = advanceCampaign(ctx, started.state, T0 + 300_000)
    expect(
      expired.emitted.filter((e) => e.type === 'settlement'),
    ).toHaveLength(1)
    const again = advanceCampaign(ctx, expired.state, T0 + 400_000)
    expect(again.emitted.filter((e) => e.type === 'settlement')).toHaveLength(0)
    expect(expired.state.settled[0]?.cause).toBe('timeout')
  })

  it('forfeit routes to evaluate with cause forfeit', () => {
    const { state } = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'beta' }, T0],
      [{ type: 'FORFEIT_MISSION' }, T0 + 5_000],
    ])
    expect(state.settled[0]?.cause).toBe('forfeit')
  })

  it('terminal() collapsed settles with cause collapsed', () => {
    const { state, emitted } = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'beta' }, T0],
      [{ type: 'MISSION_ACTION', payload: { kind: 'POISON' } }, T0 + 1_000],
    ])
    expect(state.settled[0]?.cause).toBe('collapsed')
    expect(
      emitted.find((e) => e.type === 'settlement' && e.cause === 'collapsed'),
    ).toBeTruthy()
  })

  it('a settled mission cannot restart', () => {
    const won = winMission(fresh(), 'alpha', T0)
    const retry = dispatch(
      ctx,
      won.state,
      { type: 'START_MISSION', missionId: 'alpha' },
      T0 + 10_000,
    )
    expect(retry.rejection?.reason).toBe('MISSION SETTLED')
  })
})

describe('consequence folding', () => {
  function loseMission(state: CampaignState, missionId: string, at: number) {
    return run(state, [
      [{ type: 'START_MISSION', missionId }, at],
      [{ type: 'FORFEIT_MISSION' }, at + 1_000],
      [{ type: 'ACKNOWLEDGE_DEBRIEF', missionId }, at + 2_000],
    ])
  }

  it('applies a consequence once per target mission, to multiple targets', () => {
    const afterLoss = loseMission(fresh(), 'alpha', T0)
    const startBeta = dispatch(
      ctx,
      afterLoss.state,
      { type: 'START_MISSION', missionId: 'beta' },
      T0 + 10_000,
    )
    expect(
      startBeta.emitted.filter((e) => e.type === 'consequenceApplied'),
    ).toHaveLength(1)
    const betaRuntime = startBeta.state.activeMission
    expect(
      (betaRuntime?.substate as { inbound: Record<string, number> }).inbound,
    ).toEqual({ commsDelayed: 30 })
    const forfeitBeta = run(startBeta.state, [
      [{ type: 'FORFEIT_MISSION' }, T0 + 11_000],
      [{ type: 'ACKNOWLEDGE_DEBRIEF', missionId: 'beta' }, T0 + 12_000],
    ])
    const startGamma = dispatch(
      ctx,
      forfeitBeta.state,
      { type: 'START_MISSION', missionId: 'gamma' },
      T0 + 20_000,
    )
    const gammaApplied = startGamma.emitted.filter(
      (e) => e.type === 'consequenceApplied',
    )
    expect(gammaApplied.map((e) => e.consequenceId).sort()).toEqual([
      'cq-alpha',
      'cq-beta',
    ])
    const inbound = (
      startGamma.state.activeMission?.substate as {
        inbound: Record<string, number>
      }
    ).inbound
    // alpha 30 + beta 20 = 50, capped once at the per-kind aggregate 40.
    expect(inbound).toEqual({ commsDelayed: 40 })
  })

  it('folded initial conditions are order-independent across permutations', () => {
    const orders: Array<[string, string]> = [
      ['alpha', 'beta'],
      ['beta', 'alpha'],
    ]
    const inbounds = orders.map(([first, second]) => {
      let state = fresh()
      state = loseMission(state, first, T0).state
      state = loseMission(state, second, T0 + 50_000).state
      const started = dispatch(
        ctx,
        state,
        { type: 'START_MISSION', missionId: 'gamma' },
        T0 + 100_000,
      )
      return (
        started.state.activeMission?.substate as {
          inbound: Record<string, number>
        }
      ).inbound
    })
    expect(inbounds[0]).toEqual(inbounds[1])
    expect(inbounds[0]).toEqual({ commsDelayed: 40 })
  })
})

describe('clues', () => {
  it('mission clues() merges monotonically with exactly one clueFound', () => {
    const { state, emitted } = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'alpha' }, T0],
      [{ type: 'MISSION_ACTION', payload: { kind: 'READ_AUDIT' } }, T0 + 500],
      [{ type: 'MISSION_ACTION', payload: { kind: 'READ_AUDIT' } }, T0 + 600],
    ])
    expect(emitted.filter((e) => e.type === 'clueFound')).toHaveLength(1)
    expect(state.cluesFound).toEqual(['clue-alpha'])
  })

  it('a clue survives a failed mission', () => {
    const { state } = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'alpha' }, T0],
      [{ type: 'MISSION_ACTION', payload: { kind: 'READ_AUDIT' } }, T0 + 500],
      [{ type: 'FORFEIT_MISSION' }, T0 + 1_000],
    ])
    expect(state.settled[0]?.cause).toBe('forfeit')
    expect(state.cluesFound).toContain('clue-alpha')
  })

  it('clueRecords: inspecting a designated record logs its clue exactly once', () => {
    const { state, emitted } = run(fresh(), [
      [{ type: 'INSPECT_RECORD', recordId: 'F06' }, T0],
      [{ type: 'INSPECT_RECORD', recordId: 'F06' }, T0 + 100],
      [{ type: 'INSPECT_RECORD', recordId: 'W02' }, T0 + 200],
    ])
    expect(emitted.filter((e) => e.type === 'clueFound')).toHaveLength(1)
    expect(state.cluesFound).toEqual(['clue-restriction'])
    expect(state.inspectedRecords).toEqual(['F06', 'W02'])
  })
})

describe('source checks on the campaign queue', () => {
  it('schedules a desk reply and resolves it at its time', () => {
    const requested = dispatch(
      ctx,
      fresh(),
      { type: 'REQUEST_SOURCE_CHECK', recordId: 'W02' },
      T0,
    )
    expect(requested.state.campaignQueue).toHaveLength(1)
    const resolved = advanceCampaign(ctx, requested.state, T0 + 25_000)
    const event = resolved.emitted.find(
      (e) => e.type === 'sourceCheckResolved',
    )
    expect(event).toEqual({
      type: 'sourceCheckResolved',
      recordId: 'W02',
      outcome: 'CONFIRMED',
      arrivedAfterSettlement: false,
    })
    expect(resolved.state.sourceChecks[0]?.outcome).toBe('CONFIRMED')
  })

  it('a reply scheduled past endsAt survives settlement with the marker', () => {
    const { state } = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'alpha' }, T0],
      [{ type: 'REQUEST_SOURCE_CHECK', recordId: 'C17' }, T0 + 1_000],
    ])
    expect(state.campaignQueue).toHaveLength(1)
    const afterTimeout = advanceCampaign(ctx, state, T0 + 300_000)
    expect(afterTimeout.state.settled).toHaveLength(1)
    const late = advanceCampaign(ctx, afterTimeout.state, T0 + 500_000)
    const check = late.state.sourceChecks[0]
    expect(check?.outcome).toBe('CONTRADICTED')
    expect(check?.arrivedAfterSettlement).toBe(true)
  })
})

describe('menu, preferences, scoreboards, reset', () => {
  it('the fourth row appears only after all three debriefs acknowledge', () => {
    let state = fresh()
    for (const [index, missionId] of MISSIONS.entries()) {
      expect(
        selectMenuRows(state, [...MISSIONS], 'finale').finaleUnlocked,
      ).toBe(false)
      state = winMission(state, missionId, T0 + index * 50_000).state
    }
    const menu = selectMenuRows(state, [...MISSIONS], 'finale')
    expect(menu.finaleUnlocked).toBe(true)
    expect(menu.rows.map((r) => r.missionId)).toEqual([
      ...MISSIONS,
      'finale',
    ])
  })

  it('extended time locks after the first mission start', () => {
    const before = dispatch(
      ctx,
      fresh(),
      { type: 'SET_PREFERENCE', preference: 'extendedTime', value: true },
      T0,
    )
    expect(before.rejection).toBeNull()
    expect(before.state.preferences.extendedTime).toBe(true)
    const started = dispatch(
      ctx,
      before.state,
      { type: 'START_MISSION', missionId: 'alpha' },
      T0 + 1_000,
    )
    expect(selectCampaignBegun(started.state)).toBe(true)
    const locked = dispatch(
      ctx,
      started.state,
      { type: 'SET_PREFERENCE', preference: 'extendedTime', value: false },
      T0 + 2_000,
    )
    expect(locked.rejection?.reason).toBe('CAMPAIGN HAS BEGUN')
  })

  it('extended time doubles endsAt at mission start', () => {
    const extended = run(fresh(), [
      [{ type: 'SET_PREFERENCE', preference: 'extendedTime', value: true }, T0],
      [{ type: 'START_MISSION', missionId: 'alpha' }, T0 + 1_000],
    ])
    expect(extended.state.activeMission?.endsAt).toBe(T0 + 1_000 + 480_000)
  })

  it('scoreboards derive from the same settled facts and diverge', () => {
    const { state } = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'alpha' }, T0],
      [{ type: 'FORFEIT_MISSION' }, T0 + 1_000],
    ])
    // Baseline 12 open exceptions; three forced-inactivity resolutions
    // drop WOPR's tally while real service cost climbs.
    expect(selectOpenExceptions(state)).toBe(9)
    expect(selectServiceOutcomes(state)).toBe(30)
  })

  it('NEW_CAMPAIGN resets outcomes and emits campaignReset', () => {
    const won = winMission(fresh(), 'alpha', T0)
    const reset = dispatch(
      ctx,
      won.state,
      { type: 'NEW_CAMPAIGN', seedName: 'test-seed' },
      T0 + 90_000,
    )
    expect(reset.emitted.some((e) => e.type === 'campaignReset')).toBe(true)
    expect(reset.state.settled).toEqual([])
    expect(reset.state.lastNow).toBe(T0 + 90_000)
  })
})

describe('review-mandated hardening', () => {
  it('a single wake past the deadline settles first, then resolves the late desk reply with the marker', () => {
    const { state } = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'alpha' }, T0],
      [{ type: 'REQUEST_SOURCE_CHECK', recordId: 'C17' }, T0 + 1_000],
    ])
    const oneWake = advanceCampaign(ctx, state, T0 + 500_000)
    expect(oneWake.state.settled[0]?.cause).toBe('timeout')
    const check = oneWake.state.sourceChecks[0]
    expect(check?.outcome).toBe('CONTRADICTED')
    expect(check?.arrivedAfterSettlement).toBe(true)
    const order = oneWake.emitted.map((e) => e.type)
    expect(order.indexOf('settlement')).toBeLessThan(
      order.indexOf('sourceCheckResolved'),
    )
  })

  it('duplicate source checks are rejected pending and answered', () => {
    const requested = dispatch(
      ctx,
      fresh(),
      { type: 'REQUEST_SOURCE_CHECK', recordId: 'W02' },
      T0,
    )
    const pending = dispatch(
      ctx,
      requested.state,
      { type: 'REQUEST_SOURCE_CHECK', recordId: 'W02' },
      T0 + 1_000,
    )
    expect(pending.rejection?.reason).toBe('CHECK PENDING')
    const resolved = advanceCampaign(ctx, pending.state, T0 + 30_000)
    const again = dispatch(
      ctx,
      resolved.state,
      { type: 'REQUEST_SOURCE_CHECK', recordId: 'W02' },
      T0 + 31_000,
    )
    expect(again.rejection?.reason).toBe('CHECK ALREADY ANSWERED')
    expect(resolved.state.sourceChecks).toHaveLength(1)
  })

  it('PENDING and UNKNOWN desk outcomes earn zero corroboration', () => {
    const { state } = run(fresh(), [
      [{ type: 'REQUEST_SOURCE_CHECK', recordId: 'B04' }, T0],
      [{ type: 'REQUEST_SOURCE_CHECK', recordId: 'F06' }, T0 + 100],
    ])
    const resolved = advanceCampaign(ctx, state, T0 + 60_000)
    expect(resolved.state.sourceChecks).toHaveLength(2)
    expect(selectCorroboration(resolved.state, 'B04')).toBe(0)
    expect(selectCorroboration(resolved.state, 'F06')).toBe(0)
  })

  it('unknown action kinds reject without corrupting state', () => {
    const bogus = { type: 'SELF_DESTRUCT' } as unknown as CampaignAction
    const result = dispatch(ctx, fresh(), bogus, T0)
    expect(result.rejection?.reason).toBe('UNKNOWN ACTION')
    expect(result.state.phase).toBe('menu')
  })

  it('a backward clock between envelopes cannot un-expire anything', () => {
    const started = dispatch(
      ctx,
      fresh(),
      { type: 'START_MISSION', missionId: 'alpha' },
      T0,
    )
    const expired = advanceCampaign(ctx, started.state, T0 + 300_000)
    const backward = advanceCampaign(ctx, expired.state, T0 + 10_000)
    expect(backward.state.lastNow).toBe(expired.state.lastNow)
    expect(backward.emitted).toEqual([])
  })

  it('a catch-up crossing three milestones emits three ordered events once', () => {
    const triSeed = {
      ...TEST_SEED,
      schedules: {
        ...TEST_SEED.schedules,
        alpha: [
          ...TEST_SEED.schedules['alpha']!,
          {
            id: 'warn-60',
            offsetSeconds: 60,
            anchor: 'end' as const,
            kind: 'timerMilestone',
            payload: null,
          },
        ],
      },
    }
    const triCtx = { ...ctx, seeds: { 'test-seed': triSeed } }
    const started = dispatch(
      triCtx,
      createCampaign(triCtx, 'test-seed', { extendedTime: false }),
      { type: 'START_MISSION', missionId: 'alpha' },
      T0,
    )
    const catchUp = advanceCampaign(triCtx, started.state, T0 + 239_000)
    const milestones = catchUp.emitted.filter(
      (e) => e.type === 'timerMilestone',
    )
    expect(milestones.map((e) => e.id)).toEqual([
      'warn-60',
      'warn-30',
      'warn-10',
    ])
    const again = advanceCampaign(triCtx, catchUp.state, T0 + 239_500)
    expect(again.emitted.filter((e) => e.type === 'timerMilestone')).toEqual([])
  })

  it('settlement permanence survives a JSON round-trip reload', () => {
    const won = winMission(fresh(), 'alpha', T0)
    const revived = v.parse(
      campaignStateSchema,
      JSON.parse(JSON.stringify(won.state)),
    )
    expect(stateHash(revived)).toBe(stateHash(won.state))
    const retry = dispatch(
      ctx,
      revived,
      { type: 'START_MISSION', missionId: 'alpha' },
      T0 + 50_000,
    )
    expect(retry.rejection?.reason).toBe('MISSION SETTLED')
  })

  it('selectors are pure and the settled record selector serves reselection', () => {
    const won = winMission(fresh(), 'alpha', T0)
    const before = stateHash(won.state)
    selectOpenExceptions(won.state)
    selectServiceOutcomes(won.state)
    selectMenuRows(won.state, [...MISSIONS], 'finale')
    const record = selectSettledOutcome(won.state, 'alpha')
    expect(record?.tier).toBe('full')
    expect(selectSettledOutcome(won.state, 'beta')).toBeNull()
    expect(stateHash(won.state)).toBe(before)
  })

  it('every post-dispatch state is JSON-safe by the canonical walker', () => {
    const { state } = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'alpha' }, T0],
      [{ type: 'INSPECT_RECORD', recordId: 'F06' }, T0 + 500],
      [{ type: 'REQUEST_SOURCE_CHECK', recordId: 'W02' }, T0 + 600],
      [deliver, T0 + 700],
    ])
    expect(() => assertJsonSafe(state)).not.toThrow()
  })

  it('INSPECT_RECORD rejects ids outside the seed record graph', () => {
    const result = dispatch(
      ctx,
      fresh(),
      { type: 'INSPECT_RECORD', recordId: 'NOT-A-RECORD' },
      T0,
    )
    expect(result.rejection?.reason).toBe('UNKNOWN RECORD')
  })

  it('a post-deadline mission event cannot complete a timed-out mission', () => {
    const lateSeed = {
      ...TEST_SEED,
      schedules: {
        ...TEST_SEED.schedules,
        alpha: [
          {
            id: 'too-late',
            offsetSeconds: 250,
            anchor: 'start' as const,
            kind: 'stage',
            payload: null,
          },
        ],
      },
    }
    const lateCtx = { ...ctx, seeds: { 'test-seed': lateSeed } }
    const started = dispatch(
      lateCtx,
      createCampaign(lateCtx, 'test-seed', { extendedTime: false }),
      { type: 'START_MISSION', missionId: 'alpha' },
      T0,
    )
    const wake = advanceCampaign(lateCtx, started.state, T0 + 260_000)
    expect(wake.state.settled[0]?.cause).toBe('timeout')
    const order = wake.emitted.map((e) =>
      e.type === 'scheduledEventFired' ? e.id : e.type,
    )
    expect(order.indexOf('settlement')).toBeLessThan(
      order.indexOf('too-late'),
    )
  })
})

describe('emitted replay determinism', () => {
  it('replaying the same envelope log reproduces state and emitted exactly', () => {
    const log: Array<[CampaignAction, number]> = [
      [{ type: 'START_MISSION', missionId: 'alpha' }, T0],
      [deliver, T0 + 70_000],
      [{ type: 'REQUEST_SOURCE_CHECK', recordId: 'W02' }, T0 + 80_000],
      [deliver, T0 + 120_000],
      [deliver, T0 + 230_000],
    ]
    const a = run(fresh(), log)
    const b = run(fresh(), log)
    expect(stateHash(a.state)).toBe(stateHash(b.state))
    expect(a.emitted).toEqual(b.emitted)
    const milestones = a.emitted.filter((e) => e.type === 'timerMilestone')
    expect(milestones.map((e) => e.id)).toEqual(['warn-30', 'warn-10'])
  })

  it('every reducer output stays JSON-safe', () => {
    const { state } = winMission(fresh(), 'alpha', T0)
    expect(() => stateHash(state)).not.toThrow()
  })
})
