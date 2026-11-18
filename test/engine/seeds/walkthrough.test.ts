import { describe, expect, it } from 'vitest'
import {
  FINALE_FIELD_REPORT,
  MISSION_IDS,
  SEED_CATALOG,
  SEED_NAMES,
} from '@engine/seeds/catalog'
import { makeTestDoubleMission } from '@engine/testing'
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { EngineContext } from '@engine/campaign/engine'
import type { CampaignAction } from '@engine/campaign/types'
import { selectMenuRows } from '@engine/campaign/selectors'
import { stateHash } from '../harness/canonical'

// Engine-level walkthroughs drive the real seeds through test-double
// modules registered under the real mission ids; mission splits swap
// the modules and keep these seeds and envelopes.
function contextFor(): EngineContext {
  return {
    seeds: SEED_CATALOG,
    missions: Object.fromEntries(
      [...MISSION_IDS, 'finale'].map((id) => [id, makeTestDoubleMission(id)]),
    ),
    missionOrder: [...MISSION_IDS],
  }
}

const T0 = 10_000_000
const deliver: CampaignAction = {
  type: 'MISSION_ACTION',
  payload: { kind: 'DELIVER' },
}

type Envelope = [CampaignAction, number]

function winEnvelopes(missionId: string, at: number): Envelope[] {
  return [
    [{ type: 'START_MISSION', missionId }, at],
    [{ type: 'MISSION_ACTION', payload: { kind: 'READ_AUDIT' } }, at + 500],
    [deliver, at + 1_000],
    [deliver, at + 2_000],
    [deliver, at + 3_000],
    [{ type: 'ACKNOWLEDGE_DEBRIEF', missionId }, at + 4_000],
  ]
}

export function walkthroughEnvelopes(startAt: number): Envelope[] {
  return MISSION_IDS.flatMap((missionId, index) =>
    winEnvelopes(missionId, startAt + index * 300_000),
  )
}

describe.each(SEED_NAMES)('walkthrough on %s', (seedName) => {
  it('reaches the finale unlock with all missions full tier', () => {
    const ctx = contextFor()
    let state = createCampaign(ctx, seedName, { extendedTime: false }, T0)
    for (const [action, now] of walkthroughEnvelopes(T0)) {
      const result = dispatch(ctx, state, action, now)
      expect(result.rejection, JSON.stringify(action)).toBeNull()
      state = result.state
    }
    expect(state.settled.map((s) => s.tier)).toEqual(['full', 'full', 'full'])
    expect(selectMenuRows(state, [...MISSION_IDS], 'finale').finaleUnlocked).toBe(
      true,
    )
  })

  it('replays byte-identically', () => {
    const ctx = contextFor()
    const runOnce = () => {
      let state = createCampaign(ctx, seedName, { extendedTime: false }, T0)
      for (const [action, now] of walkthroughEnvelopes(T0)) {
        state = dispatch(ctx, state, action, now).state
      }
      return state
    }
    expect(stateHash(runOnce())).toBe(stateHash(runOnce()))
  })

  it('timeout fixture: an abandoned mission settles once as timeout', () => {
    const ctx = contextFor()
    let state = createCampaign(ctx, seedName, { extendedTime: false }, T0)
    state = dispatch(
      ctx,
      state,
      { type: 'START_MISSION', missionId: 'outlook' },
      T0,
    ).state
    const expired = advanceCampaign(ctx, state, T0 + 600_000)
    expect(expired.state.settled).toHaveLength(1)
    expect(expired.state.settled[0]?.cause).toBe('timeout')
    const again = advanceCampaign(ctx, expired.state, T0 + 700_000)
    expect(again.emitted.filter((e) => e.type === 'settlement')).toHaveLength(0)
  })

  it('partial-recovery fixture: mixed outcomes still unlock the finale', () => {
    const ctx = contextFor()
    let state = createCampaign(ctx, seedName, { extendedTime: false }, T0)
    // Outlook times out, flights forfeits, bank wins: the fourth row
    // appears regardless of outcome quality.
    state = dispatch(
      ctx,
      state,
      { type: 'START_MISSION', missionId: 'outlook' },
      T0,
    ).state
    state = advanceCampaign(ctx, state, T0 + 300_000).state
    state = dispatch(
      ctx,
      state,
      { type: 'ACKNOWLEDGE_DEBRIEF', missionId: 'outlook' },
      T0 + 301_000,
    ).state
    state = dispatch(
      ctx,
      state,
      { type: 'START_MISSION', missionId: 'flights' },
      T0 + 310_000,
    ).state
    state = dispatch(ctx, state, { type: 'FORFEIT_MISSION' }, T0 + 311_000)
      .state
    state = dispatch(
      ctx,
      state,
      { type: 'ACKNOWLEDGE_DEBRIEF', missionId: 'flights' },
      T0 + 312_000,
    ).state
    for (const [action, now] of winEnvelopes('bank', T0 + 320_000)) {
      state = dispatch(ctx, state, action, now).state
    }
    expect(selectMenuRows(state, [...MISSION_IDS], 'finale').finaleUnlocked).toBe(
      true,
    )
    expect(state.settled.map((s) => s.cause).sort()).toEqual([
      'completed',
      'forfeit',
      'timeout',
    ])
  })

  it('six mission orders yield order-invariant campaign case facts', () => {
    const ctx = contextFor()
    const orders: string[][] = [
      ['outlook', 'flights', 'bank'],
      ['outlook', 'bank', 'flights'],
      ['flights', 'outlook', 'bank'],
      ['flights', 'bank', 'outlook'],
      ['bank', 'outlook', 'flights'],
      ['bank', 'flights', 'outlook'],
    ]
    // Play every mission identically (full win) in each order, then hash
    // the RESULTING campaign case facts the finale reads: clues found,
    // settled tiers by mission, acknowledged debriefs. These derive from
    // dispatch, so an order-dependent engine would diverge here. A bare
    // re-sort of seed input (the earlier version) proved nothing.
    const facts = orders.map((order) => {
      let state = createCampaign(ctx, seedName, { extendedTime: false }, T0)
      order.forEach((missionId, index) => {
        for (const [action, now] of winEnvelopes(
          missionId,
          T0 + index * 300_000,
        )) {
          state = dispatch(ctx, state, action, now).state
        }
      })
      expect(
        selectMenuRows(state, [...MISSION_IDS], 'finale').finaleUnlocked,
      ).toBe(true)
      return stateHash({
        cluesFound: [...state.cluesFound].sort(),
        settled: [...state.settled]
          .map((s) => ({ missionId: s.missionId, tier: s.tier, clueId: s.clueId }))
          .sort((a, b) => (a.missionId < b.missionId ? -1 : 1)),
        acknowledged: [...state.acknowledgedDebriefs].sort(),
      })
    })
    expect(new Set(facts).size).toBe(1)
  })

  it('the finale field report desk check resolves confirmed', () => {
    const ctx = contextFor()
    let state = createCampaign(ctx, seedName, { extendedTime: false }, T0)
    const reportId = FINALE_FIELD_REPORT[seedName]!
    state = dispatch(
      ctx,
      state,
      { type: 'REQUEST_SOURCE_CHECK', recordId: reportId },
      T0,
    ).state
    const resolved = advanceCampaign(ctx, state, T0 + 120_000)
    expect(resolved.state.sourceChecks[0]).toMatchObject({
      recordId: reportId,
      outcome: 'CONFIRMED',
    })
  })
})
