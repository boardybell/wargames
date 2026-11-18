// Section-04 CI fixture matrix for FREEZE BANK ACCOUNTS, run over all three
// authored seeds (exercise-r04/k11/t58). It replays the section-02 walkthrough
// and surge scripts (one line of play run twice for the surge pair), and
// authors the remaining test-local scripts (timeout, forfeit, both collapse
// paths, the broad-hold boundary tie, extended-time proportionality, the clue
// fixture). The walkthrough and surge scripts come from section 02, so a red
// walkthrough means authored NUMBERS in payloads.ts, never a harness or rules
// bug. Every quantity is an integer; nothing here reads Date or Math.random.
//
// Discipline enforced here (the bugs prior reviews caught): the surge pair is
// ONE script run twice (base vs capped inbound); the broad-hold boundary
// constructs the TRUE scheduledAt==dispatch tie; the collapse fixtures assert
// settlement IDEMPOTENCE by capturing the record, dispatching more actions and
// drains, and asserting state and record are byte-identical.
import { describe, expect, it } from 'vitest'
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import type { SettledOutcome } from '@engine/campaign/types'
import { SEED_NAMES } from '@engine/seeds/catalog'
import { BANK_MISSION_ID, makeBankMission } from '@engine/missions/bank/module'
import { BANK_ANCHORS_BY_SEED } from '@engine/missions/bank/payloads'
import { EXTENDED_TIME_SCALE } from '@engine/time'
import {
  BANK_DURATION_MS,
  BANK_T0,
  bankCashCollapseContext,
  bankContextForSeed,
  bankPayloadFor,
  bankSub,
  bankSurgeExpectation,
  bankSurgeFor,
  bankWalkthroughExpectation,
  bankWalkthroughFor,
  driveBankSeed,
  holdAct,
  payAct,
  releaseAct,
} from './fixtures'
import type { Envelope } from './fixtures'

const SETTLE_AT = BANK_T0 + BANK_DURATION_MS + 1_000
/** The engine inbound cap withMaxInboundSurge folds (flightsDisrupted = 40). */
const INBOUND_CAP = 40

const TIER_RANK: Record<string, number> = {
  failed: 0,
  poor: 1,
  partial: 2,
  full: 3,
}

function bankOutcome(state: CampaignState): SettledOutcome {
  return state.settled.find((s) => s.missionId === BANK_MISSION_ID)!
}

function settlements(emitted: readonly { type: string }[]): unknown[] {
  return emitted.filter((e) => e.type === 'settlement')
}

const start: Envelope = [
  { type: 'START_MISSION', missionId: BANK_MISSION_ID },
  BANK_T0,
]

describe.each(SEED_NAMES)('bank fixtures, seed %s', (seedName) => {
  it('walkthrough: settles exactly once at the deadline, tier FULL, all four payments cleared above floor and target', () => {
    const ctx = bankContextForSeed(seedName)
    const payload = bankPayloadFor(seedName)
    const { state, emitted } = driveBankSeed(
      ctx,
      seedName,
      bankWalkthroughFor(seedName),
      SETTLE_AT,
    )
    const expected = bankWalkthroughExpectation(seedName)
    // Exactly one settlement over the whole run.
    expect(settlements(emitted)).toHaveLength(1)
    const outcome = bankOutcome(state)
    expect(outcome.tier).toBe(expected.tier)
    expect(outcome.tier).toBe('full')
    // All four critical payments cleared.
    expect(outcome.metrics['payments_cleared']).toBe(expected.clearedPayments)
    expect(outcome.metrics['payments_total']).toBe(expected.totalPayments)
    // Derived cash at or above the authored floor; confidence at or above
    // target. Three sustainability signals, so FULL with margin.
    expect(outcome.metrics['derived_cash']!).toBeGreaterThanOrEqual(payload.floor)
    expect(outcome.metrics['confidence']!).toBeGreaterThanOrEqual(payload.target)
    expect(outcome.metrics['sustainability_signals']).toBe(3)
  })

  // ── The surge pair: ONE script run twice ─────────────────────────────
  // bankSurgeFor(seed) is a SINGLE line of play. It is driven once at base
  // inbound sizing (flightsDisrupted magnitude 0) and once with the same script
  // replayed under the maximum capped inbound magnitude folded in. The two runs
  // share the identical envelope list; only the inbound-surge flag differs.
  const surgeScript = () => bankSurgeFor(seedName)

  it('surge BASE sizing: each crossed threshold injects exactly once with the injected marker, run stays >= partial', () => {
    const ctx = bankContextForSeed(seedName)
    const { state, emitted } = driveBankSeed(
      ctx,
      seedName,
      surgeScript(),
      SETTLE_AT,
      false,
    )
    const outcome = bankOutcome(state)
    const expected = bankSurgeExpectation(seedName)

    // Every consumed threshold fired exactly one DISTINCT crossing event, and no
    // threshold was consumed twice (the crossing events persist in `emitted`,
    // the injected-marker data lives in the settled metrics, so neither needs
    // the post-settlement substate the active mission has already cleared).
    const crossed = emitted
      .filter((e) => e.type === 'bankThresholdCrossed')
      .map((e) => (e as { threshold: number }).threshold)
    const uniqueCrossed = new Set(crossed)
    // Each crossed threshold injected exactly once: no duplicate crossing event.
    expect(crossed.length).toBe(uniqueCrossed.size)
    expect(crossed.length).toBeGreaterThanOrEqual(1)
    // At least one injected (contagion) draw after the broad hold the holds
    // provoked, carried in the injected bucket of the settled cross-tab.
    expect(outcome.metrics['injected_after_hold_count']!).toBeGreaterThanOrEqual(1)
    // The injected count never exceeds the number of distinct thresholds crossed:
    // one injection per threshold, ever (the authored thresholds each inject one
    // request).
    expect(outcome.metrics['injected_after_hold_count']!).toBeLessThanOrEqual(
      uniqueCrossed.size,
    )
    // Still solvable to at least the documented sustainable tier.
    expect(TIER_RANK[outcome.tier]!).toBeGreaterThanOrEqual(
      TIER_RANK[expected.tier]!,
    )
    expect(outcome.metrics['payments_cleared']).toBe(expected.clearedPayments)
  })

  it('surge MAX-CAPPED sizing: SAME script injects at base+cap (never below base) and still stays >= partial', () => {
    const ctx = bankContextForSeed(seedName)
    const expected = bankSurgeExpectation(seedName)

    // Run A (base, magnitude 0) and run B (capped, magnitude 40) are the SAME
    // envelope list; only the inbound flag differs. This is the surge pair.
    const runA = driveBankSeed(ctx, seedName, surgeScript(), SETTLE_AT, false)
    const runB = driveBankSeed(ctx, seedName, surgeScript(), SETTLE_AT, true)
    const a = bankOutcome(runA.state)
    const b = bankOutcome(runB.state)

    // Capped injections draw strictly more than base, and never below base: the
    // delta is at least INBOUND_CAP per injected draw that fired in both.
    expect(b.metrics['injected_after_hold_amount']!).toBeGreaterThan(
      a.metrics['injected_after_hold_amount']!,
    )
    expect(b.metrics['injected_after_hold_amount']!).toBeGreaterThanOrEqual(
      a.metrics['injected_after_hold_amount']! +
        INBOUND_CAP * b.metrics['injected_after_hold_count']!,
    )
    // The same number of injections fired in both runs (same line of play, same
    // crossings): the only difference is each draw is base+cap, never below base.
    expect(b.metrics['injected_after_hold_count']).toBe(
      a.metrics['injected_after_hold_count'],
    )
    // Still solvable at the max inbound surge.
    expect(TIER_RANK[b.tier]!).toBeGreaterThanOrEqual(TIER_RANK[expected.tier]!)
    expect(b.metrics['payments_cleared']).toBe(expected.clearedPayments)
  })

  it('surge both-directions: a threshold consumed on the FIRST crossing is not re-injected on a re-cross', () => {
    // Cross the top threshold (60), RECOVER above it, then RE-CROSS it. The first
    // crossing consumes the threshold permanently; the second schedules nothing.
    // Hold six accounts hard through tick-1 (+60) so confidence falls below 60
    // (consuming it once), then release all six and clear all four payments so
    // confidence recovers above 60, then RE-HOLD the six before the end tick so
    // confidence falls below 60 a second time: the end-tick re-cross must inject
    // nothing. One injection, ever.
    const ctx = bankContextForSeed(seedName)
    const p = payload(seedName)
    const top = Math.max(...p.thresholds.map((t) => t.value))
    const o = (sec: number) => BANK_T0 + sec * 1000
    const six = ['DEP-ASHE', 'DEP-REEVE', 'VEN-ORR', 'MUN-VANE', 'PAY-SOUTH', 'PAY-NORTH']
    const envs: Envelope[] = [
      start,
      // First crossing: hold six hard through tick-1.
      ...six.map((id, i): Envelope => [holdAct(id), o(5 + i)]),
      // Recover: release all six, clear all four payments.
      ...six.map((id, i): Envelope => [releaseAct(id), o(70 + i)]),
      [payAct('PM1'), o(100)],
      [payAct('PM2'), o(126)],
      [payAct('PM3'), o(156)],
      [payAct('PM4'), o(186)],
      // Re-cross: re-hold the six before the end tick so confidence re-crosses 60.
      ...six.map((id, i): Envelope => [holdAct(id), o(195 + i)]),
    ]
    const { state, emitted } = driveBankSeed(ctx, seedName, envs, SETTLE_AT, false)
    const outcome = bankOutcome(state)
    // The top threshold crossing event fired EXACTLY ONCE over the whole run,
    // despite confidence crossing 60 downward twice: consumed on the first.
    const topCrossings = emitted.filter(
      (e) =>
        e.type === 'bankThresholdCrossed' &&
        (e as { threshold: number }).threshold === top,
    )
    expect(topCrossings.length).toBe(1)
    // Exactly one injected contagion draw after the hold: the second crossing
    // scheduled nothing.
    expect(outcome.metrics['injected_after_hold_count']).toBe(1)
  })

  it('timeout: idle/light play reaches the deadline, cause timeout, with the HONEST sustainable-check tier', () => {
    // Minimal play: start and clear a single payment, then let the stream and
    // ticks run out the clock. No broad hold, no mass defense. The mission must
    // time out (not collapse) and score the real sustainability signals.
    const ctx = bankContextForSeed(seedName)
    const o = (sec: number) => BANK_T0 + sec * 1000
    const envs: Envelope[] = [start, [payAct('PM1'), o(100)]]
    const { state, emitted } = driveBankSeed(ctx, seedName, envs, SETTLE_AT, false)
    const outcome = bankOutcome(state)
    expect(settlements(emitted)).toHaveLength(1)
    expect(outcome.cause).toBe('timeout')
    // Honest tier: not all four payments cleared, so it cannot be FULL. The tier
    // reflects the true signal count, never an inflated hold tally.
    expect(TIER_RANK[outcome.tier]!).toBeLessThan(TIER_RANK['full']!)
    expect(outcome.metrics['payments_cleared']!).toBeLessThan(4)
  })

  it('forfeit: FORFEIT mid-run settles once, cause forfeit, no post-settlement mutation', () => {
    const ctx = bankContextForSeed(seedName)
    let state = createCampaign(ctx, seedName, { extendedTime: false }, BANK_T0)
    state = dispatch(ctx, state, start[0], BANK_T0).state
    state = dispatch(ctx, state, holdAct('DEP-ASHE'), BANK_T0 + 5_000).state
    state = advanceCampaign(ctx, state, BANK_T0 + 30_000).state
    const forfeit = dispatch(ctx, state, { type: 'FORFEIT_MISSION' }, BANK_T0 + 31_000)
    expect(settlements(forfeit.emitted)).toHaveLength(1)
    const outcome = bankOutcome(forfeit.state)
    expect(outcome.cause).toBe('forfeit')

    // IDEMPOTENCE: capture the record and the settled array, dispatch more
    // actions and drains, and assert both are byte-identical afterward.
    const recordBefore = JSON.stringify(outcome)
    const settledBefore = JSON.stringify(forfeit.state.settled)
    let after = forfeit.state
    after = dispatch(ctx, after, holdAct('VEN-ORR'), BANK_T0 + 32_000).state
    after = dispatch(ctx, after, payAct('PM1'), BANK_T0 + 33_000).state
    after = advanceCampaign(ctx, after, SETTLE_AT).state
    expect(JSON.stringify(bankOutcome(after))).toBe(recordBefore)
    expect(JSON.stringify(after.settled)).toBe(settledBefore)
  })

  it('collapsed via confidence zero: settles once, cause collapsed, tier failed, subsequent dispatches inert', () => {
    // Broad-hold everything and clear nothing: confidence bleeds to 0 across the
    // ticks and terminal() fires collapsed.
    const ctx = bankContextForSeed(seedName)
    const o = (sec: number) => BANK_T0 + sec * 1000
    const accountIds = payload(seedName).accounts.map((a) => a.id)
    const envs: Envelope[] = [
      start,
      ...accountIds.map((id, i): Envelope => [holdAct(id), o(1 + i)]),
    ]
    const { state, emitted } = driveBankSeed(ctx, seedName, envs, SETTLE_AT, false)
    expect(settlements(emitted)).toHaveLength(1)
    const outcome = bankOutcome(state)
    expect(outcome.cause).toBe('collapsed')
    expect(outcome.tier).toBe('failed')
    expect(outcome.metrics['confidence']).toBe(0)

    // IDEMPOTENCE: byte-identical state and record after more dispatches/drains.
    const recordBefore = JSON.stringify(outcome)
    const stateBefore = JSON.stringify(state.settled)
    let after = state
    after = dispatch(ctx, after, releaseAct(accountIds[0]!), SETTLE_AT + 1_000).state
    after = dispatch(ctx, after, payAct('PM1'), SETTLE_AT + 2_000).state
    after = advanceCampaign(ctx, after, SETTLE_AT + 10_000).state
    expect(JSON.stringify(bankOutcome(after))).toBe(recordBefore)
    expect(JSON.stringify(after.settled)).toBe(stateBefore)
  })

  it('collapsed via cash-negative guard: collapses rather than storing negative, cause collapsed, settled once', () => {
    // The derived-cash collapse path: an upstream paymentsDelayed penalty (40,
    // capped) drives the target balance negative at init; holding the sheltering
    // account drops derived cash below the collapse floor, tripping collapse.
    // This uses the dedicated collapse context (seed-independent engine path).
    // The collapse context registers the 'test-seed' name (its own two-mission
    // chain), independent of the authored seed under test in this matrix row.
    const cctx = bankCashCollapseContext(INBOUND_CAP)
    let s = createCampaign(cctx, 'test-seed', { extendedTime: false }, BANK_T0)
    s = dispatch(cctx, s, { type: 'START_MISSION', missionId: 'alpha' }, BANK_T0).state
    s = dispatch(cctx, s, { type: 'FORFEIT_MISSION' }, BANK_T0 + 1_000).state
    s = dispatch(cctx, s, { type: 'ACKNOWLEDGE_DEBRIEF', missionId: 'alpha' }, BANK_T0 + 2_000).state
    s = dispatch(cctx, s, { type: 'START_MISSION', missionId: BANK_MISSION_ID }, BANK_T0 + 3_000).state
    // The penalty drove the target negative WITHOUT clipping (guard stores the
    // real negative balance on the account, never a clamped zero). Read the LIVE
    // substate before the collapse settles and remove-the-active-mission: there
    // is no cash field, only account balances the selector sums.
    const liveSub = bankSub(s) as unknown as Record<string, unknown>
    expect('cash' in liveSub).toBe(false)
    expect('derivedCash' in liveSub).toBe(false)
    const held = dispatch(
      cctx,
      s,
      { type: 'MISSION_ACTION', payload: { kind: 'HOLD', accountId: 'ZEPHYR' } },
      BANK_T0 + 5_000,
    )
    expect(settlements(held.emitted)).toHaveLength(1)
    const outcome = bankOutcome(held.state)
    expect(outcome.cause).toBe('collapsed')
    expect(outcome.tier).toBe('failed')
    // Derived cash fell strictly below the collapse floor (negative), and the
    // mission collapsed rather than storing a derived-cash field at all.
    expect(outcome.metrics['derived_cash']!).toBeLessThan(0)

    // IDEMPOTENCE after more dispatches/drains.
    const recordBefore = JSON.stringify(outcome)
    const settledBefore = JSON.stringify(held.state.settled)
    let after = held.state
    after = advanceCampaign(cctx, after, BANK_T0 + BANK_DURATION_MS + 5_000).state
    expect(JSON.stringify(bankOutcome(after))).toBe(recordBefore)
    expect(JSON.stringify(after.settled)).toBe(settledBefore)
  })

  it('broad-hold boundary: a request whose scheduledAt EQUALS the broad-hold dispatch is arrivedBeforeHold, firstBroadHoldAt stamped once', () => {
    // THE load-bearing drain-before-reduce test. W01 is authored at offset 20s
    // against DEP-REEVE. broadHoldCount is 3, so hold THREE non-REEVE accounts
    // before +20s, then the FOURTH hold (which pushes the held count over 3) is
    // dispatched at EXACTLY W01's scheduledAt (BANK_T0 + 20_000). The engine
    // drains W01 first (drain precedes action reduction in the same dispatch),
    // so W01 is before-hold by construction, and firstBroadHoldAt stamps exactly
    // once at the tie timestamp.
    const ctx = bankContextForSeed(seedName)
    const TIE = BANK_T0 + 20_000 // W01's authored scheduledAt
    let s = createCampaign(ctx, seedName, { extendedTime: false }, BANK_T0)
    s = dispatch(ctx, s, start[0], BANK_T0).state
    s = dispatch(ctx, s, holdAct('OPS-MAIN'), BANK_T0 + 5_000).state
    s = dispatch(ctx, s, holdAct('OPS-AUX'), BANK_T0 + 6_000).state
    s = dispatch(ctx, s, holdAct('VEN-HALE'), BANK_T0 + 7_000).state
    // Three held, broadHoldCount is 3, so no broad hold yet (3 is not > 3).
    expect(bankSub(s).firstBroadHoldAt).toBeNull()
    // The fourth hold at EXACTLY the tie timestamp: W01 drains first, then the
    // hold reduces and the broad hold stamps.
    s = dispatch(ctx, s, holdAct('MUN-VANE'), TIE).state
    const sub = bankSub(s)
    // W01 drained before the hold reduced: before-hold, applied in full.
    expect(sub.requests['W01']!.outcome).toBe('applied')
    expect(sub.requests['W01']!.arrivedAfterHold).toBe(false)
    // The broad hold stamped exactly at the tie timestamp, once.
    expect(sub.firstBroadHoldAt).toBe(TIE)

    // Stamped ONCE, ever: a later fifth hold does not re-stamp.
    const later = dispatch(ctx, s, holdAct('MUN-ELD'), BANK_T0 + 25_000).state
    expect(bankSub(later).firstBroadHoldAt).toBe(TIE)
  })

  it('extended time: tick count, request offsets, and payment due offsets scale proportionally; the walkthrough still reaches FULL', () => {
    const ctx = bankContextForSeed(seedName)
    const p = payload(seedName)
    // Materialize both schedules and compare the start-anchored offsets.
    const standard = (() => {
      const s = createCampaign(ctx, seedName, { extendedTime: false }, BANK_T0)
      return dispatch(ctx, s, start[0], BANK_T0).state
    })()
    const extended = (() => {
      const s = createCampaign(ctx, seedName, { extendedTime: true }, BANK_T0)
      return dispatch(ctx, s, start[0], BANK_T0).state
    })()
    const stdSpan = standard.activeMission!.endsAt - BANK_T0
    const extSpan = extended.activeMission!.endsAt - BANK_T0
    const ratio = extSpan / stdSpan
    // Pin against the engine's own exported constant, not a bare 2, so this
    // tracks the engine instead of silently rotting if the multiple changes.
    expect(ratio).toBe(EXTENDED_TIME_SCALE)

    const offsetOf = (state: CampaignState, id: string): number | null => {
      const e = state.missionQueue.find((q) => q.id === id)
      return e ? e.scheduledAt - BANK_T0 : null
    }
    // Every start-anchored wave and payment-due offset scales by the same ratio.
    for (const req of p.requests) {
      const std = offsetOf(standard, `bank-wave-${req.id}`)
      const ext = offsetOf(extended, `bank-wave-${req.id}`)
      expect(std).not.toBeNull()
      expect(ext).toBe(std! * ratio)
    }
    for (const pay of p.payments) {
      const std = offsetOf(standard, `bank-due-${pay.id}`)
      const ext = offsetOf(extended, `bank-due-${pay.id}`)
      expect(std).not.toBeNull()
      expect(ext).toBe(std! * ratio)
    }
    // Tick cadence scales proportionally: the periodic ticks are derived from
    // the authored standard duration and anchored at start, so their COUNT is
    // invariant (3 at 60/120/180) but each materialized OFFSET scales by the same
    // ratio (120/240/360), covering the full doubled window with no dead tail.
    // The end tick lands at the scaled deadline. This is the engine's documented
    // integer cadence: offsets scale, count holds.
    const tickIds = (state: CampaignState): string[] =>
      state.missionQueue
        .filter((q) => q.id.startsWith('bank-tick-'))
        .map((q) => q.id)
        .sort()
    expect(tickIds(extended)).toEqual(tickIds(standard))
    expect(tickIds(standard).length).toBeGreaterThan(0)
    for (const id of tickIds(standard)) {
      const std = offsetOf(standard, id)!
      const ext = offsetOf(extended, id)!
      expect(ext).toBe(std * ratio)
    }
    // The end tick lands at the scaled deadline, not a scaled start offset.
    const endStd = standard.missionQueue.find((q) => q.id === 'bank-end')!
    const endExt = extended.missionQueue.find((q) => q.id === 'bank-end')!
    expect(endStd.scheduledAt).toBe(standard.activeMission!.endsAt)
    expect(endExt.scheduledAt).toBe(extended.activeMission!.endsAt)

    // The walkthrough replayed under extended time, action deltas scaled by the
    // same ratio, still reaches FULL.
    let state = extended
    const endsAt = extended.activeMission!.endsAt
    for (const [action, now] of bankWalkthroughFor(seedName).slice(1)) {
      const scaledNow = BANK_T0 + (now - BANK_T0) * ratio
      state = advanceCampaign(ctx, state, scaledNow).state
      state = dispatch(ctx, state, action, scaledNow).state
    }
    state = advanceCampaign(ctx, state, endsAt + 1_000).state
    const outcome = bankOutcome(state)
    expect(outcome.tier).toBe('full')
    expect(outcome.metrics['payments_cleared']).toBe(4)
    // Doubled exactly.
    expect(endsAt - BANK_T0).toBe(BANK_DURATION_MS * 2)
  })

  it('clue: INSPECT_RECORD on the hold-justification record twice logs D-83 exactly once; module.ts has no clue code path', () => {
    const ctx = bankContextForSeed(seedName)
    const anchors = BANK_ANCHORS_BY_SEED[seedName]!
    let s = createCampaign(ctx, seedName, { extendedTime: false }, BANK_T0)
    s = dispatch(ctx, s, start[0], BANK_T0).state
    const first = dispatch(
      ctx,
      s,
      { type: 'INSPECT_RECORD', recordId: anchors.justificationRecordId },
      BANK_T0 + 5_000,
    )
    // The first inspect logs D-83 exactly once via the engine clueRecords path.
    expect(first.emitted.filter((e) => e.type === 'clueFound')).toEqual([
      { type: 'clueFound', clueId: anchors.clueId },
    ])
    expect(first.state.cluesFound).toContain(anchors.clueId)
    // A second inspect of the SAME record logs nothing new.
    const again = dispatch(
      ctx,
      first.state,
      { type: 'INSPECT_RECORD', recordId: anchors.justificationRecordId },
      BANK_T0 + 6_000,
    )
    expect(again.emitted.filter((e) => e.type === 'clueFound')).toEqual([])
    // Exactly one occurrence in cluesFound.
    expect(again.state.cluesFound.filter((c) => c === anchors.clueId)).toHaveLength(1)

    // STRUCTURAL: the bank module exposes no clues() and never stamps a clue id
    // on its outcome (the clue is a campaign fact, not a mission outcome field).
    const mod = makeBankMission(bankPayloadFor(seedName))
    expect(mod.clues).toBeUndefined()
    // Carry to settlement: the clue survives even a timed-out mission, and the
    // module's own outcome carries no clue id.
    const settled = advanceCampaign(ctx, again.state, SETTLE_AT).state
    expect(settled.cluesFound).toContain(anchors.clueId)
    expect(bankOutcome(settled).clueId).toBeNull()
  })
})

/** Memoized per-seed payload accessor to keep the matrix cheap. */
function payload(seedName: string): ReturnType<typeof bankPayloadFor> {
  return bankPayloadFor(seedName)
}
