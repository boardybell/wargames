<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-discovery-tools
section-02-art-pipeline
section-03-audio-pipeline
END_MANIFEST -->

# Implementation Sections Index: 07-art-audio-pipeline

Implements claude-plan.md revision 2 with the claude-plan-tdd.md checks.
Prerequisites: splits 01 to 06 implemented (art slots, cue manifest,
Joshua catalog frozen).

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-discovery-tools | - | 02, 03 | No |
| section-02-art-pipeline | 01 | - | Yes (with 03) |
| section-03-audio-pipeline | 01 | - | Yes (with 02) |

## Execution Order

1. section-01-discovery-tools
2. section-02-art-pipeline, section-03-audio-pipeline (parallel)

## Section Summaries

### section-01-discovery-tools
media/ workspace scaffold (gitignore discipline), the discovery probe
with rung-1 provenance checks and machine-readable media/discovery.json
(per media class, re-probed per stage), the rung-2 request-file and
intake-folder machinery with the consolidated manual-paste primary path,
the HeroCrop click-calibration and overlay tool, the slot-dimensions
table derived from split 02 reserved boxes, the contact-sheet builder,
and the CI validation suite skeleton (node project) with the checks from
the TDD plan.

### section-02-art-pipeline
The full art run at whatever rung discovery grants: preamble and
per-slot requests (dark-readout constraints on countdown-insert and
failsafe-wall), generation, sharp exports to AVIF plus JPEG within the
2.4 MB AVIF ceiling, the codex critique loop (three-round cap, honest
escape), slot integration with HeroCrop metadata via the calibration
tool (portrait as a reframe of the selected hero), preload priorities,
base-aware resolution checks green, media/REVIEWS.md records.

### section-03-audio-pipeline
The voice audition (two chains, film register wins, candidates kept
out-of-repo), the full clip render from the frozen catalog (opus
primary, AAC fallback), transcript-equality enforcement, effects recipe
tuning and the bounced room loop with the deterministic seam check, cue
manifest source swaps and gain adjustments, the review reel, the
conditional codex audio critique, the manual listening checklist run and
recorded, and the audio portions of the CI suite green.
