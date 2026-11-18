import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CharacterGrid, type GridCell } from '@app/grid'
import { setMotionOverride, __resetMotion } from '@app/a11y/motion'

function mockMedia({ narrow = false, reduce = false } = {}): void {
  window.matchMedia = vi.fn((q: string) => ({
    matches: q.includes('max-width')
      ? narrow
      : q.includes('reduced-motion')
        ? reduce
        : false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

function grid(chars: string[][], hooks: Record<string, string> = {}): GridCell[][] {
  return chars.map((row, r) =>
    row.map((char, c) => {
      const hook = hooks[`${r},${c}`]
      return hook ? { char, classHook: hook } : { char }
    }),
  )
}

beforeEach(() => {
  __resetMotion()
  mockMedia()
})
afterEach(() => {
  cleanup()
  __resetMotion()
  vi.restoreAllMocks()
})

describe('CharacterGrid', () => {
  it('is a pure function of props: identical props, identical markup', () => {
    const cells = grid([
      ['A', 'B'],
      ['C', 'D'],
    ])
    const first = render(<CharacterGrid cells={cells} />)
    const htmlA = first.container.innerHTML
    first.unmount()
    const second = render(<CharacterGrid cells={cells} />)
    expect(second.container.innerHTML).toBe(htmlA)
  })

  it('arrow keys move the selection and fire the callback with the coordinate', () => {
    const onSelect = vi.fn()
    const cells = grid([
      ['A', 'B', 'C'],
      ['D', 'E', 'F'],
    ])
    render(
      <CharacterGrid
        cells={cells}
        selection={{ row: 0, col: 1 }}
        onSelect={onSelect}
      />,
    )
    const g = screen.getByRole('grid')
    fireEvent.keyDown(g, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenLastCalledWith(0, 2)
    fireEvent.keyDown(g, { key: 'ArrowDown' })
    expect(onSelect).toHaveBeenLastCalledWith(1, 1)
  })

  it('does not move selection past the edges', () => {
    const onSelect = vi.fn()
    render(
      <CharacterGrid
        cells={grid([['A', 'B']])}
        selection={{ row: 0, col: 0 }}
        onSelect={onSelect}
      />,
    )
    fireEvent.keyDown(screen.getByRole('grid'), { key: 'ArrowUp' })
    expect(onSelect).toHaveBeenLastCalledWith(0, 0)
  })

  it('tapping a cell selects it', () => {
    const onSelect = vi.fn()
    render(<CharacterGrid cells={grid([['A', 'B']])} onSelect={onSelect} />)
    const cells = screen.getAllByRole('gridcell')
    fireEvent.pointerDown(cells[1]!)
    expect(onSelect).toHaveBeenCalledWith(0, 1)
  })

  it('reaches a 44px tap target via padding on narrow screens', () => {
    mockMedia({ narrow: true })
    render(<CharacterGrid cells={grid([['A']])} />)
    expect(screen.getAllByRole('gridcell')[0]).toHaveClass('char-cell-tap')
  })

  it('applies the compact class under the width breakpoint', () => {
    mockMedia({ narrow: true })
    render(<CharacterGrid cells={grid([['A']])} />)
    expect(screen.getByRole('grid')).toHaveClass('char-grid-compact')
    expect(screen.getByRole('grid')).toHaveAttribute('data-compact', 'true')
  })

  it('renders a per-cell class hook on its element', () => {
    render(<CharacterGrid cells={grid([['A', 'B']], { '0,1': 'danger' })} />)
    expect(screen.getAllByRole('gridcell')[1]).toHaveClass('danger')
  })

  it('applies glow only at the container; no cell carries a shadow class', () => {
    render(<CharacterGrid cells={grid([['A', 'B']])} />)
    expect(screen.getByRole('grid')).toHaveClass('char-grid-glow')
    for (const cell of screen.getAllByRole('gridcell')) {
      expect(cell).not.toHaveClass('char-grid-glow')
    }
  })

  it('renders the legend slot when provided', () => {
    render(
      <CharacterGrid cells={grid([['A']])} legend={<span>KEY: A=alpha</span>} />,
    )
    expect(screen.getByTestId('grid-legend')).toHaveTextContent('KEY: A=alpha')
  })

  it('points aria-activedescendant at the selected cell for AT users', () => {
    render(
      <CharacterGrid
        cells={grid([
          ['A', 'B'],
          ['C', 'D'],
        ])}
        selection={{ row: 1, col: 0 }}
      />,
    )
    const g = screen.getByRole('grid')
    const active = g.getAttribute('aria-activedescendant')
    expect(active).toBeTruthy()
    const selectedCell = screen.getAllByRole('gridcell').find(
      (c) => c.getAttribute('aria-selected') === 'true',
    )
    expect(selectedCell?.id).toBe(active)
  })

  it('has no aria-activedescendant when nothing is selected', () => {
    render(<CharacterGrid cells={grid([['A']])} />)
    expect(screen.getByRole('grid')).not.toHaveAttribute(
      'aria-activedescendant',
    )
  })

  it('selection highlight transitions only when motion is allowed', () => {
    const cells = grid([['A', 'B']])
    const { rerender } = render(
      <CharacterGrid cells={cells} selection={{ row: 0, col: 0 }} />,
    )
    expect(screen.getAllByRole('gridcell')[0]).toHaveClass('char-cell-anim')
    setMotionOverride('reduce')
    rerender(<CharacterGrid cells={cells} selection={{ row: 0, col: 0 }} />)
    expect(screen.getAllByRole('gridcell')[0]).not.toHaveClass('char-cell-anim')
  })
})
