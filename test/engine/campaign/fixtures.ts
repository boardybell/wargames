import type { EngineContext } from '@engine/campaign/engine'
import type { SeedDefinition } from '@engine/missions/types'
import { FIXTURE_RECORDS } from '../records/fixtures'
import { makeStubMission } from './stub-mission'

export const MISSIONS = ['alpha', 'beta', 'gamma'] as const

export const TEST_SEED: SeedDefinition = {
  name: 'test-seed',
  description: 'campaign machine fixture seed',
  seedNumber: 1984,
  exerciseRunId: 'R04',
  records: FIXTURE_RECORDS,
  deskChecks: [
    {
      recordId: 'W02',
      outcome: 'CONFIRMED',
      delaySeconds: 20,
      replyBody: ['FIELD DESK CONFIRMS LOCAL SCOPE'],
    },
    {
      recordId: 'C17',
      outcome: 'CONTRADICTED',
      delaySeconds: 400,
      replyBody: ['DESK FINDS NO OPERATIONAL BASIS'],
    },
    {
      recordId: 'B04',
      outcome: 'PENDING',
      delaySeconds: 15,
      replyBody: ['DESK QUEUE BACKED UP'],
    },
    {
      recordId: 'F06',
      outcome: 'UNKNOWN',
      delaySeconds: 15,
      replyBody: ['NO DESK RECORD'],
    },
  ],
  clueRecords: [{ recordId: 'F06', clueId: 'clue-restriction' }],
  missionPayloads: { alpha: null, beta: null, gamma: null },
  openExceptionsBaseline: 12,
  schedules: {
    alpha: [
      {
        id: 'warn-30',
        offsetSeconds: 30,
        anchor: 'end',
        kind: 'timerMilestone',
        payload: null,
      },
      {
        id: 'warn-10',
        offsetSeconds: 10,
        anchor: 'end',
        kind: 'timerMilestone',
        payload: null,
      },
      {
        id: 'mid-stage',
        offsetSeconds: 60,
        anchor: 'start',
        kind: 'stage',
        payload: null,
      },
    ],
    beta: [],
    gamma: [],
  },
  missionDurationsMs: { alpha: 240_000, beta: 240_000, gamma: 240_000 },
}

export function makeContext(): EngineContext {
  return {
    seeds: { 'test-seed': TEST_SEED },
    missions: {
      alpha: makeStubMission('alpha'),
      beta: makeStubMission('beta'),
      gamma: makeStubMission('gamma'),
    },
    missionOrder: [...MISSIONS],
  }
}
