import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useTypeIn, CHAR_INTERVAL_MS } from '@app/crt'

function setReducedMotion(matches: boolean): void {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: '',
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as typeof window.matchMedia
}

function TypeInView(props: {
  text: string
  reducedMotion?: boolean
  onTick?: () => void
  onComplete?: () => void
}) {
  const { visibleCount, running, complete } = useTypeIn({
    text: props.text,
    reducedMotion: props.reducedMotion ?? false,
    onTick: props.onTick,
    onComplete: props.onComplete,
  })
  return (
    <button data-testid="view" data-running={running} onClick={complete}>
      <span data-testid="visible">{props.text.slice(0, visibleCount)}</span>
      {/* Full text is always in the DOM for assistive tech. */}
      <span data-testid="full">{props.text}</span>
    </button>
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  setReducedMotion(false)
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  vi.restoreAllMocks()
})

describe('useTypeIn reveal', () => {
  it('reveals text progressively over time', () => {
    render(<TypeInView text="HELLO" />)
    expect(screen.getByTestId('visible').textContent).toBe('')
    act(() => vi.advanceTimersByTime(CHAR_INTERVAL_MS))
    expect(screen.getByTestId('visible').textContent).toBe('H')
    act(() => vi.advanceTimersByTime(CHAR_INTERVAL_MS * 2))
    expect(screen.getByTestId('visible').textContent).toBe('HEL')
  })

  it('fires a key-tick cue per revealed character', () => {
    const onTick = vi.fn()
    render(<TypeInView text="ABCD" onTick={onTick} />)
    act(() => vi.advanceTimersByTime(CHAR_INTERVAL_MS * 4))
    expect(onTick).toHaveBeenCalledTimes(4)
  })

  it('keeps the full text in the DOM while the visible portion is partial', () => {
    render(<TypeInView text="SHALL WE PLAY" />)
    act(() => vi.advanceTimersByTime(CHAR_INTERVAL_MS * 2))
    expect(screen.getByTestId('full').textContent).toBe('SHALL WE PLAY')
    expect(screen.getByTestId('visible').textContent).toBe('SH')
  })

  it('a click completes the reveal instantly', () => {
    render(<TypeInView text="GREETINGS" />)
    act(() => vi.advanceTimersByTime(CHAR_INTERVAL_MS))
    fireEvent.click(screen.getByTestId('view'))
    expect(screen.getByTestId('visible').textContent).toBe('GREETINGS')
    expect(screen.getByTestId('view').getAttribute('data-running')).toBe('false')
  })

  it('onComplete fires exactly once when the reveal runs to the end', () => {
    const onComplete = vi.fn()
    render(<TypeInView text="HI" onComplete={onComplete} />)
    act(() => vi.advanceTimersByTime(CHAR_INTERVAL_MS * 5))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('restarts cleanly when the text prop changes', () => {
    const onComplete = vi.fn()
    const { rerender } = render(
      <TypeInView text="FIRST" onComplete={onComplete} />,
    )
    act(() => vi.advanceTimersByTime(CHAR_INTERVAL_MS * 5))
    expect(screen.getByTestId('visible').textContent).toBe('FIRST')
    expect(onComplete).toHaveBeenCalledTimes(1)
    // New text: the reveal must reset to empty and fire onComplete again.
    rerender(<TypeInView text="NEXT" onComplete={onComplete} />)
    expect(screen.getByTestId('visible').textContent).toBe('')
    expect(screen.getByTestId('full').textContent).toBe('NEXT')
    act(() => vi.advanceTimersByTime(CHAR_INTERVAL_MS * 4))
    expect(screen.getByTestId('visible').textContent).toBe('NEXT')
    expect(onComplete).toHaveBeenCalledTimes(2)
  })

  it('onComplete fires exactly once when skipped', () => {
    const onComplete = vi.fn()
    render(<TypeInView text="HELLO" onComplete={onComplete} />)
    act(() => vi.advanceTimersByTime(CHAR_INTERVAL_MS))
    fireEvent.click(screen.getByTestId('view'))
    act(() => vi.advanceTimersByTime(CHAR_INTERVAL_MS * 10))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})

describe('useTypeIn instant completion', () => {
  it('completes instantly under prefers-reduced-motion', () => {
    setReducedMotion(true)
    const onComplete = vi.fn()
    render(<TypeInView text="INSTANT" onComplete={onComplete} />)
    expect(screen.getByTestId('visible').textContent).toBe('INSTANT')
    expect(screen.getByTestId('view').getAttribute('data-running')).toBe('false')
    act(() => vi.advanceTimersByTime(CHAR_INTERVAL_MS))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('completes instantly under the injected motion override', () => {
    const onComplete = vi.fn()
    render(
      <TypeInView text="OVERRIDE" reducedMotion={true} onComplete={onComplete} />,
    )
    expect(screen.getByTestId('visible').textContent).toBe('OVERRIDE')
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
