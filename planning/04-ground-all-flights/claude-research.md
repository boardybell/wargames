# Research: 04-ground-all-flights

Decision (autonomous per Bond's 2026-11-17 directive): no new research. This
split is authored content and mission rules against reviewed contracts: the
engine mission-module interface (../01-simulation-core/claude-plan.md rev 2
plus amendments) and the shell primitives, especially the character grid
(CharacterGrid, compact mode, selection model, container-level glow) and
list-parity obligations from ../02-terminal-shell/claude-plan.md rev 2. The
storm track is seed-authored data (SeedDefinition.stormTrack) drained through
the standard scheduled-event discipline; no new technique needed.

## Testing approach

Rules and module tests in the engine node project (storm advancement,
forecast updates, routing legality, queue math, settlement tiers,
consequence handling in both directions). Screen tests in the app jsdom
project with the real engine: grid and list parity, selected-flight readout,
command-button identity. Walkthrough, timeout, and blanket-grounding-trap
fixtures per seed.
