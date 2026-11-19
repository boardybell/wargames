// EndingScreen through the REAL engine: the settled finale SettledOutcome drives
// the outcome per endingId with the correct art slot, the earned-why readback
// VERBATIM from endings.ts, the final JOSHUA line with its voice cue and the
// ending cue, the pending field-report line when a reply arrived post-
// settlement, and the fresh-campaign offer wired to NEW_CAMPAIGN.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, send, getState } from '@app/state'
import { registerDefaultVerbs } from '@app/terminal'
import * as audio from '@app/audio'
import { registerFinaleGlossary } from '@app/missions/finale/glossary'
import { EndingScreen } from '@app/missions/finale/EndingScreen'
import {
  makeReorderAction,
  makeValidateAction,
  makeCommitAction,
} from '@app/missions/finale/verbs'
import {
  caseFileRefFrom,
  settledFinale,
  __resetFinaleView,
} from '@app/missions/finale/selectors'
import { resetAll } from '../../screens/harness'
import {
  makeFinaleCtx,
  startFinaleViaSend,
  finaleSub,
  FIELD_REPORT_ID,
} from './fixture'
import type { FinaleState } from '@engine/missions/finale/types'

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
  registerFinaleGlossary()
  teardown = init({
    ctx: makeFinaleCtx(),
    seedName: 'test-seed',
    port: { read: () => null, write: () => {}, remove: () => {} },
  })
  startFinaleViaSend(advanceTo)
}

afterEach(() => {
  teardown()
  __resetFinaleView()
  vi.restoreAllMocks()
  cleanup()
})

/** Validate a correct case and return the last finale substate before commit. */
function validate(): FinaleState {
  advanceTo(1_905_000)
  act(() => {
    send({ type: 'REQUEST_SOURCE_CHECK', recordId: FIELD_REPORT_ID })
  })
  advanceTo(1_930_000)
  act(() => {
    send({ type: 'SET_PREFERENCE', preference: 'extendedTime', value: false })
  })
  send({ type: 'MISSION_ACTION', payload: { kind: 'SELECT', slot: 'outlook', recordId: 'C17' } })
  send({ type: 'MISSION_ACTION', payload: { kind: 'SELECT', slot: 'flights', recordId: 'F06' } })
  send({ type: 'MISSION_ACTION', payload: { kind: 'SELECT', slot: 'bank', recordId: 'B04' } })
  send({ type: 'MISSION_ACTION', payload: { kind: 'SELECT', slot: 'root', recordId: 'C17' } })
  send({ type: 'MISSION_ACTION', payload: { kind: 'SELECT', slot: 'observation', recordId: FIELD_REPORT_ID } })
  send(makeReorderAction(['C17', 'F06', 'B04']))
  send(makeValidateAction(caseFileRefFrom(getState())))
  return finaleSub()
}

function renderEnding(last: FinaleState): void {
  render(
    <EndingScreen
      state={getState()}
      outcome={settledFinale(getState())!}
      finaleState={last}
      fieldReportId={FIELD_REPORT_ID}
    />,
  )
}

describe('EndingScreen: recovery', () => {
  beforeEach(boot)

  it('renders the recovery ending art (with hero-return), the earned-why readback, and the final line + cues', () => {
    const playSpy = vi.spyOn(audio, 'play')
    const last = validate()
    act(() => {
      send(makeCommitAction('staged'))
    })
    expect(settledFinale(getState())!.endingId).toBe('recovery')
    renderEnding(last)

    expect(screen.getByTestId('finale-ending')).toHaveAttribute('data-ending-id', 'recovery')
    expect(screen.getByTestId('art-slot-ending-recovery')).toBeInTheDocument()
    expect(screen.getByTestId('art-slot-hero-return')).toBeInTheDocument()
    // The final JOSHUA recovery line (verbatim tone line 4).
    expect(screen.getByTestId('finale-ending-line').textContent).toMatch(
      /HOW ABOUT A NICE GAME OF CHESS/,
    )
    // The earned-why readback is rendered verbatim (names real settled figures).
    expect(screen.getByTestId('finale-proved-evidence').textContent).toMatch(
      /THE EXERCISE ROOT/,
    )
    expect(screen.getByTestId('finale-projected-vs-actual').textContent).toMatch(
      /STAGED BRANCH PROJECTED/,
    )
    // Recovery carries no unresolved list.
    expect(screen.queryByTestId('finale-unresolved')).toBeNull()
    // The final line voice cue and the ending ambience cue both fired.
    expect(playSpy).toHaveBeenCalledWith('vo-ending-recovery')
    expect(playSpy).toHaveBeenCalledWith('finale-ending-recovery')
  })
})

describe('EndingScreen: containment', () => {
  beforeEach(boot)

  it('renders the containment art, the containment line, and the unresolved problems list', () => {
    const last = validate()
    act(() => {
      send(makeCommitAction('hold'))
    })
    expect(settledFinale(getState())!.endingId).toBe('containment')
    renderEnding(last)
    expect(screen.getByTestId('finale-ending')).toHaveAttribute('data-ending-id', 'containment')
    expect(screen.getByTestId('art-slot-ending-containment')).toBeInTheDocument()
    expect(screen.queryByTestId('art-slot-hero-return')).toBeNull()
    expect(screen.getByTestId('finale-ending-line').textContent).toMatch(
      /HELD AND VERIFIED/,
    )
    // Containment names the unresolved problems from real campaign state.
    expect(screen.getByTestId('finale-unresolved')).toBeInTheDocument()
  })
})

describe('EndingScreen: failure (timeout)', () => {
  beforeEach(boot)

  it('renders the failure art and the failure line on a timeout collapse', () => {
    const last = finaleSub()
    const endsAt = getState().activeMission!.endsAt
    advanceTo(endsAt + 1_000)
    act(() => {
      // A wake crosses the deadline and settles the finale to failure.
      send({ type: 'INSPECT_RECORD', recordId: 'C17' })
    })
    expect(settledFinale(getState())!.endingId).toBe('failure')
    renderEnding(last)
    expect(screen.getByTestId('finale-ending')).toHaveAttribute('data-ending-id', 'failure')
    expect(screen.getByTestId('art-slot-ending-failure')).toBeInTheDocument()
    expect(screen.getByTestId('finale-ending-line').textContent).toMatch(
      /NO SUCH THING AS A PARTIAL WAR/,
    )
  })
})

describe('EndingScreen: pending field-report line', () => {
  beforeEach(boot)

  it('a field-report reply arriving post-settlement renders the pending line', () => {
    // Request the desk check, commit before it lands, then advance past the
    // delay so the reply arrives after settlement (arrivedAfterSettlement).
    const last = finaleSub()
    advanceTo(1_905_000)
    act(() => {
      send({ type: 'REQUEST_SOURCE_CHECK', recordId: FIELD_REPORT_ID })
    })
    advanceTo(1_906_000)
    act(() => {
      send(makeCommitAction('hold'))
    })
    expect(settledFinale(getState())).not.toBeNull()
    advanceTo(1_930_000)
    act(() => {
      // A later wake lands the desk reply post-settlement.
      send({ type: 'INSPECT_RECORD', recordId: 'C17' })
    })
    const check = getState().sourceChecks.find((c) => c.recordId === FIELD_REPORT_ID)!
    expect(check.arrivedAfterSettlement).toBe(true)
    renderEnding(last)
    expect(screen.getByTestId('finale-ending-field-report-pending')).toBeInTheDocument()
  })
})

describe('EndingScreen: fresh-campaign offer', () => {
  beforeEach(boot)

  it('the NEW CAMPAIGN control is wired to the New Campaign flow (NEW_CAMPAIGN)', () => {
    const last = validate()
    act(() => {
      send(makeCommitAction('staged'))
    })
    renderEnding(last)
    // The offer is present; the hidden confirm button dispatches NEW_CAMPAIGN.
    expect(screen.getByTestId('finale-new-campaign')).toBeInTheDocument()
    act(() => {
      fireEvent.click(screen.getByTestId('finale-new-campaign-confirm'))
    })
    expect(settledFinale(getState())).toBeNull()
    expect(getState().settled).toHaveLength(0)
  })
})
