// Command-button identity and view navigation for FREEZE BANK ACCOUNTS. Every
// registered verb dispatches the identical action the equivalent on-screen
// button dispatches (both call the shared builders). The LEDGER/FEED/PAYMENTS
// view commands parse to mission-scoped SCREEN ui commands, switch the view,
// and the toggle persists through the UI-preferences store and restores on a
// remount. TRACE dispatches INSPECT_RECORD (clue logs engine-side); CHECK
// SOURCE dispatches REQUEST_SOURCE_CHECK (verdict arrives as an emitted event).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, send, getState } from '@app/state'
import { ScreenRouter } from '@app/screens'
import { parseCommand, registerDefaultVerbs } from '@app/terminal'
import { resetAll } from '../../screens/harness'
import {
  BANK_SCREEN_ID,
  makeCheckSourceAction,
  makeHoldAction,
  makeLimitAction,
  makePayAction,
  makeReleaseAction,
  makeTraceAction,
} from '@app/missions/bank/verbs'
import { registerBankScreen } from '@app/missions/bank/BankScreen'
import { __resetBankView } from '@app/missions/bank/selectors'
import {
  JUSTIFICATION_RECORD_ID,
  makeBankCtx,
} from './fixture'

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

function parse(text: string) {
  const result = parseCommand(text, BANK_SCREEN_ID)
  return result.kind === 'action' ? result.action : null
}

describe('command-button identity', () => {
  it('every verb parses to the identical action the equivalent button dispatches', () => {
    expect(parse('HOLD A-OPS')).toStrictEqual(makeHoldAction('A-OPS'))
    expect(parse('RELEASE A-OPS')).toStrictEqual(makeReleaseAction('A-OPS'))
    expect(parse('LIMIT A-VEND 5000')).toStrictEqual(makeLimitAction('A-VEND', 5000))
    expect(parse('PAY P-PAY')).toStrictEqual(makePayAction('P-PAY'))
    expect(parse(`TRACE ${JUSTIFICATION_RECORD_ID}`)).toStrictEqual(
      makeTraceAction(JUSTIFICATION_RECORD_ID),
    )
    expect(parse('CHECK SOURCE F06')).toStrictEqual(makeCheckSourceAction('F06'))
  })

  it('the HOLD button on a ledger row dispatches the identical action the typed HOLD command dispatches', () => {
    // Drive the real HOLD button; the engine substate change must match what a
    // typed HOLD A-OPS would have produced (the shared builder proves identity).
    fireEvent.click(screen.getByTestId('ledger-HOLD-A-OPS'))
    expect(getState().activeMission?.missionId).toBe('bank')
    const sub = getState().activeMission?.substate as {
      accounts: Record<string, { held: boolean }>
    }
    expect(sub.accounts['A-OPS']?.held).toBe(true)
    // And the typed command builds the identical action object.
    expect(parse('HOLD A-OPS')).toStrictEqual(makeHoldAction('A-OPS'))
  })

  it('the view commands parse to mission-scoped SCREEN ui commands, not engine actions', () => {
    for (const v of ['LEDGER', 'FEED', 'PAYMENTS']) {
      const result = parseCommand(v, BANK_SCREEN_ID)
      expect(result.kind).toBe('ui')
    }
  })
})

describe('view navigation and persistence', () => {
  it('LEDGER / FEED / PAYMENTS switch views via desktop tabs', () => {
    fireEvent.click(screen.getByTestId('bank-tab-feed'))
    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'feed')
    expect(screen.getByTestId('bank-feed-view')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('bank-tab-payments'))
    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'payments')
    expect(screen.getByTestId('bank-payments-view')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('bank-tab-ledger'))
    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'ledger')
    expect(screen.getByTestId('bank-ledger-view')).toBeInTheDocument()
  })

  it('view commands switch views, and the BACK command returns to the ledger', () => {
    const input = screen.getByTestId('command-input') as HTMLInputElement
    const type = (text: string) => {
      act(() => {
        fireEvent.change(input, { target: { value: text } })
        fireEvent.submit(screen.getByTestId('command-form'))
      })
    }
    type('FEED')
    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'feed')
    // The BACK verb returns to the ledger (the narrow-only bank-back button is
    // the same action; here it is driven through the shared command line).
    type('BACK')
    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'ledger')
  })

  it('the active view persists through the UI preferences and restores on remount', () => {
    fireEvent.click(screen.getByTestId('bank-tab-payments'))
    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'payments')
    // Unmount and remount the whole shell: the stored preference restores the
    // payments view, not a reset to the ledger default.
    cleanup()
    render(<ScreenRouter />)
    expect(screen.getByTestId('bank-screen')).toHaveAttribute('data-view', 'payments')
  })
})
