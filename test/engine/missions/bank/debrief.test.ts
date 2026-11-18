// Section-04 CI fixture: the FREEZE BANK ACCOUNTS debrief cross-tab, matrixed
// over all three authored seeds. The cross-tab partitions every resolved request
// into EXACTLY ONE of before-hold / genuine after-hold / injected after-hold,
// with counts AND summed amounts asserted against HAND-COMPUTED expectations
// from the authored stream. The expectations are literals derived here from the
// authored amounts and the holds the script applies; they are NOT read back from
// the implementation's own crossTab helper, so a mis-bucketed request is caught.
// Also: the no-broad-hold run puts every request before-hold; per-payment
// outcomes match run history and remaining derived cash matches the selector at
// settlement; aggregated confidence reasons are typed codes rendered through
// selectors; and the clue status reflects whether the hold-justification record
// was inspected.
import { describe, expect, it } from 'vitest'
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import type { SettledOutcome } from '@engine/campaign/types'
import { SEED_NAMES } from '@engine/seeds/catalog'
import { BANK_MISSION_ID } from '@engine/missions/bank/module'
import { BANK_ANCHORS_BY_SEED } from '@engine/missions/bank/payloads'
import {
  renderRequestOutcome,
  selectDerivedCash,
} from '@engine/missions/bank/selectors'
import { REQUEST_OUTCOMES } from '@engine/missions/bank/types'
import {
  BANK_DURATION_MS,
  BANK_T0,
  bankContextForSeed,
  bankPayloadFor,
  bankSub,
  bankWalkthroughFor,
  driveBankSeed,
  holdAct,
} from './fixtures'
import type { Envelope } from './fixtures'

const SETTLE_AT = BANK_T0 + BANK_DURATION_MS + 1_000

const start: Envelope = [
  { type: 'START_MISSION', missionId: BANK_MISSION_ID },
  BANK_T0,
]

function bankOutcome(state: CampaignState): SettledOutcome {
  return state.settled.find((s) => s.missionId === BANK_MISSION_ID)!
}

// ── Hand-computed cross-tab expectations ─────────────────────────────────
// The cross-tab script stamps the broad hold at +4s (the fourth hold crosses
// broadHoldCount = 3) by holding DEP-REEVE, DEP-ASHE, VEN-ORR, MUN-VANE before
// the first wave (W01 at +20s). So NO wave arrives before the stamp: before-hold
// is empty. All 18 authored waves arrive after the stamp (genuine after-hold);
// a wave against a held account refuses (draws 0), a wave against an unheld
// account applies in full. Holding those four accounts hard through the whole
// window drives confidence across all three authored thresholds (60, 45, 30) by
// settlement, injecting INJ-60 (OPS-MAIN, 150), INJ-45 (VEN-HALE, 150), and
// INJ-30 (OPS-AUX, 150) after the hold: three injected draws, 450 total.
//
// Held accounts (refused, 0): the waves against the four held accounts:
//   W01 DEP-REEVE, W06 DEP-ASHE, W07 VEN-ORR, W08 MUN-VANE, W11 DEP-REEVE,
//   W14 DEP-ASHE, W16 VEN-ORR, W17 MUN-VANE, W18 DEP-REEVE  -> 9 waves, 0 each.
// Unheld (applied in full): the remaining nine waves:
//   W02 150, W03 500, W04 250, W05 180, W09 500, W10 260, W12 170, W13 300,
//   W15 200  -> sum 2510.
const HOLD_ACCOUNTS = ['DEP-REEVE', 'DEP-ASHE', 'VEN-ORR', 'MUN-VANE']
const EXPECTED = {
  beforeHoldCount: 0,
  beforeHoldAmount: 0,
  genuineAfterHoldCount: 18,
  genuineAfterHoldAmount: 2510,
  injectedAfterHoldCount: 3,
  injectedAfterHoldAmount: 450,
}
const AUTHORED_REQUEST_COUNT = 18
const AUTHORED_APPLIED_TOTAL = 2510 // sum of applied authored waves (refused = 0)

function crossTabScript(): Envelope[] {
  const o = (sec: number) => BANK_T0 + sec * 1000
  return [
    start,
    ...HOLD_ACCOUNTS.map((id, i): Envelope => [holdAct(id), o(1 + i)]),
  ]
}

describe.each(SEED_NAMES)('bank debrief, seed %s', (seedName) => {
  it('cross-tab partitions every request into exactly one cell; counts and amounts match HAND-COMPUTED expectations and sum to the totals', () => {
    const ctx = bankContextForSeed(seedName)
    const { state } = driveBankSeed(ctx, seedName, crossTabScript(), SETTLE_AT, false)
    const m = bankOutcome(state).metrics

    // Each cell matches the hand-computed literal above (NOT read from the impl).
    expect(m['before_hold_count']).toBe(EXPECTED.beforeHoldCount)
    expect(m['before_hold_amount']).toBe(EXPECTED.beforeHoldAmount)
    expect(m['genuine_after_hold_count']).toBe(EXPECTED.genuineAfterHoldCount)
    expect(m['genuine_after_hold_amount']).toBe(EXPECTED.genuineAfterHoldAmount)
    expect(m['injected_after_hold_count']).toBe(EXPECTED.injectedAfterHoldCount)
    expect(m['injected_after_hold_amount']).toBe(EXPECTED.injectedAfterHoldAmount)

    // The three cells partition EVERY resolved request: counts sum to the total
    // resolved request count (authored + injected), amounts sum to the total
    // applied amount. No request is double-counted or dropped.
    const totalCount =
      m['before_hold_count']! +
      m['genuine_after_hold_count']! +
      m['injected_after_hold_count']!
    const totalAmount =
      m['before_hold_amount']! +
      m['genuine_after_hold_amount']! +
      m['injected_after_hold_amount']!
    expect(totalCount).toBe(
      AUTHORED_REQUEST_COUNT + EXPECTED.injectedAfterHoldCount,
    )
    expect(totalAmount).toBe(
      AUTHORED_APPLIED_TOTAL + EXPECTED.injectedAfterHoldAmount,
    )
  })

  it('cross-tab with no broad hold ever: all requests before-hold, zero in both after-hold cells', () => {
    // No holds at all: the broad hold never stamps, so every authored wave is
    // before-hold and no threshold injection fires (confidence never falls).
    const ctx = bankContextForSeed(seedName)
    const { state } = driveBankSeed(ctx, seedName, [start], SETTLE_AT, false)
    const m = bankOutcome(state).metrics
    // Hand-computed: all 18 authored waves apply in full, total 4790, all
    // before-hold; both after-hold cells empty.
    expect(m['before_hold_count']).toBe(18)
    expect(m['before_hold_amount']).toBe(4790)
    expect(m['genuine_after_hold_count']).toBe(0)
    expect(m['genuine_after_hold_amount']).toBe(0)
    expect(m['injected_after_hold_count']).toBe(0)
    expect(m['injected_after_hold_amount']).toBe(0)
  })

  it('per-payment outcomes match run history; remaining derived cash matches the selector at settlement', () => {
    const ctx = bankContextForSeed(seedName)
    const payload = bankPayloadFor(seedName)
    // The walkthrough clears all four payments. Sample the LIVE substate just
    // before the end tick: for the walkthrough every account is released or paid,
    // so balances are frozen and the pre-end-tick derived cash equals the
    // settlement cash the selector-mirroring metric records.
    let live = createCampaign(ctx, seedName, { extendedTime: false }, BANK_T0)
    for (const [action, now] of bankWalkthroughFor(seedName)) {
      live = dispatch(ctx, live, action, now).state
    }
    live = advanceCampaign(ctx, live, BANK_T0 + BANK_DURATION_MS - 1_000).state
    const liveSub = bankSub(live)!
    // Run history: every critical payment cleared in the live substate.
    for (const payment of payload.payments) {
      expect(liveSub.payments[payment.id]!.cleared).toBe(true)
    }
    const liveCash = selectDerivedCash(liveSub)

    const { state } = driveBankSeed(ctx, seedName, bankWalkthroughFor(seedName))
    const outcome = bankOutcome(state)
    // Per-payment outcomes match the run history: the settled payments_cleared
    // equals the number cleared in the run.
    expect(outcome.metrics['payments_cleared']).toBe(payload.payments.length)
    // Remaining derived cash at settlement equals the selector value: the metric
    // is the selector's own computation, never a stored cash field.
    expect(outcome.metrics['derived_cash']).toBe(liveCash)
  })

  it('aggregated confidence reasons are typed codes rendered through selectors, not stored strings', () => {
    // The substate stores only typed request-outcome CODES; the display text is
    // produced by the selector renderRequestOutcome, never stored. Drive a run
    // with a hold so a refusal and an application both occur, then prove every
    // stored outcome is a member of the typed-code set and that the human text is
    // the selector's rendering, absent from the serialized substate.
    const ctx = bankContextForSeed(seedName)
    let live = createCampaign(ctx, seedName, { extendedTime: false }, BANK_T0)
    live = dispatch(ctx, live, start[0], BANK_T0).state
    live = dispatch(ctx, live, holdAct('DEP-REEVE'), BANK_T0 + 1_000).state
    live = advanceCampaign(ctx, live, BANK_T0 + BANK_DURATION_MS - 1_000).state
    const liveSub = bankSub(live)!
    const dump = JSON.stringify(liveSub)
    for (const rs of Object.values(liveSub.requests)) {
      // Every stored outcome is a typed code, never a rendered string.
      expect(REQUEST_OUTCOMES).toContain(rs.outcome)
      // The display rendering is produced by the selector, and that rendered
      // text is NOT what the substate stores (the substate has the code only).
      const rendered = renderRequestOutcome(rs.outcome)
      expect(rendered.length).toBeGreaterThan(0)
      expect(dump).not.toContain(rendered)
    }
  })

  it('clue status reflects whether the hold-justification record was inspected during the run', () => {
    const ctx = bankContextForSeed(seedName)
    const anchors = BANK_ANCHORS_BY_SEED[seedName]!

    // WITHOUT an inspect: the clue never logs, the campaign cluesFound is empty
    // of it, and the settled outcome carries no clue id.
    const noClue = driveBankSeed(ctx, seedName, [start], SETTLE_AT, false)
    expect(noClue.state.cluesFound).not.toContain(anchors.clueId)
    expect(bankOutcome(noClue.state).clueId).toBeNull()

    // WITH an inspect on the hold-justification record: the clue logs once via
    // the engine clueRecords path and survives into settlement.
    let withClue: CampaignState = createCampaign(
      ctx,
      seedName,
      { extendedTime: false },
      BANK_T0,
    )
    withClue = dispatch(ctx, withClue, start[0], BANK_T0).state
    const inspect = dispatch(
      ctx,
      withClue,
      { type: 'INSPECT_RECORD', recordId: anchors.justificationRecordId },
      BANK_T0 + 2_000,
    )
    expect(inspect.emitted.filter((e) => e.type === 'clueFound')).toEqual([
      { type: 'clueFound', clueId: anchors.clueId },
    ])
    const settled = advanceCampaign(ctx, inspect.state, SETTLE_AT).state
    expect(settled.cluesFound).toContain(anchors.clueId)
    // The module contributes no clue id on its own outcome (campaign fact, not a
    // mission outcome field).
    expect(bankOutcome(settled).clueId).toBeNull()
  })
})
