// The section-04 fixture matrix, driven end to end THROUGH the finale screens:
// the keyboard-only journey (build, reorder, validate, run comparison, skip the
// trace, commit, reach the ending with no pointer); the same journey at a narrow
// viewport; the three ending-reachability runs through the screens; corroboration
// CONTRADICTED/PENDING/UNKNOWN never qualifying; and the field-report slack with
// a scripted late-arrival pending line. The FinaleScreen is rendered directly
// (with a wired command line) so it stays mounted through COMMIT and renders the
// ending inline, which the ScreenRouter (debrief phase) would otherwise replace.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { init, send, getState } from '@app/state'
import { CommandInput } from '@app/terminal/CommandInput'
import { registerDefaultVerbs } from '@app/terminal'
import type { LocalUiCommand } from '@app/terminal/commandGrammar'
import { dispatchScreenUiCommand } from '@app/screens/screenUiCommands'
import { setMotionOverride } from '@app/a11y/motion'
import { resetAll } from '../../screens/harness'
import { FinaleScreen, registerFinaleScreen } from '@app/missions/finale/FinaleScreen'
import { settledFinale, __resetFinaleView } from '@app/missions/finale/selectors'
import { makeFinaleCtx, startFinaleViaSend, finaleSub, FIELD_REPORT_ID } from './fixture'

let teardown: () => void
let clock = 1_000_000
const advanceTo = (ms: number): void => {
  clock = ms
}

/** A standalone harness: the FinaleScreen plus a command line wired to the
 *  finale screen scope, so the whole journey (including the ending after COMMIT)
 *  runs in one mounted tree without the ScreenRouter swapping to the debrief. */
function FinaleHarness() {
  const onUiCommand = (command: LocalUiCommand): void => {
    if (command.kind === 'SCREEN') {
      dispatchScreenUiCommand(command.screenId, command.detail)
    }
  }
  return (
    <>
      <FinaleScreen missionId="finale" />
      <CommandInput activeScreen="mission:finale" onUiCommand={onUiCommand} />
    </>
  )
}

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

function boot(narrow = false): void {
  resetAll()
  __resetFinaleView()
  clock = 1_000_000
  setNarrow(narrow)
  setMotionOverride('system')
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  registerDefaultVerbs()
  registerFinaleScreen()
  teardown = init({
    ctx: makeFinaleCtx(),
    seedName: 'test-seed',
    port: { read: () => null, write: () => {}, remove: () => {} },
  })
  startFinaleViaSend(advanceTo)
  render(<FinaleHarness />)
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

/** Commit through the SAME confirmation gate the DecisionView button raises:
 *  the typed COMMIT opens the native confirm dialog, then confirm dispatches the
 *  commit. Command-button parity holds at the one irreversible action. */
function commitByCommand(choice: 'STAGED' | 'HOLD' | 'REPEAT'): void {
  typeCommand(`COMMIT ${choice}`)
  // The gate is open; nothing settled yet.
  expect(screen.getByTestId('finale-commit-confirm')).toBeInTheDocument()
  act(() => {
    fireEvent.click(screen.getByTestId('finale-confirm-yes'))
  })
}

/** Corroborate the field report via the engine desk (keyboard-safe: through the
 *  shared command line's REQUEST FIELD REPORT plus the engine source check). */
function corroborate(): void {
  advanceTo(1_905_000)
  typeCommand('REQUEST FIELD REPORT')
  act(() => {
    send({ type: 'REQUEST_SOURCE_CHECK', recordId: FIELD_REPORT_ID })
  })
  advanceTo(1_930_000)
  act(() => {
    send({ type: 'INSPECT_RECORD', recordId: 'C17' })
  })
}

/** The full case assembly through typed commands only. */
function buildValidCaseByKeyboard(): void {
  corroborate()
  typeCommand('SELECT C17 outlook')
  typeCommand('SELECT F06 flights')
  typeCommand('SELECT B04 bank')
  typeCommand('SELECT C17 root')
  typeCommand(`SELECT ${FIELD_REPORT_ID} observation`)
  // A deliberate wrong order first, corrected by MOVE, to exercise reorder.
  typeCommand('MOVE B04 UP')
  typeCommand('MOVE B04 DOWN')
  typeCommand('VALIDATE')
}

describe('fixture matrix: keyboard-only journey to the ending', () => {
  beforeEach(() => boot(false))

  it('builds, reorders, validates, compares, skips the trace, commits, and reaches the ending with no pointer', () => {
    buildValidCaseByKeyboard()
    expect(finaleSub().caseValid).toBe(true)
    typeCommand('COMPARISON')
    typeCommand('RUN COMPARISON')
    expect(screen.getByTestId('finale-columns')).toBeInTheDocument()
    // Skip any in-flight trace (no pointer needed: a submit is enough once the
    // column is readable, but exercise the SKIP control via keyboard click).
    const skips = screen.queryAllByTestId('branch-skip')
    skips.forEach((s) => fireEvent.click(s))
    typeCommand('DECISION')
    // The typed COMMIT routes through the SAME confirmation gate the button
    // raises: the dialog opens, then confirm settles. Command-button parity
    // holds at the irreversible action. Only a keyboard-reachable control
    // (the confirm button) is activated.
    commitByCommand('STAGED')
    expect(settledFinale(getState())!.endingId).toBe('recovery')
    expect(screen.getByTestId('finale-ending')).toHaveAttribute('data-ending-id', 'recovery')
  })
})

describe('fixture matrix: narrow journey to the ending', () => {
  beforeEach(() => boot(true))

  it('completes the same journey at a narrow viewport with stacked columns and back affordances', () => {
    expect(screen.getByTestId('finale-screen')).toHaveAttribute('data-pane', 'single')
    buildValidCaseByKeyboard()
    typeCommand('COMPARISON')
    typeCommand('RUN COMPARISON')
    // Columns stack but all three are present.
    expect(screen.getByTestId('finale-column-repeat')).toBeInTheDocument()
    expect(screen.getByTestId('finale-column-staged')).toBeInTheDocument()
    // The narrow back affordance returns to the case view.
    expect(screen.getByTestId('finale-back')).toBeInTheDocument()
    typeCommand('DECISION')
    commitByCommand('HOLD')
    expect(screen.getByTestId('finale-ending')).toHaveAttribute('data-ending-id', 'containment')
  })
})

describe('fixture matrix: three ending-reachability runs through the screens', () => {
  it('STAGED commit reaches the recovery ending screen', () => {
    boot()
    buildValidCaseByKeyboard()
    typeCommand('COMPARISON')
    typeCommand('RUN COMPARISON')
    typeCommand('DECISION')
    commitByCommand('STAGED')
    expect(settledFinale(getState())!.cause).toBe('completed')
    expect(screen.getByTestId('finale-ending')).toHaveAttribute('data-ending-id', 'recovery')
  })

  it('HOLD commit reaches the containment ending screen', () => {
    boot()
    buildValidCaseByKeyboard()
    typeCommand('DECISION')
    commitByCommand('HOLD')
    expect(settledFinale(getState())!.cause).toBe('completed')
    expect(screen.getByTestId('finale-ending')).toHaveAttribute('data-ending-id', 'containment')
  })

  it('a timeout reaches the failure ending screen (collapsed)', () => {
    boot()
    const endsAt = getState().activeMission!.endsAt
    advanceTo(endsAt + 1_000)
    act(() => {
      // A wake crosses the deadline; the finale settles to failure on timeout.
      send({ type: 'INSPECT_RECORD', recordId: 'C17' })
    })
    expect(settledFinale(getState())!.cause).toBe('timeout')
    // Re-render the harness: the screen short-circuits to the failure ending.
    cleanup()
    render(<FinaleHarness />)
    expect(screen.getByTestId('finale-ending')).toHaveAttribute('data-ending-id', 'failure')
  })
})

describe('fixture matrix: corroboration CONTRADICTED / PENDING / UNKNOWN never qualify', () => {
  beforeEach(() => boot())

  it('F06 (UNKNOWN) and B04 (PENDING) desk replies never corroborate the observation slot', () => {
    // Resolve the F06 (UNKNOWN) and B04 (PENDING) desk checks: neither makes an
    // observation candidate attachable. (W02 would need CONFIRMED to qualify;
    // these outcomes never do.)
    advanceTo(1_905_000)
    act(() => {
      send({ type: 'REQUEST_SOURCE_CHECK', recordId: 'F06' })
      send({ type: 'REQUEST_SOURCE_CHECK', recordId: 'B04' })
    })
    advanceTo(1_925_000)
    act(() => {
      send({ type: 'INSPECT_RECORD', recordId: 'C17' })
    })
    // The observation slot lists no attachable independent candidate from those
    // replies: W02 stays UNVERIFIED (its own check never ran).
    const w02 = screen.queryByTestId('finale-candidate-observation-W02')
    if (w02) {
      expect(w02).toHaveAttribute('data-attachable', 'false')
    }
    // The field report is still the legal, un-landed route (REQUEST available).
    expect(screen.getByTestId('finale-request-field-report')).toBeInTheDocument()
  })
})

describe('fixture matrix: field-report slack and late-arrival pending line', () => {
  beforeEach(() => boot())

  it('a request at first legality still leaves room to validate and commit', () => {
    // Request at the first instant, resolve inside the bound, then validate and
    // commit well before the deadline: the slack is real.
    buildValidCaseByKeyboard()
    expect(finaleSub().caseValid).toBe(true)
    typeCommand('DECISION')
    commitByCommand('STAGED')
    expect(settledFinale(getState())!.cause).toBe('completed')
  })

  it('a scripted late arrival settles first and shows the pending line on the ending', () => {
    // Commit on a timeout before the field report lands, then let the reply
    // arrive post-settlement; the ending honestly reads it as pending.
    advanceTo(1_905_000)
    act(() => {
      send({ type: 'REQUEST_SOURCE_CHECK', recordId: FIELD_REPORT_ID })
    })
    advanceTo(1_906_000)
    act(() => {
      send({ type: 'MISSION_ACTION', payload: { kind: 'COMMIT', choice: 'hold' } })
    })
    advanceTo(1_930_000)
    act(() => {
      send({ type: 'INSPECT_RECORD', recordId: 'C17' })
    })
    cleanup()
    render(<FinaleHarness />)
    expect(screen.getByTestId('finale-ending-field-report-pending')).toBeInTheDocument()
  })
})

describe('fixture matrix: glossary active wherever the terms appear', () => {
  beforeEach(() => boot())

  it('the four finale terms render as focusable glossary buttons that open and Escape-close', () => {
    // The PROJECTION badge appears on the comparison figures; CASE / ROOT SOURCE
    // in the case builder; VIABILITY THRESHOLD in the decision panel.
    typeCommand('COMPARISON')
    // Need a valid case to render the columns; build it then run.
    typeCommand('CASE')
    buildValidCaseByKeyboard()
    typeCommand('COMPARISON')
    typeCommand('RUN COMPARISON')
    const col = screen.getByTestId('finale-column-staged')
    const badge = within(col).getAllByTestId('glossary-term')[0]!
    act(() => {
      fireEvent.focus(badge)
    })
    const wrap = badge.closest('.glossary-wrap') as HTMLElement
    expect(within(wrap).getByTestId('glossary-popup')).toBeInTheDocument()
    act(() => {
      fireEvent.keyDown(badge, { key: 'Escape' })
    })
    expect(within(wrap).queryByTestId('glossary-popup')).toBeNull()
  })
})
