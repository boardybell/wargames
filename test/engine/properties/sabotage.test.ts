import { describe, expect, it } from 'vitest'
import { buildTestContext, makeTestDoubleMission } from '@engine/testing'
import { createCampaign } from '@engine/campaign/engine'
import type { MissionModule } from '@engine/missions/types'
import {
  foldEnvelopes,
  walkthroughLog,
  MISSION_IDS,
  T0,
  type Envelope,
} from './helpers'
import { FIXTURE_RECORDS } from '../records/fixtures'
import { stateHash } from '../harness/canonical'

// A short log that leaves the mission ACTIVE, so the tainted substate is
// still present in state at the end (a completed mission discards substate
// at settlement, which would wash the sabotage out).
const activeLog: Envelope[] = [
  { action: { type: 'START_MISSION', missionId: 'alpha' }, now: T0 + 1_000 },
  {
    action: { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } },
    now: T0 + 2_000,
  },
]

// The harness must actually catch nondeterminism, or the run-twice suites
// prove nothing. Inject it through a test-only mission whose reduce reads
// Math.random — a seam that never touches src/engine/** (the lint gate
// protects that) and leaves nothing behind.
function sabotagedMission(id: string): MissionModule {
  const base = makeTestDoubleMission(id)
  return {
    ...base,
    reduce(state, event) {
      const looseReduce = base.reduce as (s: unknown, e: unknown) => unknown
      const next = looseReduce(state, event) as {
        inputLog?: unknown[]
        [k: string]: unknown
      }
      // Ambient entropy pushed into inputLog, a field the test-double schema
      // permits, so a future substate re-validation could not silently strip
      // the taint and turn this into a false green. Identical logs now
      // diverge run to run.
      return {
        ...next,
        inputLog: [...(next.inputLog ?? []), `taint:${Math.random()}`],
      }
    },
  } as MissionModule
}

describe('sabotage: the harness detects divergence', () => {
  it('a Math.random-tainted mission breaks run-twice (proving the check bites)', () => {
    const run = () => {
      const ctx = buildTestContext(FIXTURE_RECORDS, undefined, {
        missions: {
          alpha: sabotagedMission('alpha'),
          beta: sabotagedMission('beta'),
          gamma: sabotagedMission('gamma'),
        },
      })
      const initial = createCampaign(
        ctx,
        'test-seed',
        { extendedTime: false },
        T0,
      )
      return foldEnvelopes(ctx, initial, activeLog).state
    }
    const a = run()
    const b = run()
    expect(stateHash(a)).not.toBe(stateHash(b))
  })

  it('control: the un-sabotaged mission is deterministic under the same harness', () => {
    const log = walkthroughLog(MISSION_IDS)
    const run = () => {
      const ctx = buildTestContext(FIXTURE_RECORDS)
      const initial = createCampaign(
        ctx,
        'test-seed',
        { extendedTime: false },
        T0,
      )
      return foldEnvelopes(ctx, initial, log).state
    }
    expect(stateHash(run())).toBe(stateHash(run()))
  })
})
