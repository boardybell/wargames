# Code Review: section-10-properties-and-api

Reviewer: deep-implement code-reviewer subagent (adversarial, hunting for
vacuous or circular invariants).

## Genuinely proven (reviewer confirmed)
- determinism-run-twice: folds identical logs twice, toStrictEqual + hash,
  and the timeout variant exercises a distinct settlement path non-vacuously.
- snapshot-replay: snapshot is a faithful clone+freeze; suffix-on-snapshot
  equals the full run at early/mid/late cut points; the unmutated-snapshot
  sub-test is real.
- model-commands rejected-action oracle: sound and NOT circular — dispatch
  runs advance first and returns the advanced state on rejection, so
  comparing to advanceCampaign(before, now) correctly asserts the reducer
  added zero effect.

## Findings
- **HIGH-1** — six-permutation chronology test was a tautology: it hashed the
  static FIXTURE_RECORDS constant six times, ignoring play order and state.
- **HIGH-2** — six-permutation consequence-folding half was vacuous: the
  full walkthrough makes every mission tier 'full' → no consequences → empty
  appliedConsequences in all orders.
- **HIGH-3** — public surface diverged from the plan: advanceToNow vs
  advanceCampaign, absent view selectors, and internal type leaks
  (MissionRuntime, AppliedMarker, BriefingLine); the runtime import-surface
  test cannot catch type-surface leaks.
- **MED-1** — rejection oracle compared state only, not emitted events.
- **MED-2** — NEW_CAMPAIGN exemption cleared accumulators without positively
  asserting the reset produced a clean slate (masking reset regressions).
- **MED-3** — sabotage injected a `taint` key that strictObject could strip
  under future validation, risking a false green.
- **MED-4 / holes** — no per-trail JSON-safety; no negative anchor against a
  stuck hash; snapshot-replay ignored the emitted tail.
- **LOW-1/LOW-2** — @engine/testing bundle-exclusion only name-checked;
  suite-wide timeout counter not asserted inside the property.

See section-10-interview.md for dispositions.
