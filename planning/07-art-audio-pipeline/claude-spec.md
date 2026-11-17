# Complete Specification: 07-art-audio-pipeline

Synthesis of spec.md, claude-research.md, and claude-interview.md
(self-answered under Bond's autonomy directive; hard directives: all
visuals through the chatgpt/codex lane, no local image generation,
highest model tier at full effort, film-WOPR or early-80s synthesis
voice). 2026-11-17.

## What this is

Every generated visual and audio file in the game, produced through the
codex/ChatGPT lane with the escalation ladder from the interview, bundled
locally so the shipped site needs zero model credentials. Integrates into
the shell's art slot registry and cue manifest without touching call
sites.

## Lanes

- Discovery first (empirical): codex exec with workspace-write asked to
  generate and save a test image; outcome determines the rung. Rungs:
  (1) codex emits files directly; (2) semi-automated ChatGPT.app handoff
  with numbered prompt files, a watched intake folder, AppleScript
  attempted, one consolidated manual-paste request as backstop; (3) the
  requirements' handoff bundle, placeholders ship, README states it
  plainly. Local image generation never used.
- Art direction: the requirements' single project-wide direction verbatim
  (photoreal 1983 facility, practical film set, hammered gray-olive,
  amber lamp pools, blue phosphor spill, unlettered glass, no watermarks,
  readouts left dark where the game draws live numbers); the reference
  screenshot rides along when the lane accepts images.
- Generation set per the surface table: three hero compositions plus a
  portrait companion, rack and bezel, relay scene, runway and radar, bank
  operations, failsafe wall, countdown insert, hero return, three ending
  stills. 2x display size; AVIF plus JPEG fallback; hero under 350 KB,
  others under 200 KB, total art budget 2.5 MB; HeroCrop glass-rect
  metadata authored per final hero image.
- Art review: ImageMagick contact sheet with desktop and phone crops and
  live-copy markers; codex exec -i critique (strongest hero, weak images,
  implausible hardware, edits by asset name); regenerate failures; lock;
  rounds recorded in the README.
- Voice: audition two chains (macOS say classic voice; espeak-ng formant)
  on two reads of SHALL WE PLAY A GAME? plus one failsafe line, identical
  processing (flat pitch, band-pass 300 to 3000 Hz, light bitcrush,
  normalize); pick the chain nearest the film register; render the full
  set from the split 06 Joshua catalog keyed by voiceClipId; opus/m4a
  exports; AI-generated-voice label already in settings; codex critiques
  the written direction and cue list; audio attachments sent only if the
  lane accepts them, otherwise local-ears listening recorded honestly.
- Effects and ambience: the shell's synth recipes cover runtime; this
  split tunes the final recipe parameters against the requirements cue
  table and renders bounce-down files only where a file beats a recipe
  (room loop with seamless join); cue manifest updated (sources swapped,
  preload set, transcripts verified).

## Acceptance

- CI validates: every ArtSlotId resolves to a shipped image (or the
  documented placeholder at rung 3), dimensions and byte budgets, every
  cue id resolves with transcript, voice clips exist for every
  voiceClipId in the catalog (or the rung-3 report lists them), audio
  memory budget respected.
- Integration is manifest-and-registry only: no shell or mission call
  sites change.
- README reports: the rung reached, generation requests, critique rounds
  and material changes, the listening checks actually run, art file
  names. Honest reporting is a hard requirement.
