# TDD Plan: 07-art-audio-pipeline

Companion to claude-plan.md revision 2. Media are assets; the test-first
discipline applies to the validation suite and the tools, with the
generation stages gated by machine checks rather than unit tests.

## Stage A (discovery)

- discovery.json schema check: rung per media class, probe timestamps,
  provenance verdict fields; CI fails on prose-only discovery records.
- Rung-1 provenance assertions encoded as a checklist the probe script
  enforces (format, min dimensions, critique-lane sanity verdict).

## Stage B/D (art and integration)

- Slot-dimensions table test: every ArtSlotId has a declared 2x target
  derived from the split 02 reserved box; every shipped AVIF matches its
  target within tolerance; per-slot and total byte ceilings (AVIF only).
- HeroCrop calibration tool test: clicking known corners on a synthetic
  test image emits the expected fractions; the overlay renderer draws
  the rect at the right pixels (pure math reuse of the split 02
  geometry functions).
- Portrait-is-reframe check: desktop and portrait hero metadata declare
  the same scene id.
- Base-aware resolution test: every registered slot URL resolves through
  BASE_URL under a subpath build.
- Dark-readout: countdown-insert and failsafe-wall request files contain
  the constraint text (authoring guard); manual composite check on the
  checklist.

## Stage E/F (audio)

- Manifest validation: every cue id resolves; formats valid (opus
  primary, AAC fallback present for voice); transcripts present;
  transcript strict-equals the catalog display text for every
  voiceClipId (phonetic-leak guard); preload fields correct.
- Catalog parity: every catalog voiceClipId has a rendered clip (or
  appears on the rung-gated exception list in discovery.json).
- Loop-join determinism: sample-level continuity at the room-loop seam
  within a tolerance; test decodes the shipped file.
- Audio memory budget: decoded-size estimate across eager cues under
  the budget; lazy voice clips counted at worst case singly.

## Stage C/G (reviews)

- Round records in media/REVIEWS.md reference existing asset names
  (link check); the three-round cap is procedural, recorded, and the
  locked-with-findings escape requires a findings list (non-empty check
  when invoked).

## Cross-cutting

- No em-dash scan over media/requests/, the preamble, transcripts, and
  README sections this split writes.
- Gitignore test: media/src and audition candidates excluded; public/
  exports present in the tree.
