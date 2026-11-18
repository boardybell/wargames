# Section 04 triage (bank fixtures-polish)

Fixed directly (small, surgical, test-strength). The verified-good core (broad-hold tie, surge pair, collapse idempotence, clue, hand-computed debrief) stays as-is.

## Fixed
- M1 (a11y keyboard-only honesty): the narrow-viewport BACK activation used fireEvent.click in a keyboard-only pass. Replaced with assertFocusable('bank-back') + `await user.keyboard('{Enter}')` (userEvent v14 synthesizes a focused native button's Enter->click); the test is now async and asserts back is a BUTTON.
- M2 (focusable vs Tab-reachable): assertFocusable now also asserts el.tabIndex >= 0 (not -1) and aria-hidden !== 'true', so a control dropped out of the tab order but still programmatically focusable would fail.
- M3 (derived-cash self-reference): expectedDerivedCash inlines the limited-branch arithmetic (Math.max(0, Math.min(balance, limitedTo - limitedSpent))) instead of calling rules.ts remainingAllowance — the same helper the selector folds through — and the now-unused import is removed.
- L1 (extended-time magic constant): exported EXTENDED_TIME_SCALE from src/engine/time (single source of truth, used in materializeSchedule) and the proportionality test asserts ratio === EXTENDED_TIME_SCALE instead of a bare 2.

## Deferred (LOW, redundantly covered)
- L2 (main cross-tab partition-sum is literal-based, mildly circular): left as-is. A silently-dropped authored wave is already independently caught by the no-broad-hold test (asserts before_hold_count === 18 against the live run). Noted as a follow-up; not worth a risky substate-shape edit now.

## Verified
bank engine + time 214, bank app 47, full npm test 1185, tsc + eslint clean.
