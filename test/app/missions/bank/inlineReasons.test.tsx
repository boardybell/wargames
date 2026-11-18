// Inline disabled reasons. A control the engine rules would reject renders
// DISABLED with the engine's typed reason rendered to text INLINE next to it
// (never a tooltip alone). The held-payment teaching case is the centerpiece:
// PAY is disabled with the held-account reason while the payment's account is
// held, and becomes enabled after a RELEASE, or after a LIMIT that covers the
// payment. Every reason string is the engine's typed reason; the view invents
// none.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, send } from '@app/state'
import { ScreenRouter } from '@app/screens'
import { registerDefaultVerbs } from '@app/terminal'
import { resetAll } from '../../screens/harness'
import { registerBankScreen } from '@app/missions/bank/BankScreen'
import { __resetBankView } from '@app/missions/bank/selectors'
import { makeBankCtx } from './fixture'

const T0 = 1_000_000

let teardown: () => void

beforeEach(() => {
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

describe('inline disabled reasons', () => {
  it('RELEASE on an open account is disabled with the typed NOT HELD reason rendered inline', () => {
    const release = screen.getByTestId('ledger-RELEASE-A-OPS') as HTMLButtonElement
    expect(release.disabled).toBe(true)
    // The reason is rendered to text inline, not only as a tooltip.
    const reason = screen.getByTestId('ledger-RELEASE-A-OPS-reason')
    expect(reason.textContent).toBe('NOT HELD')
  })

  it('HOLD on an already-held account is disabled with the typed ALREADY HELD reason inline', () => {
    fireEvent.click(screen.getByTestId('ledger-HOLD-A-OPS'))
    const hold = screen.getByTestId('ledger-HOLD-A-OPS') as HTMLButtonElement
    expect(hold.disabled).toBe(true)
    expect(screen.getByTestId('ledger-HOLD-A-OPS-reason').textContent).toBe('ALREADY HELD')
  })

  it('LIMIT on a non-eligible account is disabled with the typed NOT LIMIT ELIGIBLE reason inline', () => {
    // A-OPS is operating cash: not limit-eligible in the fixture.
    const limit = screen.getByTestId('ledger-LIMIT-A-OPS') as HTMLButtonElement
    expect(limit.disabled).toBe(true)
    expect(screen.getByTestId('ledger-LIMIT-A-OPS-reason').textContent).toBe(
      'NOT LIMIT ELIGIBLE',
    )
  })

  it('teaching case: PAY is disabled with the held-account reason while its account is held, and enabled after RELEASE', () => {
    // P-PAY draws from A-PAY. Hold A-PAY, then PAY is blocked with ACCOUNT HELD.
    fireEvent.click(screen.getByTestId('ledger-HOLD-A-PAY'))
    go('payments')
    const pay = screen.getByTestId('payment-PAY-P-PAY') as HTMLButtonElement
    expect(pay.disabled).toBe(true)
    expect(screen.getByTestId('payment-PAY-P-PAY-reason').textContent).toBe('ACCOUNT HELD')

    // Release A-PAY: the designed release-to-pay resolution. PAY is now enabled.
    go('ledger')
    fireEvent.click(screen.getByTestId('ledger-RELEASE-A-PAY'))
    go('payments')
    const payAfter = screen.getByTestId('payment-PAY-P-PAY') as HTMLButtonElement
    expect(payAfter.disabled).toBe(false)
    expect(screen.queryByTestId('payment-PAY-P-PAY-reason')).toBeNull()
  })

  it('a LIMIT draft BELOW the spent outflow is disabled with the typed BELOW SPENT OUTFLOW reason inline, never dispatched', () => {
    // A-PAY is limit-eligible and funds P-PAY (10000). LIMIT it to 12000, then
    // PAY P-PAY so limitedSpent becomes 10000. A later draft cap below that spent
    // outflow (5000) is a valid integer but illegal against the real engine
    // legality: the button stays disabled with the typed reason inline rather
    // than dispatching and being silently rejected.
    const cap = screen.getByTestId('ledger-cap-A-PAY') as HTMLInputElement
    fireEvent.change(cap, { target: { value: '12000' } })
    fireEvent.click(screen.getByTestId('ledger-LIMIT-A-PAY'))
    go('payments')
    fireEvent.click(screen.getByTestId('payment-PAY-P-PAY'))
    go('ledger')

    // Now draft a cap below the 10000 already spent: valid integer, illegal cap.
    const cap2 = screen.getByTestId('ledger-cap-A-PAY') as HTMLInputElement
    fireEvent.change(cap2, { target: { value: '5000' } })
    const limit = screen.getByTestId('ledger-LIMIT-A-PAY') as HTMLButtonElement
    expect(limit.disabled).toBe(true)
    expect(screen.getByTestId('ledger-LIMIT-A-PAY-reason').textContent).toBe(
      'BELOW SPENT OUTFLOW',
    )
    // A covering cap at or above the spent outflow re-enables LIMIT.
    fireEvent.change(cap2, { target: { value: '15000' } })
    expect(
      (screen.getByTestId('ledger-LIMIT-A-PAY') as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('teaching case: a LIMIT below the payment blocks PAY with INSUFFICIENT ALLOWANCE, and a covering LIMIT re-enables it', () => {
    // A-PAY is limit-eligible in the fixture and funds P-PAY (10000). LIMIT it to
    // 5000 (below the payment): PAY is blocked with INSUFFICIENT ALLOWANCE.
    const cap = screen.getByTestId('ledger-cap-A-PAY') as HTMLInputElement
    fireEvent.change(cap, { target: { value: '5000' } })
    fireEvent.click(screen.getByTestId('ledger-LIMIT-A-PAY'))
    go('payments')
    const pay = screen.getByTestId('payment-PAY-P-PAY') as HTMLButtonElement
    expect(pay.disabled).toBe(true)
    expect(screen.getByTestId('payment-PAY-P-PAY-reason').textContent).toBe(
      'INSUFFICIENT ALLOWANCE',
    )

    // Raise the LIMIT to cover the payment (12000 >= 10000): PAY re-enables.
    go('ledger')
    const cap2 = screen.getByTestId('ledger-cap-A-PAY') as HTMLInputElement
    fireEvent.change(cap2, { target: { value: '12000' } })
    fireEvent.click(screen.getByTestId('ledger-LIMIT-A-PAY'))
    go('payments')
    const payAfter = screen.getByTestId('payment-PAY-P-PAY') as HTMLButtonElement
    expect(payAfter.disabled).toBe(false)
  })
})
