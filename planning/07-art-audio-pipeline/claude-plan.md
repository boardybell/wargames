# Implementation Plan: 07-art-audio-pipeline

Media production for SHALL WE PLAY A GAME? through the codex/ChatGPT lane.
Self-contained prose; companion spec in this directory. Unlike code
splits, the deliverables are files plus two review loops; the plan is
organized as a pipeline with CI validation at the end.

## 1. Context

The shell (split 02) exposes an art slot registry (ArtSlotId union,
source swap function, HeroCrop metadata riding hero entries, placeholder
renderers) and a cue manifest (CueDefinition with synth or file sources,
preload eager/lazy, mandatory transcripts). The finale (split 06) exports
the Joshua line catalog with voiceClipId per line. Bond's directives: all
visuals via codex/ChatGPT (no local generation), gpt-6-astra at xhigh
(already configured in ~/.codex/config.toml), voice like the film WOPR or
authentic early-80s synthesis. The site must run with zero model
credentials, so everything bundles locally.

## 2. Pipeline stages

### Stage A: lane discovery (first, empirical, logged)

Run codex exec --sandbox workspace-write -C <media workspace> asking it
to generate a 1983 control-room test image and save it as a file. Three
outcomes: files appear (rung 1: codex-direct); codex reports no image
tool (fall to rung 2); errors (retry once, then rung 2). Rung 2:
semi-automated ChatGPT.app handoff: this split writes
media/requests/NN-slot.md prompt files and watches media/intake/;
AppleScript automation of the app attempted first; the backstop is one
consolidated request file so a human paste session is minutes. Rung 3
(only if both fail): the requirements' handoff bundle ships with
placeholders and the README says exactly that. The discovery result and
rung are recorded in media/DISCOVERY.md.

### Stage B: art generation

One art-direction preamble file (the requirements direction verbatim
plus the reference screenshot when the lane accepts images) prepended to
every request. Requests per the surface table: hero x3 plus portrait,
rack, bezel, relay, runway, radar detail, bank operations, failsafe
wall, countdown insert, hero return, ending-recovery,
ending-containment, ending-failure. Source files organized under
media/src/<slot>/; selects exported via sharp to AVIF plus JPEG at
display-doubled sizes under the byte budgets (hero 350 KB, others
200 KB, total 2.5 MB).

### Stage C: art review loop

ImageMagick montage contact sheets (labeled, desktop and phone crops,
live-copy markers drawn on); codex exec -i contact-sheet.png with the
critique brief from the requirements (strongest hero, weak or awkward
crops, contemporary or implausible hardware, edits by asset name);
regenerate failures through Stage B; repeat until no material findings;
lock the set; record rounds in media/REVIEWS.md (feeds the README).

### Stage D: integration

Swap art slot sources through the registry (decorative/informative text
preserved or improved), author HeroCrop glass-rect and greeting-anchor
fractions per final hero image (measured in an image editor, verified by
the split 02 geometry tests), set preload priorities, and confirm the
built site under the subpath serves every asset base-aware.

### Stage E: voice

Audition: render SHALL WE PLAY A GAME? through chain 1 (macOS say with a
classic voice, flattened pitch) and chain 2 (espeak-ng formant), both
post-processed identically (band-pass 300 to 3000 Hz, light bitcrush,
normalize, trim) via ffmpeg; pick the closer to the film register (my
call, documented with the candidate files kept). Render the full clip
set from the Joshua catalog by voiceClipId; exact on-screen dialogue
spoken; phonetic hints allowed in the synthesis input, never in display
text; exports opus (m4a fallback) under media/voice/; cue manifest voice
entries swap from placeholder to file with preload lazy.

### Stage F: effects and ambience

Tune the shell's synth recipes against the requirements cue table (key
tap, confirm blip, invalid tone, delivery pip, channel-down fall, scope
tick, two-tone forecast, hold/release relay, confidence two-note, final
relay pulse, 30 and 10 second warnings, comparison sweep, three ending
cues with the sparse motif, activation sequence, room hum loop). The
room loop renders as a bounced file with a seamless join (recipes are
fine for one-shots; loops benefit from a rendered file); everything else
stays synth-recipe (zero bytes). Verify ducking room under the voice
clips by ear and in the review reel.

### Stage G: audio review

Build a short reel (activation, one mission cue each, failsafe warnings,
endings, a voice line over ambience) with ffmpeg; if the codex lane
accepts audio attachments, send for critique against the brief; either
way run the manual listening checklist (desktop and phone levels, clarity
over ambience, distinguishable tones, clean loop joins, comfortable
peaks) and record results in media/REVIEWS.md.

### Stage H: CI validation

A vitest suite (node) validates: every ArtSlotId resolves to a shipped
file with correct dimensions and budget (or the rung-3 placeholder list
matches DISCOVERY.md), total art budget; every cue id resolves, formats
valid, transcripts present; every catalog voiceClipId has a clip (or is
on the rung-3 list); audio memory budget. The README gains the honest
report section (rung, requests, rounds, changes, listening checks, file
names).

## 3. Tooling notes

brew-available: imagemagick, ffmpeg, espeak-ng (install if absent),
sharp via npm dev dependency (or squoosh-cli). All media work in a
media/ workspace outside src/, with only exported assets copied into
public/. No heredocs; scripts are small Python or Node files committed
under media/tools/.

## 4. Risks

The lane discovery is the schedule fork: rung 1 is hours, rung 2 is a
day with pauses, rung 3 ships placeholders honestly. Voice character is
subjective: both audition chains kept on disk so the choice is
revisitable in minutes. Byte budgets are the quality guard against
AVIF-hostile noisy grain; grain tuning happens at generation (ask for
fine grain, not heavy).

## 5. Review integrations (revision 2, 2026-11-17)

From reviews/iteration-1-opus.md; dispositions in
claude-integration-notes.md. Binding deltas over the stages above:

1. Budget recomputed against the 13 shipped slots: AVIF primary only
   counts toward a 2.4 MB wire ceiling (hero slots 300 KB each,
   others 160 KB); JPEG fallbacks excluded and served by content
   negotiation; a slot-dimensions table (2x of each slot's split 02
   reserved layout box) drives generation sizes and the CI dimension
   check.
2. Discovery hardens: rung 1 requires a provenance check (real
   raster, nontrivial dimensions, critique-lane sanity pass that it
   is a photographic generation, not codex-improvised pixels);
   discovery re-probes per lane-consuming stage; results live in
   machine-readable media/discovery.json; the rung is reported per
   media class. Rung 2 treats AppleScript as expected-to-fail and
   makes the consolidated manual-paste file the primary path, with
   reference-image attachment instructions; rung 2 cannot pin the
   model tier and the report says so.
3. Dark-readout constraint rides every countdown-insert and
   failsafe-wall request and the critique brief; the manual
   checklist composites the live overlay over the art.
4. The review loop caps at three rounds with an honest
   locked-with-known-findings escape; rung 3 skips Stage C and the
   handoff bundle carries the critique prompt.
5. HeroCrop calibration is tooled: media/tools click-calibration
   emits fractions from corner clicks and renders the computed rect
   back over the image for confirmation at both crops; the portrait
   companion is a reframe of the selected hero scene (same camera).
6. Voice: the film register wins when the poles conflict; espeak-ng
   formant is favored on ties for period authenticity. Catalog
   freeze precedes the render; any catalog change re-opens Stage E.
   Formats: opus primary, AAC fallback (not bare m4a); decode tried
   both ways; WebKit decode verified in the split 08 manual pass.
7. Loop join gets a deterministic sample-continuity check beside the
   ear pass; Stage F adjusts manifest gain values only, never shell
   ducking code.
8. CI additions: transcript strict-equals catalog display text;
   dark-readout constraint presence; assets resolve through BASE_URL
   at a subpath; the dimension table; discovery.json parsing; the
   audio memory budget measured apart from shipped bytes. The suite
   joins the node Vitest project and imports the same manifest
   module the shell consumes.
9. media/src sources and audition candidates are gitignored; exports
   in public/ commit. Game media uses slot-named files (the client
   record-naming rule is scoped to client-facing exports). The
   no-em-dash rule covers the preamble, prompts, README, and
   transcripts.
