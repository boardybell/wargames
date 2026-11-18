// Shared, pure helpers that shape the per-flight action rows for BOTH the
// readout panel and the flight list, so the two paths never diverge. These hold
// NO legality logic of their own: every legal/illegal decision comes from the
// engine selectors (routeLegality, holdLegality, releaseLegality) imported from
// src/engine/missions/flights/rules.ts. That is the parity contract: the shell
// offers exactly what the engine accepts, proven by deepStrictEqual in the
// readout-parity test.
import type { FlightsPayload } from '@engine/missions/flights/content'
import type { FlightsState } from '@engine/missions/flights/types'
import {
  divertArrivalAt,
  flightById,
  holdLegality,
  landingArrivalAt,
  releaseLegality,
  routeLegality,
  type RouteReason,
} from '@engine/missions/flights/rules'

export interface DestinationOption {
  readonly hubId: string
  readonly hubName: string
  /** LAND when the hub is the flight's own destination, DIVERT otherwise. */
  readonly kind: 'LAND' | 'DIVERT'
  readonly legal: boolean
  /** The engine rejection reason when not legal; undefined when legal. */
  readonly reason?: RouteReason
  /** Runway slots free at this hub right now (for the readout runway column). */
  readonly runwayFree: number
}

/** Every hub as a routing option for a flight, each judged by the ENGINE
 *  routeLegality selector. LAND for the flight's own destination hub, DIVERT for
 *  the rest. The viable subset (legal === true) is the readout's offered
 *  destination set; the parity test compares it against the same selector. */
export function destinationOptions(
  payload: FlightsPayload,
  state: FlightsState,
  flightId: string,
): DestinationOption[] {
  const flight = flightById(payload, flightId)
  return payload.hubs.map((hub) => {
    const legality = routeLegality(payload, state, flightId, hub.id)
    const used = state.runwayUse[hub.id] ?? 0
    const runwayFree = Math.max(0, hub.runwaySlots - used)
    return {
      hubId: hub.id,
      hubName: hub.name,
      kind: flight && hub.id === flight.destinationHubId ? 'LAND' : 'DIVERT',
      legal: legality.legal,
      reason: legality.legal ? undefined : legality.reason,
      runwayFree,
    }
  })
}

/** The viable (legal) destination hub ids for a flight, in payload hub order.
 *  This is exactly the set the engine legality selector accepts. */
export function viableDestinationHubIds(
  payload: FlightsPayload,
  state: FlightsState,
  flightId: string,
): string[] {
  return destinationOptions(payload, state, flightId)
    .filter((o) => o.legal)
    .map((o) => o.hubId)
}

export interface GroundControlRow {
  readonly holdLegal: boolean
  readonly holdReason?: string
  readonly releaseLegal: boolean
  readonly releaseReason?: string
}

/** HOLD/RELEASE legality for a flight, straight from the engine selectors. */
export function groundControl(
  payload: FlightsPayload,
  state: FlightsState,
  flightId: string,
): GroundControlRow {
  const h = holdLegality(state, flightId)
  const r = releaseLegality(payload, state, flightId)
  return {
    holdLegal: h.legal,
    holdReason: h.legal ? undefined : h.reason,
    releaseLegal: r.legal,
    releaseReason: r.legal ? undefined : r.reason,
  }
}

/** Projected arrival and the on-time baseline for an airborne flight that has
 *  not yet been routed, at a candidate hub. Used by the readout to show the
 *  gamble: projected arrival beside the deadline, even when it lands late. Pure
 *  engine math (landingArrivalAt / divertArrivalAt), evaluated at the drained
 *  clock the state was last folded to. */
export function projectedArrivalAt(
  payload: FlightsPayload,
  state: FlightsState,
  flightId: string,
  hubId: string,
  now: number,
): { arrivalAt: number; onTimeAt: number } | null {
  const flight = flightById(payload, flightId)
  if (!flight) return null
  return {
    arrivalAt: divertArrivalAt(payload, state, flight, hubId, now),
    onTimeAt: landingArrivalAt(flight, now),
  }
}
