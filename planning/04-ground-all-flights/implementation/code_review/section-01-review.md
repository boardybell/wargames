# GROUND ALL FLIGHTS module (section-01) review

Reviewer: deep-implement:code-reviewer. The dangerous path is CORRECT: arrival credit happens only in foldArrivals at drained event times when arrivalAt <= now AND <= endsAt (no order-time cheat, no airborne credit, no post-deadline credit); the end-anchored flights-tick drains before the timeout guard (real buzzer, no double-settle); terminal cannot fire while a flight is airborne. GROUND ALL is single-use, suppresses the window-close heldFinal so a grounded fleet never wins early, counts held flights as WOPR-resolved exceptions, and is not exploitable. D-83 is genuinely engine-owned (module.clues undefined; F06 DERIVED/parent C17/run R04 in records). saveSchema is strictObject reference-only. Tests drive the real engine+module.

## HIGH
- **H1. The spec's key testable property — forecast lead time — is neither enforced nor tested.** `leadMarginSeconds` (content.ts) is a DEAD field, read nowhere; no test asserts "a forecast update arrives before the affected flight decision" with the required lead. Wire the forecast-update scheduled events so they fire at least `leadMarginSeconds` before the storm affects a corridor/hub a flight must decide on, and add a test proving the forecast-update event for the affected corridor fires before that flight's decision window with >= leadMargin lead.
- **H2. The required same-call race test is missing.** The plan explicitly requires: a HOLD dispatched with `now` already past the departure event's scheduledAt resolves by drain-then-reduce, tested both orderings. The behavior is correct (dispatch advances then reduces) but the regression guard is absent. Add it.

## MEDIUM
- **M1. The inbound-consequence order-independence test is near-vacuous.** It compares init with two fixed-key objects, which can never differ, and injects commsDelayed directly into init, bypassing the engine fold so the 40-cap is never exercised at the module boundary. Drive capping through createCampaign with settled consequences exceeding the cap (or assert init clamps), and prove real order-independence through the engine fold.
- **M2. No storm reproducibility assertion.** applyStormStep is pure/integer but no test runs createCampaign twice and asserts identical storm substate. Add the two-run equality test the spec calls for.

## LOW
- `stormInPath` is exported + tested but used nowhere (dead; either use it in the storm-in-path decision or drop it and its isolated test). `arrivalsAsOf` is persisted but never read (inert; drop). evaluate() reimplements the tier ladder inline instead of calling `tierFromResolved` (will drift; call the shared fn). The `corridorBetween` re-export-to-keep-import-referenced is a smell (section 03 should import from rules.ts). PROBE queue assertion uses `<=` rather than asserting no new mission-scheduled event id appears.

## Bottom line
The arrival/buzzer/grounding core is solid. Fix H1 (make the forecast-lead property real and tested — it is the assertion this section exists to pin) and H2 (the race test), then M1/M2 and the LOW cleanups.
