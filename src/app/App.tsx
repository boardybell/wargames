// The root layout. A stable structure later sections fill rather than
// rearrange: a screen root (gets focus management in section 09), a dialog
// host sibling (native <dialog> overlays from section 06 mount here), and a
// reserved live-region slot (section 09 inserts aria-live regions there, so
// it is an insertion, not a refactor). No styling beyond structure, no key
// handling, no engine imports: this is scaffolding.
import { useState } from 'react'
import {
  FallbackFrame,
  resolveScreen,
  type RouterState,
  type ScreenRegistry,
} from './router'

export interface AppProps {
  readonly registry?: ScreenRegistry
  readonly initial?: RouterState
}

export function App({ registry = {}, initial }: AppProps) {
  // Defaults to the hero screen with a bare placeholder until section 02
  // wires engine state and section 04 derives the screen from phase.
  const [router] = useState<RouterState>(
    initial ?? { base: 'hero', overlay: null },
  )
  const Screen = resolveScreen(registry, router.base) ?? FallbackFrame

  return (
    <div className="app-root">
      <main
        className="screen-root"
        data-testid="screen-root"
        data-active-screen={router.base}
      >
        <Screen screenId={router.base} />
      </main>
      {/* Reserved for section 09 live regions: a sibling of the dialog host,
          outside any screen root. Keep the position; do not restructure. */}
      <div data-testid="live-region-slot" hidden />
      <div className="dialog-host" data-testid="dialog-host" />
    </div>
  )
}
