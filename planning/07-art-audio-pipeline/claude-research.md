# Research: 07-art-audio-pipeline

2026-11-17. Local tooling scouted hands-on earlier this session (no web
research needed; the lane is machine-specific):

- codex-cli 0.155.1 at ~/.local/bin/codex, healthy per codex doctor.
  ~/.codex/config.toml already pins model = "gpt-6-astra",
  model_reasoning_effort = "xhigh", which satisfies Bond's highest-tier
  directive without flags.
- codex exec runs non-interactively, reads the prompt from argv or stdin,
  accepts -i/--image FILE... attachments (vision critique confirmed
  feasible), -m model override, sandbox modes (read-only,
  workspace-write), -C working root, --add-dir. codex exec resume/fork
  support continuing a session.
- ChatGPT.app present in /Applications (the auth source for codex).
- No OPENAI_API_KEY anywhere; the API-direct image endpoint is not an
  option. UNKNOWN until discovery: whether this codex build can invoke
  OpenAI image generation as a tool and save files into the sandbox
  workspace. The discovery step must answer it empirically: run codex exec
  with workspace-write asking it to generate and save a test image; if the
  tool exists the file appears; if not, codex will say so.
- Fallback lane if codex cannot emit images: scripted handoff through the
  ChatGPT desktop app (semi-automated: codex-authored prompt files, Bond
  or AppleScript pastes, saves land in a watched folder), and the
  requirements' handoff-bundle fallback as the floor, reported honestly.
- Audio: no OpenAI TTS without an API key, and the codex lane is unlikely
  to emit audio. The authorized plan: effects and ambience synthesized
  in-repo (the shell's recipe engine from split 02 covers runtime; this
  split renders bounce-downs where files are needed); Joshua's voice from
  the film-register direction using a local early-80s-character pipeline:
  macOS say (classic voices) or espeak-ng formant synthesis, pitched flat,
  band-passed 300 to 3000 Hz, bitcrushed lightly, normalized, exported
  opus/m4a via afconvert or ffmpeg. This honors Bond's "sounds like the
  WOPR from the movie, or sufficiently early-80s computer synthesis"
  directive with zero cloud egress. codex reviews the cue list and voice
  direction as text (that part of the lane is certain).

## Testing approach

Media are assets, not logic: CI validates the cue manifest against files
on disk (every cue id resolves, formats and sizes within budget,
transcripts present), image presence and dimensions per art slot, and the
audio memory budget. Perceptual review runs through the codex vision lane
(contact sheet critique) plus the manual listening checklist, both
recorded in the README per the requirements' honest-reporting rule.
