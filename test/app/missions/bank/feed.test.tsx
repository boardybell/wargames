// The withdrawal request feed. Each entry renders its request, its application
// outcome, its reason line, and its markers: BEFORE HOLD / AFTER HOLD and
// INJECTED. The reason lines come from engine selectors: the AUTHORED reason off
// the payload for an authored request, and the CODE-DERIVED outcome text from
// renderRequestOutcome. No reason string is read from substate. Markers are the
// engine-recorded facts (arrivedAfterHold, injected); the view renders them, it
// does not compute them.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, send, wake, getState } from '@app/state'
import { ScreenRouter } from '@app/screens'
import { registerDefaultVerbs } from '@app/terminal'
import { renderRequestOutcome } from '@engine/missions/bank/selectors'
import { resetAll } from '../../screens/harness'
import { registerBankScreen } from '@app/missions/bank/BankScreen'
import { __resetBankView } from '@app/missions/bank/selectors'
import { BANK_FIXTURE_PAYLOAD, makeBankCtx, bankSub } from './fixture'

const T0 = 1_000_000

let teardown: () => void

function boot(): void {
  resetAll()
  __resetBankView()
  vi.spyOn(Date, 'now').mockReturnValue(T0)
  registerDefaultVerbs()
  registerBankScreen()
  teardown = init({
    ctx: makeBankCtx(),
    seedName: 'test-seed',
    port: { read: () => null, write: () => {}, remove: () => {} },
  })
  act(() => {
    send({ type: 'START_MISSION', missionId: 'bank' })
  })
  render(<ScreenRouter />)
}

function advanceEngine(toMs: number): void {
  vi.spyOn(Date, 'now').mockReturnValue(toMs)
  act(() => {
    wake()
  })
}

beforeEach(() => {
  boot()
})

afterEach(() => {
  teardown()
  __resetBankView()
  vi.restoreAllMocks()
  cleanup()
})

function go(view: 'ledger' | 'feed' | 'payments'): void {
  fireEvent.click(screen.getByTestId(`bank-tab-${view}`))
}

describe('feed markers and reason lines', () => {
  it('an authored request that drains with no broad hold reads BEFORE HOLD with its code-derived outcome text and authored reason', () => {
    // R-1 (A-OPS, 5000) fires at 20s. Advance past it with no hold: it drains
    // BEFORE HOLD and clears in full.
    advanceEngine(T0 + 25_000)
    go('feed')
    const row = screen.getByTestId('feed-row-R-1')
    expect(row).toHaveAttribute('data-marker', 'BEFORE HOLD')
    expect(row).toHaveAttribute('data-outcome', 'applied')
    // The outcome text is the engine code-derived string, not a substate string.
    expect(screen.getByTestId('feed-outcome-R-1').textContent).toBe(
      renderRequestOutcome('applied'),
    )
    // The AUTHORED reason comes straight off the payload def.
    const def = BANK_FIXTURE_PAYLOAD.requests.find((r) => r.id === 'R-1')!
    expect(row.textContent).toContain(def.reason)
  })

  it('an authored request that drains after a broad hold reads AFTER HOLD', () => {
    // HOLD A-OPS before R-1 fires (broadHoldCount 0 stamps on the first hold),
    // so R-1 (A-OPS) resolves AFTER the broad hold and is refused.
    fireEvent.click(screen.getByTestId('ledger-HOLD-A-OPS'))
    advanceEngine(T0 + 25_000)
    go('feed')
    const row = screen.getByTestId('feed-row-R-1')
    expect(row).toHaveAttribute('data-marker', 'AFTER HOLD')
    expect(row).toHaveAttribute('data-outcome', 'refused')
    expect(screen.getByTestId('feed-outcome-R-1').textContent).toBe(
      renderRequestOutcome('refused'),
    )
  })

  it('an injected request renders the INJECTED marker once a threshold crossing fires it', () => {
    // Before any crossing the injected request shows PENDING and INJECTED.
    go('feed')
    const injRow = screen.getByTestId('feed-row-INJ-1')
    expect(injRow).toHaveAttribute('data-injected', 'true')
    expect(injRow).toHaveAttribute('data-marker', 'INJECTED')
    expect(injRow).toHaveAttribute('data-outcome', 'pending')

    // Hold accounts to crater confidence across ticks until it crosses 50, firing
    // the threshold injection. Hold three accounts; each tick removes 4 per held
    // account. Advance across several ticks to the mission end.
    go('ledger')
    fireEvent.click(screen.getByTestId('ledger-HOLD-A-OPS'))
    fireEvent.click(screen.getByTestId('ledger-HOLD-A-VEND'))
    fireEvent.click(screen.getByTestId('ledger-HOLD-A-MUNI'))
    fireEvent.click(screen.getByTestId('ledger-HOLD-A-PAY'))
    // Advance through the tick schedule so confidence falls below 50 and the
    // injection fires once.
    advanceEngine(T0 + 35_000)
    expect(bankSub(getState()).injectedThresholds).toContain(50)
    go('feed')
    const injResolved = screen.getByTestId('feed-row-INJ-1')
    // The injected draw resolved against A-OPS (held), so it is refused but still
    // flagged INJECTED (a contagion draw is never a genuine depositor draw).
    expect(injResolved).toHaveAttribute('data-injected', 'true')
    expect(injResolved).toHaveAttribute('data-marker', 'INJECTED')
    expect(injResolved).not.toHaveAttribute('data-outcome', 'pending')
  })

  it('no reason string is read from substate: the substate requests carry codes only', () => {
    advanceEngine(T0 + 25_000)
    const requests = bankSub(getState()).requests
    for (const rs of Object.values(requests) as unknown as Array<
      Record<string, unknown>
    >) {
      // Only the typed code fields exist; no reason/name string smuggled in.
      expect('reason' in rs).toBe(false)
      expect('name' in rs).toBe(false)
      expect(typeof rs['outcome']).toBe('string')
    }
  })
})
