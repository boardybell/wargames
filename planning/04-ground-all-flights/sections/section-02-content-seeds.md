# Section 02: Content and Seeds

Authored flights mission payloads and storm tracks for all three curated seeds, the six-invariant content validator that turns authoring mistakes into CI failures, the per-seed deskChecks and clueRecords rows, and the exported walkthrough and max-consequence scripts that section 04 reuses. This section is content plus validation logic only. The mission module, rules, types, and scoreboard it validates against come from section-01-module-rules; the screens that render this content come from section-03-screen-map and are not needed here.

## Background

GROUND ALL FLIGHTS is mission 2 of SHALL WE PLAY A GAME?, a React/Vite terminal game with a headless deterministic engine (src/engine/). Missions are pure MissionModule implementations receiving seed payloads; dispatch and advanceToNow return { state, emitted }; events drain in (scheduledAt, id) order; events with scheduledAt <= endsAt resolve before the timeout settlement guard in the same advanceToNow. All simulation math is integers; story times are seconds-of-day integers; seeds are plain JSON-safe data, no floats, no Map/Set/Date/undefined.

The mission: a live air-traffic routing puzzle. Four fictional hubs (three-letter invented codes) with integer runway slots and arrival queues, eight fictional flights with scheduled origins, destinations, departure offsets, and integer passenger counts, corridors connecting hubs, a seeded storm advancing on its own timeline, and an authored forecast projection that diverges from truth at one or two authored points per seed. A mid-mission correction event replaces projection data with lead time to respond. WOPR tempts the player with GROUND ALL, a single-use fleet action that makes OPEN EXCEPTIONS fall sharply while passenger outcomes worsen. Mission duration is four minutes standard, eight extended; every authored offset scales proportionally under extended time.

Content placement rules (binding, from plan review):

- Authored flights content lives in SeedDefinition.missionPayloads.flights per seed. Storm truth lives in SeedDefinition.stormTrack, the shared top-level field, not inside the mission payload.
- Desk-check outcomes (what CHECK SOURCE and PROBE return for a record) live in the shared SeedDefinition.deskChecks table keyed by record id, engine-owned. This section authors rows there, never inside the mission payload. PROBE <corridor> is sugar for REQUEST_SOURCE_CHECK against the corridor's authored field-report record, so every probe-able corridor needs a field-report record in the seed's records.flights graph and a deskChecks row with an authored reply offset.
- The D-83 clue is engine-owned via SeedDefinition.clueRecords (split 01 amendment 3/8): this section adds a { recordId, clueId } entry designating the restriction record as a clue record per seed. The flights module carries no clue code; inspecting the record logs the clue through the engine path.
- The paymentsDelayed target hub id is pinned by name in seed data so inbound consequence folding is order-independent across mission orders.

Fixture-seed record anchors, already authored by split 01 section-07 in records.flights: the all-hubs restriction record F06 (DERIVED, parent C17, run R04, event 21:14:08 = 76448, receipt 21:14:52 = 76492), its OBSERVED field-report sibling showing local weather and an open corridor, and the decoy W02 (OBSERVED, parent null, no R04 ancestry, a real local weather warning). Seeds two and three carry structural equivalents with their own record and run ids. This section verifies those anchors, adds any missing corridor field-report records, and wires deskChecks and clueRecords around them. isIndependentObservation(graph, recordId, claimRunId) comes from split 01 section-03; consume it, do not reimplement.

What the payload carries (immutable, authored; the substate from section-01 holds only mutable facts and its valibot saveSchema structurally rejects authored copy):

- Hub definitions: ids, names, integer runway slots, grid coordinates for the map model (desktop 36 x 14 and compact 24 x 10 anchors; section-03 consumes these, so author positions that keep corridor lines drawable on both grids). If section-01's payload type already fixed the coordinate scheme, follow it; if it left coordinates open, define them here in content.ts.
- Flight definitions: ids, origins, destinations, departure offsets, last-departure offsets (the RELEASE window boundary; a held flight becomes heldFinal when it passes), integer passenger counts.
- Corridor graph: edges between hubs with integer transit times (needed for projected-arrival computation and the readout), connected.
- The authored projection and its divergence points (one or two per seed), plus the correction spec: authored offset, the corridor or hub it changes, the affected flight id, and that flight's authored lastSafeDecisionAt.
- Queue delay table (authored positional delay for DIVERT joining a target queue), tier thresholds, the landedLate threshold, consequence flightsDisrupted magnitudes by tier, the leadMargin (30 seconds standard, proportionally scaled under extended time), and the paymentsDelayed target hub id and its authored early window.

SeedDefinition.schedules.flights carries the authored ScheduledEventSpec offsets: storm advancement steps, the correction event, queue ticks, departure readiness events, and the timer milestones including the 30 and 10 second warnings authored as offsets from mission end (split 01 seed amendment; the shared seed validation already asserts their presence).

Opening dilemma, authored per seed: one hub has capacity but sits in the projected storm path; another stays open with a long queue. Invariant 1 asserts it mechanically.

Copy rules: all-uppercase terminal diction, no em-dashes anywhere, invented names only, no real airports, airlines, people, or places.

## Files

Create or modify:

- /Users/darkpool/wargames/src/engine/missions/flights/content.ts: the FlightsPayload type if section-01 left it stubbed, plus the pure content validator functions, exported so tests and the central seed-validation registry (if split 01 established one) both call them.
- /Users/darkpool/wargames/src/engine/seeds/seed-one.ts, seed-two.ts, seed-three.ts: add missionPayloads.flights, stormTrack points for the mission window, schedules.flights specs, deskChecks rows for every referenced record id including corridor field reports, and the clueRecords entry for the restriction record. Add corridor field-report records to records.flights where missing. Confirm actual seed file locations with a grep for SeedDefinition before writing.
- /Users/darkpool/wargames/test/engine/missions/flights/content.test.ts: the six invariants as named tests, parameterized over all three seeds.
- /Users/darkpool/wargames/test/engine/missions/flights/solvability.test.ts: the solvability invariant through the real engine and module lifecycle.
- /Users/darkpool/wargames/test/engine/missions/flights/fixtures.ts: the exported scripts (walkthrough, max-consequence replay, authored full-tier alternate) per seed, plain (action, now) envelope data, consumed here and by section-04.

## Tests first

Engine-side, node Vitest project. Write these before authoring any content; they define done. TDD block 5: the six invariants from the plan as named tests, test.each over the seed catalog.

1. Structure: exactly four hubs and eight flights; corridor graph connected; authored projection present with at least one divergence point; opening dilemma present, asserted mechanically (at least one hub inside the projected storm path with a free slot at mission start, and at least one hub that the storm track leaves open whose authored queue delay at start exceeds a dilemma threshold defined in the test).
2. Solvability (solvability.test.ts, through init/schedule/dispatch/advanceToNow/evaluate with the real module from section-01): the walkthrough script reaches full tier under the real storm track; the same script, replayed with maximum inbound consequences folded (capped commsDelayed divergence widening plus paymentsDelayed slot removal at the pinned hub), still reaches at least partial tier; the authored alternate walkthrough reaches full tier under those same maximum consequences, proving the mission winnable at maximum penalty.
3. Correction lead margin arithmetic: for every correction spec, scheduledAt <= the affected flight's lastSafeDecisionAt minus leadMargin; pure arithmetic in the validator; also sanity-check that lastSafeDecisionAt is consistent with the flight's own authored offsets (not later than any window it depends on).
4. Storm/arrival separation: no storm close or open event shares a scheduledAt with any arrival event it could affect; at least one second apart. Operationalize over the deterministic arrivals derivable from authored data (departure offsets plus corridor transit and queue delays) and over every arrival produced by replaying the exported scripts; any storm transition within one second of such an arrival at the affected hub or corridor fails.
5. Records: the restriction record is DERIVED with run ancestry reaching the exercise export (fixture seed: F06 -> C17 -> R04/D83-EXPORT; seed equivalents by anchor table); W02 or its seed equivalent passes isIndependentObservation against the seed's exerciseRunId; every record id referenced anywhere in the flights payload has a deskChecks row; a corridor field-report record and deskChecks row exist for every probe-able corridor; the clueRecords table carries an entry mapping the restriction record to the D-83 clue id.
6. Integers and pins: every numeric tuning value in the payload, stormTrack points, and schedules.flights satisfies Number.isInteger (reject NaN/Infinity); the paymentsDelayed target hub id names an existing hub; the payload JSON round-trips strict-equal.

Hardcode the per-seed expected anchors (restriction record id, run id, decoy id, clue id) in one small table at the top of the test files so the validator and the tests share a single source of truth.

Add authoring spot checks on the fixture seed: F06's times verbatim (event 76448, receipt 76492), the field-report body naming local weather and an open corridor, W02's body explaining a real local restriction, and each corridor field report's deskChecks reply being an OBSERVED-provenance confirmation of the corridor's true state at the authored reply offset.

## Implementation

### 1. Payload type and validator (content.ts)

Use section-01's FlightsPayload if finalized; otherwise declare it here per the field list in Background. The validator is pure and returns structured errors rather than throwing, so one CI run names every authoring mistake:

    function validateFlightsContent(
      payload: FlightsPayload,
      stormTrack: StormTrackPoint[],
      schedule: ScheduledEventSpec[],
      records: EvidenceRecord[],
      deskChecks: DeskCheckEntry[],
      clueRecords: ClueRecordEntry[],
      anchors: FlightsSeedAnchors
    ): ContentError[]

Invariants 1, 3, 4, 5, and 6 are validator rules. Invariant 2 is not; it needs the module lifecycle and runs as the solvability fixture test. The separation check (invariant 4) takes the script-derived arrivals as an input computed by a small pure helper exported beside the validator, so section-04 can reuse the same helper for its same-second separation guard.

### 2. Authoring the fixture seed

Author hubs, flights, corridors, and the storm track so the canonical shape of the mission holds: the storm closes the projected-path hub on schedule, the projection misses it at one or two authored divergence points, the correction lands with at least leadMargin of decision room before the affected flight's lastSafeDecisionAt, and the opening dilemma reads instantly on the map. Queue delays must make DIVERT a real cost, not a free LAND. Passenger counts and tier thresholds must make the GROUND ALL trade genuinely tempting and genuinely worse: section-04's blanket-grounding fixture will assert exceptions fall while the passenger aggregate worsens, so author counts that produce that shape without hand-tuning the fixture.

### 3. Seeds two and three

Same structure, different weather flavor, their own hub codes, flight ids, record ids, and run ids standing in for F06, C17, R04, and W02. Define each seed's anchors in its FlightsSeedAnchors object. The validator runs unchanged across all three; keep divergence counts, dilemma shape, and the four-role record structure (EXERCISE root, DERIVED restriction, OBSERVED sibling, OBSERVED decoy) intact per seed.

### 4. deskChecks, clueRecords, schedules

For every record the payload references, add the deskChecks row in that seed's shared table: the restriction record's check resolves against its EXERCISE ancestry, each corridor field report replies as an OBSERVED confirmation of true corridor state at an authored integer offset, the decoy's check confirms its independent local origin. Add the clueRecords entry for the restriction record. Author schedules.flights with storm steps, the correction, queue ticks, departure readiness events, and the 30 and 10 second warnings as offsets from mission end.

### 5. Scripts (fixtures.ts)

Three exported scripts per seed as ordered (action, now) envelope lists with declared expected outcomes: the walkthrough (full tier, real storm), the max-consequence replay target (same actions, at least partial tier), and the alternate walkthrough (full tier at maximum penalty). Do not hand-tune thresholds to make them pass; if an invariant fails, the content is wrong and gets re-authored, because these scripts are the difficulty contract. Export them cleanly; section-04 builds its CI fixture matrix on them.

## Dependencies

- section-01-module-rules complete: types, rules, module registration, scoreboard, terminal()/evaluate, saveSchema.
- Splits 01 and 02 including amendments 7 (terminal()) and 8 (clueRecords); this section touches the shared SeedDefinition files, deskChecks table, and clueRecords table from split 01.
- Blocks section-04-fixtures-polish, which consumes the exported scripts and the separation helper.

## Done when

npm test passes with: the six named invariants green across all three seeds, the fixture-seed spot checks green, the walkthrough at full tier, the max-consequence replay at partial or better, the alternate at full tier under maximum penalty for every seed, and all three scripts exported as plain data for section-04.