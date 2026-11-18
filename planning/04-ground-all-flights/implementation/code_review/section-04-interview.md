# Section 04 triage (flights fixtures-polish)

Full autonomy. H1 is a real src gap in the committed module, in scope for closing split 04 honestly. Fix it at the source plus tighten the three MEDIUMs. The cross-mission recalibration is recorded for split 06, not done here.

## Fix (src + test)
- H1: in src/engine/missions/flights/module.ts evaluate(), stamp two campaign-divergence metrics the selectors already read:
  - `wopr_resolved` = the held/heldFinal flight count (board.heldFlights) — WOPR counts forced inactivity as resolution, so this drives selectOpenExceptions DOWN sharply under GROUND ALL (the on-screen deception).
  - `service_cost` = the real damage integer: flights that denied service (stranded flights + flights still held at the deadline), ~0 on a clean walkthrough and high under GROUND ALL. Flight-scale integer (not passenger-scale) so it stays coherent with the finale viability threshold until split 06 recalibrates. Must be >= 0, integer, deterministic.
  Then in fixtures.groundAll.test.ts assert the REAL selectors diverge through real settlement: selectOpenExceptions(grounded) < selectOpenExceptions(walkthrough) (drops by the full held fleet) AND selectServiceOutcomes(grounded) > selectServiceOutcomes(walkthrough). Keep the existing held_flights assertions but they are no longer the proof.
- M1: fixtures.maxConsequence order-independence over programmatic permutations (or fast-check shuffle) of the inbound consequence set, strict-deep-equal all orderings against the first; add a duplicate-kind case and an empty-set case.
- M2: fixtures.buzzer + fixtures.timeout — isolate the boundary flight: diff the resolved/stranded metric against an otherwise-identical run that does not route it, or snapshot that flight's terminal status pre-settlement, so on-boundary vs one-tick-later differ by exactly that flight's passengers (not `>=`).
- M3: pin the deterministic terminal status in narrowWidth.test.tsx and keyboardOnly.test.tsx (WX101 MERIDIAN->CASCADE clean route = exactly 'landed'), remove the three-way OR.

## Recorded for split 06 (do NOT do here)
VIABILITY_THRESHOLDS (wopr_resolved max 2, service_cost max 20) are placeholders; recalibrate against real stamped magnitudes, and make outlook + bank stamp the same two keys, when the finale assembles campaign scoring.

## Done when
Flights module stamps wopr_resolved + service_cost; fixtures.groundAll proves the real selectors diverge through settlement; M1-M3 tightened; full npm test + tsc + eslint green; no regressions in the committed flights behavior.
