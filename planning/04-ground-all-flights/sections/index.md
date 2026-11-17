<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-module-rules
section-02-content-seeds
section-03-screen-map
section-04-fixtures-polish
END_MANIFEST -->

# Implementation Sections Index: 04-ground-all-flights

Implements claude-plan.md revision 2 with claude-plan-tdd.md tests first.
Prerequisites: splits 01 and 02 implemented including amendments 7
(terminal()) and 8 (clueRecords).

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-module-rules | - | 02, 03, 04 | No |
| section-02-content-seeds | 01 | 04 | Yes (with 03) |
| section-03-screen-map | 01 | 04 | Yes (with 02) |
| section-04-fixtures-polish | 02, 03 | - | No |

## Execution Order

1. section-01-module-rules
2. section-02-content-seeds, section-03-screen-map (parallel)
3. section-04-fixtures-polish

## Section Summaries

### section-01-module-rules
src/engine/missions/flights/: types with reference-only saveSchema, the
legality rules (LAND/DIVERT/HOLD/RELEASE windows, drained-state
discipline, GROUND ALL single-use semantics), storm truth application and
projection separation, arrival and buzzer rules, PROBE as
REQUEST_SOURCE_CHECK sugar, terminal()/evaluate with the widened cause
union, consequence handling both directions, scoreboard facts, module
registration. TDD blocks 3 and 4.

### section-02-content-seeds
Authored flights payloads and storm tracks for all three seeds (hubs,
flights, corridors, projections with divergences, dilemma tuning, lead
margins, target-hub pins, clueRecords entries, deskChecks rows including
corridor field reports), the six-invariant content validator, walkthrough
and max-consequence scripts exported for section 04. TDD block 5.

### section-03-screen-map
src/app/missions/flights/: FlightsScreen registration, mapModel pure
projection, MapView with marker-only keyboard cycling and
readout-validator parity, FlightListView with full action rows and sync,
GROUND ALL presentation beside the dual scoreboard, verbs and local
glossary, announcements and cues from emitted events, persisted view
toggle. TDD block 6.

### section-04-fixtures-polish
All per-seed fixtures in CI (walkthrough, max-consequence, timeout,
forfeit, blanket-grounding, buzzer boundary, same-second separation
guard), extended-time proportionality, mission-local property suite,
keyboard-only and narrow passes, debrief content checks. TDD block 7 plus
the boundary items of block 4.
