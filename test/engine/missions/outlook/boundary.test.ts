// The buzzer tie-break at the deadline. Ack timing is constructed from the
// authored channel ETAs (not by poking the event queue): backup ETA is a
// fixed 120s, so a backup send dispatched at endsAt-120s lands its ack
// exactly on endsAt. Three such sends drain through the endsAt settle tick
// before the timeout guard runs, settling completed/full. Shift the third
// one tick late (ack at endsAt+1) and it never folds: timeout/partial.
//
// The fixture seed payload tunes this cleanly (backupEtaSeconds 120, backup
// capacity 5 covers three sends), so no synthetic payload is needed.
import { describe, expect, it } from 'vitest'
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { EngineContext } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import type { CampaignAction } from '@engine/campaign/types'
import { SEED_NAMES } from '@engine/seeds/catalog'
import { OUTLOOK_PAYLOAD_BY_SEED } from '@engine/missions/outlook/payloads'
import {
  OUTLOOK_DURATION_MS,
  OUTLOOK_T0,
  outlookContextForSeed,
} from './fixtures/index'

const SEED = SEED_NAMES[0]!
const ENDS_AT = OUTLOOK_T0 + OUTLOOK_DURATION_MS
const BACKUP_ETA_MS =
  OUTLOOK_PAYLOAD_BY_SEED[SEED]!.channelTuning.backupEtaSeconds * 1000

function startMission(ctx: EngineContext): CampaignState {
  const created = createCampaign(ctx, SEED, { extendedTime: false }, OUTLOOK_T0)
  return dispatch(
    ctx,
    created,
    { type: 'START_MISSION', missionId: 'outlook' },
    OUTLOOK_T0,
  ).state
}

function send(messageId: string, recipient: string): CampaignAction {
  return {
    type: 'MISSION_ACTION',
    payload: { kind: 'SEND', messageId, channel: 'backup', recipient },
  }
}

const REQUIRED: ReadonlyArray<readonly [string, string]> = [
  ['M01', 'WEATHER_DESK'],
  ['M04', 'PAYROLL_DESK'],
  ['M05', 'AUDIT_DESK'],
]

describe('buzzer tie-break', () => {
  it('third ack with scheduledAt == endsAt settles completed/full', () => {
    const ctx = outlookContextForSeed(SEED)
    let state = startMission(ctx)
    // Each backup send at endsAt-120s lands its ack at exactly endsAt.
    const sendAt = ENDS_AT - BACKUP_ETA_MS
    for (const [messageId, desk] of REQUIRED) {
      state = dispatch(ctx, state, send(messageId, desk), sendAt).state
    }
    const sub = state.activeMission!.substate as { sends: ReadonlyArray<{ scheduledAckAt: number }> }
    expect(sub.sends.map((s) => s.scheduledAckAt)).toEqual([ENDS_AT, ENDS_AT, ENDS_AT])
    // A single advance past the deadline: the settle tick folds the acks
    // before the timeout guard.
    const advanced = advanceCampaign(ctx, state, ENDS_AT + 1_000)
    const settlements = advanced.emitted.filter((e) => e.type === 'settlement')
    expect(settlements).toHaveLength(1)
    expect(settlements[0]).toMatchObject({ cause: 'completed', tier: 'full' })
    const outlook = advanced.state.settled.find((s) => s.missionId === 'outlook')!
    expect(outlook.tier).toBe('full')
    expect(outlook.metrics['required_delivered']).toBe(3)
  })

  it('ack with scheduledAt == endsAt + 1 does not count: timeout/partial', () => {
    const ctx = outlookContextForSeed(SEED)
    let state = startMission(ctx)
    const onTime = ENDS_AT - BACKUP_ETA_MS
    // Two land exactly on the deadline; the third is shifted one tick late.
    state = dispatch(ctx, state, send('M01', 'WEATHER_DESK'), onTime).state
    state = dispatch(ctx, state, send('M04', 'PAYROLL_DESK'), onTime).state
    state = dispatch(ctx, state, send('M05', 'AUDIT_DESK'), onTime + 1).state
    const sub = state.activeMission!.substate as { sends: ReadonlyArray<{ scheduledAckAt: number }> }
    expect(sub.sends.map((s) => s.scheduledAckAt)).toEqual([
      ENDS_AT,
      ENDS_AT,
      ENDS_AT + 1,
    ])
    const advanced = advanceCampaign(ctx, state, ENDS_AT + 1_000)
    const settlements = advanced.emitted.filter((e) => e.type === 'settlement')
    expect(settlements).toHaveLength(1)
    expect(settlements[0]).toMatchObject({ cause: 'timeout', tier: 'partial' })
    const outlook = advanced.state.settled.find((s) => s.missionId === 'outlook')!
    expect(outlook.tier).toBe('partial')
    expect(outlook.metrics['required_delivered']).toBe(2)
  })
})
