// Section-04 mission-local property suite over the REAL engine lifecycle and
// the REAL bank module, matrixed over all three authored seeds. The arbitrary
// generates sequences of valid-SHAPED and invalid-SHAPED HOLD/RELEASE/LIMIT/
// PAY/no-op actions at nondecreasing integer times across the full mission
// window, interleaved with time advances. Invalid-shaped actions are rejected
// by validate() (a dispatch rejection, never a crash), and every invariant
// holds over whatever subset the engine accepts:
//   - balances stay integers and never negative (draws clamp at zero);
//   - confidence stays in [0, 100];
//   - each authored and injected request applies at most once;
//   - selectDerivedCash always equals the sum of available unheld balances
//     (held contribute zero, limited contribute remaining allowance);
//   - settlement occurs at most once; post-settlement dispatches are no-ops;
//   - substate is JSON-safe and round-trips saveSchema at every step;
//   - substate never carries authored strings (typed codes only).
// Run count is modest and the fast-check seed is pinned (with a documented env
// override) so CI is deterministic and any counterexample replays.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import * as v from 'valibot'
import {
  advanceCampaign,
  createCampaign,
  dispatch,
} from '@engine/campaign/engine'
import type { EngineContext } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import type { CampaignAction } from '@engine/campaign/types'
import { SEED_NAMES } from '@engine/seeds/catalog'
import { BANK_MISSION_ID } from '@engine/missions/bank/module'
import { bankSaveSchema } from '@engine/missions/bank/types'
import type { BankState } from '@engine/missions/bank/types'
import { selectDerivedCash } from '@engine/missions/bank/selectors'
import {
  BANK_DURATION_MS,
  BANK_T0,
  bankContextForSeed,
  bankPayloadFor,
} from './fixtures'

const ENDS_AT = BANK_T0 + BANK_DURATION_MS
// Pinned per the deterministic split-01 harness convention; override for
// exploratory runs with BANK_PROP_SEED (an integer).
const FC_SEED = (() => {
  const raw = process.env['BANK_PROP_SEED']
  const parsed = raw !== undefined ? Number.parseInt(raw, 10) : NaN
  return Number.isInteger(parsed) ? parsed : 0x0b4c7
})()

type GenAction =
  | { readonly kind: 'HOLD'; readonly accountId: string }
  | { readonly kind: 'RELEASE'; readonly accountId: string }
  | { readonly kind: 'LIMIT'; readonly accountId: string; readonly cap: number }
  | { readonly kind: 'PAY'; readonly paymentId: string }
  | { readonly kind: 'NOOP' }

interface TimedGenAction {
  readonly action: GenAction
  /** Delta ms from mission start. Nondecreasing across the sequence. */
  readonly delta: number
}

function toCampaignAction(gen: GenAction): CampaignAction {
  switch (gen.kind) {
    case 'HOLD':
      return { type: 'MISSION_ACTION', payload: { kind: 'HOLD', accountId: gen.accountId } }
    case 'RELEASE':
      return { type: 'MISSION_ACTION', payload: { kind: 'RELEASE', accountId: gen.accountId } }
    case 'LIMIT':
      return { type: 'MISSION_ACTION', payload: { kind: 'LIMIT', accountId: gen.accountId, cap: gen.cap } }
    case 'PAY':
      return { type: 'MISSION_ACTION', payload: { kind: 'PAY', paymentId: gen.paymentId } }
    case 'NOOP':
      // A valid-shaped but unknown mission action: validate() rejects it, the
      // engine does not crash, and the substate is untouched.
      return { type: 'MISSION_ACTION', payload: { kind: 'OBSERVE' } }
  }
}

function startMission(ctx: EngineContext, seedName: string): CampaignState {
  const created = createCampaign(ctx, seedName, { extendedTime: false }, BANK_T0)
  return dispatch(
    ctx,
    created,
    { type: 'START_MISSION', missionId: BANK_MISSION_ID },
    BANK_T0,
  ).state
}

function sub(state: CampaignState): BankState | null {
  return (state.activeMission?.substate as BankState | undefined) ?? null
}

/** The sum of available unheld balances, the selector's contract, computed
 *  independently here so the property checks the selector against first
 *  principles rather than against itself. */
function expectedDerivedCash(s: BankState): number {
  let cash = 0
  for (const acct of Object.values(s.accounts)) {
    if (acct.held) continue
    if (acct.limitedTo === null) cash += acct.balance
    // Inline the limited-branch arithmetic from first principles rather than
    // calling remainingAllowance (the helper the selector itself folds through),
    // so a bug in that helper cannot pass both sides of this equality.
    else cash += Math.max(0, Math.min(acct.balance, acct.limitedTo - acct.limitedSpent))
  }
  return cash
}

describe.each(SEED_NAMES)('bank properties, seed %s', (seedName) => {
  const payload = bankPayloadFor(seedName)
  const accountIds = payload.accounts.map((a) => a.id)
  const paymentIds = payload.payments.map((p) => p.id)
  // Also feed a bogus account and payment id so validate() rejection (not a
  // crash) is exercised on the illegal path.
  const accountArb = fc.constantFrom(...accountIds, 'NOWHERE')
  const paymentArb = fc.constantFrom(...paymentIds, 'PM-NONE')
  const capArb = fc.integer({ min: 0, max: 10_000 })

  const genActionArb: fc.Arbitrary<GenAction> = fc.oneof(
    accountArb.map((accountId) => ({ kind: 'HOLD' as const, accountId })),
    accountArb.map((accountId) => ({ kind: 'RELEASE' as const, accountId })),
    fc.tuple(accountArb, capArb).map(([accountId, cap]) => ({ kind: 'LIMIT' as const, accountId, cap })),
    paymentArb.map((paymentId) => ({ kind: 'PAY' as const, paymentId })),
    fc.constant({ kind: 'NOOP' as const }),
  )

  const sequenceArb: fc.Arbitrary<TimedGenAction[]> = fc
    .array(
      fc.record({
        action: genActionArb,
        gap: fc.integer({ min: 0, max: 15_000 }),
      }),
      { minLength: 0, maxLength: 28 },
    )
    .map((entries) => {
      let delta = 0
      return entries.map(({ action, gap }) => {
        delta += gap
        return { action, delta }
      })
    })

  it('balances integer >= 0, confidence in [0,100], requests apply at most once, derived cash equals the selector contract, settlement at most once, substate round-trips and carries no authored strings', () => {
    fc.assert(
      fc.property(sequenceArb, (sequence) => {
        const ctx = bankContextForSeed(seedName)
        let state = startMission(ctx, seedName)
        let settlementCount = 0
        // Track each request's resolved outcome: once non-pending it never
        // changes (applies at most once).
        const lastOutcome = new Map<string, string>()

        const checkInvariants = (s: BankState): void => {
          // Balances: integer and never negative (draws clamp at zero; the only
          // negative balance the engine ever stores is an upstream-penalty one,
          // which these seeds never inject, so balances stay >= 0 here).
          for (const acct of Object.values(s.accounts)) {
            expect(Number.isInteger(acct.balance)).toBe(true)
            expect(acct.balance).toBeGreaterThanOrEqual(0)
            expect(Number.isInteger(acct.limitedSpent)).toBe(true)
            expect(acct.limitedSpent).toBeGreaterThanOrEqual(0)
            if (acct.limitedTo !== null) {
              expect(Number.isInteger(acct.limitedTo)).toBe(true)
              // A re-LIMIT never sets the cap below outflow already spent.
              expect(acct.limitedTo).toBeGreaterThanOrEqual(acct.limitedSpent)
            }
          }
          // Confidence clamped to [0, 100], integer.
          expect(Number.isInteger(s.confidence)).toBe(true)
          expect(s.confidence).toBeGreaterThanOrEqual(0)
          expect(s.confidence).toBeLessThanOrEqual(100)
          // Each request applies at most once: a resolved outcome is terminal.
          for (const [id, rs] of Object.entries(s.requests)) {
            if (rs.outcome !== 'pending') {
              const prev = lastOutcome.get(id)
              if (prev !== undefined) expect(rs.outcome).toBe(prev)
              lastOutcome.set(id, rs.outcome)
            }
          }
          // Each consumed threshold appears at most once.
          expect(new Set(s.injectedThresholds).size).toBe(
            s.injectedThresholds.length,
          )
          // The selector equals the sum-of-available-unheld-balances contract.
          expect(selectDerivedCash(s)).toBe(expectedDerivedCash(s))
          // Substate is JSON-safe and round-trips the reference-only schema.
          const round = v.parse(bankSaveSchema, JSON.parse(JSON.stringify(s)))
          expect(round).toEqual(s)
          // Substate carries NO authored strings: a serialized dump contains no
          // account name, flavor, request reason, or intro line.
          const dump = JSON.stringify(s)
          for (const account of payload.accounts) {
            expect(dump).not.toContain(account.name)
            expect(dump).not.toContain(account.flavor)
          }
          for (const req of payload.requests) {
            expect(dump).not.toContain(req.reason)
          }
          for (const line of payload.introLines) {
            expect(dump).not.toContain(line)
          }
        }

        const live0 = sub(state)
        if (live0) checkInvariants(live0)

        for (const { action, delta } of sequence) {
          const now = BANK_T0 + delta
          // Advance the engine clock to this action's time, then dispatch.
          const advanced = advanceCampaign(ctx, state, now)
          settlementCount += advanced.emitted.filter(
            (e) => e.type === 'settlement' && e.missionId === BANK_MISSION_ID,
          ).length
          state = advanced.state
          const live = sub(state)
          if (live) checkInvariants(live)

          const result = dispatch(ctx, state, toCampaignAction(action), now)
          // Dispatch never throws: an illegal or malformed action is rejected,
          // not a crash, and the substate stays valid.
          settlementCount += result.emitted.filter(
            (e) => e.type === 'settlement' && e.missionId === BANK_MISSION_ID,
          ).length
          state = result.state
          const liveAfter = sub(state)
          if (liveAfter) checkInvariants(liveAfter)
        }

        // Advance past the deadline so settlement always fires if it has not.
        const tail = advanceCampaign(ctx, state, ENDS_AT + 10_000)
        settlementCount += tail.emitted.filter(
          (e) => e.type === 'settlement' && e.missionId === BANK_MISSION_ID,
        ).length
        state = tail.state

        // Settles exactly once over the whole run, regardless of the action tail.
        expect(settlementCount).toBe(1)
        expect(
          state.settled.filter((s) => s.missionId === BANK_MISSION_ID),
        ).toHaveLength(1)

        // Post-settlement dispatches are no-ops: the settled outcome is frozen.
        const outcomeBefore = JSON.stringify(
          state.settled.find((s) => s.missionId === BANK_MISSION_ID),
        )
        const settledBefore = JSON.stringify(state.settled)
        let after = dispatch(
          ctx,
          state,
          { type: 'MISSION_ACTION', payload: { kind: 'HOLD', accountId: accountIds[0] } },
          ENDS_AT + 11_000,
        ).state
        after = advanceCampaign(ctx, after, ENDS_AT + 20_000).state
        expect(
          JSON.stringify(after.settled.find((s) => s.missionId === BANK_MISSION_ID)),
        ).toBe(outcomeBefore)
        expect(JSON.stringify(after.settled)).toBe(settledBefore)
      }),
      { numRuns: 120, seed: FC_SEED },
    )
  })
})
