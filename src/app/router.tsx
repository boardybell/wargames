// The screen model for the shell. Base screens map to engine phases (wired
// in section 02; derived from phase in section 04). settings and help are
// OVERLAYS, not engine phases, so the router state keeps an active base
// screen plus an optional overlay rather than treating all ids as exclusive.
import type { ComponentType } from 'react'

export type BaseScreenId =
  | 'hero'
  | 'menu'
  | `mission:${string}`
  | 'debrief'
  | 'finale'

export type OverlayId = 'settings' | 'help'

export type ScreenId = BaseScreenId | OverlayId

export interface RouterState {
  readonly base: BaseScreenId
  readonly overlay: OverlayId | null
}

export type ScreenComponent = ComponentType<{ readonly screenId: ScreenId }>

export type ScreenRegistry = Partial<Record<string, ScreenComponent>>

/** Register a component for a screen id. Mission splits register by mission
 *  id (`mission:<id>`) later; this is the stub seam. Returns a new registry
 *  rather than mutating, so registration stays pure and testable. */
export function registerScreen(
  registry: ScreenRegistry,
  id: ScreenId,
  component: ScreenComponent,
): ScreenRegistry {
  return { ...registry, [id]: component }
}

/** A plain, unstyled terminal-ish frame used until section 04 lands real
 *  screens. Renders the screen id so the shell is testable against the
 *  engine's test-double mission before the terminal framework exists. */
export function FallbackFrame({ screenId }: { screenId: ScreenId }) {
  return (
    <pre data-testid="fallback-frame" data-screen-id={screenId}>
      {`[ ${screenId} ]`}
    </pre>
  )
}

/** Resolve the component for the active base screen, falling back to the
 *  plain frame for an unregistered id. Overlay rendering is section 06; the
 *  router only exposes the state shape for it now. */
export function resolveScreen(
  registry: ScreenRegistry,
  id: ScreenId,
): ScreenComponent {
  return registry[id] ?? FallbackFrame
}
