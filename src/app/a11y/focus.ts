// Focus management stand-in. Section 09 refines the heading-vs-input choice
// and the roving details; this section needs to move focus to a new screen
// root on every screen change.
export function moveFocusTo(element: HTMLElement | null): void {
  if (!element) return
  // A screen root is programmatically focusable via tabindex -1 (set by the
  // router); focus it so assistive tech lands on the new screen.
  element.focus()
}
