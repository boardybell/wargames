// The skippable intro mechanics lines. The intro lines (authored in the payload)
// render OVER the first live decision; the game state underneath is live and
// undisturbed until the player acts or skips. Skipping lands the player on the
// live screen with nothing consumed: no engine action was dispatched, the
// substate is byte-for-byte what it was before the skip.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, send, getState } from '@app/state'
import { ScreenRouter } from '@app/screens'
import { registerDefaultVerbs } from '@app/terminal'
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

describe('skippable intro', () => {
  it('renders the authored intro mechanics lines over the live screen', () => {
    const intro = screen.getByTestId('bank-intro')
    for (const line of BANK_FIXTURE_PAYLOAD.introLines) {
      expect(intro.textContent).toContain(line)
    }
    // The live screen is underneath and already operable: the ledger is present.
    expect(screen.getByTestId('bank-ledger-view')).toBeInTheDocument()
    expect(screen.getByTestId('ledger-HOLD-A-OPS')).toBeInTheDocument()
  })

  it('skipping lands the player on the live screen with nothing consumed', () => {
    // Snapshot the substate before skipping.
    const before = JSON.stringify(bankSub(getState()))
    fireEvent.click(screen.getByTestId('bank-intro-skip'))
    // The intro is gone; the live ledger remains.
    expect(screen.queryByTestId('bank-intro')).toBeNull()
    expect(screen.getByTestId('bank-ledger-view')).toBeInTheDocument()
    // No engine action was dispatched by the skip: the substate is unchanged.
    expect(JSON.stringify(bankSub(getState()))).toBe(before)
  })

  it('the first live decision is undisturbed by the intro: a HOLD under the intro still takes effect', () => {
    // The intro overlays but does not block the live controls.
    fireEvent.click(screen.getByTestId('ledger-HOLD-A-OPS'))
    expect(bankSub(getState()).accounts['A-OPS']?.held).toBe(true)
  })
})
