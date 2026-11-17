# Integration Notes: Opus review of 07-art-audio-pipeline plan

All findings integrated; the plan gains a Review Integrations section
(revision 2). Decisions:

- Budget recomputed against the 13 SHIPPED slots, AVIF primary only
  counting toward the wire budget (JPEG fallbacks excluded and stated,
  served by content negotiation): hero-desktop and hero-portrait 300 KB
  each, the 11 other slots 160 KB each, total ceiling 2.4 MB. Dimension
  table: every slot generates at 2x of its split 02 reserved layout box,
  declared in a slots-dimensions table the CI reads.
- Rung 1 provenance check: the discovery probe asserts the emitted file
  is a real raster image of nontrivial dimensions and passes a quick
  critique-lane sanity check that it is a photographic generation, not
  codex-improvised pixels (which would be a local-generation violation in
  disguise).
- Rung 2: AppleScript treated as expected-to-fail (TCC history);
  the consolidated manual-paste request file is the PRIMARY rung-2 path,
  with per-request reference-image attachment instructions included.
  Rung 2 cannot pin the model tier; the honest report says so.
- Discovery is re-probed per lane-consuming stage (art-gen, art-review,
  audio-review) and recorded in media/discovery.json (machine-readable;
  the README renders from it). Rung is reported PER MEDIA CLASS.
- Dark-readout constraint carried into the per-slot requests
  (countdown-insert, failsafe-wall) and the critique brief as a named
  failure mode; the manual checklist includes a readout-region darkness
  eyeball with the live overlay composited.
- Review loop capped at three rounds with an honest locked-with-known-
  findings escape; rung 3 skips Stage C entirely (handoff bundle carries
  the critique prompt).
- HeroCrop: a media/tools click-calibration tool emits the fractions from
  corner clicks on the exported image and renders the computed glass rect
  back onto the hero as an overlay for eyeball confirmation at both
  crops; hand-eyeballing in an editor is out. The portrait companion is a
  REFRAME of the selected hero scene (same camera) so one live terminal
  aligns to both.
- Voice: the film register wins when the poles conflict (Bond's directive
  orders film first, early-80s synthesis as the fallback), with the
  authenticity consideration named: espeak-ng formant is the genuinely
  period-plausible chain and is favored on ties. Catalog freeze precedes
  the voice render; a catalog change after render re-opens Stage E (the
  reciprocal of split 06's lock).
- Audio formats: opus primary with AAC (not bare m4a) fallback; the
  shell's decode path tries both; cross-browser decode asserted in the
  split 08 WebKit manual pass.
- Loop join gets a deterministic check (sample-level continuity at the
  seam) beside the by-ear pass. Stage F adjusts cue GAIN values in the
  manifest, never shell ducking code.
- CI additions: transcript strict-equals catalog display text (phonetic
  leak guard); dark-readout presence of the constraint in request files;
  assets resolve through BASE_URL at a subpath (not just file-exists);
  the dimension table check; discovery.json parsing; the audio memory
  budget distinct from shipped bytes (recipes are not free at runtime).
  The suite joins the node Vitest project and imports the same manifest
  module the shell consumes.
- Housekeeping: media/src sources and audition candidates are gitignored
  (exports in public/ are committed); game media uses slot-named files
  (the client-record naming rule is scoped to client-facing exports); the
  no-em-dash rule applies to the preamble, prompts, README, and
  transcripts.
