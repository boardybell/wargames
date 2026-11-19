// The GLOBAL FAILSAFE ending driven through the REAL ScreenRouter, no direct
// component mount. This is the seam the engine crosses at settlement: settle()
// moves the finale to phase 'debrief' like any mission, so without the router's
// finale-ending branch the climax would render the generic DebriefScreen and the
// EndingScreen would be unreachable in the shipped shell. Here we register the
// finale screen, drive the finale from START through a real COMMIT via the router
// and the shared command line (through the SAME confirmation gate the button
// raises), and assert data-testid='finale-ending' renders through the router. A
// timeout variant reaches the failure ending through the router as well. Both
// tests fail if the ScreenRouter finale-ending routing is removed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, send, getState } from '@app/state'
import { ScreenRouter } from '@app/screens'
import { registerDefaultVerbs } from '@app/terminal'
import { resetAll } from '../../screens/harness'
import { registerFinaleScreen } from '@app/missions/finale/FinaleScreen'
import { __resetFinaleView } from '@app/missions/finale/selectors'
import {
  makeFinaleCtx,
  startFinaleViaSend,
  finaleSub,
  settledFinaleOf,
  FIELD_REPORT_ID,
} from './fixture'

let teardown: () => void
let clock = 1_000_000
const advanceTo = (ms: number): void => {
  clock = ms
}

function boot(): void {
  resetAll()
  __resetFinaleView()
  clock = 1_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  registerDefaultVerbs()
  // The registration surface this section owns: mirrors registerBankScreen /
  // registerFlightsScreen / registerOutlookScreen. App-root mounting of the
  // whole shell (calling this at main.tsx) is split 08.
  registerFinaleScreen()
  teardown = init({
    ctx: makeFinaleCtx(),
    seedName: 'test-seed',
    port: { read: () => null, write: () => {}, remove: () => {} },
  })
  startFinaleViaSend(advanceTo)
  render(<ScreenRouter />)
}

afterEach(() => {
  teardown()
  __resetFinaleView()
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

/** Build a valid case through the shared command line (keyboard only). */
function buildValidCaseByKeyboard(): void {
  advanceTo(1_905_000)
  typeCommand('REQUEST FIELD REPORT')
  act(() => {
    send({ type: 'REQUEST_SOURCE_CHECK', recordId: FIELD_REPORT_ID })
  })
  advanceTo(1_930_000)
  act(() => {
    send({ type: 'INSPECT_RECORD', recordId: 'C17' })
  })
  typeCommand('SELECT C17 outlook')
  typeCommand('SELECT F06 flights')
  typeCommand('SELECT B04 bank')
  typeCommand('SELECT C17 root')
  typeCommand(`SELECT ${FIELD_REPORT_ID} observation`)
  typeCommand('MOVE B04 UP')
  typeCommand('MOVE B04 DOWN')
  typeCommand('VALIDATE')
}

/** Commit through the SAME confirmation gate the DecisionView button raises. */
function commitByCommand(choice: 'STAGED' | 'HOLD' | 'REPEAT'): void {
  typeCommand(`COMMIT ${choice}`)
  expect(screen.getByTestId('finale-commit-confirm')).toBeInTheDocument()
  act(() => {
    fireEvent.click(screen.getByTestId('finale-confirm-yes'))
  })
}

describe('ScreenRouter-driven finale ending (no direct mount)', () => {
  beforeEach(boot)

  it('a COMMIT driven through the real router reaches the EndingScreen', () => {
    // Pre-commit the router shows the finale mission screen, NOT a debrief.
    expect(screen.getByTestId('screen-root')).toHaveAttribute(
      'data-active-screen',
      'mission:finale',
    )
    buildValidCaseByKeyboard()
    expect(finaleSub().caseValid).toBe(true)
    typeCommand('COMPARISON')
    typeCommand('RUN COMPARISON')
    typeCommand('DECISION')
    commitByCommand('STAGED')

    // The engine settled the finale and moved to the debrief phase.
    expect(settledFinaleOf()!.endingId).toBe('recovery')
    expect(screen.getByTestId('screen-root')).toHaveAttribute(
      'data-active-screen',
      'debrief',
    )
    // The router routed the settled finale to the EndingScreen rather than the
    // generic DebriefScreen: the ending renders, the generic debrief does not.
    expect(screen.getByTestId('finale-ending')).toHaveAttribute(
      'data-ending-id',
      'recovery',
    )
    expect(screen.queryByTestId('debrief-screen')).toBeNull()
  })

  it('a timeout driven through the real router reaches the failure EndingScreen', () => {
    // Advance a wake past endsAt: the finale times out and settles to failure,
    // moving to the debrief phase the router maps to the EndingScreen.
    const endsAt = getState().activeMission!.endsAt
    advanceTo(endsAt + 1_000)
    act(() => {
      send({ type: 'INSPECT_RECORD', recordId: 'C17' })
    })
    expect(settledFinaleOf()!.cause).toBe('timeout')
    expect(screen.getByTestId('screen-root')).toHaveAttribute(
      'data-active-screen',
      'debrief',
    )
    expect(screen.getByTestId('finale-ending')).toHaveAttribute(
      'data-ending-id',
      'failure',
    )
    expect(screen.queryByTestId('debrief-screen')).toBeNull()
  })
})
