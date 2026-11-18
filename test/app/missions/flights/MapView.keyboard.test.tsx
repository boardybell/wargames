// Marker-only selection on the map. Arrow keys cycle the flight markers in
// reading order, wrapping at the ends; hub and corridor cells are never
// selectable by keyboard; a tap selects a flight marker only, and a tap on an
// empty, hub, or corridor cell does not change selection.
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createCampaign, dispatch } from '@engine/campaign/engine'
import type { CampaignState, EngineContext } from '@engine'
import { MapView } from '@app/missions/flights/MapView'
import { registerFlightsGlossary } from '@app/missions/flights/glossary'
import { flightMarkerCells } from '@app/missions/flights/mapModel'
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

function started(ctx: EngineContext): CampaignState {
  let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, T0)
  state = dispatch(ctx, state, { type: 'START_MISSION', missionId: 'flights' }, T0).state
  return state
}

beforeEach(() => {
  setNarrow(false)
  vi.spyOn(Date, 'now').mockReturnValue(T0)
  registerFlightsGlossary()
})

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

/** A controlled MapView harness recording the current selection. Selection is
 *  real component state so a re-render reflects each onSelect, exactly like the
 *  FlightsScreen owner does. */
function renderMap(initial: string | null) {
  const ctx = makeFlightsCtx()
  const sub = flightsSub(started(ctx))
  const calls: string[] = []
  function Harness() {
    const [selected, setSelected] = useState<string | null>(initial)
    return (
      <MapView
        payload={FLIGHTS_FIXTURE_PAYLOAD}
        state={sub}
        selectedFlightId={selected}
        onSelect={(id) => {
          calls.push(id)
          setSelected(id)
        }}
        now={T0}
        deadline={T0 + 240_000}
      />
    )
  }
  const utils = render(<Harness />)
  const markers = flightMarkerCells(sub, FLIGHTS_FIXTURE_PAYLOAD)
  return { ...utils, calls, markers, sub }
}

describe('marker-only selection', () => {
  it('arrow keys cycle flight markers only, in reading order (row-major next marker), wrapping at the end', () => {
    const { calls, markers } = renderMap(null)
    const grid = screen.getByRole('grid')
    // First ArrowRight from no selection lands on the first marker.
    fireEvent.keyDown(grid, { key: 'ArrowRight' })
    expect(calls[calls.length - 1]).toBe(markers[0]!.flightId)
    // A sequence of forward moves walks the marker list in reading order and
    // wraps at the end back to the first.
    const seen: string[] = []
    for (let i = 0; i < markers.length; i += 1) {
      fireEvent.keyDown(grid, { key: 'ArrowRight' })
      seen.push(calls[calls.length - 1]!)
    }
    // After the first landed on markers[0], the next N forward moves cycle
    // markers[1], markers[2], ..., wrapping to markers[0].
    const expected = markers.map((m, i) => markers[(i + 1) % markers.length]!.flightId)
    expect(seen).toEqual(expected)
  })

  it('hub and corridor cells are never selectable by keyboard', () => {
    const { calls } = renderMap(null)
    const grid = screen.getByRole('grid')
    // Every keyboard move resolves to a FLIGHT marker id, never a hub or
    // corridor cell. Drive a batch of arrows and assert each call is a flight.
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      fireEvent.keyDown(grid, { key })
    }
    const flightIds = new Set(FLIGHTS_FIXTURE_PAYLOAD.flights.map((f) => f.id))
    for (const call of calls) expect(flightIds.has(call)).toBe(true)
  })

  it('tap/click selects flight markers only; taps on empty, hub, or corridor cells do not change selection', () => {
    const { calls, markers } = renderMap(null)
    // Tap the first marker cell: it selects that flight.
    const first = markers[0]!
    const markerCell = document.getElementById(`flights-map-cell-${first.row}-${first.col}`)!
    fireEvent.pointerDown(markerCell)
    expect(calls[calls.length - 1]).toBe(first.flightId)

    const before = calls.length
    // Tap a hub cell (top row) and a corridor cell (a corridor row): no change.
    const hubCell = document.getElementById('flights-map-cell-0-1')! // a hub bracket
    fireEvent.pointerDown(hubCell)
    const corridorCell = document.getElementById('flights-map-cell-1-1')! // a corridor segment
    fireEvent.pointerDown(corridorCell)
    // An empty cell too.
    const emptyCell = document.getElementById('flights-map-cell-0-19')!
    fireEvent.pointerDown(emptyCell)
    expect(calls.length).toBe(before)
  })
})
