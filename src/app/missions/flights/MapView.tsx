// The map pane: the character grid of the airspace, the legend, and the
// selected-flight readout. The grid renders the pure mapModel output. Keyboard
// selection is MARKER-ONLY: arrow keys cycle through the flight-marker cells in
// reading order (computed by flightMarkerCells), wrapping at the ends; hub and
// corridor cells are never selectable. A tap on a flight marker selects it; a
// tap on an empty, hub, or corridor cell does not change selection. Selection
// state is owned by FlightsScreen so the list shares it.
//
// The readout derives its viable destination set from the ENGINE legality
// selector (destinationOptions -> routeLegality), never a reimplementation, and
// shows projected arrival beside the deadline for an airborne flight so the
// gamble is informed even when the projection lands late.
import { useEffect, useMemo, useReducer } from 'react'
import { remainingFor, subscribeTick } from '../../state'
import { CharacterGrid } from '../../grid'
import { TerminalText } from '../../terminal/TerminalText'
import { ActionBar, type ActionBarItem } from '../../terminal/ActionBar'
import { GlossaryTerm } from '../../a11y/GlossaryTerm'
import type { FlightsPayload } from '@engine/missions/flights/content'
import type { FlightsState } from '@engine/missions/flights/types'
import { buildMapModel, flightMarkerCells } from './mapModel'
import {
  destinationOptions,
  groundControl,
  projectedArrivalAt,
} from './flightActions'
import {
  makeDivertAction,
  makeHoldAction,
  makeLandAction,
  makeReleaseAction,
} from './verbs'

export interface MapViewProps {
  readonly payload: FlightsPayload
  readonly state: FlightsState
  readonly selectedFlightId: string | null
  readonly onSelect: (flightId: string) => void
  /** The drained engine clock the state was last folded to, for projected
   *  arrival math. Never a wall-clock read. */
  readonly now: number
  /** The active deadline in engine time, for the gamble readout. */
  readonly deadline: number | null
}

function formatMs(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function MapView({
  payload,
  state,
  selectedFlightId,
  onSelect,
  now,
  deadline,
}: MapViewProps) {
  const model = useMemo(
    () => buildMapModel(state, payload, selectedFlightId),
    [state, payload, selectedFlightId],
  )
  const markers = useMemo(
    () => flightMarkerCells(state, payload),
    [state, payload],
  )

  // The grid selection cell is the selected flight's marker cell, so the grid
  // highlights it. Keyboard cycling is marker-only: we translate an arrow move
  // into the next/previous marker in reading order, never a free cursor.
  const selectedIndex = markers.findIndex((m) => m.flightId === selectedFlightId)
  const selection =
    selectedIndex >= 0
      ? { row: markers[selectedIndex]!.row, col: markers[selectedIndex]!.col }
      : null

  const cycle = (delta: number): void => {
    if (markers.length === 0) return
    const base = selectedIndex >= 0 ? selectedIndex : delta > 0 ? -1 : 0
    const next = (base + delta + markers.length) % markers.length
    onSelect(markers[next]!.flightId)
  }

  // Grid onSelect gives us a (row, col). Marker-only: select a flight only when
  // the tapped cell is a marker cell; otherwise ignore. Arrow keys arrive here
  // too (the grid clamps to a neighbor cell), so we additionally bind keydown
  // on the wrapper to do reading-order cycling.
  const onGridSelect = (row: number, col: number): void => {
    const marker = markers.find((m) => m.row === row && m.col === col)
    if (marker) onSelect(marker.flightId)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      event.stopPropagation()
      cycle(1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      cycle(-1)
    }
  }

  return (
    <div data-testid="map-view">
      {/* The keydown wrapper enforces marker-only cycling before the grid's own
          free-cursor handler runs. COUPLING: this depends on the capture phase
          running before CharacterGrid's bubble-phase onKeyDown. onKeyDownCapture
          fires on the way DOWN (parent before child), so onKeyDown here handles
          the arrow first and stopPropagation() keeps the event from reaching the
          grid's bubble-phase handler, which would otherwise move a free cursor.
          If CharacterGrid ever moves its own key handling to the capture phase,
          ordering flips and free-cursor selection returns; the keyboard test
          (MapView.keyboard.test.tsx) guards the regression but the dependency is
          implicit, so it is documented here. */}
      <div data-testid="map-grid-wrap" onKeyDownCapture={onKeyDown}>
        <CharacterGrid
          id="flights-map"
          cells={model.cells}
          selection={selection}
          onSelect={onGridSelect}
          legend={
            <ul data-testid="map-legend-list" className="flights-legend">
              {model.legend.map((entry) => (
                <li
                  key={entry.id}
                  data-testid={`legend-${entry.id}`}
                  data-class-hook={entry.classHook}
                >
                  <span className={entry.classHook}>{entry.glyph}</span>{' '}
                  {entry.label}
                </li>
              ))}
            </ul>
          }
        />
      </div>

      <Readout
        payload={payload}
        state={state}
        selectedFlightId={selectedFlightId}
        now={now}
        deadline={deadline}
      />
    </div>
  )
}

function Readout({
  payload,
  state,
  selectedFlightId,
  now,
  deadline,
}: {
  readonly payload: FlightsPayload
  readonly state: FlightsState
  readonly selectedFlightId: string | null
  readonly now: number
  readonly deadline: number | null
}) {
  if (selectedFlightId === null) {
    return (
      <div data-testid="flight-readout" data-flight-id="">
        <TerminalText dim>SELECT A FLIGHT TO SEE ITS OPTIONS.</TerminalText>
      </div>
    )
  }
  const flight = payload.flights.find((f) => f.id === selectedFlightId)
  const fs = state.flights[selectedFlightId]
  if (!flight || !fs) {
    return (
      <div data-testid="flight-readout" data-flight-id={selectedFlightId}>
        <TerminalText dim>FLIGHT UNKNOWN.</TerminalText>
      </div>
    )
  }

  // Re-render on every display tick so the gamble readout's T+ figures track
  // the SAME display clock the role=timer Countdown reads, never state.lastNow
  // (which only moves on a fold). Without this, the deadline T+ here and the
  // live countdown visibly disagree between folds.
  const [, repaint] = useReducer((n: number) => n + 1, 0)
  useEffect(() => subscribeTick(repaint), [])

  const options = destinationOptions(payload, state, selectedFlightId)
  const ground = groundControl(payload, state, selectedFlightId)
  const airborne = fs.status === 'airborne'

  // The current hub or position: the hub it is inbound to when routed, else its
  // origin hub (for a scheduled or held flight) or AIRBORNE when en route with
  // no destination chosen.
  const position =
    fs.inboundHubId ?? (airborne ? 'AIRBORNE (NO DESTINATION)' : flight.originHubId)

  const actions: ActionBarItem[] = []
  for (const option of options) {
    const makeAction = option.kind === 'LAND' ? makeLandAction : makeDivertAction
    actions.push({
      label: `${option.kind} ${option.hubId}`,
      action: makeAction(selectedFlightId, option.hubId),
      testId: `readout-${option.kind}-${option.hubId}`,
      disabled: !option.legal,
      disabledReason: option.reason,
    })
  }
  actions.push({
    label: 'HOLD',
    action: makeHoldAction(selectedFlightId),
    testId: 'readout-HOLD',
    disabled: !ground.holdLegal,
    disabledReason: ground.holdReason,
  })
  actions.push({
    label: 'RELEASE',
    action: makeReleaseAction(selectedFlightId),
    testId: 'readout-RELEASE',
    disabled: !ground.releaseLegal,
    disabledReason: ground.releaseReason,
  })

  return (
    <div data-testid="flight-readout" data-flight-id={selectedFlightId}>
      <TerminalText>
        {[
          `FLIGHT ${flight.id}  ${fs.status.toUpperCase()}`,
          `POSITION ${position}`,
          `${flight.passengers} PASSENGERS`,
        ].join('\n')}
      </TerminalText>

      <div data-testid="readout-runways">
        <GlossaryTerm id="flights-runway-slot" /> FREE:{' '}
        {options.map((o) => (
          <span key={o.hubId} data-testid={`readout-runway-${o.hubId}`}>
            {o.hubId} {o.runwayFree}
            {'  '}
          </span>
        ))}
      </div>

      {/* The informed-gamble readout: for an airborne flight, projected arrival
          beside the deadline at EVERY offered destination, so a divert that
          lands late is visibly a gamble, not auto-corrected away. */}
      {airborne && deadline !== null ? (
        <div data-testid="readout-arrivals">
          {options.map((o) => {
            const proj = projectedArrivalAt(
              payload,
              state,
              selectedFlightId,
              o.hubId,
              now,
            )
            if (!proj) return null
            // The late flag is an absolute, clock-independent comparison. The
            // displayed T+ offsets, by contrast, are measured from the SAME
            // display clock the Countdown uses (deadline minus its live
            // remaining), so projected-arrival T+ and deadline T+ never
            // visibly diverge from the role=timer between folds.
            const late = proj.arrivalAt > deadline
            const displayNow = deadline - remainingFor(deadline)
            return (
              <div
                key={o.hubId}
                data-testid={`readout-arrival-${o.hubId}`}
                data-late={late ? 'true' : 'false'}
              >
                {`${o.kind} ${o.hubId}: ARRIVES T+${formatMs(
                  proj.arrivalAt - displayNow,
                )}  DEADLINE T+${formatMs(deadline - displayNow)}`}
                {late ? '  PAST DEADLINE (GAMBLE)' : ''}
              </div>
            )
          })}
        </div>
      ) : null}

      <div data-testid="readout-destinations">
        <TerminalText dim>VIABLE DESTINATIONS:</TerminalText>
        <ActionBar actions={actions} />
      </div>
    </div>
  )
}
