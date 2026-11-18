import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { Countdown } from '@app/cabinet'
import { captureClock, tickOnce, __resetClock } from '@app/state/displayClock'
import { onAnnounce, __resetAnnounce } from '@app/a11y/announce'

function mockMedia(narrow: boolean): void {
  window.matchMedia = vi.fn((q: string) => ({
    matches: q.includes('max-width') ? narrow : false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  __resetClock()
  __resetAnnounce()
  mockMedia(false)
})
afterEach(() => {
  cleanup()
  __resetClock()
  __resetAnnounce()
  vi.restoreAllMocks()
})

describe('Countdown', () => {
  it('carries role="timer"', () => {
    captureClock(0)
    render(<Countdown endsAt={60_000} />)
    expect(screen.getByRole('timer')).toBeInTheDocument()
  })

  it('renders dot-matrix numerals on wide layouts, the line below the breakpoint', () => {
    captureClock(0)
    const { unmount } = render(<Countdown endsAt={60_000} />)
    expect(screen.getByTestId('countdown-dotmatrix')).toBeInTheDocument()
    expect(screen.queryByTestId('countdown-line')).toBeNull()
    unmount()

    mockMedia(true)
    render(<Countdown endsAt={60_000} />)
    expect(screen.getByTestId('countdown-line')).toBeInTheDocument()
    expect(screen.queryByTestId('countdown-dotmatrix')).toBeNull()
  })

  it('a deadline already passed displays zero, never a negative', () => {
    // Captured engine time is past the deadline.
    captureClock(70_000)
    render(<Countdown endsAt={60_000} />)
    expect(screen.getByTestId('countdown-dotmatrix')).toHaveTextContent('00:00')
  })

  it('never increases on a backward wall-clock jump (it never reads Date.now)', () => {
    let t = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => t)
    // The display reads only the engine's captured lastNow plus a monotonic
    // performance delta; Date.now going backward must not reach it.
    vi.spyOn(Date, 'now').mockReturnValue(500)
    captureClock(0)
    render(<Countdown endsAt={60_000} />)
    const readings: string[] = []
    const read = (): void => {
      readings.push(
        screen.getByTestId('countdown-dotmatrix').textContent ?? '',
      )
    }
    read()
    for (const next of [2000, 3000, 4000]) {
      t = next
      // Simulate a backward system clock between repaints.
      vi.spyOn(Date, 'now').mockReturnValue(100)
      act(() => {
        tickOnce(() => {})
      })
      read()
    }
    const asSeconds = readings.map((r) => {
      const [m, s] = r.split(':').map(Number)
      return m! * 60 + s!
    })
    for (let i = 1; i < asSeconds.length; i++) {
      expect(asSeconds[i]!).toBeLessThanOrEqual(asSeconds[i - 1]!)
    }
  })

  it('produces no announcements from the ticker path', () => {
    const sink = vi.fn()
    onAnnounce(sink)
    captureClock(0)
    render(<Countdown endsAt={60_000} />)
    act(() => {
      tickOnce(() => {})
      tickOnce(() => {})
    })
    expect(sink).not.toHaveBeenCalled()
  })
})
