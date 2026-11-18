import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PlayBranchTrace } from '@app/grid'
import { setMotionOverride, __resetMotion } from '@app/a11y/motion'
import type { BranchStep } from '@engine'

const STEPS: BranchStep[] = [
  { step: 1, label: 'SPOOL', detail: 'routes loaded' },
  { step: 2, label: 'SOLVE', detail: 'no win found' },
  { step: 3, label: 'HALT', detail: 'the only move is not to play' },
]

beforeEach(() => {
  __resetMotion()
})
afterEach(() => {
  cleanup()
  __resetMotion()
  vi.useRealTimers()
})

describe('PlayBranchTrace', () => {
  it('reveals steps sequentially at a watchable pace', () => {
    vi.useFakeTimers()
    render(<PlayBranchTrace steps={STEPS} stepMs={400} />)
    expect(screen.getAllByTestId('branch-step')).toHaveLength(1)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(screen.getAllByTestId('branch-step')).toHaveLength(2)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(screen.getAllByTestId('branch-step')).toHaveLength(3)
  })

  it('skip jumps to the final state with every result readable', () => {
    vi.useFakeTimers()
    render(<PlayBranchTrace steps={STEPS} stepMs={400} />)
    fireEvent.click(screen.getByTestId('branch-skip'))
    const rendered = screen.getAllByTestId('branch-step')
    expect(rendered).toHaveLength(3)
    expect(screen.getByText('the only move is not to play')).toBeInTheDocument()
    expect(screen.queryByTestId('branch-skip')).toBeNull()
  })

  it('under reduced motion every step is present at once', () => {
    setMotionOverride('reduced')
    render(<PlayBranchTrace steps={STEPS} />)
    expect(screen.getAllByTestId('branch-step')).toHaveLength(3)
    expect(screen.queryByTestId('branch-skip')).toBeNull()
  })

  it('a parent re-render with a fresh array of the same content does not rewind', () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <PlayBranchTrace steps={STEPS} stepMs={400} />,
    )
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(screen.getAllByTestId('branch-step')).toHaveLength(2)
    // A new array identity with identical step content (what an inline prop
    // produces every render) must not reset playback to step 1.
    rerender(
      <PlayBranchTrace steps={STEPS.map((s) => ({ ...s }))} stepMs={400} />,
    )
    expect(screen.getAllByTestId('branch-step')).toHaveLength(2)
  })

  it('fires onDone once when a sequence completes, and again for a new sequence', () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    const { rerender } = render(
      <PlayBranchTrace steps={STEPS} stepMs={400} onDone={onDone} />,
    )
    act(() => {
      vi.advanceTimersByTime(800)
    })
    expect(onDone).toHaveBeenCalledTimes(1)
    const next: BranchStep[] = [{ step: 9, label: 'NEW', detail: 'run two' }]
    rerender(<PlayBranchTrace steps={next} stepMs={400} onDone={onDone} />)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(onDone).toHaveBeenCalledTimes(2)
  })

  it('an empty steps array renders a stable terminal state without throwing', () => {
    expect(() => render(<PlayBranchTrace steps={[]} />)).not.toThrow()
    expect(screen.getByTestId('branch-trace-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('branch-skip')).toBeNull()
  })
})
