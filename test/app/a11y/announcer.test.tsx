import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { LiveRegions } from '@app/a11y/LiveRegions'
import { announce, __resetAnnounce } from '@app/a11y/announce'

beforeEach(() => {
  __resetAnnounce()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
  __resetAnnounce()
})

const polite = () => screen.getByTestId('live-polite')
const assertive = () => screen.getByTestId('live-assertive')

describe('LiveRegions and announcer', () => {
  it('both regions exist from boot with the right roles', () => {
    render(<LiveRegions />)
    expect(polite()).toHaveAttribute('role', 'status')
    expect(polite()).toHaveAttribute('aria-atomic', 'true')
    expect(assertive()).toHaveAttribute('role', 'alert')
  })

  it('advancing timers without an announce mutates nothing', () => {
    render(<LiveRegions />)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(polite()).toHaveAttribute('data-seq', '0')
    expect(polite()).toHaveTextContent('')
    expect(assertive()).toHaveAttribute('data-seq', '0')
  })

  it('polite coalesces identical strings within the window into one utterance', () => {
    render(<LiveRegions />)
    act(() => {
      announce('MISSION ALPHA RESOLVED', 'polite')
      announce('MISSION ALPHA RESOLVED', 'polite')
    })
    act(() => {
      vi.advanceTimersByTime(800)
    })
    expect(polite()).toHaveTextContent('MISSION ALPHA RESOLVED')
    expect(polite()).toHaveAttribute('data-seq', '1')
  })

  it('polite flushes distinct strings from one window as a single ordered utterance', () => {
    render(<LiveRegions />)
    act(() => {
      announce('FIRST', 'polite')
      announce('SECOND', 'polite')
    })
    act(() => {
      vi.advanceTimersByTime(800)
    })
    // Bounded: one window, one utterance carrying both distinct strings in
    // arrival order. A finale burst reads once, not as an 800ms-per-item drip.
    expect(polite()).toHaveTextContent('FIRST. SECOND')
    expect(polite()).toHaveAttribute('data-seq', '1')
  })

  it('a later window flushes its own batch (sequence bumps per window)', () => {
    render(<LiveRegions />)
    act(() => announce('ONE', 'polite'))
    act(() => vi.advanceTimersByTime(800))
    expect(polite()).toHaveTextContent('ONE')
    expect(polite()).toHaveAttribute('data-seq', '1')
    act(() => announce('TWO', 'polite'))
    act(() => vi.advanceTimersByTime(800))
    expect(polite()).toHaveTextContent('TWO')
    expect(polite()).toHaveAttribute('data-seq', '2')
  })

  it('an identical polite string across windows retriggers (sequence bumps)', () => {
    render(<LiveRegions />)
    act(() => announce('ALERT', 'polite'))
    act(() => vi.advanceTimersByTime(800))
    expect(polite()).toHaveAttribute('data-seq', '1')
    act(() => announce('ALERT', 'polite'))
    act(() => vi.advanceTimersByTime(800))
    expect(polite()).toHaveTextContent('ALERT')
    expect(polite()).toHaveAttribute('data-seq', '2')
  })

  it('assertive never coalesces: two identical announcements both land', () => {
    render(<LiveRegions />)
    act(() => {
      announce('DEFCON 1', 'assertive')
      announce('DEFCON 1', 'assertive')
    })
    expect(assertive()).toHaveTextContent('DEFCON 1')
    expect(assertive()).toHaveAttribute('data-seq', '2')
  })

  it('assertive fires while a modal dialog is open', () => {
    render(
      <div>
        <LiveRegions />
        <dialog data-testid="modal" open>
          trapped
        </dialog>
      </div>,
    )
    act(() => announce('FINAL PHASE', 'assertive'))
    // The region is outside the dialog but still receives the text.
    expect(assertive()).toHaveTextContent('FINAL PHASE')
  })
})
