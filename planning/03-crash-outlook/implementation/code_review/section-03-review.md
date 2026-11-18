# CRASH OUTLOOK screens (section-03) review

Reviewer: deep-implement:code-reviewer. CHECK SOURCE is genuinely engine-owned (reads state.sourceChecks / campaignQueue, computes no verdict, handles arrivedAfterSettlement), disabled SEND reasons come straight from module.validate(), tests drive the real engine+module and prove no shell timer drives the clock. But two serious problems, both masked because no test renders through ScreenRouter.

## HIGH
- **H1. Duplicate command form in the real shell.** OutlookScreen renders its OWN `<form data-testid="command-form">` + `<input data-testid="command-input">`, but ScreenRouter ALWAYS renders the shared `<CommandInput>` with identical testids wired to the active mission screen. Mounted through ScreenRouter (the only production path) there are TWO command inputs with colliding testids/ids; both dispatch. The 28 tests mount OutlookScreen bare, so the collision is invisible. The screen must consume the shared CommandInput, not render a second form. The INBOX/OUTBOX/LOG/BACK verbs are currently dead parsers returning a bogus CLOSE_OVERLAY (only work via the private form), so through the real shell, typing OUTBOX would close an overlay, not switch views.
- **H2. The SEND button hard-routes to the authored correct answer — the cheat the plan warns against.** MessageView builds SEND / SEND BACKUP as `makeSendAction(id, channel, message.correctRecipient)`, and OutboxView's `recipientFor()` defaults every queued item to `correctRecipient`. A mouse-only player delivers every required message correctly without reading evidence, TRACE, or CHECK SOURCE — the answer is baked into the button. There is no desk picker. A wrong route is only reachable by typed command. This defeats the mission's core puzzle through the primary affordance.

## MEDIUM
- **M1. No visible countdown; StatusLine is role=status, not role=timer.** The 30/10s warnings are fire-and-forget polite announcements only; a player watching the screen sees no seconds-to-deadline. Add a visible countdown (role=timer) driven by the display clock + engine timerMilestone.
- **M2. InboxView fabricates receipt timestamps from the row index** (`21:${14+index}:05`). Invented evidence in a mission about provenance. Use the record's real receiptTime from the graph/payload.
- **M3. No-payload branch + `as OutlookPayload` cast lies about nullability.** Guard the missing-payload case properly and type outlookPayload as `OutlookPayload | undefined`.
- **M4.** Ack-announce keyed by send-record array index; brittle if ordering changes. Prefer a stable send identity.

## LOW
- **L1.** ActionBar now emits `data-action={JSON.stringify(action)}` on EVERY button for all missions — a test concern bled into production markup globally. Gate to tests or assert identity by invoking the handler.
- **L2.** Dead view verbs (fixed by H1).
- **L3.** Only SEND passes through validate() for disabled state; QUEUE/READ/FLAG/TRACE/CHECK SOURCE buttons stay enabled even when the engine would reject. Minor.

## Test gap
Zero tests render through ScreenRouter (hides H1) and no test attempts a WRONG route via the SEND button (hides H2). Add both.

## Bottom line
Fix H1 (consume the shared CommandInput; wire view commands through the shared grammar; render through ScreenRouter in tests) and H2 (a desk picker so the player chooses the recipient; the button must not auto-route correctly; a wrong route must be clickable; test it), then M1-M3 and the LOWs.
