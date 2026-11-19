# Prerequisites carried into split 08 (deploy-and-review)

Recorded during the split-06 finale review.

## App-root composition is NOT wired yet (split 08 owns this)
The engine-driven game exists in full (engine, shell, three missions, finale) but is NOT mounted at the app root. Confirmed in the section-04 review:
- Nothing in src/ calls any register*Screen() (registerBankScreen / registerFlightsScreen / registerOutlookScreen / registerFinaleScreen are defined but never invoked in the shipped composition).
- src/main.tsx mounts the standalone cinematic WarGamesGame tribute (the current live page), which never touches ScreenRouter, the engine, or any mission screen.

So split 08 must, at the real composition root:
1. Mount the engine-driven ScreenRouter shell (with the campaign engine + a seed from the catalog) at src/main.tsx, replacing the standalone WarGamesGame.
2. Call all register*Screen() (outlook, flights, bank, finale) at startup so resolveMissionScreen resolves every mission phase and the finale ending routes.
3. Keep the standalone game available only if desired (e.g. an intro/attract mode) or retire it; the live boardybell.github.io/wargames page becomes the engine-driven game at deploy.
4. Only then is the whole game playable end to end in a browser; add the Playwright matrix (split 08 section 02) over the real composition, and do the "verify it renders in a browser" pass the mission/finale section plans each deferred.

## Finale-ending routing (done in split 06 section 04)
The finale-specific routing (a settled finale's debrief renders EndingScreen, registerFinaleScreen exists, a router-driven commit-to-ending test) is handled when closing split 06. Split 08 only has to call registerFinaleScreen alongside the others at the app root.

## Reminder
All commits so far are LOCAL. Push to github.com/boardybell/wargames before/at the deploy split.
