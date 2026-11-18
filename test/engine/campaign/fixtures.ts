import type { EngineContext } from '@engine/campaign/engine'
import type { SeedDefinition } from '@engine/missions/types'
import { buildTestContext } from '@engine/testing'
import { FIXTURE_RECORDS } from '../records/fixtures'

export const MISSIONS = ['alpha', 'beta', 'gamma'] as const

const SEED_OVERRIDES: Partial<SeedDefinition> = {
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
}

export function makeContext(): EngineContext {
  return buildTestContext(FIXTURE_RECORDS, SEED_OVERRIDES)
}

export const TEST_SEED: SeedDefinition =
  makeContext().seeds['test-seed']!
