# Section 03 review triage

Standing directive: full autonomy. The engine-ownership of CHECK SOURCE, the validate()-sourced disabled reasons, and the real-engine test harness are correct and stay. All HIGH/MEDIUM findings are real and get fixed; LOWs too.

## Fix
- **H1 (duplicate command form).** Remove OutlookScreen's private command form. Consume the shared `<CommandInput>` that ScreenRouter renders. Wire the view commands (INBOX/OUTBOX/LOG/BACK) and the engine-action verbs through the shared command grammar so typing them through the single shared input works: register the outlook verbs for real, and route view switches through a mission-scoped UI-command path (extend the LocalUiCommand union or an onUiCommand passthrough the screen handles) rather than a bogus CLOSE_OVERLAY. Add tests that render the screen THROUGH ScreenRouter (the production path) and assert exactly one command-input and that typed INBOX/OUTBOX/LOG/BACK switch views.
- **H2 (SEND cheat).** Remove the correctRecipient default from the SEND/SEND BACKUP buttons and from OutboxView's recipientFor. Add a desk picker: selecting SEND on a message presents the candidate desks (the authored desk set) and the player chooses; the button path must be able to produce a WRONG route and must not reveal the authored answer. Dispatch the chosen desk. Add a test that a wrong-desk SEND via the button spends capacity and does NOT satisfy the required delivery, proving the puzzle is not auto-won by clicking.
- **M1.** Render a visible countdown with role="timer" driven by the section-02 display clock (remainingFor + subscribeTick) and the engine timerMilestone events, so the deadline is on screen, not only announced.
- **M2.** Source the inbox receipt time from the record's real receiptTime (via the record graph / payload), never the row ordinal.
- **M3.** Guard the missing-outlook-payload case and type outlookPayload as OutlookPayload | undefined (no lying cast); buildEventCopy and selectors tolerate undefined.
- **M4.** Key the ack-announce dedupe on a stable send identity, not the array index.
- **L1.** Drop the global `data-action` JSON on the shared ActionBar (do not bleed a test concern into every mission's production markup); assert action identity in tests another way (invoke the handler, or a test-only hook).
- **L3.** Where cheap, pass QUEUE/CHECK SOURCE through validate() so their buttons disable with the engine reason too.

## Done when
Full suite green, tsc + eslint clean, no regressions; new tests render through ScreenRouter (catch H1) and exercise a wrong-desk button SEND (catch H2); the mission cannot be won by clicking without reading evidence.
