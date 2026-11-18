import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { bankSaveSchema } from '@engine/missions/bank/types'
import type { BankState } from '@engine/missions/bank/types'

function populated(): BankState {
  return {
    accounts: {
      A: { balance: 1000, held: false, limitedTo: null, limitedSpent: 0 },
      B: { balance: 500, held: true, limitedTo: null, limitedSpent: 0 },
      C: { balance: 800, held: false, limitedTo: 300, limitedSpent: 100 },
    },
    requests: {
      W1: { outcome: 'applied', appliedAmount: 200, arrivedAfterHold: false, injected: false },
      W2: { outcome: 'refused', appliedAmount: 0, arrivedAfterHold: true, injected: false },
      W3: { outcome: 'partial', appliedAmount: 150, arrivedAfterHold: true, injected: true },
    },
    payments: { P1: { cleared: true }, P2: { cleared: false } },
    confidence: 55,
    firstBroadHoldAt: 1_000_123,
    injectedThresholds: [40],
    clearedSinceTick: 1,
    releasesSinceTick: 0,
    injectMagnitude: 0,
    durationMs: 240_000,
    endsAt: 1_240_000,
  }
}

describe('bank saveSchema: reference-only round-trip', () => {
  it('round-trips a populated substate', () => {
    const state = populated()
    const parsed = v.parse(bankSaveSchema, state)
    expect(parsed).toEqual(state)
  })

  it('rejects a reason string smuggled into an account', () => {
    const bad = populated() as unknown as Record<string, unknown>
    ;(bad['accounts'] as Record<string, Record<string, unknown>>)['A']![
      'name'
    ] = 'ANCHORA HOLDINGS'
    expect(() => v.parse(bankSaveSchema, bad)).toThrow()
  })

  it('rejects a reason string on a request', () => {
    const bad = populated() as unknown as Record<string, unknown>
    ;(bad['requests'] as Record<string, Record<string, unknown>>)['W1']![
      'reason'
    ] = 'PANIC WAVE ONE'
    expect(() => v.parse(bankSaveSchema, bad)).toThrow()
  })

  it('admits typed outcome codes only, rejects an arbitrary code', () => {
    const bad = populated() as unknown as Record<string, unknown>
    ;(bad['requests'] as Record<string, Record<string, unknown>>)['W1']![
      'outcome'
    ] = 'FROZEN'
    expect(() => v.parse(bankSaveSchema, bad)).toThrow()
  })

  it('confidence outside 0..100 is rejected', () => {
    const over = { ...populated(), confidence: 101 }
    const under = { ...populated(), confidence: -1 }
    expect(() => v.parse(bankSaveSchema, over)).toThrow()
    expect(() => v.parse(bankSaveSchema, under)).toThrow()
  })

  it('rejects negative injectMagnitude, durationMs, or endsAt (lower bounds)', () => {
    expect(() => v.parse(bankSaveSchema, { ...populated(), injectMagnitude: -1 })).toThrow()
    expect(() => v.parse(bankSaveSchema, { ...populated(), durationMs: -1 })).toThrow()
    expect(() => v.parse(bankSaveSchema, { ...populated(), endsAt: -1 })).toThrow()
    // Zero is admissible for each.
    expect(() =>
      v.parse(bankSaveSchema, { ...populated(), injectMagnitude: 0, durationMs: 0, endsAt: 0 }),
    ).not.toThrow()
  })

  it('structurally has NO cash field: adding one fails strictObject', () => {
    const bad = { ...populated(), derivedCash: 5000 } as unknown
    expect(() => v.parse(bankSaveSchema, bad)).toThrow()
    // And the type itself carries no cash key.
    const keys = Object.keys(populated())
    expect(keys).not.toContain('cash')
    expect(keys).not.toContain('derivedCash')
  })
})
