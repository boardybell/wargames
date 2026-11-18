// Verb grammar and command-button identity. Every registered verb dispatches
// the identical action the equivalent on-screen button dispatches (both call
// the shared builders). GROUND ALL requires confirmation, quotes the WOPR
// directive, and renders spent after use. PROBE dispatches REQUEST_SOURCE_CHECK
// with the corridor's field-report record id (no shell scheduling). TRACE
// dispatches INSPECT_RECORD for the restriction record (no clue state in the
// shell).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init, send, getState } from '@app/state'
import { ScreenRouter } from '@app/screens'
import { parseCommand, registerDefaultVerbs } from '@app/terminal'
import { resetAll } from '../../screens/harness'
import {
  FLIGHTS_SCREEN_ID,
  makeCheckSourceAction,
  makeDivertAction,
  makeGroundAllAction,
  makeHoldAction,
  makeLandAction,
  makeProbeAction,
  makeReleaseAction,
  makeTraceAction,
} from '@app/missions/flights/verbs'
import { registerFlightsScreen } from '@app/missions/flights/FlightsScreen'
import { __resetFlightsView } from '@app/missions/flights/selectors'
import {
  FLIGHTS_FIXTURE_PAYLOAD,
  makeFlightsCtx,
  flightsSub,
  RESTRICTION_RECORD_ID,
} from './fixture'

const T0 = 1_000_000

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

let teardown: () => void

beforeEach(() => {
  resetAll()
  __resetFlightsView()
  setNarrow(false)
  vi.spyOn(Date, 'now').mockReturnValue(T0)
  registerDefaultVerbs()
  registerFlightsScreen()
  teardown = init({
    ctx: makeFlightsCtx(),
    seedName: 'test-seed',
    port: { read: () => null, write: () => {}, remove: () => {} },
  })
  act(() => {
    send({ type: 'START_MISSION', missionId: 'flights' })
  })
  // Mount the production screen so its verbs and UI handler are registered
  // (the screen owns verb registration on mount). Tests type into the one
  // shared command line and click the real controls.
  render(<ScreenRouter />)
})

afterEach(() => {
  teardown()
  __resetFlightsView()
  vi.restoreAllMocks()
  cleanup()
})

function parse(text: string) {
  const result = parseCommand(text, FLIGHTS_SCREEN_ID)
  return result.kind === 'action' ? result.action : null
}

describe('command-button identity', () => {
  it('every verb parses to the identical action the equivalent button dispatches', () => {
    expect(parse('LAND WX101 CASCADE')).toStrictEqual(makeLandAction('WX101', 'CASCADE'))
    expect(parse('DIVERT WX101 SABLE')).toStrictEqual(makeDivertAction('WX101', 'SABLE'))
    expect(parse('HOLD WX107')).toStrictEqual(makeHoldAction('WX107'))
    expect(parse('RELEASE WX107')).toStrictEqual(makeReleaseAction('WX107'))
    expect(parse('GROUND ALL')).toStrictEqual(makeGroundAllAction())
    expect(parse('TRACE F06')).toStrictEqual(makeTraceAction('F06'))
    expect(parse('CHECK SOURCE W02')).toStrictEqual(makeCheckSourceAction('W02'))
    // PROBE sugar: the typed PROBE resolves the corridor's field-report record
    // and dispatches the identical CHECK SOURCE the button path builds.
    expect(parse('PROBE C-MC')).toStrictEqual(
      makeProbeAction(FLIGHTS_FIXTURE_PAYLOAD, 'C-MC'),
    )
    expect(parse('PROBE C-MC')).toStrictEqual(makeCheckSourceAction('W02'))
  })

  it('view commands parse to mission-scoped SCREEN ui commands, not engine actions', () => {
    const grid = parseCommand('GRID', FLIGHTS_SCREEN_ID)
    expect(grid.kind).toBe('ui')
    const list = parseCommand('LIST', FLIGHTS_SCREEN_ID)
    expect(list.kind).toBe('ui')
    const sel = parseCommand('SELECT WX101', FLIGHTS_SCREEN_ID)
    expect(sel.kind).toBe('ui')
  })
})

describe('GROUND ALL', () => {
  it('requires confirmation, quotes the WOPR directive, and renders spent/disabled after use', () => {
    const control = screen.getByTestId('ground-all-control')
    // WOPR's directive is quoted beside the control.
    expect(control.textContent).toContain('WOPR DIRECTIVE')
    // First click asks for confirmation; it does NOT ground the fleet yet.
    fireEvent.click(screen.getByTestId('ground-all-button'))
    expect(screen.getByTestId('ground-all-confirm')).toBeInTheDocument()
    expect(flightsSub(getState()).groundAll).toBe(false)
    // Confirming grounds the fleet and the control renders spent/disabled.
    fireEvent.click(screen.getByTestId('ground-all-confirm-yes'))
    expect(flightsSub(getState()).groundAll).toBe(true)
    const spent = screen.getByTestId('ground-all-spent') as HTMLButtonElement
    expect(spent.disabled).toBe(true)
  })

  it('a re-dispatch after grounding is a provable no-op the engine rejects', () => {
    fireEvent.click(screen.getByTestId('ground-all-button'))
    fireEvent.click(screen.getByTestId('ground-all-confirm-yes'))
    // A second GROUND ALL via the command line is rejected by the engine.
    const result = send(makeGroundAllAction())
    expect(result.rejected).toBe(true)
  })
})

describe('PROBE and TRACE stay engine-owned', () => {
  it('PROBE dispatches REQUEST_SOURCE_CHECK with the corridor field-report record id; no shell scheduling', () => {
    // Select a flight whose corridor is C-MC (MERIDIAN->CASCADE is WX101).
    const input = screen.getByTestId('command-input') as HTMLInputElement
    const type = (text: string) => {
      act(() => {
        fireEvent.change(input, { target: { value: text } })
        fireEvent.submit(screen.getByTestId('command-form'))
      })
    }
    type('SELECT WX101')
    const before = getState().campaignQueue.length
    fireEvent.click(screen.getByTestId('probe-button'))
    // A REQUEST_SOURCE_CHECK was queued for W02 (the C-MC field report). The
    // mission queue never grew from a shell schedule; only the campaign queue
    // holds the pending desk reply.
    const pending = getState().campaignQueue.some((e) => e.id === 'desk-W02')
    expect(pending).toBe(true)
    expect(getState().campaignQueue.length).toBeGreaterThanOrEqual(before)
    // The mission substate recorded no shell-authored schedule (no probed set
    // growth: the shell dispatches CHECK SOURCE, not the mission PROBE action).
    expect(flightsSub(getState()).probed).toEqual([])
  })

  it('TRACE dispatches INSPECT_RECORD for the restriction record; no clue state held in the shell', () => {
    const input = screen.getByTestId('command-input') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: `TRACE ${RESTRICTION_RECORD_ID}` } })
      fireEvent.submit(screen.getByTestId('command-form'))
    })
    // The engine recorded the inspection and logged the clue; the shell holds no
    // clue state of its own.
    expect(getState().inspectedRecords).toContain(RESTRICTION_RECORD_ID)
    expect(getState().cluesFound.length).toBeGreaterThan(0)
  })
})
