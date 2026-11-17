# Opus Review

**Model:** claude-opus (opus-plan-reviewer subagent)
**Generated:** 2026-11-17 (see session log)

Verdict: not ready to implement as drafted; the plan had not absorbed the
corrections the outlook sibling already paid for, and added flights-specific
determinism and solvability holes. Findings:

A. Repeats of corrected outlook patterns:
A1 CHECK SOURCE not stated engine-owned (REQUEST_SOURCE_CHECK, shared
   deskChecks table, sourceCheckResolved, late resolution lands in case
   file).
A2 PROBE is a second source-check mechanism living in the mission: either
   mission draws randomness or writes campaign case file, both violations;
   fold PROBE into engine desk-check semantics with authored offsets.
A3 INSPECT_RECORD never mentioned; finale highlighting breaks.
A4 Clue "logged when traced" hand-waves the clues()/clueFound mechanism;
   needs an inspection flag in substate driving clues().
A5 Arrival-at-the-buzzer settlement tie-break unstated; most likely
   replay-divergence and player-unfairness spot.

B. New flights-specific:
B1 Early completion ambiguous under GROUND ALL (held as final status would
   make the trap a speedrun exit).
B2 "GROUND ALL irreversible" vs "exceptions drop per held flight" fused
   two mechanics; release path contradiction; scoreboard sourcing unclear.
B3 DIVERT legality and corridor sparsity: solvability must be a validator
   invariant; readout legality must equal validator legality by test.
B4 Arrival computed past endsAt undefined (lands late vs strands).
B5 HOLD legality must be evaluated against drained state, not wall clock.
B6 Correction-before-decision needs a quantified authored lead margin,
   validator-asserted.
B7 Consequence-in risks: solvability under max inbound consequence
   untested; paymentsDelayed target hub must be pinned in seed data or the
   six-permutation invariant breaks.
B8 Storm-close and arrival events sharing a scheduledAt resolve by id
   sort; authoring hazard; validator must force separation.

C. Shell: C1 grid cell-selection vs flight-selection model unspecified
(keyboard cell-crawl risk); C2 correction announcement must be one
coalesced polite message; C3 grid/list toggle persistence per the global
cache rule.

D. Testing: D1 add invariants for the B findings; D2 scope the fc.commands
claim down as outlook did; D3 extended-time proportional test missing.

E. Smaller: saveSchema reference-only split (authored content leaking into
substate as drafted); GROUND ALL single-use validation; global vs local
glossary; W02 independence assertion in the validator; decisions.md
provenance check.
