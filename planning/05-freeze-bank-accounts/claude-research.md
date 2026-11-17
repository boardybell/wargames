# Research: 05-freeze-bank-accounts

Decision (autonomous per Bond's 2026-11-17 directive): no new research.
Authored content and mission rules against reviewed contracts from splits 01
(mission-module interface, integer sim math, scheduled events, emitted
channel) and 02 (terminal primitives, ledger-friendly text blocks, glossary,
art slot briefing-bank, cue hooks). The confidence feedback loop is pure
integer arithmetic on seed-authored tables; no new technique required.

## Testing approach

Rules and module tests in the engine node project (tick math, threshold
demand generation, cap behavior, before/after-hold ledger marking,
settlement tiers, consequences both directions). Screen tests in the app
jsdom project with the real engine. Walkthrough, timeout, and
run-with-adequate-cash fixtures per seed (the requirements name the last
one explicitly).
