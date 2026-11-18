# Section 10: Public API Surface and Cross-Cutting Property Suites

Final section of the 01-simulation-core split. Two deliverables: the narrow public API at `src/engine/index.ts` that the shell (and later splits) will consume, and the cross-cutting test harness suites that close the split's acceptance criteria: run-twice determinism, snapshot-replay equivalence, the Math.random sabotage test, the six-permutation chronology test, and the fc.commands model-based suite. Everything here runs headless in Node under the Vitest engine project.

## Background You Need

This engine is the pure-TypeScript core of SHALL WE PLAY A GAME?, a WarGames-inspired browser game. The canonical record of any campaign is its seed plus the ordered log of `(action, now)` envelopes; wall-clock samples are logged inputs, never ambient reads, so replaying the log reproduces the campaign exactly, including every timeout. The PRNG lives inside campaign state and threads immutably through reducers, so any snapshot contains everything a replay needs. All state is plain JSON-safe data (finite numbers, strings, booleans, null, arrays, plain objects; no Map, Set, Date, undefined, NaN, Infinity), collections are arrays sorted by stable ID with ID tie-breaks, and every sim-affecting quantity is an integer. An ESLint purity gate (from section 01) already bans Math.random, Date.now, performance.now, and DOM globals under `src/engine/**`.

By the time this section runs, the following exist and are tested:

- `src/engine/rng/`: `RngState`, `rngFromSeed`, `nextInt`, `forkStream` (section 02).
- `src/engine/records/`: evidence graph, `trace` pure selector, `isIndependentObservation`, corroboration semantics (section 03).
- `src/engine/time/`: `ScheduledEvent`, schedule materialization, `advanceToNow` with lastNow clamp, merged two-queue drain, 30-minute catch-up cap, timeout settlement (section 04).
- `src/engine/campaign/`: `CampaignState` valibot schema and InferOutput type, `dispatch(state, action, now)` envelope choke point, full action set (START_MISSION, FORFEIT_MISSION, ACKNOWLEDGE_DEBRIEF, INSPECT_RECORD, REQUEST_SOURCE_CHECK, SET_PREFERENCE, NEW_CAMPAIGN), settlement permanence, consequence folding with canonical order and aggregate capping, fourth-row unlock, dual scoreboard selectors (section 05).
- `src/engine/missions/`: `MissionModule` interface with `saveSchema`, the permanent test-double mission (deliver N of M tokens before the deadline, one decoy, one consequence emitted, two-field substate schema) (section 06).
- `src/engine/seeds/`: three curated seeds, walkthrough action logs as executable fixtures, timeout and partial-recovery fixture states, mechanical seed validation (section 07).
- `src/engine/save/`: composed valibot schema, versioned codec, migration pipeline, primary/backup fallthrough, monotonic settlement merge guard, storage port, byte budget (section 08).
- `src/engine/branch/`: `snapshot` deep-clone deep-freeze, `runBranch` on a separate unfrozen clone with `forkStream` per branch index, three scripted policies, `BranchProjection` (section 09).
- Test harness helpers (section 01): canonical stringify with recursively sorted keys, minus-zero normalization, and a state hash function, all living in the test tree.

This section wires those into one exported surface and proves the whole split's determinism story end to end. Dependencies: sections 07, 08, 09 (and transitively everything else). Nothing blocks on this section; it is last.

## Files

Create or modify:

- `src/engine/index.ts` (the public surface; may already exist as a stub from section 01)
- `test/engine/api/public-surface.test.ts`
- `test/engine/properties/determinism-run-twice.test.ts`
- `test/engine/properties/snapshot-replay.test.ts`
- `test/engine/properties/sabotage.test.ts`
- `test/engine/properties/six-permutation.test.ts`
- `test/engine/properties/model-commands.test.ts`
- `test/engine/properties/commands/` (one file or folder for the fc.commands command classes and the monotonic clock arbitrary)

Use the `@engine` alias for all imports from the engine. Property suites use `@fast-check/vitest` with fast-check 4.

## Tests First

Write these before touching `src/engine/index.ts`. The stubs say what to test, not how; fill bodies during implementation.

### Public API tests (TDD block 12) — `test/engine/api/public-surface.test.ts`

- Test: the exported surface exposes `dispatch` covering the full action set. Drive one campaign (test-double mission, fixture seed) entirely through `index.ts` exports and reach every action: FORFEIT_MISSION, ACKNOWLEDGE_DEBRIEF, INSPECT_RECORD, REQUEST_SOURCE_CHECK, SET_PREFERENCE, NEW_CAMPAIGN, plus mission actions and START_MISSION. Every one must be reachable through `dispatch`; no other exported function mutates campaign state.
- Test: no internal module leaks. An import-surface test asserts the set of named exports from `@engine` equals the documented list below, nothing more. (Snapshot `Object.keys(await import('@engine')).sort()` against the expected array; a new export without a test update fails CI.)
- Test: selectors are pure. For each exported selector, call it on a mid-campaign state and assert the state is deep-equal (and hash-equal via the canonical hash) before and after.

### Harness suites (TDD block 13)

`determinism-run-twice.test.ts`

- Test: canonical stringify sanity (the helpers are from section 01; this re-asserts them at the integration level): two deep-equal states built with different key insertion orders hash equal; a state containing `-0` hashes identically to the same state with `0`.
- Test: run-twice determinism. For each curated seed, fold its walkthrough `(action, now)` envelope log over `createCampaign` + `dispatch` twice from scratch; the two final states strict-equal (`toStrictEqual`) and hash-equal. Also run a second log variant that includes a timeout (reuse the timeout fixture path from section 07) so expiry is covered.

`snapshot-replay.test.ts`

- Test: snapshot-replay equivalence. Run a walkthrough log to completion recording state after every envelope. Pick a mid-log index k (test at least an early, middle, and late k), `snapshot` the state at k, replay envelopes k+1..end on top of the snapshot (via a fresh unfrozen structured clone, same as the branch runner does), and strict-equal plus hash-equal the result against the full run's final state.

`sabotage.test.ts`

- Test: the harness detects divergence. Inject nondeterminism through a seam that does not require editing `src/engine/**` (which the lint gate protects): e.g. a test-only mission module whose `reduce` consults `Math.random`, registered only inside this test, or a vi.spyOn over the RNG wrapper that returns live `Math.random` draws. Run the run-twice harness against it and assert the harness FAILS (the two runs differ in hash). The sabotage lives entirely in the test file; nothing is left behind.

`six-permutation.test.ts`

- Test: all six orderings of the three missions, driven by scripted walkthrough envelopes per mission, produce byte-identical story-time record chronology. Build the chronology as a pure selector output (records sorted by eventTime with ID tie-break) and compare canonical hashes across all six permutations; each permutation must also acknowledge all three debriefs and see the fourth row unlock (reach the finale phase gate).
- Test (folds into the same file): the folded initial conditions of any later mission are identical across permutations of prior settled outcomes; this overlaps the section 05 property test but is re-run here at the public-API level through `dispatch` only.

`model-commands.test.ts` (the hard one; budget most of the section's time here)

- fc.commands model-based suite. Command set mirrors the dispatch action set against the phase machine with the test-double mission. Shape:
  - A model type tracking just enough to predict validity: current phase, active mission id and endsAt, settled mission ids, acknowledged debriefs, lastNow.
  - One command class per action kind (StartMission, MissionAction, Forfeit, AcknowledgeDebrief, InspectRecord, RequestSourceCheck, SetPreference, NewCampaign, plus a pure AdvanceToNow command). Each implements `check(model)` (may run even for actions the engine should reject, since rejection-changes-nothing is itself an invariant) and `run(model, real)`.
  - A monotonic clock arbitrary: each command carries a generated non-negative delta (bias the distribution so large deltas that cross endsAt are common; timeout paths MUST be reachable, assert via a reached-timeout counter over the suite or a targeted precondition).
  - Invariants asserted after every command: lastNow non-decreasing; settled outcomes immutable once written (compare against a model-side frozen copy taken at settlement); both queues sorted by (scheduledAt, id); state is JSON-safe (walk it: no NaN, Infinity, undefined, Map, Set, Date, non-finite numbers); every field documented as integer remains an integer; rejected actions leave state hash unchanged.
  - Log the global fast-check seed on failure for reproduction (fast-check prints it by default; make sure the vitest reporter surfaces it, and pin `numRuns` to something CI-sized).

## Implementation

### 1. Public API surface (`src/engine/index.ts`)

One narrow surface, one rule: all player-driven mutation goes through `dispatch`. Export exactly this, re-exporting from internal modules (no logic lives in index.ts):

- `createCampaign(seedName, preferences)` — fresh CampaignState from a curated seed; preferences include `extendedTime`.
- `dispatch(state, action, now)` — the envelope choke point from section 05, covering the full action set (mission actions, START_MISSION, FORFEIT_MISSION, ACKNOWLEDGE_DEBRIEF, INSPECT_RECORD, REQUEST_SOURCE_CHECK, SET_PREFERENCE, NEW_CAMPAIGN).
- `advanceToNow(state, now)` — exposed for shell wake signals; dispatch already runs it internally.
- `snapshot(state)` and `runBranch(snapshot, kind)` — from section 09.
- Pure selectors: menu rows (including fourth-row unlock), `selectOpenExceptions`, `selectServiceOutcomes`, `trace`, active mission view data, debrief payloads, case file (inspected records plus source-check results with arrivedAfterSettlement markers), recovery flag.
- Save: `encodeSave`, `decodeSave`, the migration entry point, and the storage port TYPES (the port interface and result types; the shell binds localStorage).
- Seed catalog metadata: seed names and descriptions only, never raw SeedDefinition internals.
- Types needed by consumers: `CampaignState`, action union, `BranchProjection`, `SettledOutcome`, `MissionModule` (split 03-06 modules implement it), save payload and recovery-flag types.

Everything else stays internal. Do not export reducers, the RNG wrapper, queue helpers, or seed record graphs directly; if a test in this section needs an internal, it imports from the deep path in the test tree, not through `index.ts` (and the import-surface test keeps the public list honest).

### 2. Harness suites

The canonical stringify/hash helpers already exist in the test harness from section 01; import, do not duplicate. The run-twice and snapshot-replay suites should share a small `foldEnvelopes(initial, log)` helper in the test tree (fold-left of `dispatch` over `(action, now)` pairs) so every suite replays identically. Walkthrough logs come from section 07's executable fixtures; reuse them rather than hand-writing new logs except where a suite needs a timeout variant.

For the fc.commands suite, keep the model deliberately thin: it predicts only phase legality and deadline crossings, never mission internals. The real system under test is the public `dispatch` plus the test-double mission; invariants do the heavy lifting, not model-vs-real output equality. This generator is the genuinely hard part of the section (the plan budgets it as such); get the monotonic clock arbitrary and the JSON-safety walker right first, then grow the command set.

### 3. Acceptance closure

This section closes the split when all of the following are green in one `npm test` run: TDD blocks 12 and 13 above, plus the already-landed suites from sections 01 through 09, under the v8 coverage thresholds (lines 80, branches 75) scoped to `src/engine/**`. If coverage falls short, the gap almost certainly lives in rejection paths and selector branches; extend the model suite's command set before writing bespoke filler tests.

## Definition of Done

- `src/engine/index.ts` exports exactly the documented surface; the import-surface test pins it.
- Run-twice, snapshot-replay, sabotage, and six-permutation suites pass against all three curated seeds where parameterized.
- The fc.commands suite runs with generated monotonic clocks, reaches timeout paths, checks every listed invariant after every command, and logs the fast-check seed on failure.
- Full `npm test` green with coverage thresholds met; `tsc --noEmit` clean; ESLint purity gate clean.

## Amendment (2026-11-17, from the split 02 shell review)

Binding contract changes from the shell split's review:

1. The public dispatch and advanceToNow surfaces return { state,
   emitted: EngineEvent[] } (see section-05 amendment). The import-
   surface test includes the EngineEvent type export. Add a property to
   the model suite: replaying an identical envelope log reproduces the
   identical emitted sequence, and emitted settlement events appear
   exactly once per settled mission across any command sequence.
2. @engine/testing (the test-double export) exists and is excluded from
   the public-surface snapshot; add an assertion that importing
   @engine/testing does not widen the @engine export set.
3. BranchStep arrays join the branch repeatability assertions.

## Amendment 2 (2026-11-17, from the split 03 mission review)

clueFound is part of the EngineEvent export; the model-based suite's
invariants include cluesFound growing monotonically and clueFound
events firing exactly once per id.

## Amendment 3 (2026-11-17, from the splits 04 and 05 mission reviews)

SettlementCause includes 'collapsed'; the model suite generates
terminal-condition paths for both causes and asserts exactly-once
settlement and cause-tier independence (tier never derived from
cause). clueRecords inspection-gated clues join the cluesFound
monotonicity invariant.

## Amendment 4 (2026-11-17, from the split 06 finale review)

Public API additions: selectSettledMetrics (per-mission settled
metrics for the finale's projections and earned-why readback). The
finale SettledOutcome carries endingId; the import-surface snapshot
and the model suite's settlement invariants include it.

## As Built (section-10 implementation)

Implemented and committed. FINAL section of the 01-simulation-core split.
219 engine tests green; tsc and eslint clean; coverage lines 97%+ / branches 86%+ (thresholds 80 / 75).

### Public surface deviations from the plan
- `advanceCampaign` is exported as the shell wake entry (returns `{ state, emitted }`); the plan's `advanceToNow` name refers to the time-module queue-drain primitive, which stays internal.
- The plan's view selectors (active-mission view, debrief payloads, case file, recovery flag) are SHELL-layer concerns owned by split 02. The engine exposes the raw state fields (`inspectedRecords`, `sourceChecks`), `LoadResult.recovery`, and per-mission `MissionModule.debrief`; the shell composes the views.
- Public functions keep a leading `EngineContext` (the ctx threaded during implementation); `EngineContext`, `MissionModule`, `MissionRegistry`, `SeedDefinition` are exported so later splits can implement missions and assemble a ctx. `MissionRuntime`, `AppliedMarker`, `BriefingLine` are NOT exported (read via `CampaignState`). The runtime import-surface test pins value exports only; the type surface is not snapshot-guarded (known limitation).

### Property-suite scope
All five suites run against the permanent test-double mission (alpha/beta/gamma); the real seed missions (outlook/flights/bank) arrive in splits 03-06 with their own walkthrough fixtures.

### Review-driven strengthening
- six-permutation: replaced a tautological static-constant chronology hash with a `terminalFingerprint` derived from each play order's real end state (settled facts, acks, clues, finale gate), plus a negative anchor. Consequence folding is deliberately order-dependent (each consequence applies once, to the next mission started), so the invariant asserted is the order-independent terminal outcome facts.
- model-commands: rejected-action oracle also compares the emitted stream to a pure advance; NEW_CAMPAIGN positively asserts a clean reset before clearing accumulators.
- sabotage: taints a schema-permitted field (`inputLog`) so a future substate re-validation cannot wash it out.
- Added per-trail JSON-safety, a stuck-hash negative anchor, and a snapshot-replay emitted-tail assertion.
