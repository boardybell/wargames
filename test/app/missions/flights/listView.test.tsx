// The flight list: full parity with the grid. All eight flights, each with
// status, conditions, and the SAME action rows (LAND/DIVERT targets, HOLD,
// RELEASE) built from the engine legality selectors, with inline reasons for
// disabled actions. Selection syncs both ways with the grid; narrow width
// defaults to the list; the grid/list toggle persists across a remount via the
// UI preference store.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { init, send } from '@app/state'
import { ScreenRouter } from '@app/screens'
import { registerDefaultVerbs } from '@app/terminal'
import { resetAll } from '../../screens/harness'
import { createCampaign, advanceCampaign, dispatch } from '@engine/campaign/engine'
import type { CampaignState, EngineContext } from '@engine'
import { FlightListView } from '@app/missions/flights/FlightListView'
import { MapView } from '@app/missions/flights/MapView'
import { registerFlightsGlossary } from '@app/missions/flights/glossary'
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

function stateAt(ctx: EngineContext, atMs: number): CampaignState {
  let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, T0)
  state = dispatch(ctx, state, { type: 'START_MISSION', missionId: 'flights' }, T0).state
  if (atMs > T0) state = advanceCampaign(ctx, state, atMs).state
  return state
}

let teardown: () => void

beforeEach(() => {
  resetAll()
  __resetFlightsView()
  setNarrow(false)
  vi.spyOn(Date, 'now').mockReturnValue(T0)
  registerDefaultVerbs()
  registerFlightsGlossary()
})

afterEach(() => {
  __resetFlightsView()
  vi.restoreAllMocks()
  cleanup()
})

describe('FlightListView', () => {
  it('lists all eight flights with status and conditions', () => {
    const ctx = makeFlightsCtx()
    const sub = flightsSub(stateAt(ctx, T0 + 35_000))
    render(
      <FlightListView
        payload={FLIGHTS_FIXTURE_PAYLOAD}
        state={sub}
        selectedFlightId={null}
        onSelect={() => {}}
        grounded={false}
      />,
    )
    for (const flight of FLIGHTS_FIXTURE_PAYLOAD.flights) {
      const row = screen.getByTestId(`flight-row-${flight.id}`)
      expect(row).toBeInTheDocument()
      // Status attribute present.
      expect(row).toHaveAttribute('data-status')
      // Conditions carry the origin hub and passenger count.
      expect(row.textContent).toContain(flight.originHubId)
      expect(row.textContent).toContain(`${flight.passengers} PAX`)
    }
    expect(FLIGHTS_FIXTURE_PAYLOAD.flights).toHaveLength(8)
  })

  it('each row carries full action rows: LAND/DIVERT targets, HOLD/RELEASE as legal; disabled actions show inline reasons from the typed rejection reasons', () => {
    const ctx = makeFlightsCtx()
    const sub = flightsSub(stateAt(ctx, T0 + 35_000))
    render(
      <FlightListView
        payload={FLIGHTS_FIXTURE_PAYLOAD}
        state={sub}
        selectedFlightId={null}
        onSelect={() => {}}
        grounded={false}
      />,
    )
    // Every flight row offers a LAND/DIVERT affordance per hub plus HOLD and
    // RELEASE.
    for (const flight of FLIGHTS_FIXTURE_PAYLOAD.flights) {
      const row = screen.getByTestId(`flight-row-${flight.id}`)
      expect(within(row).getByTestId(`list-HOLD-${flight.id}`)).toBeInTheDocument()
      expect(within(row).getByTestId(`list-RELEASE-${flight.id}`)).toBeInTheDocument()
      // One routing affordance per hub (LAND for its own destination, DIVERT
      // for the rest).
      let routeButtons = 0
      for (const hub of FLIGHTS_FIXTURE_PAYLOAD.hubs) {
        const land = within(row).queryByTestId(`list-LAND-${flight.id}-${hub.id}`)
        const divert = within(row).queryByTestId(`list-DIVERT-${flight.id}-${hub.id}`)
        if (land || divert) routeButtons += 1
      }
      expect(routeButtons).toBe(FLIGHTS_FIXTURE_PAYLOAD.hubs.length)
    }
    // A disabled action shows an inline reason. A scheduled flight cannot LAND
    // (NOT AIRBORNE). Render a slightly earlier state (15s) where flights that
    // depart at 20s/30s are still scheduled, and assert the reason renders.
    const earlySub = flightsSub(stateAt(ctx, T0 + 15_000))
    cleanup()
    render(
      <FlightListView
        payload={FLIGHTS_FIXTURE_PAYLOAD}
        state={earlySub}
        selectedFlightId={null}
        onSelect={() => {}}
        grounded={false}
      />,
    )
    const scheduled = FLIGHTS_FIXTURE_PAYLOAD.flights.find(
      (f) => earlySub.flights[f.id]?.status === 'scheduled',
    )!
    const row = screen.getByTestId(`flight-row-${scheduled.id}`)
    // Its own destination LAND button is disabled with the engine's NOT
    // AIRBORNE reason shown inline.
    const landBtn = within(row).getByTestId(
      `list-LAND-${scheduled.id}-${scheduled.destinationHubId}`,
    ) as HTMLButtonElement
    expect(landBtn.disabled).toBe(true)
    expect(
      within(row).getByTestId(
        `list-LAND-${scheduled.id}-${scheduled.destinationHubId}-reason`,
      ).textContent,
    ).toContain('NOT AIRBORNE')
  })

  it('a WRONG divert is possible (not auto-correct): an airborne flight offers a DIVERT to a hub that is not its destination, enabled', () => {
    const ctx = makeFlightsCtx()
    const sub = flightsSub(stateAt(ctx, T0 + 35_000))
    const airborne = FLIGHTS_FIXTURE_PAYLOAD.flights.find(
      (f) => sub.flights[f.id]?.status === 'airborne',
    )!
    render(
      <FlightListView
        payload={FLIGHTS_FIXTURE_PAYLOAD}
        state={sub}
        selectedFlightId={null}
        onSelect={() => {}}
        grounded={false}
      />,
    )
    const row = screen.getByTestId(`flight-row-${airborne.id}`)
    // A DIVERT to a NON-destination hub exists and is enabled: the player can
    // route wrong. The engine must accept it (legal routing, wrong strategy).
    const wrongHub = FLIGHTS_FIXTURE_PAYLOAD.hubs.find(
      (h) => h.id !== airborne.destinationHubId,
    )
    let foundEnabledWrongDivert = false
    for (const hub of FLIGHTS_FIXTURE_PAYLOAD.hubs) {
      if (hub.id === airborne.destinationHubId) continue
      const btn = within(row).queryByTestId(
        `list-DIVERT-${airborne.id}-${hub.id}`,
      ) as HTMLButtonElement | null
      if (btn && !btn.disabled) foundEnabledWrongDivert = true
    }
    expect(wrongHub).toBeTruthy()
    expect(foundEnabledWrongDivert).toBe(true)
  })

  it('a diverted flight: the list conditions and the map readout agree on the real inbound target, not the authored destination', () => {
    const ctx = makeFlightsCtx()
    // WX101 (authored MERIDIAN -> CASCADE) is airborne at 35s. DIVERT it to
    // SABLE, a hub that is NOT its destination, through the real engine.
    let state = stateAt(ctx, T0 + 35_000)
    expect(flightsSub(state).flights['WX101']?.status).toBe('airborne')
    state = dispatch(
      ctx,
      state,
      { type: 'MISSION_ACTION', payload: { kind: 'DIVERT', flightId: 'WX101', hubId: 'SABLE' } },
      T0 + 35_000,
    ).state
    const sub = flightsSub(state)
    // The engine routed the flight to SABLE, not its authored CASCADE.
    expect(sub.flights['WX101']?.inboundHubId).toBe('SABLE')
    expect(FLIGHTS_FIXTURE_PAYLOAD.flights.find((f) => f.id === 'WX101')!.destinationHubId).toBe(
      'CASCADE',
    )

    // The list conditions line shows the real inbound target SABLE.
    const list = render(
      <FlightListView
        payload={FLIGHTS_FIXTURE_PAYLOAD}
        state={sub}
        selectedFlightId="WX101"
        onSelect={() => {}}
        grounded={false}
      />,
    )
    const row = screen.getByTestId('flight-row-WX101')
    expect(row.textContent).toContain('DEST SABLE')
    // It does NOT advertise the authored destination as the target anymore.
    expect(row.textContent).not.toContain('DEST CASCADE')
    list.unmount()

    // The map readout POSITION agrees: it shows SABLE, the same inbound hub.
    render(
      <MapView
        payload={FLIGHTS_FIXTURE_PAYLOAD}
        state={sub}
        selectedFlightId="WX101"
        onSelect={() => {}}
        now={state.lastNow}
        deadline={state.activeMission?.endsAt ?? null}
      />,
    )
    const readout = screen.getByTestId('flight-readout')
    expect(readout.textContent).toContain('POSITION SABLE')
  })

  it('selection syncs grid -> list and list -> grid through the shared screen state', () => {
    registerFlightsScreen()
    teardown = init({
      ctx: makeFlightsCtx(),
      seedName: 'test-seed',
      port: { read: () => null, write: () => {}, remove: () => {} },
    })
    act(() => {
      send({ type: 'START_MISSION', missionId: 'flights' })
    })
    render(<ScreenRouter />)
    // Default (wide) is the grid; selecting a flight marker then switching to
    // the list keeps the same selection.
    const input = screen.getByTestId('command-input') as HTMLInputElement
    const type = (text: string) => {
      act(() => {
        fireEvent.change(input, { target: { value: text } })
        fireEvent.submit(screen.getByTestId('command-form'))
      })
    }
    type('SELECT WX101')
    type('LIST')
    const row = screen.getByTestId('flight-row-WX101')
    expect(row).toHaveAttribute('data-selected', 'true')
    // list -> grid: select a different flight from the list, back to the grid,
    // and the map reflects it (the readout shows the new flight).
    fireEvent.click(screen.getByTestId('flight-select-WX103'))
    type('GRID')
    expect(screen.getByTestId('flight-readout')).toHaveAttribute('data-flight-id', 'WX103')
    teardown()
  })

  it('narrow viewport defaults to the list view', () => {
    setNarrow(true)
    registerFlightsScreen()
    teardown = init({
      ctx: makeFlightsCtx(),
      seedName: 'test-seed',
      port: { read: () => null, write: () => {}, remove: () => {} },
    })
    act(() => {
      send({ type: 'START_MISSION', missionId: 'flights' })
    })
    render(<ScreenRouter />)
    expect(screen.getByTestId('flights-screen')).toHaveAttribute('data-view', 'list')
    expect(screen.getByTestId('flight-list-view')).toBeInTheDocument()
    teardown()
  })

  it('grid/list toggle persists via UI preferences across remount', () => {
    registerFlightsScreen()
    teardown = init({
      ctx: makeFlightsCtx(),
      seedName: 'test-seed',
      port: { read: () => null, write: () => {}, remove: () => {} },
    })
    act(() => {
      send({ type: 'START_MISSION', missionId: 'flights' })
    })
    const first = render(<ScreenRouter />)
    // Wide default is grid; the player explicitly switches to the list.
    expect(screen.getByTestId('flights-screen')).toHaveAttribute('data-view', 'grid')
    fireEvent.click(screen.getByTestId('flights-tab-list'))
    expect(screen.getByTestId('flights-screen')).toHaveAttribute('data-view', 'list')
    first.unmount()
    // Remount: the explicit list preference persists over the wide default.
    render(<ScreenRouter />)
    expect(screen.getByTestId('flights-screen')).toHaveAttribute('data-view', 'list')
    teardown()
  })
})
