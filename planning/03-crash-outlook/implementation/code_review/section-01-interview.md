# Section 01 review triage

Standing directive: full autonomy. All HIGH and MEDIUM findings are real and get fixed; LOW items are sound as-is.

## Fix
- **H1/H2 (ack-arrival model).** A required delivery is satisfied only when its send is ACKNOWLEDGED (folded), not merely scheduled on-time. A send folds to `acknowledged` during the ack-fold when the current `now >= scheduledAckAt` AND `scheduledAckAt <= endsAt`; a send whose `scheduledAckAt > endsAt` can never acknowledge (stays pending, counts as not delivered at settlement). The fold runs at every reduce (every player action and every scheduled/start/warning/tick event), so completion fires when the third correct ack actually lands at the next wake at/after its ack time (or the endsAt settle-tick folds remaining on-time acks before the timeout guard — the real buzzer). Rewrite the early-completion and buzzer tests to advance the clock (mock the engine clock) so acks fold via an event/action, asserting completion vs timeout against the deadline, NOT against the SEND dispatch.
- **H3.** `evaluate()` treats null `endsAt` as zero satisfiable deliveries, matching `terminal()`.
- **M1.** Track acknowledged-but-wrong-desk deliveries distinctly so the debrief reports DELIVERED CORRECT / DELIVERED TO WRONG DESK / NOT DELIVERED per required kind (delivered-or-not AND correct-or-not, per the plan).
- **M2.** `channelAckAt` indexes the per-stage primary ETA directly with the stage asserted in {0,1}; no silent stage-2 fallback.
- **M3.** Capture the queue index on the resolved send target and remove the queued item by that, not by re-reading the raw action.
- **M4.** Surface `auditDelivered` in the debrief (AUDIT ROUTED: YES/NO) so it is not dead save state.

## Keep
- LOW items (saveSchema reference-only, closure purity, determinism, channel math, tiering, clue-once, deadline-stamp redundancy) are correct; no change.

## Done when
Suite green again (no circular assertions: the settlement tests drive the clock), tsc + eslint clean, no regressions to the 496 pre-existing tests.
