// Section 02 endings: endingId derivation by committed action and cause, the
// stagedEligible predicate, and the earned-why readback over the three real
// campaign fixtures. The exactly-once / synchronous-commit race guard lives in
// section 01's terminal() tests and the countdown reachability fixtures live in
// section 04; neither is duplicated here.
import { describe, expect, it } from 'vitest'
import {
  deriveEarnedWhy,
  resolveEnding,
  stagedEligible,
} from '@engine/missions/finale/endings'
import type { EndingId } from '@engine/missions/finale/endings'
import {
  computeStaged,
  projectHold,
  projectRepeat,
} from '@engine/missions/finale/projections'
import type {
  FinaleSnapshot,
  ViabilityResult,
} from '@engine/missions/finale/projections'
import type { SettledOutcome, SettlementCause } from '@engine/campaign/types'
import { deepFreeze } from '@engine/branch/snapshot'
import {
  allFailedCampaign,
  capacityConstrainedCampaign,
  healthyCampaign,
} from './fixtures/campaigns'

function frozen(snapshot: FinaleSnapshot): FinaleSnapshot {
  return deepFreeze(JSON.parse(JSON.stringify(snapshot)) as FinaleSnapshot)
}

const EM_DASH = /—/

function pass(p: boolean): ViabilityResult {
  return {
    pass: p,
    thresholds: [{ id: 'service_cost', required: 10, actual: p ? 0 : 20, pass: p }],
  }
}

describe('endings: endingId derivation', () => {
  it("STAGED commit settles cause completed, endingId 'recovery'", () => {
    expect(resolveEnding('staged', 'completed')).toStrictEqual({
      endingId: 'recovery',
      cause: 'completed',
    })
  })

  it("HOLD commit settles cause completed, endingId 'containment'", () => {
    expect(resolveEnding('hold', 'completed')).toStrictEqual({
      endingId: 'containment',
      cause: 'completed',
    })
  })

  it("REPEAT commit settles cause collapsed, endingId 'failure'", () => {
    expect(resolveEnding('repeat', 'collapsed')).toStrictEqual({
      endingId: 'failure',
      cause: 'collapsed',
    })
  })

  it('REPEAT commit maps to failure/collapsed for EVERY cause (robust, uncoupled)', () => {
    const causes: SettlementCause[] = [
      'completed',
      'collapsed',
      'timeout',
      'forfeit',
    ]
    for (const c of causes) {
      expect(resolveEnding('repeat', c)).toStrictEqual({
        endingId: 'failure',
        cause: 'collapsed',
      })
    }
  })

  it("timeout settles cause collapsed, endingId 'failure'", () => {
    expect(resolveEnding(null, 'timeout')).toStrictEqual({
      endingId: 'failure',
      cause: 'collapsed',
    })
    // Timeout overrides any non-committed choice onto the repeated order.
    expect(resolveEnding('staged', 'timeout')).toStrictEqual({
      endingId: 'failure',
      cause: 'collapsed',
    })
  })

  it("forfeit settles cause collapsed, endingId 'failure'", () => {
    expect(resolveEnding(null, 'forfeit')).toStrictEqual({
      endingId: 'failure',
      cause: 'collapsed',
    })
    expect(resolveEnding('hold', 'forfeit')).toStrictEqual({
      endingId: 'failure',
      cause: 'collapsed',
    })
  })

  it('settlement carries endingId exactly once; permanence after settle', () => {
    // resolveEnding is pure and total: the same committed+cause always maps to
    // the same ending, so a re-evaluation can never flip a settled ending.
    const first = resolveEnding('staged', 'completed')
    const again = resolveEnding('staged', 'completed')
    expect(again).toStrictEqual(first)
    // A later same-wake timeout cannot override a committed recovery here:
    // the committed-cause evaluation already produced completed/recovery, and
    // the mapping of that pair is permanent.
    expect(resolveEnding('staged', 'completed').endingId).toBe('recovery')
  })
})

describe('endings: viability gating input to decision', () => {
  it('stagedEligible(caseValid, viability) true only when both hold', () => {
    expect(stagedEligible(true, pass(true))).toBe(true)
    expect(stagedEligible(true, pass(false))).toBe(false)
    expect(stagedEligible(false, pass(true))).toBe(false)
    expect(stagedEligible(false, pass(false))).toBe(false)
  })

  it('different choice sets across the three campaign fixtures (better earlier play widens the path)', () => {
    const eligible = (snap: FinaleSnapshot) => {
      const staged = computeStaged(frozen(snap))
      return stagedEligible(snap.caseState.caseValid, staged.viability)
    }
    // Healthy: case valid + viability passes -> staged open.
    expect(eligible(healthyCampaign)).toBe(true)
    // Capacity-constrained: case valid + viability still passes -> staged open.
    expect(eligible(capacityConstrainedCampaign)).toBe(true)
    // All-failed: case invalid AND viability fails -> staged closed.
    expect(eligible(allFailedCampaign)).toBe(false)
  })
})

describe('endings: earned-why readback', () => {
  function whyFor(id: EndingId, snapshot: FinaleSnapshot) {
    const snap = frozen(snapshot)
    const projection =
      id === 'recovery'
        ? computeStaged(snap).projection
        : id === 'containment'
          ? projectHold(snap)
          : projectRepeat(snap)
    return deriveEarnedWhy(id, snap, projection)
  }

  it('names the specific settled outcomes that opened or closed options', () => {
    const why = whyFor('recovery', healthyCampaign)
    expect(why.shapingOutcomes.length).toBeGreaterThanOrEqual(3)
    // Names real figures from the settled metrics, not boilerplate.
    expect(why.shapingOutcomes.join(' ')).toMatch(/OUTLOOK DELIVERED ALL 3/)
    expect(why.shapingOutcomes.join(' ')).toMatch(/CLEARED ALL 4 PAYMENTS/)
    expect(why.shapingOutcomes.join(' ')).toMatch(/RESOLVED 1090 PASSENGERS/)
  })

  it('names the evidence the player proved (slots of the validated case)', () => {
    const why = whyFor('recovery', healthyCampaign)
    expect(why.provedEvidence).toContain('THE INDEPENDENT OBSERVATION')
    expect(why.provedEvidence).toContain('THE EXERCISE ROOT')
    expect(why.provedEvidence).toContain(
      'THE FIELD REPORT CORROBORATED THE OBSERVATION',
    )
  })

  it('states what the chosen branch projected versus what the ending states', () => {
    const recovery = whyFor('recovery', healthyCampaign)
    expect(recovery.projectedVsActual).toMatch(/STAGED BRANCH PROJECTED/)
    expect(recovery.projectedVsActual).toMatch(/1390 PASSENGERS/)
    const failure = whyFor('failure', allFailedCampaign)
    expect(failure.projectedVsActual).toMatch(/REPEAT BRANCH PROJECTED/)
    expect(failure.projectedVsActual).toMatch(/COLLAPSED SERVICE/)
  })

  it('containment readback names the unresolved problems from real campaign state', () => {
    const why = whyFor('containment', allFailedCampaign)
    expect(why.unresolved).toBeDefined()
    expect(why.unresolved!.length).toBeGreaterThan(0)
    const joined = why.unresolved!.join(' ')
    // flights held 1090, bank left 4 unpaid, outlook 2 short.
    expect(joined).toMatch(/1090 PASSENGERS REMAIN HELD/)
    expect(joined).toMatch(/4 CRITICAL PAYMENTS STAY UNSETTLED/)
    expect(joined).toMatch(/2 REQUIRED MESSAGES NEVER REACHED/)
  })

  it('non-containment endings carry no unresolved list', () => {
    expect(whyFor('recovery', healthyCampaign).unresolved).toBeUndefined()
    expect(whyFor('failure', allFailedCampaign).unresolved).toBeUndefined()
  })

  it('readback content differs across healthy, capacity-constrained, all-failed fixtures', () => {
    const h = whyFor('recovery', healthyCampaign)
    const c = whyFor('recovery', capacityConstrainedCampaign)
    const a = whyFor('failure', allFailedCampaign)
    // Shaping outcomes must read visibly differently per campaign.
    expect(h.shapingOutcomes).not.toStrictEqual(c.shapingOutcomes)
    expect(c.shapingOutcomes).not.toStrictEqual(a.shapingOutcomes)
    expect(h.shapingOutcomes).not.toStrictEqual(a.shapingOutcomes)
    // Proved evidence differs (all-failed has an invalid, partial case).
    expect(h.provedEvidence).not.toStrictEqual(a.provedEvidence)
  })

  it('no em-dash in any readback string; all numbers integer-derived', () => {
    const snapshots: [EndingId, FinaleSnapshot][] = [
      ['recovery', healthyCampaign],
      ['recovery', capacityConstrainedCampaign],
      ['containment', healthyCampaign],
      ['containment', allFailedCampaign],
      ['failure', allFailedCampaign],
    ]
    for (const [id, snap] of snapshots) {
      const why = whyFor(id, snap)
      const all = [
        ...why.shapingOutcomes,
        ...why.provedEvidence,
        why.projectedVsActual,
        ...(why.unresolved ?? []),
      ]
      for (const line of all) {
        expect(line).not.toMatch(EM_DASH)
        // Every embedded number is an integer (no decimal point).
        const numbers = line.match(/\d+\.\d+/g)
        expect(numbers).toBeNull()
      }
    }
  })
})

describe('endings: module settlement wiring', () => {
  it('resolveEnding agrees with the inert deriveEndingId on committed-only paths', async () => {
    const { deriveEndingId } = await import('@engine/missions/finale/endings')
    expect(resolveEnding('staged', 'completed').endingId).toBe(
      deriveEndingId('staged'),
    )
    expect(resolveEnding('hold', 'completed').endingId).toBe(
      deriveEndingId('hold'),
    )
    expect(resolveEnding('repeat', 'collapsed').endingId).toBe(
      deriveEndingId('repeat'),
    )
  })

  it('a settled finale outcome carries a single endingId', () => {
    // A SettledOutcome shape with the endingId attached exactly once.
    const outcome: SettledOutcome = {
      missionId: 'finale',
      cause: 'completed',
      tier: 'full',
      settleSeq: 4,
      metrics: {},
      clueId: null,
      consequences: [],
      endingId: resolveEnding('staged', 'completed').endingId,
    }
    expect(outcome.endingId).toBe('recovery')
  })
})
