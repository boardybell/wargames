<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-module-rules
section-02-content-seeds
section-03-screen-views
section-04-fixtures-polish
END_MANIFEST -->

# Implementation Sections Index: 03-crash-outlook

Implements claude-plan.md revision 2 with claude-plan-tdd.md tests first.
Prerequisites: splits 01 and 02 implemented, including the clueFound engine
amendment.

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-module-rules | - | 02, 03, 04 | No |
| section-02-content-seeds | 01 | 04 | Yes (with 03) |
| section-03-screen-views | 01 | 04 | Yes (with 02) |
| section-04-fixtures-polish | 02, 03 | - | No |

## Execution Order

1. section-01-module-rules
2. section-02-content-seeds, section-03-screen-views (parallel)
3. section-04-fixtures-polish

## Section Summaries

### section-01-module-rules
src/engine/missions/outlook/: types with valibot saveSchema (reference-only
substate), channel rules (primary unlimited-count stage-ETA model, backup
capacity five, dispatch-time queue evaluation, dark-primary rejection),
acknowledgment scheduling and the buzzer tie-break, READ/FLAG, clues()
selector for the audit clue, stage-change events, evaluate tiering per
cause, consequence table, debrief payload, module registration. TDD blocks
3 (schema parts) and 4.

### section-02-content-seeds
Authored payloads for all three seeds (twelve messages each per the
structural mix), channel tuning, stage offsets, record-id links (audit
R04 reference, bulletin to C17 equivalents), misleading-hint duplicates,
content validator with the solvability invariants (adversarial fixture
fails, walkthrough reaches tier 3), integration into SeedDefinition. TDD
blocks 3 (validator) and 6.

### section-03-screen-views
src/app/missions/outlook/: OutlookScreen registration, the four views with
INBOX/OUTBOX/LOG commands plus desktop tabs and mobile back affordances,
message detail with TRACE (INSPECT_RECORD dispatch) and CHECK SOURCE
(REQUEST_SOURCE_CHECK) flows, ActionBar with inline disabled reasons,
StatusLine, verb and glossary registrations, briefing art slot, cue and
announcement wiring from emitted events. TDD block 5.

### section-04-fixtures-polish
Walkthrough, adversarial, timeout, forfeit fixtures per seed wired into CI;
extended-time proportional test; mission-local property test; buzzer
boundary fixture; keyboard-only and narrow-width passes; debrief content
checks; closes the split's acceptance anchors. TDD blocks 4 (boundary), 7.
