import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TicTacToeView } from '@app/games'
import type { Cell } from '@app/games'

function renderBoard(cells: readonly Cell[]) {
  return (
    <span data-testid="board">
      {cells.map((c) => c ?? '.').join('')}
    </span>
  )
}

function filled(cells: string): number {
  return cells.split('').filter((c) => c !== '.').length
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('TicTacToeView', () => {
  it('reveals moves one at a time at a watchable pace', () => {
    vi.useFakeTimers()
    render(<TicTacToeView renderBoard={renderBoard} reducedMotion={false} stepMs={300} />)
    expect(filled(screen.getByTestId('board').textContent ?? '')).toBe(0)
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(filled(screen.getByTestId('board').textContent ?? '')).toBe(1)
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(filled(screen.getByTestId('board').textContent ?? '')).toBe(2)
  })

  it('skip jumps to the final drawn board, which stays readable', () => {
    vi.useFakeTimers()
    render(<TicTacToeView renderBoard={renderBoard} reducedMotion={false} />)
    fireEvent.click(screen.getByTestId('tictactoe-skip'))
    expect(filled(screen.getByTestId('board').textContent ?? '')).toBe(9)
    expect(screen.queryByTestId('tictactoe-skip')).toBeNull()
    expect(screen.getByTestId('tictactoe-status')).toHaveTextContent(
      'NOT TO PLAY',
    )
  })

  it('renders the final board instantly under reduced motion', () => {
    render(<TicTacToeView renderBoard={renderBoard} reducedMotion={true} />)
    expect(filled(screen.getByTestId('board').textContent ?? '')).toBe(9)
    expect(screen.queryByTestId('tictactoe-skip')).toBeNull()
  })

  it('does not re-fire onDone when a prop changes after completion', () => {
    const onDone = vi.fn()
    const { rerender } = render(
      <TicTacToeView
        renderBoard={renderBoard}
        reducedMotion={true}
        onDone={onDone}
      />,
    )
    expect(onDone).toHaveBeenCalledTimes(1)
    // A motion/pace flip after the game is done must not re-arm the latch.
    rerender(
      <TicTacToeView
        renderBoard={renderBoard}
        reducedMotion={false}
        onDone={onDone}
      />,
    )
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
