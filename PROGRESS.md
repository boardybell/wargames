# WarGames build progress

Live board. Open it in an editor and it updates as each piece lands. The
authoritative record is `git log --oneline` and the test count; this is the
human-readable view.

Last updated: the whole engine-driven game logic is DONE and committed -
engine, shell, all three missions, and the finale (with the WOPR
tally-vs-reality divergence paying off at the campaign ending). 1406 tests
passing. Remaining: the art/audio media pass, then deploy (which mounts this
engine-driven game in place of the standalone page).

## The two tracks

- LIVE standalone game: https://boardybell.github.io/wargames/ (shipped, stays up;
  real WOPR, blinking lights, sound, and the war map with targeting).
- DEEPER engine-driven game: being built underneath, split by split. Becomes the
  live experience when the deploy split wires it in.

## Deeper game: splits

| Split | What | Status |
|-------|------|--------|
| 01 simulation-core (engine) | deterministic campaign engine | DONE |
| 02 terminal-shell | CRT terminal, screens, audio, a11y, art slots | DONE |
| 03 crash-outlook (mission 1) | inbox-triage puzzle | DONE |
| 04 ground-all-flights (mission 2) | air-traffic routing under a storm | DONE |
| 05 freeze-bank-accounts (mission 3) | bank-run ledger | DONE |
| 06 global-failsafe (finale) | WOPR takeover + campaign-level scoring | DONE |
| 07 art-audio-pipeline (media) | DEC-raster art + audio filling the slots | starting |
| 08 deploy-and-review | mount the engine shell at the app root, ship it | not started |

## Finale split (06) sections (current)

| Section | What | Status |
|---------|------|--------|
| retrofit | all 3 missions stamp the WOPR-vs-reality metrics; finale viability recalibrated | COMMITTED |
| 01 finale-module | case builder, field-report bounded wait, commit vs timeout | COMMITTED |
| 03 joshua-catalog | the WOPR/JOSHUA voice: every line, completeness-gated | COMMITTED |
| 02 projections-endings | three projected futures + three endings from settled history | COMMITTED |
| 04 screens-fixtures | the finale screens + acceptance fixtures | COMMITTED |

## How it is built (per section)

A fresh agent implements it test-first, an adversarial reviewer agent tears it
apart, the real findings get fixed, then it is committed only when the whole
test suite is green. That review loop is why it is slow but hard to cheat: it
has already caught a delivery credited before it landed, a puzzle winnable
without reading the evidence, a storm warning that never reached the player,
and the game's central WOPR-looks-good-while-reality-burns mechanic sitting
entirely unimplemented behind a test that only appeared to check it.

## Numbers

- Test suite: 1077 passing and climbing (started this stretch at 679).
- Commits land on the `main` branch and push to the public repo at
  github.com/boardybell/wargames.
