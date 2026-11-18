# Review Triage: 02-terminal-shell / section-05-hero-pushin

Mode: autonomous. The reviewer confirmed the glass geometry, animation
discipline (only transform/opacity, will-change scoped), a11y (ACTIVATE
TERMINAL name, decorative photo), the audio port, the single sound preference,
precedence registration, urlFor routing, and no em-dashes. Dispositions:

## Fixed
- **HIGH-1 (units not connected).** Built HeroStage: it consumes
  decideInitialScreen, mounts the HeroScene with the terminal (ScreenRouter)
  beneath at opacity 0, owns the onActivate -> runPushIn handoff, reveals the
  terminal on finish, moves focus, and raises the fresh-campaign sound prompt.
  New integration tests (test-double engine): fresh -> hero + terminal beneath;
  active-mission save -> hero skipped, mission shown; activation -> push-in ->
  terminal revealed + sound prompt.
- **HIGH-2 (wake on arrival).** The store's init performs the arrival wake
  (section 02) before HeroStage mounts, so the resumed phase drives the routing
  decision. The active-mission-skips-hero path is now tested end to end.
- **MED-3 (onFinish could hang).** Added an idempotent finish() plus a safety-
  net timeout, so a missed WAAPI finish event can never strand the scene on the
  photo.
- **MED-6 (soundPrompt duplicated answer).** Hoisted a single answer() shared by
  the keyboard and button paths, with an answered latch so a double answer
  (key then click) is a no-op.
- **LOW-7 (ended routing).** decideInitialScreen now routes ended (and every
  non-menu phase) to the engine, so an ended campaign resumes its final state
  rather than re-greeting the hero.
- **LOW-9 (resize recompute).** HeroScene recomputes the greeting position on
  resize, orientationchange, and image load, per the plan.

## Documented
- **App.tsx / main.tsx live boot.** The full live boot (init with a real
  EngineContext, then render HeroStage) is gated on the mission modules from
  splits 03-06; until a ctx exists the live entry stays the section-01
  placeholder. HeroStage is the built, tested integration ready for that boot.
- **MED-4 (module-level push-in guard).** Single-use per page load is correct
  for the hero (a reload resets); __resetPushIn re-arms it for tests. The
  onFinish safety net removes the stuck-latch hang risk.
- **MED-5 (pointerUp + click both resume).** Intentional and guard-protected;
  resume is idempotent. Noted.

## Verification
tsc 0, eslint 0, 341 tests green, build clean. The WOPR hero art (desktop +
portrait, same scene) ships in public/art under budget.
