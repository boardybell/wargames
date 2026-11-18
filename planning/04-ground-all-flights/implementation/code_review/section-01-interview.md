# Section 01 triage (flights module)

Full autonomy. Arrival/buzzer/grounding core is correct and stays. Fix the two spec-named properties and the vacuous/dead items.

## Fix
- H1: make the forecast lead-time real. Wire `leadMarginSeconds` into the authored forecast-update scheduling so a forecast update for a corridor/hub fires at least leadMarginSeconds before the storm affects it (before the flights deciding on it must choose), and add a test asserting the forecast-update event precedes the affected flight's decision window by >= leadMargin.
- H2: add the same-call race test (HOLD dispatched with now past the departure event's scheduledAt, resolving drain-then-reduce; both orderings).
- M1: replace the vacuous order-independence test with one that drives capping through createCampaign (settled consequences exceeding the 40 cap) or asserts init clamps; prove real order-independence through the engine fold.
- M2: add a storm reproducibility test (createCampaign twice, identical storm substate).
- LOW: use `stormInPath` in the real storm-in-path decision or drop it + its isolated test; drop the inert `arrivalsAsOf`; make evaluate() call `tierFromResolved`; remove the corridorBetween re-export smell; strengthen the PROBE assertion to "no new mission-scheduled event id appears".

## Done when
Engine project green with the forecast-lead and same-call-race properties genuinely asserted, the consequence-cap test non-vacuous, storm reproducibility proven, dead code removed, tsc + eslint clean, no regressions to the 679 baseline.
