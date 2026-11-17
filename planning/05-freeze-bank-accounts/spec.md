# Spec: 05-freeze-bank-accounts

Context: ../requirements.md section "3. FREEZE BANK ACCOUNTS" plus "Teach the player
to check the source" and the fixture table; ../decisions.md; ../project-manifest.md.

## Purpose

Mission 3. A bank-run simulation with a terminal ledger where depositor confidence is
the central pressure. Mission module against 01, rendered with 02 primitives.

## In scope

1. World: about ten fictional accounts with deterministic opening balances and a
   deterministic event stream of withdrawal and payment requests. All values are game
   units. Records include payroll, operating expenses, payroll duplicates, and
   disputed requests that reward a close read. Mechanics explained briefly while the
   first live decision is on screen.
2. Actions: keep a hold, release a hold, allow a limited release on an eligible
   account. Buttons and typed equivalents through the shared dispatch.
3. The loop. Broad or prolonged holds conserve cash now and depress confidence at the
   next tick. Falling confidence adds withdrawal requests at predictable thresholds,
   capable of producing a run while liquidity is initially adequate. Blanket releases
   spike outflow. Timely critical payments and selective releases stabilize
   confidence. Feedback capped for readability. Every confidence or demand change
   carries a plain-English reason. A cash floor and confidence target for a
   sustainable outcome stay visible.
4. Source discipline. WOPR's predicted withdrawals and observed withdrawal requests on
   distinct lines. When a broad hold causes new observed demand, Joshua treats the
   demand as validating the hold; the ledger shows precisely which requests arrived
   before and after the hold so the player can challenge that circle later. Fixture
   tie-in: B04 (event 21:14:21, receipt 21:14:30) cites F06 and assumes a system-wide
   shutdown; later withdrawals can be genuine responses to the hold. The ledger hold
   points back to D-83.
5. Settlement: close shows whether critical payments cleared, remaining liquidity,
   and why confidence moved. Distinct timeout outcome. Consequences out (early broad
   holds delay simulated staffing or service payments in later missions) and in
   (flight disruption raises withdrawal demand), applied once and capped.

## Out of scope

Shell chrome, other missions, media files.

## Provides

Mission module registration, outcome and consequence payloads, B04 and hold-timeline
records into the case file, debrief content.

## Needs

01 record model, tick scheduler, settlement; 02 ledger-friendly text primitives,
command dispatch, cue hooks (relay click on hold or release, low two-note confidence
threshold cue).

## Decisions and acceptance anchors

Deterministic and reproducible so decisions can be explained. Verification bullet: a
withdrawal surge caused by lost confidence even with cash initially available.
Meaningful success and distinct timeout; settled permanence; four-minute default
timer. Full quality, no rationing. No em-dashes.
