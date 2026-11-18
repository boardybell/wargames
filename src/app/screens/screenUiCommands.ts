// A tiny registry mapping a screen id to a handler for its own mission-scoped
// UI commands. A mission screen registers a handler on mount and unregisters
// on unmount; ScreenRouter routes a parsed LocalUiCommand of kind 'SCREEN' to
// the handler for the active screen id. This keeps view switching (which is
// local UI state, not an engine action) flowing through the single shared
// command line without the shell growing a per-mission case statement.
export type ScreenUiHandler = (detail: unknown) => void

const handlers = new Map<string, ScreenUiHandler>()

/** Register a screen's UI-command handler. Returns an unregister that only
 *  removes the handler if it still owns the slot, so a remount that re-registers
 *  before the old unmount runs is not clobbered. */
export function registerScreenUiHandler(
  screenId: string,
  handler: ScreenUiHandler,
): () => void {
  handlers.set(screenId, handler)
  return () => {
    if (handlers.get(screenId) === handler) handlers.delete(screenId)
  }
}

/** Dispatch a mission-scoped UI command to the screen that owns it. Unknown
 *  screen ids are a no-op (the screen unmounted, or never registered). */
export function dispatchScreenUiCommand(screenId: string, detail: unknown): void {
  handlers.get(screenId)?.(detail)
}

/** Test-only. */
export function __resetScreenUiHandlers(): void {
  handlers.clear()
}
