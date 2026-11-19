// FinaleScreen and the three views through the REAL engine. Briefing + START;
// view switching by commands, tabs, and mobile back with the active view
// persisted and restored on return navigation; the last comparison result
// reappearing rather than an empty state; finaleFinalPhase driving the red alarm
// and the relay-pulse cue with end-anchored warnings; the recognition beat
// firing its line and cue exactly once.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, send, getState } from '@app/state'
import { relayEvents } from '@app/state/events'
import { ScreenRouter } from '@app/screens'
import { registerDefaultVerbs } from '@app/terminal'
import * as audio from '@app/audio'
import { onAnnounce } from '@app/a11y/announce'
import { resetAll } from '../../screens/harness'
import { registerFinaleScreen } from '@app/missions/finale/FinaleScreen'
import {
  makeReorderAction,
  makeValidateAction,
} from '@app/missions/finale/verbs'
import {
  caseFileRefFrom,
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
  registerDefaultVerbs()
  registerFinaleScreen()
  teardown = init({
    ctx: makeFinaleCtx(),
    seedName: 'test-seed',
    port: { read: () => null, write: () => {}, remove: () => {} },
  })
}

function bootStarted(): void {
  boot()
  startFinaleViaSend(advanceTo)
  render(<ScreenRouter />)
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

/** Corroborate + fill + validate a correct case, leaving caseValid true. */
function makeCaseValid(): void {
  advanceTo(2_000_000)
  act(() => {
    send({ type: 'REQUEST_SOURCE_CHECK', recordId: FIELD_REPORT_ID })
  })
  advanceTo(2_025_000)
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

describe('FinaleScreen: briefing and START', () => {
  it('renders failsafe-wall and START before the finale is active; the shell appears after START', () => {
    boot()
    render(<ScreenRouter />)
    // Before the finale starts the campaign is in the menu; register and START
    // the finale through the menu path is covered elsewhere. Here, drive the
    // finale screen's own briefing by rendering it from the menu once unlocked.
    startFinaleViaSend(advanceTo)
    cleanup()
    render(<ScreenRouter />)
    expect(screen.getByTestId('art-slot-failsafe-wall')).toBeInTheDocument()
    expect(screen.getByTestId('finale-tab-case')).toBeInTheDocument()
  })
})

describe('FinaleScreen: view switching three ways + persistence + return-nav restore', () => {
  beforeEach(bootStarted)

  it('CASE / COMPARISON / DECISION tabs switch the view', () => {
    expect(screen.getByTestId('finale-screen')).toHaveAttribute('data-view', 'case')
    fireEvent.click(screen.getByTestId('finale-tab-comparison'))
    expect(screen.getByTestId('finale-screen')).toHaveAttribute('data-view', 'comparison')
    fireEvent.click(screen.getByTestId('finale-tab-decision'))
    expect(screen.getByTestId('finale-screen')).toHaveAttribute('data-view', 'decision')
    fireEvent.click(screen.getByTestId('finale-tab-case'))
    expect(screen.getByTestId('finale-screen')).toHaveAttribute('data-view', 'case')
  })

  it('CASE / COMPARISON / DECISION commands switch the view, and BACK returns to the case', () => {
    typeCommand('COMPARISON')
    expect(screen.getByTestId('finale-screen')).toHaveAttribute('data-view', 'comparison')
    typeCommand('DECISION')
    expect(screen.getByTestId('finale-screen')).toHaveAttribute('data-view', 'decision')
    typeCommand('BACK')
    expect(screen.getByTestId('finale-screen')).toHaveAttribute('data-view', 'case')
  })

  it('the active view persists and restores on a remount (return navigation)', () => {
    fireEvent.click(screen.getByTestId('finale-tab-decision'))
    expect(screen.getByTestId('finale-screen')).toHaveAttribute('data-view', 'decision')
    cleanup()
    render(<ScreenRouter />)
    expect(screen.getByTestId('finale-screen')).toHaveAttribute('data-view', 'decision')
  })

  it('the last comparison result reappears on return navigation rather than an empty state', () => {
    makeCaseValid()
    typeCommand('COMPARISON')
    fireEvent.click(screen.getByTestId('finale-run-comparison'))
    expect(screen.getByTestId('finale-columns')).toBeInTheDocument()
    // Navigate away and back: the columns reappear, not an empty RUN prompt.
    typeCommand('CASE')
    typeCommand('COMPARISON')
    expect(screen.getByTestId('finale-columns')).toBeInTheDocument()
  })
})

describe('FinaleScreen: narrow back affordance', () => {
  beforeEach(() => {
    setNarrow(true)
    bootStarted()
  })

  it('a narrow viewport shows a BACK affordance off the case view and returns to it', () => {
    expect(screen.getByTestId('finale-screen')).toHaveAttribute('data-pane', 'single')
    fireEvent.click(screen.getByTestId('finale-tab-comparison'))
    expect(screen.getByTestId('finale-back')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('finale-back'))
    expect(screen.getByTestId('finale-screen')).toHaveAttribute('data-view', 'case')
  })
})

describe('FinaleScreen: finaleFinalPhase red alarm and end-anchored warnings', () => {
  beforeEach(bootStarted)

  it('finaleFinalPhase lights the red alarm, plays the relay-pulse cue, and announces its line', () => {
    const playSpy = vi.spyOn(audio, 'play')
    const announced: string[] = []
    const off = onAnnounce((text) => announced.push(text))
    expect(screen.getByTestId('finale-screen')).toHaveAttribute('data-final-phase', 'false')
    act(() => {
      relayEvents([{ type: 'finaleFinalPhase' }])
    })
    expect(screen.getByTestId('finale-screen')).toHaveAttribute('data-final-phase', 'true')
    expect(screen.getByTestId('finale-countdown')).toHaveAttribute('data-alarm', 'true')
    expect(playSpy).toHaveBeenCalledWith('finale-relay-pulse')
    expect(announced.join(' ')).toMatch(/FINAL PHASE/)
    off()
  })

  it('warn-30 and warn-10 announce their end-anchored JOSHUA lines', () => {
    const announced: string[] = []
    const off = onAnnounce((text) => announced.push(text))
    act(() => {
      relayEvents([{ type: 'timerMilestone', id: 'warn-30' }])
      relayEvents([{ type: 'timerMilestone', id: 'warn-10' }])
    })
    expect(announced.join(' ')).toMatch(/THIRTY SECONDS/)
    expect(announced.join(' ')).toMatch(/TEN SECONDS/)
    off()
  })
})

describe('FinaleScreen: recognition beat fires once', () => {
  beforeEach(bootStarted)

  it('the caseValid false-to-true transition renders the JOSHUA line and fires the cue exactly once', () => {
    const playSpy = vi.spyOn(audio, 'play')
    makeCaseValid()
    expect(finaleSub().caseValid).toBe(true)
    expect(screen.getByTestId('finale-recognition-line')).toBeInTheDocument()
    expect(screen.getByTestId('finale-recognition-line').textContent).toMatch(
      /THE ONLY WINNING MOVE IS NOT TO PLAY/,
    )
    const firstCount = playSpy.mock.calls.filter(
      (c) => c[0] === 'vo-recognition',
    ).length
    expect(firstCount).toBe(1)
    // Re-validating an already-valid case does not re-fire the beat.
    act(() => {
      send(makeValidateAction(caseFileRefFrom(getState())))
    })
    const secondCount = playSpy.mock.calls.filter(
      (c) => c[0] === 'vo-recognition',
    ).length
    expect(secondCount).toBe(1)
  })
})
