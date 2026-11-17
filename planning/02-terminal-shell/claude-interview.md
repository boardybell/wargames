# Interview: 02-terminal-shell

2026-11-17. Interviewee: Bond. Research (claude-research.md) settled the technical
approaches; this round covered the three taste calls.

## Q1: Terminal typeface

Q: What wins when the reference screenshot (rounded film-style dot-matrix) and
authenticity (sharper 1983 raster fonts) disagree? Options: match the screenshot,
authentic DEC raster, or a blend.

A: Authentic DEC raster. Glass TTY VT220 (public domain) at integer pixel
multiples. Sharper, historically truer. The reference screenshot still governs
color, border, layout, spacing rhythm, and overall glass register; the glyph
shapes go DEC.

## Q2: Default CRT effect intensity

Q: Cinematic (pronounced bloom, vignette, subtle flicker) vs restrained default,
given the halation finding; a reduce-glow toggle ships either way.

A: Cinematic. The ten-second first impression carries the project; the toggle
rescues sensitive eyes.

## Q3: First contact with sound

Q: Muted by default per spec; diegetic one-line terminal prompt (ENABLE SOUND?
Y/N) vs controls-only discovery.

A: Diegetic prompt. One line after activation, one keystroke or tap, in
character, once per fresh campaign; the speaker control and settings remain.

## Engineering decisions carried from research (not user questions)

- Hand-rolled FLIP push-in with WAAPI, transform and opacity only; View
  Transitions API skipped. Screen-rect-as-fractions metadata per art crop with
  object-fit cover math; terminal stays full-viewport; 250 ms crossfade with a
  one-frame bloom flash; will-change only during the 700 ms.
- CRT effects on pointer-events-none overlays over real DOM text; layered
  text-shadow glow; nothing animates shadows or filters; cursor opacity steps(2).
- One AudioContext resumed synchronously inside the hero activation handler;
  effects/voice/ambience buses into master; cue manifest with mandatory
  transcripts; setTargetAtTime ducking; generation-token stale-cue dropping;
  synthesized effects, pre-rendered voice files.
- Two persistent live regions mounted at boot; role="timer" countdown with
  milestone-only announcements; native dialog overlays; focus moves to new
  content per screen change; shortcut guard on editable targets.
- Glyph core color clears WCAG AA 4.5:1 alone (electric blue near #6CB6FF on
  #050A14); reduce-glow toggle beside sound and motion settings.
