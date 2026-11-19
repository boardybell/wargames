// The pure composition seam, kept out of main.tsx so it has no DOM-mount side
// effect on import: tests render bootApp() under their own container, and
// main.tsx calls it to mount the real root. It assembles the engine-driven
// experience from pieces the splits built (the production context, the campaign
// store, the mission and finale screens, the hero stage) and reimplements none
// of them.
import type { ReactNode } from 'react'
import type { StoragePort } from '@engine'
import { createProductionContext, DEFAULT_SEED_NAME } from '@engine/seeds/context'
import { init } from './state'
import { HeroStage } from './hero'
import { registerDefaultVerbs } from './terminal'
import { registerOutlookScreen } from './missions/outlook/OutlookScreen'
import { registerFlightsScreen } from './missions/flights/FlightsScreen'
import { registerBankScreen } from './missions/bank/BankScreen'
import { registerFinaleScreen } from './missions/finale/FinaleScreen'
import { augmentContext, readE2EConfig } from './boot/e2e-hook'

/** Register every mission screen and the finale screen with the screen
 *  registry. Each register call also installs that mission's glossary terms;
 *  all are idempotent, so a double boot (StrictMode) is harmless. */
export function registerAllScreens(): void {
  // The shared command grammar: HELP, LIST GAMES, SOUND, and the menu and
  // debrief verbs. Production never registered these before this composition
  // root existed, so the shipped command input had no default verbs.
  registerDefaultVerbs()
  registerOutlookScreen()
  registerFlightsScreen()
  registerBankScreen()
  registerFinaleScreen()
}

/** Compose the engine-driven app: build the production context on the default
 *  seed, register the screens, and start the campaign store. The store restores
 *  a saved campaign when one exists (so a reload reopens exactly where the
 *  operator left off rather than booting empty over prior progress) and rebinds
 *  the mission modules to whichever seed a NEW_CAMPAIGN or a restored save
 *  selects. Returns the root React element to mount. */
export interface BootOptions {
  /** Override the storage port. Production uses the default localStorage port;
   *  tests inject an in-memory one so the boot is deterministic and needs no
   *  localStorage. */
  readonly port?: StoragePort
  /** Skip the hero push-in and drop straight into the engine shell. Used when
   *  the WarGamesGame front end launches the campaign from GLOBAL THERMONUCLEAR
   *  WAR, having already played its own WOPR boot. */
  readonly skipHero?: boolean
}

export function bootApp(options: BootOptions = {}): ReactNode {
  registerAllScreens()
  // The inert e2e seam: absent in production (window flag unset), this is a
  // no-op and the context is the pure production one. Under Playwright it merges
  // any injected test seed into the catalog and wraps the factory so a restored
  // save or NEW_CAMPAIGN on that seed rebinds correctly.
  const e2e = readE2EConfig()
  const extraNames = new Set((e2e?.extraSeeds ?? []).map((s) => s.name))
  const productionFactory = (name: string) => {
    // createProductionContext only knows the catalog seeds; an injected e2e seed
    // is unknown to it and would throw. Build the base context on the default
    // catalog seed, then let augmentContext merge the extra seed in and rebind the
    // mission modules to it when it is the active one.
    const baseName = extraNames.has(name) ? DEFAULT_SEED_NAME : name
    return augmentContext(createProductionContext(baseName), name, e2e)
  }
  init({
    ctx: productionFactory(DEFAULT_SEED_NAME),
    seedName: DEFAULT_SEED_NAME,
    contextFactory: productionFactory,
    port: options.port,
  })
  return <HeroStage startActivated={options.skipHero ?? false} />
}
