// The full-parity flight list: every flight as a row, each carrying status,
// conditions, and the SAME action affordances the grid readout offers, built
// from the SAME engine legality selectors. Full parity is the rule: anything
// doable from the grid is doable from the list, which is what keeps the game
// playable at narrow width where the list is the default. Disabled actions show
// their inline rejection reason from the typed engine reasons. Selection is the
// shared state the grid uses, so a row click selects the same flight the map
// marker would. Uppercase terminal diction, no em-dashes.
import type { FlightsPayload } from '@engine/missions/flights/content'
import type { FlightsState } from '@engine/missions/flights/types'
import { TerminalText } from '../../terminal/TerminalText'
import { ActionBar, type ActionBarItem } from '../../terminal/ActionBar'
import { GlossaryTerm } from '../../a11y/GlossaryTerm'
import {
  destinationOptions,
  groundControl,
} from './flightActions'
import {
  makeDivertAction,
  makeGroundAllAction,
  makeHoldAction,
  makeLandAction,
  makeReleaseAction,
} from './verbs'

export interface FlightListViewProps {
  readonly payload: FlightsPayload
  readonly state: FlightsState
  readonly selectedFlightId: string | null
  readonly onSelect: (flightId: string) => void
  /** True once the fleet is grounded, so GROUND ALL renders spent. */
  readonly grounded: boolean
}

/** The conditions line for a flight: its origin hub, that hub's open/closed
 *  truth, and the hub it is actually heading for. Read from drained state only.
 *  For a DIVERTED flight the target is its real inbound hub (fs.inboundHubId),
 *  not the authored destination, so the list agrees with the map and readout
 *  about where the flight is going. */
function conditionsFor(
  payload: FlightsPayload,
  state: FlightsState,
  flightId: string,
): string {
  const flight = payload.flights.find((f) => f.id === flightId)
  if (!flight) return ''
  const fs = state.flights[flightId]
  // The real target: the hub the flight is inbound to or landed at once routed,
  // else its authored destination. A DIVERT sets inboundHubId to the chosen hub,
  // so the list shows that hub, matching the map marker and the readout POSITION.
  const targetHubId = fs?.inboundHubId ?? flight.destinationHubId
  const originClosed = state.closedHubs.includes(flight.originHubId)
  const targetClosed = state.closedHubs.includes(targetHubId)
  return [
    `ORIGIN ${flight.originHubId}${originClosed ? ' (CLOSED)' : ''}`,
    `DEST ${targetHubId}${targetClosed ? ' (CLOSED)' : ''}`,
    `${flight.passengers} PAX`,
  ].join('  ')
}

export function FlightListView({
  payload,
  state,
  selectedFlightId,
  onSelect,
  grounded,
}: FlightListViewProps) {
  return (
    <div data-testid="flight-list-view">
      <div className="flight-list-legend">
        <GlossaryTerm id="flights-corridor" />{' '}
        <GlossaryTerm id="flights-runway-slot" />{' '}
        <GlossaryTerm id="flights-arrival-queue" />
      </div>

      {payload.flights.map((flight) => {
        const fs = state.flights[flight.id]
        const status = fs?.status ?? 'scheduled'
        const selected = flight.id === selectedFlightId
        const options = destinationOptions(payload, state, flight.id)
        const ground = groundControl(payload, state, flight.id)

        const actions: ActionBarItem[] = []
        for (const option of options) {
          const makeAction =
            option.kind === 'LAND' ? makeLandAction : makeDivertAction
          actions.push({
            label: `${option.kind} ${option.hubId}`,
            action: makeAction(flight.id, option.hubId),
            testId: `list-${option.kind}-${flight.id}-${option.hubId}`,
            disabled: !option.legal,
            disabledReason: option.reason,
          })
        }
        actions.push({
          label: 'HOLD',
          action: makeHoldAction(flight.id),
          testId: `list-HOLD-${flight.id}`,
          disabled: !ground.holdLegal,
          disabledReason: ground.holdReason,
        })
        actions.push({
          label: 'RELEASE',
          action: makeReleaseAction(flight.id),
          testId: `list-RELEASE-${flight.id}`,
          disabled: !ground.releaseLegal,
          disabledReason: ground.releaseReason,
        })

        return (
          <div
            key={flight.id}
            data-testid={`flight-row-${flight.id}`}
            data-selected={selected ? 'true' : 'false'}
            data-status={status}
            className={selected ? 'flight-row flight-row-selected' : 'flight-row'}
          >
            <button
              type="button"
              data-testid={`flight-select-${flight.id}`}
              aria-pressed={selected}
              onClick={() => onSelect(flight.id)}
            >
              {`${flight.id}  ${status.toUpperCase()}`}
            </button>
            <TerminalText dim>{conditionsFor(payload, state, flight.id)}</TerminalText>
            <ActionBar actions={actions} />
          </div>
        )
      })}

      {/* GROUND ALL is reachable from the list too (full parity). It renders
          spent and disabled once used. */}
      <ActionBar
        actions={[
          {
            label: grounded ? 'GROUND ALL (SPENT)' : 'GROUND ALL',
            action: makeGroundAllAction(),
            testId: 'list-GROUND-ALL',
            disabled: grounded,
            disabledReason: grounded ? 'ALREADY GROUNDED' : undefined,
          },
        ]}
      />
    </div>
  )
}
