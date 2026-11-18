# Code Review: section-06-mission-interface

Reviewer: deep-implement code-reviewer subagent. Findings and
dispositions:

- HIGH (draw delivery unimplemented, input-log proof vacuous): the
  engine had no mechanism to draw from state.rng into a mission event.
  FIXED: a seed-authored payload { draw: { min, max } } makes the engine
  draw via nextInt, inject drawnValue into the event, and thread the
  advanced rng back into campaign state. The test double's mid-stage
  event carries a draw; the input log records it; replay determinism and
  rng advancement are pinned by test.
- HIGH (round-trip bypassed the registry): now parses an
  ENGINE-produced substate through ctx.missions['alpha'].saveSchema,
  with unknown-key and wrong-type corruption both rejected.
- HIGH (purity tests missing): double-invocation equality on reduce,
  validate, and evaluate over deep-frozen inputs added.
- MEDIUM (loose schema): testDoubleSchema is strictObject; smuggled
  keys reject (the reference pattern section 08 copies).
- MEDIUM (debrief absent): MissionModule gains optional
  debrief(outcome): DebriefPayload with the documented fallback to
  selectSettledOutcome; the double implements it; tested.
- MEDIUM (context ergonomics and duplication): buildTestContext accepts
  mission/missionOrder overrides; campaign fixtures now delegate to it
  (one source of truth; the divergent copies are gone).
- MEDIUM (bundle hygiene unenforced): a dependency-direction test walks
  src/engine and fails on any non-testing import of the test double.
- MEDIUM (tier coverage): partial and poor branches pinned.
- LOW: unknown action kinds reject with UNKNOWN KIND; init's durationMs
  documented as the materialized length; timestamps in assertions
  derived from T0.
- Ambiguities resolved for 07 to 09: draw delivery now exists and is
  the authored-payload contract; saveSchema resolution through the
  registry is tested; buildTestContext overrides cover branch-suite
  variation.
