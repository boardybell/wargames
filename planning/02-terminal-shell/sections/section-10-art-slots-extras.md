# Section 10: Art Slots, Tic-Tac-Toe, and the Manual Smoke Checklist

## Scope

This section builds three self-contained pieces of the terminal shell for
SHALL WE PLAY A GAME? (a WarGames-inspired browser game, React 18 + Vite +
TypeScript, static build):

1. The art slot system under `src/app/art/`: a registry mapping every named
   art slot to a current source (graded CSS placeholder renderer now, image
   URL later), reserved layout space, loading priority, preload hooks, and
   accessible-text validation. Final art arrives from a later media split by
   swapping sources in this registry only; no consumer code changes.
2. The tic-tac-toe demonstration under `src/app/games/`: a pure deterministic
   module where two optimal players play from the empty board to a draw, plus
   a view that replays the move list at watchable pace.
3. The manual smoke checklist document that closes this split locally, since
   browser-level verification (real visuals, audio, screen readers, devices)
   is deferred to the deployment split's Playwright and manual pass.

House rules: no em-dashes anywhere in code, comments, strings, or docs. No new
dependencies; the app uses only react, react-dom, pure-rand, and valibot.

## Dependencies

- section-01-app-scaffold (required): provides the `src/app/` tree, the jsdom
  Vitest project covering `test/app/**`, Testing Library dev deps, and the
  `urlFor(path)` helper that prefixes `import.meta.env.BASE_URL`. Every image
  URL in the registry must pass through `urlFor`; raw absolute `/asset` paths
  are forbidden and checked by a scaffold-owned lint/unit rule.
- section-03-crt-theme (required): palette tokens and CRT styling that the
  graded placeholder scenes draw from (navy-black glass near #050A14,
  electric blue glyphs near #6CB6FF, amber and red reserved for cabinet).
- This section blocks section-05-hero-pushin: the hero screen consumes the
  `hero-desktop` and `hero-portrait` slots and the HeroCrop metadata that
  rides with them, so the types and registry entries defined here must land
  first.
- The tic-tac-toe view ultimately renders on the character grid component
  (section-08) and is triggered by LIST GAMES in idle HELP (section-04).
  Neither is a build dependency here: the view accepts its grid renderer and
  motion preference through props so it is implementable and testable in
  isolation.

## Files

Create:

    src/app/art/types.ts            ArtSlotId, ArtSlotEntry, HeroCrop
    src/app/art/registry.ts         slot registry, validation, source swap
    src/app/art/placeholders.tsx    graded CSS placeholder renderers
    src/app/art/ArtSlot.tsx         consumer component with reserved space
    src/app/art/preload.ts          priority-driven preload hooks
    src/app/games/tictactoe.ts      pure optimal-play module
    src/app/games/TicTacToeView.tsx move-list replay view
    docs/manual-smoke-checklist.md  the checklist document
    test/app/art/registry.test.ts
    test/app/art/artslot.test.tsx
    test/app/games/tictactoe.test.ts
    test/app/games/view.test.tsx

## Tests first

Write these before implementation. Stubs say what to assert, not how.

### Art slots (TDD block 11)

- Registry completeness: every member of the `ArtSlotId` union resolves to an
  entry with a placeholder renderer and a declared aspect ratio; rendering
  `<ArtSlot id={...}/>` for each id produces reserved aspect-ratio space in
  the DOM (assert the aspect-ratio or padding reservation is present even
  before any source loads, so layout never shifts).
- Loading priority: the hero slots are marked eager and their load path runs
  at registry init; every other slot is deferred (loader not invoked until
  the slot's first stable view). Mission briefing slots (`briefing-outlook`,
  `briefing-flights`, `briefing-bank`) preload when the preload hook is
  invoked with a mission selection; spy on the loader and assert it fires on
  select and not before.
- Accessible text validation: decorative slots render with empty alt (and no
  stray accessible name); informative slots require a non-empty text
  equivalent; registry validation throws in dev when an informative entry
  lacks its description. Assert every shipped entry passes validation.
- Source swap interface test: swap one slot's source from the placeholder
  renderer to an image URL through the registry's swap function; the same
  consumer component (unchanged) now renders the image with a base-prefixed
  URL instead of the placeholder DOM. This is the contract the media split
  relies on.

### Tic-tac-toe (TDD block 12)

- Two optimal players reach a draw from the empty board; the emitted move
  list is deterministic and exactly reproduced across repeated runs (assert
  deep equality of two independent computations and the terminal state being
  a draw with a full board).
- The module imports nothing from `src/app/state/` or `src/engine/` and
  touches no campaign state (keep it dependency-free by construction; a test
  can assert the module's public surface is pure functions over its own board
  type).
- The view replays moves sequentially at watchable pace (fake timers), is
  skippable (a skip action jumps straight to the final board, which remains
  readable), and renders the final board instantly when the reduced-motion
  preference is true.

## Implementation

### Art slot types (src/app/art/types.ts)

The slot id union is fixed:

    type ArtSlotId = 'hero-desktop' | 'hero-portrait' | 'menu-rack' |
      'bezel-texture' | 'briefing-outlook' | 'briefing-flights' |
      'briefing-bank' | 'failsafe-wall' | 'countdown-insert' |
      'hero-return' | 'ending-recovery' | 'ending-containment' |
      'ending-failure'

HeroCrop metadata is authored per hero asset (placeholder and final alike)
and rides with the hero slot entries; section-05 imports it from here:

    interface HeroCrop {
      srcKey: ArtSlotId            // hero-desktop or hero-portrait
      glass: { x: number, y: number, w: number, h: number }  // fractions of
                                   // natural image size
      greetingAnchor: { x: number, y: number }               // fraction point
    }

An entry shape along these lines (exact field names are the implementer's
call, but every concern below must be represented):

    interface ArtSlotEntry {
      id: ArtSlotId
      source: { kind: 'placeholder', render: PlaceholderRenderer } |
              { kind: 'image', url: string }   // url always via urlFor(path)
      aspectRatio: number                      // reserved layout space
      priority: 'eager' | 'deferred' | 'on-mission-select'
      text: { kind: 'decorative' } |           // renders alt=""
            { kind: 'informative', description: string }
      heroCrop?: HeroCrop                      // hero slots only
    }

### Registry (src/app/art/registry.ts)

A module-level map from id to entry, fully populated at ship with placeholder
sources. Expose: a lookup function, a validation function run at registry
init in dev (throws on an informative entry with a missing or empty
description, or on a missing id), and a swap function that replaces an
entry's source only, leaving everything else intact. The swap function is the
whole interface the later media split uses; HeroCrop for final art arrives
through the same entries.

Initial text grading: the hero slots (`hero-desktop`, `hero-portrait`,
`hero-return`) and `bezel-texture`, `menu-rack`, and `countdown-insert` are
decorative (the hero button's accessible name comes from its visible
ACTIVATE TERMINAL label, so the image stays silent). The briefing slots,
`failsafe-wall`, and the three ending slots are informative and ship with a
one-line plain-language description each.

Priorities: hero slots eager with reserved space; the three `briefing-*`
slots are `on-mission-select`; everything else deferred until its first view
is stable.

### Placeholder renderers (src/app/art/placeholders.tsx)

Graded CSS scenes, one per slot, specific enough to validate layout and mood:
gradients, panel textures, and lamp dots built from the theme tokens
(navy-black fields, electric blue accents, hammered gray-olive panel feel for
rack and cabinet adjacent slots, amber lamp dots where the final art will
show hardware). No images, no canvas, no animation. Each renderer fills its
container; the container owns the aspect-ratio reservation.

### Consumer component (src/app/art/ArtSlot.tsx)

`<ArtSlot id={...}/>` reads the registry, reserves space from the entry's
aspect ratio (CSS aspect-ratio on the wrapper), and renders either the
placeholder renderer or an `img` with the entry's URL and the correct alt
text (empty string for decorative, the description for informative).
Consumers never branch on source kind themselves; that is the point of the
interface test.

### Preload hooks (src/app/art/preload.ts)

A small loader abstraction (so tests can spy on it) plus: an init-time pass
that kicks off eager slots, a deferred trigger for first-stable-view slots,
and `preloadForMission(missionId)` (or an equivalent hook) that the mission
selection flow calls to warm the briefing slots. Image preloading uses the
standard `new Image()` / fetch-ahead pattern behind the loader port; for
placeholder sources preload is a no-op. All failures are silent to gameplay.

### Tic-tac-toe pure module (src/app/games/tictactoe.ts)

Two optimal players (minimax or the known optimal policy table) playing from
the empty board, always ending in a draw, emitting the move list:

    function playOptimalGame(): { moves: Move[], result: 'draw' }

Deterministic by construction: ties in move evaluation break by a fixed rule
(lowest cell index), so the sequence is identical on every run and the test
can assert the exact list. The module exports only pure functions and its own
board types; it has zero imports from engine or app state. This is the
WOPR-learns-futility beat from the film, played straight: the machine plays
itself to a draw.

### Replay view (src/app/games/TicTacToeView.tsx)

Props: the move list (or it calls the pure module itself), a cell-matrix
renderer (the character grid component from section-08 in production, any
matrix-to-DOM stub in tests), a reduced-motion flag, and a skip affordance.
Behavior: reveal moves one at a time on a timer at watchable pace; any skip
action, and reduced motion from the start, jump to the final drawn board,
which stays on screen and readable. Entirely outside campaign state; closing
it leaves nothing behind. Section-04's idle HELP wires LIST GAMES to mount
this view; this section only exports it.

### Manual smoke checklist (docs/manual-smoke-checklist.md)

A documented checklist run locally before this split closes, with results
recorded in the split's notes so the deployment split can re-verify in
Playwright. Contents, as a checklist with space for pass/fail and notes:

- Push-in register and feel at desktop and phone widths (photo glass rect to
  live terminal handoff, greeting stays in register).
- Cinematic glow look compared against planning/reference/crt-reference.jpg.
- Audio audibility and ducking by ear (voice over ambience, micro-fades).
- VoiceOver pass over activation, menu, debrief, and a timer milestone
  announcement.
- Throttled-CPU performance profile of the CRT stack and a finale-scale
  character grid.
- Reduced-motion walk: push-in replaced by crossfade, type-ins instant,
  tic-tac-toe instant, no ambient lamp blinking.

## Done when

All four test files pass under the jsdom project in one `npm test` run
alongside the existing engine tests, every ArtSlotId renders a graded
placeholder with reserved space, the swap test proves the media-split
contract, the tic-tac-toe draw sequence is byte-identical across runs, and
`docs/manual-smoke-checklist.md` exists with the six checks above.

## Implementation notes (as built)

Final suite 496 tests. All three pieces shipped as planned.

- **art/**: `types.ts` holds the canonical 13-id `ArtSlotId`, `ArtSlotEntry`,
  and the registry-level `HeroCrop`. `registry.ts` seeds all 13 entries as
  graded placeholders with reserved aspect ratios; hero slots eager and
  decorative, briefing slots on-mission-select and informative, the rest
  deferred. The hero crops are DERIVED from `hero/heroCrop.ts` `HERO_CROPS` so
  the calibration values have one source of truth. `swapArtSource` replaces only
  the source (validating the result in dev), the media-split contract.
  `placeholders.tsx` renders six graded CSS variants, no images. `ArtSlot.tsx`
  reserves aspect-ratio space and self-triggers `preloadSlot` on first stable
  view for deferred slots. `preload.ts` is a loader port (default `new Image()`,
  retained until settle; no-op for placeholders) with eager/mission/slot
  entry points. The barrel keeps the section-05 hero helpers
  (`artSources`/`artNatural`, typed to the two hero slots) working.
- **games/**: `tictactoe.ts` is a pure, dependency-free minimax (both sides
  optimal to a nine-move draw, lowest-index tie-break, deterministic; a
  source-scan test enforces the zero-import rule). `TicTacToeView.tsx` replays
  on an injected cell renderer (the character grid in production), skippable and
  instant under reduced motion, with a signature-keyed done latch so onDone
  never double-fires.
- **docs/manual-smoke-checklist.md**: the six manual checks that close the split
  locally before the deployment split re-verifies.

### Reconciliation with section 05
Section 05 shipped a two-slot hero stand-in in `art/index.ts`; this section kept
those helpers (now typed to a hero-only slot subset) and added the full
registry. `hero/heroCrop.ts` keeps its own local 2-id ArtSlotId and HeroCrop
(section 05 is committed and working); the registry derives its crop values from
there rather than retrofitting hero to import the registry.