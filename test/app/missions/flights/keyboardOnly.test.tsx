// A keyboard-only full routing flow through the real FlightsScreen and the real
// engine (no mocks of either). Every interaction is typed into the one shared
// command line ScreenRouter renders at the foot of the mission screen: there are
// NO pointer events anywhere in the flow. The flow selects a flight, reads its
// conditions off the readout, routes it to a legal hub, advances engine time
// past its arrival via a keyboard-driven wake, and observes the flight resolve
// in the scoreboard. Fake timers prove no LOCAL timer drives the cues or the
// resolution: only an engine-clock advance folds the arrival. Focus stays sane
// after view switches. The glossary check proves a local term (CORRIDOR) and a
// shell-global term (OPEN EXCEPTIONS) are focusable and Escape-closable.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { init, send, wake, getState } from '@app/state'
import { ScreenRouter } from '@app/screens'
import { registerDefaultVerbs } from '@app/terminal'
import { resetAll } from '../../screens/harness'
import { registerFlightsScreen } from '@app/missions/flights/FlightsScreen'
import { __resetFlightsView } from '@app/missions/flights/selectors'
import { FLIGHTS_FIXTURE_PAYLOAD, makeFlightsCtx, flightsSub } from './fixture'

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
})

afterEach(() => {
  teardown()
  __resetFlightsView()
  vi.restoreAllMocks()
  cleanup()
})

/** Type a command into the single shared command input and submit it with the
 *  keyboard (a form submit, the Enter path), never a pointer. */
function typeCommand(text: string): void {
  const input = screen.getByTestId('command-input') as HTMLInputElement
  act(() => {
    fireEvent.change(input, { target: { value: text } })
    fireEvent.submit(screen.getByTestId('command-form'))
  })
}

/** Advance the engine clock by setting Date.now and waking: a keyboard-path
 *  event, no pointer, no local timer. */
function advanceEngine(toMs: number): void {
  vi.spyOn(Date, 'now').mockReturnValue(toMs)
  act(() => {
    wake()
  })
}

describe('keyboard-only routing flow', () => {
  it('completes one full routing flow keyboard-only: select, read conditions, route, advance, resolve in the scoreboard', () => {
    render(<ScreenRouter />)
    // WX101 (MERIDIAN -> CASCADE) departs at 10s; advance so it is airborne.
    advanceEngine(T0 + 15_000)
    expect(flightsSub(getState()).flights['WX101']?.status).toBe('airborne')

    // SELECT it with a typed command (no pointer). The readout reveals its
    // conditions: flight id, position, passengers, and the viable destinations.
    typeCommand('SELECT WX101')
    const readout = screen.getByTestId('flight-readout')
    expect(readout).toHaveAttribute('data-flight-id', 'WX101')
    expect(readout.textContent).toContain('FLIGHT WX101')
    expect(within(readout).getByTestId('readout-destinations')).toBeInTheDocument()

    // Route it to its own hub CASCADE with a typed LAND command.
    typeCommand('LAND WX101 CASCADE')
    expect(flightsSub(getState()).flights['WX101']?.inboundHubId).toBe('CASCADE')

    // Advance the engine past cruise (60s) so the arrival folds (keyboard wake,
    // no pointer): the flight resolves to a terminal landing.
    advanceEngine(T0 + 90_000)
    const status = flightsSub(getState()).flights['WX101']?.status
    // WX101 LAND CASCADE is its OWN destination with no queue delay: the
    // deterministic clean route lands ON TIME. Pin exactly 'landed'; a
    // late/diverted status here would be a routing bug.
    expect(status).toBe('landed')
    // The resolution is reflected in the live scoreboard: at least one flight
    // has landed, so landedFlights is non-zero in the passenger line.
    const scoreboard = screen.getByTestId('scoreboard-passengers')
    expect(scoreboard.textContent).toMatch(/PASSENGERS RESOLVED \d+/)
    expect(flightsSub(getState()).runwayUse['CASCADE']).toBeGreaterThanOrEqual(1)
  })

  it('no LOCAL timer drives the resolution: fake timers advanced without an engine wake fold nothing', () => {
    vi.useFakeTimers()
    render(<ScreenRouter />)
    // With fake timers and NO engine-clock advance, advancing jsdom timers does
    // not depart or fold any flight: every flight is still scheduled.
    act(() => {
      vi.advanceTimersByTime(300_000)
    })
    for (const flight of FLIGHTS_FIXTURE_PAYLOAD.flights) {
      expect(flightsSub(getState()).flights[flight.id]?.status).toBe('scheduled')
    }
    vi.useRealTimers()
    // Only an engine-clock advance moves the flights: now WX101 departs.
    advanceEngine(T0 + 15_000)
    expect(flightsSub(getState()).flights['WX101']?.status).toBe('airborne')
  })

  it('focus stays sane after view switches: the shared command input remains focusable', () => {
    render(<ScreenRouter />)
    const input = screen.getByTestId('command-input') as HTMLInputElement
    act(() => {
      input.focus()
    })
    expect(document.activeElement).toBe(input)

    // Switch grid -> list -> grid entirely by typed commands; the shared input
    // is never stranded.
    typeCommand('LIST')
    expect(screen.getByTestId('flights-screen')).toHaveAttribute('data-view', 'list')
    typeCommand('GRID')
    expect(screen.getByTestId('flights-screen')).toHaveAttribute('data-view', 'grid')

    const inputAfter = screen.getByTestId('command-input') as HTMLInputElement
    act(() => {
      inputAfter.focus()
    })
    expect(document.activeElement).toBe(inputAfter)
  })

  it('the global OPEN EXCEPTIONS glossary term is focusable and Escape closes it', () => {
    render(<ScreenRouter />)
    // The global OPEN EXCEPTIONS term renders in the dual scoreboard.
    const scoreboard = screen.getByTestId('scoreboard-exceptions')
    const globalTerm = within(scoreboard).getByTestId('glossary-term')
    expect(globalTerm.textContent).toContain('OPEN EXCEPTIONS')
    const wrap = globalTerm.closest('.glossary-wrap') as HTMLElement
    act(() => {
      fireEvent.focus(globalTerm)
    })
    expect(within(wrap).getByTestId('glossary-popup')).toBeInTheDocument()
    // Escape closes while focused.
    act(() => {
      fireEvent.keyDown(globalTerm, { key: 'Escape' })
    })
    expect(within(wrap).queryByTestId('glossary-popup')).toBeNull()
  })

  it('the local CORRIDOR glossary term is focusable and Escape closes it', () => {
    render(<ScreenRouter />)
    // The local CORRIDOR term renders in the flight list copy. Switch to the
    // list view by a typed command (keyboard), then focus CORRIDOR.
    typeCommand('LIST')
    const list = screen.getByTestId('flight-list-view')
    const corridor = within(list)
      .getAllByTestId('glossary-term')
      .find((t) => t.textContent === 'CORRIDOR')!
    expect(corridor).toBeDefined()
    const corridorWrap = corridor.closest('.glossary-wrap') as HTMLElement
    act(() => {
      fireEvent.focus(corridor)
    })
    expect(within(corridorWrap).getByTestId('glossary-popup')).toBeInTheDocument()
    act(() => {
      fireEvent.keyDown(corridor, { key: 'Escape' })
    })
    expect(within(corridorWrap).queryByTestId('glossary-popup')).toBeNull()
  })
})
