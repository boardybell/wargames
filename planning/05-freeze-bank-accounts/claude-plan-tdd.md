# TDD Plan: 05-freeze-bank-accounts

Companion to claude-plan.md revision 2; same section numbering. Engine
tests in the node project; screen tests in jsdom with the real engine.
Stubs say what to test, not how.

## 3. Types and reference-only split

- saveSchema round-trips substate; schema rejects authored strings
  (reasons, names) in substate; typed codes only.
- Derived cash selector equals sum of available unheld balances across
  fixtures (held contribute zero, limited contribute remaining
  allowance); cash is never stored (structural assertion).

## 4. Rules

- Request application table: open (full), held (refused), limited
  (up to remaining allowance), exact-balance boundary, duplicate pair
  behavior, disputed request behavior.
- Cumulative LIMIT: multiple requests draw down one allowance; re-LIMIT
  never below spent outflow.
- PAY: draws from its specific account; blocked while held; legal after
  release or within a limit covering it; insufficient balance rejected.
- Broad hold: stamped once ever at the authored simultaneous-hold count;
  boundary test: a request event sharing the dispatch timestamp with the
  broad-hold action drains first and is arrivedBeforeHold.
- Ticks: delta table per component (held penalty, cleared bonus,
  selective release bonus, below-floor penalty), clamp 0 to 100.
- Threshold injection: exactly once per threshold ever; both-direction
  crossing cannot double-inject; recovery path reachable after a
  crossing; sizing base and base-plus-max-capped-magnitude variants both
  solvable (surge fixture run twice).
- terminal(): collapsed at confidence 0 and at the cash-negative guard;
  settles exactly once with cause collapsed and tier failed; no early
  completed for this mission.
- evaluate: sustainable checks to tiers per cause; paymentsDelayed by
  tier table.
- Clue: inspecting the hold-justification record logs the D-83 clue via
  clueRecords exactly once; the module has no clue code.
- Debrief: per-payment outcomes; before/after-hold cross-tab (injected
  after-hold vs genuine after-hold vs before-hold, counts and amounts);
  aggregated reasons.

## 5. Prediction line

- Selector shifts upward while broad hold active and recomputes on HOLD
  and RELEASE (render-level test); reducers never read it (structural).
- Validator shape assertions: authored series exceeds base observed
  during hold windows, tracks at or below before any hold.

## 6. Content validator (per seed)

- Roster and stream counts; duplicate pair and disputed request present
  with their authored contradictions; thresholds descending; floor and
  target walkthrough-achievable; surge solvable in both sizing variants;
  prediction-series shape; clue record designated and DERIVED with run
  ancestry; deskChecks coverage; authored reasons for every request; all
  integers.

## 7. Screens

- Command-button identity for all verbs; view navigation (LEDGER, FEED,
  PAYMENTS) with tabs, back affordances, persisted toggle.
- Inline disabled reasons including the held-payment teaching case.
- Status area pins derived cash, confidence, floor, target, and both
  lines; the predicted line moves on HOLD immediately.
- Feed markers (before/after-hold, injected) and reason rendering from
  selectors.
- Intro lines render skippably over the first decision.
- Cues and announcements from emitted events only; nothing per tick.
- Keyboard-only and narrow passes for one full hold-release-pay flow.

## 8. Cross-cutting

- Extended time proportionality; mission-local properties (integers in
  range, at-most-once request application, settled once, JSON-safe);
  walkthrough, surge x2, timeout, forfeit, collapsed fixtures per seed
  in CI.
