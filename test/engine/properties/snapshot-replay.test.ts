import { describe, expect, it } from 'vitest'
import { createCampaign } from '@engine/campaign/engine'
import { snapshot } from '@engine/branch'
import {
  buildCtx,
  foldEnvelopes,
  walkthroughLog,
  MISSION_IDS,
  T0,
} from './helpers'
import { canonicalStringify, stateHash } from '../harness/canonical'

// Replaying the suffix of an envelope log on top of a snapshot taken at the
// midpoint reproduces the full run's final state exactly. The snapshot is
// frozen; replay runs on a fresh unfrozen structured clone, exactly as the
// branch runner does.
describe('snapshot-replay equivalence', () => {
  const log = walkthroughLog(MISSION_IDS)
  const ctx = buildCtx()
  const initial = createCampaign(ctx, 'test-seed', { extendedTime: false }, T0)
  const full = foldEnvelopes(ctx, initial, log)

  // trail[k] is the state after k envelopes; pick early, middle, late.
  const indices = [1, Math.floor(log.length / 2), log.length - 1]

  for (const k of indices) {
    it(`replaying envelopes after index ${k} matches the full run`, () => {
      const snap = snapshot(full.trail[k]!)
      const resumed = structuredClone(snap)
      const suffix = log.slice(k)
      const replayed = foldEnvelopes(ctx, resumed, suffix)
      expect(replayed.state).toStrictEqual(full.state)
      expect(stateHash(replayed.state)).toBe(stateHash(full.state))
      // The replayed suffix also reproduces the full run's emitted tail,
      // so the event stream is as deterministic as the state.
      const fullTail = foldEnvelopes(ctx, full.trail[k]!, suffix).emitted
      expect(canonicalStringify(replayed.emitted)).toBe(
        canonicalStringify(fullTail),
      )
    })
  }

  it('the snapshot taken for replay is never mutated by the replay', () => {
    const k = indices[1]!
    const snap = snapshot(full.trail[k]!)
    const snapHash = stateHash(snap)
    const resumed = structuredClone(snap)
    foldEnvelopes(ctx, resumed, log.slice(k))
    expect(stateHash(snap)).toBe(snapHash)
  })
})
