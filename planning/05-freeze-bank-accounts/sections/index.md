<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-module-rules
section-02-content-seeds
section-03-screen-ledger
section-04-fixtures-polish
END_MANIFEST -->

# Implementation Sections Index: 05-freeze-bank-accounts

Implements claude-plan.md revision 2 with claude-plan-tdd.md tests first.
Prerequisites: splits 01 and 02 implemented including amendments 7
(terminal() with collapsed) and 8 (clueRecords).

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-module-rules | - | 02, 03, 04 | No |
| section-02-content-seeds | 01 | 04 | Yes (with 03) |
| section-03-screen-ledger | 01 | 04 | Yes (with 02) |
| section-04-fixtures-polish | 02, 03 | - | No |

## Execution Order

1. section-01-module-rules
2. section-02-content-seeds, section-03-screen-ledger (parallel)
3. section-04-fixtures-polish

## Section Summaries

### section-01-module-rules
src/engine/missions/bank/: types with reference-only saveSchema and typed
reason codes, derived-cash selector, request-application rules, cumulative
LIMIT, PAY-from-account semantics, broad-hold stamping with the
drain-before-reduce boundary, tick math and threshold injection with both
sizing variants, terminal() collapsed paths, evaluate tiering, prediction
line selector, scoreboard facts, module registration. TDD blocks 3, 4, 5.

### section-02-content-seeds
Authored bank payloads for all three seeds (rosters, request streams with
duplicate and disputed authoring, critical payments, delta tables,
thresholds and injection sizes, floor and target, prediction series,
intro lines, clueRecords and deskChecks rows), the content validator with
all invariants, walkthrough and surge scripts exported for section 04.
TDD block 6.

### section-03-screen-ledger
src/app/missions/bank/: BankScreen registration, the three views with
commands, tabs, back affordances, and persisted toggle, action rows with
inline disabled reasons, pinned status area with the moving prediction
line, feed markers and selector-rendered reasons, skippable intro, verbs
and local glossary, cue and announcement wiring. TDD block 7.

### section-04-fixtures-polish
All per-seed fixtures in CI (walkthrough, surge in both sizing variants,
timeout, forfeit, collapsed, broad-hold boundary), extended-time
proportionality, mission-local property suite, keyboard-only and narrow
passes, debrief cross-tab checks. TDD block 8.
