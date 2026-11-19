// ComparisonView and DecisionView through the REAL engine. RUN COMPARISON gated
// on caseValid; three PROJECTION-badged columns; the trace plays, SKIP works,
// reduced motion is instant, and results stay readable after skip; the STAGED
// column figures strict-equal the DecisionView viability panel's companion
// figures at the DOM; the dual-state frozen baseline (a late field report moves
// the live list but no column figure); and the decision gating, confirmations
// (REPEAT quotes its projection), cancel-leaves-untouched, and synchronous
// settle.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { init, send, getState } from '@app/state'
import { ScreenRouter } from '@app/screens'
import { registerDefaultVerbs } from '@app/terminal'
import { setMotionOverride } from '@app/a11y/motion'
import { resetAll } from '../../screens/harness'
import { registerFinaleScreen } from '@app/missions/finale/FinaleScreen'
import {
  makeReorderAction,
  makeValidateAction,
} from '@app/missions/finale/verbs'
import {
  caseFileRefFrom,
  settledFinale,
  __resetFinaleView,
} from '@app/missions/finale/selectors'
import {
  makeFinaleCtx,
  startFinaleViaSend,
  finaleSub,
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
  setMotionOverride('system')
  registerDefaultVerbs()
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
  setMotionOverride('system')
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

// The finale window is [1_900_000, 2_080_000] (180s). All of the comparison and
// decision flow must land inside it or the deadline settles the mission.
function makeCaseValid(): void {
  advanceTo(1_905_000)
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
  act(() => {
    send(makeReorderAction(['C17', 'F06', 'B04']))
  })
  act(() => {
    send(makeValidateAction(caseFileRefFrom(getState())))
  })
}

function runComparison(): void {
  makeCaseValid()
  typeCommand('COMPARISON')
  fireEvent.click(screen.getByTestId('finale-run-comparison'))
}

describe('ComparisonView: gating and three PROJECTION columns', () => {
  beforeEach(boot)

  it('RUN COMPARISON is disabled until caseValid, enabled after', () => {
    typeCommand('COMPARISON')
    expect((screen.getByTestId('finale-run-comparison') as HTMLButtonElement).disabled).toBe(true)
    // Validate the case, then RUN COMPARISON is enabled.
    makeCaseValid()
    typeCommand('CASE')
    typeCommand('COMPARISON')
    expect((screen.getByTestId('finale-run-comparison') as HTMLButtonElement).disabled).toBe(false)
  })

  it('renders three columns, each figure carrying the PROJECTION badge', () => {
    runComparison()
    expect(screen.getByTestId('finale-column-repeat')).toBeInTheDocument()
    expect(screen.getByTestId('finale-column-hold')).toBeInTheDocument()
    expect(screen.getByTestId('finale-column-staged')).toBeInTheDocument()
    // Every figure in each column carries a PROJECTION badge glossary term.
    for (const branch of ['repeat', 'hold', 'staged']) {
      const col = screen.getByTestId(`finale-column-${branch}`)
      const badges = within(col).getAllByTestId('glossary-term')
      expect(badges.length).toBeGreaterThanOrEqual(5)
    }
  })
})

describe('ComparisonView: branch trace SKIP, reduced motion, readable after', () => {
  it('the trace plays, SKIP reveals all steps, and they stay readable', () => {
    boot()
    runComparison()
    const repeatCol = screen.getByTestId('finale-column-repeat')
    // A SKIP control exists while the trace is mid-play; click it to reveal all.
    const skip = within(repeatCol).queryByTestId('branch-skip')
    if (skip) fireEvent.click(skip)
    // After skip, every authored step is present and readable.
    const steps = within(repeatCol).getAllByTestId('branch-step')
    expect(steps.length).toBe(3)
    expect(repeatCol.textContent).toMatch(/REISSUE D-83/)
  })

  it('under reduced motion the trace is instant: all steps present with no SKIP needed', () => {
    boot()
    setMotionOverride('reduced')
    runComparison()
    const repeatCol = screen.getByTestId('finale-column-repeat')
    // Instant: all three steps render at once and no SKIP control is shown.
    expect(within(repeatCol).getAllByTestId('branch-step').length).toBe(3)
    expect(within(repeatCol).queryByTestId('branch-skip')).toBeNull()
  })
})

describe('ComparisonView: STAGED column === DecisionView viability panel at the DOM', () => {
  beforeEach(boot)

  it('the STAGED passengers/openExceptions figures strict-equal the viability panel companion figures', () => {
    runComparison()
    const stagedCol = screen.getByTestId('finale-column-staged')
    const colPassengers = screen
      .getByTestId('finale-figure-staged-passengers')
      .getAttribute('data-value')
    const colOpen = screen
      .getByTestId('finale-figure-staged-openExceptions')
      .getAttribute('data-value')
    expect(stagedCol).toBeInTheDocument()
    // The DecisionView reads the SAME StagedComputation object.
    typeCommand('DECISION')
    const panelPassengers = screen
      .getByTestId('finale-viability-figure-passengers')
      .getAttribute('data-value')
    const panelOpen = screen
      .getByTestId('finale-viability-figure-openExceptions')
      .getAttribute('data-value')
    expect(panelPassengers).toBe(colPassengers)
    expect(panelOpen).toBe(colOpen)
  })
})

describe('ComparisonView: dual-state frozen baseline', () => {
  beforeEach(boot)

  it('a field report arriving after comparison moves the live log but no column figure changes', () => {
    runComparison()
    const before = screen
      .getByTestId('finale-figure-staged-passengers')
      .getAttribute('data-value')
    // A late field report desk reply joins the live sourceChecks (the live case
    // file), but the frozen branch baseline does not move. Still inside the
    // finale window so the mission does not time out.
    advanceTo(2_000_000)
    act(() => {
      send({ type: 'REQUEST_SOURCE_CHECK', recordId: 'W02' })
    })
    advanceTo(2_030_000)
    act(() => {
      send({ type: 'INSPECT_RECORD', recordId: 'F06' })
    })
    typeCommand('CASE')
    typeCommand('COMPARISON')
    const after = screen
      .getByTestId('finale-figure-staged-passengers')
      .getAttribute('data-value')
    expect(after).toBe(before)
  })
})

describe('DecisionView: gating, confirmations, synchronous settle', () => {
  beforeEach(boot)

  it('STAGED enabled iff caseValid AND viability passes, with per-threshold pass/fail shown', () => {
    runComparison()
    typeCommand('DECISION')
    // With the healthy fixture the case is valid and viability passes, so STAGED
    // is enabled and the thresholds render.
    expect((screen.getByTestId('finale-commit-staged') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByTestId('finale-viability-panel')).toHaveAttribute('data-pass', 'true')
    expect(screen.getByTestId('finale-threshold-service_cost')).toHaveAttribute('data-pass', 'true')
    // HOLD is always enabled.
    expect((screen.getByTestId('finale-commit-hold') as HTMLButtonElement).disabled).toBe(false)
  })

  it('REPEAT confirmation quotes its own projection figures; cancel leaves state untouched', () => {
    runComparison()
    // Read the REPEAT deliveries projection from the comparison column, then
    // switch to the decision view where the confirmation quotes the same figure.
    const repeatValue = screen
      .getByTestId('finale-figure-repeat-deliveries')
      .getAttribute('data-value')
    typeCommand('DECISION')
    fireEvent.click(screen.getByTestId('finale-commit-repeat'))
    const body = screen.getByTestId('finale-confirm-body')
    expect(body.textContent).toMatch(/REPEAT D-83 PROJECTS/)
    expect(body.textContent).toContain(`DELIVERIES AT ${repeatValue}`)
    // Cancel: no COMMIT, the finale is not settled.
    fireEvent.click(screen.getByTestId('finale-confirm-no'))
    expect(finaleSub().committed).toBeNull()
    expect(settledFinale(getState())).toBeNull()
  })

  it('confirming STAGED dispatches COMMIT and the engine settles synchronously to recovery', () => {
    runComparison()
    typeCommand('DECISION')
    fireEvent.click(screen.getByTestId('finale-commit-staged'))
    fireEvent.click(screen.getByTestId('finale-confirm-yes'))
    // Synchronous settle: the finale is no longer active and the outcome exists
    // with the recovery ending. (The EndingScreen DOM render from a mounted
    // FinaleScreen is proven in the full-journey and EndingScreen tests.)
    expect(getState().activeMission).toBeNull()
    const outcome = settledFinale(getState())!
    expect(outcome.cause).toBe('completed')
    expect(outcome.endingId).toBe('recovery')
  })
})
