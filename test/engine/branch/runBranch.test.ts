import { describe, expect, it } from 'vitest'
import { runBranch, snapshot, BRANCH_KINDS } from '@engine/branch'
import type { BranchKind } from '@engine/branch'
import { buildTestContext } from '@engine/testing'
import { createCampaign, dispatch } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import { FIXTURE_RECORDS } from '../records/fixtures'
import { canonicalStringify, stateHash } from '../harness/canonical'

const ctx = buildTestContext(FIXTURE_RECORDS)
const T0 = 1_000_000

function step(state: CampaignState, action: Parameters<typeof dispatch>[2]) {
  return dispatch(ctx, state, action, state.lastNow + 1_000).state
}

// A mid-campaign fixture with a live active mission (no settled outcomes),
// so projections read the test-double substate and viability is satisfied.
function midCampaign(): CampaignState {
  return step(
    createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
    { type: 'START_MISSION', missionId: 'alpha' },
  )
}

// Settle alpha with a chosen outcome, then leave beta active. 'full' gives
// healthy settled metrics (viable); 'failed' gives capacity-constrained
// metrics (not viable).
function withSettledAlpha(kind: 'full' | 'failed'): CampaignState {
  let s = step(
    createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
    { type: 'START_MISSION', missionId: 'alpha' },
  )
  if (kind === 'full') {
    s = step(s, { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
    s = step(s, { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
    s = step(s, { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
  } else {
    s = step(s, { type: 'FORFEIT_MISSION' })
  }
  s = step(s, { type: 'ACKNOWLEDGE_DEBRIEF', missionId: 'alpha' })
  return step(s, { type: 'START_MISSION', missionId: 'beta' })
}

describe('runBranch side-effect freedom', () => {
  it('leaves the frozen snapshot and the live state unchanged', () => {
    const live = midCampaign()
    const liveHash = stateHash(live)
    const snap = snapshot(live)
    const snapHash = stateHash(snap)
    for (const kind of BRANCH_KINDS) runBranch(ctx, snap, kind)
    expect(stateHash(snap)).toBe(snapHash)
    expect(stateHash(live)).toBe(liveHash)
  })
})

describe('runBranch determinism', () => {
  it('returns strictly equal projection and trace on repeated runs', () => {
    const snap = snapshot(midCampaign())
    for (const kind of BRANCH_KINDS) {
      const a = runBranch(ctx, snap, kind)
      const b = runBranch(ctx, snap, kind)
      expect(canonicalStringify(a)).toBe(canonicalStringify(b))
    }
  })

  it('is order-independent across branch kinds (forked streams)', () => {
    const snap = snapshot(midCampaign())
    const forward: BranchKind[] = [
      'REPEAT_D83',
      'HOLD_AND_VERIFY',
      'STAGED_RECOVERY',
    ]
    const reversed: BranchKind[] = [
      'STAGED_RECOVERY',
      'REPEAT_D83',
      'HOLD_AND_VERIFY',
    ]
    const first = new Map(
      forward.map((k) => [k, canonicalStringify(runBranch(ctx, snap, k))]),
    )
    for (const k of reversed) {
      expect(canonicalStringify(runBranch(ctx, snap, k))).toBe(first.get(k))
    }
  })
})

describe('runBranch policy divergence', () => {
  it('the three kinds produce pairwise-distinct projections', () => {
    const snap = snapshot(midCampaign())
    const projections = BRANCH_KINDS.map((k) =>
      canonicalStringify(runBranch(ctx, snap, k).projection),
    )
    expect(new Set(projections).size).toBe(BRANCH_KINDS.length)
  })
})

describe('STAGED_RECOVERY viability', () => {
  it('flips on settled-outcome thresholds, exposing the threshold values', () => {
    const healthy = snapshot(withSettledAlpha('full'))
    const constrained = snapshot(withSettledAlpha('failed'))
    const good = runBranch(ctx, healthy, 'STAGED_RECOVERY')
    const poor = runBranch(ctx, constrained, 'STAGED_RECOVERY')
    expect(good.viability.viable).toBe(true)
    expect(poor.viability.viable).toBe(false)
    // The threshold values are visible so the shell can show why.
    const woprThreshold = poor.viability.thresholds.find(
      (t) => t.key === 'wopr_resolved',
    )
    expect(woprThreshold).toBeDefined()
    expect(woprThreshold!.pass).toBe(false)
    expect(woprThreshold!.threshold).toBe(2)
    // Viability actually gates the policy: constrained holds at one stage.
    expect(good.trace.length).toBeGreaterThan(poor.trace.length)
  })
})

describe('runBranch surfaces invalid scripted actions', () => {
  it('throws rather than silently skewing when a policy action is rejected', () => {
    // A fully-settled, acknowledged campaign has no active mission, so the
    // scaffold policies (which dispatch MISSION_ACTIONs) produce a rejected
    // action. That must fail loud, not record a no-op step with a wrong
    // projection. (Split 06's real policies never dispatch mission actions.)
    let s = step(
      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
      { type: 'START_MISSION', missionId: 'alpha' },
    )
    s = step(s, { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
    s = step(s, { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
    s = step(s, { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } })
    s = step(s, { type: 'ACKNOWLEDGE_DEBRIEF', missionId: 'alpha' })
    const snap = snapshot(s)
    expect(snap.activeMission).toBeNull()
    expect(() => runBranch(ctx, snap, 'STAGED_RECOVERY')).toThrow(
      /invalid action/,
    )
  })
})

describe('runBranch JSON-safety and integer discipline', () => {
  it('projection and trace survive a JSON round trip', () => {
    const snap = snapshot(midCampaign())
    for (const kind of BRANCH_KINDS) {
      const result = runBranch(ctx, snap, kind)
      const round = JSON.parse(JSON.stringify(result))
      expect(round).toEqual(result)
    }
  })

  it('every projection numeric field is an integer', () => {
    const snap = snapshot(midCampaign())
    for (const kind of BRANCH_KINDS) {
      const p = runBranch(ctx, snap, kind).projection
      for (const value of Object.values(p)) {
        expect(Number.isInteger(value)).toBe(true)
      }
    }
  })
})
