# Section 01: Module and Rules (Engine Core)

## Overview

Mission 2 of SHALL WE PLAY A GAME? is GROUND ALL FLIGHTS, a live character-map air-traffic puzzle. This section builds the entire engine side of the mission: the state types with a reference-only save schema, the pure rules module (legality, queue math, storm application, tiering), the scoreboard aggregation, and the MissionModule wiring. No authored seed content and no UI belongs here; this section works against minimal hand-built test fixtures.

Dependencies: none within this plan. It requires the campaign engine from earlier splits to already exist, including the `terminal()` evaluate path and the `clueRecords` mechanism. This section blocks sections 02 (content and seeds), 03 (screen and map), and 04 (fixtures and polish).

Target test command: `npm test` (typescript-npm project).

## Binding Engine Contracts (background you must honor)

The campaign engine provides pure MissionModules with this surface: `init`, `schedule`, `validate`, `reduce`, `evaluate`, `debrief`, `saveSchema`, and an optional `clues()`. Key contracts:

- `dispatch` and `advanceToNow` return `{ state, emitted }`. Events drain in `(scheduledAt, id)` order. Events with `scheduledAt <= endsAt` resolve BEFORE the timeout settlement guard in the same `advanceToNow` call. Every legality decision is evaluated against drained state.
- CHECK SOURCE is engine-owned: `REQUEST_SOURCE_CHECK` goes on the campaign queue, authored outcomes live in the shared `SeedDefinition.deskChecks` table keyed by record id, and replies arrive as `sourceCheckResolved` events with `arrivedAfterSettlement` support. The mission never schedules or draws these itself.
- `INSPECT_RECORD` is a campaign action. The D-83 clue is engine-owned via `SeedDefinition.clueRecords`: the restriction record (the F06 equivalent, a DERIVED record with run ancestry) is a designated clue record, so inspecting it logs the clue and highlights it for the finale with no mission involvement. The flights module carries no inspection flag and defines no `clues()` for this; the campaign action never reaches mission reduce. (An earlier draft gave the module a `restrictionInspected` flag; that is superseded. Do not add one.)
- Integer math everywhere. Substates are reference-only: mutable facts in substate, authored content stays in the immutable payload.
- Content for this mission lives in `SeedDefinition.missionPayloads.flights` plus `SeedDefinition.stormTrack` (authored in section 02; this section only defines the types).

## Files to Create

    src/engine/missions/flights/types.ts        state types + valibot saveSchema (reference-only)
    src/engine/missions/flights/content.ts      FlightsPayload type ONLY (validators arrive in section 02)
    src/engine/missions/flights/rules.ts        legality, queue math, storm application, tiering
    src/engine/missions/flights/scoreboard.ts   passenger outcome aggregation + held/ground facts
    src/engine/missions/flights/module.ts       MissionModule implementation + registry entry
    test/engine/missions/flights/               all tests below, plus a minimal fixture payload helper

Also register the module under mission id `flights` in whatever engine mission registry the earlier splits established.

## Tests First

Write these before implementation. Engine tests run in the node project. Stubs describe what to assert, not how; build one minimal fixture payload (a few hubs, a handful of flights, a tiny corridor graph, a short storm track) in the test directory to drive them. The real three-seed payloads arrive in section 02.

Types and reference-only split (`test/engine/missions/flights/types.test.ts`):

- saveSchema round-trips a substate; the schema rejects authored content (hub names, passenger counts, projection data) smuggled into substate.
- Status lifecycle guard: statuses only move forward. `scheduled -> airborne` or `scheduled -> held`; `held -> scheduled` only via RELEASE while the window is open; terminal states absorb all transitions.

Legality and windows (`rules.test.ts`):

- Legality tables for LAND and DIVERT: legal only when the flight is airborne, the target hub is open with a free runway slot, and the connecting corridor is open, all evaluated at drained state. Typed rejection reasons for each failure mode.
- HOLD legal only while the flight's status is scheduled; RELEASE legal only while held and the flight's last-departure offset has not passed.
- A held flight becomes `heldFinal` (terminal) when its last-departure offset passes.
- Same-call race: a HOLD dispatched with `now` already past the departure event's `scheduledAt` resolves by drain-then-reduce ordering (the departure drains first, the HOLD then rejects). Test both orderings of the race.

GROUND ALL (`groundAll.test.ts`):

- Single-use: a second dispatch rejects as a provable no-op.
- Holds every scheduled flight at once; blocks all subsequent departures and individual RELEASEs for the rest of the mission.
- Does NOT trigger early completion; the clock runs to `endsAt`.
- Fixture proving the trade: scoreboard exceptions fall sharply (every held flight counts as a WOPR-resolved exception) while the passenger outcome aggregate worsens.

Arrivals and the buzzer (`arrivals.test.ts`):

- A dispatched LAND or DIVERT is legal regardless of projected arrival time.
- An arrival event with `scheduledAt <= endsAt` resolves the landing, marked late past the authored lateness threshold.
- A computed arrival past `endsAt` leaves the flight airborne; it strands at timeout.
- Buzzer boundary fixture: an arrival exactly at `endsAt` lands and counts before the timeout settlement guard; the same arrival one tick later strands.

Storm and projection separation (`storm.test.ts`):

- Scheduled storm truth events close and open hubs and corridors from the storm track.
- Reducers never read the projection (spy or structural proof: the reducer code path takes truth state only).
- The display-model inputs never include undrained truth (structural proof on what the module exposes).
- The correction event replaces projection data at its authored offset, bumps the applied-correction index, and emits exactly one material-change event naming the changed corridor or hub.

PROBE and the clue (`probe-clue.test.ts`):

- PROBE <corridor> dispatches `REQUEST_SOURCE_CHECK` against the corridor's authored field-report record id. The reply resolves from the shared deskChecks table as an OBSERVED record; assert the mission writes nothing to the mission queue for a PROBE (no mission-scheduled events).
- Inspecting the restriction record via `INSPECT_RECORD` logs the D-83 clue exactly once through the engine clueRecords path; assert the flights module contains no clue code (no `clues()` for this, no inspection flag in substate).

Completion and evaluation (`evaluate.test.ts`):

- Early completion fires only when every flight is terminal (`landed`, `landedLate`, `divertedLanded`, `stranded`, `heldFinal`). Verify `heldFinal` counts toward terminality and plain `held` does not.
- `evaluate(cause)` across the widened cause union: completed via `terminal()` when all flights settle early, timeout, forfeit. Timeout order: buzzer arrivals resolve first, then unresolved airborne flights strand, held flights become `heldFinal`, then evaluate runs. Forfeit evaluates as-is.
- Integer passenger aggregation drives authored tier thresholds; outbound consequence `flightsDisrupted` varies by tier.
- Inbound consequences: `commsDelayed` widens the authored projection divergence by its capped magnitude; `paymentsDelayed` removes one runway slot at the seed-named target hub for the authored early window; property test that folding is order-independent across permutations.

Keep the extended-time proportionality test and the full mission-local property suite (no negative slots, statuses forward-only, settled once, substate JSON-safe) for section 04; do not duplicate them here beyond what the lifecycle guard already covers.

## Implementation Details

### types.ts

Substate holds ONLY mutable facts: per-flight status and held flags, the single-use `groundAll` flag, the applied-correction index, per-corridor probe markers, and queue occupancy. The valibot `saveSchema` structurally excludes authored copy from the substate; that is what the round-trip and rejection tests pin.

    type FlightStatus = 'scheduled' | 'airborne' | 'held' | 'heldFinal'
      | 'landed' | 'landedLate' | 'divertedLanded' | 'stranded'

### content.ts (type only in this section)

`FlightsPayload` carries the immutable authored content: hub definitions (ids, names, runway slots, last-departure offsets), flight definitions (ids, origins, destinations, departure offsets, passenger counts), the corridor graph, the authored projection and its divergence points, the queue delay table, tier thresholds and the lateness threshold, the `leadMargin` (30 s standard, proportionally scaled under extended time), and the `paymentsDelayed` target hub id (pinned per seed so consequence folding is order-independent). Section 02 adds the content validators to this file; leave the module shape ready for that.

### rules.ts (pure functions, every decision against drained state)

- Storm truth: apply scheduled close and open events from the storm track to hub and corridor truth state. The displayed projection is payload data plus the applied-correction index; reducers never touch projection data. The correction event replaces projection data at its authored offset and emits one material-change event (the shell renders it as a single coalesced announcement with a two-tone cue; the engine just emits once).
- HOLD and RELEASE: HOLD while scheduled, RELEASE while held and inside the last-departure window, `heldFinal` when the window closes. Same-call races resolve purely by the engine's drain-then-reduce ordering; no special casing in the rules.
- GROUND ALL: on first dispatch, all scheduled flights become held; departures and individual releases are blocked thereafter; re-dispatch rejects as a no-op. No early completion from it.
- LAND and DIVERT: the shared legality selector checks airborne status, hub open, free slot, corridor open. DIVERT joins the target hub's arrival queue with authored positional delay from the queue delay table. Compute the projected arrival as an integer offset; the module schedules the arrival event; resolution follows the buzzer rules above. Expose this exact legality selector for the shell: section 03's readout must call THE SAME function (parity test lives there).
- PROBE: pure sugar that maps a corridor id to its authored field-report record id and emits the campaign `REQUEST_SOURCE_CHECK` dispatch. Nothing else.
- Tiering: integer passenger totals against authored thresholds; inbound consequence folding as described in the tests, capped and order-independent.

### scoreboard.ts

Aggregates passenger outcomes (arrived on time, arrived late, diverted, stranded, held) as integers, and exposes the held/grounded facts the campaign OPEN EXCEPTIONS selector reads: every held flight counts as a WOPR-resolved exception, so the exception count falls sharply at the fleet grounding while passenger outcomes worsen. The per-held-flight drop applies all at once under GROUND ALL.

### module.ts

Implements the MissionModule: `init` from payload, `schedule` emits departures, storm events, and the correction at authored offsets, `validate` delegates to the legality selectors, `reduce` applies rules and maintains substate, `evaluate(cause)` and `debrief` as above, `saveSchema` from types.ts. Define no `clues()` (the only clue is clueRecords-driven). Debrief content: arrivals, diversions, held and heldFinal counts, stranded passengers, unresolved flights, the GROUND ALL trade if taken, clue status. Register under mission id `flights`.

## Deferred to Other Sections

Section 02: the three real seed payloads, storm tracks, deskChecks and clueRecords rows, the six-invariant content validator, walkthrough and max-consequence scripts. Section 03: all screens, the map model, verbs, glossary, announcements. Section 04: per-seed CI fixtures, extended-time proportionality, the full property suite, accessibility passes.