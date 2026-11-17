# section-06-mission-interface

## Goal

Build `src/engine/missions/`: the generic `MissionModule` interface that all four real mission rule sets (built in later splits) will plug into, the `MissionRuntime` wiring that lets the campaign machine host a mission, the engine-owned lifecycle sequencing, and a permanent test-double mission that proves the whole lifecycle end to end before any real mission content exists. The test-double is not scaffolding to delete later; it lives in the test tree forever as the fixed target for integration, property, save, and branch tests in sections 07 through 10.

## Background you need (do not go read other documents)

This is part of the headless simulation engine for a WarGames-inspired browser game. The engine is pure TypeScript under `src/engine/` with zero DOM, React, or asset dependencies, testable entirely in Node. Core principles that bind this section:

- Purity. Every state transition is a pure function `(prev, envelope) => next`. No IO, no ambient time, no ambient randomness. An ESLint gate (from section-01) bans `Math.random`, `Date.now`, `performance.now`, and DOM globals under `src/engine/**`.
- The clock is logged input. The engine only sees wall time as the `now` field of a dispatched envelope or an explicit `advanceToNow(state, now)` call. Missions never see wall clock or RNG primitives directly; draws and times arrive inside events.
- Integer simulation math. Every sim-affecting quantity is an integer in its smallest unit; division sites floor unless documented otherwise.
- Serializable everything. All state is plain JSON-safe data: finite numbers, strings, booleans, null, arrays, plain objects with string keys. No Map, Set, Date, undefined, NaN, Infinity. Collections are arrays sorted by stable ID with an ID tie-break in every comparator.
- Monotonic settlement. A mission settles exactly once; settled facts are final.
- Valibot (1.x) schemas are the source of truth for persisted shapes; TS types derive via `InferOutput`.

The campaign machine (section-05, a dependency of this section) already provides: `CampaignState` with `phase` (`'menu' | 'mission' | 'debrief' | 'finale' | 'ended'`), `activeMission: MissionRuntime | null`, `settled: SettledOutcome[]`, `appliedConsequences: AppliedMarker[]` keyed `{consequenceId, targetMissionId}`, envelope dispatch (clamp now, run advanceToNow, validate, reduce), consequence folding (canonical order sorted by consequenceId, aggregate capping per type), and the player action set including `START_MISSION` and `FORFEIT_MISSION`. The time subsystem (section-04) provides `ScheduledEvent { id, scheduledAt, kind, payload }`, schedule materialization for standard and extended durations (extended doubles duration and scales offsets proportionally), the merged two-queue drain in `(scheduledAt, id)` order with deletion on processing, and the timeout settlement hook that fires exactly once when `now >= endsAt`.

Timers: missions run 4 minutes Standard or 8 minutes Extended (exactly double), chosen before start via `preferences.extendedTime`.

## Files

Create:

- `src/engine/missions/types.ts` (or `module.ts`): `MissionModule`, `MissionRuntime`, `MissionEvent`, `ScheduledEventSpec`, `Validity`, `SettledOutcome`, `DebriefPayload`, `FoldedConsequences`, `MissionId` types and valibot schemas where shapes persist.
- `src/engine/missions/lifecycle.ts`: engine-owned sequencing helpers the campaign machine calls (start a mission from a module plus seed plus folded consequences, route mission events through `validate`/`reduce`, invoke `evaluate` on the three settlement causes, produce the debrief payload).
- `src/engine/missions/registry.ts`: mission-module lookup by `MissionId` so the campaign machine and the save layer can resolve modules (the save layer in section-08 composes `saveSchema` by mission id through this).
- `test/engine/missions/test-double.ts`: the permanent test-double mission module and its substate schema. It lives under `test/engine/` so it ships in the test tree, but it must be importable by the suites of sections 07 through 10; export it cleanly.
- `test/engine/missions/lifecycle.spec.ts` (plus any sibling spec files): the TDD block below.

Modify:

- `src/engine/campaign/` wiring points as needed so `START_MISSION` uses the registry and lifecycle helpers rather than any hardcoded mission knowledge. Keep the change minimal; section-05 already defined the dispatch choke point.

## Tests first (write these before implementing)

From the TDD plan, block 9. Stubs describe what to test, not how.

1. Test-double mission lifecycle end to end, one suite walking the full arc:
   - `START_MISSION` initializes the test-double via `init(seed, foldedConsequences, duration)` and materializes its `schedule(seed, duration)` into absolute `scheduledAt` values plus `endsAt`.
   - Scheduled events fire through `advanceToNow` and reduce mission substate.
   - Valid actions pass `validate` and reduce; invalid actions are rejected and campaign state is strictly unchanged (deep-equal).
   - Completion path: delivering enough tokens settles with cause `'completed'` and writes exactly one final `SettledOutcome`.
   - Timeout path: advancing past `endsAt` settles with cause `'timeout'`, exactly once, including when the deadline passed long ago (reload discovery pattern).
   - Forfeit path: `FORFEIT_MISSION` routes to `evaluate` with cause `'forfeit'`.
   - Debrief payload from `debrief(outcome)` matches the settled outcome.
   - The consequence the test-double emits folds into a later test-double start: the second mission's `init` receives `FoldedConsequences` reflecting it, and an `AppliedMarker` `{consequenceId, targetMissionId}` is recorded so it applies exactly once.
2. Test: mission substate round-trips through the composed `saveSchema` (encode substate, parse with the module's schema, strict-equal); a corrupted substate fails validation. The full save fallthrough behavior is section-08's job, but this test proves the schema composition hook works at the module boundary now.
3. Test: missions receive draws and times only via events. Interface-level proof: the test-double records every input it sees (times, drawn values) into its substate; assert none were ambient, i.e. every recorded value is traceable to an event payload or the envelope `now`, and the module functions are pure (same inputs, same outputs; frozen-input safe is a nice extra given section-02 established the pattern).
4. Test: extended duration doubles the test-double's `endsAt` and proportionally scales its scheduled offsets (an event authored at offset 60s lands at 120s under extended).

## The interface

Fields and signatures as the plan specifies; bodies are the implementer's job.

    interface MissionModule<S, A> {
      id: MissionId
      init(seed: SeedDefinition, consequences: FoldedConsequences, duration: number): S
      schedule(seed: SeedDefinition, duration: number): ScheduledEventSpec[]
      validate(state: S, action: A): Validity
      reduce(state: S, event: MissionEvent<A>): S
      evaluate(state: S, cause: 'completed' | 'timeout' | 'forfeit'): SettledOutcome
      debrief(outcome: SettledOutcome): DebriefPayload
      saveSchema: GenericSchema<S>   // valibot schema for the mission substate;
                                     // the save layer composes it by mission id
    }

Notes on each member:

- `init` receives the seed (mission content payloads are opaque at this layer; each module narrows its own payload type, and `SeedDefinition` here can be the loose placeholder type until section-07 firms it, since 07 depends on this section), the folded consequences from prior settled missions, and the chosen duration in ms. It returns the initial substate `S`, which must be JSON-safe.
- `schedule` returns authored offsets in seconds from mission start plus event kind and payload (`ScheduledEventSpec`); the ENGINE, not the module, materializes these to absolute epoch-ms `ScheduledEvent`s using section-04's materializer, which also handles the extended-duration proportional scaling. Modules never compute absolute times.
- `validate` returns a `Validity` (accept, or reject with a reason code) and must be side-effect free; rejected actions provably change nothing because the campaign dispatch choke point consults it before reducing.
- `reduce` consumes `MissionEvent<A>`: a discriminated union covering player actions (wrapped with the envelope `now`) and fired scheduled events. Any RNG draw a mission needs is performed by the engine and delivered as event payload data; modules never touch `RngState`.
- `evaluate` is total over the three causes and produces the `SettledOutcome`: outcome tier, integer metrics, clue id if earned, and the consequences emitted (typed facts such as `commsDelayed` / `flightsDisrupted` / `paymentsDelayed`, each with integer magnitude). Settlement permanence is enforced by the campaign machine, not the module.
- `saveSchema` closes the open-typed substate hole: `CampaignState` validation composes the active mission's schema at load through the registry, so splits 03 to 06 of the project get save validation for free and the engine never holds unvalidatable opaque state. Section-08 consumes this; this section must make the composition point real and tested at the module boundary.

`MissionRuntime` (held in `CampaignState.activeMission`) carries: the mission id, the materialized mission queue (deleted at settlement), `endsAt` (absolute epoch ms), and the mission substate. All JSON-safe.

## Engine lifecycle sequencing

The engine owns the sequence; modules are passive rule sets.

1. `START_MISSION` (valid only in `menu` phase, and only for an unsettled mission): resolve the module from the registry, select every settled consequence lacking an `AppliedMarker` for this target, fold them in canonical order with aggregate-per-type capping (section-05 owns the fold; this section passes the result to `init`), record the markers, compute duration from `preferences.extendedTime`, call `init` and `schedule`, materialize the queue and `endsAt` via section-04, set `phase: 'mission'` and `activeMission`.
2. During play: dispatched mission actions go clamp, advanceToNow, `validate`, then `reduce` wrapped as a `MissionEvent`. Fired scheduled events route straight to `reduce`.
3. Settlement: on completion condition (module-signaled through its reduced state or an explicit completing action), timeout (`now >= endsAt`, detected by advanceToNow), or `FORFEIT_MISSION`, call `evaluate(state, cause)` once, write the `SettledOutcome` into `settled`, delete the mission queue, clear `activeMission`, set `phase: 'debrief'`. The settled guard makes re-entry impossible.
4. Debrief: `debrief(outcome)` is a pure selector-style call producing the display payload; `ACKNOWLEDGE_DEBRIEF` (section-05) returns to menu.

## The test-double mission

Deliberately tiny, permanently kept: deliver N of M tokens before the deadline.

- Substate: two fields (for example `delivered: number` and `inputLog: string[]` or similar), with a two-field valibot schema exported as its `saveSchema`. The input log doubles as the proof for test 3 above.
- Actions: one deliver action; delivering a decoy token is the invalid/rejected case (or a valid action that does not advance progress, whichever makes the rejection test cleaner; the plan requires one decoy).
- Schedule: at least one authored offset event so firing, ordering, and extended scaling are exercised.
- Evaluate: `'completed'` when `delivered >= N`, tiered outcome by count; `'timeout'` and `'forfeit'` produce lower tiers; emits exactly one consequence with an integer magnitude so folding into a later start is testable.
- Debrief: payload derived only from the outcome.
- Seed payload: the test-double defines its own tiny payload type to prove the opaque-payload pattern that real seeds (section-07) will follow.

## Dependencies and what this unblocks

- Depends on: section-05-campaign (dispatch, settlement, consequence folding, phase machine), which in turn carried in sections 02 (RNG), 03 (records), 04 (time).
- Blocks: section-07-seeds (SeedDefinition firming and walkthrough fixtures run against this lifecycle), section-08-save (composes `saveSchema` via the registry), section-09-branch (runs branches over the test-double campaign).
- Do not implement here: real mission content, seed authoring, save fallthrough, branch running. Those sections reference the test-double and the registry; keep both import-clean.

## Done when

`npm test` passes with the new lifecycle suite green: end-to-end start/fire/reduce/settle for all three causes, debrief fidelity, consequence folding into a second start with exactly-once markers, substate schema round-trip plus corruption rejection, no-ambient-inputs proof, and extended-duration scaling. Coverage thresholds (lines 80, branches 75 over `src/engine/**`) still hold.

## Amendment (2026-11-17, from the split 02 shell review)

Binding contract changes from the shell split's review:

1. The permanent test-double mission must be importable by downstream
   splits' test trees. Export it through a dedicated @engine/testing
   entry point (a src/engine/testing/index.ts that re-exports the
   test-double module and its seed payload), excluded from the public
   surface in src/engine/index.ts and from the production bundle. The
   import-surface test in section 10 must NOT count @engine/testing
   exports against the public API.
2. Mission schedule specs may include seed-authored timerMilestone
   events (section 04 amendment); the test-double authors at least one
   so lifecycle tests observe a timerMilestone in emitted.

## Amendment 2 (2026-11-17, from the split 03 mission review)

MissionModule gains an optional pure selector clues(state: S): ClueId[].
The engine lifecycle polls it after every reduce and merges new ids
monotonically into campaign state (section-05 amendment 2), emitting
clueFound events. The test-double mission exposes a trivial clues()
(for example after its decoy is read) so lifecycle tests cover the
merge, the exactly-once event, and persistence across a failed
settlement.

## Amendment 3 (2026-11-17, from the splits 04 and 05 mission reviews)

MissionModule gains optional terminal(state: S): 'completed' |
'collapsed' | null, polled after every reduce and drain; non-null
settles with that cause. evaluate() now receives the widened cause
union. The test-double mission exercises both terminal causes
(completed on token goal, collapsed on a poison-token condition) so
lifecycle tests cover both paths plus the exactly-once guard.
