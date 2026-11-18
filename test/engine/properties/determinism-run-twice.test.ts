import { describe, expect, it } from 'vitest'
import { createCampaign } from '@engine/campaign/engine'
import {
  buildCtx,
  foldEnvelopes,
  jsonSafetyViolations,
  timeoutLog,
  walkthroughLog,
  MISSION_IDS,
  T0,
} from './helpers'
import { canonicalStringify, stateHash } from '../harness/canonical'

function freshRun(log: ReturnType<typeof walkthroughLog>) {
  const ctx = buildCtx()
  const initial = createCampaign(ctx, 'test-seed', { extendedTime: false }, T0)
  return foldEnvelopes(ctx, initial, log)
}

describe('canonical helper sanity at the integration level', () => {
  it('key insertion order does not affect the hash', () => {
    const a = { x: 1, y: { p: 2, q: 3 } }
    const b = { y: { q: 3, p: 2 }, x: 1 }
    expect(stateHash(a)).toBe(stateHash(b))
  })

  it('negative zero hashes identically to positive zero', () => {
    expect(stateHash({ v: -0 })).toBe(stateHash({ v: 0 }))
  })
})

describe('run-twice determinism', () => {
  it('a full walkthrough folds to a bit-identical final state', () => {
    const log = walkthroughLog(MISSION_IDS)
    const first = freshRun(log)
    const second = freshRun(log)
    expect(second.state).toStrictEqual(first.state)
    expect(stateHash(second.state)).toBe(stateHash(first.state))
  })

  it('reproduces the identical emitted event sequence', () => {
    const log = walkthroughLog(MISSION_IDS)
    const first = freshRun(log)
    const second = freshRun(log)
    expect(canonicalStringify(second.emitted)).toBe(
      canonicalStringify(first.emitted),
    )
  })

  it('a timeout walkthrough is equally deterministic', () => {
    const log = timeoutLog()
    const first = freshRun(log)
    const second = freshRun(log)
    expect(second.state).toStrictEqual(first.state)
    expect(stateHash(second.state)).toBe(stateHash(first.state))
    // The expiry path actually settled the mission.
    expect(first.state.settled.some((s) => s.cause === 'timeout')).toBe(true)
  })

  it('discriminates: a different log produces a different hash (no stuck hash)', () => {
    // Guards against a degenerate stateHash that returns a constant, which
    // would make every determinism assertion pass vacuously.
    const full = freshRun(walkthroughLog(MISSION_IDS))
    const timed = freshRun(timeoutLog())
    expect(stateHash(full.state)).not.toBe(stateHash(timed.state))
  })

  it('every intermediate state along the fold is JSON-safe', () => {
    const run = freshRun(walkthroughLog(MISSION_IDS))
    for (const state of run.trail) {
      expect(jsonSafetyViolations(state)).toEqual([])
    }
  })
})
