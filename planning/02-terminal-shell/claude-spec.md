# Complete Specification: 02-terminal-shell

Synthesis of spec.md, claude-research.md, and claude-interview.md. 2026-11-17.
Authoritative upstream: ../requirements.md (Clickable hero, Controls/clock/
presentation, Audio sections) and ../reference/crt-reference.jpg. The engine
contract comes from ../01-simulation-core/claude-plan.md (rev 2). This document
stands alone for planning purposes.

## What this is

The entire player-facing frame of SHALL WE PLAY A GAME?: the photographed hero
and its push-in reveal, the CRT terminal presentation, menu and command systems,
overlays and settings, WOPR cabinet chrome, the audio engine shell, and the
accessibility spine. React, Vite, TypeScript, static build, base-aware URLs so
the site works at https://boardybell.github.io/wargames/ and at /. Mission
splits (03 to 06) compose their screens from primitives defined here; split 07
fills the art slots and voice files; split 08 ships it.

The shell renders what the engine says and never invents state. All player
mutations flow through the engine's dispatch envelope (action, now); the shell's
job is presentation, input capture, wake signals, and persistence binding.

## Locked decisions

- Typeface: Glass TTY VT220 (public domain) as the terminal face, rendered at
  sizes that respect its raster character; VT323 in the fallback stack. The
  reference screenshot governs color, luminous border, left-aligned layout, and
  spacing rhythm; glyph shapes go authentic DEC.
- CRT intensity: cinematic by default (pronounced bloom, vignette, subtle
  flicker); a reduce-glow toggle ships in settings beside sound and motion.
- Sound first contact: diegetic one-line prompt after activation (AUDIO SYSTEM
  AVAILABLE. ENABLE SOUND? Y/N), once per fresh campaign, one keystroke or tap;
  the small opening-screen speaker control and the settings toggles also exist.
- Push-in: hand-rolled FLIP with WAAPI element.animate(), transform and opacity
  only; View Transitions API not used. Terminal stays full-viewport; the photo
  scales so its glass region fills the viewport; 250 ms crossfade with a
  one-frame bloom flash; will-change applied only for the 700 ms.
- Audio: one app-wide AudioContext resumed synchronously inside the hero
  activation handler (iOS-safe), master gain 0 until enabled; effects, voice,
  ambience GainNode buses; synthesized effects (zero asset weight); voice as
  pre-rendered files from split 07.
- Accessibility: two persistent live regions mounted at boot; role="timer"
  countdown, milestone-only announcements; native dialog overlays; focus moves
  to new content on screen changes; shortcut guard on editable targets; glyph
  core alone clears WCAG AA 4.5:1 (electric blue near #6CB6FF on #050A14).
- House rules: no em-dashes anywhere; small dependency footprint (React, ReactDOM,
  Vite tooling; no UI libraries); dev server registered in services.json by 08.

## The hero

Full-viewport photographed 1983 operator station (art from 07; graded CSS
placeholder until then): CRT and chunky keyboard as subjects, WOPR cabinet
behind with hammered gray-olive panels, amber lamp banks, dark fluorescent
readout. GREETINGS PROFESSOR FALKEN and a blinking idle cursor sit on the glass
as live HTML, positioned by per-crop calibration metadata, readable at phone
size.

- The whole hero is one button element whose accessible name is the visible
  ACTIVATE TERMINAL label near the lower edge; the photo is decoration
  (alt=""). Click, tap, Enter, Space all fire the same single-use activation;
  focus stays visible throughout and moves to the live terminal when ready.
- Art slot metadata per crop: image source, portrait companion, and the glass
  rectangle as fractions of natural image dimensions. Runtime maps the rect
  through object-fit cover math (scale = max of ratios, centered offsets,
  object-position aware), recomputed on resize and orientation change; portrait
  phones select the companion crop via picture and img.currentSrc keying.
- Push-in: 700 ms, camera-dolly easing, scale k = max(vw/rectW, vh/rectH) with
  slight overshoot, glass center translated to viewport center; terminal
  mounted beneath at opacity 0; crossfade over the final 250 ms with a tiny
  settle (1.02 to 1) and the bloom flash at handoff; greeting held in register
  between photo overlay and terminal text. The WAAPI finish promise sequences
  focus handoff and the activation audio cue.
- Reduced motion: 200 to 300 ms plain crossfade, no push, no settle.
- Activation resumes the AudioContext synchronously regardless of mute state.
- Fresh visits show the hero. A reload mid-mission skips the hero entirely and
  restores the saved mission; a reload with a completed or menu-state campaign
  shows the hero, and activation returns to the menu with state intact.
- Skippable type-in: WOPR types SHALL WE PLAY A GAME? then reveals the three
  numbered choices; any key, click, or tap completes the type-in instantly.

## The terminal

- Exact opening text and spacing from the requirements (GREETINGS PROFESSOR
  FALKEN / SHALL WE PLAY A GAME? / three numbered choices), left-aligned,
  generous rhythm, matched against crt-reference.jpg.
- Presentation: electric blue on navy-black; layered text-shadow phosphor
  (tight core, mid halo, wide faint halo); fine scanline overlay
  (repeating-linear-gradient, pointer-events none, device-pixel aligned);
  radial vignette and luminous border on the glass container; blinking cursor
  via opacity steps(2); ::selection resets text-shadow. Real DOM text with
  pre/output semantics: selectable, findable, zoomable. No filter animation
  anywhere; breathing glow animates overlay opacity only.
- Menu: numeric shortcuts, arrow keys with Enter, and row taps from the moment
  the menu appears; the fourth row absent from the DOM until the engine's menu
  selector unlocks it; shortcuts ignored while any text field has focus.
- Command input: small single-line input with context-sensitive HELP; commands
  parse to the same typed engine actions as buttons; invalid commands render
  the engine's rejection reason; input never steals single-key shortcuts while
  focused.
- Screen framework: every screen is a composition of shell primitives (terminal
  text blocks, character-grid renderer for mission maps, status lines, action
  button rows, detail panes). Mission splits register screens; the shell owns
  layout, focus movement to new content, announcement routing, and per-screen
  fade transitions (brief, reduced-motion aware).
- Character-grid renderer: fixed-width grid component for the flight map and
  finale displays, DOM-text based, with cell styling hooks and a narrow-screen
  compact mode; never the only way to act (list parity lives in mission
  splits).

## Cabinet chrome

- Amber lamp banks rendered as CSS lamp matrices that change only on real
  engine transitions (phase changes, settlement, branch runs); a restrained red
  alarm indicator for the finale's final phase.
- OPEN EXCEPTIONS tally on the cabinet readout beside the terminal's real
  service outcomes, both from engine selectors.
- Deadline as dot-matrix numerals beside the cabinet on wide screens, as an
  in-terminal readable value on small screens; both derive remaining time from
  the engine's persisted endsAt against the repaint clock; display only, never
  state. role="timer" on the visible countdown.

## Clock and wake wiring

- A repaint ticker (requestAnimationFrame or 250 ms interval while visible)
  renders remaining time; it never advances game state.
- advanceToNow(state, Date.now()) runs on: app start, every dispatch (engine
  does it internally), visibilitychange to visible, pageshow with persisted,
  resume, and focus. Timer warnings and milestone announcements key off engine
  events produced by the drain, so each fires at most once.
- Save binding: the shell binds the engine's storage port to localStorage,
  debounces writes 500 to 800 ms during play, flushes on settlement,
  visibilitychange to hidden, and pagehide. The recovery flag renders as the
  visible corrupt-save reset path.

## Overlays and settings

- MENU or Escape opens the pause overlay (native dialog, showModal): Resume and
  End Mission with explicit confirmation before the engine forfeit action; the
  countdown continues behind it and the overlay says so.
- Settings (own dialog, reachable from menu and pause): effects, voice, and
  ambience toggles with the AI-generated-voice label; motion toggle (follows
  prefers-reduced-motion by default, overridable); reduce-glow toggle;
  extended-time toggle labeled and changeable only before a campaign's first
  mission starts (engine preference); New Campaign with confirmation and seed
  selection from the engine's catalog metadata.
- Corrupt-save reset: when the engine load reports recovered-backup or reset,
  a plain-language notice renders with the reset path; never silent.
- All dialogs: aria-labelledby, chosen initial focus, Escape honored, focus
  restored on close.

## Audio engine shell

- One AudioContext; synchronous resume in activation; statechange listener
  re-resumes after iOS interruption on next gesture.
- Buses: effects, voice, ambience GainNodes into master into destination.
  Master 0 until enabled. Independent persisted toggles {master, voice,
  effects, ambience} in localStorage, corrupt read falls to defaults.
- Cue manifest schema (filled by 07): id, source (synth recipe reference or
  base-aware URL), bus, base gain, transcript, interrupt policy (exclusive-on-
  bus, queue, drop-if-stale). Mandatory transcript feeds the caption line and
  the polite live region.
- Playback: short cues pre-decoded to AudioBuffers; every sound wrapped in a
  short envelope; ducking via setTargetAtTime (down 0.05, up 0.3) with
  cancelScheduledValues before re-ramping; micro-fade before any stop();
  exclusive voice bus; generation token incremented on screen change and
  catch-up discards stale queued cues; timer warnings fire at most once from
  engine events, not wall-clock guesses.
- Synthesized effect recipes (oscillators, filtered noise, envelopes) live in
  the shell as typed recipes; 07 authors the final cue set and the voice files.
- Captions: every spoken line and audible warning renders its transcript
  visibly regardless of audio state.
- Full function with audio unavailable: every audio call is fallible and
  non-blocking; game state, deadlines, text, and controls never wait on audio.

## Art slots (interface for 07)

Named slots with graded CSS placeholder rendering until final art lands: hero
desktop, hero portrait, menu rack background, bezel texture, per-mission
briefing stills, failsafe rack wall, countdown insert, hero return, ending
stills. Each slot carries: id, layout space reservation (aspect ratio and
object-position), loading priority (hero eager with reserved space, others
deferred until first view is stable, mission art preloaded on mission select),
and accessible text equivalent. Decorative slots render with empty alt;
informative slots require their text equivalent.

## LIST GAMES

Hidden item mentioned in idle-terminal HELP (menu phase only, outside missions
and the numbered menu): LIST GAMES prints a short catalog ending in
TIC-TAC-TOE; running it plays a three-by-three demonstration with two optimal
deterministic players reaching a draw, rendered in the character grid at
watchable speed (instant under reduced motion), skippable, zero effect on
campaign state. Pure function in the shell package with its own tests.

## Accessibility spine

- Keyboard-only completeness: every action reachable by keyboard; visible focus
  indicators meeting 3:1; logical tab order; no keyboard traps outside native
  dialogs.
- Screen reader: two persistent live regions (polite status, assertive alert
  reserved for the finale's critical moments); announcer utility debounces and
  retriggers; significant events announced, countdown ticks never.
- Contrast: glyph cores and UI components clear AA on the navy-black ground;
  status colors always paired with descriptive text.
- Mobile: tap targets at least 44 px, portrait hero crop, compact grid modes,
  the same complete campaign playable at mobile widths.
- Motion and glow: prefers-reduced-motion respected everywhere (push-in, type-
  in, flicker, rolling effects, screen fades) with an in-app override; reduce-
  glow drops outer shadow layers.

## Acceptance criteria

1. Fresh load shows the hero with the greeting, idle cursor, and visible
   ACTIVATE TERMINAL affordance; mouse, tap, Enter, and Space each activate
   exactly once; focus lands in the live terminal; exactly three choices appear
   after the type-in; skip works with key, click, and tap.
2. Reloading an active mission restores it directly with the timer correct from
   persisted endsAt; reloading at menu shows the hero and returns to the menu
   with state intact; the expired-session case settles correctly on arrival.
3. Menu and game controls work by tap and by typed command, dispatching
   identical engine actions; shortcuts ignored while typing; Escape overlay
   with Resume and confirmed End Mission; countdown continues behind it.
4. Settings persist: sound toggles, motion, glow, extended time (locked after
   first mission start), New Campaign with confirmation and seed choice;
   corrupt-save notice and reset path render when the engine reports recovery.
5. Audio: muted by default; diegetic prompt appears once per fresh campaign and
   honors Y/N by key and tap; enabling mid-game works instantly (context
   already resumed); captions render for every cue with or without audio;
   ducking and stale-cue dropping behave per the manifest policies.
6. Accessibility: keyboard-only campaign through the shell surfaces; VoiceOver
   and NVDA hear milestones but never ticks; dialogs trap and restore focus;
   reduced motion replaces the push-in with a fade and makes type-in instant;
   AA contrast verified for glyph cores, UI, and focus indicators.
7. The character grid renders the test-double mission's demo layout at desktop
   and narrow widths; LIST GAMES reaches its draw deterministically.
8. Production build serves correctly under a repository-style subpath (vite
   base), with every asset URL base-aware; placeholder art slots render graded
   placeholders with reserved layout space.
9. Shell unit tests run in the Vitest jsdom project beside the engine's node
   project; the FLIP geometry math (object-fit cover mapping) is unit-tested
   headlessly; browser-level verification lands with split 08's Playwright
   pass.
