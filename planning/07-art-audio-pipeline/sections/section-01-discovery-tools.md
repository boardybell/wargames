# Section 01: Discovery, Tools, and the Validation Skeleton

## Scope

This section builds the ground the media split stands on for SHALL WE PLAY A
GAME? (a WarGames-inspired browser game, React 18 + Vite + TypeScript, static
build). No art or audio ships here. What ships is everything the two asset
pipelines need before they start:

1. The `media/` workspace scaffold with its gitignore discipline.
2. The lane discovery probe: an empirical test of whether the codex CLI can
   emit image files directly, hardened with provenance checks, producing a
   machine-readable `media/discovery.json` plus a prose `media/DISCOVERY.md`,
   re-runnable per lane-consuming stage.
3. The rung-2 machinery: numbered request files, a watched intake folder, an
   AppleScript attempt that is expected to fail, and the consolidated
   manual-paste request file as the primary fallback path.
4. The HeroCrop click-calibration and overlay tool.
5. The slot-dimensions table: one declared 2x generation target per art slot,
   derived from the split 02 reserved layout boxes, consumed by generation
   and by CI.
6. The ImageMagick contact-sheet builder.
7. The CI validation suite skeleton in the node Vitest project, containing
   every check from the TDD plan, gated so it passes before assets exist and
   bites as sections 02 and 03 land them.

Hard rules in force: all visuals come through the codex/ChatGPT lane, never
local generation (Darkroom and ComfyUI are explicitly excluded). gpt-6-astra
at xhigh is already configured in `~/.codex/config.toml`. The shipped site
needs zero model credentials. No em-dashes anywhere, including prompts,
scripts, JSON strings, and this split's docs. No heredocs in any script; file
writes happen through small committed Python or Node files.

## Background

The shell (split 02) exposes the art slot registry at `src/app/art/`
(`ArtSlotId` union of thirteen slots, a source swap function, `HeroCrop`
metadata riding the hero entries, graded CSS placeholders) and the cue
manifest at `src/app/audio/manifest.ts` (`CueDefinition` with synth or file
sources, eager/lazy preload, mandatory transcripts). The finale (split 06)
exports the Joshua line catalog keyed by `voiceClipId`. The thirteen slots:

    'hero-desktop' | 'hero-portrait' | 'menu-rack' | 'bezel-texture' |
    'briefing-outlook' | 'briefing-flights' | 'briefing-bank' |
    'failsafe-wall' | 'countdown-insert' | 'hero-return' |
    'ending-recovery' | 'ending-containment' | 'ending-failure'

HeroCrop, defined in `src/app/art/types.ts`:

    interface HeroCrop {
      srcKey: ArtSlotId            // hero-desktop or hero-portrait
      glass: { x: number, y: number, w: number, h: number }  // fractions of
                                   // natural image size
      greetingAnchor: { x: number, y: number }               // fraction point
    }

Split 02 also ships `src/app/hero/glassRect.ts` with the pure function
`computeGlassRect(box, natural, position, crop)` that maps fraction-space
crops to on-screen pixels under object-fit cover. The calibration tool reuses
this math rather than reimplementing it. Image URLs always pass through the
scaffold's `urlFor(path)` helper so they are base-aware under a subpath
deploy.

The escalation ladder (the schedule fork for everything downstream): rung 1,
codex exec emits image files directly; rung 2, semi-automated ChatGPT.app
handoff; rung 3, the handoff bundle ships with placeholders and the README
says exactly that. Discovery decides the rung empirically, per media class,
and records it where machines can read it.

## Dependencies

Requires splits 01 through 06 implemented: the art slot registry and its
swap contract, the cue manifest module, the Joshua catalog with voiceClipId
per line, and `computeGlassRect`. This section blocks section-02-art-pipeline
and section-03-audio-pipeline; they run in parallel once this lands.

## Files

Create:

    media/DISCOVERY.md                    prose record of probes and rungs
    media/discovery.json                  machine-readable discovery state
    media/REVIEWS.md                      review round records (seeded empty)
    media/requests/                       per-slot prompt files (rung 2)
    media/intake/                         watched drop folder (rung 2)
    media/src/                            generation sources (gitignored)
    media/tools/probe-discovery.mjs       the discovery probe
    media/tools/provenance.mjs            rung-1 provenance checklist
    media/tools/request-writer.mjs        request files + consolidated paste file
    media/tools/intake-watch.mjs          intake folder watcher
    media/tools/chatgpt-app.applescript   expected-to-fail automation attempt
    media/tools/calibrate.html            click-calibration page
    media/tools/calibrate-core.ts         pure calibration math (testable)
    media/tools/contact-sheet.mjs         ImageMagick montage builder
    media/slot-dimensions.json            2x target per ArtSlotId
    test/media/discovery.test.ts
    test/media/dimensions.test.ts
    test/media/herocrop-tool.test.ts
    test/media/base-url.test.ts
    test/media/dark-readout.test.ts
    test/media/audio-manifest.test.ts
    test/media/catalog-parity.test.ts
    test/media/loop-join.test.ts
    test/media/memory-budget.test.ts
    test/media/reviews.test.ts
    test/media/hygiene.test.ts

Modify:

    .gitignore                            media/src/, media/intake/, audition
                                          candidates excluded; public/ exports
                                          stay committed

The `test/media/` files join the existing node Vitest project (not jsdom) so
they run in the same `npm test` pass as the engine tests and import the same
registry and manifest modules the shell consumes.

## Tests first

Write these as stubs with descriptive names before the tools. They divide
into checks that assert for real at the end of this section and checks that
are rung-gated skeletons which sections 02 and 03 turn live.

### Discovery (`discovery.test.ts`), live now

- `media/discovery.json` exists, parses, and matches the schema: a probe
  array with stage, media class, rung, ISO timestamp, and provenance verdict
  fields; a rung-by-class map; exception lists. CI fails on a prose-only
  discovery record (DISCOVERY.md alone never satisfies this test).
- Every media class (`image-generate`, `image-critique`, `audio-critique`)
  has an entry; a rung of 1 requires a complete provenance block (format,
  width, height, sanity verdict), and the test rejects a rung-1 record with
  any provenance field missing or failed.
- The rung-1 provenance assertions exist as an enforced checklist in
  `provenance.mjs`, not prose: unit-test the checklist function against a
  fabricated good record and against records that fail each check (not a
  raster, dimensions trivial, sanity verdict absent).

### Calibration tool (`herocrop-tool.test.ts`), live now

- Clicking known corners on a synthetic test image (fixed natural size,
  programmatic click coordinates fed to `calibrate-core.ts`) emits the
  expected HeroCrop fractions exactly.
- The overlay renderer places the computed rect at the right pixels for both
  a desktop box and a portrait box, asserted through `computeGlassRect` from
  `src/app/hero/glassRect.ts`. Pure math, no DOM.

### Slot dimensions (`dimensions.test.ts`), table live now, assets gated

- Every member of the `ArtSlotId` union has exactly one entry in
  `media/slot-dimensions.json` with a 2x pixel target and tolerance; no
  stray entries for unknown slots.
- For every slot not on the discovery exception list: the shipped AVIF under
  `public/` exists, matches its declared target within tolerance, and sits
  under its byte ceiling (hero slots 300 KB each, all others 160 KB, AVIF
  only). Total shipped AVIF bytes stay under the 2.4 MB wire ceiling. JPEG
  fallbacks are excluded from every byte count.

### Base-aware resolution (`base-url.test.ts`), gated

- Every registered slot whose source is an image resolves through
  `urlFor`/BASE_URL under a simulated subpath build; no raw absolute paths.
  Placeholder-sourced slots pass vacuously.

### Dark-readout guard (`dark-readout.test.ts`), gated

- The request files for `countdown-insert` and `failsafe-wall` under
  `media/requests/` contain the dark-readout constraint text (readouts left
  dark wherever the game draws live numbers). An authoring guard; the visual
  composite check stays on the manual checklist.

### Audio skeleton (`audio-manifest.test.ts`, `catalog-parity.test.ts`, `loop-join.test.ts`, `memory-budget.test.ts`), gated

- Manifest: every cue id resolves; file-sourced voice cues carry opus
  primary and AAC fallback; transcripts present; for every voiceClipId the
  transcript strict-equals the catalog display text (the phonetic-leak
  guard); preload fields correct (effects eager, voice lazy).
- Parity: every catalog voiceClipId has a rendered clip or appears on the
  rung-gated exception list in discovery.json.
- Loop join: sample-level continuity at the room-loop seam within a declared
  tolerance, decoding the shipped file deterministically.
- Memory: decoded-size estimate across eager cues under the budget; lazy
  voice clips counted at worst case singly; measured apart from shipped
  bytes.

### Reviews and hygiene (`reviews.test.ts`, `hygiene.test.ts`), live now

- Every round record in `media/REVIEWS.md` references asset names that exist
  on disk (link check); the three-round cap is recorded per loop; if the
  locked-with-known-findings escape is invoked, its findings list is
  non-empty. All vacuously true over the seeded empty file.
- No em-dash scan over `media/requests/`, the art-direction preamble,
  transcripts, and the README sections this split writes.
- Gitignore test: `media/src/` and audition candidate paths are excluded by
  the committed `.gitignore` rules; exported assets under `public/` are not.

### Gating mechanism

The seeded `media/discovery.json` ships with status `pending` per media
class and every slot and voiceClipId on the exception lists. Gated tests
treat an excepted item as a recorded skip and fail on any item neither
shipped nor excepted. Sections 02 and 03 shrink the lists as assets land;
an empty list means every check bites. This is how one `npm test` stays
green across the whole split without ever lying.

## Implementation

### Workspace scaffold

All media work happens under `media/`, outside `src/`; only exported assets
copy into `public/`. Gitignore `media/src/`, `media/intake/`, and the voice
audition candidates directory (section 03 will use `media/audition/`; ignore
it now). Game media uses slot-named files; the client record-naming rule is
scoped to client-facing exports and does not apply here. Seed `REVIEWS.md`
and `DISCOVERY.md` with headers only.

### Discovery probe (`probe-discovery.mjs`)

Runs `codex exec --sandbox workspace-write -C media/` asking the model to
generate a 1983 control-room test image and save it to a named path. Three
outcomes: a file appears (candidate rung 1), codex reports no image tool
(rung 2), an error (retry once, then rung 2). A file alone does not grant
rung 1. The provenance checklist in `provenance.mjs` must pass first: the
file decodes as a real raster (sharp or ImageMagick identify), dimensions
are nontrivial (shorter side at a declared minimum), and a critique-lane
sanity pass (`codex exec -i <file>` asking whether this is a photographic
generation or improvised pixels) returns a pass verdict. Only then is rung 1
written.

The probe takes a `--class` flag (`image-generate`, `image-critique`,
`audio-critique`) because the rung can differ per class: a lane that
generates images may still refuse audio attachments. Each lane-consuming
stage re-probes its class before relying on it; the probe appends to the
probe history in `discovery.json`, updates the rung-by-class map, and mirrors
a human-readable summary into `DISCOVERY.md`. The audio-critique probe
attaches a trivial generated tone file and records whether the lane accepted
it.

### discovery.json shape

Keep it boring and strict, validated by the schema test:

    {
      "probes": [{ "stage": "A", "mediaClass": "image-generate",
                   "rung": 1, "timestamp": "...",
                   "provenance": { "format": "png", "width": 1536,
                                   "height": 1024, "sanityVerdict": "pass" },
                   "notes": "..." }],
      "rungByClass": { "image-generate": "pending",
                       "image-critique": "pending",
                       "audio-critique": "pending" },
      "modelTierPinned": true,
      "exceptions": { "placeholderSlots": [ ...all 13 ids... ],
                      "missingVoiceClips": [ ...all catalog ids... ],
                      "roomLoopPending": true }
    }

When a rung-2 result is written, `modelTierPinned` goes false and the probe
records that rung 2 cannot pin the model tier; the README report will carry
that sentence verbatim.

### Rung-2 machinery

`request-writer.mjs` takes slot definitions (name, prompt body, dimensions
from the slot table) and writes numbered `media/requests/NN-slot.md` files,
each self-contained with the art-direction preamble reference and explicit
instructions for attaching the reference screenshot
(`planning/reference/crt-reference.jpg`). It always also writes the
consolidated `media/requests/ALL-REQUESTS.md`: every prompt in paste order
with per-request attachment notes and the filename convention the intake
watcher expects (`NN-slot.ext`). The consolidated file is the primary rung-2
path; a human paste session should be minutes, not an afternoon.

`chatgpt-app.applescript` attempts to drive ChatGPT.app via osascript. Treat
it as expected to fail: wrap it in a timeout, log the failure mode to
DISCOVERY.md, and fall through to the consolidated file without ceremony.
Do not sink time into making it robust.

`intake-watch.mjs` watches `media/intake/` (fs.watch with a debounce is
enough), matches arrivals to request numbers by the filename convention,
moves matches into `media/src/<slot>/`, and prints a running checklist of
outstanding requests. Section 02 drives it; this section proves it moves a
planted file correctly (a small live test or a documented manual run noted
in DISCOVERY.md is acceptable; the watcher is a convenience, not a
correctness surface).

### Slot-dimensions table (`media/slot-dimensions.json`)

One entry per ArtSlotId: the 2x pixel target derived from the slot's split
02 reserved layout box (the registry's aspect ratio applied to the slot's
rendered box at the reference desktop viewport, portrait slots at the phone
viewport), plus a tolerance. Measure the rendered boxes once, record the
derivation as a comment field per entry so the numbers are auditable. This
table is the single source for generation sizes in section 02 and for the
CI dimension check; neither hardcodes pixels anywhere else.

### Calibration tool

`calibrate.html` is a local page, never shipped: load a hero image, click
two corners for the glass rect and one point for the greeting anchor, and it
prints the HeroCrop JSON (fractions of natural size) ready to paste into the
registry entry. It then renders the computed rect back over the image at
simulated desktop and portrait boxes for visual confirmation, using the same
`computeGlassRect` math as the shell. All arithmetic lives in
`calibrate-core.ts` (pixel clicks plus natural size in, HeroCrop fractions
out; fractions plus box in, overlay pixels out) so the node tests cover it
without a browser. The page is a thin event layer over the core.

### Contact-sheet builder (`contact-sheet.mjs`)

Wraps ImageMagick montage: given a set of candidate images, emits a labeled
contact sheet with each asset name under its tile, desktop and phone crop
renderings for the hero candidates, and live-copy markers drawn on (rect
annotations showing where the game draws live text and readouts, sourced
from HeroCrop metadata and a small per-slot overlay-zone JSON kept beside
the tool). Output lands in `media/review/` for Stage C. Section 02 owns the
critique loop; this section makes the sheet generation a one-command affair.

### Validation suite skeleton

All eleven test files land now with the gating described above. The suite
imports `src/app/art/registry.ts`, `src/app/art/types.ts`,
`src/app/audio/manifest.ts`, and the split 06 catalog module directly, so a
drift between shipped assets and the modules the shell actually consumes is
structurally impossible to miss. Byte and dimension checks read the real
files under `public/` with sharp or image-size; audio checks decode with
ffmpeg or a node decoder, implementer's choice, as long as the loop-join
check is deterministic.

## Done when

`npm test` runs the new `test/media/` suite green alongside the engine and
shell tests: discovery schema, provenance checklist, calibration math,
reviews link check, em-dash scan, and gitignore checks assert for real;
dimension, base-url, dark-readout, and all audio checks pass through the
seeded exception lists and are proven to fail when an exception is removed
without a shipped asset (assert this once with a temporary fixture). The
discovery probe has been run at least once for `image-generate`, its outcome
and rung recorded in both `discovery.json` and `DISCOVERY.md`, provenance
block included if rung 1. The rung-2 request writer, intake watcher,
consolidated paste file, calibration page, slot-dimensions table, and
contact-sheet builder all exist and run. Sections 02 and 03 can start in
parallel the moment this closes.