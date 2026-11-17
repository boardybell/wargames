# Implementation Plan: 02-terminal-shell

The player-facing frame of SHALL WE PLAY A GAME?, a WarGames-inspired browser
game. This plan is self-contained prose for an implementer with no prior
context; code appears only as types, signatures, and trees. The headless engine
already exists as a planned split (01-simulation-core): pure TypeScript under
src/engine/ exposing createCampaign, dispatch(state, action, now), advanceToNow,
snapshot/runBranch, pure selectors, a save codec with a storage port, and seed
catalog metadata. The shell renders what the engine says, captures input as
typed engine actions, delivers wake signals and wall-clock samples, and binds
persistence. It never invents game state.

## 1. Overview and constraints

React 18+, Vite, TypeScript, static build, GitHub Pages project site: every
asset URL derives from Vite's base so the app works at /wargames/ and at /.
Dependency footprint stays minimal: react, react-dom, and the two engine
runtime deps already present (pure-rand, valibot); no UI, animation, or audio
libraries. The shell lives in src/app/ (the engine owns src/engine/); Vitest
gains a jsdom project for shell units beside the engine's node project.

Visual anchor: planning/reference/crt-reference.jpg. Electric blue dot-matrix
terminal on navy-black with a thin luminous border and left-aligned column.
Locked decisions: Glass TTY VT220 glyphs (public domain, VT323 fallback),
cinematic effect intensity by default with a reduce-glow toggle, diegetic
ENABLE SOUND? Y/N prompt, hand-rolled FLIP push-in (no View Transitions API),
one AudioContext resumed synchronously on activation, muted by default. House
rules: no em-dashes anywhere; final art and voice arrive from a later split
through named slots and a cue manifest, so everything renders with graded
placeholders and synthesized audio until then.

## 2. Directory layout

    src/app/
      main.tsx, App.tsx          boot, screen router, providers
      theme/                     palette tokens, Glass TTY font loading, CRT css
      crt/                       glass container, overlays, cursor, type-in
      hero/                      hero scene, crop metadata, FLIP push-in
      screens/                   menu, settings, pause, debrief frame, help
      terminal/                  text blocks, menu rows, command input, HELP
      grid/                      character-grid renderer + compact mode
      cabinet/                   lamp banks, OPEN EXCEPTIONS, countdown chrome
      audio/                     context, buses, manifest, recipes, captions
      a11y/                      announcer, live regions, focus manager
      state/                     engine binding: store, dispatch, wake, save
      art/                       slot registry, placeholder renderer, preload
      games/tictactoe.ts         LIST GAMES demonstration (pure + view)
    public/fonts/                Glass TTY VT220 woff2 (+ VT323 fallback note)
    test/app/                    mirrors src/app, jsdom Vitest project

## 3. Engine binding (src/app/state/)

One thin store owns the current CampaignState and exposes it to React.

    function useCampaign(): CampaignState            // subscription hook
    function send(action: EngineAction): void
      // Wraps engine dispatch with now = Date.now(); updates the store with
      // the returned state; surfaces rejection results to the caller for
      // inline rendering. The ONLY mutation path in the app.
    function wake(): void
      // advanceToNow(state, Date.now()) and store update. Wired to app start,
      // visibilitychange-to-visible, pageshow(persisted), resume, focus.

Save binding: bind the engine storage port to localStorage; debounce writes 500
to 800 ms during play; flush IMMEDIATELY on settlement, START_MISSION,
FORFEIT_MISSION, ACKNOWLEDGE_DEBRIEF, and NEW_CAMPAIGN (irreversible phase
transitions), plus visibilitychange to hidden and pagehide. Expose the engine's
recovery flag ('clean', 'recovered-backup', 'reset') to the UI. Engine calls
return { state, emitted: EngineEvent[] } (contract amendment to split 01, see
section 16): emitted is the ordered list of events materialized during that
call (timerMilestone, settlement, phaseChanged, consequenceApplied,
sourceCheckResolved, finaleFinalPhase, branchRunCompleted and friends). The
store relays emitted to audio, announcer, and LampController, so each fires
exactly once per engine event, never from wall-clock guesses. Milestones are
engine-owned scheduled events authored per seed; the shell never invents
thresholds. Multi-tab: a storage-event listener detects foreign writes to the
save keys, shows a GAME OPEN IN ANOTHER TAB notice, and pauses local writes
until reload; single-active-tab is a documented limitation.

The repaint ticker (requestAnimationFrame while visible, suspended when hidden)
re-renders countdown displays; it never calls dispatch or advanceToNow for
display purposes. Display remaining time derives from the engine's clamped
lastNow plus a performance.now() delta captured at the last wake or dispatch,
rendered on monotonic rAF timestamps; Date.now() is never read for display, so
a backward wall-clock jump cannot make the countdown gain time while the engine
refuses to un-expire (the engine's lastNow clamp and the display share one
truth, reconciled at every wake).

Edge case owned here: if the ticker observes the active deadline passed while
the tab stayed visible with no interaction, it calls wake() once, guarded PER
endsAt INSTANCE (a seen-deadline key, not an app-level flag), so the finale's
own later deadline still self-wakes after a mission's guard has tripped.

## 4. Theme and CRT presentation (src/app/theme/, src/app/crt/)

Palette tokens: glass background near #050A14, glyph core electric blue near
#6CB6FF (verified 4.5:1 against the background), dim blue for secondary text
(still AA), amber and red for cabinet only. Status colors always pair with
text.

Font: Glass TTY VT220 woff2 self-hosted with font-display swap and VT323 plus
monospace fallbacks; sizes chosen to respect its raster character; line and
letter spacing calibrated once against crt-reference.jpg in a comparison story
documented in the repo.

CRT stack, in layers inside the glass container: real DOM text (pre/output
semantics) with layered text-shadow (tight core, mid halo, wide faint halo);
scanline overlay (repeating-linear-gradient, 3 to 4 px device-aligned period,
pointer-events none); radial vignette overlay; thin luminous border via
box-shadow on the container; optional breathing-glow layer animating only
opacity; cursor as a span with opacity steps(2) animation. ::selection resets
text-shadow. No filter or shadow is ever animated; backdrop-filter is not used.
The reduce-glow setting drops the outer shadow layers and the breathing layer
via a single class.

Type-in effect: a hook that reveals authored lines character by character at a
period-plausible rate, emitting key-tick cues; any key, click, or tap completes
it instantly; prefers-reduced-motion or the motion setting makes all type-ins
instant. Type-in is presentation only; the full text exists in the DOM for
assistive tech immediately (visually clipped during the effect).

## 5. Hero and push-in (src/app/hero/)

Crop metadata type, authored per art asset (placeholder and final alike):

    interface HeroCrop {
      srcKey: ArtSlotId            // hero-desktop or hero-portrait
      glass: { x: number, y: number, w: number, h: number }  // fractions of
                                   // natural image size
      greetingAnchor: { x: number, y: number }               // fraction point
    }

Runtime geometry: given the rendered img box under object-fit cover and
object-position, compute the on-screen glass rect (scale = max of ratios,
centered offsets, fraction mapping). Unit-tested pure function; recomputed on
resize, orientationchange, and img.currentSrc change (picture selects the
portrait companion on phones).

Hero composition: one full-viewport button (accessible name from the visible
ACTIVATE TERMINAL label; image decorative), the photo (or graded CSS placeholder
scene from the art slot), the live greeting text and idle cursor absolutely
positioned at the greeting anchor and sized to stay readable at phone widths,
and the small sound control outside the button.

Push-in sequence (single-use; a guard prevents re-entry):
1. Resume the AudioContext synchronously in the activation handler.
2. Measure the glass rect; set will-change: transform on the photo layer.
3. element.animate the photo: scale k = max(vw/rectW, vh/rectH) times a small
   overshoot, translate glass center to viewport center, 700 ms, camera-dolly
   easing. Terminal mounted beneath at opacity 0 with the greeting positioned
   in register.
4. At 450 ms, crossfade: terminal opacity to 1 with a settle from scale 1.02
   to 1; photo opacity to 0; one-frame bloom flash overlay at the handoff.
5. On finish: remove will-change, unmount the photo layer, move focus to the
   terminal, play the activation cue, start the SHALL WE PLAY A GAME? type-in,
   then reveal the three menu rows (engine menu selector).
Reduced motion: steps 2 to 4 replaced by a 250 ms crossfade.

Routing on load: engine load result decides. Active mission: skip the hero,
mount the mission screen, wake() immediately (settles expired sessions on
arrival). Otherwise: show the hero; activation lands on the menu with campaign
state intact. The diegetic sound prompt line renders after activation when the
campaign is fresh and sound has never been configured; Y, N, click, or tap
answers it; the answer persists with audio prefs.

## 6. Terminal framework and screens (src/app/terminal/, src/app/screens/)

Screen model: a ScreenId union (hero, menu, mission:<id>, debrief, finale,
settings, help). The App router renders the active screen from engine phase
plus local UI state (settings and help are overlays, not phases). Mission
splits register screen components keyed by mission id; the shell provides the
registry and a plain fallback frame so split 02 is testable with the engine's
test-double mission.

Primitives exported to mission splits: TerminalText (styled block respecting
the rhythm), MenuRows (numbered rows, arrow and numeric selection, tap, hidden
fourth row driven by the engine selector), StatusLine, ActionBar (buttons that
send engine actions and show rejections inline), DetailPane, CommandInput, and
the character grid (section 7).

Menu behavior: exact opening text and spacing; numeric shortcuts, arrows with
Enter, row taps; shortcuts routed through a single key-handler utility that
bails on editable targets, held modifiers, and isComposing. Selecting a settled
mission opens its record view (engine-provided); the fourth row appears only
when the engine unlock selector says so.

Command input: parses a small command grammar (verbs defined by shell and
missions, for example HELP, SOUND ON, READ M03, SEND M03 BACKUP) into the same
typed engine actions as buttons; unknown or rejected commands print the
rejection reason as terminal output; context HELP lists currently valid verbs
from the active screen's registration. LIST GAMES appears only in idle HELP and
triggers the tic-tac-toe demonstration.

Overlays: native dialog with showModal for pause (Escape or MENU; Resume and
End Mission with typed confirmation routed to the engine forfeit action; the
countdown continues and the overlay says so), settings, help, New Campaign
confirmation with seed choice from catalog metadata, and the corrupt-save
notice when the recovery flag is not clean. All dialogs: aria-labelledby,
chosen initial focus, restored focus on close.

Settings content: effects, voice, ambience toggles with the AI-generated-voice
label; motion (defaults to prefers-reduced-motion, overridable); reduce-glow;
extended time (engine preference, editable only before the first mission
starts; the control states why when locked); New Campaign.

## 7. Character grid (src/app/grid/)

A fixed-width cell grid rendered as DOM text rows (not canvas) for the flight
map, finale displays, and tic-tac-toe: props are a cell matrix with per-cell
class hooks, a legend slot, and a selection model (arrow-key navigable,
tappable cells with 44 px effective targets via padding on narrow screens).
Compact mode reduces cell pitch and pairs with the mission-provided list view
(list parity is the mission split's obligation; the grid exposes the hooks).
Deterministic rendering: the grid is a pure function of its props; nothing
scrolls or animates except reduced-motion-aware selection highlights.

## 8. Cabinet chrome (src/app/cabinet/)

Lamp banks: CSS lamp matrices (amber dots in recessed rows over hammered
gray-olive panel styling or the rack art slot) driven by a small
LampController that maps engine events (phase change, settlement, branch run,
finale final phase) to bank states; transitions animate opacity only; idle
banks are static (no ambient blinking under reduced motion, subtle breathing
otherwise). Restrained red alarm indicator keyed to the finale's final phase
event.

Readouts: OPEN EXCEPTIONS from selectOpenExceptions beside service outcomes
from selectServiceOutcomes, labeled so the divergence reads; the deadline as
dot-matrix numerals (styled spans, same font) on wide layouts, swapped for an
in-terminal countdown line under a width breakpoint. The visible countdown
carries role="timer"; remaining time derives from endsAt minus the repaint
clock, clamped at zero.

## 9. Audio engine (src/app/audio/)

    interface CueDefinition {
      id: string
      source: { kind: 'synth', recipe: RecipeId } |
              { kind: 'file', url: string }        // base-aware URL
      bus: 'effects' | 'voice' | 'ambience'
      gain: number
      transcript: string | null                    // null only for sub-100ms
                                                   // mechanical ticks
      policy: 'exclusive-on-bus' | 'queue' | 'drop-if-stale'
      preload: 'eager' | 'lazy'                    // effects eager; voice lazy
                                                   // (decode on first play,
                                                   // then keep) to bound PCM
                                                   // memory on phones
    }

Engine: one AudioContext created at boot (suspended), resumed synchronously in
the activation handler, statechange listener re-resumes after interruption on
the next gesture. Three GainNode buses into master into destination; master 0
until enabled. Preferences {master, voice, effects, ambience} persisted;
corrupt reads fall to defaults (muted).

Playback: file cues pre-decoded on manifest load; synth cues built from typed
recipes (square and triangle oscillators for taps, blips, and two-tone cues;
filtered-noise buffers for hum and static; every sound wrapped in a 5 ms
attack, 30 to 100 ms release envelope). Ducking: voice start ramps ambience
with setTargetAtTime(0.3, t, 0.05), voice end restores at 0.3 time constant,
cancelScheduledValues before re-ramping; micro-fade before every stop();
exclusive voice. A generation token increments on screen change and on
catch-up; queued cues check it and drop silently. Timer warning cues subscribe
to engine milestone events so each fires at most once per mission.

Captions: a caption line component renders the transcript of any playing voice
or warning cue; the announcer (section 10) receives the same text. The shell
ships a provisional cue set covering every event in the requirements table
with synthesized recipes; the later media split replaces sources and adds
voice files without touching call sites (manifest swap).

Resilience: every audio call wrapped so failure (no context, decode error,
iOS interruption) is silent to gameplay; nothing awaits audio.

## 10. Accessibility spine (src/app/a11y/)

Two live regions mounted at boot and never unmounted: polite role="status"
atomic for game events; assertive role="alert" reserved for the finale's
critical warnings. announce(text, channel) debounces bursts (coalescing
within ~800 ms), retriggers identical strings via content toggle, and is the
single entry point; engine milestone and settlement events route through it.
Focus manager: moveFocusTo(screenRoot) focuses the new screen's heading or
command input (tabindex -1, preventScroll) on every screen change; dialogs
handle their own trap and restore natively. Key handler utility (shared):
bails on editable targets, modifiers, composition. Contrast tokens live in the
theme with a documented check. The motion and glow settings compose with the
media query through one useMotionPreference hook consumed everywhere motion or
glow decisions happen.

## 11. Art slots (src/app/art/)

    type ArtSlotId = 'hero-desktop' | 'hero-portrait' | 'menu-rack' |
      'bezel-texture' | 'briefing-outlook' | 'briefing-flights' |
      'briefing-bank' | 'failsafe-wall' | 'countdown-insert' |
      'hero-return' | 'ending-recovery' | 'ending-containment' |
      'ending-failure'

Slot registry maps each id to: current source (placeholder renderer or image
URL), aspect ratio and reserved layout space, loading priority (hero eager
with reserved space; others deferred until the first view is stable; mission
briefing art preloaded when the mission is selected), and accessible text
(empty alt for decorative, required description for informative). Placeholder
renderer: graded CSS scenes (gradients, panel textures, lamp dots) specific
enough to validate layout and mood. The media split replaces sources only;
HeroCrop metadata rides with hero slot entries.

## 12. Tic-tac-toe (src/app/games/)

Pure deterministic module: two optimal players (minimax or the known optimal
policy table) from empty board to a draw, emitting a move list; the view
animates moves on the character grid at watchable pace, instantly under
reduced motion, skippable, outside campaign state entirely. Unit test asserts
the draw and the exact move sequence.

## 13. Build and config

Vite config: base from an environment variable with a sensible default
(derived in CI by split 08; locally defaults to /wargames/ for subpath parity
testing), React plugin, font and audio assets under public/ with base-aware
references through import.meta.env.BASE_URL helpers (one urlFor(path) utility;
no raw absolute paths anywhere). Vitest: add the jsdom ui project beside the
engine node project (extends: true, include test/app/**). The dev server is
plain vite dev; split 08 registers the preview service in services.json.

## 14. Testing strategy notes

Headless (jsdom) units: object-fit cover glass-rect math (pure, exhaustive
cases including object-position and portrait crops); command parser to action
mapping and rejection rendering; key-handler bail conditions; announcer
debounce and retrigger; LampController event mapping; cue manifest validation
and generation-token dropping (Web Audio mocked behind a thin port); save
binding debounce and flush triggers (fake timers); type-in completion; screen
router from engine phases; settings persistence round-trips; tic-tac-toe draw.
Component tests with Testing Library: hero activation single-use across
click, Enter, Space; focus handoff; menu selection by number, arrow, tap;
hidden fourth row; dialog focus behavior; caption rendering; corrupt-save
notice. Browser-level checks (real push-in visuals, audio output, VoiceOver
and NVDA, mobile widths) are explicitly deferred to the deployment split's
Playwright and manual pass; this split's definition of done is jsdom-green
plus a documented manual smoke checklist run locally.

## 15. Risks and mitigations

- Register drift between photo glass and live terminal across viewports: the
  glass-rect math is pure and unit-tested, crop metadata is authored per
  asset, and the bloom flash covers sub-pixel residue; final art arrives with
  its own calibrated metadata through the same interface.
- Audio autoplay regressions on iOS: synchronous resume in the activation
  handler, interruption re-resume, and the whole engine fallible by design.
- Performance of the CRT stack on mid-tier phones: no animated filters,
  overlays are static layers, will-change scoped to the 700 ms, breathing
  glow is one opacity tween; a perf smoke on a throttled profile joins the
  manual checklist.
- Shell-engine contract drift before missions land: the test-double mission
  (imported via the engine's @engine/testing export) exercises screen
  registration, actions, settlement, and debrief through the real engine in
  jsdom tests.

## 16. Review integrations (revision 2, 2026-11-17)

Integrated from reviews/iteration-1-opus.md; dispositions in
claude-integration-notes.md. Engine-contract amendments appended to
01-simulation-core/claude-plan.md and its affected section files.

1. Engine events: dispatch and advanceToNow return { state, emitted:
   EngineEvent[] }; emitted entries correspond one-to-one with queue deletions
   and settlement transitions in that call, so exactly-once is structural.
   EngineEvent union: missionStarted, scheduledEventFired, timerMilestone,
   settlement, phaseChanged, consequenceApplied, sourceCheckResolved,
   debriefAcknowledged, finaleFinalPhase, branchRunCompleted, campaignReset.
   Timer milestones (including 30 and 10 second warnings) are seed-authored
   scheduled events materialized at mission start; the shell never derives
   thresholds from wall clock. LampController and audio warnings consume
   emitted only.
2. Debrief frame: an explicit ACKNOWLEDGE control (button and command) wired
   to ACKNOWLEDGE_DEBRIEF; returning to menu happens through the resulting
   state, and the fourth-row unlock follows the engine selector.
3. BranchStepTrace consumption interface: the grid package exports
   playBranchTrace(steps: BranchStep[]) rendering { step, label, detail }
   entries at watchable pace, instant under reduced motion, skippable, with
   results always readable after skip. Split 01 defines BranchStep; split 06
   authors the content.
4. Campaign-begun: engine CampaignState carries startedMissionIds; the
   extended-time control disables when nonempty and states why.
5. Input precedence stack, top wins: open native dialog; active diegetic
   prompt (consumes only its answer keys); running type-in (any non-consumed
   key completes it and is swallowed); menu shortcuts and screen actions;
   global shortcuts. Implemented once in the key-handler utility, tested per
   layer and per collision case (the 1-during-type-in and Y-during-prompt
   races).
6. Command grammar: trim, collapse whitespace, case-fold to upper; verb-first
   tokens; active-screen mission verbs resolve before shell verbs; registry
   collisions throw in dev at registration; rejections render as
   UNRECOGNIZED COMMAND: <input> or INVALID: <engine reason>. Command-button
   identity is asserted on parsed action values.
7. Glossary primitive (global Web UI rule): terms render with a subtle dotted
   underline; hover, focus, and tap open a plain-language definition; Escape
   closes; definitions live in one glossary module covering OPEN EXCEPTIONS,
   TRACE, CHECK SOURCE, OBSERVED, EXERCISE, DERIVED, independent
   corroboration, REPEAT D-83, HOLD AND VERIFY, STAGED RECOVERY, and the
   channel and ledger jargon missions add. The web-output-cache rule maps to
   save-resume: a return visit never shows an empty state over an existing
   campaign (hero skip to mission, menu with state intact); stated in the
   README.
8. Fonts: VT323 self-hosted beside Glass TTY VT220; zero external requests.
9. Live regions mount as siblings of the dialog host at the app root, outside
   screen roots; assertive announcements fire during modals; assertive never
   coalesces, polite coalesces identical strings and queues distinct ones.
10. New Campaign dialog lists exactly the three named seeds with
    descriptions; no free seed input.
11. Grid performance: glow applies at container level; per-cell shadows
    capped to one layer; the manual perf smoke includes a finale-scale grid.
12. Audio: preload eager for effects, lazy for voice; one persisted master
    value backs both the diegetic prompt and the settings switch; resume()
    asserted synchronous in each of the four activation handlers.
13. Motion: in-flight WAAPI animations complete on preference change;
    orientation and resize are ignored during the 700 ms push-in and
    geometry reconciles after the terminal owns the viewport.
14. Contrast measured at the vignette's darkest overlap; vignette strength is
    constrained by the AA check, not the other way around.
