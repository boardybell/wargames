# TDD Plan: 02-terminal-shell

Companion to claude-plan.md (revision 2); same section headings. Stack: Vitest 4
jsdom project (test/app/** beside the engine's node project), Testing Library
for components, fake timers where noted, Web Audio behind a mocked port. The
engine is real in these tests (node-compatible pure TS) with the test-double
mission from @engine/testing. Browser-level verification (real push-in visuals,
audio output, screen readers, devices) is deferred to split 08's Playwright and
manual pass; a documented manual smoke checklist closes this split locally.
Stubs below say what to test, not how.

## 3. Engine binding (state/)

- send() wraps dispatch with a now sample, updates the store, and surfaces
  rejection results without state change.
- emitted relay: a dispatch producing settlement plus consequenceApplied
  relays both events, in order, exactly once each, to registered consumers.
- A catch-up wake crossing three milestones relays three ordered
  timerMilestone events once; a second wake with the same now relays none.
- Immediate-flush set: settlement, START_MISSION, FORFEIT_MISSION,
  ACKNOWLEDGE_DEBRIEF, NEW_CAMPAIGN write through instantly; other actions
  debounce 500 to 800 ms (fake timers); hidden visibilitychange and pagehide
  flush pending writes.
- Display clock: remaining time derives from clamped lastNow plus a
  performance.now() delta; a backward Date.now() jump between wakes never
  increases displayed remaining.
- Self-wake guard keys per endsAt instance: after a mission deadline trips the
  guard, a later finale deadline still self-wakes.
- Multi-tab: a storage event for the save keys from another tab raises the
  GAME OPEN IN ANOTHER TAB notice and pauses local writes.
- Recovery flag propagates: recovered-backup and reset render the notice path.

## 4. Theme and CRT (theme/, crt/)

- Type-in reveals text progressively, emits tick cues, completes instantly on
  any non-consumed key, click, or tap; full text present in the DOM for AT
  from the start; instant under reduced motion and under the in-app motion
  override.
- Reduce-glow class drops outer shadow layers and the breathing layer.
- Palette tokens: automated contrast assertions for glyph core, dim text, and
  focus ring against the background INCLUDING the vignette's darkest overlap
  (computed composite), all clearing AA thresholds.
- Cursor and scanline overlays carry pointer-events none and aria-hidden.

## 5. Hero and push-in (hero/)

- Glass-rect math: exhaustive unit cases for object-fit cover mapping
  (landscape and portrait images, boxes wider and taller than the image,
  object-position variants, fraction rects); pure and frozen-input safe.
- Activation single-use across click, tap (pointer), Enter, and Space; second
  activation attempt is inert.
- AudioContext.resume called synchronously inside each of the four activation
  handlers (spy asserts call before handler returns).
- Reduced motion replaces the push with a crossfade (WAAPI mocked; assert the
  chosen path).
- Focus moves to the terminal on finish; greeting remains in register
  (geometry assertion on computed positions with mocked rects).
- Routing on load: active-mission save skips the hero and wakes once;
  menu-state save shows the hero and activation lands on the menu with state
  intact; expired session settles on arrival.
- Diegetic sound prompt: renders once per fresh campaign when sound never
  configured; Y enables (master pref flips), N declines; both persist; the
  prompt never reappears after either answer; settings switch and prompt read
  the same backing value.
- Orientation/resize events during the push-in window are ignored; geometry
  reconciles after completion.

## 6. Terminal framework and screens (terminal/, screens/)

- Menu: exact opening text and spacing snapshot; selection by numeric key,
  arrows plus Enter, and tap dispatch identical actions; fourth row absent
  from the DOM until the engine selector unlocks it, then selectable.
- Input precedence stack: dialog consumes keys over everything; Y during the
  sound prompt answers the prompt and does not skip type-in; 1 during type-in
  completes the type-in and is swallowed (no row selection); menu shortcuts
  ignored while the command input has focus.
- Command grammar: case-folding, whitespace collapse, verb-first parse; mission
  verb shadows shell verb on the active screen; registration collision throws
  in dev; UNRECOGNIZED COMMAND and INVALID formats; parsed action value
  strict-equals the button-dispatched action for every shared verb.
- HELP is context-sensitive (lists active screen verbs); LIST GAMES appears
  only in idle HELP.
- Debrief frame: ACKNOWLEDGE control dispatches ACKNOWLEDGE_DEBRIEF; after the
  third acknowledgment the menu shows row four.
- Dialogs: pause opens on Escape and MENU, Resume returns focus, End Mission
  requires confirmation then dispatches forfeit; settings persist toggles;
  extended-time control disables once startedMissionIds is nonempty and
  explains why; New Campaign lists exactly three named seeds, confirmation
  required; corrupt-save notice renders on recovery flags.
- Glossary primitive: terms open definitions on hover, focus, and tap; Escape
  closes; definitions exist for every registered term; focusable and labeled.

## 7. Character grid (grid/)

- Pure render from a cell matrix; selection moves with arrows and taps; compact
  mode under the width breakpoint; per-cell class hooks apply; glow class
  applies at container level with at most one shadow layer per cell.
- playBranchTrace renders BranchStep entries sequentially, skips to final
  state on demand, instant under reduced motion, results readable after skip.

## 8. Cabinet chrome (cabinet/)

- LampController maps emitted events to bank states (phaseChanged, settlement,
  branchRunCompleted, finaleFinalPhase); no transitions without events; red
  alarm only on finaleFinalPhase.
- OPEN EXCEPTIONS and service outcomes render from the two selectors and
  visibly diverge on a forced-inactivity fixture.
- Countdown: role timer; dot-matrix numerals above the breakpoint, in-terminal
  line below; value clamps at zero; display never regresses on backward wall
  clock.

## 9. Audio engine (audio/)

- Context created suspended; resume on activation; statechange re-resume hook
  registered (mocked context).
- Manifest validation rejects cues missing transcript (except whitelisted
  sub-100ms ticks) or preload field; eager cues decode at load, lazy cues
  decode on first play and stay decoded (spy counts decode calls).
- Bus routing per cue; master 0 until enabled; toggles persist and corrupt
  pref reads fall to muted defaults.
- Ducking: voice start ramps ambience down with the fast constant, voice end
  restores with the slow constant, cancelScheduledValues precedes re-ramps
  (mock AudioParam records the call sequence); micro-fade precedes every stop.
- Exclusive voice kills the prior line; generation token increments on screen
  change and catch-up; stale queued cues drop silently.
- Timer warning cues fire once per timerMilestone event, never twice for one
  milestone, never from wall clock.
- Captions render the transcript for every voice and warning cue regardless of
  audio state; every audio entry point is fallible without throwing into
  gameplay.

## 10. Accessibility spine (a11y/)

- Live regions exist from boot as siblings of the dialog host; polite region
  coalesces identical strings, queues distinct ones in order; assertive never
  coalesces; countdown ticks never announced (no announcements from ticker).
- moveFocusTo focuses the new screen root with tabindex -1 and preventScroll
  on every screen change.
- Key handler bails on inputs, textareas, selects, contentEditable, held
  modifiers, and isComposing.
- useMotionPreference composes the media query with the in-app override;
  change mid-animation does not abort in-flight animations.

## 11. Art slots (art/)

- Registry resolves every ArtSlotId to a placeholder renderer with reserved
  aspect-ratio space; hero slot eager, others deferred; mission briefing slot
  preloads on mission select (spy on loader); decorative slots render empty
  alt; informative slots require text equivalents (registry validation).
- Swapping a slot source from placeholder to image URL changes rendering
  without touching consumers (interface test).

## 12. Tic-tac-toe (games/)

- Two optimal players reach a draw from the empty board; the move sequence is
  deterministic and exactly reproduced across runs; zero interaction with
  campaign state; skippable; instant under reduced motion.

## 13. Build and config

- urlFor(path) prefixes BASE_URL for every asset reference; a lint or unit
  check asserts no raw absolute /asset paths in src/app; vite build with a
  subpath base produces an index that references only base-prefixed URLs
  (smoke-tested by parsing the built HTML in a node test).
- Vitest projects: app tests run under jsdom, engine tests stay node; both
  green in one npm test run.

## 14. Manual smoke checklist (documented, run locally before split close)

Push-in register and feel at desktop and phone widths; cinematic glow look
against crt-reference.jpg; audio audibility and ducking by ear; VoiceOver
pass over activation, menu, debrief, and a timer milestone; throttled-CPU
perf profile of the CRT stack and a finale-scale grid; reduced-motion walk.
Results recorded in the split's notes for the 08 review to re-verify in
Playwright.
