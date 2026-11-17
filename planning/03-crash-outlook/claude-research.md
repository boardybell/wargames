# Research: 03-crash-outlook

Decision (autonomous per Bond's 2026-11-17 directive): no new research. This
split is authored content and mission rules against interfaces already planned
and reviewed: the engine mission-module contract
(../01-simulation-core/claude-plan.md rev 2 plus contract amendments: pure
reducers, events via schedule, emitted EngineEvent[] channel, seed-authored
timer milestones, saveSchema member, integer sim math) and the shell
primitives (../02-terminal-shell/claude-plan.md rev 2: screen registry,
TerminalText, MenuRows, ActionBar, DetailPane, CommandInput grammar with
mission verb registration, glossary term registration, art slot
briefing-outlook, cue hooks). The technical research in those two splits
(determinism, Vitest 4 projects, fast-check, jsdom component testing) covers
everything this split needs.

## Testing approach

Mission reducer and content tests run in the engine's node Vitest project
(pure TS: validators, reducer, settlement tiers, channel math, schedule).
Screen component tests run in the app jsdom project with the real engine
driving the mission module. Walkthrough fixtures extend the split 07-seeds
executable-fixture pattern: the mission's authored content ships inside
SeedDefinition.missionPayloads.outlook and the walkthrough action log reaches
the documented best outcome in CI.
