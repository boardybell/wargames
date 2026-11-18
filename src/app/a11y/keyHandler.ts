// The shared key-handler guard. Section 09 owns the a11y spine and will
// refine these; this section needs the bail conditions now, so they live here
// as the real implementation. A key event is ignored when it targets an
// editable element (so typing in the command input never triggers menu
// shortcuts), when a modifier is held (browser and OS shortcuts win), or
// while an IME composition is in progress.
export interface KeyLike {
  readonly key: string
  readonly ctrlKey?: boolean
  readonly metaKey?: boolean
  readonly altKey?: boolean
  readonly isComposing?: boolean
  readonly target?: EventTarget | null
}

function isEditableTarget(target: EventTarget | null | undefined): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/** True when a screen/menu shortcut handler should act on this key. */
export function shouldHandleKey(event: KeyLike): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  if (event.isComposing) return false
  if (isEditableTarget(event.target ?? null)) return false
  return true
}
