# Implementation Plan: 05-freeze-bank-accounts (revision 2 after review)

Mission 3 of SHALL WE PLAY A GAME?: FREEZE BANK ACCOUNTS, a bank-run ledger
simulation. Self-contained prose; code only as types, signatures, trees.
Revision 2 integrates reviews/iteration-1-opus.md in full; decisions in
claude-integration-notes.md. Depends on split 01 amendments 7 (terminal()
settlement with the collapsed cause) and 8 (clueRecords inspection-gated
clues).

## 1. Context and binding contracts

Engine (split 01, rev 2 plus sections 15 to 17): pure MissionModules with
init, schedule, validate, reduce, evaluate, debrief, saveSchema, optional
clues(), and optional terminal(state) returning 'completed' | 'collapsed' |
null polled after every reduce and drain; SettlementCause is completed,
collapsed, timeout, forfeit; tier is the success measure, cause the story.
CHECK SOURCE engine-owned (REQUEST_SOURCE_CHECK, shared deskChecks,
sourceCheckResolved); INSPECT_RECORD highlights records and, via
SeedDefinition.clueRecords, logs designated clues with no mission
involvement; integer math; events drain in (scheduledAt, id) order BEFORE
action reduction in the same dispatch; substates reference-only. Shell
(split 02, rev 2): primitives, verbs, global glossary, briefing-bank art
slot, emitted-driven cues and announcements, persisted UI preferences.
Content in SeedDefinition.missionPayloads.bank. Fixture record: B04
(DERIVED, cites F06, run R04, event 21:14:21, receipt 21:14:30), a
designated clue record in clueRecords.

## 2. Directory layout

    src/engine/missions/bank/
      types.ts          state types + valibot saveSchema (reference-only)
      content.ts        payload type, content validators with invariants
      module.ts         MissionModule implementation (terminal(), no clues())
      rules.ts          hold/release/limit/pay legality, request application,
                        tick math, threshold injection, tiering (pure)
      selectors.ts      derived cash, prediction line, reason rendering
    src/app/missions/bank/
      BankScreen.tsx    view switching, verb and glossary registration
      LedgerView.tsx    accounts, balances, hold states, action rows
      FeedView.tsx      chronological requests, markers, reason lines
      PaymentsView.tsx  critical payments and PAY affordances
      verbs.ts          HOLD/RELEASE/LIMIT/PAY/TRACE/CHECK SOURCE + views
      glossary.ts       local terms only
    test/engine/missions/bank/
    test/app/missions/bank/

## 3. Types and the reference-only split

Substate (validated by saveSchema, which structurally excludes authored
copy): per-account balance, held flag, limitedTo and cumulative limited
outflow; per-request application state (applied, refused, partial) as
typed codes; per-payment cleared flag; confidence integer; firstBroadHoldAt
(epoch ms or null); injectedThresholds (threshold values consumed);
appliedConsequenceMarkers internal to init. Authored content in the
payload: account definitions (ids, names, flavors, opening balances,
limit-eligibility), the request stream (ids, account ids, kinds, amounts,
offsets, disputed and duplicate linkage, authored reason strings), critical
payments (ids, account ids, amounts, due offsets), tick interval and delta
table, thresholds with injection sizes, floor, target, the authored WOPR
prediction series, intro lines. cash is NEVER stored: it is a selector,
the sum of available unheld balances (held accounts contribute zero;
limited accounts contribute up to their remaining limited allowance).

## 4. Rules (pure; drained-state discipline)

- Request application (scheduled events): a withdrawal against an open
  account reduces its balance up to the balance; against a limited account
  reduces up to the remaining cumulative allowance; against a held account
  is refused. Each application records a typed outcome code; the feed
  renders authored reasons for authored requests and code-derived text for
  outcomes through selectors (no strings in substate). Requests arriving
  (draining) in the same dispatch that applies a broad hold are
  arrivedBeforeHold by construction, since drains precede action
  reduction; the boundary test pins it.
- Broad hold: holding more than the authored broadHoldCount simultaneously.
  The first time an action reduce makes that true, firstBroadHoldAt stamps
  (once, ever); subsequent request arrivals mark arrivedAfterHold true.
  HOLD and RELEASE are per-account and freely reversible; legality against
  drained state with typed rejection reasons.
- LIMIT <account> <amount>: on limit-eligible accounts, sets a cumulative
  outflow cap; withdrawals draw down the allowance; re-LIMIT adjusts the
  cap but never below outflow already spent.
- PAY <payment>: draws from the payment's specific account; blocked while
  that account is held (release or limit to pay is the designed tension);
  requires sufficient balance; clears the payment and adds its confidence
  bonus at the next tick.
- Ticks (scheduled): confidence delta = authored table over (held-account
  count, cleared payments since last tick, selective releases, derived
  cash below floor), clamped 0 to 100. A downward crossing of a threshold
  not in injectedThresholds schedules that threshold's authored injected
  withdrawal requests (marked injected; sized base plus the engine-capped
  inbound flightsDisrupted magnitude, never below base) and consumes the
  threshold permanently (one injection per threshold ever; recovery and
  re-crossing cannot double-inject; both directions tested).
- terminal(state): 'collapsed' when confidence is 0 or any balance-derived
  invariant would push derived cash negative; null otherwise. There is no
  early 'completed' for this mission: sustainable play is judged at the
  deadline (the mission is about holding the line, not racing it).
- evaluate(cause): sustainable checks (all critical payments cleared,
  derived cash >= floor, confidence >= target) map to tiers full, partial,
  poor, failed; collapsed always evaluates failed. Consequence
  paymentsDelayed magnitude inversely by tier (authored table).
- Debrief: per-payment outcomes, remaining derived cash, aggregated
  confidence reasons, and the before/after-hold cross-tab (injected
  after-hold vs genuine after-hold vs before-hold counts and amounts) so
  the circular logic can be challenged with numbers; clue status.

## 5. Prediction line and scoreboard (selectors.ts)

selectPredictedWithdrawals: the authored series indexed by elapsed ticks,
shifted upward by an authored factor while the broad hold is active. Pure
selector recomputed on every render (so HOLD and RELEASE move it
immediately); never read by reducers. The validator asserts the authored
series exceeds the base observed stream during hold windows and tracks at
or below it before any hold, so the divergence reads as circular
validation, not noise. Held-account facts feed the campaign OPEN
EXCEPTIONS selector (held accounts read as WOPR-resolved exceptions while
payments and confidence worsen).

## 6. Content validator invariants (per seed)

Ten accounts; about eighteen requests; four critical payments; exactly one
payroll duplicate pair (shared amount, differing requester chain) and one
disputed request whose body contradicts its account history; thresholds
strictly descending; floor and target achievable by the walkthrough;
surge fixture solvable at base injection sizes AND at base plus maximum
capped inbound magnitude; prediction-series shape assertions (section 5);
B04 equivalent present, DERIVED with run ancestry, listed in
clueRecords; every referenced record id has a deskChecks entry; all
integers; authored reasons present for every authored request.

## 7. Screens (shell side)

BankScreen registers for mission id 'bank'; LEDGER, FEED, PAYMENTS view
commands plus desktop tabs and mobile back affordances; view toggle
persists with UI preferences. Intro mechanics lines render skippably over
the first live decision. LedgerView rows: balance, held or limited state,
HOLD/RELEASE/LIMIT buttons with inline disabled reasons from engine
rejections. PaymentsView: due offsets, PAY buttons (disabled with the
held-account reason when blocked). FeedView: chronological requests with
before/after-hold and injected markers and reason lines (authored or
code-derived via selectors). Status area pins derived cash, confidence,
floor, target, and the two lines (WOPR PREDICTED vs OBSERVED). TRACE
dispatches INSPECT_RECORD (B04's clue fires engine-side via clueRecords);
CHECK SOURCE dispatches REQUEST_SOURCE_CHECK; results from
sourceCheckResolved events. Cues: relay click on hold and release, low
two-note on threshold crossing, from emitted events only; threshold
crossings and payment outcomes announce politely; never per tick.
Glossary: local terms (LIQUIDITY, DEPOSITOR CONFIDENCE, CRITICAL PAYMENT,
LIMITED RELEASE, CASH FLOOR); provenance terms global.

## 8. Testing strategy notes

Engine: request-application table (open, held, limited, exact-balance
boundary); cumulative LIMIT across multiple requests; PAY blocked on held
account and after release; derived-cash selector vs balances consistency
property; tick-delta table; threshold injection exactly once with both
sizing variants; both-direction threshold crossing; firstBroadHoldAt
boundary test (request at the same timestamp as the broad hold is
before-hold); terminal() collapsed paths (confidence zero, cash-negative
guard) settling exactly once with cause collapsed and tier failed;
evaluate tiers per cause; debrief cross-tab correctness; walkthrough,
surge (both variants), timeout, forfeit, collapsed fixtures per seed;
extended-time proportionality; mission-local property tests (balances and
confidence stay in range, requests apply at most once, settled once,
substate JSON-safe). Shell: command-button identity, view navigation and
persistence, inline disabled reasons including the held-payment teaching
case, pinned status divergence moving on HOLD, feed markers, cue and
announcement wiring, keyboard-only and narrow passes. Validator across
seeds.

## 9. Risks

Loop legibility (mitigated: reason lines, injection cap, pinned targets,
debrief cross-tab). Tuning the delta table so the walkthrough, surge, and
collapsed fixtures all hold per seed is the authoring effort; the
validator invariants are the contract.
