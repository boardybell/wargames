# Usage Guide: 02-terminal-shell

The terminal shell for SHALL WE PLAY A GAME? (a WarGames-inspired browser game).
This split is the React 18 + Vite + TypeScript front end that renders whatever
the headless engine (split 01) reports and never invents game state. Everything
here is static-site friendly (GitHub Pages), deterministic, and jsdom-tested.

## Quick start

```bash
npm install
npm run dev     # Vite dev server
npm run build   # static build for GitHub Pages (base-path aware via urlFor)
npm test        # 496 tests: engine (node) + app shell (jsdom)
npx tsc --noEmit && npx eslint .
```

The app mounts in `src/app/main.tsx`: it publishes the CRT theme tokens, then
renders `<App />`, which hosts the screen root, the live regions, and the dialog
host. The hero screen pushes in to the live terminal on activation.

## What this split provides

Subsystems under `src/app/`, each with a barrel `index.ts`:

- **state/** — the engine binding. `init({ ctx, seedName, port })` boots a
  campaign, registers lifecycle + audio, and returns a teardown. `useCampaign()`
  subscribes components to campaign state; `send(action)` dispatches; `wake()`
  reconciles elapsed time. Timing reads a monotonic display clock
  (`remainingFor`, `subscribeTick`), never `Date.now()`.
- **theme/** + **crt/** — palette tokens (AA-contrast guarded), the Glass TTY
  VT220 font, the layered CRT glow stack with a reduce-glow toggle.
- **terminal/** + **screens/** — the command grammar, menu rows, the input
  precedence stack, the screen router, and the native-dialog overlay suite
  (pause, settings, new campaign, help, corrupt-save notice).
- **hero/** — the full-viewport WOPR hero and the 700ms push-in into the live
  terminal, with a reduced-motion crossfade fallback and a diegetic
  ENABLE SOUND? prompt.
- **audio/** — one suspended Web Audio context behind a port seam, three mix
  buses + a ducking node, a validated 12-cue synth manifest, timer warnings from
  engine events, and captions. Muted by default; `mountAudio()` wires it at boot.
- **cabinet/** + **grid/** — the lamp banks (`LampController`/`useLampController`),
  the exceptions/outcomes readouts, the `role="timer"` countdown, the pure
  `CharacterGrid`, and the skippable `PlayBranchTrace`.
- **a11y/** — `announce(text, channel)` into two live regions, `moveFocusTo`,
  `shouldBailFromKeyHandling`/`shouldHandleKey`, `useMotionPreference`, and the
  `GlossaryTerm` primitive over a project glossary.
- **art/** — the 13-slot art registry with graded CSS placeholders, `ArtSlot`,
  and the media-split source-swap contract (`swapArtSource`). Hero source
  helpers (`artSources`/`artNatural`) feed the push-in.
- **games/** — pure optimal tic-tac-toe (`playOptimalGame`) and its replay view.

## Example usage

Mount the shell with a campaign:

```ts
import { init } from '@app/state'
import { buildContext } from '@engine'

const teardown = init({ ctx: buildContext(), seedName: 'the-cold-open' })
// ... render <App /> ...
teardown() // on unmount
```

Announce a milestone and drop an art slot in:

```tsx
import { announce } from '@app/a11y/announce'
import { ArtSlot } from '@app/art'

announce('THIRTY SECONDS REMAIN', 'polite')
<ArtSlot id="menu-rack" />
```

Swap final art later with no consumer change (the media-split contract):

```ts
import { swapArtSource, imageSource } from '@app/art'
swapArtSource('ending-recovery', imageSource('art/ending-recovery.avif'))
```

## Example output (illustrative)

- Clicking the WOPR hero pushes in to a live CRT terminal showing
  `GREETINGS PROFESSOR FALKEN` and `SHALL WE PLAY A GAME?`.
- `npm test` reports `Test Files 76 passed (76) / Tests 496 passed (496)`.

## Manual verification

Browser-level checks (real visuals, audio, screen readers, devices) are listed
in `docs/manual-smoke-checklist.md` and run before the deployment split's
Playwright pass.

## Notes for later splits

- Missions (splits 03-05) register screens and glossary/art terms through the
  existing registries; the shell renders them without new wiring.
- The finale (split 06) consumes the character grid, branch trace, the three
  ending art slots, and the red alarm (keyed to `finaleFinalPhase`).
- The media split swaps art and audio sources through the registry/manifest
  only; call sites do not change.
- Deployment (split 08) wires `init()` + `mountAudio()` at the app root, mounts
  the ScreenRouter, and runs the Playwright + manual pass.
