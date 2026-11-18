// The payload shape the three GROUND ALL FLIGHTS seeds must satisfy. Only
// the TYPE lives here so the module compiles standalone; the content
// validator functions and the authored payloads are section 02's job.
// Desk-check outcomes deliberately do NOT live here. They stay in the
// shared SeedDefinition.deskChecks table keyed by record id, exactly as
// CRASH OUTLOOK does it.
import type { OutcomeTier } from '../../campaign/types'
import type { EvidenceRecord } from '../../records'
import { isIndependentObservation, buildRecordGraph } from '../../records'
import type { ClueRecordEntry, DeskCheckEntry } from '../types'
import type { ScheduledEventSpec } from '../../time'

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
 *  have applied. The correction also carries the flight it most affects
 *  and that flight's authored last-safe-decision offset, so the content
 *  validator can prove the correction lands with at least leadMargin of
 *  decision room before the flight must be committed. */
export interface ProjectionCorrection {
  readonly offsetSeconds: number
  /** The corridor or hub id whose forecast materially changed. */
  readonly changedId: string
  /** The flight whose routing this correction bears on. */
  readonly affectedFlightId: string
  /** Seconds from mission start by which the affected flight must be
   *  routed or held for the corrected forecast to matter. Integer. */
  readonly lastSafeDecisionAtSeconds: number
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

// ── Content validation ──────────────────────────────────────────────
// A PURE authoring gate for GROUND ALL FLIGHTS, the analogue of CRASH
// OUTLOOK's validateOutlookContent. It never throws: it returns a list of
// structured ContentError entries so one CI run names every authoring
// mistake. Invariants 1, 3, 4, 5, and 6 from the section plan are validator
// rules here; invariant 2 (solvability) needs the module lifecycle and lives
// in solvability.test.ts.

/** The per-seed expected record and run anchors. The fixture seed's anchors
 *  are the canonical F06 / C17 / R04 / W02 / 21:14 values; seeds two and
 *  three supply their own equivalents. One table so the validator and the
 *  tests share a single source of truth. */
export interface FlightsSeedAnchors {
  /** The exercise run stamp the all-hubs restriction inherits (R04). */
  readonly runId: string
  /** The DERIVED all-hubs restriction record: the suspiciously-early
   *  blanket grounding (F06). Carries the D-83 clue. */
  readonly restrictionRecordId: string
  /** The EXERCISE root the restriction's ancestry reaches (C17). */
  readonly exerciseRootRecordId: string
  /** The OBSERVED field report naming local weather and an open corridor,
   *  the record a PROBE on the open corridor confirms (W02). Independent of
   *  the exercise run. */
  readonly openCorridorReportRecordId: string
  /** The OBSERVED field report whose optimistic "clear" claim the desk
   *  CONTRADICTS, so a PROBE on the storm-closed corridor reads CLOSED. The
   *  truthful counter to the blanket restriction: the storm-closed corridor's
   *  evidence never tells the player it is clear. Independent of the exercise
   *  run (W05 and its seed equivalents). */
  readonly closedCorridorReportRecordId: string
  /** The D-83 clue id the restriction record is designated for. */
  readonly clueId: string
  /** The corridor whose field report is the open-corridor record. */
  readonly openCorridorId: string
  /** The storm-closed corridor whose field report reads CLOSED. */
  readonly closedCorridorId: string
  /** Verbatim event clock the restriction embeds (21:14:08). */
  readonly restrictionEventClock: string
  /** Verbatim receipt clock the restriction embeds (21:14:52). */
  readonly restrictionReceiptClock: string
}

export type FlightsContentErrorCode =
  | 'HUB_COUNT'
  | 'FLIGHT_COUNT'
  | 'CORRIDOR_GRAPH'
  | 'PROJECTION_PRESENT'
  | 'DILEMMA'
  | 'CORRECTION_LEAD'
  | 'STORM_ARRIVAL_SEPARATION'
  | 'RESTRICTION_PROVENANCE'
  | 'DECOY_INDEPENDENCE'
  | 'DESKCHECK_MISSING'
  | 'CORRIDOR_REPORT_MISSING'
  | 'CORRIDOR_EVIDENCE_MISMATCH'
  | 'CLUE_RECORD_MISSING'
  | 'TUNING_INTEGER'
  | 'PIN_HUB'
  | 'JSON_ROUNDTRIP'

export interface FlightsContentError {
  readonly code: FlightsContentErrorCode
  readonly detail: string
}

/** The dilemma threshold the opening-dilemma invariant uses: a queue delay
 *  at or above this many whole seconds makes DIVERT a real cost, so the
 *  open hub is a congested alternative, not a free landing. Shared by the
 *  validator and the content test so one number governs both. */
export const DILEMMA_QUEUE_DELAY_THRESHOLD_SECONDS = 15

function isFiniteInteger(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n)
}

/** One deterministic arrival derived from authored data or a replayed
 *  script: the hub it lands at, the corridor it crossed, and the whole-ms
 *  stamp it resolves. Section 04 reuses this shape for its same-second
 *  separation guard. */
export interface DerivedArrival {
  readonly flightId: string
  readonly hubId: string
  readonly corridorId: string | null
  /** Whole seconds from mission start. */
  readonly offsetSeconds: number
}

/** The authored-data arrivals: every flight flown straight to its scheduled
 *  destination, dispatched at its departure offset, no queue (position 0).
 *  A pure helper exported beside the validator so invariant 4 and section
 *  04's separation guard share one derivation. Diverts and holds are script
 *  decisions, not authored truth, so this covers the authored baseline; the
 *  solvability tests feed script-derived arrivals to the same separation
 *  helper. */
export function authoredArrivals(payload: FlightsPayload): DerivedArrival[] {
  const out: DerivedArrival[] = []
  for (const flight of payload.flights) {
    const corridor = payload.corridors.find(
      (c) =>
        (c.fromHubId === flight.originHubId &&
          c.toHubId === flight.destinationHubId) ||
        (c.fromHubId === flight.destinationHubId &&
          c.toHubId === flight.originHubId),
    )
    out.push({
      flightId: flight.id,
      hubId: flight.destinationHubId,
      corridorId: corridor?.id ?? null,
      offsetSeconds: flight.departureOffsetSeconds + flight.cruiseSeconds,
    })
  }
  return out
}

/** The separation rule, factored out so section 04 reuses it: a storm step
 *  that closes or opens a hub or corridor must not fall within one second of
 *  any arrival it could affect (an arrival at that hub, or across that
 *  corridor). Returns the offending pairs as error details. */
export function stormArrivalCollisions(
  stormTrack: readonly StormStep[],
  arrivals: readonly DerivedArrival[],
): string[] {
  const collisions: string[] = []
  for (const step of stormTrack) {
    const touchedHubs = new Set<string>([...step.closeHubs, ...step.openHubs])
    const touchedCorridors = new Set<string>([
      ...step.closeCorridors,
      ...step.openCorridors,
    ])
    for (const arrival of arrivals) {
      const affectsHub = touchedHubs.has(arrival.hubId)
      const affectsCorridor =
        arrival.corridorId !== null && touchedCorridors.has(arrival.corridorId)
      if (!affectsHub && !affectsCorridor) continue
      if (Math.abs(step.offsetSeconds - arrival.offsetSeconds) < 1) {
        collisions.push(
          `storm step at ${step.offsetSeconds}s shares a second with arrival ${arrival.flightId} at ${arrival.offsetSeconds}s`,
        )
      }
    }
  }
  return collisions
}

/** Walk a record's parentId chain to its deepest resolvable ancestor,
 *  carrying a visited set so a cycle or dangling parent terminates. */
function traceRoot(
  records: readonly EvidenceRecord[],
  startId: string,
): EvidenceRecord | null {
  const byId = new Map(records.map((r) => [r.id, r]))
  let current = byId.get(startId) ?? null
  if (!current) return null
  const visited = new Set<string>([current.id])
  while (current.parentId !== null) {
    if (visited.has(current.parentId)) break
    const parent = byId.get(current.parentId)
    if (!parent) break
    visited.add(parent.id)
    current = parent
  }
  return current
}

/** Does any storm step close this hub? The projected-storm-path test. */
function hubInStormPath(stormTrack: readonly StormStep[], hubId: string): boolean {
  return stormTrack.some((s) => s.closeHubs.includes(hubId))
}

/** Validate authored flights content. Empty array means valid. Pure over
 *  all inputs; the record graph, deskChecks, clueRecords, and schedule are
 *  threaded in so the provenance, desk-coverage, and integer rules run
 *  against the real shared tables. */
export function validateFlightsContent(
  payload: FlightsPayload,
  records: readonly EvidenceRecord[],
  deskChecks: readonly DeskCheckEntry[],
  clueRecords: readonly ClueRecordEntry[],
  schedule: readonly ScheduledEventSpec[],
  anchors: FlightsSeedAnchors,
): FlightsContentError[] {
  const errors: FlightsContentError[] = []

  // Rule (invariant 1, structure): exactly four hubs and eight flights.
  if (payload.hubs.length !== 4) {
    errors.push({
      code: 'HUB_COUNT',
      detail: `expected 4 hubs, found ${payload.hubs.length}`,
    })
  }
  if (payload.flights.length !== 8) {
    errors.push({
      code: 'FLIGHT_COUNT',
      detail: `expected 8 flights, found ${payload.flights.length}`,
    })
  }

  // Rule: the corridor graph is connected over the authored hubs (every hub
  // reachable from the first by undirected corridor edges).
  if (payload.hubs.length > 0) {
    const hubIds = new Set(payload.hubs.map((h) => h.id))
    const adjacency = new Map<string, string[]>()
    for (const hub of payload.hubs) adjacency.set(hub.id, [])
    for (const corridor of payload.corridors) {
      if (hubIds.has(corridor.fromHubId) && hubIds.has(corridor.toHubId)) {
        adjacency.get(corridor.fromHubId)!.push(corridor.toHubId)
        adjacency.get(corridor.toHubId)!.push(corridor.fromHubId)
      }
    }
    const seen = new Set<string>()
    const stack = [payload.hubs[0]!.id]
    while (stack.length > 0) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      for (const next of adjacency.get(id) ?? []) {
        if (!seen.has(next)) stack.push(next)
      }
    }
    if (seen.size !== payload.hubs.length) {
      errors.push({
        code: 'CORRIDOR_GRAPH',
        detail: `corridor graph not connected: reached ${seen.size} of ${payload.hubs.length} hubs`,
      })
    }
  }

  // Rule: the authored projection is present with at least one divergence
  // point (a correction naming a changed id).
  if (payload.corrections.length < 1) {
    errors.push({
      code: 'PROJECTION_PRESENT',
      detail: 'no projection correction authored (need at least one divergence point)',
    })
  }

  // Rule (invariant 1, dilemma): at least one hub inside the projected storm
  // path with a free slot at mission start, and at least one hub the storm
  // leaves open; a queue delay at or above the dilemma threshold makes the
  // open hub a congested alternative rather than a free landing.
  const stormPathWithSlot = payload.hubs.find(
    (h) => hubInStormPath(payload.stormTrack, h.id) && h.runwaySlots > 0,
  )
  const openHub = payload.hubs.find(
    (h) => !hubInStormPath(payload.stormTrack, h.id),
  )
  const maxQueueDelay =
    payload.queueDelayTable.length === 0
      ? 0
      : Math.max(...payload.queueDelayTable)
  if (!stormPathWithSlot) {
    errors.push({
      code: 'DILEMMA',
      detail: 'no hub inside the projected storm path with a free runway slot at start',
    })
  }
  if (!openHub) {
    errors.push({
      code: 'DILEMMA',
      detail: 'no hub the storm track leaves open',
    })
  }
  if (maxQueueDelay < DILEMMA_QUEUE_DELAY_THRESHOLD_SECONDS) {
    errors.push({
      code: 'DILEMMA',
      detail: `queue delay ${maxQueueDelay}s below dilemma threshold ${DILEMMA_QUEUE_DELAY_THRESHOLD_SECONDS}s; DIVERT is a free landing`,
    })
  }

  // Rule (invariant 3 + M1, real correction lead): every correction fires at
  // least leadMargin before the affected flight's last-safe-decision, which
  // must equal that flight's REAL commit time (departure offset + cruise, the
  // moment it reaches the junction it is being warned about), not merely the
  // origin-hub window. A forecast that arrives after the flight has already
  // had to decide is worthless, so this ties the lead to the actual decision.
  const flightById = new Map(payload.flights.map((f) => [f.id, f]))
  for (const correction of payload.corrections) {
    const flight = flightById.get(correction.affectedFlightId)
    if (!flight) {
      errors.push({
        code: 'CORRECTION_LEAD',
        detail: `correction affects unknown flight ${correction.affectedFlightId}`,
      })
      continue
    }
    const realCommit = flight.departureOffsetSeconds + flight.cruiseSeconds
    if (correction.lastSafeDecisionAtSeconds !== realCommit) {
      errors.push({
        code: 'CORRECTION_LEAD',
        detail: `flight ${flight.id} last-safe-decision ${correction.lastSafeDecisionAtSeconds}s is not its real commit time ${realCommit}s (departure ${flight.departureOffsetSeconds}s + cruise ${flight.cruiseSeconds}s)`,
      })
    }
    if (
      correction.offsetSeconds >
      correction.lastSafeDecisionAtSeconds - payload.leadMarginSeconds
    ) {
      errors.push({
        code: 'CORRECTION_LEAD',
        detail: `correction at ${correction.offsetSeconds}s leaves under ${payload.leadMarginSeconds}s before flight ${flight.id} real commit ${correction.lastSafeDecisionAtSeconds}s`,
      })
    }
    const originHub = payload.hubs.find((h) => h.id === flight.originHubId)
    if (
      originHub &&
      correction.lastSafeDecisionAtSeconds > originHub.lastDepartureOffsetSeconds
    ) {
      errors.push({
        code: 'CORRECTION_LEAD',
        detail: `flight ${flight.id} last-safe-decision ${correction.lastSafeDecisionAtSeconds}s runs past its origin window ${originHub.lastDepartureOffsetSeconds}s`,
      })
    }
  }

  // Rule (invariant 4, storm/arrival separation): no storm transition shares
  // a second with any authored arrival it could affect.
  for (const detail of stormArrivalCollisions(
    payload.stormTrack,
    authoredArrivals(payload),
  )) {
    errors.push({ code: 'STORM_ARRIVAL_SEPARATION', detail })
  }

  // Rule (invariant 5, records): the restriction record is DERIVED with run
  // ancestry reaching the EXERCISE root at the exercise run; the open-corridor
  // field report passes isIndependentObservation against the exercise run;
  // the clueRecords table designates the restriction record for the D-83 clue.
  const graph = buildRecordGraph(records)
  const restriction = records.find((r) => r.id === anchors.restrictionRecordId)
  if (!restriction) {
    errors.push({
      code: 'RESTRICTION_PROVENANCE',
      detail: `restriction record ${anchors.restrictionRecordId} not in the record graph`,
    })
  } else {
    if (restriction.origin !== 'DERIVED') {
      errors.push({
        code: 'RESTRICTION_PROVENANCE',
        detail: `restriction ${restriction.id} origin ${restriction.origin}, not DERIVED`,
      })
    }
    const root = traceRoot(records, restriction.id)
    if (!root || root.id !== anchors.exerciseRootRecordId) {
      errors.push({
        code: 'RESTRICTION_PROVENANCE',
        detail: `restriction ${restriction.id} ancestry reaches ${root?.id ?? 'nothing'}, not the exercise root ${anchors.exerciseRootRecordId}`,
      })
    } else if (root.origin !== 'EXERCISE' || root.runId !== anchors.runId) {
      errors.push({
        code: 'RESTRICTION_PROVENANCE',
        detail: `exercise root ${root.id} origin ${root.origin} run ${String(root.runId)}, expected EXERCISE run ${anchors.runId}`,
      })
    }
  }
  const decoyVerdict = isIndependentObservation(
    graph,
    anchors.openCorridorReportRecordId,
    anchors.runId,
  )
  if (!decoyVerdict.independent) {
    errors.push({
      code: 'DECOY_INDEPENDENCE',
      detail: `open-corridor report ${anchors.openCorridorReportRecordId} is not independent of run ${anchors.runId}: ${decoyVerdict.reason}`,
    })
  }
  const clueEntry = clueRecords.find(
    (e) => e.recordId === anchors.restrictionRecordId && e.clueId === anchors.clueId,
  )
  if (!clueEntry) {
    errors.push({
      code: 'CLUE_RECORD_MISSING',
      detail: `clueRecords has no { ${anchors.restrictionRecordId}, ${anchors.clueId} } entry`,
    })
  }

  // Rule: every record id the payload references has a deskChecks row, and
  // every corridor's field-report record exists in the graph with a row.
  const deskIds = new Set(deskChecks.map((d) => d.recordId))
  const deskByRecord = new Map(deskChecks.map((d) => [d.recordId, d]))
  const recordIds = new Set(records.map((r) => r.id))
  // The set of corridor ids the storm track genuinely closes at some step.
  const stormClosedCorridors = new Set<string>()
  for (const step of payload.stormTrack) {
    for (const id of step.closeCorridors) stormClosedCorridors.add(id)
  }
  for (const corridor of payload.corridors) {
    if (!recordIds.has(corridor.fieldReportRecordId)) {
      errors.push({
        code: 'CORRIDOR_REPORT_MISSING',
        detail: `corridor ${corridor.id} field report ${corridor.fieldReportRecordId} absent from the record graph`,
      })
    }
    const desk = deskByRecord.get(corridor.fieldReportRecordId)
    if (!desk) {
      errors.push({
        code: 'DESKCHECK_MISSING',
        detail: `corridor ${corridor.id} field report ${corridor.fieldReportRecordId} has no deskChecks row`,
      })
      continue
    }
    // Rule (H2, truthful evidence): a corridor's field report must resolve to
    // its ACTUAL state. A corridor the storm closes reads CLOSED (its
    // optimistic "clear" claim desk-CONTRADICTED); an open corridor reads
    // CLEAR (desk CONFIRMED). Probing the storm-closed corridor must never
    // tell the player it is clear, and probing the open corridor must never
    // tell the player it is shut: the evidence can never contradict the storm
    // track and so can never tell the player to do the opposite of the win.
    const closed = stormClosedCorridors.has(corridor.id)
    const expected = closed ? 'CONTRADICTED' : 'CONFIRMED'
    if (desk.outcome !== expected) {
      errors.push({
        code: 'CORRIDOR_EVIDENCE_MISMATCH',
        detail: `corridor ${corridor.id} is ${closed ? 'storm-closed' : 'open'} but its field report ${corridor.fieldReportRecordId} resolves ${desk.outcome}, expected ${expected}`,
      })
    }
  }
  if (!deskIds.has(anchors.restrictionRecordId)) {
    errors.push({
      code: 'DESKCHECK_MISSING',
      detail: `restriction record ${anchors.restrictionRecordId} has no deskChecks row`,
    })
  }

  // Rule (invariant 6, integers and pins): every numeric tuning value in the
  // payload, the storm track, and the schedule is a finite integer; the
  // paymentsDelayed target hub names an existing hub; the payload JSON
  // round-trips strict-equal.
  const numericChecks: Array<[string, unknown]> = [
    ['latenessThresholdSeconds', payload.latenessThresholdSeconds],
    ['leadMarginSeconds', payload.leadMarginSeconds],
    ['tierThresholds.full', payload.tierThresholds.full],
    ['tierThresholds.partial', payload.tierThresholds.partial],
    ['tierThresholds.poor', payload.tierThresholds.poor],
  ]
  for (const hub of payload.hubs) {
    numericChecks.push([`hub ${hub.id} runwaySlots`, hub.runwaySlots])
    numericChecks.push([
      `hub ${hub.id} lastDepartureOffsetSeconds`,
      hub.lastDepartureOffsetSeconds,
    ])
  }
  for (const flight of payload.flights) {
    numericChecks.push([`flight ${flight.id} departure`, flight.departureOffsetSeconds])
    numericChecks.push([`flight ${flight.id} cruise`, flight.cruiseSeconds])
    numericChecks.push([`flight ${flight.id} passengers`, flight.passengers])
  }
  payload.queueDelayTable.forEach((d, i) =>
    numericChecks.push([`queueDelayTable[${i}]`, d]),
  )
  for (const step of payload.stormTrack) {
    numericChecks.push([`storm step ${step.offsetSeconds} offset`, step.offsetSeconds])
  }
  for (const correction of payload.corrections) {
    numericChecks.push([`correction ${correction.offsetSeconds} offset`, correction.offsetSeconds])
    numericChecks.push([
      `correction ${correction.affectedFlightId} lastSafeDecision`,
      correction.lastSafeDecisionAtSeconds,
    ])
  }
  for (const tier of ['full', 'partial', 'poor', 'failed'] as const) {
    numericChecks.push([
      `flightsDisruptedTable.${tier}`,
      payload.flightsDisruptedTable[tier],
    ])
  }
  for (const spec of schedule) {
    numericChecks.push([`schedule ${spec.id} offset`, spec.offsetSeconds])
  }
  for (const [label, value] of numericChecks) {
    if (!isFiniteInteger(value)) {
      errors.push({
        code: 'TUNING_INTEGER',
        detail: `${label} must be a finite integer, found ${String(value)}`,
      })
    }
  }
  if (!payload.hubs.some((h) => h.id === payload.paymentsDelayedTargetHubId)) {
    errors.push({
      code: 'PIN_HUB',
      detail: `paymentsDelayed target ${payload.paymentsDelayedTargetHubId} names no authored hub`,
    })
  }
  try {
    const round = JSON.parse(JSON.stringify(payload)) as unknown
    if (JSON.stringify(round) !== JSON.stringify(payload)) {
      errors.push({ code: 'JSON_ROUNDTRIP', detail: 'payload is not JSON stable' })
    }
  } catch {
    errors.push({ code: 'JSON_ROUNDTRIP', detail: 'payload is not JSON-safe' })
  }

  return errors
}
