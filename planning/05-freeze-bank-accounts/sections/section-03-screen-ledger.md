# Section 03: Screens, Ledger, Feed, Payments (section-03-screen-ledger)

Shell-side implementation of Mission 3 of SHALL WE PLAY A GAME?: FREEZE
BANK ACCOUNTS, a bank-run ledger simulation. This section builds the
entire `src/app/missions/bank/` tree: the BankScreen registration, the
three views (LEDGER, FEED, PAYMENTS), action rows with inline disabled
reasons, the pinned status area with the moving WOPR prediction line,
feed markers, the skippable intro, verbs, the local glossary, and cue
and announcement wiring. Tests are TDD block 7 and are written first.

## Dependencies

Depends on section-01-module-rules, which delivers the engine module at
`src/engine/missions/bank/` (types, rules, selectors, module
registration under mission id `bank`). This section consumes its typed
rejection reasons, its selectors (derived cash, prediction line, reason
rendering), and its emitted events. It does NOT depend on
section-02-content-seeds; screen tests construct small in-test payloads
that satisfy the payload type from section 01 rather than loading the
authored seeds. Section-04-fixtures-polish depends on this section.

Prerequisite platform work (already in place from earlier splits, not
built here): the shell primitives, verb registry, global glossary,
briefing-bank art slot, emitted-driven cue and announcement plumbing,
and persisted UI preferences all come from split 02. The engine
dispatch loop, CHECK SOURCE machinery (REQUEST_SOURCE_CHECK action,
shared deskChecks, sourceCheckResolved event), and INSPECT_RECORD with
SeedDefinition.clueRecords come from split 01 including amendments 7
and 8. The fixture record B04 (DERIVED, cites F06, run R04, event
21:14:21, receipt 21:14:30) is a designated clue record; inspecting it
logs its clue engine-side with no mission or screen code involved.

## Files to create

    src/app/missions/bank/
      BankScreen.tsx    view switching, verb and glossary registration
      LedgerView.tsx    accounts, balances, hold states, action rows
      FeedView.tsx      chronological requests, markers, reason lines
      PaymentsView.tsx  critical payments and PAY affordances
      verbs.ts          HOLD/RELEASE/LIMIT/PAY/TRACE/CHECK SOURCE + views
      glossary.ts       local terms only
    test/app/missions/bank/
      (jsdom test files mirroring the above; real engine, no engine mocks)

Test command: `npm test`. Screen tests run in jsdom against the real
engine module from section 01; engine behavior is never mocked, only
driven through dispatch.

## Tests first (TDD block 7)

Write these as failing stubs before any component code. Stubs say what
to test, not how; docstrings and skeletal assertions are fine at first
commit of each test file.

- Command-button identity for all verbs: every verb available as a
  typed command (HOLD, RELEASE, LIMIT, PAY, TRACE, CHECK SOURCE,
  LEDGER, FEED, PAYMENTS) has a button that dispatches the identical
  action object the command path dispatches.
- View navigation: LEDGER, FEED, PAYMENTS switch views via commands and
  desktop tabs; mobile back affordances return correctly; the view
  toggle persists through the UI preferences mechanism and restores on
  remount.
- Inline disabled reasons: action buttons disabled by engine rejection
  show the engine's typed reason rendered to text inline, including the
  held-payment teaching case (PAY disabled with the held-account reason
  while the payment's account is held, enabled after RELEASE or after a
  LIMIT that covers the payment).
- Status area pins derived cash, confidence, floor, target, and both
  lines (WOPR PREDICTED vs OBSERVED); the predicted line moves
  immediately on HOLD, in the same render, because it is a pure
  selector over current state.
- Feed markers: before-hold and after-hold markers and the injected
  marker render per request; reason lines come from selectors (authored
  reasons for authored requests, code-derived text for outcome codes);
  no reason strings are read from substate.
- Intro mechanics lines render skippably over the first live decision;
  skipping lands the player on the live screen with nothing consumed.
- Cues and announcements fire from emitted events only: relay click on
  hold and release, low two-note on threshold crossing; threshold
  crossings and payment outcomes announce politely; nothing fires per
  tick (drive several ticks and assert silence).
- Keyboard-only and narrow-viewport passes for one full
  hold-release-pay flow (the full per-seed passes live in section 04;
  here one flow proves the screen is operable both ways).

## Implementation

### BankScreen.tsx

Registers for mission id `bank` with the shell's mission screen
registry. Owns view switching among LedgerView, FeedView, and
PaymentsView, driven three ways: the LEDGER, FEED, PAYMENTS view
commands, desktop tabs, and mobile back affordances. The active view
persists with the shell's UI preferences so a reload restores it.
Registers verbs from `verbs.ts` and local glossary terms from
`glossary.ts` on mount, unregisters on unmount. Renders the intro
mechanics lines (authored in the payload) skippably over the first live
decision; the game state underneath is live but undisturbed until the
player acts or skips.

The pinned status area is part of BankScreen, visible in every view. It
shows derived cash (a selector, never stored; the sum of available
unheld balances where held accounts contribute zero and limited
accounts contribute remaining allowance), confidence, floor, target,
and the two lines labeled WOPR PREDICTED and OBSERVED. The predicted
line is `selectPredictedWithdrawals` from the engine's selectors.ts:
the authored series indexed by elapsed ticks, shifted upward by an
authored factor while the broad hold is active. It is recomputed on
every render and never read by reducers, which is exactly why HOLD and
RELEASE move it instantly. The divergence between the two lines is the
mission's tell: the prediction validates the hold circularly, and the
player can watch it.

Held-account facts from this mission feed the campaign-level OPEN
EXCEPTIONS selector (held accounts read as WOPR-resolved exceptions
while payments and confidence worsen). The screen consumes whatever the
campaign shell renders; no bank-specific OPEN EXCEPTIONS UI here, just
make sure the facts flow from the engine selector, not local state.

### LedgerView.tsx

One row per account: name, balance, held or limited state (limited rows
show limitedTo and remaining allowance), and HOLD, RELEASE, LIMIT
buttons. Legality comes from the engine rules against drained state;
when an action would be rejected, the button renders disabled with the
typed rejection reason rendered inline next to it, not in a tooltip
alone. LIMIT takes an amount; use the shell's standard amount input
affordance. HOLD and RELEASE are freely reversible per account, so no
confirmation dialogs.

### PaymentsView.tsx

One row per critical payment: amount, source account, due offset, and a
PAY button. PAY draws from the payment's specific account and is
blocked while that account is held; the disabled PAY button must show
the held-account reason inline because release-or-limit-to-pay is the
designed tension and the player has to be able to read it. Cleared
payments show their cleared status.

### FeedView.tsx

Chronological request list. Each entry shows the request, its
application outcome, its reason line, and its markers: arrivedBeforeHold
or arrivedAfterHold, and injected when the request came from a
threshold injection. Reason lines are produced by engine selectors that
render authored reasons for authored requests and code-derived text for
typed outcome codes; substate carries codes only, never strings, and
the view must not invent reason text. A request that drains in the same
dispatch that applies the broad hold is before-hold by construction
(drains precede action reduction); the feed just renders the marker the
engine recorded.

### verbs.ts

Registers HOLD, RELEASE, LIMIT, PAY, TRACE, CHECK SOURCE, and the three
view commands. TRACE dispatches the engine-owned INSPECT_RECORD action;
when the player traces the hold-justification record (the B04
equivalent), the clue logs engine-side via clueRecords and this file
contains zero clue logic. CHECK SOURCE dispatches REQUEST_SOURCE_CHECK;
results arrive via sourceCheckResolved events and render through the
shell's standard source-check presentation. Buttons and typed commands
must dispatch identical action objects (the command-button identity
test pins this).

### glossary.ts

Local terms only: LIQUIDITY, DEPOSITOR CONFIDENCE, CRITICAL PAYMENT,
LIMITED RELEASE, CASH FLOOR. Provenance terms (DERIVED, run ancestry,
and friends) are already in the global glossary from split 02 and must
not be duplicated here.

### Cues and announcements

Wire exclusively off emitted engine events, never off state diffing and
never per tick: relay click on hold and release actions, low two-note
on threshold crossing. Threshold crossings and payment outcomes
announce politely through the shell's announcement channel. The
nothing-per-tick rule is a test, not a convention.

## Definition of done

All TDD block 7 tests pass under `npm test` against the real section-01
engine with in-test payloads. View toggle survives remount. Every
disabled button explains itself inline from a typed engine reason. The
predicted line moves on HOLD in the same render. No cue or announcement
fires on a bare tick. One hold-release-pay flow completes keyboard-only
and at narrow viewport. No reason strings, clue logic, or settlement
logic anywhere in `src/app/missions/bank/`.