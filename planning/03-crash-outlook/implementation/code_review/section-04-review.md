# CRASH OUTLOOK fixtures + polish (section-04) review

Reviewer: deep-implement:code-reviewer. No HIGH issues. The tests are overwhelmingly genuine, end-to-end against the real engine + module (no mocks), deterministic (Date.now mocked, fast-check seed pinned 0x0ac77, 200 runs), integer-clean, no em-dashes. The hardest-scrutinized claims hold:
- boundary.test.ts constructs ack timing from the authored backup ETA (sends at endsAt-120s land acks exactly at endsAt) and genuinely exercises the engine buzzer/settlement interleave: endsAt -> completed/full, endsAt+1 -> timeout/partial, one settlement each.
- properties.test.ts drives random valid-shaped actions at nondecreasing times through real validate()+dispatch; the four invariants (backup in [0,cap], queue-free, superseded-never-satisfied via the real isSatisfiedDelivery, exactly-one-settlement) are falsifiable (post-settlement activeMission nulls, so a double-settle would trip).
- timeout asserts commsDelayed against the authored commsDelayedTable.failed row; forfeit-mid-mission folds one ack then forfeits -> poor; clue-survives-failure persists cluesFound post-mission; debrief exercises the per-kind outcomes, integer decoy spend, and clue flag. Parameterized over all three seeds.

## MEDIUM
- **M1. The spare-backup-slot assertion is vacuous.** fixtures.test.ts asserts `backupRemaining >= 1` on the plain walkthrough, which routes all three on PRIMARY and never touches backup, so it is trivially 5. The load-bearing finite-margin fixture (`backupWalkthroughScript`, leaves 0 < remaining < 5) IS defined and re-exported but never wired into the CI matrix. Wire it and assert `0 < backupRemaining < 5`.
- **M2. The adversarial test is near-strawman.** It sends every message to one desk (tier poor), proving only "a dumb player loses badly." The genuinely-adversarial `trustHintsScript` (routes each to its plausible hinted desk, settles one below full = partial) is defined and re-exported but never asserted. Wire it and assert it settles below tier full.
- **M3. narrow StatusLine "visible in every view" cannot fail** — StatusLine is rendered above the view switch, structurally present always. Fine as a guard; keep.
- **M4. The new OUTBOX/LOG back affordances are narrow-gated but nothing asserts they are ABSENT at desktop width**, so a regression dropping the `narrow ?` guard would go uncaught. Add desktop-width queryByTestId-null assertions for outbox-back and log-back. (message-back is not narrow-gated — pre-existing, out of scope.)

## LOW
- keyboard.test "focus lands sensibly" only re-focuses the shared command input (near-tautological) rather than asserting focus returns to the list row; acceptable for a single-command-surface model but does not match the plan's stated check.
- extended-time.test asserts `endsAt - T0 === 480000` (an absolute magic number) in a file that claims proportionality-not-absolutes; fine as a sanity anchor, the proportionality assertions are genuinely ratio-derived.

## Bottom line
Ship-able, but wire the two already-authored load-bearing fixtures (backupWalkthroughScript, trustHintsScript) into fixtures.test.ts and add desktop-absence assertions for outbox-back/log-back before calling the spare-slot and difficulty invariants proven. Everything else is sound.
