// The pinned status area and the moving WOPR prediction line. The status area
// is visible in every view and pins derived cash (a pure selector, never a
// stored field), confidence, floor, target, and the two lines WOPR PREDICTED
// vs OBSERVED. The predicted line is selectPredictedWithdrawals, a pure selector
// over current substate, so a HOLD that stamps the broad hold moves it in the
// SAME render. Held-account facts flow from the campaign OPEN EXCEPTIONS
// selector, not local state.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, send, getState } from '@app/state'
import { ScreenRouter } from '@app/screens'
import { registerDefaultVerbs } from '@app/terminal'
import {
  selectDerivedCash,
  selectPredictedWithdrawals,
} from '@engine/missions/bank/selectors'
import { resetAll } from '../../screens/harness'
import { registerBankScreen } from '@app/missions/bank/BankScreen'
import { __resetBankView } from '@app/missions/bank/selectors'
import { BANK_FIXTURE_PAYLOAD, makeBankCtx, bankSub } from './fixture'

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

describe('pinned status area', () => {
  it('pins derived cash, confidence, floor, target, and both the WOPR PREDICTED and OBSERVED lines', () => {
    const sub = bankSub(getState())
    const cash = selectDerivedCash(sub)
    expect(screen.getByTestId('status-cash').textContent).toContain(String(cash))
    expect(screen.getByTestId('status-confidence').textContent).toContain(
      String(sub.confidence),
    )
    expect(screen.getByTestId('status-floor').textContent).toContain(
      String(BANK_FIXTURE_PAYLOAD.floor),
    )
    expect(screen.getByTestId('status-target').textContent).toContain(
      String(BANK_FIXTURE_PAYLOAD.target),
    )
    expect(screen.getByTestId('status-predicted')).toBeInTheDocument()
    expect(screen.getByTestId('status-observed')).toBeInTheDocument()
  })

  it('derived cash is the selector value, never a stored field (substate carries no cash)', () => {
    const sub = bankSub(getState()) as unknown as Record<string, unknown>
    expect('cash' in sub).toBe(false)
    expect('derivedCash' in sub).toBe(false)
    // The status reads the selector.
    const cash = selectDerivedCash(bankSub(getState()))
    expect(screen.getByTestId('status-cash')).toHaveTextContent(String(cash))
  })

  it('the status area stays visible after switching to the FEED and PAYMENTS views', () => {
    fireEvent.click(screen.getByTestId('bank-tab-feed'))
    expect(screen.getByTestId('bank-status')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('bank-tab-payments'))
    expect(screen.getByTestId('bank-status')).toBeInTheDocument()
  })

  it('the WOPR PREDICTED line moves immediately on HOLD, in the same render (pure selector)', () => {
    // Before any hold the predicted line is the unshifted authored series.
    const before = selectPredictedWithdrawals(
      BANK_FIXTURE_PAYLOAD,
      bankSub(getState()),
    )
    const shownBefore = screen.getByTestId('status-predicted').getAttribute('data-value')
    expect(shownBefore).toBe(before.join(','))

    // HOLD one account. broadHoldCount is 0 in the fixture, so the FIRST hold
    // stamps the broad hold and the predicted line shifts up in the same render.
    fireEvent.click(screen.getByTestId('ledger-HOLD-A-OPS'))

    const afterSub = bankSub(getState())
    const after = selectPredictedWithdrawals(BANK_FIXTURE_PAYLOAD, afterSub)
    // The shift is real: every entry rose by the authored percent.
    expect(after[0]).toBeGreaterThan(before[0]!)
    // And the rendered line moved in the same render cycle, with no tick or wake.
    const shownAfter = screen.getByTestId('status-predicted').getAttribute('data-value')
    expect(shownAfter).toBe(after.join(','))
    expect(shownAfter).not.toBe(shownBefore)
  })

  it('RELEASE drops the predicted line back in the same render', () => {
    fireEvent.click(screen.getByTestId('ledger-HOLD-A-OPS'))
    const held = screen.getByTestId('status-predicted').getAttribute('data-value')
    fireEvent.click(screen.getByTestId('ledger-RELEASE-A-OPS'))
    const released = selectPredictedWithdrawals(
      BANK_FIXTURE_PAYLOAD,
      bankSub(getState()),
    ).join(',')
    expect(screen.getByTestId('status-predicted').getAttribute('data-value')).toBe(
      released,
    )
    expect(released).not.toBe(held)
  })

  it('held-account facts flow from the campaign OPEN EXCEPTIONS selector, not a bank-local exceptions UI', () => {
    // The status reads OPEN EXCEPTIONS from the campaign selector; there is no
    // bank-specific OPEN EXCEPTIONS control in the mission screen.
    expect(screen.getByTestId('status-line').textContent).toContain('OPEN EXCEPTIONS')
    expect(screen.queryByTestId('bank-open-exceptions')).toBeNull()
  })
})
