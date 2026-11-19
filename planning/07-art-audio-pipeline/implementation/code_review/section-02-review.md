# Art pipeline (section-02) review

Reviewer: deep-implement:code-reviewer. SHIP. The reviewer tried hard to find a weakened gate or a silently-excepted slot and could not: the provenance scoping is honest, every gate now bites on all 13 real slots, the registry swap is clean, and the HeroCrop values are genuine calibrate-core output. (Visual quality itself is the human browser pass at deploy; a code reviewer cannot see the AVIFs.)

## VERIFIED HONEST
- No gate weakened: discovery.test scopes the rung-1 raster-provenance requirement to image-generate records (legitimate — critique records carry no raster), and STILL requires a complete provenance block for every generation record plus a new assertion that at least one provenanced generation record exists (bites if deleted). A rung-1 image-generate claim cannot pass without full provenance.
- placeholderSlots is [] so dimensions (per-slot tolerance + byte ceilings + total AVIF < 2.4 MB), base-url (every slot source.kind image + base-relative url), and dark-readout all iterate 13 real assets with no skips. All 13 AVIF + 13 JPEG on disk; total AVIF 0.539 MB.
- Registry swap routes all 13 through imageSource -> urlFor (no raw absolute paths); hero-portrait is a reframe of the same wopr-command-room scene.
- HeroCrop fractions in [0,1], inside the frame, 4-decimal calibrate-core output delegating to computeGlassRect; the heroScene.test change is a correct recompute of the calibrated anchor, not a loosened assertion. The new art.test gates (portrait-reframe, [0,1] bounds, JPEG fallback) are real.
- Tools are codex-only (no local gen), enforce the byte ceilings, cannot fake a critique PASS; no em-dashes.

## Findings (all addressed)
- M1 (fixed): base-url.test leaned on Vitest file isolation (reading the shared registry singleton), which could go blind if another test reset it under a non-isolated config. Fixed: buildLive() is now exported and the gate enumerates a fresh live registry, immune to global mutation.
- L1 (fixed): run-slot.mjs now returns ok:false when an export cannot clear its byte ceiling, failing loudly instead of leaning only on the committed-file CI gate.
- L2 (fixed): the single curly apostrophe in REVIEWS.md replaced with plain text.

## Outcome
13 of 13 slots shipped through the codex lane (rung 1), 0.539 MB AVIF (22% of the 2.4 MB ceiling), critique loop genuinely bit on briefing-bank + ending-recovery (2 rounds each, regenerated to PASS), HeroCrop calibrated, dark-readout slots dark, subpath build serves all 26 files base-aware. Full suite 1458, media 52, tsc + eslint clean. Visual sign-off deferred to the deploy browser pass.
