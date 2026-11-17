# section-09-branch: Zero-Player Branch Machinery (src/engine/branch/)

## Purpose and Context

This section builds the branch simulation framework for SHALL WE PLAY A GAME?, a WarGames-inspired browser game whose engine is pure TypeScript under `src/engine/` with zero DOM, React, or asset dependencies, testable entirely in Node. The finale's centerpiece has Joshua run three zero-player futures against a snapshot of the live campaign. Projections must be reproducible and provably side-effect free: running a branch can never alter live play, and running the same branch on the same snapshot twice must return strictly equal results.

Scope honesty, stated up front: this section delivers the branch FRAMEWORK and its determinism guarantees (identical repeated projections, frozen-snapshot non-mutation, RNG stream separation), proven against the permanent test-double mission. The concrete projection computation over real mission metrics is an explicit seam that split 06 (the finale split, a separate planning split, not a section of this plan) fills later by pulling mission selectors. The `BranchProjection` type is defined here; its real population is not. Do not attempt to compute real mission metrics in this section.

### Governing architecture principles (apply to all code in this section)

1. Purity. Every state transition is a pure function `(prev, envelope) => next`. No IO, no ambient time, no ambient randomness. The ESLint purity gate (from section-01) bans `Math.random`, `Date.now`, `performance.now`, and DOM globals under `src/engine/**`.
2. The clock is logged input. The engine only sees wall time as the `now` field of dispatched envelopes or explicit `advanceToNow(state, now)` calls. Branch time is its own clock: discrete step counts inside zero-player simulations. Branch time never leaks into story time (seconds-of-day fiction chronology) or mission time (absolute epoch ms deadlines).
3. RNG as state. The PRNG lives inside campaign state and threads immutably through reducers. A snapshot therefore contains everything a branch run needs.
4. Integer simulation math. Every sim-affecting quantity in projections (exceptions, deliveries, passengers, payments, confidence) is an integer in its smallest unit. Division sites use floor unless documented otherwise at the site. No float equality, no transcendental Math functions.
5. Serializable everything. All state, including snapshots, projections, and step traces, is plain JSON-safe data: finite numbers, strings, booleans, null, arrays, plain objects with string keys. No Map, Set, Date, undefined, NaN, or Infinity. Collections are arrays sorted by stable ID; every sort comparator ends with an ID tie-break.

## Dependencies

- section-05-campaign: provides `CampaignState` (valibot schema plus InferOutput type), `dispatch(state, action, now)`, `advanceToNow`, the campaign phase machine, settlement, and the `RngState` threading. Branch runs reuse these same reducers.
- section-06-mission-interface: provides the `MissionModule` interface and the permanent test-double mission (deliver N of M tokens before the deadline, one decoy, one consequence emitted, two-field substate schema). All branch tests in this section run against campaigns built on the test-double mission.
- Transitively through 05: section-02-rng provides `forkStream(rng: RngState, streamIndex: number): RngState`, which is `clone()` plus `streamIndex` jump() applications yielding a 2^64-separated stream per branch index.

This section blocks section-10-properties-and-api, which exports `snapshot` and `runBranch` on the public surface and includes them in the cross-cutting property suites (snapshot-replay equivalence lives in section-10, not here).

## Files

Create:

- `src/engine/branch/snapshot.ts` (deep clone, deep freeze)
- `src/engine/branch/runBranch.ts` (branch runner, policies, projection, step trace)
- `src/engine/branch/types.ts` (BranchKind, BranchProjection, BranchStepTrace, viability types)
- `src/engine/branch/index.ts` (module exports consumed later by `src/engine/index.ts`)
- `test/engine/branch/snapshot.test.ts`
- `test/engine/branch/runBranch.test.ts`

Test command: `npm test` (Vitest 4, projects config, engine project in node environment, v8 coverage scoped to `src/engine/**`).

## Tests First (write these before implementing)

From the TDD plan, block 11. Stubs describe what to test, not how; use the canonical stringify / state-hash helpers from the section-01 test harness for deep comparisons where convenient.

- Test: `snapshot(state)` returns a deep-frozen object; mutating attempts throw in strict mode. Probe nested paths, not just the top level: `snapshot.rng`, `snapshot.activeMission.substate`, array elements of `campaignQueue` and `settled`.
- Test: `runBranch` leaves the frozen snapshot and the live state deep-equal to their before images. Capture canonical hashes of both the frozen snapshot and the original live `CampaignState` before the run, run every branch kind, re-hash, assert strict equality. This is the side-effect-free guarantee.
- Test: repeated `runBranch` on one snapshot returns strictly equal projections and step traces, per branch kind. Run each kind at least twice, deep-strict-equal the `BranchProjection` and the full step trace array.
- Test: the three branch kinds produce distinct projections on the test-double campaign (policies actually differ). Build a mid-campaign test-double fixture where the policies will diverge, run all three, assert no two projections are deep-equal.
- Test: branch RNG streams are forked per branch index; running branches in a different order does not change any branch's projection. Run `[REPEAT_D83, HOLD_AND_VERIFY, STAGED_RECOVERY]` then `[STAGED_RECOVERY, REPEAT_D83, HOLD_AND_VERIFY]` against the same snapshot; each kind's projection is strictly equal across orderings.
- Test: STAGED_RECOVERY viability flips when settled-outcome thresholds differ. Build two fixtures: a healthy campaign (good settled outcomes, thresholds satisfied) and a capacity-constrained fixture (poor settled outcomes); assert the viability result is true for the first and false for the second, with the threshold values visible in the result.

Supplementary tests justified by the architecture principles (keep them small):

- Test: `snapshot` output and `BranchProjection` plus step trace survive `JSON.parse(JSON.stringify(x))` unchanged (JSON-safety; no undefined, NaN, Map, Set leaking in).
- Test: all numeric fields of a `BranchProjection` are integers (`Number.isInteger`).

## Implementation

### snapshot(state): FrozenCampaignState

`snapshot(state)` deep-clones and deep-freezes `CampaignState`, including `rng`. Because all campaign state is JSON-safe plain data by principle (no Map, Set, Date, class instances), the deep clone can be a structural recursive clone of plain objects and arrays; the deep freeze recursively applies `Object.freeze` to every object and array in the clone. The frozen object is the untouched comparand: the side-effect test deep-compares it before and after branch runs. Return type can be typed `Readonly`-deep over `CampaignState`; a simple `DeepReadonly<CampaignState>` alias or just `CampaignState` documented as frozen is acceptable, since the runtime freeze is the actual guarantee under test.

### runBranch(snapshot, kind): BranchResult

    type BranchKind = 'REPEAT_D83' | 'HOLD_AND_VERIFY' | 'STAGED_RECOVERY'

    interface BranchProjection {
      openExceptions: number   // integer
      deliveries: number       // integer
      passengers: number       // integer
      payments: number         // integer
      confidence: number       // integer, smallest unit
    }

    interface BranchStep {
      step: number             // discrete branch-time step index, 0-based
      // description/action fields: a short JSON-safe record of what the
      // scripted policy did this step, enough for the shell to animate
      // and to deep-compare in the repeatability test
    }

    // Return shape: projection plus ordered step trace. Exact wrapper naming
    // is the implementer's choice; it must be JSON-safe and deep-comparable.

Execution discipline, in order:

1. Clone first. `runBranch` first makes a separate UNFROZEN deep clone of the snapshot. All branch execution happens on the clone; reducers never touch the frozen object. Do not attempt to run reducers against frozen state and rely on immutability conventions; the clone is the hard guarantee.
2. Fork the RNG. Seed the clone's RNG with `forkStream(rng, branchIndex)` where `branchIndex` is a fixed integer per `BranchKind` (assign stable indices, for example REPEAT_D83 = 0, HOLD_AND_VERIFY = 1, STAGED_RECOVERY = 2, documented in `types.ts`). This is what makes branch order irrelevant: each branch draws from its own 2^64-separated stream derived from the snapshot's RNG state, never from a shared mutating stream.
3. Step branch time. Branch time is discrete step counts, not wall clock. Each step applies the branch's fixed policy as scripted zero-player envelopes through the SAME reducers used by live play where operations are shared (dispatch/advanceToNow from section-05 over the test-double mission module). Synthetic `now` values for these envelopes are derived deterministically from the snapshot's `lastNow` plus step offsets; they exist only inside the clone and never feed back to live state.
4. Record the trace. Collect a short ordered step trace the shell can animate and skip. Keep it compact and JSON-safe.
5. Project. Compute `BranchProjection` fields from the clone's end state. Against the test-double mission these are honest but simple derivations (token deliveries, exception counts from the test-double's metrics); this is the seam. Mark the projection-population site with a clear comment naming the split-06 seam: split 06 fills real projection computation by pulling mission selectors, and the 06 spec already names this dependency. Do not leave the values fake or constant; they must differ across the three policies so the distinctness test is meaningful, but they only need to be meaningful for the test-double mission.

### The three scripted policies

Each policy is a fixed, deterministic script of zero-player envelopes against the test-double mission. Author them so their end states genuinely differ:

- REPEAT_D83: the escalation branch. Replays the exercise-driven aggressive line: act on every event as if the emergency were real, maximizing forced-inactivity responses. Against the test-double, this is the policy that burns capacity fastest (for example, responds to the decoy as if genuine).
- HOLD_AND_VERIFY: the passive branch. Withholds action pending verification; lets deadlines run while confirming. Against the test-double, delivers few or no tokens, accrues timeout-shaped outcomes.
- STAGED_RECOVERY: the measured branch. Acts in stages gated by viability thresholds (below). Against the test-double, delivers tokens selectively, avoiding the decoy.

The policies are data plus a small interpreter, or three small script functions; either is fine. What matters: same snapshot in, same script, same forked stream, same result out, every time.

### STAGED_RECOVERY viability

Viability is evaluated against visible per-campaign service thresholds shaped by settled outcomes (better earlier mission outcomes widen finale recovery options via thresholds carried in settled metrics, per the campaign design). Implement a pure function that reads the snapshot's `settled` outcomes (their metrics), compares against integer thresholds defined in `types.ts`, and returns a JSON-safe viability result including the threshold values and the pass/fail per threshold, so the shell (and split 06) can show WHY staged recovery is or is not viable. The viability result feeds the STAGED_RECOVERY policy (gates its stages) and is consumed by split 06. The flip test drives this with a healthy fixture versus a capacity-constrained fixture.

### Relevant CampaignState shape (for reference; owned by section-05, do not redefine)

    interface CampaignState {
      seedName: string
      rng: RngState
      lastNow: number
      phase: 'menu' | 'mission' | 'debrief' | 'finale' | 'ended'
      activeMission: MissionRuntime | null
      campaignQueue: ScheduledEvent[]
      settled: SettledOutcome[]
      acknowledgedDebriefs: string[]
      cluesFound: ClueId[]
      sourceChecks: SourceCheckResult[]
      inspectedRecords: string[]
      appliedConsequences: AppliedMarker[]
      preferences: { extendedTime: boolean, ... }
    }

## Acceptance for this section

All block-11 tests above pass under `npm test`; the ESLint purity gate stays green over `src/engine/branch/**`; nothing in this section mutates frozen snapshots or live state; repeated runs and reordered runs are bit-identical per branch kind; the split-06 projection seam is marked in code where projections are populated. Export `snapshot`, `runBranch`, `BranchKind`, `BranchProjection`, and the viability types from `src/engine/branch/index.ts` so section-10 can surface them on the public API.

## Amendment (2026-11-17, from the split 02 shell review)

Binding contract change from the shell split's review: the step trace
element type is pinned as BranchStep { step: number, label: string,
detail: string }, JSON-safe, exported from types.ts. runBranch returns
the projection plus BranchStep[]. The shell animates these entries in
its character grid (skippable, instant under reduced motion); split 06
authors the real labels and details. Tests comparing step traces for
repeatability compare the full BranchStep arrays.

## Amendment 4 (2026-11-17, from the split 06 finale review)

Finale usage note: the finale's branch policies are pure transforms
over settled SettledOutcome metrics plus the exception selector (no
mission substate exists post-settlement); forkStream is unused by
those policies. This section's reducer-replay and RNG-stream
guarantees remain proven against the test-double mission; the
BranchProjection type and runBranch surface are unchanged.
