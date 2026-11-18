# Section 08: Cabinet Chrome and Character Grid

Part of split 02-terminal-shell for SHALL WE PLAY A GAME?, a WarGames-inspired
browser game. The shell renders what the headless engine (split 01, under
src/engine/) says and never invents game state. This section builds two
packages: the cabinet chrome under `src/app/cabinet/` (lamp banks, readouts,
countdown display) and the character grid under `src/app/grid/` (the fixed-width
cell renderer used by the flight map, finale displays, and tic-tac-toe, plus
the branch-trace playback). Tests live under `test/app/` mirroring the source
tree, in the jsdom Vitest project, run with `npm test`.

House rules: no em-dashes anywhere in code, comments, or strings. Dependency
footprint stays at react, react-dom, pure-rand, valibot. No UI, animation, or
audio libraries.

## Dependencies

- **section-02-engine-binding** provides the store, `useCampaign()`, the
  emitted-event relay (consumers register once and receive each `EngineEvent`
  exactly once, in order), and the repaint display clock (clamped engine
  `lastNow` plus a `performance.now()` delta on rAF timestamps; `Date.now()`
  is never read for display).
- **section-03-crt-theme** provides palette tokens (glass background near
  #050A14, glyph core electric blue near #6CB6FF, amber and red reserved for
  cabinet use, status colors always paired with text) and the Glass TTY VT220
  font with VT323 fallback.
- **section-04-terminal-framework** provides the shared key-handler utility
  (bails on editable targets, held modifiers, isComposing) and the terminal
  primitives this section's components sit beside.
- The engine (split 01, with its contract amendments) provides the
  `EngineEvent` union (`missionStarted`, `scheduledEventFired`,
  `timerMilestone`, `settlement`, `phaseChanged`, `consequenceApplied`,
  `sourceCheckResolved`, `debriefAcknowledged`, `finaleFinalPhase`,
  `branchRunCompleted`, `campaignReset`), the `BranchStep` type with
  `{ step, label, detail }` entries, the pure selectors
  `selectOpenExceptions` and `selectServiceOutcomes`, and the test-double
  mission via the `@engine/testing` export.
- `useMotionPreference` from section-09-a11y-glossary composes
  prefers-reduced-motion with the in-app motion setting; consume it anywhere a
  motion decision happens here. If section 09 has not landed when this section
  starts, stub the hook behind the same signature and swap in the real one.

Reference these sections for their contracts; do not reimplement anything they
own. In particular: this section never calls dispatch, never reads
`Date.now()`, and never derives timing thresholds from wall clock. Lamp
transitions and warnings come from emitted events only.

## Tests first

Write these before implementation. Stubs describe what to assert, not how.
Fixtures come from the real engine with the `@engine/testing` test-double
mission wherever campaign state is needed; pure components get literal props.

### test/app/grid/characterGrid.test.tsx (TDD block 7)

- Pure render: given a cell matrix prop, the DOM output is a deterministic
  function of props; re-render with identical props produces identical markup;
  nothing scrolls or animates in the base state.
- Selection: arrow keys move the selection across cells; tapping (pointer
  event) a cell selects it; selection changes fire the provided callback with
  the cell coordinate.
- Tap targets: on narrow screens, cells reach a 44 px effective target via
  padding (assert the padding hook or computed class applies under the narrow
  condition).
- Compact mode: under the width breakpoint the compact class applies and cell
  pitch tightens (assert the mode flag and class, not pixel measurements jsdom
  cannot do).
- Per-cell class hooks: a cell carrying a class hook in the matrix renders
  that class on its element.
- Glow discipline: the glow class applies at the container level; no cell
  element carries more than one shadow layer (inspect the class contract,
  documented as a single-layer token from the theme).
- Legend slot renders when provided.
- Selection highlight respects reduced motion (no transition class when
  `useMotionPreference` reports reduced).

### test/app/grid/playBranchTrace.test.tsx (TDD block 7, review integration 3)

- Given a `BranchStep[]` array, entries render sequentially at a watchable
  pace (fake timers advance the playback).
- Skip control jumps to the final state immediately; every step's results
  remain readable in the DOM after skip (nothing is lost by skipping).
- Under reduced motion, playback is instant: all steps present at once.
- An empty steps array renders a stable terminal state without throwing.

### test/app/cabinet/lampController.test.ts (TDD block 8)

- Mapping: feeding the controller a `phaseChanged` event, a `settlement`
  event, a `branchRunCompleted` event, and a `finaleFinalPhase` event each
  produces the documented bank-state change for that event kind.
- No transitions without events: advancing fake timers, re-rendering, and
  calling wake-equivalent store updates that emit no events leaves bank state
  untouched.
- Exactly-once by construction: the controller consumes the emitted relay
  from section 02; feeding the same event object twice through the relay
  harness is not possible in production wiring, but the controller itself is
  idempotent-free by design, so the test asserts one state change per relayed
  event in an ordered multi-event batch (settlement plus consequenceApplied
  relays in order).
- Red alarm: the alarm indicator state activates only on `finaleFinalPhase`;
  every other event kind, including settlement of a failed mission, leaves
  the alarm off.
- Idle behavior: with reduced motion, idle banks carry no ambient animation
  class; otherwise the subtle breathing class applies. Transition classes
  animate opacity only (assert the class contract).

### test/app/cabinet/readouts.test.tsx (TDD block 8)

- OPEN EXCEPTIONS renders from `selectOpenExceptions`; service outcomes
  render from `selectServiceOutcomes`; both labeled so the divergence reads.
- Forced-inactivity fixture: build a campaign state (real engine, test-double
  mission, advanced past a deadline without player action) where the two
  selectors visibly diverge, and assert both readouts show their distinct
  values side by side.

### test/app/cabinet/countdown.test.tsx (TDD block 8)

- The visible countdown carries `role="timer"`.
- Above the width breakpoint, dot-matrix numerals render (styled spans, same
  Glass TTY font); below it, the in-terminal countdown line renders instead;
  exactly one of the two is in the DOM at a time.
- Remaining time derives from `endsAt` minus the repaint clock from section
  02, clamped at zero: a fixture past its deadline displays zero, never a
  negative.
- Backward wall-clock jump: simulate a backward `Date.now()` between wakes
  (mock the clock inputs the section-02 display clock exposes); displayed
  remaining time never increases. This is a display-layer assertion; the
  engine's lastNow clamp is section 02's test.
- Countdown ticks produce no announcements (no announcer calls from the
  ticker path; spy on the announcer).

## Implementation

### Character grid: src/app/grid/

A fixed-width cell grid rendered as DOM text rows, not canvas. One component
plus one playback helper.

    interface GridCell {
      char: string
      classHook?: string      // per-cell class, at most one shadow layer
    }

    interface CharacterGridProps {
      cells: GridCell[][]
      legend?: ReactNode
      selection?: { row: number, col: number } | null
      onSelect?: (row: number, col: number) => void
      compact?: boolean        // reduced cell pitch under the breakpoint
    }

    function CharacterGrid(props: CharacterGridProps): JSX.Element
      // Pure function of props. Rows are text lines in the terminal font.
      // Arrow-key navigation through the shared key-handler utility;
      // tappable cells with 44 px effective targets via padding on narrow
      // screens. Glow applies as a single container-level class; per-cell
      // shadows capped to one layer (theme token). Selection highlight is
      // the only thing that may transition, and only when motion is allowed.

Compact mode reduces cell pitch and pairs with a mission-provided list view;
list parity is the mission split's obligation, this grid only exposes the
hooks (classHook, selection callback, compact flag). Keep the breakpoint value
in one exported constant shared with the countdown chrome.

    function playBranchTrace(steps: BranchStep[]): /* component or hook */
      // Renders { step, label, detail } entries sequentially at watchable
      // pace (a few hundred ms per step via one timer, no animation lib),
      // instant under reduced motion, skippable (a SKIP control jumps to
      // the final state), with all results readable after skip. BranchStep
      // is defined by split 01; split 06 authors the content. Exported from
      // the grid package.

Whether playBranchTrace is a component taking steps as props or a hook
returning render state is the implementer's call; the exported surface and
the four behaviors (sequential, instant-under-reduced-motion, skippable,
readable-after-skip) are the contract.

Performance note carried from review integration 11: glow at container level,
per-cell shadows capped to one layer, and the manual perf smoke (owned by
section 10's checklist document) includes a finale-scale grid. Nothing in
this component should make that smoke fail: no per-cell animations, no
filters.

### Cabinet chrome: src/app/cabinet/

Three pieces: lamp banks behind a LampController, the exceptions and outcomes
readouts, and the countdown chrome.

**Lamp banks.** CSS lamp matrices: amber dots in recessed rows over hammered
gray-olive panel styling, or the `menu-rack` art slot when section 10's
registry provides a source. A small LampController maps engine events to bank
states:

    type LampBankState = /* per-bank enum the implementer defines */

    class LampController {
      // Registers as a consumer on the section-02 emitted relay.
      // phaseChanged, settlement, branchRunCompleted, finaleFinalPhase
      // each map to a documented bank-state change. All other event kinds
      // are ignored. Pure mapping, no timers, no wall clock.
    }

Transitions animate opacity only. Idle banks are static under reduced motion
(no ambient blinking); otherwise a subtle breathing class applies, one opacity
tween, consistent with the CRT stack's no-animated-filters rule. The red
alarm indicator is restrained (a single lamp or small cluster, red paired
with a text label per the status-color rule) and keys exclusively to the
`finaleFinalPhase` event. The controller consumes emitted events only; it
never infers state changes from re-renders or the clock, which is what makes
exactly-once structural (section 02 guarantees each emitted event relays
once).

**Readouts.** OPEN EXCEPTIONS from `selectOpenExceptions` beside service
outcomes from `selectServiceOutcomes`, each with its own label so a player
can see the two diverge (open exceptions climbing while service outcomes hold,
or the reverse). These are plain selector-driven renders off `useCampaign()`;
no local state. OPEN EXCEPTIONS is a registered glossary term (section 09
owns the glossary module and primitive; wrap the label with the glossary term
component once it exists).

**Countdown chrome.** The deadline renders as dot-matrix numerals (styled
spans in the same Glass TTY font, no images) on wide layouts, swapped for an
in-terminal countdown line under the width breakpoint (share the breakpoint
constant with the grid's compact mode if the design uses the same threshold,
otherwise export it from cabinet). The visible countdown carries
`role="timer"`. Remaining time is `endsAt` minus the section-02 repaint clock,
clamped at zero. Never read `Date.now()` here; the display clock's
monotonic-delta construction is the whole defense against backward wall-clock
jumps, and this component must not route around it. The countdown never feeds
the announcer; milestone announcements come from engine `timerMilestone`
events through section 02's relay and section 09's announcer, not from this
display.

## Files

Create:

- `/Users/darkpool/wargames/src/app/grid/CharacterGrid.tsx`
- `/Users/darkpool/wargames/src/app/grid/playBranchTrace.tsx` (or .ts if hook-shaped)
- `/Users/darkpool/wargames/src/app/grid/index.ts` (package exports: CharacterGrid, playBranchTrace, breakpoint constant)
- `/Users/darkpool/wargames/src/app/cabinet/LampController.ts`
- `/Users/darkpool/wargames/src/app/cabinet/LampBanks.tsx`
- `/Users/darkpool/wargames/src/app/cabinet/Readouts.tsx`
- `/Users/darkpool/wargames/src/app/cabinet/Countdown.tsx`
- `/Users/darkpool/wargames/src/app/cabinet/index.ts`
- `/Users/darkpool/wargames/test/app/grid/characterGrid.test.tsx`
- `/Users/darkpool/wargames/test/app/grid/playBranchTrace.test.tsx`
- `/Users/darkpool/wargames/test/app/cabinet/lampController.test.ts`
- `/Users/darkpool/wargames/test/app/cabinet/readouts.test.tsx`
- `/Users/darkpool/wargames/test/app/cabinet/countdown.test.tsx`

File names within the two packages may vary with the implementer's judgment;
the package boundaries (grid/ and cabinet/), the exported surfaces, and the
test coverage above do not.

## Definition of done

All tests in TDD blocks 7 and 8 green under `npm test` in the jsdom project.
No dispatch calls, no Date.now() reads, no wall-clock-derived thresholds
anywhere in these two packages. Red alarm reachable only through
finaleFinalPhase. Grid render provably pure (identical props, identical
markup). playBranchTrace exported and exercised against BranchStep arrays
from the real engine types.

## Implementation notes (as built)

Final suite 433 tests green; both packages shipped as planned.

Files as built match the Files list, plus `src/app/grid/constants.ts`
(COMPACT_BREAKPOINT_PX = 640), `src/app/grid/useNarrow.ts` (useNarrowViewport),
`src/app/grid/grid.css`, `src/app/cabinet/cabinet.css`, and the review-added
test `test/app/cabinet/lampBanks.test.tsx`.

Decisions and shapes:

- The grid reuses `useReducedMotion` (a11y/motion) and `shouldHandleKey`
  (a11y/keyHandler). `PlayBranchTrace` is a component taking `steps` as props
  with a SKIP control; reveal is one `setTimeout` chain, keyed by a content
  signature so an inline-array prop does not rewind an in-flight trace.
- `useNarrowViewport` drives both the compact pitch and the 44px tap padding
  via `matchMedia`; the `compact` prop forces pitch only (tap padding tracks a
  physically narrow viewport).
- Glow is one container-level class (`char-grid-glow`); cells carry no shadow.
  Selection transitions via `char-cell-anim` only when motion is allowed. Each
  cell has a deterministic id (base from an optional `id` prop, default
  `wg-grid`, not `useId`, to keep the render pure) and the grid sets
  `aria-activedescendant` to the selected cell.
- `LampController` is a class consuming `onEngineEvent`; `register()` disposes
  any prior subscription first. `useLampController()` is the stable-instance
  hook callers use (one instance, registered in an effect with cleanup). The
  alarm lamp lights only on `finaleFinalPhase` and is paired with a DEFCON 1
  text label.
- `Readouts` is pure presentation (numeric props); `ReadoutsPanel` wires
  `useCampaign` + `selectOpenExceptions`/`selectServiceOutcomes`. OPEN
  EXCEPTIONS is wrapped in the section-06 `GlossaryTerm` stand-in.
- `Countdown` reads `remainingFor(endsAt)` and repaints on `subscribeTick`
  (a `useReducer` force-update, not a `useSyncExternalStore` snapshot, since
  remaining changes every call). It never reads Date.now; the backward-wall-
  clock defense is the display clock's monotonic performance delta over the
  engine's clamped lastNow. Dot-matrix numerals wide, in-terminal line narrow,
  exactly one in the DOM, `role="timer"`.