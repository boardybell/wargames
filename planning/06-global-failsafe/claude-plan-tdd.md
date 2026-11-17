# TDD Plan: 06-global-failsafe

Companion to claude-plan.md (revision 2); same section numbering. Engine
tests in the node project; screen tests in jsdom with the real engine and
real mission modules on the fixture seed. Stubs say what to test, not how.

## 4. Case building and validation

- The four requirements fixtures per seed: correct C17-F06-B04 event-time
  case accepted; receipt-time-sorted rejected (receipt-order reason);
  on-time unrelated source rejected; missing or uncorroborated
  independent check rejected; same-run derivatives never independent.
- Corroboration rule: W02 unchecked lists UNVERIFIED and fails the slot;
  W02 with a CONFIRMED play-time check qualifies; CONTRADICTED, PENDING,
  UNKNOWN never qualify.
- Slots editable after rejection; rejection carries { code, slot } and
  maps to a Joshua line; unlimited attempts.
- REQUEST FIELD REPORT: legal only when no corroborated candidate; the
  seed-designated record resolves within the validator-bounded wait; a
  request at first legality still validates and commits (slack test);
  post-settlement arrival renders as the pending line.
- Inspected-during-play records render highlighted (inspectedRecords).
- Recognition: caseValid false-to-true transition fires the line and cue
  exactly once (state-key mechanism, no new EngineEvent).

## 5. Comparison and projections

- Projections are pure transforms over selectSettledMetrics plus the
  exception selector: golden-value fixtures for healthy,
  capacity-constrained, and all-failed campaign states, per branch.
- Repeat runs strictly equal; live state and the frozen baseline
  untouched; branch execution order irrelevant (structural purity).
- Viability and the STAGED column are one computation: the panel's
  per-threshold pass/fail strict-equals values derived from the same
  end state the column renders (consistency fixture).
- Post-START field report updates the live case file, never the frozen
  baseline (dual-state test).
- playBranchTrace renders authored BranchStep sequences; skippable;
  instant under reduced motion; results readable after skip.

## 6. Decision and endings

- Gating: STAGED enabled iff caseValid AND viability passes; HOLD always;
  REPEAT behind confirmation quoting its projection.
- Settlement: STAGED and HOLD commits settle completed; REPEAT commit,
  timeout, forfeit settle collapsed; endingId derived from committed
  action plus cause; exactly once.
- Commit-vs-timeout race: COMMIT settles synchronously in its own reduce
  (terminal()); a same-wake timeout cannot override (race fixture).
- Finale pause-overlay End Mission confirmation names the repeated-order
  consequence.
- Three endings reachable under the live countdown (scripted fixtures
  per ending); earned-why readback derives from selectSettledMetrics and
  names the shaping outcomes; ending art slots, cues, and the
  fresh-campaign offer render.

## 7. Joshua catalog

- Required-line manifest coverage test (reason codes, endings,
  recognition, mission beats, deadline warnings); no em-dashes; caption
  equals display text; pauses authored as integers.
- Graceful absence: a key the catalog lacks renders nothing and logs
  nothing in production.

## 8. Screens

- Slot interaction by keyboard and tap; reorder controls on the three
  subsystem slots only; command-button identity for all verbs; rejection
  rendering highlights the failing slot; UNVERIFIED flags render.
- Views (CASE, COMPARISON, DECISION) with tabs, back affordances,
  persisted toggle; countdown chrome with finaleFinalPhase red alarm
  (end-anchored, never scaled); keyboard-only and narrow passes.

## 9. Cross-cutting

- Extended time: start-anchored offsets scale; end-anchored milestones
  (30 and 10 second warnings, finaleFinalPhase) anchor to endsAt and do
  not scale (amendment 9 carve-out test).
- Settlement permanence and the finale joining the campaign record
  (fresh-campaign offer resets via NEW_CAMPAIGN).
