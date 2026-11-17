<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-app-scaffold
section-02-engine-binding
section-03-crt-theme
section-04-terminal-framework
section-05-hero-pushin
section-06-overlays-settings
section-07-audio-engine
section-08-cabinet-grid
section-09-a11y-glossary
section-10-art-slots-extras
END_MANIFEST -->

# Implementation Sections Index: 02-terminal-shell

Sections implement claude-plan.md (revision 2, including section 16 review
integrations) with tests from claude-plan-tdd.md written first. The engine from
split 01 is a hard prerequisite, including its contract amendments (emitted
events, startedMissionIds, BranchStep, @engine/testing).

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-app-scaffold | - | all | No |
| section-02-engine-binding | 01 | 04, 05, 06, 07, 08 | No |
| section-03-crt-theme | 01 | 04, 05 | Yes (with 02) |
| section-04-terminal-framework | 02, 03, 09 | 05, 06, 08 | No |
| section-05-hero-pushin | 02, 03, 04, 07 | - | No |
| section-06-overlays-settings | 04, 09 | - | Yes |
| section-07-audio-engine | 02 | 05 | Yes (with 03, 04) |
| section-08-cabinet-grid | 02, 03, 04 | - | Yes |
| section-09-a11y-glossary | 01 | 04, 06 | Yes (with 02, 03) |
| section-10-art-slots-extras | 01, 03 | 05 (hero slot) | Yes |

## Execution Order

1. section-01-app-scaffold
2. section-02-engine-binding, section-03-crt-theme, section-09-a11y-glossary,
   section-10-art-slots-extras (parallel after 01)
3. section-07-audio-engine (after 02; parallel with 04)
4. section-04-terminal-framework (after 02, 03, 09)
5. section-05-hero-pushin, section-06-overlays-settings, section-08-cabinet-grid
   (parallel after their dependencies)

## Section Summaries

### section-01-app-scaffold
Vite + React app scaffold beside the existing engine: src/app tree, jsdom
Vitest project added to the projects config, Testing Library dev deps, base
handling with the urlFor(path) helper and the no-raw-absolute-paths check,
self-hosted Glass TTY VT220 and VT323 fonts under public/fonts, App shell with
the screen router skeleton and dialog host, built-HTML base smoke test.

### section-02-engine-binding
src/app/state: the store, useCampaign, send() with now sampling and rejection
surfacing, wake() wiring (start, visibilitychange, pageshow persisted, resume,
focus), emitted-event relay with exactly-once consumption, display clock from
clamped lastNow plus performance.now() delta on rAF, per-endsAt self-wake
guard, save binding (debounce, immediate-flush set, hidden/pagehide flush),
recovery flag surface, multi-tab storage listener and notice state. TDD
block 3.

### section-03-crt-theme
src/app/theme and src/app/crt: palette tokens with AA assertions at vignette
worst case, font loading, the CRT layer stack (text-shadow glyphs, scanlines,
vignette, luminous border, breathing glow, cursor), reduce-glow class, type-in
hook with instant completion and reduced-motion behavior. TDD block 4.

### section-04-terminal-framework
src/app/terminal and screens/: screen registry and router from engine phase,
terminal primitives (TerminalText, MenuRows, StatusLine, ActionBar,
DetailPane), command input with the pinned grammar and verb registries,
context HELP, input precedence stack in the shared key handler, menu behavior
with hidden fourth row, debrief frame with the ACKNOWLEDGE control. TDD
block 6 (menu, grammar, precedence, debrief).

### section-05-hero-pushin
src/app/hero: HeroCrop metadata, object-fit cover glass-rect math (exhaustive
unit tests), hero button composition with live greeting, the FLIP push-in
with WAAPI and the crossfade handoff, reduced-motion path, synchronous audio
resume in all four activation handlers, load routing (skip to mission, menu
with state, expired settle), diegetic sound prompt, orientation lock during
the push. TDD block 5.

### section-06-overlays-settings
Native dialog suite: pause (Escape and MENU, Resume, confirmed End Mission),
settings (sound toggles with AI-voice label, motion, glow, extended-time lock
from startedMissionIds with explanation, New Campaign with three named seeds
and confirmation), corrupt-save notice, help overlay. TDD block 6 (dialogs).

### section-07-audio-engine
src/app/audio: context lifecycle (suspended create, sync resume,
interruption re-resume), three buses plus master, cue manifest schema with
preload and transcript validation, synth recipes, eager and lazy decode
paths, ducking, exclusive voice, generation tokens, milestone-event warning
cues, captions, persisted prefs with single master backing value, total
fallibility. TDD block 9.

### section-08-cabinet-grid
src/app/cabinet and grid: lamp banks driven by emitted events only, red alarm
on finaleFinalPhase, OPEN EXCEPTIONS and service outcome readouts, countdown
chrome with role timer and breakpoint fallback, the character grid (pure
render, selection, compact mode, container-level glow, capped cell shadows),
playBranchTrace for BranchStep arrays. TDD blocks 7 and 8.

### section-09-a11y-glossary
src/app/a11y plus the glossary primitive: live regions at the app root
(polite coalescing rules, assertive never coalesces), announcer utility,
moveFocusTo, key-handler bail conditions, useMotionPreference with in-flight
completion, glossary term component (hover, focus, tap, Escape) and the
project glossary module. TDD block 10 plus the glossary tests in block 6.

### section-10-art-slots-extras
src/app/art and games: slot registry with placeholder renderers, reserved
space, priorities and preload hooks, decorative vs informative validation,
source-swap interface test; tic-tac-toe pure module and grid view. TDD
blocks 11 and 12. Also owns the manual smoke checklist document.
