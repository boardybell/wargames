import { describe, expect, it } from 'vitest'
import { createCampaign } from '@engine/campaign/engine'
import { selectMenuRows } from '@engine/campaign/selectors'
import type { CampaignState } from '@engine/campaign/state'
import {
  buildCtx,
  foldEnvelopes,
  walkthroughLog,
  MISSION_IDS,
  T0,
} from './helpers'
import { canonicalStringify } from '../harness/canonical'

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]]
  const out: T[][] = []
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
    for (const p of permutations(rest)) out.push([item, ...p])
  })
  return out
}

function playOrder(order: readonly string[]): CampaignState {
  const ctx = buildCtx()
  const initial = createCampaign(ctx, 'test-seed', { extendedTime: false }, T0)
  return foldEnvelopes(ctx, initial, walkthroughLog(order)).state
}

// The ORDER-INDEPENDENT terminal facts of the campaign, derived from the
// actual end state of each play order (not a static constant). What
// legitimately differs by order — settleSeq, lastNow, the exact
// consequence-application targets, the queues — is excluded; what must be
// invariant is included.
function terminalFingerprint(state: CampaignState): string {
  return canonicalStringify({
    settled: [...state.settled]
      .sort((a, b) => (a.missionId < b.missionId ? -1 : 1))
      .map((s) => ({
        missionId: s.missionId,
        tier: s.tier,
        cause: s.cause,
        clueId: s.clueId,
        metrics: s.metrics,
      })),
    acknowledged: [...state.acknowledgedDebriefs].sort(),
    cluesFound: [...state.cluesFound].sort(),
    finaleUnlocked: selectMenuRows(state, MISSION_IDS, 'finale').finaleUnlocked,
  })
}

describe('six-permutation outcome invariance', () => {
  const orders = permutations(MISSION_IDS)

  it('generates all six orderings', () => {
    expect(orders).toHaveLength(6)
  })

  it('every ordering reaches the finale gate with all three settled full', () => {
    for (const order of orders) {
      const state = playOrder(order)
      expect(selectMenuRows(state, MISSION_IDS, 'finale').finaleUnlocked).toBe(
        true,
      )
      expect(state.settled.map((s) => s.missionId).sort()).toEqual([
        'alpha',
        'beta',
        'gamma',
      ])
      expect(state.settled.every((s) => s.tier === 'full')).toBe(true)
    }
  })

  it('the terminal outcome facts are byte-identical across all six orderings', () => {
    // Derived from each run's real end state, so a settlement that depended
    // on play order (a bug) would split the set. It does not.
    const fingerprints = orders.map((order) =>
      terminalFingerprint(playOrder(order)),
    )
    expect(new Set(fingerprints).size).toBe(1)
  })

  it('the fingerprint actually discriminates (not a constant)', () => {
    // Negative anchor: a campaign that did NOT play to completion must
    // produce a different fingerprint, so the invariance above is a real
    // equality, not a function that returns the same string for everything.
    const complete = terminalFingerprint(playOrder(MISSION_IDS))
    const ctx = buildCtx()
    const partial = foldEnvelopes(
      ctx,
      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
      walkthroughLog(['alpha']),
    ).state
    expect(terminalFingerprint(partial)).not.toBe(complete)
  })
})
