# TDD Plan: 01-simulation-core

Companion to claude-plan.md; same section headings. Stack: Vitest 4 (projects
config, engine project environment node), @fast-check/vitest with fast-check 4,
v8 coverage scoped to src/engine/**. Every test here runs headless in Node. Write
the tests for a section before implementing it; stubs below are what to test, not
how.

## 3. Tooling, dependencies, and layout

- Test: vitest runs a trivial engine spec in the node environment through the
  @engine alias.
- Test: ESLint purity gate fails a fixture file using Math.random, Date.now,
  performance.now, and window under src/engine/** (lint invoked on a bad fixture
  in a meta test or CI step).
- Test: tsc --noEmit passes on the skeleton.

## 4. RNG subsystem

- Test: rngFromSeed(sameSeed) twice, identical draw sequences.
- Test: nextInt bounds inclusive on both ends; distribution hits min and max over
  many draws; never outside range.
- Test: nextInt returns a NEW RngState and never mutates input; calling it on a
  deep-frozen RngState succeeds (no throw in strict mode) and returns a fresh
  object.
- Test: RngState JSON round-trip (stringify, parse) continues the exact sequence.
- Test: forkStream(rng, i) and forkStream(rng, j), i differs from j, produce
  non-overlapping sequences over a large sample; forkStream is deterministic for
  equal inputs.

## 5. Evidence record graph

- Test: trace returns origin, eventTime, receiptTime, and parent summary for a
  DERIVED record; null parent fields for an origin record; trace is pure (state
  deep-equal before and after).
- Test: INSPECT_RECORD dispatch adds the record id to inspectedRecords once;
  repeat dispatch does not duplicate.
- Test: REQUEST_SOURCE_CHECK appends exactly one desk-reply event to the
  campaign-level queue with the seed-authored delay; reply resolves to the
  authored outcome at its scheduledAt.
- Test: PENDING and UNKNOWN replies carry zero corroboration (corroboration
  selector returns zero for them; CONFIRMED returns nonzero).
- Test: a reply scheduled past the active mission's endsAt still resolves after
  settlement, lands in sourceChecks with arrivedAfterSettlement true, and
  persists into later phases.
- Test: isIndependentObservation accepts an OBSERVED record with no claim-run
  ancestry; rejects DERIVED records; rejects OBSERVED-labeled records whose
  parent chain reaches the claim run; verdict carries the expected reason code
  per rejection class.

## 6. Curated seeds

- Test (per seed, parameterized over all three): every story time in [0, 86400);
  parent chains time-monotonic (child eventTime >= parent eventTime).
- Test (per seed): at least one record passes isIndependentObservation against
  the seed's exercise run.
- Test (seed one): C17/F06/B04 times match the requirements table exactly;
  receipt order (C17, B04, F06) contradicts event order (C17, F06, B04); W02 has
  no R04 ancestry.
- Test (per seed): the walkthrough action log replays to the documented best
  outcome; timeout fixture state settles as timeout; partial-recovery fixture
  loads and reaches the finale.
- Test: SeedDefinition numeric tuning values are all integers.

## 7. Time and scheduling

- Test: mission start materializes offsets to absolute times and endsAt for
  standard duration; extended doubles endsAt and scales offsets proportionally.
- Test: advanceToNow drains due events from both queues merged in
  (scheduledAt, id) order; a tie on scheduledAt breaks by id.
- Test: events are deleted as processed; calling advanceToNow twice with the
  same now changes nothing the second time (double-wake idempotence).
- Test: now below lastNow is clamped: no event un-fires, settlement stands,
  lastNow never decreases.
- Test: timeout settles exactly once when now passes endsAt, including when the
  deadline passed long ago (reload discovery) and when a menu overlay action
  envelope arrives after the deadline.
- Test: catch-up span beyond 30 minutes clamps; a campaign-queue event scheduled
  beyond the clamp drains on the following advanceToNow.

## 8. Campaign state machine

- Test: invalid, unknown, and out-of-phase actions are rejected and state is
  strictly unchanged (deep-equal, same reference where applicable).
- Test: any of the three missions can start first from the menu.
- Test: settlement permanence: completed, timeout, and forfeit each write one
  final SettledOutcome; re-dispatching settlement-adjacent actions, reloading,
  acknowledging the debrief, and reselecting the settled row never change it.
- Test: FORFEIT_MISSION routes to evaluate with cause forfeit.
- Test: consequence folding: markers keyed (consequenceId, targetMissionId); a
  consequence from mission A applies to both B and C exactly once each.
- Property test: any permutation of the same settled outcomes yields identical
  folded initial conditions (canonical order plus aggregate capping).
- Test: aggregate cap applies to the sum per type, not pairwise (two magnitudes
  that individually fit but jointly exceed the cap clamp to the cap).
- Test: fourth menu row hidden until all three debriefs acknowledged; appears
  regardless of outcome quality.
- Test: selectOpenExceptions and selectServiceOutcomes derive from the same
  state and diverge in the documented direction when a forced-inactivity order
  lands (exceptions fall, service outcomes worsen).
- Test: NEW_CAMPAIGN resets outcomes and accepts same or different seed.
- Six-permutation test: all mission orders produce byte-identical story-time
  record chronology (canonical hash) and reach the finale.

## 9. Mission-module interface

- Test-double mission lifecycle end to end: start, scheduled events fire, valid
  actions reduce, invalid actions rejected, completion path settles, timeout
  path settles, forfeit path settles, debrief payload matches outcome, its
  consequence folds into a later test-double start.
- Test: mission substate round-trips through the composed saveSchema; a
  corrupted substate fails validation and triggers the save fallthrough.
- Test: missions receive draws and times only via events (interface-level: the
  test-double records every input it sees; none are ambient).

## 10. Save system

- Test: encode/decode round-trip strict-equals state; CampaignState TS type is
  InferOutput of the schema (compile-time, plus a runtime parse of a canonical
  fixture).
- Test: corrupt primary falls to backup; corrupt both falls to fresh with
  recovery flag reset; intact primary loads with flag clean.
- Test: a THROWING migration falls through to backup (not just parse and
  validation errors).
- Test: migration pipeline applies v0-to-v1 on a synthetic old save (pipeline
  test exists from day one with a fabricated version bump).
- Test: monotonic merge guard on the backup path: a stale backup with an
  unsettled mission cannot roll back a settled outcome from current session
  state.
- Test: storage port quota error drops backup slot and retries once; all port
  calls fallible without crashing the engine.
- Test: full-campaign save (walkthrough end state) stays under the 64 KB budget.

## 11. Branch machinery

- Test: snapshot returns a deep-frozen object; mutating attempts throw in strict
  mode.
- Test: runBranch leaves the frozen snapshot and the live state deep-equal to
  their before images.
- Test: repeated runBranch on one snapshot returns strictly equal projections
  and step traces, per branch kind.
- Test: the three branch kinds produce distinct projections on the test-double
  campaign (policies actually differ).
- Test: branch RNG streams are forked per branch index; running branches in a
  different order does not change any branch's projection.
- Test: STAGED_RECOVERY viability flips when settled-outcome thresholds differ
  (healthy campaign vs capacity-constrained fixture).

## 12. Public API

- Test: the exported surface exposes dispatch covering the full action set
  (forfeit, debrief ack, inspection, source check, preferences, new campaign
  all reachable through dispatch); no internal module leaks (import surface
  test).
- Test: selectors are pure (state unchanged after every selector call).

## 13. Testing strategy (the harness itself)

- Canonical stringify: recursively sorted keys; equal states hash equal across
  insertion orders; minus-zero normalizes to zero before hashing.
- Run-twice determinism: same seed plus same (action, now) envelope log strict-
  equals and hash-equals.
- Snapshot-replay equivalence: snapshot mid-log, replay suffix, strict-equal
  full run.
- Sabotage test: a reducer wired to Math.random makes the run-twice harness
  fail (asserts the harness detects divergence, then removes the sabotage).
- fc.commands model suite: command set mirroring dispatch actions with
  generated monotonic now samples; invariants checked after every command:
  lastNow non-decreasing, settled outcomes immutable once written, queues
  sorted, state JSON-safe (no NaN, Infinity, undefined, Map, Set), integers
  stay integers. Timeout paths must be reachable by generated clock advances.
  Global fast-check seed logged for reproduction.
