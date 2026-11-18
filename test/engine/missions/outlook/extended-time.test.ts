// Extended time is the accessibility time option (createCampaign's
// extendedTime preference). The engine scales the mission duration and every
// start-anchored offset by the same ratio (two), so the three stage-change
// milestones fire at offsets scaled proportionally, in order; and the
// walkthrough still solves when its action times scale by that same ratio.
// The assertions check proportionality and order, not absolute values, so a
// later retune of the stage offsets cannot break them.
import { describe, expect, it } from 'vitest'
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { EngineContext } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import { SEED_NAMES } from '@engine/seeds/catalog'
import {
  OUTLOOK_DURATION_MS,
  OUTLOOK_T0,
  outlookContextForSeed,
  walkthroughScript,
} from './fixtures/index'

const SEED = SEED_NAMES[0]!
const STAGE_IDS = ['outlook-stage-1', 'outlook-stage-2', 'outlook-stage-3']

function startMission(
  ctx: EngineContext,
  extendedTime: boolean,
): CampaignState {
  const created = createCampaign(ctx, SEED, { extendedTime }, OUTLOOK_T0)
  return dispatch(
    ctx,
    created,
    { type: 'START_MISSION', missionId: 'outlook' },
    OUTLOOK_T0,
  ).state
}

/** The materialized start-offset (ms from startNow) of each stage event in
 *  a freshly started mission's queue, in schedule order. */
function stageOffsets(state: CampaignState): number[] {
  const queue = state.missionQueue
  return STAGE_IDS.map((id) => {
    const event = queue.find((e) => e.id === id)!
    return event.scheduledAt - OUTLOOK_T0
  })
}

describe('extended time (accessibility time scaling)', () => {
  it('the three stage-change offsets scale proportionally and stay in order', () => {
    const ctx = outlookContextForSeed(SEED)
    const standard = startMission(ctx, false)
    const extended = startMission(ctx, true)

    const standardOffsets = stageOffsets(standard)
    const extendedOffsets = stageOffsets(extended)

    // Extended doubles the mission duration; the ratio is derived from the
    // endsAt the engine materialized, not a hard-coded constant.
    const standardEndsAt = standard.activeMission!.endsAt
    const extendedEndsAt = extended.activeMission!.endsAt
    const ratio = (extendedEndsAt - OUTLOOK_T0) / (standardEndsAt - OUTLOOK_T0)
    expect(ratio).toBeGreaterThan(1)
    expect(extendedEndsAt - OUTLOOK_T0).toBe(OUTLOOK_DURATION_MS * ratio)

    // Each start-anchored stage offset scales by the same ratio.
    for (let i = 0; i < STAGE_IDS.length; i++) {
      expect(extendedOffsets[i]).toBe(standardOffsets[i]! * ratio)
    }
    // Order is preserved (strictly increasing) under scaling.
    expect(extendedOffsets[0]).toBeLessThan(extendedOffsets[1]!)
    expect(extendedOffsets[1]).toBeLessThan(extendedOffsets[2]!)
  })

  it('the three stage scheduledEventFired events fire in schedule order', () => {
    const ctx = outlookContextForSeed(SEED)
    const extended = startMission(ctx, true)
    const advanced = advanceCampaign(
      ctx,
      extended,
      (extended.activeMission!.endsAt as number) - 1_000,
    )
    const firedStageIds = advanced.emitted
      .filter((e) => e.type === 'scheduledEventFired' && e.kind === 'outlookStage')
      .map((e) => (e as { id: string }).id)
    expect(firedStageIds).toEqual(STAGE_IDS)
  })

  it('the walkthrough still reaches tier 3 at eight minutes (times scaled by the same ratio)', () => {
    const ctx = outlookContextForSeed(SEED)
    let state = startMission(ctx, true)
    const endsAt = state.activeMission!.endsAt as number
    const ratio = (endsAt - OUTLOOK_T0) / OUTLOOK_DURATION_MS
    // Replay the walkthrough action envelopes (skipping the START_MISSION
    // prefix, already dispatched) with each delta from t0 scaled by the ratio.
    const envelopes = walkthroughScript(SEED).slice(1)
    for (const [action, now] of envelopes) {
      const scaledNow = OUTLOOK_T0 + (now - OUTLOOK_T0) * ratio
      state = dispatch(ctx, state, action, scaledNow).state
    }
    const advanced = advanceCampaign(ctx, state, endsAt + 1_000)
    const outlook = advanced.state.settled.find((s) => s.missionId === 'outlook')!
    expect(outlook.tier).toBe('full')
    expect(outlook.metrics['required_delivered']).toBe(3)
    // Eight minutes = 480_000 ms = twice the 240_000 standard window.
    expect(endsAt - OUTLOOK_T0).toBe(480_000)
  })
})
