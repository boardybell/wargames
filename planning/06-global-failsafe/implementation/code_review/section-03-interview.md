# Section 03 triage (joshua-catalog) — fix now that finale is committed

The finale module is committed (6423431). Its real exports to anchor against:
- REJECTION_CODES (runtime readonly array) + RejectionCode at src/engine/missions/finale/types.ts (5 codes: incomplete, wrong-root, receipt-order, derived-not-independent, unrelated-source).
- EndingId = 'recovery' | 'containment' | 'failure' (src/engine/missions/finale/endings.ts).
- Emitted engine events: scheduled ids 'warn-30' and 'warn-10' (end-anchored), and event kind 'finaleFinalPhase'.

## Fix
- H1 (completeness gate validates itself): in test/engine/joshua/lines.test.ts import REJECTION_CODES and the EndingId union from the committed finale, and assert (a) every REJECTION_CODES entry has a `finale.reject.<code>` manifest entry AND a covering catalog line, (b) every EndingId has an ending-readback line. This makes the gate fail CI if the finale adds a code the catalog does not cover.
- H2 (verbatim test is x.has(x)): add hardcoded STRING-LITERAL expectations for the five tone lines (e.g. expect(TONE_RECOGNITION).toBe('A STRANGE GAME. THE ONLY WINNING MOVE IS NOT TO PLAY.')) so drift from canon fails.
- M1 (eventKey mismatch): add a pure eventKeyFor(event) in joshua that maps the finale's REAL emitted engine events to catalog keys — warn-30 -> deadline.warning.30s, warn-10 -> deadline.warning.10s, finaleFinalPhase -> deadline.final-phase (align the catalog key strings to whatever you choose; keep them consistent) — and a test asserting each mapped key resolves to an existing catalog line. The per-mission mission.<x>.first-discrepancy beats have NO engine event; they are selected directly by section 04 (the finale screen) via selectLine with a known key, so they are out of eventKeyFor — add a short comment saying so, and keep the completeness test covering them (they must still exist in the catalog).

## Done when
The manifest cross-checks against the finale's REJECTION_CODES + EndingId (fails on a missing code), the five tone lines are pinned by independent literals, eventKeyFor maps every finale-emitted warning/final-phase event to an existing catalog line, joshua + full npm test + tsc + eslint green, no regressions.
