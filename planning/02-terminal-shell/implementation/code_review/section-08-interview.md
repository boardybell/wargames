# Section 08 review triage and fixes

Standing directive: full autonomy, no questions. Constraints and determinism passed clean; fixed the real lifecycle/integration defects, documented the let-gos.

## Auto-fixed

- **H1 + H2 (PlayBranchTrace rewind + stale done-latch).** The reveal effect now keys on a content signature (`steps.map(s => s.step).join('|')`) instead of the array reference, so an inline-array prop no longer rewinds an in-flight trace. `doneFired` resets at the top of that effect, so a new sequence re-arms onDone. Added two tests: a fresh array of identical content does not rewind, and onDone fires once per completed sequence (twice across two sequences).

- **M1 (LampController double-subscribe leak).** `register()` now calls `dispose()` before resubscribing, so a double register (React 18 StrictMode double-invoke or re-mount) never leaves two live subscriptions. Test added: registering twice then relaying an event notifies once.

- **M2 (no stable-instance pattern).** Added `useLampController()` (useRef one instance, register in an effect with cleanup) and exported it, so callers never do `new LampController()` in a render body. Test added: the controller survives a parent re-render and keeps lamp state.

- **M3 (grid keyboard a11y).** Each cell now carries a deterministic `id` and the grid sets `aria-activedescendant` to the selected cell, so an AT user has an active descendant to follow. The id base is a prop (default `wg-grid`) rather than `useId`, because `useId` increments across renders and would break the provable-purity guarantee (identical props => identical markup); a prop-derived base keeps the render pure. Tests added for activedescendant present/absent.

- **M5 (ReadoutsPanel reactivity, not a defect but worth proving).** Added a test that settles a mission after mount and asserts the panel updates live (12 -> 9 open, 0 -> 30 service) via the useCampaign store subscription.

## Let go (with rationale, documented in code)

- **M4.** Countdown trusts captureClock() ran before mount; real boot wakes via init(). Added a precondition comment; the zero clamp keeps it safe before any capture.
- **L1.** Tap padding tracks a physically narrow (touch) viewport, not the `compact` pitch override. Intentional; commented.
- **L2.** Alarm uses role=status (polite) not role=alert. The plan asked for restraint; defensible.
- **L3.** Countdown role=timer is not a live region, by design: the plan forbids countdown announcements.
- **L4.** useNarrow server/client snapshot mismatch is an SSR hazard only; this is a static no-SSR app.

## Verification
- `npx tsc --noEmit`: clean. `npx eslint .`: clean. `npm test`: 433 passed / 67 files (was 425 / 66). New tests: grid activedescendant (2), branch-trace stability + onDone re-fire (2), lamp double-register (1), useLampController stability + alarm (2), readouts reactivity (1), minus consolidation.
