# Implementation Plan: 01-simulation-core (revised after review)

The headless engine for SHALL WE PLAY A GAME?, a WarGames-inspired browser game
shipping as a static React/Vite site. This plan is self-contained: it describes what
to build, why it is shaped this way, and how to implement it, without assuming any
prior context. It is a blueprint; code bodies are the implementer's job. Revision 2
integrates the Opus architectural review (reviews/iteration-1-opus.md,
claude-integration-notes.md).

## 1. Overview

The engine is pure TypeScript under src/engine/ with zero DOM, React, or asset
dependencies, testable entirely in Node. It owns: the evidence record graph the
whole game argues about, a deterministic clock and event scheduler, the campaign
state machine with permanent mission settlement and cross-mission consequences,
three curated campaign seeds, a versioned validated save, and zero-player branch
simulation. Four mission rule sets (built in later splits) plug in through a
mission-module interface; a minimal test-double mission ships inside this split so
the full lifecycle is exercised end to end before any real mission exists.

The game's dramatic premise constrains the engineering: WOPR misreads one exercise
export (D-83, run R04) as three independent emergencies. The player wins by reading
record provenance. Therefore provenance is first-class data, the independence rule
is one shared validator, and determinism is absolute. The canonical record of any
campaign is its seed plus the ordered log of (action, now) envelopes; wall-clock
samples are part of the log, not ambient inputs, so replaying the log reproduces
the campaign exactly, including every timeout. Any snapshot can seed an identical
replay. The finale's centerpiece has Joshua run three zero-player futures against a
snapshot of the live campaign; projections must be reproducible and provably
side-effect free.

Player-facing scope decisions already made: three shipped curated seeds (no
procedural generation, no arbitrary player seeds); timers are Standard (4-minute
missions, 3-minute finale) or Extended (exactly double), chosen before start.

## 2. Architecture principles

1. Purity. Every state transition is a pure function (prev, envelope) to next. No
   IO, no ambient time, no ambient randomness. ESLint enforces it: no-restricted-
   globals and no-restricted-properties ban Math.random, Date.now, performance.now,
   and DOM globals under src/engine/**.
2. The clock is logged input. The engine only ever sees wall time as the now field
   of a dispatched envelope or an explicit advanceToNow(state, now) call, and the
   campaign log records every such sample. CampaignState carries a lastNow
   high-water mark; every incoming now is clamped to max(now, lastNow) before any
   processing, so a backward system-clock jump can never un-expire a deadline,
   reorder processed events, or diverge a replay.
3. Three clocks that never leak into each other.
   Story time: the fictional incident chronology (21:14:00 and onward), fixed per
   seed, identical across all six mission orders. Seconds-of-day integers; a
   seed-load assertion requires all story times within [0, 86400) and parent
   chains time-monotonic, so midnight wrap is impossible by construction.
   Mission time: the real countdown, persisted as absolute epoch ms (endsAt).
   Branch time: discrete step counts inside zero-player simulations.
4. RNG as state. The PRNG lives inside campaign state and threads immutably
   through reducers. A snapshot therefore contains everything a replay needs.
5. Integer simulation math. Every sim-affecting quantity (confidence, liquidity,
   capacity, counts, scores) is an integer in its smallest unit. Division sites
   use a documented rounding rule (floor unless stated otherwise at the site).
   No float equality tests, no transcendental Math functions in sim logic.
   Minus-zero is normalized to zero at state boundaries.
6. One source of truth, two scoreboards. WOPR's OPEN EXCEPTIONS tally and the real
   service outcomes are both pure selectors over the same campaign state.
7. Monotonic settlement. A mission settles exactly once; settled facts merge
   monotonically on every load path (primary and backup alike), so reloads,
   double wakes, and backup recovery can never unsettle, resettle, or re-apply.
8. Serializable everything. All state is plain JSON-safe data: finite numbers,
   strings, booleans, null, arrays, plain objects with string keys. No Map, Set,
   Date, undefined, NaN, or Infinity in persisted or snapshot state. Collections
   are arrays sorted by stable ID; every sort comparator ends with an ID
   tie-break.

## 3. Tooling, dependencies, and layout

Runtime dependencies: pure-rand (PRNG, ~8.4.x) and valibot (schemas, 1.x). Nothing
else. Dev dependencies: typescript, vitest 4, @fast-check/vitest with fast-check 4,
eslint with the purity rules. Vitest 4 uses the projects config (the workspace file
is gone in v4); the engine project runs environment node; coverage uses the v8
provider scoped to src/engine/** with thresholds (lines 80, branches 75). A
@engine path alias resolves src/engine from app and tests.

This split initializes the repository skeleton it needs (package.json, tsconfig,
vitest.config.ts, eslint config) in a way split 02 will extend rather than replace:
strict TypeScript, moduleResolution bundler, no emit (Vite builds; Vitest runs TS
directly).

Directory layout:

    src/engine/
      rng/            PRNG wrapper, stream discipline
      time/           story-time types, schedule materialization, advanceToNow
      records/        evidence graph, trace selector, source checks, independence
      campaign/       campaign state machine, settlement, consequences, selectors
      missions/       mission-module interface types + test-double mission
      seeds/          three curated seeds, walkthrough fixtures, seed validation
      save/           codec, migrations, valibot schemas (source of truth)
      branch/         snapshot, zero-player branch runner
      index.ts        public API surface consumed by the shell
    test/engine/      mirrors src/engine; integration and property suites

## 4. RNG subsystem (src/engine/rng/)

Wrap pure-rand's xoroshiro128plus behind a tiny engine-owned interface so pure-rand
types never spread through the codebase.

    interface RngState        // JSON-safe opaque encoding of generator state
    function rngFromSeed(seed: number): RngState
    function nextInt(rng: RngState, min: number, max: number): [number, RngState]
      // Uniform integer draw, inclusive of BOTH bounds, delegating to pure-rand's
      // unbiased uniform distribution (never modulo reduction). Returns the value
      // plus a NEW RngState; the input state object is never written to, and a
      // test proves nextInt works on a deep-frozen RngState.
    function forkStream(rng: RngState, streamIndex: number): RngState
      // clone() plus streamIndex jump() applications: 2^64-separated stream for
      // parallel branch simulations.

pure-rand generators are objects with methods; RngState holds their serialized
numeric state and the wrapper reconstructs the generator per call, reading but
never mutating the input. Curated seeds mean the engine draws randomness rarely
(desk reply jitter, nothing load-bearing); determinism, not statistical quality,
is the requirement, and xoroshiro128plus passes PractRand regardless.

## 5. Evidence record graph (src/engine/records/)

Types (fields only):

    type OriginKind = 'OBSERVED' | 'EXERCISE' | 'DERIVED'
    interface EvidenceRecord {
      id: string              // stable, e.g. 'C17', 'F06', 'B04', 'W02'
      origin: OriginKind
      sourceId: string        // issuing system or desk, e.g. 'D83-EXPORT', 'FIELD-NW'
      parentId: string | null // provenance edge; null for true origins
      runId: string | null    // exercise run stamp, e.g. 'R04'; null if none
      eventTime: number       // story seconds-of-day, when it happened
      receiptTime: number     // story seconds-of-day, when the terminal got it
      subsystem: 'outlook' | 'flights' | 'bank'
      body: string[]          // inspectable text lines, authored
    }

Services:

    function trace(graph, recordId): TraceResult
      // PURE SELECTOR, no state change: origin kind, event and receipt times,
      // parent record summary when present. Recording that the player inspected
      // a record is a separate dispatched INSPECT_RECORD action; inspected
      // records arrive highlighted in the finale case file.
    // CHECK SOURCE is a dispatched action (REQUEST_SOURCE_CHECK). It appends a
    // desk-reply event to the CAMPAIGN-LEVEL event queue (not the mission queue)
    // after a seed-authored visible wait. Reply outcomes (CONFIRMED /
    // CONTRADICTED / PENDING / UNKNOWN) are authored per record per seed;
    // PENDING and UNKNOWN carry zero corroboration. Because the queue is
    // campaign-level, a reply scheduled past the mission's endsAt still resolves
    // at its scheduled time in whatever phase the campaign is then in (debrief,
    // menu, finale); the result persists in the case file with an
    // arrivedAfterSettlement marker. Finale field-report requests reuse the same
    // mechanism under the finale clock.
    function isIndependentObservation(graph, recordId, claimRunId): Verdict
      // THE independence rule, used by mission guidance and the finale case
      // validator alike: a record is independent corroboration only if its
      // ancestry (parent chain) never touches claimRunId and its origin is
      // OBSERVED. DERIVED repetition of an upstream claim is zero corroboration
      // no matter how accurate. Verdict carries a reason code for Joshua lines.

The case-builder validation in the finale (split 06) consumes these primitives:
event-time ordering checks, root-source identification against actual parent
links, and the required one independent OBSERVED record about emergency scope.
The validator lives here so missions and finale cannot drift apart.

## 6. Curated seeds (src/engine/seeds/)

A seed is authored content plus initial conditions, typed as one SeedDefinition:
record graph per subsystem, mission content payloads (messages, flights, accounts;
consumed by mission modules), desk-check reply table, storm track, event schedules,
and numeric tuning (channel capacities, liquidity, confidence thresholds, all
integers per principle 2.5).

Seed one is the fixture from the requirements, run R04:
- Outlook C17: event 21:14:00, receipt 21:14:05, EXERCISE, source D-83 export.
- Flights F06: event 21:14:08, receipt 21:14:52, DERIVED from C17, run R04; beside
  it an OBSERVED field report showing local weather and an open corridor.
- Bank B04: event 21:14:21, receipt 21:14:30, DERIVED citing F06, assuming a
  system-wide shutdown.
- Decoy W02: OBSERVED local weather warning, own origin, no R04 ancestry; explains
  a real local restriction and establishes the true (local) scope.

The receipt ordering (C17, B04, F06) contradicts event ordering (C17, F06, B04) on
purpose; parent links and event times resolve it. Seeds two and three repeat the
shape with different concrete content, times anchored to different minutes,
different decoy flavors, same solvability guarantees.

Seed validation is mechanical, not editorial. A seed-fixture test asserts for
every seed: all story times in [0, 86400) with time-monotonic parent chains; at
least one record passes isIndependentObservation against the seed's exercise run
(else the finale is unwinnable); the walkthrough action log reaches the best
outcome; the timeout and partial-recovery fixture states load and settle
correctly. An authoring error fails CI, never a playthrough.

Mission-specific content inside seeds is typed loosely here (opaque payload per
mission id) and tightened by each mission split; the test-double mission defines
its own tiny payload to prove the pattern.

## 7. Time and scheduling (src/engine/time/)

    interface ScheduledEvent {
      id: string
      scheduledAt: number     // absolute epoch ms once materialized
      kind: string            // event discriminator routed to reducers
      payload: unknown
    }

Two queues, same drain discipline: the mission queue (materialized at mission
start, deleted at settlement) and the campaign queue (source-check replies and
other cross-phase events; survives settlement).

- Mission start takes authored offsets (seconds from mission start) and the
  chosen duration (standard or extended; extended doubles duration and scales
  offsets proportionally so pacing holds), materializes absolute scheduledAt
  values and endsAt, and stores queue plus deadline in campaign state.
- advanceToNow(state, rawNow) is the only way time passes. First clamp:
  now = max(rawNow, state.lastNow); catch-up spans beyond 30 minutes clamp to the
  cap (safety rail; missions are at most 8 minutes, and campaign-queue events
  simply drain on the next wake if beyond it). Then drain both queues merged in
  (scheduledAt, id) order for every event with scheduledAt <= now, deleting each
  event as it is processed; after draining, if now >= endsAt and the active
  mission is unsettled, settle it as timed out. Finally record lastNow = now.
  Exactly-once is structural: processed events leave their queue, settlement
  guards on settled state. This covers timeout during a menu overlay, during
  background, or discovered on reload; the shell simply calls advanceToNow on
  every wake signal, and dispatch runs it before every reduction.

## 8. Campaign state machine (src/engine/campaign/)

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

- Envelope dispatch: dispatch(state, action, now) clamps now, runs advanceToNow,
  validates the action (unknown, out-of-phase, or rule-violating actions are
  rejected and provably change nothing), then reduces. The campaign log is the
  ordered list of these (action, now) envelopes; replay is fold-left over them.
  Commands and buttons both produce these same typed actions: the single choke
  point that makes "invalid actions cannot change game state" true. The full
  player-driven action set includes mission actions plus START_MISSION,
  FORFEIT_MISSION (shell confirms first; engine routes to settlement with cause
  'forfeit'), ACKNOWLEDGE_DEBRIEF, INSPECT_RECORD, REQUEST_SOURCE_CHECK,
  SET_PREFERENCE, NEW_CAMPAIGN, and the finale actions defined by 06.
- Settlement: settleMission(state, result) writes a SettledOutcome (outcome tier,
  metrics, clue, consequences emitted) exactly once; the save layer flushes
  immediately on settlement. Reselecting a settled mission yields its record for
  display; replay requires NEW_CAMPAIGN.
- Consequences: typed facts (commsDelayed, flightsDisrupted, paymentsDelayed,
  each with integer magnitude). When a mission starts, the engine selects every
  settled consequence without an AppliedMarker for this target mission, folds
  them in canonical order (sorted by consequenceId), with capping defined over
  the per-type AGGREGATE (cap applied once to the sum, never pairwise), records
  the markers, and surfaces briefing lines describing the change. A property
  test asserts any permutation of prior outcomes yields identical folded initial
  conditions.
- Unlock: row four appears when all three debriefs are acknowledged, regardless
  of outcomes. Better earlier outcomes widen finale recovery options via
  thresholds carried in settled metrics.
- Scoreboards: selectOpenExceptions(state) and selectServiceOutcomes(state) are
  pure selectors; WOPR counts forced inactivity (grounded fleets, held accounts,
  dark inboxes) as resolved exceptions while service outcomes count the same
  facts as damage. Both derive from identical state by construction.
- NEW_CAMPAIGN: explicit dispatched action producing a fresh CampaignState from a
  chosen seed name; never implicit.

## 9. Mission-module interface (src/engine/missions/)

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

Missions never see wall clock or RNG primitives directly; draws and times arrive
in events. The engine owns lifecycle sequencing. saveSchema closes the open-typed
substate hole: CampaignState validation composes the active mission's schema at
load, so splits 03 to 06 get save validation for free and the engine never holds
unvalidatable opaque state. A test-double mission (deliver N of M tokens before
the deadline, one decoy, one consequence emitted, a two-field substate schema)
ships in this split and stays in the test tree permanently: it exercises start,
dispatch, scheduling, catch-up, timeout, forfeit, settlement, debrief, consequence
folding, save round-trips, and branch running without any real mission content.

## 10. Save system (src/engine/save/)

- The Valibot schema is the source of truth for persisted shapes; the
  CampaignState TypeScript type derives from it via InferOutput, so schema and
  type cannot drift. Mission substates validate through the composed
  MissionModule.saveSchema.
- Payload { version: 1, state: CampaignState } serialized to JSON under key
  'wargames.save.primary'; backup under 'wargames.save.backup' written only after
  a confirmed good primary write. The engine exposes pure encode/decode plus a
  storage port interface; the shell binds it to localStorage and schedules
  debounced writes with flushes on hide/pagehide and on settlement.
- Load path: parse, migrate (ordered array of pure, total, defensive
  (unknown) => unknown functions from stored version to current; empty at v1 but
  the pipeline and its test exist from day one), validate, then the monotonic
  settlement merge guard. A throw ANYWHERE (parse, any migration, validation)
  falls through primary to backup to fresh. The merge guard runs on every load
  path including backup recovery, so a stale backup can never resurrect an
  unsettled mission or roll settlement backward. The result carries a recovery
  flag ('clean' | 'recovered-backup' | 'reset') the shell renders as the visible
  reset path.
- Storage port treats every call as fallible (Safari private mode, ITP eviction,
  quota); QuotaExceededError drops the backup slot and retries once.
- A byte-budget test keeps a full-campaign save under a fixed budget (64 KB) so
  future authored content cannot creep toward mobile quota limits.

## 11. Branch machinery (src/engine/branch/)

- snapshot(state) deep-clones and deep-freezes CampaignState (including rng). The
  frozen object is the untouched comparand: the side-effect test deep-compares it
  before and after. runBranch first makes a separate unfrozen deep clone and all
  branch execution happens on the clone; reducers never touch the frozen object.
- runBranch(snapshot, 'REPEAT_D83' | 'HOLD_AND_VERIFY' | 'STAGED_RECOVERY'):
  seeds the clone's RNG with forkStream(rng, branchIndex), steps branch time over
  the same reducers used by live play where operations are shared, applying the
  branch's fixed policy as scripted zero-player envelopes, and returns a
  BranchProjection { openExceptions, deliveries, passengers, payments,
  confidence } plus a short step trace the shell can animate and skip.
- Scope honesty: this split delivers the branch FRAMEWORK and its determinism
  guarantees (identical repeated projections, frozen-snapshot non-mutation,
  stream separation), proven against the test-double mission. The concrete
  projection computation over real mission metrics is an explicit seam that
  split 06 fills by pulling mission selectors; BranchProjection's type is defined
  here, its real population is not. The 06 spec already names this dependency.
- STAGED RECOVERY viability: evaluated against visible per-campaign service
  thresholds shaped by settled outcomes (consumed by 06).

## 12. Public API (src/engine/index.ts)

One narrow surface for the shell, with one rule: all player-driven mutation goes
through dispatch. Exported: createCampaign(seedName, preferences), dispatch
(covering the full action set of section 8 including forfeit, debrief
acknowledgment, inspection, source checks, preferences, new campaign),
advanceToNow, snapshot, runBranch, pure selectors (menu rows, scoreboards, trace,
active mission view data, debrief payloads, case file, recovery flag), save
encode/decode/migrate and the storage port types, seed catalog metadata (names,
descriptions). Everything else stays internal to src/engine/.

## 13. Testing strategy notes

The TDD companion document maps tests per section; headline commitments:

- Determinism: run-twice strict equality over (seed, envelope log); state hashing
  uses a canonical stringify with recursively sorted keys written for the test
  harness; minus-zero normalization asserted at boundaries. One deliberate
  Math.random sabotage test proves the harness detects divergence.
- Model-based property testing with fc.commands: a command set mirroring the
  dispatch action set, generating monotonic now samples (so timeout paths are
  exercised), run against the phase machine with the test-double mission. This
  generator is a real effort item, budgeted as its own implementation section.
- Snapshot-replay equivalence: snapshot mid-log, replay the suffix on the
  snapshot, strict-equal the full run.
- Six-permutation test: all mission orders produce byte-identical story-time
  chronology and order-independent folded initial conditions.
- Settlement permanence, catch-up idempotence (double wake drains nothing twice),
  timeout-during-overlay, expired-session-on-reload, backup-recovery merge guard,
  quota failure, corrupt-save fallthrough, seed validation invariants, frozen
  RngState safety, byte budget.

## 14. Risks and mitigations

- Content volume (three seeds of authored records and payloads) is the biggest
  effort sink; mitigated by typing SeedDefinition early, the seed-validation
  fixture tests catching authoring errors mechanically, and mission payload
  types staying opaque at this layer.
- Determinism regressions sneak in through sorts, object iteration, and float
  drift; mitigated by the ID tie-break rule, JSON-safe integer-math state rules,
  canonical-hash run-twice tests, and the sabotage test.
- Interface guesswork for missions not yet planned; mitigated by the test-double
  mission proving the interface shape (including saveSchema composition and
  branch running) and by the named 06 seam for branch projections.
- The fc.commands generator is genuinely hard; mitigated by budgeting it as its
  own section with the test-double mission as its fixed target.

## 15. Contract amendments from the split 02 review (2026-11-17)

The shell plan's review surfaced four cross-split contract gaps. These amend
sections 7, 8, 9, 11, and 12 and are binding on implementation; the affected
section files carry matching amendment blocks.

1. Event emission. dispatch and advanceToNow return { state, emitted:
   EngineEvent[] }: the ordered list of events materialized during that call,
   corresponding one-to-one with queue deletions and settlement transitions,
   so downstream exactly-once consumption is structural. EngineEvent is a
   JSON-safe discriminated union: missionStarted, scheduledEventFired,
   timerMilestone, settlement, phaseChanged, consequenceApplied,
   sourceCheckResolved, debriefAcknowledged, finaleFinalPhase,
   branchRunCompleted, campaignReset. Replay folds ignore emitted (state is
   still the only truth); emitted exists so the shell can drive audio,
   announcements, and lamp transitions without state diffing.
2. Milestones are engine-owned. Mission start materializes seed-authored
   timer-milestone events (including the 30 and 10 second warnings) into the
   mission queue alongside gameplay events; they scale with extended time,
   drain like any event, and surface in emitted as timerMilestone.
3. CampaignState gains startedMissionIds: string[], appended by START_MISSION,
   so campaign-begun (the extended-time preference lock, among others) is an
   explicit total derivation.
4. BranchStep is pinned as { step: number, label: string, detail: string },
   JSON-safe; the step trace returned by runBranch is BranchStep[]. The shell
   defines the animation consumption; split 06 authors content.
5. The test-double mission is exported through a dedicated @engine/testing
   entry point (excluded from the shipped public surface and the production
   bundle) so downstream splits' test trees can import it.

## 16. Contract amendment from the split 03 review (2026-11-17)

6. Clue emission channel. MissionModule gains an optional pure selector
   clues(state: S): ClueId[]. After every mission reduce, the engine
   lifecycle polls it and monotonically merges any new ids into
   CampaignState.cluesFound, emitting one clueFound EngineEvent per new id
   (clueFound joins the EngineEvent union). This lets a mission log a clue
   the moment its condition is met (for example reading the audit message in
   CRASH OUTLOOK) while reducers stay pure and campaign state stays
   engine-owned; clues survive failed missions because they live in campaign
   state, not the settled outcome. The test-double mission exposes a trivial
   clues() so the lifecycle tests cover the merge and the event.

## 17. Contract amendments from the splits 04 and 05 reviews (2026-11-17)

7. Mission-terminal settlement. MissionModule gains an optional pure
   selector terminal(state: S): 'completed' | 'collapsed' | null, polled by
   the engine after every reduce and after every drain. A non-null return
   settles the mission immediately with that cause. SettlementCause is now
   'completed' | 'collapsed' | 'timeout' | 'forfeit'. completed remains the
   early-win path (CRASH OUTLOOK's third acknowledgment); collapsed is the
   mission-internal hard-fail path (FREEZE BANK ACCOUNTS' confidence-zero or
   negative-cash run). Tier remains the success measure; cause tells the
   story and selects ending cues and debrief framing. Settlement stays
   exactly-once: terminal() is consulted only while unsettled. The
   test-double mission exercises both terminal causes.
8. Inspection-gated clues. SeedDefinition gains clueRecords:
   { recordId, clueId }[] handled entirely by the engine's INSPECT_RECORD
   reduction: inspecting a designated record merges its clue into
   cluesFound (monotonic, clueFound event), with no mission involvement.
   GROUND ALL FLIGHTS (the suspiciously early restriction) and FREEZE BANK
   ACCOUNTS (the hold-justification record) gain their D-83 clues this way;
   CRASH OUTLOOK keeps its action-driven clues() path for the audit READ.
   Seed validation asserts every mission has at least one clue source
   (clues() or clueRecords) per seed.

## 18. Contract amendments from the split 06 review (2026-11-17)

9. End-anchored milestones never scale. Scheduled-event specs gain an
   anchor: 'start' | 'end'. Start-anchored offsets scale proportionally
   under extended time as before; end-anchored offsets (the 30 and 10
   second warnings, finaleFinalPhase) materialize as endsAt minus the
   offset and NEVER scale, so a warning labeled 30 SECONDS always fires at
   T minus 30. Mission extended-time tests carve out end-anchored events
   from the proportionality assertion.
10. Branch policies for the finale are pure transforms over settled
    metrics. The finale-start snapshot contains settled SettledOutcome
    metrics and campaign case-file state but no mission substate (deleted
    at settlement), so runBranch's finale policies compute projections as
    closed-form transforms over the three settled metrics plus the
    exception selector; forkStream goes unused there (the reducer-replay
    and RNG-stream guarantees remain proven on the test-double). The
    public API gains selectSettledMetrics for the finale's earned-why
    derivation and projections.
11. The finale SettledOutcome carries endingId ('recovery',
    'containment', 'failure') beside tier and cause.
12. Every seed designates a finale field-report record (OBSERVED,
    independent of the exercise run) with a deskChecks reply row whose
    authored wait is validator-bounded against the finale duration minus
    a decision margin.
