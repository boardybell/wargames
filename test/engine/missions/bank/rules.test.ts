import { describe, expect, it } from 'vitest'
import {
  applyWithdrawal,
  availableToDraw,
  clampConfidence,
  downwardCrossings,
  injectedSize,
  limitLegality,
  payLegality,
  remainingAllowance,
  signalCount,
  sustainabilitySignals,
  tickDelta,
  tierFromSignals,
} from '@engine/missions/bank/rules'
import type { AccountState, BankState } from '@engine/missions/bank/types'
import { FIXTURE_PAYLOAD } from './fixtures'

function acct(over: Partial<AccountState> = {}): AccountState {
  return { balance: 1000, held: false, limitedTo: null, limitedSpent: 0, ...over }
}

describe('withdrawal application table', () => {
  it('open account applies in full', () => {
    const r = applyWithdrawal(acct({ balance: 1000 }), 300)
    expect(r.outcome).toBe('applied')
    expect(r.drawn).toBe(300)
    expect(r.account.balance).toBe(700)
  })

  it('held account refuses with the refused code, draws nothing', () => {
    const r = applyWithdrawal(acct({ held: true, balance: 1000 }), 300)
    expect(r.outcome).toBe('refused')
    expect(r.drawn).toBe(0)
    expect(r.account.balance).toBe(1000)
  })

  it('limited account applies up to the remaining allowance, partial when clipped', () => {
    const r = applyWithdrawal(acct({ balance: 1000, limitedTo: 200, limitedSpent: 50 }), 300)
    expect(r.outcome).toBe('partial')
    expect(r.drawn).toBe(150) // 200 cap minus 50 spent
    expect(r.account.balance).toBe(850)
    expect(r.account.limitedSpent).toBe(200)
  })

  it('limited account within allowance applies fully', () => {
    const r = applyWithdrawal(acct({ balance: 1000, limitedTo: 500, limitedSpent: 0 }), 300)
    expect(r.outcome).toBe('applied')
    expect(r.drawn).toBe(300)
  })

  it('exact-balance boundary applies fully and leaves zero', () => {
    const r = applyWithdrawal(acct({ balance: 300 }), 300)
    expect(r.outcome).toBe('applied')
    expect(r.drawn).toBe(300)
    expect(r.account.balance).toBe(0)
  })

  it('over-balance open draw clips to balance and reads partial', () => {
    const r = applyWithdrawal(acct({ balance: 200 }), 300)
    expect(r.outcome).toBe('partial')
    expect(r.drawn).toBe(200)
    expect(r.account.balance).toBe(0)
  })
})

describe('cumulative LIMIT', () => {
  it('multiple withdrawals draw down a single cumulative allowance', () => {
    let a = acct({ balance: 1000, limitedTo: 400, limitedSpent: 0 })
    const r1 = applyWithdrawal(a, 250)
    a = r1.account
    expect(r1.drawn).toBe(250)
    const r2 = applyWithdrawal(a, 250)
    expect(r2.drawn).toBe(150) // only 150 of the 400 cap remains
    expect(r2.outcome).toBe('partial')
    expect(remainingAllowance(r2.account)).toBe(0)
  })

  it('re-LIMIT below outflow already spent is rejected', () => {
    const state = {
      accounts: { BELROSE: acct({ balance: 1000, limitedTo: 400, limitedSpent: 300 }) },
    } as unknown as BankState
    const low = limitLegality(FIXTURE_PAYLOAD, state, 'BELROSE', 200)
    expect(low).toEqual({ legal: false, reason: 'BELOW SPENT OUTFLOW' })
    const ok = limitLegality(FIXTURE_PAYLOAD, state, 'BELROSE', 350)
    expect(ok.legal).toBe(true)
  })

  it('LIMIT only legal on limit-eligible accounts', () => {
    const state = {
      accounts: { ANCHORA: acct(), BELROSE: acct() },
    } as unknown as BankState
    expect(limitLegality(FIXTURE_PAYLOAD, state, 'ANCHORA', 100)).toEqual({
      legal: false,
      reason: 'NOT LIMIT ELIGIBLE',
    })
    expect(limitLegality(FIXTURE_PAYLOAD, state, 'BELROSE', 100).legal).toBe(true)
  })
})

describe('PAY legality', () => {
  function stateWith(acctOver: Partial<AccountState>): BankState {
    return {
      accounts: { ANCHORA: acct(acctOver) },
      payments: { P1: { cleared: false } },
    } as unknown as BankState
  }

  it('blocked while the account is held', () => {
    expect(payLegality(FIXTURE_PAYLOAD, stateWith({ held: true, balance: 1000 }), 'P1')).toEqual({
      legal: false,
      reason: 'ACCOUNT HELD',
    })
  })

  it('legal when open with sufficient balance', () => {
    expect(payLegality(FIXTURE_PAYLOAD, stateWith({ balance: 1000 }), 'P1').legal).toBe(true)
  })

  it('rejected on insufficient balance', () => {
    expect(payLegality(FIXTURE_PAYLOAD, stateWith({ balance: 100 }), 'P1')).toEqual({
      legal: false,
      reason: 'INSUFFICIENT BALANCE',
    })
  })

  it('legal while limited if the remaining allowance covers it', () => {
    expect(
      payLegality(FIXTURE_PAYLOAD, stateWith({ balance: 1000, limitedTo: 600, limitedSpent: 0 }), 'P1')
        .legal,
    ).toBe(true)
    expect(
      payLegality(FIXTURE_PAYLOAD, stateWith({ balance: 1000, limitedTo: 400, limitedSpent: 50 }), 'P1'),
    ).toEqual({ legal: false, reason: 'INSUFFICIENT ALLOWANCE' })
  })

  it('already-cleared payment is rejected', () => {
    const s = {
      accounts: { ANCHORA: acct() },
      payments: { P1: { cleared: true } },
    } as unknown as BankState
    expect(payLegality(FIXTURE_PAYLOAD, s, 'P1')).toEqual({
      legal: false,
      reason: 'ALREADY CLEARED',
    })
  })
})

describe('availableToDraw and derived-cash contribution', () => {
  it('held contributes zero, open full, limited up to allowance', () => {
    expect(availableToDraw(acct({ balance: 1000 }))).toBe(1000)
    expect(availableToDraw(acct({ balance: 1000, limitedTo: 300, limitedSpent: 100 }))).toBe(200)
    expect(availableToDraw(acct({ balance: 150, limitedTo: 300, limitedSpent: 0 }))).toBe(150)
  })
})

describe('tick delta table', () => {
  const t = FIXTURE_PAYLOAD // perHeld -8, perCleared 6, perRelease 2, cashBelowFloor -10

  it('held-account penalty isolated', () => {
    expect(tickDelta(t, { heldAccounts: 3, clearedPayments: 0, selectiveReleases: 0, cashBelowFloor: false })).toBe(-24)
  })
  it('cleared-payments bonus isolated', () => {
    expect(tickDelta(t, { heldAccounts: 0, clearedPayments: 2, selectiveReleases: 0, cashBelowFloor: false })).toBe(12)
  })
  it('selective-release bonus isolated', () => {
    expect(tickDelta(t, { heldAccounts: 0, clearedPayments: 0, selectiveReleases: 1, cashBelowFloor: false })).toBe(2)
  })
  it('cash-below-floor penalty isolated', () => {
    expect(tickDelta(t, { heldAccounts: 0, clearedPayments: 0, selectiveReleases: 0, cashBelowFloor: true })).toBe(-10)
  })
  it('combined', () => {
    expect(tickDelta(t, { heldAccounts: 2, clearedPayments: 1, selectiveReleases: 1, cashBelowFloor: true })).toBe(-16 + 6 + 2 - 10)
  })
  it('clamps to 0..100 at both ends', () => {
    expect(clampConfidence(60 + 100)).toBe(100)
    expect(clampConfidence(5 - 40)).toBe(0)
  })
})

describe('threshold downward crossings', () => {
  it('a downward crossing of an unconsumed threshold fires once', () => {
    expect(downwardCrossings(FIXTURE_PAYLOAD, 45, 35, [])).toEqual([40])
  })
  it('an already-consumed threshold cannot re-fire', () => {
    expect(downwardCrossings(FIXTURE_PAYLOAD, 45, 35, [40])).toEqual([])
  })
  it('recovery upward then a second downward crossing cannot double-inject', () => {
    // First crossing consumes 40.
    const first = downwardCrossings(FIXTURE_PAYLOAD, 45, 35, [])
    expect(first).toEqual([40])
    // Recovery above and a second dip: 40 is now consumed, so no re-injection.
    expect(downwardCrossings(FIXTURE_PAYLOAD, 50, 30, [40])).toEqual([])
  })
  it('an upward move injects nothing', () => {
    expect(downwardCrossings(FIXTURE_PAYLOAD, 30, 50, [])).toEqual([])
  })
})

describe('injected sizing', () => {
  it('base when no inbound magnitude', () => {
    expect(injectedSize(150, 0)).toBe(150)
  })
  it('base plus capped inbound magnitude, never below base', () => {
    expect(injectedSize(150, 40)).toBe(190)
    expect(injectedSize(150, -5)).toBe(150)
  })
})

describe('tiering from REAL sustainability signals', () => {
  function state(over: Partial<BankState>): BankState {
    return {
      accounts: {},
      requests: {},
      payments: { P1: { cleared: true }, P2: { cleared: true } },
      confidence: 60,
      ...over,
    } as unknown as BankState
  }

  it('all three signals met gives full', () => {
    const s = state({ confidence: 60 })
    const sig = sustainabilitySignals(FIXTURE_PAYLOAD, s, 3000)
    expect(signalCount(sig)).toBe(3)
    expect(tierFromSignals(3, FIXTURE_PAYLOAD.tierThresholds)).toBe('full')
  })

  it('cash below floor drops a signal', () => {
    const s = state({ confidence: 60 })
    const sig = sustainabilitySignals(FIXTURE_PAYLOAD, s, 100)
    expect(sig.cashAtOrAboveFloor).toBe(false)
    expect(signalCount(sig)).toBe(2)
  })

  it('confidence below target drops a signal', () => {
    const s = state({ confidence: 40 })
    const sig = sustainabilitySignals(FIXTURE_PAYLOAD, s, 3000)
    expect(sig.confidenceAtOrAboveTarget).toBe(false)
  })

  it('a payment not cleared drops the payments signal', () => {
    const s = state({ payments: { P1: { cleared: true }, P2: { cleared: false } } })
    const sig = sustainabilitySignals(FIXTURE_PAYLOAD, s, 3000)
    expect(sig.paymentsCleared).toBe(false)
  })

  it('tier ladder maps counts to tiers', () => {
    const th = FIXTURE_PAYLOAD.tierThresholds
    expect(tierFromSignals(3, th)).toBe('full')
    expect(tierFromSignals(2, th)).toBe('partial')
    expect(tierFromSignals(1, th)).toBe('poor')
    expect(tierFromSignals(0, th)).toBe('failed')
  })
})
