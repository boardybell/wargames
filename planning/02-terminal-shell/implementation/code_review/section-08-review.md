# Cabinet + Grid (section-08) review

Reviewer: deep-implement:code-reviewer. Hard constraints (no Date.now, opacity-only transitions, container-only glow, alarm-only-via-finaleFinalPhase, pure render) are all honored and the backward-wall-clock defense is sound. Defects are in lifecycle/integration contracts the section deferred to callers without guarding.

## HIGH
- **H1. PlayBranchTrace rewinds on unstable `steps` props.** The reveal effect depends on the `steps` array reference; a caller passing an inline array (`steps={[...]}`) gives a new identity every parent render, so the effect re-fires and resets playback to step 1 mid-trace.
- **H2. `doneFired` never resets for a new sequence.** The latch stays true forever, so onDone never fires for a second/replayed branch.

## MEDIUM
- **M1. LampController.register() leaks on double-subscribe.** It overwrites `this.unsubscribe` without disposing the prior subscription; React 18 StrictMode double-invoke (or re-mount without teardown) double-applies every event.
- **M2. No stable-instance pattern for LampController.** The one component that consumes it ships no useRef/useMemo guidance; a caller doing `new LampController()` in render body thrashes subscriptions and resets lamp state every render.
- **M3. Grid keyboard a11y has no aria-activedescendant.** Selection moves visually and sets aria-selected on a cell that never receives focus; an AT user has nothing to follow.
- **M4 (doc).** Countdown trusts captureClock() was called before mount (set by send/wake); the precondition is unasserted. Real integration calls it at boot. Documented, not code-fixed.
- **M5 (no defect here).** ReadoutsPanel reactivity depends on section-02's store (useCampaign is a useSyncExternalStore); added a reactivity test for confidence.

## LOW
- **L1.** CharacterGrid tap class keys off `narrow` not `isCompact`, so forcing `compact` prop gives compact pitch without the 44px tap padding. Intentional: tap targets track physical narrow screens, compact is a pitch override. Kept, documented.
- **L2.** Alarm uses role=status (polite) vs role=alert (assertive). Defensible; the plan asked for restraint. Kept.
- **L3.** Countdown role=timer is not a live region. The plan explicitly forbids countdown announcements. Correct by intent. Kept.
- **L4.** useNarrow getServerSnapshot/getSnapshot mismatch is a latent SSR hydration hazard. This is a static GitHub Pages app with no SSR. Moot. Kept.

## Fixes applied
H1+H2 (content-signature effect key + doneFired reset), M1 (dispose before resubscribe), M2 (added `useLampController` stable hook + test), M3 (aria-activedescendant + per-cell ids via useId). Added ReadoutsPanel reactivity test. Rest let go with rationale above.
