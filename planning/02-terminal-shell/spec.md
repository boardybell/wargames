# Spec: 02-terminal-shell

Context: ../requirements.md (authoritative; see Clickable hero, Controls/clock/
presentation, and Audio sections), ../decisions.md, ../deep_project_interview.md,
../project-manifest.md, ../reference/crt-reference.jpg (the visual anchor).

## Purpose

The entire player-facing frame: hero scene, push-in reveal, CRT presentation, menu,
command input, overlays, settings, cabinet chrome, audio engine shell, accessibility.
Mission splits compose their screens from primitives defined here. This split also
defines the interfaces that 07 fills with finished art and audio.

## In scope

1. Vite + React + TypeScript scaffold, small dependency footprint, static production
   build, base-aware URLs for every script, style, image, and audio file so the site
   works at https://boardybell.github.io/wargames/ and at /.
2. Hero. Full-viewport photographed operator station: CRT and chunky keyboard as
   subjects, WOPR cabinet behind with hammered gray-olive panels, amber lamp banks,
   dark fluorescent readout. GREETINGS PROFESSOR FALKEN and an idle cursor placed on
   the glass as live HTML, calibrated per crop, readable at phone size. The whole hero
   is one accessible button with a subtle ACTIVATE TERMINAL label; click, tap, Enter,
   Space all fire the same single-use activation; focus stays visible and moves to the
   live terminal when ready. 700 ms push-in, final glass aligned with the playable
   terminal, crossfade at alignment, greeting held in register. Reduced motion gets an
   immediate reveal. Type-in of SHALL WE PLAY A GAME? is skippable. Fresh visits show
   the hero; a reload mid-mission restores the saved mission directly.
3. Terminal. Exact opening text and spacing from requirements.md lines 16 to 22.
   Electric blue on navy-black matched to crt-reference.jpg: dot-matrix glyph feel,
   thin luminous border, left alignment, generous rhythm. Controlled phosphor bloom,
   fine scanlines, blinking cursor, bright rules, selectable accessible content, state
   kept out of visual effects. Numeric shortcuts, arrows with Enter, and row taps from
   the moment the menu appears; the fourth row hidden until earned; shortcuts ignored
   while typing in fields.
4. Cabinet chrome. Amber lamp banks that move only on real game transitions, restrained
   red alarm, OPEN EXCEPTIONS tally, dot-matrix deadline numerals beside the cabinet
   with an in-terminal fallback on small screens.
5. Controls. Every action reachable without typing; command input with context HELP;
   commands and buttons dispatch the same validated core actions. MENU or Escape opens
   an overlay with Resume and End Mission (confirmed before forfeiture) while the
   countdown runs behind it. Settings and save controls live outside the menu text:
   effects, voice, motion, extended-time (labeled, chosen before start), New Campaign
   with confirmation, corrupt-save reset path.
6. Audio engine shell. Muted by default, starts only after enable plus user activation,
   independent voice and effects toggles persisted, cue manifest loader (event, file,
   gain, transcript), captions for every spoken or warning cue, ambient ducking under
   speech, brief fades between screens, stale queued clips discarded on navigation or
   catch-up, each timer warning fired at most once from actual timer state, full
   function with audio unavailable. Optional small sound control on the opening screen
   separate from the hero button. AI-generated-voice label in sound settings.
7. Accessibility. Complete campaign playable keyboard-only and at mobile widths, WCAG
   AA contrast, descriptive text beside status colors, focus indicators, screen reader
   announcements for significant events but never per countdown tick, reduced-motion
   support everywhere.
8. LIST GAMES. Hidden item in idle-terminal HELP running a three-by-three tic-tac-toe
   with two optimal deterministic players reaching a draw. Outside the timed campaign
   and the numbered menu.
9. Interface definitions for 07: named art slots (hero desktop, hero portrait, menu
   rack, bezel texture, per-mission briefing stills, failsafe wall, countdown insert,
   ending stills) with graded placeholder rendering until final art lands, reserved
   hero layout space, deferred noncritical art, per-mission preload hooks, and the cue
   manifest schema.

## Out of scope

Mission screens and rules (03 to 06), finished art and audio files (07), CI (08).

## Provides

Screen framework, CRT text primitives, character-grid renderer, command dispatch,
overlay and settings systems, audio engine, art slots, focus and announcement services.

## Needs

01-simulation-core: campaign state, clock, save, action validation.

## Decisions that bind this split

The reference screenshot is the register for the glass. Hero art arrives from 07
through the ChatGPT/codex lane only; build against placeholders without blocking.
House style: no em-dashes anywhere. Local preview service gets registered in
~/mainframe/services.json (08 owns the registration, this split owns the dev server).
Full quality, no rationing.

## Acceptance anchors

Requirements.md verification bullets: fresh-load hero with visible entry action and
exactly three choices on activation via mouse, tap, and keyboard; timer resumes in the
terminal after reload; keyboard-only and mobile playthroughs; reduced motion and
sound-off checks; legibility of crops, glows, and the transition.
