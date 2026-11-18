# Review Triage: section-10-properties-and-api

Mode: autonomous (standing no-more-questions directive). A strong review
that caught two genuinely vacuous assertions. Dispositions:

## Fixed
- **HIGH-1 + HIGH-2 (six-permutation).** Rewrote the suite. Dropped the
  tautological chronology-of-a-static-constant test entirely. The invariant
  is now a `terminalFingerprint(state)` derived from each play order's REAL
  end state — settled {missionId, tier, cause, clueId, metrics}, acknowledged
  debriefs, cluesFound, finaleUnlocked — asserted byte-identical across all
  six orders. Added a negative anchor (a partial campaign must produce a
  DIFFERENT fingerprint) so the equality is real, not a constant function.
  Note on the consequence-folding half: the engine applies each consequence
  once, to the next mission started, so folding is deliberately order-
  DEPENDENT (not commutative); a cross-permutation consequence invariant
  would be false. The honest order-independent guarantee is the terminal
  outcome facts, which is what the rewrite asserts.
- **HIGH-3 (surface).** Trimmed the internal type leaks: MissionRuntime,
  AppliedMarker, and BriefingLine are no longer exported (consumers read
  them via CampaignState). Documented why EngineContext / MissionModule /
  MissionRegistry / SeedDefinition remain public (the ctx is threaded and
  later splits implement those seams).
- **MED-1.** The rejected-action oracle now also asserts the emitted stream
  equals the pure-advance emitted stream, so a rejected action cannot
  spuriously push an event.
- **MED-2.** The NEW_CAMPAIGN branch now positively asserts settled,
  cluesFound, appliedConsequences are empty and activeMission is null BEFORE
  clearing the accumulators, so a reset that failed to wipe state is caught.
- **MED-3.** The sabotage now taints `inputLog` (a schema-permitted string
  array) instead of a new key, so a future substate re-validation cannot
  silently strip it and produce a false green.
- **Holes.** Added: per-trail JSON-safety over a full fold; a stuck-hash
  negative anchor (two different logs hash differently); and a
  snapshot-replay assertion that the replayed suffix reproduces the full
  run's emitted tail.

## Documented deviations (not code changes)
- **HIGH-3 (a) advanceToNow vs advanceCampaign.** The plan names
  advanceToNow for shell wake; the exported campaign-level wake entry is
  advanceCampaign (returns { state, emitted }). The low-level advanceToNow in
  the time module is a different queue-drain primitive and stays internal.
  Recorded in the section As-Built.
- **HIGH-3 (b) view selectors.** active-mission-view, debrief-payload, and
  case-file selectors named in the plan are SHELL-layer concerns (split 02):
  the engine exposes the raw state fields (inspectedRecords, sourceChecks),
  LoadResult.recovery, and per-mission MissionModule.debrief; the shell
  composes the views. Not part of the engine-core surface.
- **Type-surface leak guard.** The runtime Object.keys snapshot pins value
  exports only; types erase. A d.ts snapshot would be needed to guard the
  type surface. Known limitation, recorded.

## Declined with rationale
- **LOW-1 (bundle exclusion).** Name-disjointness is what is testable without
  a bundler; a tree-shake/build-output assertion is out of scope for the
  engine unit suite. The production bundle exclusion is enforced by the
  shipped import graph (nothing in src/engine imports @engine/testing).
- **LOW-2 (suite-wide timeout counter).** fast-check randomness did not
  reliably cross the deadline, so a counter assertion would be flaky. Timeout
  reachability is proven by the deterministic targeted test, which the plan
  explicitly permits ("OR a targeted precondition").

## Verification
tsc 0, eslint 0, 219 tests green, coverage lines 97%+ / branches 86%+
(thresholds 80 / 75).
