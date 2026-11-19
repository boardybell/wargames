// CaseBuilderView through the REAL engine and REAL finale module on the fixture
// seed. Slot interaction by keyboard and by tap producing identical state;
// reorder on the three subsystem slots only; command-button identity for every
// verb; rejection highlights the right slot and renders the right JOSHUA line
// with slots still editable and a corrected second attempt accepted; UNVERIFIED
// not attachable while a corroborated candidate is; the full requirements
// validator fixture matrix (receipt-order, unrelated-source, derived-not-
// independent, wrong-root, incomplete) each rendering the right line and slot;
// and REQUEST FIELD REPORT only while legal, retiring after the reply.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, send, getState } from '@app/state'
import { ScreenRouter } from '@app/screens'
import { parseCommand, registerDefaultVerbs } from '@app/terminal'
import { resetAll } from '../../screens/harness'
import { registerFinaleScreen } from '@app/missions/finale/FinaleScreen'
import {
  FINALE_SCREEN_ID,
  makeSelectAction,
  makeReorderAction,
  makeValidateAction,
  makeRequestFieldReportAction,
  makeRunComparisonAction,
  makeCommitAction,
} from '@app/missions/finale/verbs'
import { caseFileRefFrom, __resetFinaleView } from '@app/missions/finale/selectors'
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

/** Resolve a desk check for a record by requesting it and advancing the clock. */
function resolveCheck(recordId: string, at: number): void {
  advanceTo(at)
  act(() => {
    send({ type: 'REQUEST_SOURCE_CHECK', recordId })
  })
  advanceTo(at + 25_000)
  act(() => {
    send({ type: 'INSPECT_RECORD', recordId: 'C17' })
  })
}

/** SELECT a record into a slot via the typed command. */
function selectByCommand(recordId: string, slot: string): void {
  typeCommand(`SELECT ${recordId} ${slot}`)
}

describe('CaseBuilderView: slot interaction identity (keyboard and tap)', () => {
  beforeEach(boot)

  it('SELECT by typed command and by tap produce identical state', () => {
    // Tap path: click the OUTLOOK candidate C17.
    fireEvent.click(screen.getByTestId('finale-attach-outlook-C17'))
    expect(finaleSub().slots.outlook).toBe('C17')
    // Clear it, then do the same by typed command: identical resulting state.
    typeCommand('CLEAR outlook')
    expect(finaleSub().slots.outlook).toBeNull()
    selectByCommand('C17', 'outlook')
    expect(finaleSub().slots.outlook).toBe('C17')
  })

  it('command-button identity: every verb parses to the identical action the button dispatches', () => {
    const parse = (text: string) => {
      const r = parseCommand(text, FINALE_SCREEN_ID)
      return r.kind === 'action' ? r.action : null
    }
    expect(parse('SELECT C17 outlook')).toStrictEqual(makeSelectAction('outlook', 'C17'))
    expect(parse('RUN COMPARISON')).toStrictEqual(makeRunComparisonAction())
    // VALIDATE / REQUEST carry the live case-file bundle; the shared builder
    // over the same case-file ref is deep-equal to what the button sends.
    const ref = caseFileRefFrom(getState())
    expect(parse('VALIDATE')).toStrictEqual(makeValidateAction(ref))
    expect(parse('REQUEST FIELD REPORT')).toStrictEqual(
      makeRequestFieldReportAction(ref),
    )
  })

  it('COMMIT parses to the confirmation-gate ui command, not a direct action, so the typed irreversible path meets the same confirm dialog the button raises', () => {
    const r = parseCommand('COMMIT HOLD', FINALE_SCREEN_ID)
    // No direct action: the typed COMMIT opens the gate rather than settling.
    expect(r.kind).toBe('ui')
    if (r.kind === 'ui') {
      expect(r.command).toStrictEqual({
        kind: 'SCREEN',
        screenId: FINALE_SCREEN_ID,
        detail: { kind: 'COMMIT', choice: 'hold' },
      })
    }
    // The action the dialog's confirm ultimately dispatches is the shared
    // builder, identical to the DecisionView button's confirm.
    expect(makeCommitAction('hold')).toStrictEqual({
      type: 'MISSION_ACTION',
      payload: { kind: 'COMMIT', choice: 'hold' },
    })
  })

  it('the reorder MOVE commands parse to a REORDER action over the subsystem ids', () => {
    // Fill the three subsystem slots and order them C17,F06,B04.
    selectByCommand('C17', 'outlook')
    selectByCommand('F06', 'flights')
    selectByCommand('B04', 'bank')
    typeCommand('MOVE B04 UP')
    // B04 moved up one place: the ordering now reads C17,B04,F06.
    expect([...finaleSub().ordering]).toStrictEqual(['C17', 'B04', 'F06'])
  })
})

describe('CaseBuilderView: reorder on the three subsystem slots only', () => {
  beforeEach(boot)

  it('subsystem slots expose MOVE controls; root and observation do not', () => {
    selectByCommand('C17', 'outlook')
    selectByCommand('F06', 'flights')
    selectByCommand('B04', 'bank')
    selectByCommand('C17', 'root')
    expect(screen.getByTestId('finale-reorder-outlook')).toBeInTheDocument()
    expect(screen.getByTestId('finale-reorder-flights')).toBeInTheDocument()
    expect(screen.getByTestId('finale-reorder-bank')).toBeInTheDocument()
    expect(screen.queryByTestId('finale-reorder-root')).toBeNull()
    expect(screen.queryByTestId('finale-reorder-observation')).toBeNull()
  })

  it('a MOVE UP button and the typed MOVE command produce identical orderings', () => {
    selectByCommand('C17', 'outlook')
    selectByCommand('F06', 'flights')
    selectByCommand('B04', 'bank')
    // Button: move bank (B04) up.
    fireEvent.click(screen.getByTestId('finale-move-up-bank'))
    const afterButton = [...finaleSub().ordering]
    // Reset ordering to C17,F06,B04 and move via typed command.
    act(() => {
      send(makeReorderAction(['C17', 'F06', 'B04']))
    })
    typeCommand('MOVE B04 UP')
    expect([...finaleSub().ordering]).toStrictEqual(afterButton)
  })
})

/** Build a correct, corroborated, validated case setup for the rejection tests:
 *  resolve the field report desk so the observation can corroborate. */
function corroborateFieldReport(): void {
  resolveCheck(FIELD_REPORT_ID, 2_000_000)
}

describe('CaseBuilderView: the four validator fixtures through the UI', () => {
  beforeEach(boot)

  function fillAll(observation: string, ordering: string[]): void {
    corroborateFieldReport()
    selectByCommand('C17', 'outlook')
    selectByCommand('F06', 'flights')
    selectByCommand('B04', 'bank')
    selectByCommand('C17', 'root')
    selectByCommand(observation, 'observation')
    act(() => {
      send(makeReorderAction(ordering))
    })
  }

  it('the correct event-time case is accepted', () => {
    fillAll(FIELD_REPORT_ID, ['C17', 'F06', 'B04'])
    fireEvent.click(screen.getByTestId('finale-validate'))
    expect(finaleSub().caseValid).toBe(true)
    expect(screen.getByTestId('finale-case-valid')).toBeInTheDocument()
  })

  it('a receipt-time ordering is rejected with the receipt-order reason and the right slot', () => {
    // Receipt order diverges: C17(445) B04(470) F06(492). Claim C17,B04,F06.
    fillAll(FIELD_REPORT_ID, ['C17', 'B04', 'F06'])
    fireEvent.click(screen.getByTestId('finale-validate'))
    const rejection = screen.getByTestId('finale-rejection')
    expect(rejection).toHaveAttribute('data-code', 'receipt-order')
    // The failing slot is highlighted.
    expect(screen.getByTestId(`finale-slot-${rejection.getAttribute('data-slot')}`)).toHaveAttribute('data-rejected', 'true')
    // The JOSHUA receipt-order line renders.
    expect(rejection.textContent).toMatch(/TIME OF RECEIPT IS NOT TIME OF EVENT/)
  })

  it('an on-time unrelated source (E01) is rejected unrelated-source at the observation slot', () => {
    // E01 is EXERCISE origin, no run: not a run derivative, reads unrelated.
    fillAll('E01', ['C17', 'F06', 'B04'])
    fireEvent.click(screen.getByTestId('finale-validate'))
    const rejection = screen.getByTestId('finale-rejection')
    expect(rejection).toHaveAttribute('data-code', 'unrelated-source')
    expect(rejection).toHaveAttribute('data-slot', 'observation')
    expect(rejection.textContent).toMatch(/STRANGER TO THIS CHAIN/)
  })

  it('a same-run derivative (S11) is rejected derived-not-independent, never unrelated', () => {
    // S11 is OBSERVED but directly run-stamped: a copy of a witness.
    fillAll('S11', ['C17', 'F06', 'B04'])
    fireEvent.click(screen.getByTestId('finale-validate'))
    const rejection = screen.getByTestId('finale-rejection')
    expect(rejection).toHaveAttribute('data-code', 'derived-not-independent')
    expect(rejection.textContent).toMatch(/SAME RUN/)
  })

  it('a wrong root is rejected wrong-root at the root slot', () => {
    corroborateFieldReport()
    selectByCommand('C17', 'outlook')
    selectByCommand('F06', 'flights')
    selectByCommand('B04', 'bank')
    selectByCommand('B04', 'root') // not the true root C17
    selectByCommand(FIELD_REPORT_ID, 'observation')
    act(() => {
      send(makeReorderAction(['C17', 'F06', 'B04']))
    })
    fireEvent.click(screen.getByTestId('finale-validate'))
    const rejection = screen.getByTestId('finale-rejection')
    expect(rejection).toHaveAttribute('data-code', 'wrong-root')
    expect(rejection).toHaveAttribute('data-slot', 'root')
  })

  it('an incomplete case is rejected incomplete; slots stay editable; the corrected attempt is accepted', () => {
    corroborateFieldReport()
    // Leave the observation slot empty.
    selectByCommand('C17', 'outlook')
    selectByCommand('F06', 'flights')
    selectByCommand('B04', 'bank')
    selectByCommand('C17', 'root')
    act(() => {
      send(makeReorderAction(['C17', 'F06', 'B04']))
    })
    fireEvent.click(screen.getByTestId('finale-validate'))
    expect(screen.getByTestId('finale-rejection')).toHaveAttribute('data-code', 'incomplete')
    // Slots are still editable: fill the observation and re-validate to accept.
    selectByCommand(FIELD_REPORT_ID, 'observation')
    fireEvent.click(screen.getByTestId('finale-validate'))
    expect(finaleSub().caseValid).toBe(true)
  })
})

describe('CaseBuilderView: UNVERIFIED corroboration through the UI', () => {
  beforeEach(boot)

  it('W02 unchecked lists UNVERIFIED and is not attachable; a CONFIRMED W02 qualifies', () => {
    // Before any check, W02 is an independent OBSERVED candidate with no
    // CONFIRMED check: it lists UNVERIFIED and its attach button is disabled.
    const unverified = screen.getByTestId('finale-candidate-observation-W02')
    expect(unverified).toHaveAttribute('data-unverified', 'true')
    expect(unverified).toHaveAttribute('data-attachable', 'false')
    expect((screen.getByTestId('finale-attach-observation-W02') as HTMLButtonElement).disabled).toBe(true)

    // Resolve a CONFIRMED check for W02: it now qualifies and is attachable.
    resolveCheck('W02', 2_000_000)
    const verified = screen.getByTestId('finale-candidate-observation-W02')
    expect(verified).toHaveAttribute('data-attachable', 'true')
    expect(verified).toHaveAttribute('data-unverified', 'false')
    expect((screen.getByTestId('finale-attach-observation-W02') as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('CaseBuilderView: inspected records highlighted', () => {
  beforeEach(boot)

  it('an inspected-during-play record renders highlighted in its candidate list', () => {
    act(() => {
      send({ type: 'INSPECT_RECORD', recordId: 'C17' })
    })
    const candidate = screen.getByTestId('finale-candidate-outlook-C17')
    expect(candidate).toHaveAttribute('data-highlighted', 'true')
  })
})

describe('CaseBuilderView: REQUEST FIELD REPORT legality', () => {
  beforeEach(boot)

  it('appears only while legal, then retires once the reply corroborates', () => {
    // Legal at start: no corroborated candidate exists yet.
    expect(screen.getByTestId('finale-request-field-report')).toBeInTheDocument()
    // Request it (finale flag) then dispatch the desk check and resolve it.
    fireEvent.click(screen.getByTestId('finale-request-field-report'))
    expect(finaleSub().fieldReportRequested).toBe(true)
    act(() => {
      send({ type: 'REQUEST_SOURCE_CHECK', recordId: FIELD_REPORT_ID })
    })
    // Pending status renders while still legal (reply not yet in).
    expect(screen.getByTestId('finale-field-report-pending')).toBeInTheDocument()
    // Advance so the reply lands; the field report now corroborates and the
    // control retires (no longer legal).
    advanceTo(2_000_000)
    act(() => {
      send({ type: 'INSPECT_RECORD', recordId: 'C17' })
    })
    expect(screen.queryByTestId('finale-request-field-report')).toBeNull()
    expect(screen.queryByTestId('finale-field-report-pending')).toBeNull()
  })
})
