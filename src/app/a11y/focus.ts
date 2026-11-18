// Focus management. The router calls moveFocusTo on every screen change so
// assistive tech lands on the new screen. Resolution order: the screen root's
// heading, else an input a screen explicitly marks as its focus target, else
// the root itself. The command-input step is opt-in by design: auto-focusing
// EVERY screen's command input would route menu number-shortcuts into the text
// field (where the key-handler bail predicate correctly suppresses them),
// breaking keyboard selection. An input-first screen with no heading opts in by
// marking its input with data-a11y-focus; the menu does not, so it keeps root
// focus and its shortcuts. Native dialogs manage their own focus trap and
// restore; this function never touches them.

function resolveTarget(root: HTMLElement): HTMLElement {
  const heading = root.querySelector<HTMLElement>(
    'h1, h2, [role="heading"], [data-a11y-heading]',
  )
  if (heading) return heading
  const markedInput = root.querySelector<HTMLElement>('[data-a11y-focus]')
  if (markedInput) return markedInput
  return root
}

function isNativelyFocusable(el: HTMLElement): boolean {
  if (el.tabIndex >= 0) return true
  const tag = el.tagName
  return (
    tag === 'A' ||
    tag === 'BUTTON' ||
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT'
  )
}

export function moveFocusTo(element: HTMLElement | null): void {
  if (!element) return
  const target = resolveTarget(element)
  // Make the target programmatically focusable when it is not already.
  if (!isNativelyFocusable(target) && !target.hasAttribute('tabindex')) {
    target.setAttribute('tabindex', '-1')
  }
  target.focus({ preventScroll: true })
}
