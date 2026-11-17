# Section 02: Art Pipeline

## Scope

This section runs the complete art production for SHALL WE PLAY A GAME?: request authoring, generation through the codex/ChatGPT lane at whatever rung discovery granted, export within byte budgets, the capped critique loop, and integration into the shell's art slot registry with HeroCrop metadata and preload priorities. It ends with the art portion of the CI validation suite green and media/REVIEWS.md recording every round.

## Background an implementer needs

The game shell (built in split 02 of the wider project, already implemented) exposes an art slot registry: an `ArtSlotId` union type, a source swap function, `HeroCrop` metadata riding hero entries (glass-rect and greeting-anchor fractions), and placeholder renderers that currently fill every slot. This section replaces placeholders with shipped images by swapping sources through that registry, never by editing shell render code.

Hard directives in force:

- All visuals come through codex/ChatGPT. No local image generation. The model is gpt-6-astra at xhigh effort, already configured in `~/.codex/config.toml`.
- The shipped site runs with zero model credentials; every asset bundles locally under `public/`.
- No em-dashes anywhere in the preamble, request prompts, README sections, or REVIEWS.md entries this section writes.
- Game media files are slot-named (for example `hero.avif`, `failsafe-wall.avif`). The client record-naming convention does not apply here; it is scoped to client-facing exports.

### Dependency: section-01-discovery-tools

Section 01 delivers, and this section consumes without reimplementing:

- The `media/` workspace with gitignore discipline (`media/src/` and audition material excluded; `public/` exports committed).
- The discovery probe and machine-readable `media/discovery.json` (rung per media class, probe timestamps, provenance verdict fields).
- The rung-2 request-file and intake-folder machinery (`media/requests/`, `media/intake/`), with the consolidated manual-paste file as the primary rung-2 path and AppleScript treated as expected-to-fail.
- The HeroCrop click-calibration and overlay tool under `media/tools/`.
- The slot-dimensions table derived from the split 02 reserved layout boxes (2x of each slot's reserved box), which drives both generation sizes and the CI dimension check.
- The contact-sheet builder (ImageMagick montage: labeled tiles, desktop and phone crops, live-copy markers drawn on).
- The CI validation suite skeleton in the node Vitest project, importing the same manifest module the shell consumes.

Discovery is re-probed at the start of this section because discovery results are per lane-consuming stage, not global. Read the image-class rung from `media/discovery.json` before authoring any requests.

## Tests first

Extend the CI suite skeleton from section 01. Add an art validation spec to the node Vitest project (same directory section 01 established for media validation specs; if it chose `tests/media/`, this file is `tests/media/art.spec.ts`). Write these before running the pipeline; they fail red until Stage D completes.

```ts
describe("art slot validation", () => {
  it.todo("every ArtSlotId resolves to a shipped file, or appears on the rung-3 placeholder list in media/discovery.json");
  it.todo("every shipped AVIF matches its slot-dimensions-table 2x target within tolerance");
  it.todo("per-slot byte ceilings hold: hero slots 300 KB each, all others 160 KB, AVIF only");
  it.todo("total AVIF wire weight across the 13 shipped slots stays under 2.4 MB; JPEG fallbacks excluded");
  it.todo("every slot ships a JPEG fallback alongside its AVIF");
});

describe("hero crop metadata", () => {
  it.todo("portrait-is-reframe: desktop and portrait hero metadata declare the same scene id");
  it.todo("HeroCrop fractions are in [0,1] and the computed rect passes the split 02 geometry tests at both crops");
});

describe("base-aware resolution", () => {
  it.todo("every registered slot URL resolves through BASE_URL under a subpath build");
});

describe("authoring guards", () => {
  it.todo("countdown-insert and failsafe-wall request files contain the dark-readout constraint text");
  it.todo("no em-dash appears in media/requests/, the preamble, or the README sections this split writes");
});

describe("review records", () => {
  it.todo("every asset name referenced in media/REVIEWS.md art rounds exists on disk");
  it.todo("if the locked-with-known-findings escape was invoked, the findings list is non-empty");
});
```

Notes on intent: the byte-ceiling tests read actual file sizes of committed AVIFs under `public/`; JPEG fallbacks exist for content negotiation but never count toward the 2.4 MB ceiling. The dimension test reads the slot-dimensions table exported by section 01 and compares against decoded image dimensions. The base-aware test runs against a build configured with a non-root base path and asserts each registry URL is constructed through `BASE_URL`, not hardcoded root paths. The dark-readout guard is a plain text scan of the two named request files. The REVIEWS.md link check parses asset names from round records and stats them.

## Stage B: generation

Gate: read `media/discovery.json`. Rung 1 means codex-direct file generation with the provenance check already enforced by the section 01 probe (real raster, nontrivial dimensions, critique-lane sanity verdict that the output is a photographic generation, not codex-improvised pixels). Rung 2 means the consolidated manual-paste file through ChatGPT.app, with reference-image attachment instructions included; rung 2 cannot pin the model tier, and the README must say so. Rung 3 means placeholders ship, Stage C is skipped entirely, the handoff bundle carries the critique prompt for a future human run, and the README states exactly which slots are placeholders.

Author one art-direction preamble file containing the requirements' art direction verbatim, plus the reference screenshot attached whenever the lane accepts images. The preamble is prepended to every request. The grain guidance lives here: ask for fine grain, not heavy, because noisy grain is AVIF-hostile and the byte budget is the quality guard.

Write one request file per surface under `media/requests/NN-slot.md`:

- hero (three candidate generations) plus the portrait companion
- rack, bezel, relay, runway, radar detail, bank operations
- failsafe wall, countdown insert, hero return
- ending-recovery, ending-containment, ending-failure

The countdown-insert and failsafe-wall requests must carry the dark-readout constraint text (the live overlay renders readouts over these images; the art must stay dark enough behind them). This same constraint rides the critique brief in Stage C.

Generated source files land under `media/src/<slot>/` (gitignored, never committed). Selects are exported with sharp (npm dev dependency) to AVIF primary plus JPEG fallback, sized to the slot-dimensions table targets (2x the reserved layout box), into `public/` where they commit. Per-slot ceilings: 300 KB per hero slot, 160 KB everything else, AVIF only, 2.4 MB total. Export scripts are small committed Node or Python files under `media/tools/`; no heredocs anywhere.

## Stage C: review loop

Skipped at rung 3. Otherwise:

1. Build a labeled contact sheet with the section 01 builder: desktop and phone crops, live-copy markers drawn where the shell renders text over art.
2. Run `codex exec -i contact-sheet.png` with the critique brief: strongest hero of the three candidates, weak or awkward crops, contemporary or implausible hardware for 1983, dark-readout compliance on the two constrained slots, requested edits by asset name.
3. Regenerate failures through Stage B. Repeat.

Hard cap: three rounds. If material findings remain after round three, invoke the locked-with-known-findings escape: lock the set anyway and record the remaining findings as a non-empty list in `media/REVIEWS.md`. Every round gets a record in REVIEWS.md referencing assets by name; these records feed the README's honest report section.

Additionally run the manual composite check from the checklist: composite the live countdown and failsafe overlays over the shipped art and confirm readability by eye.

## Stage D: integration

- Swap each art slot source through the registry. Decorative and informative text riding each slot is preserved or improved, never dropped.
- Select the winning hero from the critique. The portrait companion must be a reframe of the selected hero scene, same camera; its metadata declares the same scene id as the desktop hero (this is what the portrait-is-reframe test asserts). If the generated portrait came from a different scene, regenerate it as a reframe before integrating.
- Author `HeroCrop` glass-rect and greeting-anchor fractions with the section 01 click-calibration tool: click the corners, take the emitted fractions, confirm via the tool's overlay render of the computed rect at both desktop and portrait crops. Do not eyeball fractions in an editor; the tool exists so calibration is repeatable. The split 02 geometry tests verify the result.
- Set preload priorities on the registry entries (hero eager, below-fold and ending slots lazy, matching the shell's eager/lazy convention).
- Build the site under a subpath and confirm every asset serves base-aware through `BASE_URL`. The CI test covers the registry URLs; this step covers the built output by inspection.

## Completion criteria

- All art tests above pass, including dimension, budget, portrait-reframe, base-aware, dark-readout, and REVIEWS.md checks.
- `media/REVIEWS.md` contains one record per critique round (at most three), plus the findings list if the escape was used.
- The README honest report section covers the art lane: rung used (per `media/discovery.json`), request count, review rounds, changes made, final file names, and the rung-2 model-tier caveat if applicable.
- `media/src/` remains out of the tree; `public/` exports are committed with slot-derived names.
- No em-dash anywhere in the preamble, requests, REVIEWS.md entries, or README sections written here.

## Out of scope

Voice, effects, the room loop, the review reel, and all audio CI checks belong to section-03-audio-pipeline. The discovery probe, calibration tool, contact-sheet builder, dimensions table, and CI skeleton are section-01 deliverables; this section only consumes them.