# Finale projections + endings (section-02) review

Reviewer: deep-implement:code-reviewer. FIX-THEN-SHIP, NO HIGH. The three load-bearing tripwires are clean (verified against source): the single-computation rule is genuine (computeStaged returns one object with projection === endState by reference, the consistency test asserts reference identity via toBe, and computeFinaleViability reuses computeViability verbatim with no forked formula); the golden fixture values all trace to real mission evaluate() formulas (flights 1090 passengers = the 8 seed flights; grounded 8/8; outlook adversarial 2/4; bank do-nothing timeout 4; allFailed aggregate 16 > 10 so STAGED is non-viable, healthy 0 passes); and the freeze test genuinely throws on mutation (deepFreeze + strict-mode).

## MEDIUM (fixed)
- M1: resolveEnding('repeat', ...) returned failure only via the fall-through when cause was not timeout/forfeit, correct only because terminal() guarantees repeat->collapsed — an undocumented coupling. FIXED: repeat now maps to failure/collapsed unconditionally, with a test over every SettlementCause.
- M2: the "live state untouched" immutability test constructed a `live` object but never passed it in, proving nothing. FIXED: it now passes the real snapshot into runProjections and asserts it toStrictEqual a pre-call structuredClone.

## LOW (fixed)
- L1: selectSettledMetrics imported + re-exported but never called; the find-by-missionId lookup hand-rolled three times. FIXED: dead import/re-export removed, lookup deduped into one shared metricFor helper.
- L2: traceFor switch lacked exhaustiveness. FIXED: assertNever default throw.
- L3: dead provedEvidence filter removed.
- L4: byte-identical CASE_VALID_FULL / CASE_VALID_FIELD_REPORT collapsed to one constant.
- L5: BANK_DONOTHING fixture comment annotated as the timeout variant (cost 4) vs the defensive-collapse variant (cost 8).

## Bottom line
Fix-then-ship; all findings applied. The single-computation reference identity, real-derived golden values, and the genuine freeze test are the invariants that matter and they hold. Finale engine 926, full npm test 1338, tsc + eslint clean.
