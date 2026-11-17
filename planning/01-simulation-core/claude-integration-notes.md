# Integration Notes: Opus review of 01-simulation-core plan

Review: reviews/iteration-1-opus.md. Verdict: integrate essentially everything. The
review found real contradictions, not stylistic preferences. Disposition by finding:

## Integrated, critical

1. Clock samples join the replayable record. The canonical campaign record is now
   defined as seed plus ordered (action, now) envelopes; advanceToNow calls between
   actions are implied by the next envelope's now. Determinism criterion restated
   accordingly.
2. lastNow high-water mark added to CampaignState; every incoming now clamps to
   max(now, lastNow). Kills backward-clock un-expiry and cross-call regression.
3. Branch runner clarified: the frozen snapshot is the untouched comparand for the
   side-effect test; branches execute on a separate unfrozen deep clone.
4. Branch scope honesty: this split ships the branch framework plus determinism
   guarantees proven against the test-double mission; concrete projection
   computation is an explicit seam 06 fills via mission selectors. BranchProjection
   type defined here, population deferred.

## Integrated, correctness

5. Consequence folding: canonical order (sorted by consequence ID), capping defined
   over the per-type aggregate, explicit property test that any prior-outcome order
   yields identical folded initial conditions.
6. Applied markers keyed (consequenceId, targetMissionId) composite, not flat.
7. Source checks move to a campaign-level queue that survives mission settlement.
   Replies scheduled past a mission's endsAt still resolve at their scheduled time
   in whatever phase the campaign is in (debrief, menu, finale) via the same
   advanceToNow drain; results persist in the case file with an arrived-after-
   settlement marker. Finale field-report requests use the same queue under the
   finale clock. The 30-minute catch-up cap cannot swallow them because the drain
   processes everything scheduled before the clamped now, and later wakes drain
   the rest.
8. Seed-load assertion: all story times within [0, 86400), parent chains
   time-monotonic.
9. Integer math promoted to an architecture principle: all sim-affecting
   quantities are integers in smallest units; division sites use a documented
   rounding rule; no float equality anywhere in sim logic.
10. Explicit test: nextInt on a frozen RngState succeeds and returns a fresh
    object; wrapper never writes back.
11. nextInt pinned: inclusive both bounds, delegates to pure-rand's unbiased
    uniform distribution, never modulo.

## Integrated, save and testing

12. Valibot schema is the source of truth; CampaignState TS type derives via
    InferOutput. No mirroring.
13. Migration throws are caught the same as parse and validation throws; each
    migration written total and defensive; any failure falls through the chain.
14. Monotonic settlement merge guard runs on the backup load path too; a
    recovered backup can never resurrect an unsettled mission.
15. Save byte-budget test added (full-campaign save under a fixed budget).
16. Canonical stringify (recursively sorted keys) specified for the state hash;
    minus-zero normalized to zero at state boundaries.
17. Determinism properties committed to fc.commands model-based testing with a
    defined command set that also generates monotonic now samples; called out as
    a real effort item.
18. Explicit six-permutation mission-order test asserting byte-identical story
    chronology and order-independent folded initial conditions.

## Integrated, interface

19. Forfeit is a first-class dispatched action routing to settlement with cause
    'forfeit' (confirmation stays in the shell).
20. Seed validation invariant: every seed must contain at least one record
    passing isIndependentObservation against its exercise run, checked by the
    fixture test so an authoring error fails CI, not a playthrough.
21. MissionModule gains a saveSchema member (a Valibot schema for its substate);
    the save layer composes schemas by active mission ID. Closes the open-typed
    substate hole before splits 03 to 06 exist.
22. trace is now a pure selector; recording inspection is a dispatched
    INSPECT_RECORD action. The contradiction (pure query that mutates) is gone.
    Public API restated: all player-driven mutation goes through dispatch
    (including acknowledgeDebrief, forfeit, newCampaign, preference changes);
    selectors are the only other read surface.

## Not integrated

- Nothing rejected outright. Finding 15's stringify-cost observation needed no
  change (reviewer agreed); the byte-budget test covers the actionable part.
