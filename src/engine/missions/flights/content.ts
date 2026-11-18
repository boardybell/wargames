// The payload shape the three GROUND ALL FLIGHTS seeds must satisfy. Only
// the TYPE lives here so the module compiles standalone; the content
// validator functions and the authored payloads are section 02's job.
// Desk-check outcomes deliberately do NOT live here. They stay in the
// shared SeedDefinition.deskChecks table keyed by record id, exactly as
// CRASH OUTLOOK does it.
import type { OutcomeTier } from '../../campaign/types'

/** One of the four fictional hubs. Ids and authored static facts only;
 *  live open/closed truth and runway occupancy live in substate. */
export interface HubDef {
  readonly id: string
  readonly name: string
  /** Runway slots: the integer cap on concurrent inbound landings. */
  readonly runwaySlots: number
  /** Seconds from mission start after which this hub can no longer launch
   *  a departure; a flight still held here at this offset falls to
   *  heldFinal. Integer. */
  readonly lastDepartureOffsetSeconds: number
}

/** One corridor edge between two hubs. The corridor graph is undirected
 *  authored data; a flight uses the corridor connecting its current
 *  position to its target hub. */
export interface CorridorDef {
  readonly id: string
  readonly fromHubId: string
  readonly toHubId: string
  /** The field-report record a PROBE on this corridor runs CHECK SOURCE
   *  against. Engine-owned desk outcome; the module only maps the id. */
  readonly fieldReportRecordId: string
}

/** One flight. Authored static truth only: the live status lives in
 *  substate. */
export interface FlightDef {
  readonly id: string
  readonly originHubId: string
  /** The scheduled destination the flight departs toward. */
  readonly destinationHubId: string
  /** Seconds from mission start the flight departs at. Integer. */
  readonly departureOffsetSeconds: number
  /** Whole-second cruise time along a corridor to any reachable hub,
   *  added to dispatch time to compute the arrival stamp. Integer. */
  readonly cruiseSeconds: number
  /** Souls aboard. Integer, drives passenger aggregation. */
  readonly passengers: number
}

/** The per-position queue delay a DIVERT incurs joining a hub's arrival
 *  queue: slots already occupied map to an added cruise delay in whole
 *  seconds. Index 0 is the first waiting position. */
export type QueueDelayTable = readonly number[]

/** One storm-track step: at this authored offset from mission start, these
 *  hubs and corridors close, and these reopen. Deterministic, seed
 *  authored, advances regardless of player orders. */
export interface StormStep {
  /** Seconds from mission start. Integer. */
  readonly offsetSeconds: number
  readonly closeHubs: readonly string[]
  readonly openHubs: readonly string[]
  readonly closeCorridors: readonly string[]
  readonly openCorridors: readonly string[]
  /** Player-facing forecast line, uppercase terminal diction. */
  readonly warningLine: string
  /** Audio cue id the shell plays for this forecast update. */
  readonly cueId: string
}

/** One projection correction: at this authored offset the displayed
 *  forecast is replaced and exactly one material-change announcement
 *  names the changed corridor or hub. The projection data itself is
 *  authored display content; the engine only tracks how many corrections
 *  have applied. */
export interface ProjectionCorrection {
  readonly offsetSeconds: number
  /** The corridor or hub id whose forecast materially changed. */
  readonly changedId: string
  readonly warningLine: string
  readonly cueId: string
}

/** Passenger-outcome tier thresholds: a flight's final status contributes
 *  its passengers to on-time, late, diverted, stranded, or held buckets;
 *  the integer total of safely-resolved passengers is scored against
 *  these thresholds. */
export interface TierThresholds {
  /** Minimum safely-resolved passengers for FULL. */
  readonly full: number
  /** Minimum for PARTIAL. */
  readonly partial: number
  /** Minimum for POOR; below this is FAILED. */
  readonly poor: number
}

/** The outbound consequence magnitudes this mission emits per tier. */
export type FlightsDisruptedTable = Readonly<Record<OutcomeTier, number>>

export interface FlightsPayload {
  readonly hubs: readonly HubDef[]
  readonly flights: readonly FlightDef[]
  readonly corridors: readonly CorridorDef[]
  readonly queueDelayTable: QueueDelayTable
  readonly stormTrack: readonly StormStep[]
  readonly corrections: readonly ProjectionCorrection[]
  readonly tierThresholds: TierThresholds
  /** Whole seconds past the computed arrival that marks a landing LATE. */
  readonly latenessThresholdSeconds: number
  /** Standard forecast lead margin in whole seconds (30 s standard,
   *  scales proportionally under extended time at the schedule layer). */
  readonly leadMarginSeconds: number
  /** The hub a paymentsDelayed inbound consequence removes one runway
   *  slot from. Pinned per seed so consequence folding stays
   *  order-independent. */
  readonly paymentsDelayedTargetHubId: string
  readonly flightsDisruptedTable: FlightsDisruptedTable
}
