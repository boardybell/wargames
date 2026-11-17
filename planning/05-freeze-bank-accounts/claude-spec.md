# Complete Specification: 05-freeze-bank-accounts

Synthesis of spec.md, claude-research.md, and claude-interview.md
(self-answered under Bond's autonomy directive). 2026-11-17. Upstream:
../requirements.md section 3. FREEZE BANK ACCOUNTS plus the fixture table;
binding contracts from splits 01 and 02 (rev 2 plans plus all amendments,
including engine-owned CHECK SOURCE, INSPECT_RECORD, and the clues()
channel).

## What this is

Mission 3: a bank-run simulation on a terminal ledger where depositor
confidence is the central pressure. Ten accounts, a deterministic request
stream, critical payments due, and a feedback loop where WOPR's broad holds
manufacture the very demand it cites as validation. Pure MissionModule plus
a shell screen of ledger views.

## World model

- Ten accounts with authored opening balances and flavors (payroll,
  operating expense, vendor, municipal, depositor). About eighteen
  deterministic request events (withdrawals and payments) at authored
  offsets; four critical payments due at authored offsets. Integer game
  units throughout.
- Confidence: integer 0 to 100 (fixture start 72). Authored-interval tick
  events apply deltas with plain-English reason lines: held accounts
  subtract per tick, cleared critical payments add, selective releases add
  small amounts, cash below the floor subtracts. Thresholds 60, 45, 30
  inject new observed withdrawal requests at authored predictable sizes, at
  most one injection per threshold per campaign (the cap that keeps the
  loop readable). Demand prices confidence, not cash, so a run can begin
  with liquidity adequate.
- Visible targets: cash floor and confidence target for a sustainable
  outcome, always on screen.

## Actions

HOLD <account>, RELEASE <account>, LIMIT <account> <amount>, PAY <payment>,
TRACE <record>, CHECK SOURCE <record>, HELP; buttons identical. Disputed
and duplicate requests reward close reading: the payroll duplicate shares
an amount but differs in requester chain; the disputed request contradicts
its own account history. Mechanics are explained briefly while the first
live decision is on screen (authored intro lines, skippable).

## WOPR vs observed

Two distinct ledger lines: WOPR PREDICTED withdrawals (authored projection
treating hold-induced demand as validation) and OBSERVED requests (the
actual stream). Every request is marked arrivedBeforeHold or
arrivedAfterHold relative to the first broad hold, so the player can later
challenge the circular logic. The fixture hold-justification record B04
(DERIVED, cites F06, run R04, event 21:14:21, receipt 21:14:30, assumes
system-wide shutdown) sits in the briefing feed; TRACE shows its ancestry
and logs the D-83 clue via the clues() channel; INSPECT_RECORD highlights
it for the finale. Desk checks go through the engine's REQUEST_SOURCE_CHECK
with outcomes in the shared seed deskChecks table.

## Settlement

- Sustainable outcome: all critical payments cleared, cash at or above the
  floor, confidence at or above the target at settlement. Tiers: full
  (all three), partial (two), poor (one), failed (none). A hard run
  (confidence 0 or negative cash) settles early as failed.
- Close-out debrief: which critical payments cleared, remaining liquidity,
  why confidence moved (the authored reason lines aggregated), clue status,
  before/after-hold request accounting.
- Consequence out: paymentsDelayed magnitude inversely by tier. Consequence
  in: flightsDisrupted raises injected withdrawal sizes by an authored
  capped amount.
- OPEN EXCEPTIONS: held accounts read as resolved exceptions to WOPR while
  service outcomes (payments, confidence) worsen; the divergence is on the
  dual scoreboard throughout.

## Screens

Ledger view (accounts with balances and hold states), request feed
(chronological with before/after-hold markers and reason lines), payments
view (critical payments with due offsets and PAY affordances), the two
prediction/observation lines pinned in the status area. Desktop shows
ledger beside the feed; mobile single-pane with LEDGER/FEED/PAYMENTS
commands, tabs, and back affordances. Briefing still in art slot
briefing-bank. Cues: dry relay click on hold or release, low two-note on
confidence threshold crossings (engine events only). Glossary: LIQUIDITY,
DEPOSITOR CONFIDENCE, CRITICAL PAYMENT, LIMITED RELEASE, CASH FLOOR, plus
global provenance terms.

## Timer and events

Four minutes standard, eight extended (tick and request offsets scale
proportionally). Seed-authored schedule: request events, confidence ticks,
critical payment due reminders, timer milestones including 30 and 10
second warnings.

## Acceptance anchors

- The requirements' named test: a withdrawal surge caused by lost
  confidence even with cash initially available (threshold-injection
  fixture).
- Walkthrough reaches full tier; distinct timeout outcome; hard-run early
  settlement; before/after-hold marking correct around the first broad
  hold; settled permanence; keyboard-only and mobile playthroughs;
  command-button identity.
