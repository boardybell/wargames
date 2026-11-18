// One full hold-release-pay flow, run keyboard-only AND at a narrow viewport,
// through the real BankScreen and the real engine (no mocks of either). The
// keyboard path types every interaction into the one shared command line (no
// pointer events); the narrow path drives the same flow through the controls at
// a narrow viewport. The flow holds the payment's account (PAY blocks with the
// held reason), releases it (PAY unblocks), and pays (the payment clears). This
// proves the screen is operable both ways; the full per-seed passes live in
// section 04.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, send, getState } from '@app/state'
import { ScreenRouter } from '@app/screens'
import { registerDefaultVerbs } from '@app/terminal'
import { resetAll } from '../../screens/harness'
import { registerBankScreen } from '@app/missions/bank/BankScreen'
import { __resetBankView } from '@app/missions/bank/selectors'
import { makeBankCtx, bankSub } from './fixture'

const T0 = 1_000_000

function setNarrow(narrow: boolean): void {
  window.matchMedia = vi.fn((q: string) => ({
    matches: q.includes('max-width') ? narrow : false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

let teardown: () => void

function boot(narrow: boolean): void {
  resetAll()
  __resetBankView()
  setNarrow(narrow)
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

afterEach(() => {
  teardown()
  __resetBankView()
  vi.restoreAllMocks()
  cleanup()
})

function typeCommand(text: string): void {
  const input = screen.getByTestId('command-input') as HTMLInputElement
  act(() => {
    fireEvent.change(input, { target: { value: text } })
    fireEvent.submit(screen.getByTestId('command-form'))
  })
}

describe('hold-release-pay flow keyboard-only (wide, multi-pane)', () => {
  beforeEach(() => boot(false))

  it('completes a full hold-release-pay flow entirely from the command line', () => {
    // HOLD the payment account A-PAY by typed command (no pointer).
    typeCommand('HOLD A-PAY')
    expect(bankSub(getState()).accounts['A-PAY']?.held).toBe(true)

    // PAYMENTS view by typed command; PAY is blocked while the account is held.
    typeCommand('PAYMENTS')
    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'payments')
    const payHeld = screen.getByTestId('payment-PAY-P-PAY') as HTMLButtonElement
    expect(payHeld.disabled).toBe(true)
    expect(screen.getByTestId('payment-PAY-P-PAY-reason').textContent).toBe('ACCOUNT HELD')

    // RELEASE the account by typed command, then PAY by typed command.
    typeCommand('RELEASE A-PAY')
    expect(bankSub(getState()).accounts['A-PAY']?.held).toBe(false)
    typeCommand('PAY P-PAY')
    expect(bankSub(getState()).payments['P-PAY']?.cleared).toBe(true)
  })

  it('a WIDE viewport renders TWO panes: the ledger stays visible alongside the payments pane', () => {
    // The wide layout is genuinely multi-pane off matchMedia (not hardcoded).
    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-pane', 'two')
    typeCommand('PAYMENTS')
    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'payments')
    // Both panes are present at once: the ledger is NOT collapsed away.
    expect(screen.getByTestId('bank-ledger-view')).toBeInTheDocument()
    expect(screen.getByTestId('bank-payments-view')).toBeInTheDocument()
    // With the ledger always visible, no mobile BACK affordance is rendered.
    expect(screen.queryByTestId('bank-back')).toBeNull()
  })

  it('the shared command input stays focusable after view switches', () => {
    const input = screen.getByTestId('command-input') as HTMLInputElement
    act(() => {
      input.focus()
    })
    expect(document.activeElement).toBe(input)
    typeCommand('FEED')
    typeCommand('LEDGER')
    const after = screen.getByTestId('command-input') as HTMLInputElement
    act(() => {
      after.focus()
    })
    expect(document.activeElement).toBe(after)
  })
})

describe('hold-release-pay flow at a narrow viewport (single pane, real collapse)', () => {
  beforeEach(() => boot(true))

  it('a NARROW viewport GENUINELY collapses to one pane: the ledger is gone on the payments view', () => {
    // Single pane off matchMedia, a real difference from the wide two-pane DOM.
    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-pane', 'single')
    // On the ledger view, the ledger is the one visible pane and payments is not.
    expect(screen.getByTestId('bank-ledger-view')).toBeInTheDocument()
    expect(screen.queryByTestId('bank-payments-view')).toBeNull()

    // Switch to payments: the pane COLLAPSES to only payments, the ledger is
    // removed from the DOM (the wide layout keeps both). This is the genuine
    // difference the wide pass does not have.
    fireEvent.click(screen.getByTestId('bank-tab-payments'))
    expect(screen.getByTestId('bank-payments-view')).toBeInTheDocument()
    expect(screen.queryByTestId('bank-ledger-view')).toBeNull()
    // The mobile BACK affordance appears only in the collapsed single-pane case.
    expect(screen.getByTestId('bank-back')).toBeInTheDocument()
  })

  it('completes the full hold-release-pay flow through the controls at narrow width', () => {
    fireEvent.click(screen.getByTestId('ledger-HOLD-A-PAY'))
    expect(bankSub(getState()).accounts['A-PAY']?.held).toBe(true)

    // Move to payments via the tab; PAY is blocked, then released, then clears.
    fireEvent.click(screen.getByTestId('bank-tab-payments'))
    expect((screen.getByTestId('payment-PAY-P-PAY') as HTMLButtonElement).disabled).toBe(true)

    // Back to the ledger (the mobile back affordance), release, return, pay.
    fireEvent.click(screen.getByTestId('bank-tab-ledger'))
    fireEvent.click(screen.getByTestId('ledger-RELEASE-A-PAY'))
    fireEvent.click(screen.getByTestId('bank-tab-payments'))
    fireEvent.click(screen.getByTestId('payment-PAY-P-PAY'))
    expect(bankSub(getState()).payments['P-PAY']?.cleared).toBe(true)
  })
})
