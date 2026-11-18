# CRASH OUTLOOK module (section-01) review

Reviewer: deep-implement:code-reviewer. Suite 538 green, tsc/eslint clean, purity/closure/reference-only adaptations correct. But the delivery/early-completion model diverges from the plan and two flagship tests pass circularly.

## HIGH
- **H1. Early completion fires at SEND commit, not at ack arrival.** `isSatisfiedDelivery` counts a still-PENDING send as satisfied as long as `scheduledAckAt <= endsAt`, and `terminal()` settles `completed` the instant `satisfiedCount() >= 3` inside the committing SEND. The plan is explicit: a delivery counts only when ACKNOWLEDGED before the deadline, and completion fires when the third correct ack LANDS. As built, three correct sends at T+3s settle `completed` at T+3s with ~237s still on the clock. Not faithful; erases the ack race.
- **H2. The buzzer and early-completion tests assert the implementation, not the spec (pass for the wrong reason).** The buzzer test's third send self-settles `completed` at SEND dispatch and never reaches the endsAt settle-tick, so it proves nothing about drain-before-settle ordering. Non-cheatable on the deadline boundary (acks past endsAt are correctly rejected), but the intended deadline race is bypassed.
- **H3. `evaluate()` does not guard null `endsAt`** (uses `?? MAX_SAFE_INTEGER` fallback) while `terminal()` does. A forfeit before the deadline is stamped could over-credit. Treat null endsAt as 0 satisfiable, matching terminal.

## MEDIUM
- **M1. `deliveredRequired.correct` and `.delivered` are always equal — debrief cannot report "delivered to the wrong desk".** A wrong-recipient acknowledged delivery reads identically to one never sent. The plan wants each required delivery reported individually (delivered or not, correct or not). Track acknowledged-but-wrong-desk and distinguish in the debrief.
- **M2. `channelAckAt` stage indexing ternary quietly maps stage 2 to the fast stage-0 ETA.** Unreachable today (validateSend rejects stage-2 primary) but a latent trap. Index by stage with the stage asserted in {0,1}.
- **M3. SEND_QUEUED removal index is a double source of truth** (re-casts `action['index']` instead of the resolved target's index). Gated by validate today; capture the index on the send target and remove by it.
- **M4. `auditDelivered` is computed and persisted but never read** by clues/evaluate/debrief — dead save state. Wire it into the debrief (AUDIT ROUTED: YES/NO) or drop it.

## LOW (no action)
- saveSchema reference-only is sound (strictObject throughout; added durationMs/endsAt are reference-only integers). Closure over payload is pure and per-mission (no aliasing). No Date/Math.random/timers; integer discipline holds; no em-dashes. Channel math, QUEUE free + dispatch-time eval + stays-queued-on-reject, supersession never satisfies, wrong-recipient spends+logs, tiering 3/2/1/0 across causes, clue-once-on-double-read all verified correct. Deadline-stamp redundancy with the engine's own endsAt is acceptable given the engine threads neither seed nor endsAt into the module.

## Bottom line
Fix H1 (require an acknowledged/folded ack before a delivery is satisfied; completion fires when the third correct ack lands at the next wake >= its scheduledAckAt, with the endsAt settle-tick folding on-time acks before the timeout guard), then rewrite the buzzer + early-completion tests to assert settlement timing against the clock, not against SEND dispatch. Then H3, M1-M4.
