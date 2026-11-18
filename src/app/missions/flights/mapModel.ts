// The pure character-map projection for GROUND ALL FLIGHTS. No React, no DOM,
// no timers, no Date. It reads ONLY the drained flights substate plus the
// immutable payload (and the current selection), and returns the cell matrix
// the CharacterGrid renders plus the legend the MapView shows. Truth (actual
// weather from drained state) renders solid; the authored forecast projection
// renders hatched; the all-hubs restriction marker renders distinct from both.
//
// Critical separation contract: this never inspects the engine event queue and
// never reads undrained truth. A pending (undrained) storm event in the queue
// does not change the output; only the folded substate (closedHubs,
// closedCorridors) and the applied-correction index do. The projection layer is
// payload data (corrections) indexed by state.appliedCorrection, not substate
// copy.
//
// Layout is a collision-free schematic: hubs on the top row, one corridor per
// row beneath (its own segment, so overlapping edges never clobber each other),
// then the all-hubs restriction row, then one flight-marker row. Every cell
// position is a pure function of payload order, so identical payloads map
// identically.
import type { GridCell } from '../../grid'
import type {
  FlightsPayload,
} from '@engine/missions/flights/content'
import type { FlightState, FlightsState } from '@engine/missions/flights/types'
import { isCorridorOpen, isHubOpen } from '@engine/missions/flights/rules'

/** The per-cell class hooks the grid uses. Each names a theme token carrying at
 *  most one shadow layer, per the grid contract. Distinct kinds so a test can
 *  tell current weather (solid) from projection (hatched) from the restriction
 *  marker without reading color. */
export const CELL = {
  empty: 'cell-empty',
  hubOpen: 'cell-hub-open',
  hubClosed: 'cell-hub-closed',
  corridorOpen: 'cell-corridor-open',
  corridorStorm: 'cell-corridor-storm',
  corridorProjection: 'cell-corridor-projection',
  restriction: 'cell-restriction',
  flight: 'cell-flight',
  flightSelected: 'cell-flight-selected',
} as const

/** The characters each kind draws. Solid vs hatched is a glyph difference, not
 *  a color difference, so the distinction survives a monochrome terminal. */
const GLYPH = {
  empty: ' ',
  hubOpenLeft: '[',
  hubOpenRight: ']',
  hubClosedLeft: '{',
  hubClosedRight: '}',
  corridorOpen: '-',
  corridorStorm: '#',
  corridorProjection: ':',
  restriction: '!',
} as const

export interface LegendEntry {
  readonly id: string
  readonly glyph: string
  readonly classHook: string
  readonly label: string
}

export interface MapModel {
  readonly cells: GridCell[][]
  readonly legend: LegendEntry[]
}

const GRID_COLS = 20
/** Column a hub's two-cell bracket starts at. Hubs are spaced four columns
 *  apart along the top row so up to four brackets fit the canvas. */
function hubCol(index: number): number {
  return 1 + index * 4
}

function blankRow(): GridCell[] {
  const row: GridCell[] = []
  for (let c = 0; c < GRID_COLS; c += 1) {
    row.push({ char: GLYPH.empty, classHook: CELL.empty })
  }
  return row
}

function set(row: GridCell[], col: number, cell: GridCell): void {
  if (col < 0 || col >= GRID_COLS) return
  row[col] = cell
}

/** Whether the corridor's forecast is projected to change (hatched): the
 *  authored projection corrections NOT yet applied name this corridor. Read
 *  from payload corrections plus state.appliedCorrection, never from substate
 *  copy and never from the event queue. */
function corridorProjectionPending(
  payload: FlightsPayload,
  state: FlightsState,
  corridorId: string,
): boolean {
  return payload.corrections
    .slice(state.appliedCorrection)
    .some((c) => c.changedId === corridorId)
}

/** Whether the blanket ALL-HUBS restriction is in force: every hub closed at
 *  once (the F06/D-83 fiction), read from drained storm truth only. A single
 *  storm-closed hub is not the blanket order, so the marker stays dark until
 *  the whole field is restricted. With no hubs there is no restriction. */
function allHubsRestricted(
  state: FlightsState,
  payload: FlightsPayload,
): boolean {
  return (
    payload.hubs.length > 0 &&
    payload.hubs.every((hub) => state.closedHubs.includes(hub.id))
  )
}

/** A short status glyph for a flight marker. The status word itself lives in
 *  the readout and list, not the map, so the map stays fixed-width. */
function flightGlyph(status: FlightState['status']): string {
  switch (status) {
    case 'scheduled':
      return 'o'
    case 'airborne':
      return '*'
    case 'held':
    case 'heldFinal':
      return 'H'
    case 'landed':
    case 'landedLate':
    case 'divertedLanded':
      return '='
    case 'stranded':
      return 'x'
    default:
      return '?'
  }
}

/** The ordered flight-marker cell positions in reading order (row-major). The
 *  keyboard cycler in MapView walks exactly this list, so marker-only selection
 *  is defined here, purely, not in the view. Markers occupy one dedicated row,
 *  one column each, in authored flight order. */
export function flightMarkerCells(
  _state: FlightsState,
  payload: FlightsPayload,
): Array<{ flightId: string; row: number; col: number }> {
  const markerRow = flightRowIndex(payload)
  return payload.flights.map((f, index) => ({
    flightId: f.id,
    row: markerRow,
    col: 1 + index * 2,
  }))
}

/** Row indices derived purely from payload size: hubs on row 0, one row per
 *  corridor, the restriction on its own row, then the flight-marker row. */
const HUB_ROW = 0
function corridorRowIndex(index: number): number {
  return 1 + index
}
function restrictionRowIndex(payload: FlightsPayload): number {
  return 1 + payload.corridors.length
}
function flightRowIndex(payload: FlightsPayload): number {
  return restrictionRowIndex(payload) + 1
}

/** The legend, derived from payload data alone (no substate). It enumerates the
 *  cell kinds a player must distinguish: open and closed hubs, open corridors,
 *  storm-closed corridors (current weather, solid), projected-change corridors
 *  (hatched), the all-hubs restriction marker, and the flight statuses. */
export function buildLegend(payload: FlightsPayload): LegendEntry[] {
  if (payload.hubs.length === 0) return []
  return [
    { id: 'hub-open', glyph: `${GLYPH.hubOpenLeft}${GLYPH.hubOpenRight}`, classHook: CELL.hubOpen, label: 'HUB OPEN' },
    { id: 'hub-closed', glyph: `${GLYPH.hubClosedLeft}${GLYPH.hubClosedRight}`, classHook: CELL.hubClosed, label: 'HUB CLOSED' },
    { id: 'corridor-open', glyph: GLYPH.corridorOpen, classHook: CELL.corridorOpen, label: 'CORRIDOR OPEN' },
    { id: 'corridor-storm', glyph: GLYPH.corridorStorm, classHook: CELL.corridorStorm, label: 'STORM CLOSED (CURRENT, SOLID)' },
    { id: 'corridor-projection', glyph: GLYPH.corridorProjection, classHook: CELL.corridorProjection, label: 'PROJECTED CHANGE (HATCHED)' },
    { id: 'restriction', glyph: GLYPH.restriction, classHook: CELL.restriction, label: 'ALL-HUBS RESTRICTION' },
    { id: 'flight-airborne', glyph: '*', classHook: CELL.flight, label: 'FLIGHT AIRBORNE' },
    { id: 'flight-held', glyph: 'H', classHook: CELL.flight, label: 'FLIGHT HELD' },
  ]
}

/** The pure map projection. */
export function buildMapModel(
  state: FlightsState,
  payload: FlightsPayload,
  selectedFlightId: string | null,
): MapModel {
  const rowCount = flightRowIndex(payload) + 1
  const cells: GridCell[][] = []
  for (let r = 0; r < rowCount; r += 1) cells.push(blankRow())

  // Hubs on the top row: a two-cell bracket per hub, open vs closed from
  // drained truth.
  payload.hubs.forEach((hub, index) => {
    const open = isHubOpen(state, hub.id)
    const left = open ? GLYPH.hubOpenLeft : GLYPH.hubClosedLeft
    const right = open ? GLYPH.hubOpenRight : GLYPH.hubClosedRight
    const hook = open ? CELL.hubOpen : CELL.hubClosed
    const col = hubCol(index)
    set(cells[HUB_ROW]!, col, { char: left, classHook: hook })
    set(cells[HUB_ROW]!, col + 1, { char: right, classHook: hook })
  })

  // One corridor per row: a short horizontal segment, solid when storm-closed
  // (current weather), hatched when a pending projection correction names it,
  // open otherwise. Each on its own row so overlapping edges never clobber.
  payload.corridors.forEach((corridor, index) => {
    const row = cells[corridorRowIndex(index)]!
    const stormClosed = !isCorridorOpen(state, corridor.id)
    const projected = corridorProjectionPending(payload, state, corridor.id)
    const char = stormClosed
      ? GLYPH.corridorStorm
      : projected
        ? GLYPH.corridorProjection
        : GLYPH.corridorOpen
    const hook = stormClosed
      ? CELL.corridorStorm
      : projected
        ? CELL.corridorProjection
        : CELL.corridorOpen
    for (let col = 1; col <= 4; col += 1) set(row, col, { char, classHook: hook })
  })

  // The all-hubs restriction marker, distinct from both weather kinds. It
  // lights ONLY on the actual blanket all-hubs restriction (the F06/D-83
  // fiction): every hub restricted at once. A single storm-closed hub is a
  // weather closure the hub bracket already shows; it is NOT the blanket order
  // the glossary term and the D-83 clue are about, so it does not light this
  // marker. The tighter semantics keeps the glyph true to its own definition.
  if (allHubsRestricted(state, payload)) {
    set(cells[restrictionRowIndex(payload)]!, 1, {
      char: GLYPH.restriction,
      classHook: CELL.restriction,
    })
  }

  // Flight markers, one per column in a dedicated row, selection-aware.
  for (const marker of flightMarkerCells(state, payload)) {
    const fs = state.flights[marker.flightId]
    if (!fs) continue
    const selected = marker.flightId === selectedFlightId
    set(cells[marker.row]!, marker.col, {
      char: flightGlyph(fs.status),
      classHook: selected ? CELL.flightSelected : CELL.flight,
    })
  }

  return { cells, legend: buildLegend(payload) }
}
