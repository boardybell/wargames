// The narrow-width single-pane pass through the real FlightsScreen and the real
// engine. At narrow width the screen is single-pane and defaults to the full
// flight LIST, which carries full parity with the grid: every land, divert,
// hold, release, and the blanket GROUND ALL is reachable from the list, with
// selection reachable both from a list row and from the keyboard SELECT command.
// A BACK affordance (the keyboard command) clears the selection. The StatusLine
// and the role=timer countdown stay visible in every view the screen can show at
// narrow width (the list, and the grid when explicitly toggled). Narrow width is
// driven by the same matchMedia mock the other flights app tests use.
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

function boot(): void {
  resetAll()
  __resetFlightsView()
  setNarrow(true)
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
  boot()
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

function advanceEngine(toMs: number): void {
  vi.spyOn(Date, 'now').mockReturnValue(toMs)
  act(() => {
    wake()
  })
}

describe('narrow-width single-pane', () => {
  it('narrow viewport is single-pane and defaults to the full flight LIST', () => {
    render(<ScreenRouter />)
    const flightsScreen = screen.getByTestId('flights-screen')
    expect(flightsScreen).toHaveAttribute('data-pane', 'single')
    expect(flightsScreen).toHaveAttribute('data-view', 'list')
    expect(screen.getByTestId('flight-list-view')).toBeInTheDocument()
  })

  it('full list parity: every land/divert/hold/release action row and GROUND ALL is present, plus a per-hub routing affordance', () => {
    render(<ScreenRouter />)
    // Advance so flights are airborne (routing affordances enabled).
    advanceEngine(T0 + 35_000)
    for (const flight of FLIGHTS_FIXTURE_PAYLOAD.flights) {
      const row = screen.getByTestId(`flight-row-${flight.id}`)
      expect(within(row).getByTestId(`list-HOLD-${flight.id}`)).toBeInTheDocument()
      expect(within(row).getByTestId(`list-RELEASE-${flight.id}`)).toBeInTheDocument()
      // One routing affordance (LAND for its own destination, DIVERT for the
      // rest) per hub: full parity with the grid readout.
      let routeButtons = 0
      for (const hub of FLIGHTS_FIXTURE_PAYLOAD.hubs) {
        const land = within(row).queryByTestId(`list-LAND-${flight.id}-${hub.id}`)
        const divert = within(row).queryByTestId(`list-DIVERT-${flight.id}-${hub.id}`)
        if (land || divert) routeButtons += 1
      }
      expect(routeButtons).toBe(FLIGHTS_FIXTURE_PAYLOAD.hubs.length)
    }
    // GROUND ALL is reachable from the list.
    expect(screen.getByTestId('list-GROUND-ALL')).toBeInTheDocument()
  })

  it('a full routing flow completes in the list view at narrow width (airborne flight -> LAND -> resolves)', () => {
    render(<ScreenRouter />)
    advanceEngine(T0 + 35_000)
    // WX101 (MERIDIAN -> CASCADE) is airborne at 35s. LAND it from the list row.
    expect(flightsSub(getState()).flights['WX101']?.status).toBe('airborne')
    const row = screen.getByTestId('flight-row-WX101')
    const landBtn = within(row).getByTestId('list-LAND-WX101-CASCADE') as HTMLButtonElement
    expect(landBtn.disabled).toBe(false)
    fireEvent.click(landBtn)
    expect(flightsSub(getState()).flights['WX101']?.inboundHubId).toBe('CASCADE')
    // The arrival (routed 35s + 60s cruise = 95s) folds on the next scheduled
    // wake after it. Advance past the MERIDIAN window event at 120s so the fold
    // runs and the flight resolves to a terminal landing.
    advanceEngine(T0 + 130_000)
    const status = flightsSub(getState()).flights['WX101']?.status
    // WX101 MERIDIAN -> CASCADE is the deterministic clean route: routed to its
    // OWN destination with no queue delay past the lateness threshold, so it
    // lands ON TIME. Pin exactly 'landed'; a late/diverted status here is a bug.
    expect(status).toBe('landed')
  })

  it('selection works from the list row AND from the keyboard SELECT command; BACK clears it', () => {
    render(<ScreenRouter />)
    // Select from a list row click.
    fireEvent.click(screen.getByTestId('flight-select-WX103'))
    expect(screen.getByTestId('flight-row-WX103')).toHaveAttribute('data-selected', 'true')
    // Re-select a different flight from the keyboard SELECT command.
    typeCommand('SELECT WX105')
    expect(screen.getByTestId('flight-row-WX105')).toHaveAttribute('data-selected', 'true')
    expect(screen.getByTestId('flight-row-WX103')).toHaveAttribute('data-selected', 'false')
    // BACK clears the selection (the keyboard back affordance).
    typeCommand('BACK')
    for (const flight of FLIGHTS_FIXTURE_PAYLOAD.flights) {
      expect(screen.getByTestId(`flight-row-${flight.id}`)).toHaveAttribute(
        'data-selected',
        'false',
      )
    }
  })

  it('GROUND ALL from the list routes through the confirmation control and renders single-use after', () => {
    render(<ScreenRouter />)
    // The list GROUND ALL and the dedicated control both exist; use the control
    // for the confirmation flow, then confirm the list affordance renders spent.
    expect(screen.getByTestId('list-GROUND-ALL')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('ground-all-button'))
    expect(screen.getByTestId('ground-all-confirm')).toBeInTheDocument()
    expect(flightsSub(getState()).groundAll).toBe(false)
    fireEvent.click(screen.getByTestId('ground-all-confirm-yes'))
    expect(flightsSub(getState()).groundAll).toBe(true)
    // Single-use: the dedicated control renders spent/disabled, and the list
    // GROUND ALL renders disabled too.
    expect((screen.getByTestId('ground-all-spent') as HTMLButtonElement).disabled).toBe(true)
    const listGround = screen.getByTestId('list-GROUND-ALL') as HTMLButtonElement
    expect(listGround.disabled).toBe(true)
  })

  it('StatusLine and the countdown stay visible in the list view AND after toggling to the grid at narrow width', () => {
    render(<ScreenRouter />)
    // List view: StatusLine and the role=timer countdown both present.
    expect(screen.getByTestId('status-line')).toBeInTheDocument()
    expect(screen.getByTestId('flights-countdown')).toBeInTheDocument()
    expect(within(screen.getByTestId('flights-countdown')).getByRole('timer')).toBeInTheDocument()

    // Toggle to the grid at narrow width (a typed command); the status line and
    // countdown remain visible (they live in the screen frame, above the view).
    typeCommand('GRID')
    expect(screen.getByTestId('flights-screen')).toHaveAttribute('data-view', 'grid')
    expect(screen.getByTestId('status-line')).toBeInTheDocument()
    expect(screen.getByTestId('flights-countdown')).toBeInTheDocument()
    expect(within(screen.getByTestId('flights-countdown')).getByRole('timer')).toBeInTheDocument()

    // Back to the list: still visible.
    typeCommand('LIST')
    expect(screen.getByTestId('flights-screen')).toHaveAttribute('data-view', 'list')
    expect(screen.getByTestId('status-line')).toBeInTheDocument()
    expect(screen.getByTestId('flights-countdown')).toBeInTheDocument()
  })
})
