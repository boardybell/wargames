// A fixed-width character grid rendered as DOM text rows, not canvas. Pure
// function of props: identical props produce identical markup and nothing
// scrolls or animates in the base state. Glow is a single container-level
// class; cells never carry a shadow layer of their own. The only thing that
// may transition is the selection highlight, and only when motion is allowed.
import type { ReactNode } from 'react'
import { useReducedMotion } from '../a11y/motion'
import { shouldHandleKey } from '../a11y/keyHandler'
import { useNarrowViewport } from './useNarrow'
import './grid.css'

export interface GridCell {
  readonly char: string
  /** One per-cell class hook; the theme token it names carries at most one
   *  shadow layer so the grid never stacks glows. */
  readonly classHook?: string
}

export interface GridSelection {
  readonly row: number
  readonly col: number
}

export interface CharacterGridProps {
  readonly cells: readonly (readonly GridCell[])[]
  readonly legend?: ReactNode
  readonly selection?: GridSelection | null
  readonly onSelect?: (row: number, col: number) => void
  /** Force compact pitch; otherwise it follows the narrow breakpoint. */
  readonly compact?: boolean
  /** Base id for per-cell ids and aria-activedescendant. Deterministic so the
   *  render stays pure; pass a unique value when more than one grid is on the
   *  page. */
  readonly id?: string
}

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
}

function clamp(value: number, max: number): number {
  if (value < 0) return 0
  if (value > max) return max
  return value
}

export function CharacterGrid({
  cells,
  legend,
  selection = null,
  onSelect,
  compact,
  id = 'wg-grid',
}: CharacterGridProps) {
  const reduced = useReducedMotion()
  const narrow = useNarrowViewport()
  const isCompact = compact === true || narrow
  const cellId = (r: number, c: number): string => `${id}-cell-${r}-${c}`

  const rows = cells.length
  const cols = cells[0]?.length ?? 0
  const activeDescendant =
    selection && selection.row >= 0 && selection.col >= 0
      ? cellId(selection.row, selection.col)
      : undefined

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const delta = ARROWS[event.key]
    if (!delta || !shouldHandleKey(event)) return
    if (!onSelect || rows === 0 || cols === 0) return
    event.preventDefault()
    const base = selection ?? { row: 0, col: 0 }
    const nextRow = clamp(base.row + delta[0], rows - 1)
    const nextCol = clamp(base.col + delta[1], cols - 1)
    onSelect(nextRow, nextCol)
  }

  const containerClass = [
    'char-grid',
    'char-grid-glow',
    isCompact ? 'char-grid-compact' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="char-grid-wrap" data-testid="character-grid">
      <div
        className={containerClass}
        role="grid"
        tabIndex={0}
        data-compact={isCompact ? 'true' : undefined}
        aria-activedescendant={activeDescendant}
        onKeyDown={onKeyDown}
      >
        {cells.map((row, r) => (
          <div className="char-row" role="row" key={r}>
            {row.map((cell, c) => {
              const selected =
                selection?.row === r && selection?.col === c
              const cellClass = [
                'char-cell',
                cell.classHook ?? '',
                // Tap padding tracks a physically narrow (touch) viewport, not
                // the compact prop, which is only a pitch override.
                narrow ? 'char-cell-tap' : '',
                selected ? 'char-cell-selected' : '',
                selected && !reduced ? 'char-cell-anim' : '',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <span
                  key={c}
                  id={cellId(r, c)}
                  className={cellClass}
                  role="gridcell"
                  aria-selected={selected || undefined}
                  data-row={r}
                  data-col={c}
                  onPointerDown={
                    onSelect ? () => onSelect(r, c) : undefined
                  }
                >
                  {cell.char}
                </span>
              )
            })}
          </div>
        ))}
      </div>
      {legend ? (
        <div className="char-grid-legend" data-testid="grid-legend">
          {legend}
        </div>
      ) : null}
    </div>
  )
}
