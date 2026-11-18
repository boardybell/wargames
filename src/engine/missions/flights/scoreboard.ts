// Passenger-outcome aggregation and the held / grounded facts the
// campaign OPEN EXCEPTIONS selector reads. Pure, integer-only. Every held
// flight counts as a WOPR-resolved exception, so the exception count falls
// sharply at a fleet grounding while passenger outcomes worsen; the
// per-held-flight drop lands all at once under GROUND ALL.
import type { FlightsPayload } from './content'
import type { FlightsState } from './types'
import { resolvedPassengers, tallyPassengers } from './rules'
import type { PassengerTally } from './rules'

export interface FlightsScoreboard {
  readonly tally: PassengerTally
  /** Safely-resolved passengers (on time + late + diverted + held). */
  readonly resolved: number
  /** Flights currently held or heldFinal. Each is a WOPR-resolved
   *  exception the campaign exception count subtracts. */
  readonly heldFlights: number
  /** Flights that reached a terminal landing (on time, late, diverted). */
  readonly landedFlights: number
  /** Flights that stranded at timeout. */
  readonly strandedFlights: number
  /** Whether the fleet was blanket-grounded. */
  readonly grounded: boolean
}

export function buildScoreboard(
  payload: FlightsPayload,
  state: FlightsState,
): FlightsScoreboard {
  const tally = tallyPassengers(payload, state)
  let heldFlights = 0
  let landedFlights = 0
  let strandedFlights = 0
  for (const fs of Object.values(state.flights)) {
    if (fs.status === 'held' || fs.status === 'heldFinal') heldFlights += 1
    else if (
      fs.status === 'landed' ||
      fs.status === 'landedLate' ||
      fs.status === 'divertedLanded'
    ) {
      landedFlights += 1
    } else if (fs.status === 'stranded') strandedFlights += 1
  }
  return {
    tally,
    resolved: resolvedPassengers(tally),
    heldFlights,
    landedFlights,
    strandedFlights,
    grounded: state.groundAll,
  }
}
