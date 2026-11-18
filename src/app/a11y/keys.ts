// The shared key-handler bail predicate. The full input precedence stack
// (dialog, diegetic prompt, type-in, menu shortcuts, globals) in section 04
// composes on top of this; it is a pure function of the event so the table
// test is trivial. A key event is ignored when it targets an editable element
// (typing in the command input never triggers a menu shortcut), when a
// modifier is held (browser and OS shortcuts win), or while an IME composition
// is in progress.
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

/** True when a screen/menu shortcut handler should NOT act on this key. */
export function shouldBailFromKeyHandling(event: KeyLike): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return true
  if (event.isComposing) return true
  if (isEditableTarget(event.target ?? null)) return true
  return false
}
