# Section 01: Engine Module and Rules (src/engine/missions/bank/)

## Mission Context

This section builds the pure engine module for FREEZE BANK ACCOUNTS, mission id `bank`, Mission 3 of SHALL WE PLAY A GAME?. It is a bank-run ledger simulation: the player holds, releases, and limits accounts, pays critical payments, and tries to keep depositor confidence and derived cash above authored thresholds until the deadline. The dramatic loop is circular validation: holding accounts makes WOPR's predicted-withdrawal line rise, which appears to justify the holds, while payments and confidence quietly worsen.

This section has no dependencies inside this split and blocks sections 02 (content and seeds), 03 (screens), and 04 (fixtures and polish). It presumes the engine from split 01 (revision 2 plus sections 15 to 17) and the shell contracts from split 02 are already implemented, including amendment 7 (`terminal()` settlement with the `collapsed` cause) and amendment 8 (`clueRecords` inspection-gated clues).

## Binding Engine Contracts (from split 01, restated here so this section stands alone)

- A `MissionModule` provides `init`, `schedule`, `validate`, `reduce`, `evaluate`, `debrief`, `saveSchema`, optional `clues()`, and optional `terminal(state)` returning `'completed' | 'collapsed' | null`. The engine polls `terminal()` after every reduce and after every event drain.
- `SettlementCause` is one of `completed`, `collapsed`, `timeout`, `forfeit`. Tier is the success measure; cause is the story. A mission settles exactly once.
- Scheduled events drain in `(scheduledAt, id)` order BEFORE action reduction within the same dispatch. This ordering is load-bearing for the broad-hold boundary rule below.
- CHECK SOURCE is engine-owned: the shell dispatches `REQUEST_SOURCE_CHECK`, the engine consults shared `deskChecks`, and resolution arrives via `sourceCheckResolved` events. The mission module contains no source-check code.
- `INSPECT_RECORD` highlights records; `SeedDefinition.clueRecords` designates which records log clues on inspection. Clue logging happens entirely engine-side. This module must contain NO clue code and must NOT implement `clues()`.
- All quantities are integer math. No floats anywhere in substate or rules.
- Substates are reference-only: typed codes and numbers, never authored copy. Authored strings live in the payload and are joined at render time by selectors.
- Mission content arrives through `SeedDefinition.missionPayloads.bank`.

## Files to Create

    src/engine/missions/bank/
      types.ts          substate types + valibot saveSchema (reference-only)
      content.ts        BankPayload TypeScript type ONLY (validators are section 02)
      rules.ts          hold/release/limit/pay legality, request application,
                        tick math, threshold injection, tiering (all pure)
      selectors.ts      derived cash, prediction line, reason rendering,
                        scoreboard facts
      module.ts         MissionModule implementation (terminal(), no clues())
    test/engine/missions/bank/
      types.test.ts
      rules.test.ts
      selectors.test.ts
      module.test.ts

Tests run in the node project via `npm test`. Unit tests in this section use small hand-built payloads constructed inline or in a local test helper; they do NOT depend on the authored seeds (those arrive in section 02). Also register the module in the engine's mission registry under id `bank`, wherever split 01 established registration.

## Tests First (TDD blocks 3, 4, 5)

### Types and the reference-only split (types.test.ts, selectors.test.ts)

- `saveSchema` round-trips a populated substate. The schema structurally rejects authored strings in substate: feeding a substate containing a reason string or account name fails validation. Outcome and rejection fields admit typed codes only.
- Derived cash selector equals the sum of available unheld balances across hand-built fixtures: held accounts contribute zero; limited accounts contribute up to their remaining limited allowance; open accounts contribute full balance.
- Cash is never stored: a structural assertion that the substate type and schema have no cash field.

### Rules (rules.test.ts)

- Request application table: withdrawal against an open account applies in full; against a held account is refused with a typed code; against a limited account applies up to the remaining allowance (partial outcome code when clipped); exact-balance boundary applies fully and leaves zero; duplicate-pair requests each apply by the same rules (the pairing is authoring metadata, not an engine dedupe); disputed requests apply by the same rules (the dispute lives in authored copy, not mechanics).
- Cumulative LIMIT: multiple withdrawals against one limited account draw down a single cumulative allowance; re-LIMIT adjusts the cap but never below outflow already spent (attempting to set it lower clamps or rejects per the chosen typed code, pinned by test).
- PAY: draws from the payment's specific account only; blocked with a typed reason while that account is held; legal after RELEASE, or while limited if the remaining allowance covers the amount; rejected on insufficient balance; clearing sets the payment's cleared flag and the confidence bonus lands at the NEXT tick, not immediately.
- Broad hold stamping: `firstBroadHoldAt` stamps exactly once ever, at the first action reduce where simultaneously held accounts exceed the authored `broadHoldCount`; releasing below the count and re-crossing does not restamp.
- Boundary test (pins the drain-before-reduce contract): a scheduled request event sharing the dispatch timestamp with the broad-hold action drains first and is therefore `arrivedBeforeHold`; a request arriving in any later dispatch is `arrivedAfterHold`.
- Tick delta table, each component isolated and then combined: held-account penalty, cleared-payments-since-last-tick bonus, selective-release bonus, derived-cash-below-floor penalty; result clamps to the 0 to 100 range at both ends.
- Threshold injection: a downward confidence crossing of a threshold not yet in `injectedThresholds` schedules that threshold's authored injected requests and consumes the threshold permanently; recovery above and a second downward crossing cannot double-inject (both directions tested); injected request sizing tested in both variants, base and base plus the engine-capped inbound `flightsDisrupted` magnitude, never below base.
- `terminal()`: returns `'collapsed'` at confidence 0; returns `'collapsed'` when the cash-negative guard trips (any balance-derived invariant would push derived cash negative); returns null otherwise; settles exactly once with cause `collapsed` and tier `failed`; a structural test asserts there is NO early `'completed'` path for this mission.
- `evaluate(cause)`: the sustainable checks (all critical payments cleared, derived cash at or above floor, confidence at or above target) map to tiers full, partial, poor, failed per cause; `collapsed` always evaluates failed; the `paymentsDelayed` consequence magnitude varies inversely with tier per the authored table.
- Clue (structural only in this section): the module exports no `clues()` and contains no clue logic; a minimal test payload with a `clueRecords` entry confirms engine-side logging fires on `INSPECT_RECORD` exactly once with zero mission involvement. (The authored B04 hold-justification record and its D-83 clue land in section 02; the full content-level clue test belongs there and in section 04.)
- Debrief: per-payment outcomes present; the before/after-hold cross-tab is correct (injected after-hold vs genuine after-hold vs before-hold, both counts and amounts); aggregated confidence reasons present as typed codes.

### Prediction line (selectors.test.ts)

- `selectPredictedWithdrawals` shifts the authored series upward by the authored factor while the broad hold is active and returns to the unshifted series when no hold is active; because it is a pure selector, it reflects HOLD and RELEASE immediately with no reducer involvement.
- Structural assertion: reducers never read the prediction selector (no import of `selectors.ts` from `rules.ts` or the reduce path in `module.ts`).
- The authored-series shape assertions (series exceeds base observed during hold windows, tracks at or below before any hold) are validator invariants and belong to section 02; do not implement them here.

## Implementation Details

### types.ts: substate and saveSchema

Substate holds mechanics only, validated by a valibot `saveSchema` that structurally excludes authored copy. Fields:

- Per-account: `balance` (integer), `held` (boolean), `limitedTo` (integer or null), cumulative limited outflow spent (integer).
- Per-request: application state as a typed code (`applied`, `refused`, `partial`), plus the before/after-hold flag (`arrivedAfterHold` boolean or equivalent).
- Per-payment: `cleared` flag.
- `confidence` integer, 0 to 100.
- `firstBroadHoldAt` as epoch ms or null.
- `injectedThresholds`: the set of threshold values already consumed.
- `appliedConsequenceMarkers`: internal to `init`, for inbound consequence application.

Cash is NEVER a field. It is always the selector described below.

### content.ts: payload type only

Define the `BankPayload` TypeScript type so rules, selectors, and module compile and tests can build minimal payloads. The type covers: account definitions (ids, names, flavors, opening balances, limit-eligibility), the request stream (ids, account ids, kinds, amounts, offsets, disputed and duplicate linkage, authored reason strings), critical payments (ids, account ids, amounts, due offsets, confidence bonus), `broadHoldCount`, tick interval and the confidence delta table, thresholds with injected-request definitions and base sizes, floor, target, the authored WOPR prediction series and hold shift factor, and intro lines. Content validators and authored seed data are section 02; leave validators out of this file for now (section 02 adds them here).

### rules.ts: pure functions against drained state

All legality checks run against drained state and return typed rejection reasons, never strings.

- Request application (fired by scheduled events): open account reduces balance up to the balance; limited account reduces up to the remaining cumulative allowance and records `partial` when clipped; held account refuses. Each application records its typed outcome code. Requests draining in the same dispatch that applies a broad hold are before-hold by construction because drains precede action reduction.
- HOLD and RELEASE: per-account, freely reversible, legality with typed rejections (already held, already open, unknown account).
- Broad hold: when an action reduce first makes the simultaneously-held count exceed `broadHoldCount`, stamp `firstBroadHoldAt` once, ever. Subsequent request arrivals mark `arrivedAfterHold`.
- LIMIT: only on limit-eligible accounts; sets the cumulative outflow cap; re-LIMIT never below outflow already spent.
- PAY: specific-account draw; blocked while held (this is the designed release-or-limit-to-pay tension); requires sufficient balance (or remaining allowance when limited); sets cleared; its confidence bonus is counted by the NEXT tick's delta, not applied inline.
- Tick (scheduled event): confidence delta computed from the authored table over held-account count, payments cleared since last tick, selective releases since last tick, and whether derived cash is below floor; clamp 0 to 100. Then threshold check: on a downward crossing of an unconsumed threshold, schedule that threshold's authored injected withdrawal requests, marked injected, sized base plus the engine-capped inbound `flightsDisrupted` consequence magnitude and never below base, and add the threshold to `injectedThresholds` permanently.
- Tiering helper for `evaluate`.

### selectors.ts

- `selectDerivedCash`: sum of available unheld balances; held contribute zero; limited contribute remaining allowance.
- `selectPredictedWithdrawals`: authored series indexed by elapsed ticks, shifted upward by the authored factor while the broad hold is active. Pure, recomputed per render, never read by reducers.
- Reason rendering: joins typed outcome and rejection codes with authored reason strings from the payload (authored requests render authored reasons; outcomes render code-derived text). No strings cross into substate.
- Scoreboard facts: held-account facts feed the campaign OPEN EXCEPTIONS selector, so held accounts read as WOPR-resolved exceptions while payments and confidence worsen.

### module.ts

Implements the `MissionModule` surface: `init` (builds substate from payload and applies inbound consequence markers), `schedule` (request stream, ticks, payment due offsets from authored offsets), `validate` (action legality via rules), `reduce` (delegates to rules; remember drain-before-reduce is engine-enforced, the module just honors drained state), `evaluate`, `debrief`, `saveSchema`, and `terminal`.

- `terminal(state)`: `'collapsed'` when confidence is 0 or the cash-negative guard trips; null otherwise. No early `'completed'`: sustainable play is judged at the deadline. The mission is about holding the line, not racing it.
- `evaluate(cause)`: sustainable checks map to full, partial, poor, failed; `collapsed` is always failed; emit the `paymentsDelayed` consequence with magnitude inversely by tier from the authored table.
- `debrief`: per-payment outcomes, remaining derived cash, aggregated confidence reasons as codes, the before/after-hold cross-tab (injected after-hold vs genuine after-hold vs before-hold, counts and amounts) so the circular logic can be challenged with numbers, and clue status (read from engine clue state, not mission code).
- No `clues()`. No source-check code. No strings in substate.

## Done Criteria

All tests above pass under `npm test` in the engine project using hand-built minimal payloads. The module registers under id `bank` and satisfies the split 01 `MissionModule` contract including `terminal()`. `content.ts` exports the `BankPayload` type that section 02 will author against and validate. Sections 02 and 03 can proceed in parallel once this lands.