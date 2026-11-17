<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-finale-module
section-02-projections-endings
section-03-joshua-catalog
section-04-screens-fixtures
END_MANIFEST -->

# Implementation Sections Index: 06-global-failsafe

Implements claude-plan.md revision 2 with claude-plan-tdd.md tests first.
Prerequisites: splits 01 to 05 implemented including engine amendments 7
through 12 (terminal(), clueRecords, end-anchored milestones,
settled-metrics projections, endingId, finale field-report designation).

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-finale-module | - | 02, 04 | No |
| section-02-projections-endings | 01 | 04 | Yes (with 03) |
| section-03-joshua-catalog | - | 04 | Yes (with 01, 02) |
| section-04-screens-fixtures | 02, 03 | - | No |

## Execution Order

1. section-01-finale-module, section-03-joshua-catalog (parallel)
2. section-02-projections-endings
3. section-04-screens-fixtures

## Section Summaries

### section-01-finale-module
src/engine/missions/finale/: FinaleState types and saveSchema, the case
builder (slot filling from case-file selectors, corroboration rule with
UNVERIFIED flagging, ordering, the shared-validator composition with
{ code, slot } rejections), REQUEST FIELD REPORT legality and the
bounded-wait flow, recognition state transition, terminal() synchronous
commit settlement with the commit-vs-timeout race guard, schedule with
end-anchored finaleFinalPhase and warnings, module registration. TDD
blocks 4 and parts of 6 and 9.

### section-02-projections-endings
projections.ts (pure transforms over selectSettledMetrics plus the
exception selector, golden-value fixtures, viability-column single
computation, authored BranchStep traces) and endings.ts (endingId
derivation, earned-why readback from settled metrics, per-cause ending
mapping). TDD blocks 5 and 6.

### section-03-joshua-catalog
src/engine/joshua/: the authored line catalog (greetings, idle,
per-mission beats, deadline warnings, rejection lines per reason code,
recognition, three ending readbacks, the five verbatim tone-reference
lines), selectors with finale-state refinement, required-line manifest
validation, graceful-absence semantics. TDD block 7.

### section-04-screens-fixtures
src/app/missions/finale/: FinaleScreen, CaseBuilderView (slots, reorder
on three only, VALIDATE flow), ComparisonView (three columns,
playBranchTrace), DecisionView (gating, confirmations), EndingScreen,
verbs and glossary, countdown chrome wiring; plus the full fixture
matrix: four validator cases per seed, three ending-reachability
fixtures, race fixture, extended-time carve-out, keyboard-only and
narrow passes. TDD blocks 8 and 9 plus the remaining 4 to 6 fixtures.
