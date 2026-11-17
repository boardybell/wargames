# Section 05: Campaign State Machine (src/engine/campaign/)

## Background

This section builds the heart of the headless engine for SHALL WE PLAY A GAME?, a WarGames-inspired browser game. The engine is pure TypeScript under `src/engine/` with zero DOM, React, or asset dependencies, testable entirely in Node. The campaign machine owns the top-level game state: which phase the player is in, which mission is live, what has settled permanently, which cross-mission consequences have been applied, and the campaign-level event queue that outlives mission settlement.

Core principles this section must honor (established in the foundation):

1. Purity. Every state transition is a pure function `(prev, envelope) => next`. No IO, no ambient time, no ambient randomness. The ESLint purity gate (section-01) bans `Math.random`, `Date.now`, `performance.now`, and DOM globals under `src/engine/**`.
2. The clock is logged input. The engine only ever sees wall time as the `now` field of a dispatched envelope or an explicit `advanceToNow(state, now)` call. `CampaignState` carries a `lastNow` high-water mark; every incoming `now` is clamped to `max(now, lastNow)` before any processing, so a backward system-clock jump can never un-expire a deadline, reorder processed events, or diverge a replay.
3. RNG as state. The PRNG (`RngState` from section-02) lives inside campaign state and threads immutably through reducers.
4. Integer simulation math. Every sim-affecting quantity (confidence, liquidity, capacity, counts, scores, consequence magnitudes) is an integer in its smallest unit. Division sites use floor unless documented otherwise at the site. Minus-zero normalizes to zero at state boundaries.
5. One source of truth, two scoreboards. WOPR's OPEN EXCEPTIONS tally and the real service outcomes are both pure selectors over the same campaign state.
6. Monotonic settlement. A mission settles exactly once; settled facts merge monotonically on every load path, so reloads, double wakes, and backup recovery can never unsettle, resettle, or re-apply.
7. Serializable everything. All state is plain JSON-safe data: finite numbers, strings, booleans, null, arrays, plain objects with string keys. No `Map`, `Set`, `Date`, `undefined`, `NaN`, or `Infinity`. Collections are arrays sorted by stable ID; every sort comparator ends with an ID tie-break.

The canonical record of any campaign is its seed plus the ordered log of `(action, now)` envelopes; replay is fold-left over them. Dispatch is the single choke point that makes "invalid actions cannot change game state" true: commands and buttons both produce the same typed actions.

## Dependencies

- section-01-foundation: repo skeleton, `@engine` alias, test harness helpers (canonical stringify, state hash, minus-zero normalization).
- section-02-rng: `RngState`, `rngFromSeed`, `nextInt`. The campaign draws randomness rarely (desk reply jitter, nothing load-bearing), but `rng` is a field of `CampaignState` and threads through reducers.
- section-03-records: `EvidenceRecord` types, record graph container, `trace`, `isIndependentObservation`, corroboration semantics for CONFIRMED / CONTRADICTED / PENDING / UNKNOWN. This section wires the stateful side (INSPECT_RECORD, REQUEST_SOURCE_CHECK, reply resolution) onto those pure parts.
- section-04-time: `ScheduledEvent`, schedule materialization, the merged two-queue drain in `(scheduledAt, id)` order with deletion on processing, `lastNow` clamp, 30-minute catch-up cap, and the timeout settlement hook. This section supplies the settlement implementation that hook invokes.

This section blocks section-06 (mission-module interface). Because the permanent test-double mission arrives in 06, tests in this section that need a live mission use a minimal local stub mission fixture defined in the test tree (see "Mission stub for this section" below). Section-06 supersedes it with the permanent test double; the stub here stays as a private fixture of these specs or is deleted when 06 lands, implementer's choice, as long as the specs keep passing.

## Files

Create:

- `src/engine/campaign/state.ts` — Valibot schema for `CampaignState` (schema is the source of truth; the TS type derives via `InferOutput`), plus `SettledOutcome`, `SourceCheckResult`, `AppliedMarker`, `Consequence` types.
- `src/engine/campaign/dispatch.ts` — `dispatch(state, action, now)`: clamp, advanceToNow, validate, reduce. Action type definitions for the full player-driven set.
- `src/engine/campaign/settlement.ts` — `settleMission(state, result)` and the monotonic settlement guard predicate (exported; the save layer in section-08 reuses it for its merge guard).
- `src/engine/campaign/consequences.ts` — consequence selection, canonical-order folding, per-type aggregate capping, `AppliedMarker` recording, briefing-line surfacing.
- `src/engine/campaign/selectors.ts` — `selectOpenExceptions`, `selectServiceOutcomes`, menu-row selector (fourth-row unlock), debrief/ case-file view selectors as needed by the specs.
- `src/engine/campaign/createCampaign.ts` — `createCampaign(seedName, preferences)` producing a fresh `CampaignState`; also the NEW_CAMPAIGN reducer target.

Create tests (Vitest 4, engine project, node environment):

- `test/engine/campaign/dispatch.spec.ts`
- `test/engine/campaign/settlement.spec.ts`
- `test/engine/campaign/consequences.spec.ts`
- `test/engine/campaign/source-checks.spec.ts`
- `test/engine/campaign/selectors.spec.ts`
- `test/engine/campaign/stub-mission.ts` (local fixture, not production code)

Valibot (1.x) is already a runtime dependency from section-01. No new dependencies.

## Tests first

Write these before implementing. Stubs describe what to test, not how.

From TDD block 8 (campaign state machine):

- Test: invalid, unknown, and out-of-phase actions are rejected and state is strictly unchanged (deep-equal, same reference where applicable).
- Test: any of the three missions can start first from the menu.
- Test: settlement permanence: completed, timeout, and forfeit each write one final `SettledOutcome`; re-dispatching settlement-adjacent actions, reloading (simulate by round-tripping state through JSON here; the full save path is section-08), acknowledging the debrief, and reselecting the settled row never change it.
- Test: FORFEIT_MISSION routes to the mission's evaluate with cause `'forfeit'`.
- Test: consequence folding: markers keyed `(consequenceId, targetMissionId)`; a consequence from mission A applies to both B and C exactly once each.
- Property test (@fast-check/vitest): any permutation of the same settled outcomes yields identical folded initial conditions (canonical order plus aggregate capping).
- Test: aggregate cap applies to the sum per type, not pairwise (two magnitudes that individually fit but jointly exceed the cap clamp to the cap).
- Test: fourth menu row hidden until all three debriefs acknowledged; appears regardless of outcome quality.
- Test: `selectOpenExceptions` and `selectServiceOutcomes` derive from the same state and diverge in the documented direction when a forced-inactivity order lands (exceptions fall, service outcomes worsen).
- Test: NEW_CAMPAIGN resets outcomes and accepts same or different seed.

Deferred from block 8 to section-10: the six-permutation chronology test (needs real seeds from 07 and the full harness).

From TDD block 5 (the stateful parts; the pure selectors were tested in section-03):

- Test: INSPECT_RECORD dispatch adds the record id to `inspectedRecords` once; repeat dispatch does not duplicate.
- Test: REQUEST_SOURCE_CHECK appends exactly one desk-reply event to the campaign-level queue with the seed-authored delay; the reply resolves to the authored outcome at its `scheduledAt`.
- Test: PENDING and UNKNOWN replies carry zero corroboration (corroboration selector returns zero for them; CONFIRMED returns nonzero).
- Test: a reply scheduled past the active mission's `endsAt` still resolves after settlement, lands in `sourceChecks` with `arrivedAfterSettlement` true, and persists into later phases (debrief, menu).

Additional specs this section should assert because it owns the schema:

- Test: `CampaignState` TS type is `InferOutput` of the valibot schema (compile-time check plus a runtime parse of a canonical fixture state).
- Test: every reducer output is JSON-safe (run the canonical stringify from the section-01 harness over post-dispatch states in at least one spec; no NaN, Infinity, undefined).

Since real seeds arrive in section-07, these specs run against a minimal inline seed fixture: a handful of records (one EXERCISE origin, one DERIVED child, one OBSERVED independent, one decoy), an authored desk-reply table covering all four outcomes, and integer tuning values. Keep it in the test tree beside the stub mission.

## Implementation

### CampaignState

Define the valibot schema first; derive the type:

    interface CampaignState {
      seedName: string
      rng: RngState
      lastNow: number                        // clock high-water mark, epoch ms
      phase: 'menu' | 'mission' | 'debrief' | 'finale' | 'ended'
      activeMission: MissionRuntime | null   // mission queue, endsAt, substate
      campaignQueue: ScheduledEvent[]        // cross-phase events (source checks)
      settled: SettledOutcome[]              // one per settled mission, final
      acknowledgedDebriefs: string[]
      cluesFound: ClueId[]
      sourceChecks: SourceCheckResult[]      // persist across missions, with
                                             // arrivedAfterSettlement markers
      inspectedRecords: string[]
      appliedConsequences: AppliedMarker[]   // {consequenceId, targetMissionId}
      preferences: { extendedTime: boolean, ... }
    }

`MissionRuntime` at this layer is a structural shape only: mission id, mission event queue, `endsAt` (absolute epoch ms), and a substate slot. The substate is schema-validated per mission via `MissionModule.saveSchema` starting in section-06; here the campaign schema treats it as an opaque JSON-safe value and section-08 composes the per-mission schemas into load validation. Do not design the mission interface here; leave the slot and a documented seam.

`SettledOutcome` carries at minimum: mission id, outcome tier, settlement cause (`'completed' | 'timeout' | 'forfeit'`), integer metrics, clue granted, and the consequences emitted. `SourceCheckResult` carries record id, authored outcome (CONFIRMED / CONTRADICTED / PENDING / UNKNOWN), resolution time, and `arrivedAfterSettlement: boolean`. `AppliedMarker` is `{ consequenceId, targetMissionId }`. Consequences are typed facts, `commsDelayed`, `flightsDisrupted`, `paymentsDelayed`, each with integer magnitude.

All arrays sorted by stable ID with ID tie-breaks in comparators.

### Phase machine

Phases: `menu`, `mission`, `debrief`, `finale`, `ended`. Transitions are driven only by dispatched actions and by timeout settlement from the time subsystem. From `menu`, any of the three missions may start in any order. A settled mission routes to `debrief`; ACKNOWLEDGE_DEBRIEF returns to `menu`. The fourth menu row (the finale) appears when all three debriefs are acknowledged, regardless of outcome quality; better earlier outcomes widen finale recovery options via thresholds carried in settled metrics (consumed by split 06 of the project, not built here). Finale-internal actions are defined by that later split; this section only needs the phase value and the unlock selector.

### Dispatch

    dispatch(state, action, now)

Order of operations, exactly: clamp `now` to `max(now, state.lastNow)`; run `advanceToNow` (section-04) so timers and due events, including timeout settlement, land before the action is considered; validate the action (unknown action kinds, out-of-phase actions, and rule-violating actions are rejected and provably change nothing; return the input state, same reference, plus a rejection result the shell can render); then reduce. The campaign log is the ordered list of `(action, now)` envelopes; replay is fold-left over them, so dispatch must be total and deterministic.

The full player-driven action set at this layer: mission actions (routed to the active mission's validate/reduce via the section-06 seam; the stub mission stands in for now), START_MISSION, FORFEIT_MISSION (shell confirms first; engine routes to settlement with cause `'forfeit'`), ACKNOWLEDGE_DEBRIEF, INSPECT_RECORD, REQUEST_SOURCE_CHECK, SET_PREFERENCE, NEW_CAMPAIGN. Finale actions arrive with the later finale split; the action union should be designed for extension.

START_MISSION materializes the mission queue and `endsAt` through section-04's schedule materialization using the chosen duration (standard 4-minute missions or extended, exactly double, from `preferences.extendedTime`, chosen before start), folds applicable consequences (below), and enters `phase: 'mission'`. Reselecting a settled mission does not restart it; it yields the settled record for display. Replay of a mission requires NEW_CAMPAIGN.

### Settlement

`settleMission(state, result)` writes a `SettledOutcome` exactly once. Guards: if an outcome for the mission already exists, settlement is a no-op returning the input state unchanged. Settlement deletes the mission queue (the campaign queue survives), moves phase to `debrief`, and clears `activeMission`. Three causes reach it: `completed` (mission logic), `timeout` (the section-04 hook, when `now >= endsAt` with the mission unsettled, including deadlines discovered long after the fact on reload or behind a menu overlay), and `forfeit` (the FORFEIT_MISSION action). Export the monotonic guard predicate separately; section-08's load-path merge guard reuses it so a stale backup can never resurrect an unsettled mission or roll settlement backward. The save layer also flushes immediately on settlement; this section only needs to make settlement observable (a flag or result the shell and save layer can key on), not to perform IO.

### Consequence folding

When a mission starts, select every consequence from settled outcomes that lacks an `AppliedMarker` for this target mission. Fold them in canonical order (sorted by consequenceId, ID tie-break), with capping defined over the per-type aggregate: sum the magnitudes per consequence type first, then clamp the sum to the type's cap once. Never cap pairwise. Record one marker per `(consequenceId, targetMissionId)` so a consequence from mission A applies to both B and C exactly once each, and a reload mid-campaign cannot re-apply anything. Surface briefing lines describing the change (plain strings in the start result, consumed by the shell). All magnitudes and caps are integers. The permutation property test is the specification: any order of the same settled outcomes must yield identical folded initial conditions.

### Source checks and the campaign queue

REQUEST_SOURCE_CHECK appends exactly one desk-reply `ScheduledEvent` to the campaign-level queue (never the mission queue) with a seed-authored visible delay. Reply outcomes are authored per record per seed; PENDING and UNKNOWN carry zero corroboration, CONFIRMED carries nonzero (the corroboration selector from section-03 consumes `sourceChecks`). Because the queue is campaign-level and survives settlement, a reply scheduled past the mission's `endsAt` still resolves at its scheduled time in whatever phase the campaign is then in; the resolution reducer writes a `SourceCheckResult` with `arrivedAfterSettlement: true` when the relevant mission settled before resolution. Results persist in `sourceChecks` for the finale case file. The desk reply jitter, if the seed authors any, is the one place this section draws from `rng`; thread the returned `RngState` back into state.

INSPECT_RECORD appends the record id to `inspectedRecords` if absent; idempotent on repeat. Inspection is what highlights records in the finale case file; `trace` itself (section-03) remains a pure selector with no state change.

### Scoreboards and selectors

`selectOpenExceptions(state)` and `selectServiceOutcomes(state)` are pure selectors over the same state. WOPR counts forced inactivity (grounded fleets, held accounts, dark inboxes) as resolved exceptions while service outcomes count the same facts as damage; when a forced-inactivity order lands, exceptions must fall while service outcomes worsen. Both derive from identical state by construction, which is the dramatic engine of the game: the player wins by noticing the divergence. Also implement the menu-row selector with the fourth-row unlock rule. Every selector must leave state deep-equal to its before image (asserted in specs).

### NEW_CAMPAIGN

An explicit dispatched action, never implicit, producing a fresh `CampaignState` from a chosen seed name (same or different seed) via `createCampaign(seedName, preferences)`, seeding `rng` with `rngFromSeed` from the seed's authored seed number. Preferences may carry over or reset per the action payload; outcomes, settlements, markers, source checks, and inspections always reset.

## Mission stub for this section

A minimal local stub in `test/engine/campaign/stub-mission.ts`: two or three valid actions, one invalid action, a completion condition, a tiny integer substate, one emitted consequence, and an authored schedule of one or two events. It exists only so dispatch, settlement, timeout, forfeit, and consequence specs have a mission to run; it should be small enough to read in one screen. Section-06 defines the real `MissionModule` interface and the permanent test double; the seam in this section (how START_MISSION calls init/schedule, how mission actions route to validate/reduce, how settlement calls evaluate) should be shaped so 06 can formalize it without rewriting dispatch.

## Out of scope here

- The `MissionModule` generic interface, `saveSchema` composition, and the permanent test double (section-06).
- Real seeds, walkthrough fixtures, and seed validation (section-07).
- The save codec, migrations, storage port, and the load-path merge guard wiring (section-08; it imports this section's guard predicate).
- Snapshot, branch running, and projections (section-09).
- The public API surface, run-twice determinism harness, six-permutation test, and the fc.commands model suite (section-10).

## Amendment (2026-11-17, from the split 02 shell review)

Binding contract changes from the shell split's review (see
../claude-plan.md section 15):

1. dispatch returns { state, emitted: EngineEvent[] } instead of bare
   state; advanceToNow likewise. emitted is the ordered JSON-safe list
   of events materialized during the call: missionStarted,
   scheduledEventFired, timerMilestone, settlement, phaseChanged,
   consequenceApplied, sourceCheckResolved, debriefAcknowledged,
   finaleFinalPhase, branchRunCompleted, campaignReset. Entries
   correspond one-to-one with queue deletions and settlement
   transitions in that call (exactly-once is structural). Replay folds
   use state only; emitted is a side channel for the shell.
2. CampaignState gains startedMissionIds: string[], appended by
   START_MISSION, making campaign-begun (and the extended-time
   preference lock after the first start) a total derivation. Add it to
   the valibot schema and tests: SET_PREFERENCE for extendedTime is
   rejected once startedMissionIds is nonempty.
3. Tests to add: emitted contains exactly one settlement event per
   settlement; a catch-up crossing three milestones emits three ordered
   timerMilestone events once; replaying the same envelope log yields
   identical emitted sequences.

## Amendment 2 (2026-11-17, from the split 03 mission review)

clueFound joins the EngineEvent union. After every mission reduce, the
engine lifecycle polls the active module's optional clues(state)
selector (see section-06 amendment 2) and monotonically merges new ids
into CampaignState.cluesFound, emitting one clueFound event per new id.
Test: a mission whose clues() reports an id after a READ-like action
gets that id into cluesFound immediately, exactly once, surviving a
later timeout settlement of that mission.

## Amendment 3 (2026-11-17, from the splits 04 and 05 mission reviews)

1. SettlementCause widens to 'completed' | 'collapsed' | 'timeout' |
   'forfeit'. The engine polls the active module's optional
   terminal(state) selector after every reduce and after every drain;
   a non-null return settles immediately with that cause (guarded by
   the settled flag; exactly-once unchanged). Tier stays the success
   measure; cause drives story framing.
2. Engine-owned inspection-gated clues: INSPECT_RECORD reduction
   checks SeedDefinition.clueRecords and merges the mapped clue into
   cluesFound (monotonic, clueFound event) when a designated record
   is inspected. Tests: designated record inspection logs the clue
   exactly once; non-designated records do not; works in any phase
   where INSPECT_RECORD is legal.
