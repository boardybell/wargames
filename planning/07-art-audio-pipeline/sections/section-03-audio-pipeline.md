# Section 03: Audio Pipeline

Voice, effects, ambience, audio review, and the audio half of the CI
validation suite for SHALL WE PLAY A GAME? This section implements
Stages E (voice), F (effects and ambience), and G (audio review) from
the plan, plus the audio portions of the Stage H CI suite. It runs in
parallel with section-02-art-pipeline and shares nothing with it except
the media/ workspace, discovery.json, and the CI skeleton.

## Background You Need

The game shell (built in an earlier split) exposes a cue manifest. Each
cue is a CueDefinition with either a synth source (parametric recipe,
zero shipped bytes) or a file source (path under public/), a preload
field (eager or lazy), and a mandatory transcript. The finale split
exports the Joshua line catalog: every spoken line has a voiceClipId
and exact on-screen display text. The catalog is frozen before any
rendering here; any catalog change re-opens Stage E from the top.

Bond's directives that bind this section: voice must sound like the
film WOPR or authentic early-80s speech synthesis; when those two poles
conflict, the film register wins; on a tie, espeak-ng formant synthesis
is favored for period authenticity. The site runs with zero model
credentials, so every audio asset bundles locally. The no-em-dash rule
covers transcripts and every README section this work touches.

Formats: opus is primary, AAC is the fallback (a real AAC stream, not a
bare m4a container assumption). Decode is tried both ways; WebKit
decode verification happens in a later split's manual pass, but the
files must be produced correctly here.

## Dependencies

- section-01-discovery-tools must be complete. It provides the media/
  workspace scaffold with gitignore discipline (media/src and audition
  candidates excluded from git; public/ exports committed), the
  machine-readable media/discovery.json with a rung per media class
  (re-probed per lane-consuming stage), the rung-2 request/intake
  machinery, and the node Vitest CI suite skeleton this section extends.
- Splits 01 through 06 of the project: cue manifest module, Joshua
  catalog with voiceClipId per line, shell ducking behavior.

This section may NOT modify shell ducking code. If a voice clip sits
wrong over the room ambience, adjust manifest gain values only.

## Tests First

All tests join the node Vitest project established by section-01 and
import the same manifest module the shell consumes. Write these as
stubs before producing any audio, then make them green as the stages
complete. Suggested file: a test module alongside the section-01 CI
skeleton, for example `tests/ci/audio.validation.test.ts` (match
whatever path convention section-01 established).

Manifest validation:

```ts
describe('cue manifest validation', () => {
  it.todo('every cue id resolves to a synth recipe or an existing shipped file');
  it.todo('file-sourced cues have valid formats: opus primary present');
  it.todo('every voice cue has an AAC fallback beside the opus primary');
  it.todo('every cue has a non-empty transcript');
  it.todo('voice cue transcripts strict-equal the catalog display text for their voiceClipId');
  // The strict-equals check is the phonetic-leak guard: phonetic hints
  // are allowed in synthesis input, never in display or transcript text.
  it.todo('voice cues are preload lazy; eager cues match the manifest expectations');
});
```

Catalog parity:

```ts
describe('catalog parity', () => {
  it.todo('every catalog voiceClipId has a rendered clip on disk');
  // Exception path: ids may instead appear on the rung-gated exception
  // list in media/discovery.json (rung 3 shipped-with-placeholders).
  // The test passes only if the id is in exactly one of the two sets.
});
```

Loop-join determinism:

```ts
describe('room loop seam', () => {
  it.todo('decoded samples at the loop seam are continuous within tolerance');
  // Decode the shipped room-loop file, compare the final N samples
  // against the first N samples (and the slope across the join) under
  // a numeric tolerance. This is the deterministic check that rides
  // beside, not instead of, the ear pass.
});
```

Audio memory budget:

```ts
describe('audio memory budget', () => {
  it.todo('decoded-size estimate across all eager cues is under the budget');
  it.todo('lazy voice clips are counted at worst case singly, not summed');
  // Decoded size, not shipped bytes: estimate sampleRate * channels *
  // bytesPerSample * duration per cue. This budget is measured apart
  // from the wire-bytes budgets owned by the art pipeline.
});
```

Review records and cross-cutting:

```ts
describe('audio review records', () => {
  it.todo('media/REVIEWS.md audio rounds reference asset names that exist');
  it.todo('a locked-with-known-findings escape, if invoked, carries a non-empty findings list');
});

describe('cross-cutting', () => {
  it.todo('no em-dash appears in transcripts or audio README sections');
  it.todo('audition candidates and media/src audio are gitignored; public/ audio exports are tracked');
});
```

The three-round review cap is procedural, so the test only verifies the
record shape, not the count.

## Stage E: Voice

### Audition

Render the single line SHALL WE PLAY A GAME? through two chains:

1. Chain 1: macOS `say` with a classic voice, pitch flattened.
2. Chain 2: espeak-ng formant synthesis (brew install espeak-ng if
   absent).

Both candidates get identical post-processing via ffmpeg: band-pass
300 to 3000 Hz, light bitcrush, normalize, trim silence. Scripts live
under media/tools/ as small committed Node or Python files. No
heredocs anywhere; write script files with Python file writing if
shell quoting gets involved.

Pick the chain closer to the film register. This is a judgment call;
document it in media/REVIEWS.md with one or two sentences of reasoning,
and keep both candidate files on disk under the audition directory
(gitignored) so the choice is revisitable in minutes. Decision rules:
film register beats period authenticity when they conflict; espeak-ng
wins ties.

### Full render

Confirm the Joshua catalog is frozen (check with the finale split's
owner state; any change after this point re-opens Stage E). Then for
every voiceClipId in the catalog:

- Synthesis input is the exact on-screen dialogue. Phonetic hints may
  be injected into the synthesis input where the engine mangles a word,
  but the manifest transcript must remain the exact display text. The
  CI strict-equals test enforces this.
- Apply the winning chain's post-processing identically to every clip.
- Export opus primary and AAC fallback per clip under media/voice/
  working space, then copy final exports into public/ (committed).
  Verify both encodings decode (ffprobe or a decode round-trip in the
  render script).
- Swap the cue manifest voice entries from placeholder/synth to file
  sources with preload lazy.

If discovery.json records rung 3 for the voice class (no working
synthesis lane at all, which is unlikely since both chains are local
tools), the affected voiceClipIds go on the discovery.json exception
list and the README says so plainly.

## Stage F: Effects and Ambience

Tune the shell's synth recipes against the requirements cue table. The
full cue set: key tap, confirm blip, invalid tone, delivery pip,
channel-down fall, scope tick, two-tone forecast, hold/release relay,
confidence two-note, final relay pulse, 30-second warning, 10-second
warning, comparison sweep, three ending cues carrying the sparse motif,
activation sequence, and the room hum loop.

Everything except the room loop stays as a synth recipe: zero shipped
bytes, tuned by editing recipe parameters in the manifest. The room hum
loop is the one bounced file, because loops benefit from a rendered
file with a seamless join while one-shots do not. Render the loop with
a sample-continuous seam (crossfade into the head or generate with a
period that divides the loop length exactly), export opus plus AAC,
and make the deterministic seam test green against the shipped file.

Verify ducking of the room loop under voice clips by ear and later in
the review reel. If levels are wrong, change manifest gain values
only. Do not touch shell ducking code; that boundary is binding.

## Stage G: Audio Review

Build a short review reel with ffmpeg: the activation sequence, one cue
from each mission, the failsafe 30 and 10 second warnings, the three
ending cues, and at least one voice line played over the room ambience
at shipping gain values.

Check media/discovery.json for the audio-critique lane rung (the
re-probe-per-stage rule from section-01 applies: probe the lane for
audio attachment support at this stage, do not trust an earlier art
probe). If the codex lane accepts audio attachments, send the reel with
the critique brief from the requirements. If not, skip the machine
critique without ceremony.

Either way, run the manual listening checklist and record results in
media/REVIEWS.md:

- Desktop and phone playback levels comfortable.
- Voice clarity over ambience at shipping gains.
- Tones distinguishable from one another in context.
- Loop joins clean by ear.
- Peaks comfortable, no clipping.

Review rounds cap at three. If findings remain at the cap, lock with
the honest locked-with-known-findings escape: REVIEWS.md must carry the
non-empty findings list, and the CI record-shape test checks for it.

## Stage H (audio portion): CI and README

Turn every test stub above into a real assertion and make the audio
suite green:

- Every cue id resolves; formats valid; transcripts present and
  strict-equal to catalog display text.
- Catalog parity against disk or the discovery.json exception list.
- Loop seam continuity on the shipped file.
- Audio memory budget: decoded-size estimate across eager cues under
  budget, lazy voice clips counted singly at worst case, measured apart
  from shipped wire bytes.
- discovery.json parses and carries the audio-class rung fields
  (schema test itself belongs to section-01; this section only depends
  on it).

Extend the README's honest report section with the audio facts: the
rung per audio stage, the audition decision and reasoning, render
counts, review rounds and changes, the listening checklist results, and
file names. Game media files are slot-named or clip-id-named; the
client record-naming convention does not apply here, it is scoped to
client-facing exports.

## Deliverables Checklist

- media/tools/ audition and render scripts (committed).
- Audition candidates on disk, gitignored.
- public/ voice clips: opus plus AAC per voiceClipId, committed.
- public/ room loop: opus plus AAC, committed, seam test green.
- Cue manifest: voice entries swapped to file sources with preload
  lazy; synth recipes tuned; gain values final.
- Review reel rendered; codex critique sent if the lane supports it.
- media/REVIEWS.md audio rounds, listening checklist, audition record.
- Audio CI tests green in the node Vitest project.
- README honest report section updated.