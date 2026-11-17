# deep-project interview — SHALL WE PLAY A GAME?
Date: 2026-11-17. Interviewee: Bond. Requirements: planning/requirements.md.

## Round 1 (pre-pipeline, scoping)

Q: The prompt leans on ChatGPT for artwork, audio, and visual review. Authorized OpenAI
connection, or substitute the local stack?
A: Connect with it via the codex CLI or the ChatGPT app stored locally on the machine.
(Verified present: codex-cli 0.155.1 at ~/.local/bin/codex, ChatGPT.app in /Applications.
No OPENAI_API_KEY found in ~/.secrets/accounts.env.)

Q: Deployment target?
A: Create repo + deploy. Public repo boardybell/wargames, GitHub Actions workflow, live
at https://boardybell.github.io/wargames/ before done.

Q: Full deep-project pipeline or direct build from the spec?
A: Full deep-project pipeline. Then /deep-plan and /deep-implement per split.

Q: Reference screenshot for the terminal glass?
A: Supplied. planning/reference/crt-reference.jpg. Electric blue dot-matrix glyphs,
navy-black field, thin luminous border, left-aligned, generous vertical rhythm.

## Round 2 (decomposition interview)

Q: Carve the campaign into per-mission splits with a foundation split first?
A: Per-mission splits. Engine core, terminal shell + hero, Crash Outlook, Ground All
Flights, Freeze Bank Accounts, Global Failsafe, art + audio, deploy + CI.

Q: If polish budget has to be rationed, what gets protected first?
A: "There is no budget, no rationing, do the best. Use the highest level model at the
fastest speed on chatgpt/codex." Interpretation: every spec item lands at full quality;
all codex invocations pin the highest available model tier at full reasoning effort.

Q: Joshua's voice engine?
A: "Make it sound like the WOPR from the movie, if you can't then something sufficiently
like voice synthesis in the early 80s via computer would have been." Interpretation:
target the film's flat, processed, evenly weighted delivery; acceptable fallback is an
authentic early-1980s formant-synthesis character (Votrax/SAM register), not a modern
neural voice. Narrow-band speaker processing either way.

Q: Art fallback if local models cannot hit photoreal 1983 film-set quality?
A: "The art lane should run through chatgpt/codex, all visuals through that. No local
generation." Darkroom/ComfyUI is explicitly out. Every generated visual must come from
the ChatGPT/codex lane. Open engineering question for deep-plan: codex CLI image
generation capability vs scripted ChatGPT.app handoff; if neither can emit files, the
prompt's handoff-bundle fallback applies, reported honestly.

## Standing constraints captured for all specs

- TypeScript, React, Vite, small dependency footprint, static build, all play in-browser.
- Everything bundled locally; site runs with zero model credentials.
- planning/decisions.md records the locked build decisions.
- House rules: no em-dashes anywhere, register the local preview service in
  ~/mainframe/services.json, no heredocs in shell commands, autonomous build style,
  done means working in Bond's hands at the live Pages URL.
- Known-solvable fixture seed (C17/F06/B04, run R04) per the requirements table, plus
  walkthrough and timeout/partial-recovery fixture states.
- Default timers: about four minutes per mission, three for the finale, extended-time
  setting before start. Muted-by-default audio, captions for every spoken line.
- Accessibility is first-class: keyboard-only campaign, reduced motion, screen reader
  events, mobile playability.
