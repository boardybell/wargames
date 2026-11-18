// Section-04 accessibility passes for FREEZE BANK ACCOUNTS, through the REAL
// BankScreen and the REAL engine (no mocks of either). Two passes over one full
// HOLD -> observe inline -> RELEASE -> navigate -> PAY flow:
//   1. keyboard-only (wide, multi-pane): every interaction typed into the single
//      shared command line, focus reachable and visible at each step, the
//      disabled-PAY reason readable WHILE the account is held;
//   2. narrow viewport (single pane): the same flow driven through the view
//      commands and the mobile BACK affordance (no tabs relied on), with the
//      pinned status area (cash / confidence / floor / target / PREDICTED vs
//      OBSERVED) reachable in every view.
// Plus: the view-toggle preference survives an unmount/remount in BOTH passes.
// This is the keyboard-reachability regression guard: if a step were unreachable
// by keyboard, the fix belongs in the section-03 components, not here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
}

afterEach(() => {
  teardown()
  __resetBankView()
  vi.restoreAllMocks()
  cleanup()
})

/** Type a command into the single shared command input and submit it with the
 *  keyboard (a form submit, the Enter path), never a pointer. */
function typeCommand(text: string): void {
  const input = screen.getByTestId('command-input') as HTMLInputElement
  act(() => {
    fireEvent.change(input, { target: { value: text } })
    fireEvent.submit(screen.getByTestId('command-form'))
  })
}

/** Focus a control the keyboard would Tab to, then assert it IS the active
 *  element: it is reachable (in the tab order, not aria-hidden or detached). */
function assertFocusable(testId: string): HTMLElement {
  const el = screen.getByTestId(testId)
  act(() => {
    el.focus()
  })
  expect(document.activeElement).toBe(el)
  // Focusable is not enough: a tabindex=-1 node takes focus() but the keyboard
  // never Tabs to it. Require it to be IN the tab order and not hidden.
  expect(el.tabIndex).toBeGreaterThanOrEqual(0)
  expect(el.getAttribute('aria-hidden')).not.toBe('true')
  return el
}

describe('bank a11y: keyboard-only full flow (wide, multi-pane)', () => {
  beforeEach(() => boot(false))

  it('HOLD -> observe inline -> RELEASE -> navigate -> PAY entirely from the keyboard, focus reachable every step, held PAY reason readable', () => {
    render(<ScreenRouter />)
    // Wide layout: the ledger stays visible as a persistent pane (two panes).
    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-pane', 'two')

    // Step 1: focus the shared command input (the keyboard entry point) and HOLD
    // the payment's account A-PAY by typed command. No pointer anywhere.
    const input = assertFocusable('command-input')
    typeCommand('LEDGER')
    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'ledger')
    typeCommand('HOLD A-PAY')
    expect(bankSub(getState()).accounts['A-PAY']?.held).toBe(true)

    // Step 2: observe the inline state on the ledger row: the account reads HELD,
    // and its RELEASE control is reachable by keyboard (focusable).
    expect(screen.getByTestId('account-row-A-PAY')).toHaveAttribute('data-held', 'true')
    assertFocusable('ledger-RELEASE-A-PAY')
    // The command input is still reachable after focusing a row control.
    act(() => {
      input.focus()
    })
    expect(document.activeElement).toBe(input)

    // Step 3: navigate to PAYMENTS by typed command; the disabled PAY reason is
    // readable WHILE the account is held (release-or-limit-to-pay is the designed
    // tension, so the reason must be present in the DOM, not a tooltip alone).
    typeCommand('PAYMENTS')
    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'payments')
    const payHeld = screen.getByTestId('payment-PAY-P-PAY') as HTMLButtonElement
    expect(payHeld.disabled).toBe(true)
    const heldReason = screen.getByTestId('payment-PAY-P-PAY-reason')
    expect(heldReason.textContent).toBe('ACCOUNT HELD')

    // Step 4: RELEASE the account by typed command; PAY unblocks.
    typeCommand('RELEASE A-PAY')
    expect(bankSub(getState()).accounts['A-PAY']?.held).toBe(false)
    const payFree = screen.getByTestId('payment-PAY-P-PAY') as HTMLButtonElement
    expect(payFree.disabled).toBe(false)
    // The enabled PAY control is keyboard-reachable.
    assertFocusable('payment-PAY-P-PAY')

    // Step 5: PAY by typed command; the payment clears in engine state.
    typeCommand('PAY P-PAY')
    expect(bankSub(getState()).payments['P-PAY']?.cleared).toBe(true)
    expect(screen.getByTestId('payment-status-P-PAY')).toBeInTheDocument()

    // The shared command input is still focusable after the whole flow.
    act(() => {
      input.focus()
    })
    expect(document.activeElement).toBe(input)
  })

  it('the pinned status area (cash, confidence, floor, target, PREDICTED vs OBSERVED) is reachable in every view', () => {
    render(<ScreenRouter />)
    const assertStatus = (): void => {
      expect(screen.getByTestId('bank-status')).toBeInTheDocument()
      expect(screen.getByTestId('status-cash')).toBeInTheDocument()
      expect(screen.getByTestId('status-confidence')).toBeInTheDocument()
      expect(screen.getByTestId('status-floor')).toBeInTheDocument()
      expect(screen.getByTestId('status-target')).toBeInTheDocument()
      expect(screen.getByTestId('status-predicted')).toBeInTheDocument()
      expect(screen.getByTestId('status-observed')).toBeInTheDocument()
    }
    assertStatus()
    typeCommand('FEED')
    assertStatus()
    typeCommand('PAYMENTS')
    assertStatus()
    typeCommand('LEDGER')
    assertStatus()
  })

  it('the view-toggle preference survives an unmount/remount', () => {
    const { unmount } = render(<ScreenRouter />)
    // Switch to PAYMENTS by typed command, then unmount and remount: the stored
    // preference restores the PAYMENTS view, never an empty default.
    typeCommand('PAYMENTS')
    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'payments')
    act(() => {
      unmount()
    })
    render(<ScreenRouter />)
    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'payments')
  })
})

describe('bank a11y: narrow viewport full flow (single pane, back affordances)', () => {
  beforeEach(() => boot(true))

  it('HOLD -> observe -> RELEASE -> PAY through commands and the BACK affordance, no tabs relied on, status reachable throughout', async () => {
    const user = userEvent.setup()
    render(<ScreenRouter />)
    // Narrow layout: single pane off matchMedia.
    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-pane', 'single')
    // The ledger is the one visible pane; payments is collapsed away.
    expect(screen.getByTestId('bank-ledger-view')).toBeInTheDocument()
    expect(screen.queryByTestId('bank-payments-view')).toBeNull()
    // The pinned status area is reachable on the ledger view.
    expect(screen.getByTestId('bank-status')).toBeInTheDocument()
    expect(screen.getByTestId('status-predicted')).toBeInTheDocument()
    expect(screen.getByTestId('status-observed')).toBeInTheDocument()

    // HOLD A-PAY by typed command.
    typeCommand('HOLD A-PAY')
    expect(bankSub(getState()).accounts['A-PAY']?.held).toBe(true)
    expect(screen.getByTestId('account-row-A-PAY')).toHaveAttribute('data-held', 'true')

    // Navigate to PAYMENTS by typed command: the single pane COLLAPSES to only
    // payments, the ledger leaves the DOM, and the mobile BACK affordance appears
    // (no reliance on tabs).
    typeCommand('PAYMENTS')
    expect(screen.getByTestId('bank-payments-view')).toBeInTheDocument()
    expect(screen.queryByTestId('bank-ledger-view')).toBeNull()
    expect(screen.getByTestId('bank-back')).toBeInTheDocument()
    // The pinned status stays reachable in the collapsed payments view.
    expect(screen.getByTestId('bank-status')).toBeInTheDocument()
    // PAY is blocked while held, reason readable.
    const payHeld = screen.getByTestId('payment-PAY-P-PAY') as HTMLButtonElement
    expect(payHeld.disabled).toBe(true)
    expect(screen.getByTestId('payment-PAY-P-PAY-reason').textContent).toBe('ACCOUNT HELD')

    // Back to the ledger via the mobile BACK affordance (keyboard-activated), then
    // RELEASE by typed command.
    // Activate BACK from the keyboard, not with a pointer: assertFocusable
    // proves it is Tab-reachable, then userEvent synthesizes the native
    // button's Enter -> click (which fireEvent.click would never prove).
    const back = assertFocusable('bank-back')
    expect(back.tagName).toBe('BUTTON')
    await user.keyboard('{Enter}')
    expect(screen.getByTestId('bank-ledger-view')).toBeInTheDocument()
    typeCommand('RELEASE A-PAY')
    expect(bankSub(getState()).accounts['A-PAY']?.held).toBe(false)

    // Return to PAYMENTS and PAY by typed command; the payment clears.
    typeCommand('PAYMENTS')
    typeCommand('PAY P-PAY')
    expect(bankSub(getState()).payments['P-PAY']?.cleared).toBe(true)
    // Status still reachable after the flow completes.
    expect(screen.getByTestId('bank-status')).toBeInTheDocument()
  })

  it('the view-toggle preference survives an unmount/remount at narrow width', () => {
    const { unmount } = render(<ScreenRouter />)
    typeCommand('FEED')
    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'feed')
    act(() => {
      unmount()
    })
    render(<ScreenRouter />)
    // The stored preference restores FEED on remount, never an empty default.
    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'feed')
  })
})
