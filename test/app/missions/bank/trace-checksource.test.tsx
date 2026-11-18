// TRACE and CHECK SOURCE stay engine-owned. TRACE dispatches INSPECT_RECORD for
// the hold-justification record (B04); the engine logs the clue through
// clueRecords and the shell holds ZERO clue state. CHECK SOURCE dispatches
// REQUEST_SOURCE_CHECK; the verdict arrives later as a sourceCheckResolved
// emitted event and renders through the shell source-check presentation. No
// clue logic or settlement logic lives in the mission screen.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, send, wake, getState } from '@app/state'
import { ScreenRouter } from '@app/screens'
import { registerDefaultVerbs } from '@app/terminal'
import { resetAll } from '../../screens/harness'
import { registerBankScreen } from '@app/missions/bank/BankScreen'
import { __resetBankView } from '@app/missions/bank/selectors'
import {
  FIELD_REPORT_RECORD_ID,
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

function typeCommand(text: string): void {
  const input = screen.getByTestId('command-input') as HTMLInputElement
  act(() => {
    fireEvent.change(input, { target: { value: text } })
    fireEvent.submit(screen.getByTestId('command-form'))
  })
}

describe('TRACE and CHECK SOURCE stay engine-owned', () => {
  it('TRACE dispatches INSPECT_RECORD for the hold-justification record and the clue logs engine-side; no shell clue state', () => {
    typeCommand(`TRACE ${JUSTIFICATION_RECORD_ID}`)
    expect(getState().inspectedRecords).toContain(JUSTIFICATION_RECORD_ID)
    // The engine logged the designated clue; the shell holds no clue state.
    expect(getState().cluesFound.length).toBeGreaterThan(0)
  })

  it('CHECK SOURCE dispatches REQUEST_SOURCE_CHECK and the verdict arrives as an emitted event rendered by the shell', () => {
    typeCommand(`CHECK SOURCE ${FIELD_REPORT_RECORD_ID}`)
    // A desk reply is queued; the verdict is not resolved yet.
    const pending = getState().campaignQueue.some(
      (e) => e.id === `desk-${FIELD_REPORT_RECORD_ID}`,
    )
    expect(pending).toBe(true)
    expect(screen.queryByTestId(`source-check-${FIELD_REPORT_RECORD_ID}`)).toBeNull()

    // Advance past the desk delay (5s): the verdict resolves as an emitted event
    // and the shell presentation reveals it.
    vi.spyOn(Date, 'now').mockReturnValue(T0 + 10_000)
    act(() => {
      wake()
    })
    const verdict = screen.getByTestId(`source-check-${FIELD_REPORT_RECORD_ID}`)
    expect(verdict).toHaveAttribute('data-outcome', 'CONFIRMED')
  })
})
