# Opus Review

**Model:** claude-opus (opus-plan-reviewer subagent)
**Generated:** 2026-11-17T23:28:31Z

Full findings summary (verbatim conclusions preserved; see the plan
integration notes for dispositions):

1. CHECK SOURCE ownership violation: it is REQUEST_SOURCE_CHECK on the
   campaign queue with outcomes in the shared seed desk-check table, surfaced
   via sourceCheckResolved emitted events; the plan's per-message desk-check
   payload field duplicates engine-owned data and must go.
2. Clue-emission mechanism unresolved: mission reducers cannot write
   CampaignState.cluesFound; "reading suffices to log the clue" needs either
   a clueFound EngineEvent with an engine-side mechanism or settlement-only
   clue carriage (which fails the requirement for failed missions). Pick and
   write it down; EngineEvent union currently lacks clueFound.
3. INSPECT_RECORD never dispatched: TRACE flow must dispatch it or inspected
   records will not highlight in the finale case file.
4. Ack-at-the-buzzer race: state the tie-break (acks draining at
   scheduledAt == endsAt process before the timeout settlement guard in the
   same advanceToNow, so all-three-at-the-buzzer settles as completed) and
   add the boundary fixture. Most likely replay-divergence spot in the
   mission.
5. QUEUE semantics under stage change unspecified: define queue as
   (message, channel) only with capacity, stage, and ETA all evaluated at
   dispatch; dispatch to a dark primary rejects with reason, costs nothing.
6. Primary channel capacity model missing: spray-and-pray failure and
   tier-3 solvability both hinge on numbers that do not exist. State the
   primary model and add a content-validator invariant: an adversarial
   send-everything fixture provably fails and the walkthrough provably
   reaches tier 3, across all three seeds.
7. Supersession invariant needed: for each requiredKind exactly one
   non-superseded message with a non-null correctRecipient; duplicates are
   modeled as superseded.
8. Mission end clock ambiguity: the mission always ends at endsAt (or early
   completion); primary going dark is a stage, not mission end; backup
   remains live. Say so to the player and in the plan.
9. Substate size discipline: outlook substate stores marks and references
   only, never authored bodies (seed payload is the immutable source);
   byte-budget relevance.
10. Desk-reply jitter determinism: resolved by fixing finding 1; the
    mission draws no randomness.
11. Pin the audit message record id (R04 export reference) and the bulletin
    TRACE reaching C17 as two separate validator assertions.
12. LOG and OUTBOX navigation "implicit via navigation controls" is not
    implementable: define INBOX/OUTBOX/LOG commands plus persistent desktop
    tabs and mobile back affordances.
13. Performance: no concerns; no second clock; correct.
14. "Disabled with rejection reason on attempt" is contradictory: render
    invalid sends disabled with the reason inline.

Smaller: note that recipient hints on stale duplicates are deliberately
misleading (authoring note); consume the global glossary for
OBSERVED/EXERCISE/DERIVED and register only channel jargon locally; scope
the fc.commands claim down to mission-local property tests unless the
harness explicitly accepts a second mission; add an extended-time test that
the three stage changes land proportionally and tier 3 stays reachable.

Well done: directory split, pure rules separation, integer math, emitted
consumption, content-validator-as-CI-gate, walkthrough plus adversarial
fixture pairing, honest content-risk framing.
