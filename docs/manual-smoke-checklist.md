# Manual Smoke Checklist: SHALL WE PLAY A GAME? (split 02 terminal shell)

Run these by hand in a real browser before closing the split. Browser-level
verification (real visuals, audio, screen readers, devices) is the deployment
split's Playwright and manual pass; this checklist records the local run so that
pass can re-verify. Mark each PASS or FAIL with a note.

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Push-in register and feel at desktop and phone widths: the photo glass rectangle hands off to the live terminal cleanly, and the GREETINGS PROFESSOR FALKEN greeting stays in register through the move. | | |
| 2 | Cinematic glow look matches the intended reference (planning/reference/crt-reference.jpg): halo strength, scanlines, vignette, no banding. | | |
| 3 | Audio audibility and ducking by ear: the WOPR voice reads clearly over the ambience hum, the ambience ducks while it speaks and restores after, and no cue clicks on stop (micro-fades land). | | |
| 4 | VoiceOver (or NVDA) pass over activation, the menu, a debrief, and a timer-milestone announcement: focus lands sensibly on each screen, the live regions read, and the countdown never announces its ticks. | | |
| 5 | Throttled-CPU performance profile of the CRT stack and a finale-scale character grid: no dropped frames from animated filters, no per-cell shadow blowup, steady paint. | | |
| 6 | Reduced-motion walk (OS setting or in-app toggle): the push-in is replaced by a crossfade, type-ins are instant, tic-tac-toe is instant, and the cabinet lamps show no ambient blinking. | | |

## How to run

- Serve the production build locally (not the dev server) so base-path URLs and
  asset preloads behave as they will on GitHub Pages.
- Exercise the reduced-motion row twice: once via the OS setting, once via the
  in-app MOTION toggle in SETTINGS, confirming both reach the same state.
- Record anything that fails here and in the split notes so the deployment split
  re-tests it in Playwright.
