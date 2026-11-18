// Pure routing legality, queue math, storm application, and tiering for
// GROUND ALL FLIGHTS. No engine imports beyond types. Every quantity is an
// integer: whole milliseconds for times, whole seconds for authored cruise
// and delay, whole counts for passengers and slots. Nothing here touches
// Date, Math.random, or timers; the module calls these from validate and
// reduce. Every legality decision is evaluated against drained substate
// (the hub/corridor truth the storm events have already folded in).
import type { OutcomeTier } from '../../campaign/types'
import type {
  CorridorDef,
  FlightDef,
  FlightsPayload,
  HubDef,
  StormStep,
  TierThresholds,
} from './content'
import type { FlightState, FlightStatus, FlightsState } from './types'
import { TERMINAL_FLIGHT_STATUSES } from './types'

export type RouteReason =
  | 'NOT AIRBORNE'
  | 'HUB CLOSED'
  | 'HUB UNKNOWN'
  | 'NO FREE RUNWAY SLOT'
  | 'CORRIDOR CLOSED'
  | 'NO CORRIDOR TO HUB'

export type RouteLegality =
  | { readonly legal: true }
  | { readonly legal: false; readonly reason: RouteReason }

export type HoldReason = 'NOT SCHEDULED' | 'GROUNDED'
export type ReleaseReason = 'NOT HELD' | 'WINDOW CLOSED' | 'GROUNDED'

export type HoldLegality =
  | { readonly legal: true }
  | { readonly legal: false; readonly reason: HoldReason }

export type ReleaseLegality =
  | { readonly legal: true }
  | { readonly legal: false; readonly reason: ReleaseReason }

export function isTerminal(status: FlightStatus): boolean {
  return TERMINAL_FLIGHT_STATUSES.includes(status)
}

export function hubById(
  payload: FlightsPayload,
  hubId: string,
): HubDef | null {
  return payload.hubs.find((h) => h.id === hubId) ?? null
}

export function flightById(
  payload: FlightsPayload,
  flightId: string,
): FlightDef | null {
  return payload.flights.find((f) => f.id === flightId) ?? null
}

export function isHubOpen(state: FlightsState, hubId: string): boolean {
  return !state.closedHubs.includes(hubId)
}

export function isCorridorOpen(state: FlightsState, corridorId: string): boolean {
  return !state.closedCorridors.includes(corridorId)
}

/** The corridor connecting a flight's current position (its origin for a
 *  scheduled destination, or its origin hub otherwise) to a target hub.
 *  Undirected: either endpoint ordering matches. Null when no edge joins
 *  the two hubs. */
export function corridorBetween(
  payload: FlightsPayload,
  fromHubId: string,
  toHubId: string,
): CorridorDef | null {
  return (
    payload.corridors.find(
      (c) =>
        (c.fromHubId === fromHubId && c.toHubId === toHubId) ||
        (c.fromHubId === toHubId && c.toHubId === fromHubId),
    ) ?? null
  )
}

/** The single shared routing legality selector for LAND and DIVERT. The
 *  shell's readout (section 03) must call THIS function. Legal only when
 *  the flight is airborne, the target hub is known and open with a free
 *  runway slot, and a corridor from the flight's origin to that hub is
 *  open. Evaluated against drained substate. */
export function routeLegality(
  payload: FlightsPayload,
  state: FlightsState,
  flightId: string,
  targetHubId: string,
): RouteLegality {
  const flight = flightById(payload, flightId)
  const flightState = state.flights[flightId]
  if (!flight || !flightState) return { legal: false, reason: 'NO CORRIDOR TO HUB' }
  if (flightState.status !== 'airborne') {
    return { legal: false, reason: 'NOT AIRBORNE' }
  }
  const hub = hubById(payload, targetHubId)
  if (!hub) return { legal: false, reason: 'HUB UNKNOWN' }
  if (!isHubOpen(state, targetHubId)) {
    return { legal: false, reason: 'HUB CLOSED' }
  }
  const used = state.runwayUse[targetHubId] ?? 0
  if (used >= hub.runwaySlots) {
    return { legal: false, reason: 'NO FREE RUNWAY SLOT' }
  }
  const corridor = corridorBetween(payload, flight.originHubId, targetHubId)
  if (!corridor) return { legal: false, reason: 'NO CORRIDOR TO HUB' }
  if (!isCorridorOpen(state, corridor.id)) {
    return { legal: false, reason: 'CORRIDOR CLOSED' }
  }
  return { legal: true }
}

/** HOLD is legal only while a flight is scheduled and the fleet is not
 *  grounded. A blanket grounding has already held every scheduled flight,
 *  so an individual HOLD after GROUND ALL is a no-op rejection. */
export function holdLegality(
  state: FlightsState,
  flightId: string,
): HoldLegality {
  const flightState = state.flights[flightId]
  if (!flightState || flightState.status !== 'scheduled') {
    return { legal: false, reason: 'NOT SCHEDULED' }
  }
  if (state.groundAll) return { legal: false, reason: 'GROUNDED' }
  return { legal: true }
}

/** RELEASE is legal only while a flight is held, the fleet is not grounded
 *  (GROUND ALL blocks individual releases for the rest of the mission),
 *  and the flight's origin hub last-departure window has not closed. The
 *  window closes via a seed-authored `flightsWindow` scheduled event the
 *  engine materializes (and scales under extended time); the module folds
 *  that into closedWindowHubs, so no scale math lives here. */
export function releaseLegality(
  payload: FlightsPayload,
  state: FlightsState,
  flightId: string,
): ReleaseLegality {
  const flightState = state.flights[flightId]
  if (!flightState || flightState.status !== 'held') {
    return { legal: false, reason: 'NOT HELD' }
  }
  if (state.groundAll) return { legal: false, reason: 'GROUNDED' }
  const flight = flightById(payload, flightId)
  if (flight && state.closedWindowHubs.includes(flight.originHubId)) {
    return { legal: false, reason: 'WINDOW CLOSED' }
  }
  return { legal: true }
}

/** The projected arrival stamp for a LAND: dispatch time plus the flight's
 *  whole-second cruise time, in ms. */
export function landingArrivalAt(flight: FlightDef, now: number): number {
  return now + flight.cruiseSeconds * 1000
}

/** The projected arrival stamp for a DIVERT: cruise time plus the authored
 *  positional queue delay for the slot the flight joins. The positional
 *  delay is indexed by current runway occupancy; positions past the table
 *  reuse its last entry so a deep queue never under-delays. */
export function divertArrivalAt(
  payload: FlightsPayload,
  state: FlightsState,
  flight: FlightDef,
  targetHubId: string,
  now: number,
): number {
  const used = state.runwayUse[targetHubId] ?? 0
  const table = payload.queueDelayTable
  const delaySeconds =
    table.length === 0
      ? 0
      : (table[Math.min(used, table.length - 1)] ?? 0)
  return now + (flight.cruiseSeconds + delaySeconds) * 1000
}

/** Apply one storm step's close and open sets to hub and corridor truth.
 *  Opens win over closes within a single step (a step that both closes and
 *  opens the same id leaves it open), matching a forecast that supersedes
 *  itself in one update. Pure: returns the new closed sets. */
export function applyStormStep(
  state: FlightsState,
  step: StormStep,
): Pick<FlightsState, 'closedHubs' | 'closedCorridors'> {
  const hubs = new Set(state.closedHubs)
  for (const id of step.closeHubs) hubs.add(id)
  for (const id of step.openHubs) hubs.delete(id)
  const corridors = new Set(state.closedCorridors)
  for (const id of step.closeCorridors) corridors.add(id)
  for (const id of step.openCorridors) corridors.delete(id)
  return {
    closedHubs: [...hubs].sort(),
    closedCorridors: [...corridors].sort(),
  }
}

export interface PassengerTally {
  readonly onTime: number
  readonly late: number
  readonly diverted: number
  readonly stranded: number
  readonly held: number
}

export function emptyTally(): PassengerTally {
  return { onTime: 0, late: 0, diverted: 0, stranded: 0, held: 0 }
}

/** Aggregate passenger outcomes from final flight statuses. Integer sums
 *  by bucket; a held (non-final) flight counts as held, a heldFinal flight
 *  counts as held too (it never flew). */
export function tallyPassengers(
  payload: FlightsPayload,
  state: FlightsState,
): PassengerTally {
  const byId = new Map(payload.flights.map((f) => [f.id, f]))
  let onTime = 0
  let late = 0
  let diverted = 0
  let stranded = 0
  let held = 0
  for (const [id, fs] of Object.entries(state.flights)) {
    const flight = byId.get(id)
    if (!flight) continue
    const p = flight.passengers
    switch (fs.status) {
      case 'landed':
        onTime += p
        break
      case 'landedLate':
        late += p
        break
      case 'divertedLanded':
        diverted += p
        break
      case 'stranded':
        stranded += p
        break
      case 'held':
      case 'heldFinal':
        held += p
        break
      default:
        break
    }
  }
  return { onTime, late, diverted, stranded, held }
}

/** Safely-resolved passengers: everyone who reached a hub (on time, late,
 *  or diverted) plus everyone safely held on the ground. Stranded
 *  passengers are the loss the scoring penalizes. */
export function resolvedPassengers(tally: PassengerTally): number {
  return tally.onTime + tally.late + tally.diverted + tally.held
}

/** The tier ladder, shared by every settlement cause. Integer resolved
 *  passengers against authored thresholds. */
export function tierFromResolved(
  resolved: number,
  thresholds: TierThresholds,
): OutcomeTier {
  if (resolved >= thresholds.full) return 'full'
  if (resolved >= thresholds.partial) return 'partial'
  if (resolved >= thresholds.poor) return 'poor'
  return 'failed'
}

/** Map a corridor id to its authored field-report record id, the record a
 *  PROBE runs CHECK SOURCE against. Null for an unknown corridor. Pure
 *  sugar; the shell dispatches the campaign REQUEST_SOURCE_CHECK with this
 *  id, the mission writes nothing to the mission queue. */
export function buildTargetRecordId(
  payload: FlightsPayload,
  corridorId: string,
): string | null {
  return (
    payload.corridors.find((c) => c.id === corridorId)?.fieldReportRecordId ??
    null
  )
}

/** A fresh per-flight state at init: scheduled, nothing inbound. */
export function initialFlightState(): FlightState {
  return {
    status: 'scheduled',
    inboundHubId: null,
    arrivalAt: null,
    onTimeAt: null,
    settled: false,
  }
}
