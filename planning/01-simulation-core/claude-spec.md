# Complete Specification: 01-simulation-core

Synthesis of spec.md (requirements), claude-research.md (technical research), and
claude-interview.md (Bond's decisions). 2026-11-17. Authoritative upstream:
../requirements.md. This document stands alone for planning purposes.

## What this is

The headless engine for SHALL WE PLAY A GAME?, a WarGames-inspired browser game.
Pure TypeScript under src/engine/ with zero DOM, React, or asset dependencies.
Deterministic and seedable: the complete record of any campaign is its initial seed
plus the ordered action log, and any snapshot can seed an identical replay. The
terminal shell (02) renders what this core says; missions (03 to 06) plug in as pure
reducers through a mission-module interface.

## Locked decisions

- Three shipped curated campaign seeds: the fixture seed plus two more, each
  hand-authored, named, and verified solvable. No procedural scenario generation,
  no arbitrary player seeds.
- Timers: Standard 4-minute missions and 3-minute finale; a single Extended toggle
  doubles both (8/6). Every mission is timed. Extended choice is made before start
  and persists as a preference.
- PRNG: pure-rand xoroshiro128plus. RNG state lives inside game state and threads
  immutably through reducers ([value, nextRng] pattern). clone() at branch forks,
  jump() for parallel branch streams.
- Save validation: Valibot. Integer-versioned payload, migration function array
  applied on read, validation after migration, primary plus backup localStorage
  keys, layered fallback (primary, backup, fresh with visible reset flag).
- Time never enters the engine implicitly. Wall-clock now arrives as an action
  payload or as the argument to advanceToNow(state, now). ESLint forbids
  Math.random, Date.now, performance.now under src/engine/**.
- Vitest 4 projects config; engine tests run in node environment; v8 coverage
  scoped to src/engine/**; fast-check 4 with @fast-check/vitest for property tests.
- House rules: no em-dashes in code, comments, or strings; small dependency
  footprint (pure-rand, valibot, dev-only vitest/fast-check/eslint tooling).

## Domain model

### Evidence records

Every record: stable ID, origin kind (OBSERVED, EXERCISE, DERIVED), source ID,
parent ID when applicable, event time (story time), receipt time (story time),
inspectable text. The record graph is the epistemic backbone:

- TRACE(recordId) resolves origin kind, event time, receipt time, and parent record
  when available. Pure query, no state change beyond marking the record inspected
  (inspection highlights persist into the finale case file).
- CHECK SOURCE(recordId) requests a second observation from a fictional human desk:
  schedules a reply event after a short visible wait on the mission clock. Replies
  can be CONFIRMED, CONTRADICTED, PENDING, or UNKNOWN. PENDING and UNKNOWN carry
  zero corroboration. Completed checks persist in the case file across missions.
- Independence rule: an independent observation has its own origin. A DERIVED record,
  or any record whose ancestry reaches the same exercise run (R04), never counts as
  independent corroboration of that run's claims. This rule is enforced by one
  shared validator used both for in-mission guidance and the finale case builder.

### Story time vs mission time vs branch time

Three clocks that never leak:
- Story time: the fictional incident chronology (21:14:00 and onward). Fixed per
  seed, identical across all six mission orders, rendered as timestamps on records.
- Mission time: the real-time countdown. Persisted as absolute endsAt epoch ms.
  Event schedules within a mission are offsets from mission start, materialized to
  absolute times when the mission starts.
- Branch time: discrete steps inside zero-player branch simulations. Pure iteration
  count, no wall-clock contact.

### The fixture seed (seed one, name authored in content)

From the requirements table, run R04:
- Outlook C17: event 21:14:00, receipt 21:14:05, EXERCISE, run R04. D-83 exercise
  export; a grounding advisory preview published to the scenario's active feed.
- Flights F06: event 21:14:08, receipt 21:14:52, DERIVED from C17, run R04. All-hubs
  restriction. A separate OBSERVED field report shows local weather and an available
  corridor.
- Bank B04: event 21:14:21, receipt 21:14:30, DERIVED, cites F06, assumes
  system-wide shutdown. Later withdrawal requests can be genuine responses to the
  hold.
- Decoy: an independently OBSERVED local weather warning with no R04 parent. It
  explains a real local restriction and establishes true scope.

Receipt ordering (C17 21:14:05, B04 21:14:30, F06 21:14:52) deliberately contradicts
event ordering (C17, F06, B04); parent links and event times resolve it. Two more
curated seeds repeat this shape with different concrete content (different record
IDs, times near a different anchor minute, different decoy flavor), preserving the
same solvability guarantees. Each seed ships with a documented walkthrough and
fixture states for a timeout and a partial recovery.

## Campaign state machine

- Campaign: seed name, settled outcomes, acknowledged debriefs, discovered clues,
  source checks, inspected-record set, preferences, active mission state or menu.
- Any of missions 1 to 3 can run first. Settlement (completed, timed out, forfeited)
  happens exactly once per mission per campaign and is final; the save persists it
  immediately. Reselecting a settled mission opens its record, never replays.
- Consequences: each settled mission emits typed consequence facts. Each is applied
  at most once to each subsequent mission's initial conditions, with capped effect
  so every mission stays playable. Known consequences: delayed communications reduce
  initial flight report reliability; flight disruption raises simulated withdrawal
  demand; broad early bank holds delay simulated staffing or service payments later.
- All six mission orders preserve identical story-time chronology and reach the
  finale. Mission 4 (GLOBAL FAILSAFE) unlocks only when all three debriefs are
  acknowledged, regardless of outcomes.
- Dual scoreboard from one state: OPEN EXCEPTIONS (WOPR's count; forced inactivity
  counts as resolution) and real service outcomes (essential deliveries, passenger
  outcomes, critical payments, confidence). Both are pure selectors over campaign
  state; no second source of truth.
- New Campaign: deliberate action, resets outcomes, same or different seed.

## Mission-module interface

Each mission plugs in as a pure module providing: seeded initial mission state
(seed + inbound consequences applied), event schedule (offsets from start), action
set with validators, reducer, settlement evaluator (success tiers, timeout, forfeit),
debrief payload builder, clue emission, consequence emission, and record
contributions to the campaign case file. The engine owns the lifecycle: start,
action dispatch, event processing, catch-up, settlement, debrief acknowledgment.
Invalid actions are rejected by validators and cannot change state; commands and
buttons dispatch identical validated actions.

## Clock, scheduling, and catch-up

- Mission start materializes the event schedule to absolute epoch-ms times and
  persists endsAt. The engine exposes advanceToNow(state, now): drain all events
  with scheduledAt <= now in (scheduledAt, id) order, deleting each as processed;
  settlement fires when now >= endsAt, exactly once, including when the deadline
  passes while a menu overlay is open or the tab is gone.
- Idempotence by construction: processed events leave the queue; a double wake or
  stale reload drains nothing twice. Settlement is guarded by settled-state check.
- Negative elapsed (clock jumped backward) clamps to zero; catch-up spans cap at 30
  minutes, which is beyond any mission length and therefore only a safety rail.
- The shell owns repaint ticking and wake signals (visibilitychange, pageshow with
  persisted, resume, focus); the engine only ever receives advanceToNow calls.

## Save system

- Shape: { version: int, state: CampaignState } JSON under a single primary key,
  with a backup key written after each confirmed good primary write.
- Load: parse, migrate through the ordered migration array, validate with Valibot,
  fall back primary to backup to fresh; corruption surfaces as a flag the shell
  renders as the visible reset path.
- Write policy (engine exposes, shell schedules): debounced during play, flushed on
  settlement and on shell-reported hide/pagehide. Quota errors caught; drop backup
  slot and retry once.
- Stale-reload protection: settled outcomes merge monotonically; a reload can never
  unsettle a mission or re-apply a consequence (apply-once markers persist).

## Branch machinery

- snapshot(campaign) produces a deep-frozen copy including rngState.
- Branches REPEAT D-83, HOLD AND VERIFY, STAGED RECOVERY run as zero-player
  simulations against snapshot clones, using the same reducers as live play where
  the operation is shared, stepping branch time deterministically. Each branch
  clones the snapshot RNG and jump()s to its own stream.
- Output: side-by-side projections of OPEN EXCEPTIONS, essential deliveries,
  passenger outcomes, critical payments, confidence. Repeated runs on the same
  snapshot are identical; live state is untouched (enforced by frozen inputs and a
  test comparing live state before and after).
- STAGED RECOVERY viability: evaluated against visible per-campaign service
  thresholds shaped by settled outcomes (consumed by 06).

## Module layout (under src/engine/)

rng/ (pure-rand wrappers, stream discipline), records/ (evidence graph, TRACE,
CHECK SOURCE, independence validator), clock/ (schedules, advanceToNow), campaign/
(state machine, settlement, consequences, selectors for both scoreboards), seeds/
(three curated seeds, walkthroughs as executable fixtures), save/ (codec,
migrations, valibot schema), branch/ (snapshot, branch runner), missions/
(module interface types only; implementations arrive in splits 03 to 06 but a
minimal test-double mission ships here to exercise the lifecycle end to end).

## Acceptance criteria

1. Determinism: same seed + same action log run twice gives strictly equal state;
   fast-check property across arbitrary valid action logs. Snapshot mid-log, replay
   suffix, equals full run. One deliberate Math.random sabotage test proves the
   harness detects divergence.
2. Settlement permanence: success, timeout, and forfeit each record a permanent
   result surviving reload, debrief acknowledgment, and menu reselection. Expired
   session resolves correctly after reload. Catch-up cannot double-apply a
   consequence. New Campaign resets.
3. Chronology: all six mission orders produce identical story-time record
   chronology and reach the finale; fourth row hidden until all three debriefs
   acknowledged.
4. Case validation (shared validator): correct C17 to F06 to B04 event-time case
   accepted; receipt-time-sorted sequence rejected; on-time unrelated source
   rejected; missing independent check rejected; same-run derivatives never count
   as independent.
5. Branches: repeated comparisons on one snapshot identical; live state untouched;
   viable vs capacity-constrained recovery distinguishable.
6. Saves: corrupt primary falls to backup, corrupt both falls to fresh with reset
   flag; migration pipeline covered by a v0-to-current test once v1 exists.
7. ESLint purity gate passes: no banned time or randomness APIs under src/engine/**.
8. Every acceptance test runs headless in Node via Vitest 4.
