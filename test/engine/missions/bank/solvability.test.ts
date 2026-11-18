// The FREEZE BANK ACCOUNTS solvability invariants (section 02), run through
// the REAL module and engine lifecycle over the three authored seeds. The
// walkthrough reads the evidence (TRACE of the hold-justification record so
// clue-found is exercised), holds selectively, limits, releases to pay, clears
// all four critical payments, and settles at FULL. Surge variant A lets
// confidence cross at least one threshold (base injections) then recovers to a
// sustainable tier. Surge variant B is the same script with the inbound
// flightsDisrupted consequence at its engine-capped maximum, and must stay
// solvable. Module rules (application tables, broad-hold stamping, terminal
// paths) are section-01's suite and are not re-tested here.
import { describe, expect, it } from 'vitest'
import { SEED_NAMES } from '@engine/seeds/catalog'
import {
  BANK_DURATION_MS,
  BANK_T0,
  bankContextForSeed,
  bankPayloadFor,
  bankSurgeExpectation,
  bankSurgeFor,
  bankWalkthroughExpectation,
  bankWalkthroughFor,
  driveBankSeed,
} from './fixtures'

const TIER_RANK: Record<string, number> = {
  failed: 0,
  poor: 1,
  partial: 2,
  full: 3,
}

function bankOutcome(state: {
  settled: readonly { missionId: string; tier: string; metrics: Record<string, number> }[]
}) {
  return state.settled.find((s) => s.missionId === 'bank')!
}

describe.each(SEED_NAMES)('FREEZE BANK ACCOUNTS solvability: %s', (seedName) => {
  it('the walkthrough clears all four payments and settles at FULL above the floor', () => {
    const ctx = bankContextForSeed(seedName)
    const { state } = driveBankSeed(ctx, seedName, bankWalkthroughFor(seedName))
    const payload = bankPayloadFor(seedName)
    const expected = bankWalkthroughExpectation(seedName)
    const outcome = bankOutcome(state)
    expect(outcome.tier).toBe(expected.tier)
    expect(outcome.metrics['payments_cleared']).toBe(expected.clearedPayments)
    expect(outcome.metrics['payments_total']).toBe(expected.totalPayments)
    // Sustainable settlement: derived cash at or above the floor and confidence
    // at or above the target. All three signals read.
    expect(outcome.metrics['derived_cash']!).toBeGreaterThanOrEqual(payload.floor)
    expect(outcome.metrics['confidence']!).toBeGreaterThanOrEqual(payload.target)
    expect(outcome.metrics['sustainability_signals']).toBe(3)
  })

  it('the walkthrough TRACE of the hold-justification record surfaces the D-83 clue', () => {
    const ctx = bankContextForSeed(seedName)
    const expected = bankWalkthroughExpectation(seedName)
    const { state } = driveBankSeed(ctx, seedName, bankWalkthroughFor(seedName))
    expect(state.cluesFound).toContain(expected.clueId)
  })

  it('surge variant A crosses a threshold then recovers to a sustainable tier', () => {
    const ctx = bankContextForSeed(seedName)
    const { state } = driveBankSeed(ctx, seedName, bankSurgeFor(seedName))
    const outcome = bankOutcome(state)
    const expected = bankSurgeExpectation(seedName)
    // The surge genuinely fired injected (contagion) withdrawals the holds
    // provoked: at least one injected draw after the broad hold stamped.
    expect(outcome.metrics['injected_after_hold_count']!).toBeGreaterThanOrEqual(1)
    // And it still recovered to the documented sustainable tier.
    expect(TIER_RANK[outcome.tier]!).toBeGreaterThanOrEqual(TIER_RANK[expected.tier]!)
    expect(outcome.metrics['payments_cleared']).toBe(expected.clearedPayments)
  })

  it('surge variant B (base plus max-capped inbound magnitude) stays solvable', () => {
    const ctx = bankContextForSeed(seedName)
    const { state } = driveBankSeed(
      ctx,
      seedName,
      bankSurgeFor(seedName),
      BANK_T0 + BANK_DURATION_MS + 1_000,
      true,
    )
    const outcome = bankOutcome(state)
    const expected = bankSurgeExpectation(seedName)
    // Same solvability under the maximum inbound surge: every payment clears
    // and the run settles at the documented tier or better.
    expect(TIER_RANK[outcome.tier]!).toBeGreaterThanOrEqual(TIER_RANK[expected.tier]!)
    expect(outcome.metrics['payments_cleared']).toBe(expected.clearedPayments)
    expect(outcome.metrics['injected_after_hold_count']!).toBeGreaterThanOrEqual(1)
  })

  it('variant B injections draw strictly more than variant A (base plus capped magnitude bites)', () => {
    const ctx = bankContextForSeed(seedName)
    const a = bankOutcome(
      driveBankSeed(ctx, seedName, bankSurgeFor(seedName)).state,
    )
    const b = bankOutcome(
      driveBankSeed(
        ctx,
        seedName,
        bankSurgeFor(seedName),
        BANK_T0 + BANK_DURATION_MS + 1_000,
        true,
      ).state,
    )
    // The injected (contagion) withdrawals are larger under variant B: base
    // plus the capped inbound magnitude, never below base.
    expect(b.metrics['injected_after_hold_amount']!).toBeGreaterThan(
      a.metrics['injected_after_hold_amount']!,
    )
  })
})
