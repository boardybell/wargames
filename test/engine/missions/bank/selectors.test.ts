import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  broadHoldActive,
  buildScoreboard,
  selectDerivedCash,
  selectObservedWithdrawals,
  selectPredictedWithdrawals,
} from '@engine/missions/bank/selectors'
import type {
  AccountState,
  BankState,
  RequestState,
} from '@engine/missions/bank/types'
import { FIXTURE_PAYLOAD } from './fixtures'

function acct(over: Partial<AccountState> = {}): AccountState {
  return { balance: 1000, held: false, limitedTo: null, limitedSpent: 0, ...over }
}

function stateWith(
  accounts: Record<string, AccountState>,
  over: Partial<BankState> = {},
): BankState {
  return {
    accounts,
    requests: {},
    payments: {},
    confidence: 60,
    firstBroadHoldAt: null,
    injectedThresholds: [],
    clearedSinceTick: 0,
    releasesSinceTick: 0,
    injectMagnitude: 0,
    durationMs: 240_000,
    endsAt: null,
    ...over,
  }
}

describe('selectDerivedCash', () => {
  it('held accounts contribute zero, open full, limited up to allowance', () => {
    const s = stateWith({
      A: acct({ balance: 1000 }),
      B: acct({ balance: 500, held: true }),
      C: acct({ balance: 800, limitedTo: 300, limitedSpent: 100 }),
    })
    // A=1000, B held=0, C limited remaining = min(800, 200) = 200
    expect(selectDerivedCash(s)).toBe(1200)
  })

  it('the empty account map is zero cash', () => {
    expect(selectDerivedCash(stateWith({}))).toBe(0)
  })
})

describe('selectObservedWithdrawals: the OBSERVED total', () => {
  function req(over: Partial<RequestState> = {}): RequestState {
    return {
      outcome: 'applied',
      appliedAmount: 0,
      arrivedAfterHold: false,
      injected: false,
      ...over,
    }
  }

  it('sums the dollars actually drawn by every RESOLVED request, skipping pending', () => {
    const s = stateWith(
      { A: acct() },
      {
        requests: {
          R1: req({ outcome: 'applied', appliedAmount: 300 }),
          R2: req({ outcome: 'partial', appliedAmount: 120 }),
          R3: req({ outcome: 'refused', appliedAmount: 0 }),
          R4: req({ outcome: 'pending', appliedAmount: 0 }),
        },
      },
    )
    // 300 + 120 + 0, pending contributes nothing.
    expect(selectObservedWithdrawals(s)).toBe(420)
  })

  it('is zero with no resolved requests', () => {
    const s = stateWith({ A: acct() })
    expect(selectObservedWithdrawals(s)).toBe(0)
  })
})

describe('selectPredictedWithdrawals: the WOPR line', () => {
  it('returns the unshifted authored series when no hold is active', () => {
    const s = stateWith({ A: acct() })
    expect(selectPredictedWithdrawals(FIXTURE_PAYLOAD, s)).toEqual([100, 200, 300, 400])
  })

  it('shifts the series upward by the authored percent while the broad hold is active', () => {
    const s = stateWith(
      { A: acct({ held: true }), B: acct({ held: true }) },
      { firstBroadHoldAt: 1_000 },
    )
    // holdShiftPercent 50: each base plus floor(base*50/100)
    expect(selectPredictedWithdrawals(FIXTURE_PAYLOAD, s)).toEqual([150, 300, 450, 600])
  })

  it('returns to the unshifted series once every hold is released (pure, immediate)', () => {
    // firstBroadHoldAt stamped but no account held now: line drops back.
    const s = stateWith(
      { A: acct({ held: false }) },
      { firstBroadHoldAt: 1_000 },
    )
    expect(broadHoldActive(s)).toBe(false)
    expect(selectPredictedWithdrawals(FIXTURE_PAYLOAD, s)).toEqual([100, 200, 300, 400])
  })
})

describe('the divergence: WOPR line vs derived cash as holds grow', () => {
  it('holding accounts RAISES the WOPR line while derived cash FALLS', () => {
    const open = stateWith({
      A: acct({ balance: 1000 }),
      B: acct({ balance: 1000 }),
      C: acct({ balance: 1000 }),
    })
    const held = stateWith(
      {
        A: acct({ balance: 1000, held: true }),
        B: acct({ balance: 1000, held: true }),
        C: acct({ balance: 1000, held: true }),
      },
      { firstBroadHoldAt: 1_000 },
    )
    const lineOpen = selectPredictedWithdrawals(FIXTURE_PAYLOAD, open)
    const lineHeld = selectPredictedWithdrawals(FIXTURE_PAYLOAD, held)
    // WOPR's predicted-withdrawal line rises under the hold.
    for (let i = 0; i < lineOpen.length; i += 1) {
      expect(lineHeld[i]!).toBeGreaterThan(lineOpen[i]!)
    }
    // Real derived cash collapses: held accounts contribute nothing.
    expect(selectDerivedCash(open)).toBe(3000)
    expect(selectDerivedCash(held)).toBe(0)
  })
})

describe('scoreboard facts feed OPEN EXCEPTIONS', () => {
  it('held accounts count as WOPR-resolved exceptions', () => {
    const s = stateWith({
      A: acct({ held: true }),
      B: acct({ held: true }),
      C: acct(),
    })
    const board = buildScoreboard(FIXTURE_PAYLOAD, s)
    expect(board.heldAccounts).toBe(2)
  })
})

describe('structural: reducers never read the prediction selector', () => {
  it('rules.ts does not import selectors.ts', () => {
    const rulesSrc = readFileSync(
      fileURLToPath(new URL('../../../../src/engine/missions/bank/rules.ts', import.meta.url)),
      'utf8',
    )
    expect(rulesSrc).not.toMatch(/['"]\.\/selectors['"]/)
  })

  it('module.ts does not import selectors.ts on the reduce path', () => {
    const moduleSrc = readFileSync(
      fileURLToPath(new URL('../../../../src/engine/missions/bank/module.ts', import.meta.url)),
      'utf8',
    )
    expect(moduleSrc).not.toMatch(/['"]\.\/selectors['"]/)
  })
})
