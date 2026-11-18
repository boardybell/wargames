# JOSHUA catalog (section-03) review

Reviewer: deep-implement:code-reviewer. FIX-THEN-SHIP. Data, selectors, and graceful-absence semantics are solid and clean; two HIGHs defeat the section's purpose. The two coupled fixes depend on the finale module (section 01) being committed, so this fix pass runs AFTER section 01 lands.

## HIGH
- **H1. The completeness gate validates the manifest against itself.** validateRequiredLines only proves manifest keys are a subset of catalog eventKeys; REQUIRED_LINE_MANIFEST is hand-authored in the same file and never cross-checked against the finale's real emission surface. If section 01 adds a sixth rejection code, the finale emits it and nothing forces the manifest to grow — the gate stays green with a missing JOSHUA line. Fix (in the TEST, to respect the parallelizability rule): import REJECTION_CODES from src/engine/missions/finale/types and assert every code has a finale.reject.<code> manifest entry + covering line; do the same for ending ids against the EndingId union (deriveEndingId). DEPENDS ON section 01 committed.
- **H2. The verbatim tone-line test is vacuous (x.has(x)).** The catalog entries reuse the tone constants by reference and TONE_REFERENCE_LINES is built from those same constants, so the test compares a value against itself and can never fail. Fix: add hard-coded string-literal expectations for each of the five lines (e.g. expect(TONE_RECOGNITION).toBe('A STRANGE GAME. THE ONLY WINNING MOVE IS NOT TO PLAY.')) so drift from canon fails CI. INDEPENDENT of section 01.

## MEDIUM
- **M1. eventKey namespace does not match any engine-emitted event, and no mapping ships.** Catalog keys deadline.warning.30s / .10s / deadline.final-phase and mission.<x>.first-discrepancy have no emitting source (the finale emits warn-30/warn-10 ids + finaleFinalPhase; there is no first-discrepancy event). Either define and export a pure eventKeyFor(event) mapping next to the catalog so section 04 cannot invent its own, or pin the binding in section 04 with a cross-check test. Resolve against the finale's real emitted kinds. DEPENDS ON section 01 committed (and coordinate with section 04).

## LOW (noted GOOD)
- Purity/graceful-absence genuinely clean: selectors never throw or log, selectLinesForKey returns a fresh array, unknown endingId returns null without guessing, catalog readonly + JSON-safe, em-dash rule asserted against the literal character, validator mutation-safety tested.
- The strip-a-line validator tests prove the exact missing key is named, but only for keys already in the manifest (that is the H1 hole).

## Bottom line
Fix-then-ship. Land H2 (verbatim literals) plus, after section 01 is committed, H1 (cross-assert the manifest against finale REJECTION_CODES + EndingId) and M1 (pin the eventKey mapping against the finale's real emitted events). Small surgical fixes; batched after the finale module to resolve the cross-module dependencies.
