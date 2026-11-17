# Spec: 01-simulation-core

Context: ../requirements.md (authoritative), ../decisions.md, ../deep_project_interview.md,
../project-manifest.md. This split is the foundation; everything else consumes it.

## Purpose

The headless game engine for SHALL WE PLAY A GAME?. Pure TypeScript with zero DOM,
React, or asset dependencies. Deterministic, seedable, fully testable in Node. Mission
rule engines (splits 03 to 06) plug in as pure reducers; the terminal shell (02) renders
whatever this core says is true.

## In scope

1. Evidence record model. Every record carries a stable ID, origin kind
   (OBSERVED, EXERCISE, DERIVED), source ID, parent ID when applicable, event time,
   receipt time, and inspectable text (requirements.md, Implementation section).
   TRACE resolves origin, times, and parent. CHECK SOURCE requests a second observation
   from a fictional desk with a short visible wait; PENDING and UNKNOWN replies carry
   zero corroboration. Derivative reports never count as independent corroboration.
2. Simulation clock. Story time (the fictional 21:14 incident chronology), the active
   mission real-time deadline, and hypothetical branch steps are three distinct time
   domains that never leak into each other. Countdowns and event ticks derive from a
   persisted deadline. Catch-up after refresh or backgrounding processes missed events
   in chronological order, applies each consequence exactly once, and closes a
   timed-out mission exactly once, including a timeout that lands while a menu overlay
   is open.
3. Campaign state machine. Any of the three missions can run first. A mission settles
   once (completed, timed out, forfeited) and the result is final for the campaign.
   Settled outcomes feed the next mission through capped, apply-once consequence rules
   (delayed comms reduce flight report reliability, flight disruption raises withdrawal
   demand, early bank holds delay staffing or service payments). All six mission orders
   preserve the same incident chronology and reach the finale. The fourth menu row
   unlocks only after all three debriefs are acknowledged. New Campaign resets with the
   same or a different seed.
4. Seeded scenario data. The known-solvable fixture seed built from the requirements
   table: Outlook C17 (event 21:14:00, receipt 21:14:05, EXERCISE, run R04), Flights
   F06 (21:14:08 / 21:14:52, DERIVED from C17, R04), Bank B04 (21:14:21 / 21:14:30,
   cites F06), plus the independently observed local weather warning decoy with no R04
   parent. Receipt-time ordering must contradict event-time ordering exactly as
   specified. At least one additional seed with similar concrete content. A documented
   walkthrough for the achievable successful run, plus fixture states for a timeout and
   a partial recovery.
5. Dual scoreboard. OPEN EXCEPTIONS (WOPR treats forced inactivity as resolution) and
   real service outcomes (deliveries, passengers, payments, confidence) derived from
   the same campaign state, never two sources of truth.
6. Save system. Versioned, validated local save holding seed, mission state, active
   deadline, clues, source checks, debriefs, settled outcomes, preferences. Resume from
   last valid state; corrupt saves recover with a visible reset path (the shell renders
   it, the core detects and exposes it). Duplicate settlement and stale reloads cannot
   double-apply.
7. Branch machinery. Snapshot the campaign, run REPEAT D-83, HOLD AND VERIFY, and
   STAGED RECOVERY as zero-player branches using the same reducers as live play where
   the operation is shared. Repeated runs on one snapshot are identical and leave live
   state untouched.
8. Action validation. Commands and buttons dispatch the same validated actions; invalid
   actions cannot change state.

## Out of scope

Rendering, audio, mission-specific rules beyond the interfaces they plug into, art,
deployment. The tic-tac-toe demonstration lives in 02.

## Provides

- Types and reducers consumed by 02 through 06.
- A mission-module interface: seeded initial state, event schedule, action set,
  settlement evaluation, debrief payload, clue emission, consequence emission.
- Clock, save, snapshot, TRACE and CHECK SOURCE services.

## Needs

Nothing from other splits. This is first.

## Decisions that bind this split

Deterministic and reproducible from one seed (interview round 2). Testing runs in Node
with no browser. Vitest is the expected harness, chosen for the Vite stack. Full
quality, no rationing. No em-dashes in any code, comment, or string.

## Acceptance anchors

Requirements.md Implementation and verification bullets: settlement permanence,
catch-up idempotence, six-order chronology, case validator rejecting same-run
derivatives as independent, identical branch projections, New Campaign reset.
