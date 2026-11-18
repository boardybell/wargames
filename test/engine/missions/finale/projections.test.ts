// Section 02 projections: pure integer transforms over a frozen FinaleSnapshot.
// Golden values are pinned against the three campaign fixtures, each built from
// REAL mission walkthrough / adversarial / defensive end states. The
// single-computation rule (viability panel and STAGED column are one object)
// and snapshot/live-state immutability are asserted here.
import { describe, expect, it } from 'vitest'
import {
  baselineProjection,
  computeFinaleViability,
  computeStaged,
  projectHold,
  projectRepeat,
  runProjections,
  traceFor,
} from '@engine/missions/finale/projections'
import type {
  BranchId,
  FinaleSnapshot,
} from '@engine/missions/finale/projections'
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

// ── Golden projection vectors (hand-computed from the authored deltas over
//    the real settled-metric baselines; see fixtures/campaigns.ts) ──────

const REPEAT_GOLDEN = {
  healthy: { openExceptions: 6, deliveries: 1, passengers: 490, payments: 2, confidence: 55 },
  capacityConstrained: { openExceptions: 4, deliveries: 0, passengers: 490, payments: 0, confidence: 32 },
  allFailed: { openExceptions: 0, deliveries: 0, passengers: 0, payments: 0, confidence: 32 },
}

const HOLD_GOLDEN = {
  healthy: { openExceptions: 14, deliveries: 3, passengers: 1090, payments: 4, confidence: 80 },
  capacityConstrained: { openExceptions: 12, deliveries: 1, passengers: 1090, payments: 0, confidence: 57 },
  allFailed: { openExceptions: 4, deliveries: 1, passengers: 0, payments: 0, confidence: 57 },
}

const STAGED_GOLDEN = {
  healthy: { openExceptions: 9, deliveries: 4, passengers: 1390, payments: 5, confidence: 115 },
  capacityConstrained: { openExceptions: 7, deliveries: 2, passengers: 1390, payments: 1, confidence: 92 },
  allFailed: { openExceptions: 1, deliveries: 1, passengers: 100, payments: 0, confidence: 77 },
}

const FIXTURES = {
  healthy: healthyCampaign,
  capacityConstrained: capacityConstrainedCampaign,
  allFailed: allFailedCampaign,
} as const

type FixtureId = keyof typeof FIXTURES

const FIXTURE_IDS = Object.keys(FIXTURES) as FixtureId[]

describe('projections: pure transforms over settled metrics', () => {
  it.each(FIXTURE_IDS)('repeat branch golden values: %s', (id) => {
    expect(projectRepeat(frozen(FIXTURES[id]))).toStrictEqual(REPEAT_GOLDEN[id])
  })

  it.each(FIXTURE_IDS)('hold branch golden values: %s', (id) => {
    expect(projectHold(frozen(FIXTURES[id]))).toStrictEqual(HOLD_GOLDEN[id])
  })

  it.each(FIXTURE_IDS)('staged branch golden values: %s', (id) => {
    expect(computeStaged(frozen(FIXTURES[id])).projection).toStrictEqual(
      STAGED_GOLDEN[id],
    )
  })

  it('repeat runs are strictly equal (same inputs, deepStrictEqual outputs)', () => {
    const snap = frozen(healthyCampaign)
    const a = runProjections(snap)
    const b = runProjections(snap)
    expect(a).toStrictEqual(b)
    // And across every fixture.
    for (const id of FIXTURE_IDS) {
      const s = frozen(FIXTURES[id])
      expect(runProjections(s)).toStrictEqual(runProjections(s))
    }
  })

  it('projection run leaves the frozen baseline untouched (snapshot immutability)', () => {
    const snap = frozen(healthyCampaign)
    const before = JSON.parse(JSON.stringify(snap))
    runProjections(snap)
    expect(snap).toStrictEqual(before)
    expect(Object.isFrozen(snap)).toBe(true)
    expect(Object.isFrozen(snap.settled)).toBe(true)
  })

  it('projection run leaves a live (unfrozen) campaign-case state untouched', () => {
    // A live, UNFROZEN snapshot (no deep-freeze guard) is passed straight into
    // runProjections; the transforms must not mutate their own argument. We
    // snapshot an independent copy of its pre-call value and assert the live
    // object still deep-equals that copy after the call.
    const live = JSON.parse(JSON.stringify(healthyCampaign)) as FinaleSnapshot
    const before = structuredClone(live)
    runProjections(live)
    expect(live).toStrictEqual(before)
  })

  it('branch execution order is irrelevant: any permutation yields identical results', () => {
    const snap = frozen(capacityConstrainedCampaign)
    const repeatFirst = {
      repeat: projectRepeat(snap),
      hold: projectHold(snap),
      staged: computeStaged(snap),
    }
    const stagedFirst = {
      staged: computeStaged(snap),
      hold: projectHold(snap),
      repeat: projectRepeat(snap),
    }
    expect(repeatFirst.repeat).toStrictEqual(stagedFirst.repeat)
    expect(repeatFirst.hold).toStrictEqual(stagedFirst.hold)
    expect(repeatFirst.staged).toStrictEqual(stagedFirst.staged)
  })

  it('baseline projection reads the real settled figures', () => {
    expect(baselineProjection(frozen(healthyCampaign))).toStrictEqual({
      openExceptions: 12,
      deliveries: 3,
      passengers: 1090,
      payments: 4,
      confidence: 95,
    })
  })
})

describe('projections: viability-column single computation', () => {
  it('per-threshold pass/fail strict-equals values derived from the staged end state', () => {
    for (const id of FIXTURE_IDS) {
      const snap = frozen(FIXTURES[id])
      const staged = computeStaged(snap)
      // The panel reads staged.viability; the column reads staged.projection.
      // Both must be the SAME object graph rooted at staged.endState: the
      // projection the column renders IS staged.endState by reference.
      expect(staged.projection).toBe(staged.endState)
      // And the panel's viability is the same computation the standalone
      // selector returns from the same snapshot: no second formula exists.
      expect(staged.viability).toStrictEqual(computeFinaleViability(snap))
      // Per-threshold pass must re-derive from the actual vs required on the
      // SAME viability object the panel renders.
      for (const t of staged.viability.thresholds) {
        expect(t.pass).toBe(t.actual <= t.required)
      }
      // Overall pass is the AND of the per-threshold passes.
      expect(staged.viability.pass).toBe(
        staged.viability.thresholds.every((t) => t.pass),
      )
    }
  })

  it('viability thresholds derive from settled metrics: healthy passes, all-failed fails', () => {
    expect(computeFinaleViability(frozen(healthyCampaign)).pass).toBe(true)
    expect(computeFinaleViability(frozen(capacityConstrainedCampaign)).pass).toBe(
      true,
    )
    const failed = computeFinaleViability(frozen(allFailedCampaign))
    expect(failed.pass).toBe(false)
    // service_cost is the threshold the all-failed campaign breaks.
    const cost = failed.thresholds.find((t) => t.id === 'service_cost')!
    expect(cost.pass).toBe(false)
    expect(cost.actual).toBeGreaterThan(cost.required)
  })

  it('does not hardcode threshold numbers: the required values equal VIABILITY_THRESHOLDS', async () => {
    const { VIABILITY_THRESHOLDS } = await import('@engine/branch/types')
    const v = computeFinaleViability(frozen(healthyCampaign))
    for (const t of VIABILITY_THRESHOLDS) {
      const view = v.thresholds.find((x) => x.id === t.key)!
      expect(view.required).toBe(t.max)
    }
  })
})

describe('projections: dual-state model', () => {
  it('post-START field report updates the live case file and never the frozen baseline', () => {
    const snap = frozen(capacityConstrainedCampaign)
    // A separate live case state receives a late field report after START.
    const live: FinaleSnapshot = JSON.parse(JSON.stringify(snap))
    const mutableLive = live as { caseState: { fieldReportCorroborated: boolean } }
    mutableLive.caseState.fieldReportCorroborated = false
    // The branch baseline (frozen snapshot) is unaffected by the live edit.
    expect(snap.caseState.fieldReportCorroborated).toBe(true)
    // And the projections, which read only the snapshot, are unchanged.
    expect(runProjections(snap)).toStrictEqual(runProjections(frozen(capacityConstrainedCampaign)))
  })
})

describe('projections: branch traces', () => {
  const BRANCHES: BranchId[] = ['repeat', 'hold', 'staged']

  it.each(BRANCHES)('each branch yields an authored BranchStep[]: %s', (branch) => {
    const steps = traceFor(branch, frozen(healthyCampaign))
    expect(steps.length).toBeGreaterThan(0)
    steps.forEach((s, i) => {
      expect(s.step).toBe(i)
      expect(typeof s.label).toBe('string')
      expect(typeof s.detail).toBe('string')
      expect(s.label.length).toBeGreaterThan(0)
      expect(s.detail.length).toBeGreaterThan(0)
    })
  })

  it('trace steps carry { step, label, detail } and no em-dash in any string', () => {
    for (const branch of BRANCHES) {
      for (const id of FIXTURE_IDS) {
        const steps = traceFor(branch, frozen(FIXTURES[id]))
        for (const s of steps) {
          expect(Object.keys(s).sort()).toStrictEqual(['detail', 'label', 'step'])
          expect(s.label).not.toMatch(EM_DASH)
          expect(s.detail).not.toMatch(EM_DASH)
        }
      }
    }
  })

  it('traces are deterministic across repeated calls', () => {
    const a = traceFor('staged', frozen(allFailedCampaign))
    const b = traceFor('staged', frozen(allFailedCampaign))
    expect(a).toStrictEqual(b)
  })
})
