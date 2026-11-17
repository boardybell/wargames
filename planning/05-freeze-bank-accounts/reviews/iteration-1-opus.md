# Opus Review

**Model:** claude-opus (opus-plan-reviewer subagent)
**Generated:** 2026-11-17 (see session log)

Findings:
1. Early-settlement-as-failed via cause 'completed' is a contract violation:
   the engine has no mission-internal hard-fail settlement path, and
   smuggling failure through completed breaks every cause consumer (ending
   cues, debrief chrome). Needs an engine amendment naming the mechanism.
2. b04Traced cannot work: INSPECT_RECORD is a campaign action that never
   reaches the mission reducer; auditFlags.b04Traced is dead state and the
   D-83 clue would never fire. Fix at the engine/campaign layer (either a
   mission-condition clue or engine-owned inspection-gated clues).
3. before/after-hold ordering hazards: define the marker as after the FIRST
   broad hold ever; pin the simultaneity rule (request event sharing a
   timestamp with the hold) with a boundary test; debrief must cross-tab
   injected vs genuine after-hold requests or the player cannot challenge
   the circular logic.
4. Injection cap vs inbound consequence interaction undefined; "injection
   cap representable" untestable as written; the surge-with-adequate-cash
   fixture must be proven solvable both with and without the flightsDisrupted
   bump (mission order is player-chosen).
5. Prediction line: confirm re-derivation on every relevant state change
   (not just ticks); validator should assert the authored series exceeds
   observed during hold windows and tracks at or below before.
6. Sibling-pattern divergences: reason strings and account names in mutable
   substate violate the reference-only rule (authored reasons to the seed;
   computed reasons as selectors over typed codes); glossary handling is
   correct; CHECK SOURCE handling is correct; inline disabled reasons
   correct.
7. Missing semantics: PAY vs held accounts (does payment draw from the
   specific account), cash vs balances relationship (derived or stored),
   LIMIT per-request vs cumulative, threshold re-crossing in both
   directions, byte-budget confirmation.
8. Requirements coverage adequate in intent; two bullets depend on the
   fixes above.

Priority: 1 and 2 first (contract), then cash/balance and PAY/LIMIT
semantics, then before/after-hold boundary, then injection-cap testing,
then reason storage.

Meta-note: the self-answered interview restated the spec confidently
without re-reading the split 01 action-routing model; the two contract
violations were catchable there.
