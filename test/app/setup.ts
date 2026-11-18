import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Vitest globals are off, so Testing Library's auto-cleanup does not run on
// its own. Unmount between tests to keep one render per test in the DOM.
afterEach(cleanup)

// jsdom's <dialog> support is partial: polyfill showModal/close and
// Escape-to-cancel-then-close minimally (open attribute, a close event, and a
// cancelable cancel event), rather than changing production code to a div.
interface DialogShim extends HTMLDialogElement {
  __esc?: (event: KeyboardEvent) => void
}
if (typeof HTMLDialogElement !== 'undefined') {
  const proto = HTMLDialogElement.prototype as DialogShim
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: DialogShim) {
      this.open = true
      this.__esc = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          const cancel = new Event('cancel', { cancelable: true })
          this.dispatchEvent(cancel)
          if (!cancel.defaultPrevented) this.close()
        }
      }
      document.addEventListener('keydown', this.__esc)
    }
  }
  if (typeof proto.close !== 'function') {
    proto.close = function (this: DialogShim) {
      this.open = false
      if (this.__esc) document.removeEventListener('keydown', this.__esc)
      this.dispatchEvent(new Event('close'))
    }
  }
}
