# section-05-hero-pushin

The hero scene and FLIP push-in for SHALL WE PLAY A GAME?, a WarGames-inspired
browser terminal game (React 18+, Vite, TypeScript, static build). This section
builds `src/app/hero/`: the full-viewport activation scene showing a photo (or
graded placeholder) of a CRT terminal, the live greeting text positioned over
the photo's glass, and the cinematic camera-dolly push-in that hands off to the
real terminal. It also owns load routing (whether the hero appears at all) and
the diegetic ENABLE SOUND? Y/N prompt.

House rules: no em-dashes anywhere in code, comments, or strings. Visual anchor
is `planning/reference/crt-reference.jpg` (electric blue dot-matrix terminal on
navy-black). Final art arrives from a later media split through the art slot
registry; everything here renders against graded CSS placeholders now and must
not change when real images swap in.

## Dependencies (must exist before starting)

- **section-01-app-scaffold**: `src/app/` tree, App shell with screen router
  skeleton, jsdom Vitest project at `test/app/**`, `urlFor(path)` base helper.
- **section-02-engine-binding** (`src/app/state/`): `useCampaign()`, `send()`,
  `wake()`, save binding, recovery flag. Load routing here calls `wake()` and
  reads engine state; it never computes game state itself.
- **section-03-crt-theme** (`src/app/theme/`, `src/app/crt/`): palette tokens,
  Glass TTY font, CRT layer stack, the type-in hook (used for the greeting and
  the post-activation SHALL WE PLAY A GAME? line), `useMotionPreference`.
- **section-04-terminal-framework** (`src/app/terminal/`, `src/app/screens/`):
  the menu screen the push-in lands on, MenuRows, the shared key-handler
  utility with the input precedence stack (open dialog > active diegetic
  prompt > running type-in > menu shortcuts > global shortcuts).
- **section-07-audio-engine** (`src/app/audio/`): the single AudioContext
  (created suspended at boot), `resume()` exposure, audio preference store
  with one persisted master value, activation cue, key-tick cues.
- **section-10-art-slots-extras** (`src/app/art/`): the slot registry entries
  `hero-desktop` and `hero-portrait` with placeholder renderers; HeroCrop
  metadata rides with hero slot entries.

Engine contract (from split 01, already amended): `dispatch` and
`advanceToNow` return `{ state, emitted: EngineEvent[] }`; the engine load
result tells the shell whether a mission is active, the campaign is fresh, or
menu state exists.

## Files

Create:

    src/app/hero/HeroScene.tsx        full-viewport button, photo layer,
                                      greeting, sound control
    src/app/hero/glassRect.ts         pure object-fit cover geometry
    src/app/hero/heroCrop.ts          HeroCrop type + per-asset metadata
    src/app/hero/pushIn.ts            WAAPI push-in sequence + reduced-motion
                                      crossfade + single-use guard
    src/app/hero/soundPrompt.tsx      diegetic ENABLE SOUND? Y/N line
    src/app/hero/loadRouting.ts       initial-screen decision from engine load
    test/app/hero/glassRect.test.ts
    test/app/hero/heroScene.test.tsx
    test/app/hero/pushIn.test.tsx
    test/app/hero/loadRouting.test.tsx
    test/app/hero/soundPrompt.test.tsx

Modify: `src/app/App.tsx` (router gains the hero screen and consumes the load
routing decision).

Exact filenames may shift to local convention; the module boundaries should
not.

## Tests first (TDD block 5)

Write these in `test/app/hero/` before implementation. Stack: Vitest jsdom
project, Testing Library for components, WAAPI (`element.animate`) mocked,
`AudioContext.resume` spied through the audio module's port, geometry via
mocked `getBoundingClientRect` and natural-size properties. The engine is real
(pure TS) using the test-double mission from `@engine/testing`. Stubs say what
to test, not how.

**glassRect.test.ts** (pure, exhaustive):

- Object-fit cover mapping for: landscape image in a wider box, landscape
  image in a taller box, portrait image in both box shapes, square cases.
- `object-position` variants (center default, top, custom percentages) shift
  the computed offsets correctly.
- Fraction rects: a glass rect authored as fractions of natural image size
  maps to the correct on-screen pixel rect under each cover case above.
- Greeting anchor fraction point maps consistently with the rect math.
- Pure and frozen-input safe: calling with `Object.freeze`d inputs neither
  throws nor mutates; same inputs always give same outputs.

**heroScene.test.tsx**:

- Activation is single-use across click, pointer tap, Enter, and Space; a
  second activation attempt by any of the four routes is inert (push-in
  sequence invoked exactly once).
- `AudioContext.resume` is called synchronously inside each of the four
  activation handlers: the spy must record the call before the handler
  returns (assert call order against a marker set at handler exit, not just
  that resume was called).
- The button's accessible name comes from the visible ACTIVATE TERMINAL
  label; the hero image is decorative (empty alt or aria-hidden).
- Greeting stays in register: with mocked rects, the greeting's computed
  position matches the crop's greetingAnchor mapping (geometry assertion).
- The small sound control renders outside the activation button (clicking it
  does not trigger activation).

**pushIn.test.tsx**:

- Default path calls `element.animate` on the photo layer with a transform
  keyframe (scale plus translate), ~700 ms; terminal mounts beneath at
  opacity 0; crossfade begins at the 450 ms mark; on finish, `will-change` is
  removed, the photo layer unmounts, focus moves to the terminal, the
  activation cue plays, and the SHALL WE PLAY A GAME? type-in starts before
  the three menu rows reveal.
- Reduced motion (media query or in-app motion override): the push is
  replaced by a 250 ms crossfade; assert the chosen path, not pixel output.
- Orientation and resize events dispatched during the push-in window are
  ignored (no geometry recompute mid-animation); geometry reconciles after
  the terminal owns the viewport.
- Re-entry guard: a second invocation while or after running is a no-op.

**loadRouting.test.tsx**:

- Active-mission save: hero never mounts; mission screen mounts; `wake()` is
  called exactly once on arrival.
- Expired active session: arrival wake settles it through the engine (assert
  the post-wake engine phase drives the rendered screen, e.g. debrief).
- Menu-state save: hero shows; activation lands on the menu with campaign
  state intact (fourth-row unlock state and settled records preserved).
- Fresh campaign: hero shows; activation lands on the menu.

**soundPrompt.test.tsx**:

- Renders once after activation when the campaign is fresh and sound has
  never been configured; does not render when a sound preference already
  exists.
- Y enables sound (the persisted master preference flips), N declines; click
  and tap answer equivalently; both answers persist with audio prefs.
- The prompt never reappears after either answer, including across a
  simulated reload (re-mount against the persisted prefs).
- The settings sound switch and the prompt read the same single backing
  value (flip one, the other reflects it).
- Precedence collision: while the prompt is active it consumes only its
  answer keys; Y answers the prompt and does not complete a running type-in
  or select a menu row (the Y-during-prompt race from the shared key-handler
  stack; the stack itself is section-04's, this test covers the hero-side
  registration).

## Implementation

### HeroCrop metadata (`heroCrop.ts`)

Authored per art asset, placeholder and final alike; final art later ships
its own calibrated metadata through the same interface, so nothing here is
throwaway.

    interface HeroCrop {
      srcKey: ArtSlotId            // 'hero-desktop' or 'hero-portrait'
      glass: { x: number, y: number, w: number, h: number }  // fractions of
                                   // natural image size
      greetingAnchor: { x: number, y: number }               // fraction point
    }

Author one HeroCrop for each placeholder now (values eyeballed against the
placeholder scene; precision matters for the math tests, not the art).

### Glass-rect math (`glassRect.ts`)

A pure function. Given the rendered img box (width, height), the image's
natural size, and the object-position, compute where the image actually
paints under `object-fit: cover`: scale = max of the two box/natural ratios,
offsets centered (or shifted by object-position), then map the fraction-space
glass rect and greeting anchor into on-screen pixels. Signature along the
lines of:

    function computeGlassRect(
      box: Size, natural: Size, position: ObjectPosition, crop: HeroCrop
    ): { glass: Rect, greeting: Point }

No DOM reads inside; callers feed it measurements. Recompute on resize,
orientationchange, and `img.currentSrc` change (a `<picture>` element selects
the portrait companion on phones, which swaps the active HeroCrop via
srcKey). Exception: during the push-in window these triggers are ignored
(review integration 13); after the terminal owns the viewport, geometry
reconciles normally.

### Hero composition (`HeroScene.tsx`)

- One full-viewport `<button>`: accessible name from the visible ACTIVATE
  TERMINAL label; the photo is decorative.
- The photo layer: image from the `hero-desktop` / `hero-portrait` art slots
  (currently the graded CSS placeholder renderer from section-10), rendered
  with object-fit cover inside a `<picture>` for the portrait swap.
- The live greeting text and idle cursor (CRT cursor from section-03)
  absolutely positioned at the computed greeting point, sized to stay
  readable at phone widths.
- The small sound control sits outside the button in the DOM and visually in
  a corner, so toggling sound never activates.

### Push-in sequence (`pushIn.ts`)

Hand-rolled FLIP with WAAPI, single-use (a guard flag prevents re-entry).
Locked decision: no View Transitions API.

1. Resume the AudioContext synchronously in the activation handler, before
   any await or animation call. This holds for all four handlers (click,
   pointer, Enter keydown, Space keydown); the tests assert synchronicity in
   each.
2. Measure the glass rect; set `will-change: transform` on the photo layer.
3. `element.animate` the photo: scale k = max(vw/rectW, vh/rectH) times a
   small overshoot, translate glass center to viewport center, 700 ms,
   camera-dolly easing. The terminal is mounted beneath at opacity 0 with its
   greeting positioned in register with the photo's greeting.
4. At 450 ms, crossfade: terminal opacity to 1 with a settle from scale 1.02
   to 1; photo opacity to 0; a one-frame bloom flash overlay covers sub-pixel
   register residue at the handoff.
5. On finish: remove `will-change`, unmount the photo layer, move focus to
   the terminal (via the a11y focus manager), play the activation cue, start
   the SHALL WE PLAY A GAME? type-in (section-03 hook), then reveal the three
   menu rows (driven by the engine menu selector, section-04 MenuRows).

Reduced motion (from `useMotionPreference`, which composes the media query
with the in-app override): steps 2 to 4 collapse to a 250 ms crossfade. If
the preference changes mid-animation, the in-flight WAAPI animation completes
rather than aborting (review integration 13). No filters or shadows are ever
animated; `will-change` is scoped strictly to the 700 ms window.

### Load routing (`loadRouting.ts`)

The engine load result decides the initial screen; the shell never guesses.

- Active mission in the save: skip the hero entirely, mount the mission
  screen, call `wake()` immediately so expired sessions settle on arrival
  (the engine returns the settled state and emitted events; the resulting
  phase drives what renders).
- Otherwise (fresh campaign or menu-phase save): show the hero; activation
  lands on the menu with campaign state intact. A return visit never shows an
  empty state over an existing campaign (global web-output-cache rule mapped
  to save-resume).

### Diegetic sound prompt (`soundPrompt.tsx`)

Renders as a terminal line after activation, only when the campaign is fresh
and sound has never been configured. Y, N, click, or tap answers it; the
answer persists with the audio preferences (section-07's single persisted
master value backs both this prompt and the settings switch; this component
must read and write that value, never a shadow copy). Register the prompt
with the shared key-handler precedence stack at the active-diegetic-prompt
layer: it consumes only its answer keys, so Y answers the prompt without
completing a type-in or triggering anything else, and unrelated keys fall
through to the type-in layer. Audio stays muted by default; declining leaves
master at 0.

## Definition of done

All five test files green under `npm test` (jsdom project), with the real
engine and test-double mission exercised through load routing. Real push-in
visuals, audio audibility, VoiceOver, and device widths are explicitly out of
scope here: they belong to the deployment split's Playwright and manual pass.
Locally, the push-in register and feel at desktop and phone widths joins the
manual smoke checklist owned by section-10.
## As Built (section-05 implementation)

Built and committed. 341 tests green; tsc, eslint, and build clean.

- src/app/hero/: glassRect (pure cover geometry), heroCrop (HeroCrop metadata), pushIn (WAAPI 700ms dolly + 450ms crossfade + reduced-motion 250ms + single-use guard + onFinish safety net), HeroScene (four activation routes, synchronous audio resume, decorative photo, greeting positioned via computeGlassRect with resize recompute), soundPrompt (diegetic ENABLE SOUND? Y/N at the precedence prompt layer, single answer + latch), loadRouting (hero vs engine by phase), HeroStage (the integration: routing -> hero -> push-in -> terminal + sound prompt).
- Stand-ins (sections 07/10 refine): src/app/audio (resume port, single in-memory+localStorage sound preference) and src/app/art (hero slot sources via urlFor).
- Real WOPR hero art generated through the rung-1 codex lane and shipped: public/art/hero-desktop.{avif,jpg} and hero-portrait.{avif,jpg} (AVIF ~32-36KB, same scene, a true portrait reframe). media/src is gitignored; the export tool is media/tools/export-art.mjs (sharp).
- Deferred: the live App/main boot (init with a real EngineContext) is gated on the mission modules from splits 03-06; HeroStage is the built, tested integration ready for it.
