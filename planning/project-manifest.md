<!-- SPLIT_MANIFEST
01-simulation-core
02-terminal-shell
03-crash-outlook
04-ground-all-flights
05-freeze-bank-accounts
06-global-failsafe
07-art-audio-pipeline
08-deploy-and-review
END_MANIFEST -->

# Project Manifest — SHALL WE PLAY A GAME?

A standalone browser game inspired by WarGames (1983). TypeScript, React, Vite, static
build, GitHub Pages at https://boardybell.github.io/wargames/. Everything used during
play runs in the browser with zero model credentials. Full requirements in
requirements.md, locked decisions in decisions.md, interview in
deep_project_interview.md, CRT reference in reference/crt-reference.jpg.

## Splits

### 01-simulation-core
The headless heart. Pure TypeScript, no React, no DOM. Seeded scenario data and the
evidence record model (stable ID, origin kind OBSERVED/EXERCISE/DERIVED, source ID,
parent ID, event time, receipt time, inspectable text). Deterministic simulation clock,
event scheduler, and catch-up processing. Campaign state machine: mission lifecycle,
single settlement, cross-mission consequence rules applied once and capped, six-order
chronology invariance. The known-solvable fixture seed (C17 21:14:00, F06 21:14:08,
B04 21:14:21, run R04, the observed local weather decoy) plus additional seeds. TRACE
and CHECK SOURCE semantics including PENDING/UNKNOWN zero-corroboration. OPEN
EXCEPTIONS tally beside real service outcomes, both derived from one state. Versioned,
validated local save with corruption recovery, duplicate-settlement protection, stale
reload protection. Snapshot plus zero-player branch machinery sharing the live rules.
Mission rule engines plug into this core as pure reducers.

### 02-terminal-shell
Everything the player sees and touches that is not a specific mission. Vite/React
scaffold with base-aware asset handling. The hero: photographed operator station,
live HTML greeting calibrated per crop, whole-hero accessible button, 700 ms push-in
with crossfade into the live terminal, reduced-motion immediate reveal, skip, focus
handoff. The CRT presentation layer matched to reference/crt-reference.jpg: electric
blue on navy-black, phosphor bloom, fine scanlines, blinking cursor, luminous border.
Type-in effect, exact menu text and spacing, numeric/arrow/tap selection, hidden
fourth row. WOPR cabinet chrome: amber lamp banks tied to real transitions, dot-matrix
countdown, OPEN EXCEPTIONS readout. Command input, context HELP, MENU/Escape overlay
with Resume and End Mission confirmation, settings (sound, voice, effects, motion,
extended time), save resume wiring, New Campaign flow. Audio engine shell: muted by
default, user-activation gate, independent voice and effects toggles, cue manifest
loader, caption line for every spoken cue. Accessibility: keyboard-only play, visible
focus, screen reader live regions without per-tick announcements, mobile tap targets.
The hidden LIST GAMES tic-tac-toe zero-player demonstration in idle HELP. Defines the
art slot and audio cue interfaces that 07 fills; ships with graded placeholder slots.

### 03-crash-outlook
Mission 1. Inbox triage under a real-time deadline: 10 to 12 authored messages, inbox,
detail, outbox, delivery log. Three required deliveries (weather correction, payroll
clearance, directive audit) with in-message evidence of recipient. Primary channel
degrading in stages at explicit clock milestones, fixed-capacity backup, visible
capacity and ETA. READ/SEND/FLAG/QUEUE commands and buttons. The exercise bulletin vs
observed correction teaching beat. Per-delivery debrief, audit message carries the
D-83 clue. Pure mission reducer plus mission UI composed from shell primitives.

### 04-ground-all-flights
Mission 2. Character-grid air traffic: four hubs, about eight flights, corridors,
weather symbols, arrival queues, legend. Seeded storm track with imperfect short-range
forecast and timestamped projection updates. Land, divert, hold decisions; blanket
grounding trap that pleases WOPR while stranding passengers. Restriction vs forecast
vs field observation distinguished in legend and readout. Corridor probe as an event.
Final status for every flight, debrief with arrivals, diversions, stranded counts.
Suspiciously early restriction carries the D-83 clue. Narrow-screen list parity so
the map is never the only way to play.

### 05-freeze-bank-accounts
Mission 3. Bank-run ledger: about ten accounts, deterministic event stream of
withdrawals and payments, liquidity, depositor confidence, critical payments due.
Hold, release, limited release. Confidence feedback loop with capped, explained,
threshold-driven withdrawal demand; a run can start while cash is adequate. WOPR
predicted vs observed withdrawals on distinct lines; before/after-hold arrival
visibility so the player can challenge the circular logic. Cash floor and confidence
target shown. Close-out report, ledger hold carries the D-83 clue.

### 06-global-failsafe
Mission 4 and the endings. Cabinet countdown as WOPR prepares to repeat D-83. Case
builder: one record per subsystem, event-time ordering, root source identification,
real parent-link validation, one independent observed record required, field report
requestable during the finale, editable evidence with Joshua pointing at unsupported
links. Zero-player comparison: REPEAT D-83, HOLD AND VERIFY, STAGED RECOVERY run
against a snapshot, side-by-side projections of OPEN EXCEPTIONS, deliveries,
passengers, payments, confidence; brief skippable display; live state untouched.
Three endings with earned-why readback, confirmation before irreversible commit,
carry-in from earlier mission outcomes. Joshua's authored line set for the full
campaign lives here with the event keying.

### 07-art-audio-pipeline
All generated media, exclusively through the ChatGPT/codex lane at the highest model
tier and effort. No local image generation; Darkroom/ComfyUI explicitly excluded.
Engineering discovery first: what codex-cli 0.155.1 plus ChatGPT.app can actually emit
as files (codex image tooling, scripted app handoff), then the single art direction
prompt, per-surface generation briefs (hero x3 plus portrait crop, rack and bezel,
relay, runway and radar, bank operations, failsafe wall and countdown insert, hero
return, debrief and ending stills), labeled contact sheet, codex art critique pass,
regeneration loop, export to sized web formats, organized source files, preload and
defer strategy. Audio: Joshua's voice as the film's WOPR register or authentic
early-80s formant synthesis, narrow-band processed, auditioned (two reads of the
question plus one failsafe line) before the full set; synthesized effects and ambience
per the cue table (oscillators, filtered noise, envelopes, seamless loops); cue
manifest with event, file, gain, transcript; AI-generated-voice label in settings.
If any lane cannot emit files, produce the handoff bundle and report exactly what ran.

### 08-deploy-and-review
Ship and verify. Public repo boardybell/wargames, Actions workflow (lockfile install,
type check, gameplay tests, Pages artifact, official deploy action, scoped
permissions), Vite base derived from repo name, subpath-served local production
verification, services.json registration for the local preview, README with commands,
known-seed walkthrough, Pages setup. The website review: full campaign played in the
production build, numbered desktop and mobile screenshots of every state, codex vision
critique by filename and region, independent browser inspection (keyboard, reduced
motion, mobile), fix loop, final codex pass, audio listening checks, live Pages URL
smoke test. README reports what was reviewed and what changed.

## Dependencies

- 01 feeds everything: models, reducers, clock, save (type: models, patterns).
- 02 depends on 01 (campaign state, clock, save APIs).
- 03, 04, 05 each depend on 01 (record model, reducers) and 02 (shell primitives,
  command dispatch, cue and art slots). They are mutually independent.
- 06 depends on 01, 02, and the settled record/outcome interfaces of 03 to 05.
- 07 depends on 02's art slot and cue manifest interfaces; final integration touches
  all mission surfaces. Generation can start as soon as 02 defines the interfaces.
- 08 depends on everything; the workflow skeleton can land right after 02 so every
  push deploys, with final verification last.

## Execution order

Sequential: 01, then 02. Parallel group: 03, 04, 05 (any order, independent). Then 06.
07 runs its discovery and generation in parallel with missions once 02 is done, and
integrates after 06. 08 last, workflow skeleton optionally early.

/deep-plan commands in order:
  /deep-plan @01-simulation-core/spec.md
  /deep-plan @02-terminal-shell/spec.md
  /deep-plan @03-crash-outlook/spec.md
  /deep-plan @04-ground-all-flights/spec.md
  /deep-plan @05-freeze-bank-accounts/spec.md
  /deep-plan @06-global-failsafe/spec.md
  /deep-plan @07-art-audio-pipeline/spec.md
  /deep-plan @08-deploy-and-review/spec.md

## Cross-cutting concerns

Exact opening text and spacing reproduced as written. No em-dashes anywhere in copy,
code, or comments. WOPR on cabinet surfaces, Joshua when addressed. Determinism and
replayability from one seed. Story time distinct from the real-time deadline and from
branch steps. Accessibility and mobile parity are acceptance criteria in every UI
split. Done means working at the live Pages URL.
