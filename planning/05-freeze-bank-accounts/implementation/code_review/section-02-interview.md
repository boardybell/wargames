# Section 02 triage (bank content + seeds)

Full autonomy. Both MEDIUMs are the "checks a lookalike" class; fix them so the validator enforces MEANING. The two LOWs are comments. The confirmed-good list stays as-is.

## Fix
- M1: make the prediction-shape invariant cover the WHOLE request stream aligned to the engine's real tick windows. Derive the tick offsets from the actual bankSchedule (module.ts) — or equivalently from standardDurationSeconds + tickIntervalSeconds including the end tick — and bucket each request by the tick window its offset falls in (smallest tick offset >= the request offset; the final tick catches the tail up to standardDurationSeconds). Drive baseObservedPerTick with that tickCount/convention instead of predictionSeries.length + fixed 60s bins, so no authored request (e.g. W18 at 190) is dropped. Re-verify all three seeds still satisfy unshifted <= observed per tick AND hold-shifted strictly exceeds observed; re-author predictionSeries values only if the realigned buckets require it. Add a test that every authored request is accounted for in exactly one tick window (no silent drop).
- M2: strengthen the DISPUTED-request rule: require disputeClaimBalance strictly GREATER than the account openingBalance (over-claim direction) AND the referenced record's desk outcome is CONTRADICTED AND the claim is not reachable from any single prior request amount against that account. Strengthen the negative test to prove an under-claim/in-range claim is REJECTED (not only an exact-equality claim).
- LOW: add a comment at the disputed-record / clue-record coupling noting B04 is deliberately both the disputed evidence and the D-83 clue anchor (so a future author does not assume independence). Leave the optional-field gap as acceptable.

## Done when
baseObservedPerTick covers every authored request in a real engine tick window (new no-drop test); the dispute rule asserts direction + CONTRADICTED record + unreachable-from-history with a strengthened negative test; all three seeds still pass the full validator and both surge variants; bank engine tests + tsc + eslint green; no regression in section-01 or the seed-validation suite.
