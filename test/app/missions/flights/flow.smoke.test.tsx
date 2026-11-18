// Smoke flows: one keyboard-only routing flow (select a flight, LAND it at a
// legal hub, observe the status change) and one narrow-width pass confirming
// the list is the default and that every action reachable on the grid is
// reachable in the list. Exhaustive passes belong to section 04; this is the
// basic routing proof plus a settlement/debrief render.
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

function boot(narrow: boolean): void {
  resetAll()
  __resetFlightsView()
  setNarrow(narrow)
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
}

beforeEach(() => {
  boot(false)
})

afterEach(() => {
  teardown()
  __resetFlightsView()
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

describe('keyboard-only routing flow', () => {
  it('select a flight, LAND it at a legal hub, observe the status change, all typed', () => {
    render(<ScreenRouter />)
    // Advance the engine so WX101 (MERIDIAN->CASCADE, departs 10s) is airborne.
    vi.spyOn(Date, 'now').mockReturnValue(T0 + 15_000)
    act(() => {
      wake()
    })
    expect(flightsSub(getState()).flights['WX101']?.status).toBe('airborne')

    // Select it and LAND it at its own hub CASCADE (open, a free runway slot).
    typeCommand('SELECT WX101')
    typeCommand('LAND WX101 CASCADE')
    // The flight is now inbound to CASCADE; advance past cruise (60s) so it
    // lands, and the status changes to a terminal landing.
    expect(flightsSub(getState()).flights['WX101']?.inboundHubId).toBe('CASCADE')
    vi.spyOn(Date, 'now').mockReturnValue(T0 + 90_000)
    act(() => {
      wake()
    })
    const status = flightsSub(getState()).flights['WX101']?.status
    expect(['landed', 'landedLate', 'divertedLanded']).toContain(status)
  })
})

describe('narrow-width pass', () => {
  it('the list is the default at narrow width and every grid action is reachable in the list', () => {
    teardown()
    boot(true)
    render(<ScreenRouter />)
    // Narrow defaults to the list.
    expect(screen.getByTestId('flights-screen')).toHaveAttribute('data-view', 'list')
    expect(screen.getByTestId('flight-list-view')).toBeInTheDocument()

    // Advance so flights are airborne, then confirm the list exposes routing,
    // HOLD, RELEASE, and the blanket GROUND ALL (full parity with the grid).
    vi.spyOn(Date, 'now').mockReturnValue(T0 + 35_000)
    act(() => {
      wake()
    })
    const anyFlight = FLIGHTS_FIXTURE_PAYLOAD.flights[0]!.id
    const row = screen.getByTestId(`flight-row-${anyFlight}`)
    expect(within(row).getByTestId(`list-HOLD-${anyFlight}`)).toBeInTheDocument()
    expect(within(row).getByTestId(`list-RELEASE-${anyFlight}`)).toBeInTheDocument()
    // At least one routing affordance exists in the row.
    const hasRoute = FLIGHTS_FIXTURE_PAYLOAD.hubs.some(
      (h) =>
        within(row).queryByTestId(`list-LAND-${anyFlight}-${h.id}`) ||
        within(row).queryByTestId(`list-DIVERT-${anyFlight}-${h.id}`),
    )
    expect(hasRoute).toBe(true)
    // GROUND ALL is reachable from the list.
    expect(screen.getByTestId('list-GROUND-ALL')).toBeInTheDocument()
  })
})

describe('settlement and debrief', () => {
  it('forfeiting the mission renders the debrief for the flights mission', () => {
    render(<ScreenRouter />)
    act(() => {
      send({ type: 'FORFEIT_MISSION' })
    })
    const debrief = screen.getByTestId('debrief-screen')
    expect(debrief).toHaveAttribute('data-mission-id', 'flights')
  })
})
