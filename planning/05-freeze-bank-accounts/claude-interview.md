# Interview: 05-freeze-bank-accounts

2026-11-17. Mode: autonomous (Bond: "no more questions just build it and do
what you think is best"). Self-answered with reasoning recorded.

Q1: Scale of the ledger?
A: Ten accounts (payroll, operating expense, vendor, municipal, and
depositor flavors), a deterministic event stream of about eighteen
withdrawal and payment requests across the mission, four critical payments
due at authored offsets. All values integer game units. Rationale: spec
says about ten accounts; eighteen events keeps a four-minute mission dense
but readable.

Q2: Confidence mechanics?
A: Confidence is an integer 0 to 100 starting per seed (fixture 72).
Tick events every authored interval apply deltas: broad or prolonged holds
subtract per held account-tick, cleared critical payments add, selective
releases add small amounts, visible cash below the floor subtracts.
Crossing authored thresholds (60, 45, 30) injects new observed withdrawal
requests at predictable sizes; the cap rule: at most one injection per
threshold per campaign, keeping the loop readable. A run can start while
liquidity is adequate because demand injections price confidence, not cash.
Every delta carries a plain-English reason line rendered in the ledger
feed.

Q3: Player actions?
A: HOLD <account>, RELEASE <account>, LIMIT <account> <amount> (limited
release on an eligible account), PAY <paymentId> (clear a critical payment
when liquidity allows), TRACE, CHECK SOURCE, HELP. Disputed and duplicate
requests reward a close read: the payroll duplicate shares an amount but
differs in requester chain; the disputed request's body contradicts its
own account history.

Q4: WOPR line vs observed line?
A: Two distinct ledger lines per the requirements: WOPR PREDICTED
withdrawals (an authored projection that treats hold-induced demand as
validation) and OBSERVED requests (the actual stream). Requests are marked
arrivedBeforeHold or arrivedAfterHold relative to the first broad hold so
the player can challenge the circular logic later; B04 (fixture: DERIVED,
cites F06, event 21:14:21, receipt 21:14:30, assumes system-wide shutdown)
is the ledger hold's justification record and carries the D-83 clue on
TRACE.

Q5: Success definition?
A: Sustainable outcome: all critical payments cleared, cash at or above
the authored floor, confidence at or above the authored target at
settlement. Tiers: full (all three), partial (two), poor (one), failed
(none or hard run: confidence 0 or cash negative triggers early settlement
as failed). Consequence out: paymentsDelayed magnitude inversely by tier.
Consequence in: flightsDisrupted raises injected withdrawal sizes by an
authored capped amount.
