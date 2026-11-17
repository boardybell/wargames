# Spec: 07-art-audio-pipeline

Context: ../requirements.md sections "Generate original artwork with ChatGPT",
"Use ChatGPT to review the artwork", "Generate and test original audio", and "Film
and production references"; ../decisions.md; ../deep_project_interview.md;
../reference/crt-reference.jpg.

## Purpose

Every generated visual and every audio file in the game, produced through the
ChatGPT/codex lane and bundled locally so the shipped site needs zero model
credentials. Bond's directives: all visuals through ChatGPT/codex, no local
generation (Darkroom/ComfyUI explicitly excluded), highest available model tier at
full effort for every codex invocation.

## In scope

1. Lane discovery first. Establish what the installed tooling can actually emit as
   files: codex-cli 0.155.1 (authed through ChatGPT.app, ~/.local/bin/codex) image
   generation or tool support, `codex exec` non-interactive use, vision input for
   critique, and if codex cannot generate images, a scripted or guided handoff
   through the local ChatGPT.app. Deep-plan must resolve the concrete mechanism and
   its automation level before art tasks schedule. If no lane can emit image or voice
   files, ship the playable site plus the prompt-specified handoff bundle (generation
   requests, contact sheet, paste-ready critique prompt) and state plainly which
   review actually ran.
2. Art direction. One project-wide direction: original photoreal 1983 Cold War
   computing facility shot like a practical film set; curved CRT, smoked glass, worn
   keycaps, vented rack doors, heavy cabling, pools of amber, soft grain, blue
   phosphor spilling onto surfaces; WOPR as old tabulating bulk in military cabinet
   furniture, hammered gray-olive, deep-black lamp bank with occasional dim off-color
   lamps, flat fluorescent readout left dark wherever the game draws live numbers;
   unlettered glass, no watermarks or brand marks; all readable copy stays HTML. The
   reference screenshot rides along in requests when the lane accepts images.
3. Generation set per the surface table: hero x3 compositions plus a portrait
   companion, menu rack and bezel texture, Outlook relay and dropping indicators,
   night runway and radar detail, after-hours bank operations, failsafe rack wall and
   countdown insert and hero-return shot, distinct debrief and ending stills.
   Organized sources, efficient sized web exports, slot delivery into 02's art
   interfaces, hero priority on first load, deferred noncritical art, per-mission
   preloads, accessible text equivalents.
4. Art review. Labeled contact sheet with desktop and phone crops and live-copy
   markers to the codex vision lane: pick the strongest hero, flag weak images,
   awkward crops, contemporary or implausible hardware, request edits by asset name.
   Regenerate failures before locking the set.
5. Joshua's voice. Target the film WOPR register; acceptable fallback is authentic
   early-1980s computer speech synthesis character (formant-synthesis vibe), never a
   modern neural read. Narrow-band speaker processing, even word weight, small clause
   breaks, minimal pitch movement, phone-speaker intelligibility. Audition two reads
   of SHALL WE PLAY A GAME? plus one failsafe line before producing the set. Full
   clip list from 06's line catalog including greeting and question, first
   discrepancy, deadline warning, repeated-source recognition, three ending
   readbacks. Exact on-screen dialogue recorded; phonetic hints never change player-
   visible text. Labeled AI-generated voice in settings.
6. Effects and ambience synthesized locally (oscillators, filtered noise, short
   envelopes) per the cue table: room loop with seamless join, activation switch and
   relay and CRT hum rise, key tap, confirm blip, neutral invalid tone, delivery pip,
   channel-down falling tone, scope tick, two-tone forecast change, hold/release
   relay, confidence two-note, final-phase pulse, 30- and 10-second warnings,
   comparison sweep, three ending cues with a sparse original motif leaving room for
   the last spoken line. Compressed bundled formats, base-aware URLs, cue manifest
   (event, file, gain, transcript).
7. Audio review in the running production build: hero transition, each mission's
   distinguishing cue, failsafe warnings, endings, desktop and phone levels where
   possible; speech clarity over ambience, tone distinguishability, clean loop
   joins, comfortable peaks. If the lane accepts audio, a codex critique of a short
   reel against the brief, then revisions. Verify muted startup, mobile activation,
   separate controls, subpath loading. Report the listening checks actually run.

## Out of scope

The audio engine itself (02), screenshot-based website review (08), any local image
model, any cloud TTS (Alfred ElevenLabs rule stands; this is not Alfred, but local
synthesis is the chosen lane).

## Provides

Final art files in 02's slots, audio bundle plus cue manifest, art source tree,
review records for the README.

## Needs

02's slot and manifest interfaces; 06's line catalog; sanitized screenshots only as
art inputs per the prompt.

## Decisions and acceptance anchors

Highest codex model tier, full effort, fastest speed. Generation and critique are
part of the build, not an afterthought. Honest reporting of which lane ran. No
em-dashes anywhere, including image briefs and transcripts.
