# section-04-fixtures-polish: Per-Seed Fixtures, Properties, Accessibility Passes, Debrief Checks

This section closes out the FREEZE BANK ACCOUNTS mission (mission id `bank`) for SHALL WE PLAY A GAME?. It adds the full end-to-end fixture suite run in CI for every seed, the extended-time proportionality check, the mission-local property suite, the keyboard-only and narrow-viewport accessibility passes, and the debrief cross-tab correctness checks. It writes tests and small test harness glue only; no new production modules. Where a fixture exposes a tuning gap (a seed whose walkthrough cannot reach target, or a surge variant that is unsolvable), the fix belongs in the authored payload numbers from section-02, not in rules code.

Dependencies (must be implemented first, referenced here only):
- section-01-module-rules: the engine module at `src/engine/missions/bank/` (types.ts, rules.ts, selectors.ts, module.ts with `terminal()` and `evaluate()`/`debrief()`).
- section-02-content-seeds: authored payloads for all three seeds at `SeedDefinition.missionPayloads.bank`, the content validator in `src/engine/missions/bank/content.ts`, and the exported walkthrough and surge action scripts (section-02 exports these specifically for this section's consumption).
- section-03-screen-ledger: the shell screens at `src/app/missions/bank/` (BankScreen, LedgerView, FeedView, PaymentsView, verbs, glossary).

Test runner: `npm test`. Engine fixture and property tests live in the node test project; accessibility passes live in jsdom with the real engine (no mocked reducers).

## Background you need (self-contained)

Engine contract (from split 01, revision 2, amendments 7 and 8): missions are pure MissionModules with init, schedule, validate, reduce, evaluate, debrief, saveSchema, and optional `terminal(state)` returning `'completed' | 'collapsed' | null`, polled after every reduce and event drain. SettlementCause is one of `completed`, `collapsed`, `timeout`, `forfeit`. Tier is the success measure; cause is the story. Scheduled events drain in `(scheduledAt, id)` order BEFORE action reduction within the same dispatch. All math is integer. Substate is reference-only: typed codes, no authored strings. INSPECT_RECORD plus `SeedDefinition.clueRecords` logs designated clues engine-side with no mission code involved.

Bank mission mechanics relevant to these fixtures:
- Ten accounts, roughly eighteen scheduled withdrawal requests, four critical payments per seed. HOLD/RELEASE per account, LIMIT sets a cumulative outflow cap on eligible accounts, PAY draws from a payment's specific account and is blocked while that account is held.
- Derived cash is a selector (sum of available unheld balances; held contribute zero, limited contribute remaining allowance). It is never stored.
- Broad hold: holding more than the authored `broadHoldCount` simultaneously stamps `firstBroadHoldAt` once, ever. Requests draining in the same dispatch that applies the broad hold are arrivedBeforeHold by construction (drain precedes action reduction).
- Ticks adjust confidence (clamped 0 to 100) via the authored delta table. A downward crossing of an unconsumed threshold schedules that threshold's authored injected withdrawal requests, sized base plus the engine-capped inbound `flightsDisrupted` magnitude (never below base), and consumes the threshold permanently. One injection per threshold ever.
- `terminal(state)` returns `'collapsed'` when confidence hits 0 or any update would push derived cash negative; there is NO early `'completed'` for this mission. Sustainable play is judged at the deadline.
- `evaluate(cause)`: all critical payments cleared, derived cash >= floor, confidence >= target map to tiers full/partial/poor/failed; cause `collapsed` always evaluates failed. Consequence `paymentsDelayed` magnitude comes from an authored per-tier table.
- Debrief includes per-payment outcomes, remaining derived cash, aggregated confidence reasons, clue status, and the before/after-hold cross-tab: injected after-hold vs genuine after-hold vs before-hold, each with counts and amounts.
- The fixture clue record is B04 (DERIVED, cites F06, run R04, event 21:14:21, receipt 21:14:30), designated in `clueRecords`; inspecting it logs the D-83 clue exactly once, engine-side.

Fixture infrastructure: the engine project already has a scripted-run harness from splits 01 and earlier missions (construct engine from a seed, feed a timestamped action script, advance scheduled time, read the settlement record). Reuse it. Section-02 exports, per seed, a walkthrough script (reaches tier full) and a surge script (survives the threshold injections). This section authors the remaining scripts (timeout-with-partial-play, forfeit, deliberate-collapse) as test-local data.

## Files

Create:
- `test/engine/missions/bank/fixtures.test.ts` (or split per fixture family if the file gets long; keep them under `test/engine/missions/bank/`)
- `test/engine/missions/bank/properties.test.ts`
- `test/engine/missions/bank/debrief.test.ts`
- `test/app/missions/bank/a11y.test.tsx`

Modify only if needed:
- CI test configuration, only if per-seed fixture matrices need an explicit include (most runners pick up the new files automatically).
- Section-02's script export module, only to re-export; do not change authored numbers here unless a fixture proves a seed untunable, and then change numbers only, with the validator still passing.

## Tests first

All engine fixtures run as a matrix over all three seeds. Use `describe.each(seeds)` or the project's existing per-seed matrix helper. Stub shapes below; fill in using the existing harness idioms.

### fixtures.test.ts

```ts
describe.each(allSeeds)('bank fixtures, seed %s', (seed) => {
  test('walkthrough: scripted run settles at deadline with cause timeout-or-completed per engine deadline semantics, tier full', () => {
    // Run the section-02 walkthrough script. Assert: all four payments
    // cleared, derived cash >= floor, confidence >= target, tier full.
    // Assert settlement happened exactly once.
  });

  test('surge, base sizing: threshold crossing injects once, run remains solvable', () => {
    // Run the section-02 surge script with inbound flightsDisrupted
    // magnitude at zero (base injection sizes). Assert each crossed
    // threshold injected exactly once, injected requests carry the
    // injected marker, and the script still reaches at least tier partial.
  });

  test('surge, max-capped sizing: same script solvable at base plus maximum capped magnitude', () => {
    // Same script, inbound magnitude pinned at the engine cap. Assert
    // injection sizes equal base plus cap (never below base) and the run
    // still reaches at least tier partial. This is the "surge x2" pair.
  });

  test('surge, both directions: recovery then re-crossing does not double-inject', () => {
    // Drive confidence below a threshold, recover above it, cross again.
    // Assert injectedThresholds consumed the threshold on the first
    // crossing and the second crossing scheduled nothing.
  });

  test('timeout: idle-to-light play reaches the deadline, cause timeout, tier from sustainable checks', () => {
    // No or minimal actions; let the stream and ticks run out the clock.
    // Assert cause timeout and that evaluate applied the sustainable
    // checks honestly (likely poor or failed, per seed numbers).
  });

  test('forfeit: FORFEIT mid-run settles once with cause forfeit', () => {
    // Assert tier per the engine's forfeit evaluation path and that no
    // further actions or drains mutate state after settlement.
  });

  test('collapsed via confidence zero: settles exactly once, cause collapsed, tier failed', () => {
    // Script that bleeds confidence to 0 (broad hold everything, clear
    // nothing). Assert terminal() fired, settlement count is one, and
    // subsequent dispatches are inert.
  });

  test('collapsed via cash-negative guard: tier failed, settled once', () => {
    // Drive an update that would push derived cash negative. Assert the
    // guard collapses rather than storing a negative, cause collapsed.
  });

  test('broad-hold boundary: request sharing the dispatch timestamp with the broad-hold action is arrivedBeforeHold', () => {
    // Schedule a request at exactly the timestamp of the HOLD that makes
    // the held count exceed broadHoldCount. Drain-before-reduce means the
    // request applies first. Assert its marker is before-hold and
    // firstBroadHoldAt equals that dispatch time, stamped once.
  });

  test('extended time proportionality', () => {
    // Run the walkthrough under the engine's extended-time setting.
    // Assert tick count, request offsets, and payment due offsets scale
    // proportionally (integer math: assert the engine's documented
    // rounding) and the walkthrough still reaches tier full.
  });

  test('clue: inspecting B04 logs D-83 exactly once', () => {
    // Dispatch INSPECT_RECORD on the B04-equivalent record id twice.
    // Assert the clue log gains exactly one D-83 entry and that
    // src/engine/missions/bank/module.ts contains no clue code path
    // (structural: module has no clues() and never touches the clue log).
  });
});
```

### properties.test.ts

Mission-local property tests over generated action sequences (use the project's existing property harness, for example fast-check, seeded for reproducibility). Arbitrary: sequences of legal and illegal HOLD/RELEASE/LIMIT/PAY/no-op actions interleaved with time advances across the full mission window, per seed.

```ts
describe.each(allSeeds)('bank properties, seed %s', (seed) => {
  test('balances stay integers in [0, +inf) and confidence stays in [0, 100]', () => {});
  test('each authored and injected request applies at most once', () => {});
  test('derived cash selector always equals sum of available unheld balances (held zero, limited remaining allowance)', () => {});
  test('settlement occurs at most once per run; post-settlement dispatches are no-ops', () => {});
  test('substate is JSON-safe and round-trips through saveSchema at every step', () => {});
  test('substate never contains authored strings (names, reasons); typed codes only', () => {});
});
```

### debrief.test.ts

```ts
describe.each(allSeeds)('bank debrief, seed %s', (seed) => {
  test('cross-tab partitions every request into exactly one of before-hold, genuine after-hold, injected after-hold', () => {
    // Run a scripted game with a known broad-hold time, known injections,
    // and known request stream. Assert counts and summed amounts per cell
    // against hand-computed expectations, and that cells sum to the total
    // request count and total requested amount.
  });

  test('cross-tab with no broad hold ever: all requests before-hold, zero in both after-hold cells', () => {});

  test('per-payment outcomes match run history; remaining derived cash matches the selector at settlement', () => {});

  test('aggregated confidence reasons are typed codes rendered through selectors, not stored strings', () => {});

  test('clue status reflects whether B04 was inspected during the run', () => {});
});
```

### a11y.test.tsx (jsdom, real engine)

```tsx
describe('bank screen accessibility passes', () => {
  test('keyboard-only: one full hold-release-pay flow', () => {
    // Starting from BankScreen with focus at the document root, using
    // only Tab/Shift-Tab/Enter/Space/Escape and the view commands:
    // navigate to LEDGER, HOLD an account, observe the inline state,
    // RELEASE it, navigate to PAYMENTS, PAY the payment on that account.
    // Assert focus is visible and reachable at every step, the disabled
    // PAY reason was readable while held, and the flow completes with the
    // payment cleared in engine state.
  });

  test('narrow viewport: same flow with mobile back affordances', () => {
    // Narrow the viewport below the tab breakpoint. Assert the three
    // views switch via commands and back affordances (no tabs), the
    // pinned status area (derived cash, confidence, floor, target,
    // PREDICTED vs OBSERVED lines) remains visible or reachable, and the
    // hold-release-pay flow completes.
  });

  test('view toggle persistence survives unmount/remount in both passes', () => {});
});
```

## Implementation notes

1. Write the fixture tests first and run them; the walkthrough and surge scripts come from section-02's exports, so a red walkthrough means authored numbers, not harness bugs. Chase tuning failures into the payload, re-run the content validator, and keep both green.
2. The surge pair is one script run twice: once with inbound `flightsDisrupted` magnitude zero, once pinned at the engine cap. Do not write two scripts; the plan's contract is that one line of play survives both sizings.
3. The broad-hold boundary fixture is the load-bearing test for the drain-before-reduce ordering. Construct it so the request's `scheduledAt` exactly equals the HOLD dispatch timestamp; if the harness cannot express that, extend the harness, not the rules.
4. Collapse fixtures must assert settlement idempotence: capture the settlement record, dispatch more actions and drains, assert state and record are byte-identical.
5. Property suite: bound sequence length so CI stays fast (the three-seed matrix multiplies everything). Use a fixed property seed in CI with a documented env override for exploratory runs, matching whatever convention earlier missions established.
6. Debrief cross-tab expectations should be hand-computed from the authored stream for one deterministic script per seed. Resist asserting against the implementation's own helper; the point is catching a mis-bucketed request.
7. Accessibility passes use the real engine and real verbs from section-03; no mocking. If a step is unreachable by keyboard, the fix goes in section-03's components, and this test stays as the regression guard.
8. Nothing in this section adds strings to substate, reads the prediction selector from a reducer, or adds a delete path anywhere. If a test wants state it cannot reach through dispatched actions, that is a missing rule or selector, and it belongs upstream.

## Done when

`npm test` runs the full matrix green: per-seed walkthrough, surge in both sizing variants, both-direction threshold crossing, timeout, forfeit, both collapse paths, the broad-hold boundary, extended-time proportionality, the clue fixture, the property suite, the debrief checks, and both accessibility passes. No production source outside authored payload numbers changed, and the content validator still passes on every seed.