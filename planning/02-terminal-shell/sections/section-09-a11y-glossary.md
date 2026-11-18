# Section 09: Accessibility Spine and Glossary Primitive

Section id: `section-09-a11y-glossary`. Implements `src/app/a11y/` for the 02-terminal-shell split of SHALL WE PLAY A GAME?, a WarGames-inspired browser game: the live regions and announcer, the focus manager, the shared key-handler bail utility, the motion-preference hook, and the glossary term primitive with the project glossary module. These are the cross-cutting services every other shell section consumes; they have no engine dependency and no visual-theme dependency, so they build in parallel with the engine binding and the CRT theme.

## Background and context

The project is a React 18+ / Vite / TypeScript static site. The app shell scaffold (Vite config, jsdom Vitest project under `test/app/`, Testing Library dev deps, the App shell with a screen-router skeleton and a dialog host) is provided by section-01-app-scaffold, the only hard dependency. This section blocks section-04 (the terminal framework builds its input precedence stack on the bail utility and calls moveFocusTo on every screen change) and section-06 (the settings dialog writes the motion override and the dialog suite renders glossary terms). Section-03 consumes `useMotionPreference` through an injected boolean until this section lands, then rewires. Dependency footprint is locked to react and react-dom; no libraries. House rule: no em-dashes anywhere, including comments and strings.

Two architecture rules fixed by plan review and non-negotiable here: live regions mount at boot as siblings of the dialog host at the app root, outside all screen roots, so assertive announcements still fire while a native modal dialog is open; and `announce(text, channel)` is the single entry point for every spoken notification in the app. The engine-event relay (section-02) and the audio captions (section-07) route through it; the repaint ticker never does. Countdown ticks are never announced.

The glossary primitive implements the global Web UI rule: any jargon term shows a plain-language definition on hover, is focusable and tap-friendly, and Escape closes it. One glossary module per project; definitions written for a smart layperson.

## Tests first

Write these under the jsdom Vitest project before implementing. Stubs say what to assert, not how. Mock `window.matchMedia` where the motion tests need it (small local mock; do not add a dependency).

Announcer and live regions (`test/app/a11y/announcer.test.tsx`):

- Both live regions exist from boot: polite `role="status"` with `aria-atomic`, assertive `role="alert"`; they render as siblings of the dialog host at the app root and are never unmounted across screen changes.
- Polite channel coalesces identical strings announced within the ~800 ms burst window into one utterance (fake timers), and queues distinct strings in arrival order.
- Assertive channel never coalesces and never debounces: two identical assertive announcements both reach the region.
- Retrigger: announcing the same polite string after the window re-reads it; assert the content-toggle mechanism (region text clears or mutates between identical announcements so assistive tech re-announces).
- No announcement occurs without an explicit `announce()` call: advancing fake timers alone produces zero region mutations (this is the countdown-ticks-never-announced guarantee at the API level).
- Assertive announcements fire while a `showModal` dialog is open (regions are outside the dialog but still receive text; assert the DOM update happens).

Focus manager (`test/app/a11y/focus.test.tsx`):

- `moveFocusTo(el)` focuses the element with `tabindex="-1"` applied when the element is not natively focusable, and passes `preventScroll: true` (spy on `HTMLElement.prototype.focus`).
- Calling it on a screen root focuses the root's heading or command input per the documented resolution order; a bare container still receives focus via tabindex -1.

Key-handler bail utility (`test/app/a11y/keys.test.ts`):

- Returns bail=true for events targeting `input`, `textarea`, `select`, and `contentEditable` elements; for held ctrl, meta, or alt modifiers; and for `isComposing` events.
- Returns bail=false for a plain key on a non-editable target. Table-driven test over all the cases.

Motion preference (`test/app/a11y/motion.test.tsx`):

- Default: with no override set, the hook mirrors `prefers-reduced-motion` (mocked matchMedia, both values).
- Override: setting the in-app override to reduced or full wins over the media query; setting it back to system restores media-query behavior; the hook re-renders subscribers on override change and on media-query change.
- In-flight completion contract (review integration 13): flipping the preference mid-animation does not abort anything. Assert the hook itself never calls cancel or finish on any Animation, and that a consumer following the documented pattern (sample the preference once at animation start) runs its in-flight animation to completion after a flip (mock the animation object; assert cancel was never invoked by the preference change path).
- Corrupt or missing persisted override falls back to system.

Glossary (`test/app/a11y/glossary.test.tsx`), extracted from TDD block 6:

- A rendered term opens its definition on hover, on keyboard focus, and on tap/click; Escape closes it; closing restores normal state without stealing focus elsewhere.
- The term element is focusable and labeled: reachable by Tab, exposes the open state (aria-expanded) and associates the definition text (aria-describedby) while open.
- Definitions exist for every registered term: iterate the glossary module and assert every entry has a non-empty plain-language definition; the initial registry covers OPEN EXCEPTIONS, TRACE, CHECK SOURCE, OBSERVED, EXERCISE, DERIVED, independent corroboration, REPEAT D-83, HOLD AND VERIFY, and STAGED RECOVERY.
- `registerGlossaryTerms` adds mission terms; registering a colliding term id throws in dev.
- Rendering a GlossaryTerm for an unregistered id fails loudly in dev (throw or console.error assertion, pick one and test it).

## Implementation

### Files to create or modify

    src/app/a11y/LiveRegions.tsx    two persistent live regions
    src/app/a11y/announcer.ts       announce(), coalescing, retrigger
    src/app/a11y/focus.ts           moveFocusTo
    src/app/a11y/keys.ts            shouldBailFromKeyHandling
    src/app/a11y/motion.ts          useMotionPreference + override store
    src/app/a11y/GlossaryTerm.tsx   inline term component
    src/app/a11y/glossary.ts        definitions module + registration
    src/app/App.tsx                 modify: mount LiveRegions beside the dialog host
    test/app/a11y/announcer.test.tsx
    test/app/a11y/focus.test.tsx
    test/app/a11y/keys.test.ts
    test/app/a11y/motion.test.tsx
    test/app/a11y/glossary.test.tsx

### Live regions and announcer

LiveRegions renders two visually hidden divs (standard clip-rect hiding, not display none): polite `role="status" aria-atomic="true"` for game events, assertive `role="alert"` reserved for the finale's critical warnings. Mounted once in App.tsx as a sibling of the dialog host, outside the screen router, never unmounted.

    function announce(text: string, channel: 'polite' | 'assertive'): void

Polite behavior: bursts coalesce within approximately 800 ms (identical strings collapse to one; distinct strings queue and flush in order). Identical strings announced across windows retrigger via a content toggle (clear the region on one frame, set it on the next, or an equivalent mutation) so screen readers re-read. Assertive behavior: write through immediately, no coalescing, no debounce, ever. The module keeps its queue and timer internally; keep the coalescing window a named constant. Document in the module comment that this is the only path to the live regions and that the repaint ticker must never call it. The section-02 relay wires engine milestone and settlement events to this function later; nothing engine-specific lives here.

### Focus manager (src/app/a11y/focus.ts)

    function moveFocusTo(target: HTMLElement): void
      // Resolution: the screen root's heading, else its command input, else
      // the root itself. Applies tabindex="-1" when needed, then
      // focus({ preventScroll: true }).

Called by the router (section-04) on every screen change. Native dialogs handle their own focus trap and restore; this function never touches dialogs.

### Key-handler bail utility (src/app/a11y/keys.ts)

    function shouldBailFromKeyHandling(event: KeyboardEvent): boolean
      // True when the target is editable (input, textarea, select,
      // contentEditable), when ctrl/meta/alt is held, or when isComposing.

This is the shared predicate; the full input precedence stack (dialog, diegetic prompt, type-in, menu shortcuts, globals) is section-04's and composes on top of it. Keep it a pure function of the event so the table test is trivial.

### Motion preference (src/app/a11y/motion.ts)

    type MotionOverride = 'system' | 'reduced' | 'full'
    function useMotionPreference(): boolean   // true means reduce motion
    function getMotionOverride(): MotionOverride
    function setMotionOverride(v: MotionOverride): void

A tiny subscribable store holds the override (persisted to localStorage under one key; corrupt reads fall back to 'system'). The hook composes the store with a live `prefers-reduced-motion` matchMedia listener: override wins unless it is 'system'. Section-06's settings dialog calls setMotionOverride; section-03's type-in, section-05's push-in, and the grid and cabinet sections all consume the hook. Documented contract in the module: consumers sample the preference when starting an animation; a preference change mid-flight never cancels running animations (they complete, and the new preference applies to the next animation). The hook contains no animation references at all, which makes the contract structural.

### Glossary (src/app/a11y/glossary.ts, GlossaryTerm.tsx)

    interface GlossaryEntry { id: string, term: string, definition: string }
    function getGlossaryEntry(id: string): GlossaryEntry
    function registerGlossaryTerms(entries: GlossaryEntry[]): void
      // Dev-mode throw on id collision, mirroring the command-verb registry rule.

Ship the ten initial entries listed in the tests with plain-language definitions written for a smart layperson (one or two sentences each; for example OPEN EXCEPTIONS as the count of reported problems nobody has resolved yet). Missions register their channel and ledger jargon through registerGlossaryTerms at screen registration time.

GlossaryTerm renders the term inline with a subtle dotted underline (style hook only; final styling composes with section-03's theme). Interaction: pointer hover shows the definition, hover out hides it; keyboard focus shows it, blur hides it; tap or click toggles it (tap-friendly per the global rule); Escape closes while open. The element is focusable (a real button styled inline, or a span with role and tabindex; the button is simpler and preferred), carries aria-expanded, and associates the open definition via aria-describedby on a non-interactive text popup. The popup contains plain text only, never interactive content, so no focus trap is needed. Keep the open/close logic in the component; the glossary module stays pure data plus registration.

### App.tsx modification

Mount `<LiveRegions />` in the App shell as a direct sibling of the dialog host provided by section-01, above the screen router output in the tree. Nothing else in App changes.

## Definition of done

- All tests above green under `npm test` (jsdom project beside the untouched engine node project).
- announce, moveFocusTo, shouldBailFromKeyHandling, useMotionPreference, setMotionOverride, GlossaryTerm, getGlossaryEntry, and registerGlossaryTerms exported for sections 02, 03, 04, 05, 06, 07, and 08.
- Live regions verified present and positioned as dialog-host siblings via the App-level test.
- Real screen-reader verification (VoiceOver, NVDA) is explicitly deferred to the split-wide manual smoke checklist (owned by section-10) and the deployment split's pass; this section's bar is jsdom-green plus the ARIA contracts asserted above.

## Dependencies

- section-01-app-scaffold: App shell with dialog host, jsdom Vitest project, Testing Library. Required before starting.
- Blocks section-04 (precedence stack over the bail predicate, moveFocusTo on screen change, glossary terms in terminal text) and section-06 (settings writes the motion override, dialogs render glossary terms).
- section-03 consumes useMotionPreference through its injected reducedMotion option and rewires to the real hook when this section lands; no work required here for that handoff beyond the stable export.

## Implementation notes (as built)

This section refined the stand-ins that sections 03-08 already consumed, so it
modified existing files rather than only adding new ones, keeping every consumer
green. Final suite 471 tests.

- **motion.ts**: `MotionOverride` is `'system' | 'reduced' | 'full'`;
  `useMotionPreference()` is the primary hook and `useReducedMotion` is a kept
  alias (same function). The override persists to localStorage (`wg-motion-override`)
  with a corrupt/missing read falling back to `'system'`; jsdom has no
  localStorage, so the in-memory value is the session source of truth. The
  subscribe path also listens to the live `prefers-reduced-motion` media query.
  Call sites moved from the stand-in `'reduce'` literal to `'reduced'`.
- **keys.ts** holds `shouldBailFromKeyHandling`; `keyHandler.ts` keeps
  `shouldHandleKey` as its inverse and re-exports `KeyLike`.
- **announce.ts** keeps the `onAnnounce` raw-sink API and adds a bounded polite
  coalescer: one ~800ms window dedups identical strings and flushes all distinct
  strings as a single ordered utterance, then clears (finale-safe, no backlog).
  Assertive writes through immediately with a sequence bump (no coalesce). A
  region store feeds `LiveRegions`, which renders `role="status"` (polite) and
  `role="alert"` (assertive) with an inner span keyed on the sequence so an
  identical string re-reads. App.tsx mounts `<LiveRegions />` as a dialog-host
  sibling (replacing the old live-region-slot placeholder).
- **focus.ts** `moveFocusTo` resolves heading -> an opt-in `[data-a11y-focus]`
  input -> the root (tabindex -1 applied when needed, `preventScroll: true`).
  The command-input step is opt-in on purpose: auto-focusing every screen's
  command input would route menu number-shortcuts into the field (where the bail
  predicate suppresses them). The menu keeps root focus; an input-first screen
  marks its input.
- **glossary.ts** ships ten entries with a registry (`getGlossaryEntry`,
  `registerGlossaryTerms`, `allGlossaryEntries`, `hasGlossaryEntry`,
  `__resetGlossary`). **GlossaryTerm.tsx** is an interactive button
  (aria-expanded, aria-describedby tooltip, hover/focus open, click opens,
  blur/leave/Escape close) that takes either an inline `{term, definition}` or a
  registry `{id}`. An unregistered id throws in dev and degrades to the raw id in
  production; registration collisions throw in dev and log-and-skip in prod.