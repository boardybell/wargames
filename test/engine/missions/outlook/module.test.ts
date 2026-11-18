import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { EngineContext } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import type { CampaignAction, EngineEvent } from '@engine/campaign/types'
import type { SeedDefinition } from '@engine/missions/types'
import { buildTestContext } from '@engine/testing'
import {
  OUTLOOK_CLUE_ID,
  makeOutlookMission,
  outlookSchedule,
} from '@engine/missions/outlook/module'
import type { OutlookPayload } from '@engine/missions/outlook/content'
import type { OutlookState } from '@engine/missions/outlook/types'
import { FIXTURE_RECORDS } from '../../records/fixtures'

// A minimal in-test payload: one of each requiredKind, one superseded
// duplicate of the weather message, and one decoy. Not the authored
// twelve; section 02 writes those.
const FIXTURE_PAYLOAD: OutlookPayload = {
  messages: [
    {
      id: 'M01',
      from: 'NODE 7',
      to: 'WEATHER DESK',
      subject: 'STORM OUTLOOK',
      body: ['WEATHER EVIDENCE'],
      recordId: 'W02',
      requiredKind: 'weather',
      correctRecipient: 'WEATHER_DESK',
      supersededBy: null,
    },
    {
      id: 'M02',
      from: 'NODE 7',
      to: 'WEATHER DESK',
      subject: 'STORM OUTLOOK REV A',
      body: ['STALE WEATHER COPY'],
      recordId: 'W01',
      requiredKind: 'weather',
      correctRecipient: 'WEATHER_DESK',
      supersededBy: 'M01',
    },
    {
      id: 'M03',
      from: 'PAY NODE',
      to: 'PAYROLL DESK',
      subject: 'PAYROLL RUN',
      body: ['PAYROLL EVIDENCE'],
      recordId: 'B04',
      requiredKind: 'payroll',
      correctRecipient: 'PAYROLL_DESK',
      supersededBy: null,
    },
    {
      id: 'M04',
      from: 'AUDIT NODE',
      to: 'AUDIT DESK',
      subject: 'AUDIT EXPORT',
      body: ['AUDIT EVIDENCE', 'EXPORT FEED R04'],
      recordId: 'C17',
      requiredKind: 'audit',
      correctRecipient: 'AUDIT_DESK',
      supersededBy: null,
    },
    {
      id: 'M05',
      from: 'UNKNOWN',
      to: null,
      subject: 'CHAIN LETTER',
      body: ['DECOY NOISE'],
      recordId: null,
      requiredKind: null,
      correctRecipient: null,
      supersededBy: null,
    },
  ],
  channelTuning: {
    backupCapacity: 5,
    primaryEtaSeconds: [30, 90],
    backupEtaSeconds: 120,
  },
  stageChanges: [
    {
      offsetSeconds: 60,
      warningLine: 'PRIMARY LINK DEGRADING. ACK TIMES RISING.',
      cueId: 'tone-fall-1',
    },
    {
      offsetSeconds: 120,
      warningLine: 'PRIMARY LINK DARK. BACKUP REMAINS USABLE TO THE DEADLINE.',
      cueId: 'tone-fall-2',
    },
    {
      offsetSeconds: 180,
      warningLine: 'STAGE THREE RESERVED.',
      cueId: 'tone-fall-3',
    },
  ],
  warningOffsets: [
    {
      secondsBeforeEnd: 30,
      warningLine: 'THIRTY SECONDS TO DEADLINE.',
      cueId: 'tone-warn-30',
    },
    {
      secondsBeforeEnd: 10,
      warningLine: 'TEN SECONDS TO DEADLINE.',
      cueId: 'tone-warn-10',
    },
  ],
  commsDelayedTable: {
    full: 0,
    partial: 10,
    poor: 20,
    failed: 30,
  },
}

const DURATION_MS = 240_000
const T0 = 1_000_000

const outlookModule = makeOutlookMission(FIXTURE_PAYLOAD)

function makeOutlookContext(): EngineContext {
  const overrides: Partial<SeedDefinition> = {
    missionPayloads: { outlook: FIXTURE_PAYLOAD },
    schedules: { outlook: [...outlookSchedule(FIXTURE_PAYLOAD)] },
    missionDurationsMs: { outlook: DURATION_MS },
  }
  return buildTestContext(FIXTURE_RECORDS, overrides, {
    missions: { outlook: outlookModule },
    missionOrder: ['outlook'],
  })
}

const ctx = makeOutlookContext()

function fresh(extended = false): CampaignState {
  return createCampaign(ctx, 'test-seed', { extendedTime: extended })
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

function sub(state: CampaignState): OutlookState {
  return state.activeMission?.substate as OutlookState
}

function send(messageId: string, recipient: string, channel = 'primary') {
  return {
    type: 'MISSION_ACTION' as const,
    payload: { kind: 'SEND', messageId, channel, recipient },
  }
}

describe('outlook init', () => {
  it('produces the empty starting state', () => {
    const started = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
    ])
    const s = sub(started.state)
    expect(s.queue).toEqual([])
    expect(s.sends).toEqual([])
    expect(s.primaryStage).toBe(0)
    expect(s.backupRemaining).toBe(5)
    expect(s.deliveredRequired.weather.delivered).toBe(false)
    expect(s.deliveredRequired.payroll.delivered).toBe(false)
    expect(s.deliveredRequired.audit.delivered).toBe(false)
    expect(s.auditRead).toBe(false)
  })

  it('round-trips the engine-produced substate through the saveSchema', () => {
    const started = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
    ])
    const schema = ctx.missions['outlook']!.saveSchema
    const substate = started.state.activeMission?.substate
    const revived = v.parse(schema, JSON.parse(JSON.stringify(substate)))
    expect(revived).toEqual(substate)
  })
})

describe('outlook schedule', () => {
  it('fires stage changes in authored order via scheduledEventFired', () => {
    const emitted = advanceCampaign(
      ctx,
      run(fresh(), [
        [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
      ]).state,
      T0 + 130_000,
    ).emitted
    const stageFires = emitted
      .filter((e) => e.type === 'scheduledEventFired' && e.kind === 'outlookStage')
      .map((e) => (e as { id: string }).id)
    expect(stageFires).toEqual(['outlook-stage-1', 'outlook-stage-2'])
  })

  it('flips primaryStage 0 to 1 to 2 as its stage events fire', () => {
    const started = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
    ]).state
    const atStage1 = advanceCampaign(ctx, started, T0 + 70_000).state
    expect(sub(atStage1).primaryStage).toBe(1)
    const atStage2 = advanceCampaign(ctx, atStage1, T0 + 130_000).state
    expect(sub(atStage2).primaryStage).toBe(2)
  })

  it('rejects a direct primary send once the primary is dark', () => {
    const started = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
    ]).state
    const dark = advanceCampaign(ctx, started, T0 + 130_000).state
    const rejected = dispatch(ctx, dark, send('M01', 'WEATHER_DESK'), T0 + 131_000)
    expect(rejected.rejection?.rejected).toBe(true)
    expect(sub(rejected.state).sends).toHaveLength(0)
  })
})

describe('outlook read and flag', () => {
  it('toggles read and flag marks', () => {
    const started = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
      [{ type: 'MISSION_ACTION', payload: { kind: 'READ', messageId: 'M05' } }, T0 + 1_000],
      [{ type: 'MISSION_ACTION', payload: { kind: 'FLAG', messageId: 'M05' } }, T0 + 2_000],
    ])
    const s = sub(started.state)
    expect(s.messages['M05']?.read).toBe(true)
    expect(s.messages['M05']?.flagged).toBe(true)
  })
})

describe('outlook queue', () => {
  it('QUEUE is free and stores messageId and channel only', () => {
    const started = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
      [
        { type: 'MISSION_ACTION', payload: { kind: 'QUEUE', messageId: 'M01', channel: 'backup' } },
        T0 + 1_000,
      ],
    ])
    const s = sub(started.state)
    expect(s.queue).toEqual([{ messageId: 'M01', channel: 'backup' }])
    expect(s.backupRemaining).toBe(5)
    expect(s.sends).toHaveLength(0)
  })

  it('dispatching a queued primary send to a dark primary rejects and leaves it queued', () => {
    const queued = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
      [
        {
          type: 'MISSION_ACTION',
          payload: { kind: 'QUEUE', messageId: 'M01', channel: 'primary' },
        },
        T0 + 1_000,
      ],
    ]).state
    const dark = advanceCampaign(ctx, queued, T0 + 130_000).state
    const dispatched = dispatch(
      ctx,
      dark,
      {
        type: 'MISSION_ACTION',
        payload: { kind: 'SEND_QUEUED', index: 0, recipient: 'WEATHER_DESK' },
      },
      T0 + 131_000,
    )
    expect(dispatched.rejection?.rejected).toBe(true)
    expect(sub(dispatched.state).queue).toHaveLength(1)
    expect(sub(dispatched.state).sends).toHaveLength(0)
  })
})

describe('outlook sends and acknowledgments', () => {
  it('backup send spends capacity and logs a send record', () => {
    const started = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
      [send('M01', 'WEATHER_DESK', 'backup'), T0 + 1_000],
    ])
    const s = sub(started.state)
    expect(s.backupRemaining).toBe(4)
    expect(s.sends).toHaveLength(1)
    expect(s.sends[0]?.scheduledAckAt).toBe(T0 + 1_000 + 120_000)
  })

  it('primary send spends no capacity and uses stage 0 ETA', () => {
    const started = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
      [send('M01', 'WEATHER_DESK', 'primary'), T0 + 1_000],
    ])
    const s = sub(started.state)
    expect(s.backupRemaining).toBe(5)
    expect(s.sends[0]?.scheduledAckAt).toBe(T0 + 1_000 + 30_000)
  })

  it('a send stays pending until a later wake folds its ack, then is delivered', () => {
    // Primary stage-0 ack lands at T0 + 31s. Advancing to T0 + 40s fires
    // no event (the first stage change is at 60s), so nothing folds and
    // the delivery is still pending even though wall time passed its ack.
    const started = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
      [send('M01', 'WEATHER_DESK', 'primary'), T0 + 1_000],
    ]).state
    const quiet = advanceCampaign(ctx, started, T0 + 40_000).state
    expect(sub(quiet).sends[0]?.resolution).toBe('pending')
    expect(sub(quiet).deliveredRequired.weather.delivered).toBe(false)
    // The stage-1 event at 60s is the next wake past the ack time: it
    // folds the ack and the delivery lands.
    const folded = advanceCampaign(ctx, quiet, T0 + 70_000).state
    expect(sub(folded).sends[0]?.resolution).toBe('acknowledged')
    expect(sub(folded).deliveredRequired.weather.delivered).toBe(true)
    expect(sub(folded).deliveredRequired.weather.correct).toBe(true)
  })

  it('wrong recipient spends and logs but does not satisfy the delivery', () => {
    const started = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
      [send('M01', 'PAYROLL_DESK', 'primary'), T0 + 1_000],
    ]).state
    const later = advanceCampaign(ctx, started, T0 + 70_000).state
    expect(sub(later).sends).toHaveLength(1)
    expect(sub(later).deliveredRequired.weather.correct).toBe(false)
  })

  it('a superseded message spends but never satisfies its requiredKind', () => {
    const started = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
      [send('M02', 'WEATHER_DESK', 'primary'), T0 + 1_000],
    ]).state
    const later = advanceCampaign(ctx, started, T0 + 70_000).state
    expect(sub(later).sends).toHaveLength(1)
    expect(sub(later).deliveredRequired.weather.delivered).toBe(false)
  })

  it('an acknowledged delivery to the wrong desk reads as DELIVERED TO WRONG DESK and does not count toward tier', () => {
    // M01 (weather) correctly to WEATHER_DESK, M03 (payroll) routed to the
    // wrong desk. Advance past a wake so both acks fold.
    const started = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
      [send('M01', 'WEATHER_DESK', 'primary'), T0 + 1_000],
      [send('M03', 'AUDIT_DESK', 'primary'), T0 + 2_000],
    ]).state
    const folded = advanceCampaign(ctx, started, T0 + 70_000).state
    const s = sub(folded)
    expect(s.deliveredRequired.weather).toEqual({ delivered: true, correct: true })
    // Payroll acked but to the wrong desk: delivered true, correct false.
    expect(s.deliveredRequired.payroll).toEqual({ delivered: true, correct: false })
    // Only the correct weather delivery counts toward tier.
    const timedOut = advanceCampaign(ctx, folded, T0 + DURATION_MS + 1_000).state
    const outcome = timedOut.settled.find((o) => o.missionId === 'outlook')!
    expect(outcome.metrics['required_delivered']).toBe(1)
    const debrief = outlookModule.debrief!(outcome)
    expect(debrief.lines).toContain('REQUIRED PAYROLL: DELIVERED TO WRONG DESK')
    expect(debrief.lines).toContain('REQUIRED WEATHER: DELIVERED CORRECT')
    expect(debrief.lines).toContain('REQUIRED AUDIT: NOT DELIVERED')
  })
})

describe('outlook settlement', () => {
  it('completes early when the third correct ack LANDS, not at send dispatch', () => {
    // Three correct primary stage-0 sends near T0. Their acks are
    // scheduled at send + 30s (about T0 + 31s..33s), well before the 240s
    // deadline. No scheduled event fires between the sends and 60s, so at
    // SEND dispatch the acks are still pending and the mission must NOT
    // have settled. Completion fires only when a later wake past the third
    // ack time folds the acks.
    const sent = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
      [send('M01', 'WEATHER_DESK', 'primary'), T0 + 1_000],
      [send('M03', 'PAYROLL_DESK', 'primary'), T0 + 2_000],
      [send('M04', 'AUDIT_DESK', 'primary'), T0 + 3_000],
    ])
    expect(sent.emitted.filter((e) => e.type === 'settlement')).toHaveLength(0)
    expect(sent.state.phase).toBe('mission')
    // A wake just before the third ack time (T0 + 33s) still has it
    // pending, so no completion: fold only resolves acks whose time has
    // elapsed, and here nothing has advanced past them via an event yet.
    const beforeThird = advanceCampaign(ctx, sent.state, T0 + 32_000)
    expect(beforeThird.emitted.filter((e) => e.type === 'settlement')).toHaveLength(0)
    expect(beforeThird.state.phase).toBe('mission')
    // The stage-1 event at 60s is the next wake, now well past all three
    // ack times (<= 33s): it folds the three acks and the third landing
    // settles the mission completed, mid-mission, far from the deadline.
    const done = advanceCampaign(ctx, beforeThird.state, T0 + 70_000)
    const settlements = done.emitted.filter((e) => e.type === 'settlement')
    expect(settlements).toHaveLength(1)
    expect(settlements[0]).toMatchObject({ cause: 'completed', tier: 'full' })
    expect(done.state.phase).toBe('debrief')
    expect(done.state.lastNow).toBeLessThan(T0 + DURATION_MS)
  })

  it('times out and settles exactly once when nothing is delivered', () => {
    const base = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
    ]).state
    const timedOut = advanceCampaign(ctx, base, T0 + DURATION_MS + 1_000)
    const settlements = timedOut.emitted.filter((e) => e.type === 'settlement')
    expect(settlements).toHaveLength(1)
    expect(settlements[0]).toMatchObject({ cause: 'timeout', tier: 'failed' })
  })

  it('buzzer: an ack scheduled exactly at endsAt folds at the deadline tick and settles completed, draining before the timeout guard', () => {
    // Backup ETA is 120s. Send three on backup at endsAt - 120s so their
    // acks are scheduled to land exactly at endsAt. At SEND dispatch the
    // acks are pending, so NOTHING settles yet. The settle tick authored
    // at endsAt folds the three boundary acks (scheduledAt == endsAt,
    // on-time) before the timeout guard runs, so advancing to endsAt
    // settles completed, never timeout.
    const endsAt = T0 + DURATION_MS
    const sendAt = endsAt - 120_000
    const queued = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
      [send('M01', 'WEATHER_DESK', 'backup'), sendAt],
      [send('M03', 'PAYROLL_DESK', 'backup'), sendAt],
      [send('M04', 'AUDIT_DESK', 'backup'), sendAt],
    ])
    // At dispatch the boundary acks are pending: no settlement on SEND.
    expect(queued.emitted.filter((e) => e.type === 'settlement')).toHaveLength(0)
    expect(queued.state.phase).toBe('mission')
    expect(sub(queued.state).sends.every((s) => s.resolution === 'pending')).toBe(true)
    // Advance exactly to endsAt: the tick folds the on-time acks before
    // the timeout guard, so the deadline settles completed.
    const buzzer = advanceCampaign(ctx, queued.state, endsAt)
    const settlements = buzzer.emitted.filter((e) => e.type === 'settlement')
    expect(settlements).toHaveLength(1)
    expect(settlements[0]).toMatchObject({ cause: 'completed', tier: 'full' })
    // Advancing past the deadline must not settle a second time.
    const after = advanceCampaign(ctx, buzzer.state, endsAt + 1_000)
    expect(after.emitted.filter((e) => e.type === 'settlement')).toHaveLength(0)
  })

  it('a mission short of three acks at endsAt settles timeout, not completed', () => {
    // Only two correct backup sends on time. Their acks fold at the
    // endsAt tick but the third is missing, so the deadline settles
    // timeout at a partial tier, exactly once.
    const endsAt = T0 + DURATION_MS
    const sendAt = endsAt - 120_000
    const queued = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
      [send('M01', 'WEATHER_DESK', 'backup'), sendAt],
      [send('M03', 'PAYROLL_DESK', 'backup'), sendAt],
    ])
    expect(queued.emitted.filter((e) => e.type === 'settlement')).toHaveLength(0)
    const buzzer = advanceCampaign(ctx, queued.state, endsAt)
    const settlements = buzzer.emitted.filter((e) => e.type === 'settlement')
    expect(settlements).toHaveLength(1)
    expect(settlements[0]).toMatchObject({ cause: 'timeout', tier: 'partial' })
    // The two on-time acks still folded to acknowledged at the tick.
    const outcome = buzzer.state.settled.find((o) => o.missionId === 'outlook')!
    expect(outcome.metrics['required_delivered']).toBe(2)
  })

  it('forfeit settles once at the current acknowledged satisfied count', () => {
    const base = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
      [send('M01', 'WEATHER_DESK', 'primary'), T0 + 1_000],
    ]).state
    // Advance past the stage-1 wake at 60s so the single correct ack folds
    // to acknowledged, then forfeit: the satisfied count is a real
    // acknowledged delivery, so the tier is poor (one), not failed.
    const acked = advanceCampaign(ctx, base, T0 + 70_000).state
    expect(sub(acked).sends[0]?.resolution).toBe('acknowledged')
    const forfeited = dispatch(ctx, acked, { type: 'FORFEIT_MISSION' }, T0 + 71_000)
    const settlements = forfeited.emitted.filter((e) => e.type === 'settlement')
    expect(settlements).toHaveLength(1)
    expect(settlements[0]).toMatchObject({ cause: 'forfeit', tier: 'poor' })
  })
})

describe('outlook clue flow', () => {
  it('reading the audit message emits clueFound exactly once even when read twice, and it survives a timeout', () => {
    const read = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
      [{ type: 'MISSION_ACTION', payload: { kind: 'READ', messageId: 'M04' } }, T0 + 1_000],
      [{ type: 'MISSION_ACTION', payload: { kind: 'READ', messageId: 'M04' } }, T0 + 2_000],
    ])
    const clueEvents = read.emitted.filter((e) => e.type === 'clueFound')
    expect(clueEvents).toHaveLength(1)
    expect(clueEvents[0]).toMatchObject({ clueId: OUTLOOK_CLUE_ID })
    // Clue survives a mission that then times out.
    const timedOut = advanceCampaign(ctx, read.state, T0 + DURATION_MS + 1_000)
    expect(timedOut.state.cluesFound).toContain(OUTLOOK_CLUE_ID)
  })
})

describe('outlook debrief', () => {
  it('reports per-delivery outcomes, decoy capacity spent, and the clue flag', () => {
    const base = run(fresh(), [
      [{ type: 'START_MISSION', missionId: 'outlook' }, T0],
      [{ type: 'MISSION_ACTION', payload: { kind: 'READ', messageId: 'M04' } }, T0 + 500],
      [send('M01', 'WEATHER_DESK', 'primary'), T0 + 1_000],
      [send('M05', 'WEATHER_DESK', 'backup'), T0 + 2_000],
    ]).state
    const timedOut = advanceCampaign(ctx, base, T0 + DURATION_MS + 1_000).state
    const outcome = timedOut.settled.find((o) => o.missionId === 'outlook')!
    const payload = outlookModule.debrief!(outcome)
    expect(payload.missionId).toBe('outlook')
    expect(payload.clueId).toBe(OUTLOOK_CLUE_ID)
    expect(payload.lines.some((l) => l.includes('WEATHER'))).toBe(true)
    expect(payload.lines.some((l) => l.includes('DECOY'))).toBe(true)
  })
})
