# A11y spine + glossary (section-09) review

Reviewer: deep-implement:code-reviewer. Consumers still compile, the 'reduce'->'reduced' rename propagated, useReducedMotion is a correct alias. Real defects below.

## HIGH
- **1. Polite coalescer is an unbounded 1-per-800ms drip.** `drainPolite` reschedules a fresh 800ms timer while the buffer is non-empty, so a finale burst of distinct events serializes into an ever-growing backlog (10 events = 8 seconds to fully read, strings stale by then). The plan's intent is a fixed burst window, not a drip.
- **2. Announcer timer/buffer are module singletons with no cleanup outside the test reset.** A pending 800ms timer can outlive teardown (HMR/multi-root). Blast radius small for a single persistent mount, but there is no production cleanup hook.

## MEDIUM
- **3. Focus resolution dropped the plan's command-input step with the escape hatch unimplemented.** `resolveTarget` is heading->root; the comment hand-waves an opt-in that does not exist. The deferral reasoning (auto-focusing the input routes menu number-shortcuts into a field where shouldBail suppresses them) is sound, but a bare input-first screen with no heading would land focus on the root container. Needs a real opt-in.
- **4. GlossaryTerm blur/mouse-leave close instantly, and tap double-fires (focus opens, click toggles -> net closed on first tap).** Untested tap path; a mobile tap can net to closed.
- **5. GlossaryTerm and registerGlossaryTerms throw in ALL modes, but the plan says dev-only.** An unregistered id white-screens the game in production instead of degrading to the raw term.

## LOW
- **6.** The onAnnounce sink fires before the region write and sees raw (un-coalesced) calls; sink and region can disagree on what was spoken. Document that the sink is raw and the region coalesced.
- **7.** motion.ts subscribe recreates the matchMedia object per subscriber. Not a leak (cleanup is paired); memoization is impossible without breaking per-test matchMedia mocks. Kept.
- **8.** The assertive region carries aria-atomic, not strictly required by the plan (role=alert is implicitly atomic). Harmless; kept.
- **9.** The ticker-never-announces boundary is enforced by convention, tested at the section-02 relay. Kept.

## Fixes applied
1 (+2): polite window now flushes all distinct buffered strings as one ordered utterance per window, then clears (bounded, finale-safe; timer always clears after one flush). 3: command-input step implemented as an opt-in `[data-a11y-focus]` marker (heading -> marked input -> root), so the menu still focuses its root (shortcuts work) and an input-first screen can opt in. 4: click now opens (idempotent with focus) rather than toggling, killing the tap double-fire; blur/leave/Escape still close. 5: unregistered-id and collision now throw in dev (import.meta.env.DEV) and degrade in prod (console.error + raw-term fallback / skip). 6: documented sink-is-raw. 7/8/9 kept with rationale.
