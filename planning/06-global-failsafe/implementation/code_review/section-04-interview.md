# Section 04 triage (finale screens + fixtures) — send-back fixes

The engine-level matrix and viability consistency are strong and stay. Fix the routing so the ending actually renders, gate typed COMMIT, and persist real proved-slots.

## Fix
- H1 (ending unreachable through ScreenRouter): follow the existing registry pattern (resolveMissionScreen + register*Screen in src/app/screens, used by bank/flights/outlook).
  1. Add registerFinaleScreen() that registers FinaleScreen under the finale mission id, so `mission:finale` resolves it (mirror registerBankScreen etc.).
  2. Route a settled, unacknowledged FINALE to the EndingScreen instead of the generic DebriefScreen: in ScreenRouter.ActiveScreen, when screenId === 'debrief' AND the pending debrief's missionId is the finale mission id, render EndingScreen (reading the finale SettledOutcome) rather than DebriefScreen. Keep the generic DebriefScreen for the three regular missions.
  3. Add a ScreenRouter-driven test (test/app/missions/finale or test/app/screens) that registers the finale screen, drives the finale from START through a real COMMIT via the router (not a direct mount), and asserts data-testid='finale-ending' renders; and a timeout variant reaching the failure ending through the router.
  Do NOT mount ScreenRouter at main.tsx or call the register functions at the app root here — that whole-shell composition is split 08's job (recorded in PREREQS-from-earlier-splits.md). Section 04 only owns the finale-ending routing + registration surface + the router-driven test.
- M1 (keyboard COMMIT bypasses confirmation): route the typed COMMIT command through the SAME confirmation gate the button uses (typed COMMIT opens the native confirm dialog; Enter confirms, Escape cancels leaving state untouched), so command-button parity holds at the irreversible action. Update the keyboard-journey test to go through the dialog.
- M2 (proved-slots reconstructed from a flag): persist the real proved-slot set into the finale SettledOutcome metrics at evaluate() in src/engine/missions/finale/module.ts (one integer bit per slot: outlook/flights/bank/root/observation), and have EndingScreen/deriveEarnedWhy read those bits instead of finaleStateFromOutcome stamping every slot 'x' when case_valid==1. The earned-why "proved evidence" must reflect what the player actually proved.
- L2 (snapshot churn): memoize buildFinaleSnapshot on its real inputs (settled, openExceptionsBaseline, caseState) so the frozen snapshot object is stable across countdown-tick rerenders instead of re-cloning+freezing every render.

## Keep
STAGED===viability single object, the engine-level ending-reachability + commit-vs-timeout + extended-time + viability-gating fixtures, return-nav restore, glossary a11y — all verified good, do not disturb.

## Done when
A COMMIT and a timeout driven through the REAL ScreenRouter reach the EndingScreen (router-driven test proves it, no direct mount); registerFinaleScreen exists; typed COMMIT is confirmation-gated like the button; earned-why reads persisted proved-slots; full npm test + tsc + eslint green with no regressions. (App-root mounting remains split 08.)
