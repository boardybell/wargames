# Section 09 review triage and fixes

Standing directive: full autonomy, no questions. Fixed the three substantive items and two UX/spec gaps; kept the low-severity items with rationale.

## Auto-fixed

- **H1 + H2 (unbounded polite backlog / timer).** The polite coalescer is now a fixed burst window: within one ~800ms window identical strings dedup and distinct strings accumulate in arrival order, then flush as ONE ordered utterance (joined) and the buffer clears. A finale burst of N events reads once, not as an N-times-800ms drip, and the timer always clears after a single flush (no growing backlog, no lingering reschedule). Tests updated: distinct strings from one window flush together ("FIRST. SECOND", one seq bump); a later window flushes its own batch.

- **M3 (command-input focus step).** Implemented as an opt-in `[data-a11y-focus]` marker: resolution is heading -> marked input -> root. The menu does not mark its command input, so it keeps root focus and its number-shortcuts; an input-first mission screen with no heading marks its input and lands focus there. The escape hatch now exists rather than being hand-waved. Test added covering both the unmarked (root) and marked (input) cases.

- **M4 (GlossaryTerm tap double-fire).** Click now OPENS (idempotent with focus) instead of toggling, so a touch tap (focus then click) reliably opens instead of netting to closed. Close remains via blur, mouse-leave, or Escape. Test updated to assert click-opens / blur-closes.

- **M5 (prod crash on unregistered glossary id).** GlossaryTerm resolves an id through a dev/prod split: in dev (import.meta.env.DEV) an unregistered id throws (loud), in production it logs and degrades to the raw id so a bad term never white-screens the game. registerGlossaryTerms collisions get the same treatment (throw in dev, log-and-skip in prod). Tests run with DEV true, so the throw assertions still hold.

- **L6.** Documented that the onAnnounce sink is RAW (sees every call, including polite duplicates) while the region is the coalesced truth.

## Let go (with rationale)
- **L7.** motion.ts subscribe recreates the matchMedia object per subscriber; memoizing at module scope would break per-test matchMedia mocks. Cleanup is paired, so no leak. Kept.
- **L8.** The assertive region carries aria-atomic; role=alert is implicitly atomic, so it is harmless. Kept.
- **L9.** The ticker-never-announces boundary is a documented invariant tested at the section-02 relay, not here. Kept.

## Verification
- `npx tsc --noEmit`: clean. `npx eslint .`: clean. `npm test`: 471 passed / 72 files (was 469). New/changed tests: focus opt-in marker, announcer bounded window (2), glossary click-opens.
