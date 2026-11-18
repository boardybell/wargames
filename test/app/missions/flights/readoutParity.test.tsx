// The load-bearing parity test: the destination set the readout OFFERS must
// strict-equal the set the ENGINE legality selector accepts, using the SAME
// selector import (routeLegality), compared with deepStrictEqual. No legality
// logic is duplicated in the shell; the readout calls the engine selector, and
// this test calls the identical function to build the expected set.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { init, send } from '@app/state'
import { registerDefaultVerbs } from '@app/terminal'
import { resetAll } from '../../screens/harness'
import { createCampaign, advanceCampaign, dispatch } from '@engine/campaign/engine'
import type { CampaignState, EngineContext } from '@engine'
import { routeLegality } from '@engine/missions/flights/rules'
import { MapView } from '@app/missions/flights/MapView'
import { registerFlightsScreen } from '@app/missions/flights/FlightsScreen'
import { __resetFlightsView } from '@app/missions/flights/selectors'
import {
  FLIGHTS_FIXTURE_PAYLOAD,
  makeFlightsCtx,
  flightsSub,
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
})

afterEach(() => {
  teardown()
  __resetFlightsView()
  vi.restoreAllMocks()
  cleanup()
})

/** Drive a fresh campaign to a chosen time, returning the state. Used to build
 *  a variety of drained substates (airborne, storm-closed, grounded). */
function stateAt(ctx: EngineContext, atMs: number): CampaignState {
  let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, T0)
  state = dispatch(ctx, state, { type: 'START_MISSION', missionId: 'flights' }, T0).state
  if (atMs > T0) state = advanceCampaign(ctx, state, atMs).state
  return state
}

/** The destination hub ids the readout offers as legal (enabled) LAND/DIVERT
 *  affordances, read off the rendered buttons. */
function offeredDestinations(): string[] {
  const readout = screen.getByTestId('flight-readout')
  const ids: string[] = []
  for (const hub of FLIGHTS_FIXTURE_PAYLOAD.hubs) {
    for (const kind of ['LAND', 'DIVERT'] as const) {
      const btn = within(readout).queryByTestId(`readout-${kind}-${hub.id}`)
      if (btn && !(btn as HTMLButtonElement).disabled) ids.push(hub.id)
    }
  }
  return ids.sort()
}

describe('readout-validator parity', () => {
  it('for each state fixture, the offered destination set strict-equals the set the engine legality selector accepts (same selector import)', () => {
    const ctx = makeFlightsCtx()
    // A spread of drained states: just started, past the first departures, and
    // past a storm closure, so routeLegality returns a variety of verdicts.
    for (const atMs of [T0, T0 + 35_000, T0 + 85_000]) {
      const state = stateAt(ctx, atMs)
      const sub = flightsSub(state)
      // Pick an airborne flight when one exists, else any flight.
      const airborne = FLIGHTS_FIXTURE_PAYLOAD.flights.find(
        (f) => sub.flights[f.id]?.status === 'airborne',
      )
      const flight = airborne ?? FLIGHTS_FIXTURE_PAYLOAD.flights[0]!

      const { unmount } = render(
        <MapView
          payload={FLIGHTS_FIXTURE_PAYLOAD}
          state={sub}
          selectedFlightId={flight.id}
          onSelect={() => {}}
          now={state.lastNow}
          deadline={state.activeMission?.endsAt ?? null}
        />,
      )

      const offered = offeredDestinations()
      const expected = FLIGHTS_FIXTURE_PAYLOAD.hubs
        .filter((hub) => routeLegality(FLIGHTS_FIXTURE_PAYLOAD, sub, flight.id, hub.id).legal)
        .map((hub) => hub.id)
        .sort()
      expect(offered).toStrictEqual(expected)
      unmount()
    }
  })

  it('readout shows the selected flight hub, runway availability, and viable destinations', () => {
    const ctx = makeFlightsCtx()
    const state = stateAt(ctx, T0 + 35_000)
    const sub = flightsSub(state)
    const airborne = FLIGHTS_FIXTURE_PAYLOAD.flights.find(
      (f) => sub.flights[f.id]?.status === 'airborne',
    )!
    render(
      <MapView
        payload={FLIGHTS_FIXTURE_PAYLOAD}
        state={sub}
        selectedFlightId={airborne.id}
        onSelect={() => {}}
        now={state.lastNow}
        deadline={state.activeMission?.endsAt ?? null}
      />,
    )
    const readout = screen.getByTestId('flight-readout')
    expect(readout).toHaveAttribute('data-flight-id', airborne.id)
    // Runway availability per hub is shown.
    expect(within(readout).getByTestId('readout-runways')).toBeInTheDocument()
    for (const hub of FLIGHTS_FIXTURE_PAYLOAD.hubs) {
      expect(within(readout).getByTestId(`readout-runway-${hub.id}`)).toBeInTheDocument()
    }
    // The viable destination list is present with at least one enabled option.
    expect(within(readout).getByTestId('readout-destinations')).toBeInTheDocument()
    expect(offeredDestinations().length).toBeGreaterThan(0)
  })

  it('projected arrival renders beside the deadline for airborne flights, including when projected arrival is past the deadline (informed gamble)', () => {
    const ctx = makeFlightsCtx()
    // Near the deadline: an airborne flight routed now would arrive past it, so
    // the readout must still OFFER the destination and mark it a gamble, never
    // auto-correct it away. Drive close to endsAt (240s) so cruise (60s) pushes
    // arrival past the deadline.
    const state = stateAt(ctx, T0 + 200_000)
    const sub = flightsSub(state)
    const airborne = FLIGHTS_FIXTURE_PAYLOAD.flights.find(
      (f) => sub.flights[f.id]?.status === 'airborne',
    )
    // If none still airborne at 200s, dispatch one into the air via a fresh
    // early state instead; but with 240s duration and 60s cruise, a flight that
    // departed at 10s and was never routed is still airborne at 200s.
    expect(airborne).toBeTruthy()
    render(
      <MapView
        payload={FLIGHTS_FIXTURE_PAYLOAD}
        state={sub}
        selectedFlightId={airborne!.id}
        onSelect={() => {}}
        now={state.lastNow}
        deadline={state.activeMission?.endsAt ?? null}
      />,
    )
    const arrivals = screen.getByTestId('readout-arrivals')
    expect(arrivals).toBeInTheDocument()
    // At least one destination shows ARRIVES / DEADLINE beside each other.
    expect(arrivals.textContent).toContain('ARRIVES')
    expect(arrivals.textContent).toContain('DEADLINE')
    // And a past-deadline destination is flagged as a gamble, still offered.
    const gambled = within(arrivals)
      .queryAllByText(/PAST DEADLINE/)
    expect(gambled.length).toBeGreaterThan(0)
  })
})
