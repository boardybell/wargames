import { afterEach, describe, expect, it, vi } from 'vitest'
import { moveFocusTo } from '@app/a11y/focus'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('moveFocusTo', () => {
  it('focuses a bare container with tabindex -1 and preventScroll', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')
    moveFocusTo(el)
    expect(el.getAttribute('tabindex')).toBe('-1')
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
    expect(document.activeElement).toBe(el)
  })

  it('focuses the screen root heading when one is present', () => {
    const root = document.createElement('div')
    const heading = document.createElement('h2')
    heading.textContent = 'MISSION ALPHA'
    root.appendChild(heading)
    document.body.appendChild(root)
    moveFocusTo(root)
    expect(document.activeElement).toBe(heading)
    expect(heading.getAttribute('tabindex')).toBe('-1')
  })

  it('focuses an input only when the screen opts in via data-a11y-focus', () => {
    // Without the marker, a command input in the root is skipped (so menu
    // number-shortcuts are not swallowed) and the root receives focus.
    const plain = document.createElement('div')
    plain.setAttribute('tabindex', '-1')
    const unmarked = document.createElement('input')
    plain.appendChild(unmarked)
    document.body.appendChild(plain)
    moveFocusTo(plain)
    expect(document.activeElement).toBe(plain)

    // With the marker, an input-first screen lands focus in the field.
    const inputFirst = document.createElement('div')
    const marked = document.createElement('input')
    marked.setAttribute('data-a11y-focus', '')
    inputFirst.appendChild(marked)
    document.body.appendChild(inputFirst)
    moveFocusTo(inputFirst)
    expect(document.activeElement).toBe(marked)
  })

  it('does nothing when given null', () => {
    expect(() => moveFocusTo(null)).not.toThrow()
  })

  it('does not override an existing tabindex', () => {
    const el = document.createElement('div')
    el.setAttribute('tabindex', '0')
    document.body.appendChild(el)
    moveFocusTo(el)
    expect(el.getAttribute('tabindex')).toBe('0')
  })
})
