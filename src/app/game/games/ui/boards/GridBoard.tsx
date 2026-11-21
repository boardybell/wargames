// Shared square-grid board for chess, checkers and the small tactical grids.
// Coordinates on the edges, one roving tab stop with arrow-key navigation,
// Enter/Space to activate, and per-cell state classes (selected, legal target,
// last move, threat). Cell content is supplied by the game.
import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export interface CellState {
  readonly selected?: boolean
  readonly legal?: boolean
  readonly capture?: boolean
  readonly last?: boolean
  readonly check?: boolean
  readonly dark?: boolean
  /** Fog / unobserved. */
  readonly fog?: boolean
  readonly terrain?: string
  readonly inRange?: boolean
  readonly path?: boolean
}

export interface GridBoardProps {
  readonly cols: number
  readonly rows: number
  /** Cell content; (x, y) with y=0 the top row on screen. */
  readonly cell: (x: number, y: number) => ReactNode
  readonly state?: (x: number, y: number) => CellState | undefined
  readonly label: (x: number, y: number) => string
  readonly onActivate?: (x: number, y: number) => void
  /** Column labels left→right, row labels top→bottom. */
  readonly colLabels?: readonly string[]
  readonly rowLabels?: readonly string[]
  readonly ariaLabel: string
  readonly testId?: string
  /** CSS max size of the board square in px (the board is fitted to width). */
  readonly maxPx?: number
  readonly className?: string
  readonly checkered?: boolean
  readonly overlay?: ReactNode
}

export function GridBoard(p: GridBoardProps) {
  const [focus, setFocus] = useState<[number, number]>([0, p.rows - 1])
  const ref = useRef<HTMLDivElement>(null)
  const move = useCallback(
    (x: number, y: number) => {
      const nx = Math.max(0, Math.min(p.cols - 1, x))
      const ny = Math.max(0, Math.min(p.rows - 1, y))
      setFocus([nx, ny])
      const el = ref.current?.querySelector<HTMLElement>(`[data-x="${nx}"][data-y="${ny}"]`)
      el?.focus()
    },
    [p.cols, p.rows],
  )
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    const [x, y] = focus
    const map: Record<string, [number, number]> = {
      ArrowLeft: [x - 1, y],
      ArrowRight: [x + 1, y],
      ArrowUp: [x, y - 1],
      ArrowDown: [x, y + 1],
      Home: [0, y],
      End: [p.cols - 1, y],
    }
    const to = map[e.key]
    if (to) {
      e.preventDefault()
      e.stopPropagation()
      move(to[0], to[1])
    } else if ((e.key === 'Enter' || e.key === ' ') && p.onActivate) {
      e.preventDefault()
      e.stopPropagation()
      p.onActivate(x, y)
    }
  }
  const rowsOut: ReactNode[] = []
  for (let y = 0; y < p.rows; y++) {
    const cells: ReactNode[] = []
    for (let x = 0; x < p.cols; x++) {
      const st = p.state?.(x, y) ?? {}
      const dark = p.checkered ? (x + y) % 2 === 1 : st.dark
      const cls = [
        'gs-cell',
        dark ? 'is-dark' : 'is-light',
        st.selected ? 'is-selected' : '',
        st.legal ? 'is-legal' : '',
        st.capture ? 'is-capture' : '',
        st.last ? 'is-last' : '',
        st.check ? 'is-check' : '',
        st.fog ? 'is-fog' : '',
        st.inRange ? 'is-range' : '',
        st.path ? 'is-path' : '',
        st.terrain ? `t-${st.terrain}` : '',
      ]
        .filter(Boolean)
        .join(' ')
      const isFocus = focus[0] === x && focus[1] === y
      cells.push(
        <div
          key={`${x},${y}`}
          role="gridcell"
          className={cls}
          data-x={x}
          data-y={y}
          tabIndex={isFocus ? 0 : -1}
          aria-label={p.label(x, y)}
          aria-selected={st.selected || undefined}
          onClick={() => {
            setFocus([x, y])
            p.onActivate?.(x, y)
          }}
          onFocus={() => setFocus([x, y])}
        >
          {p.cell(x, y)}
        </div>,
      )
    }
    rowsOut.push(
      <div key={y} role="row" className="gs-row">
        {cells}
      </div>,
    )
  }
  return (
    <div
      className={`gs-board-wrap${p.className ? ` ${p.className}` : ''}`}
      style={{ ['--cols' as string]: p.cols, ['--rows' as string]: p.rows, ['--board-max' as string]: `${p.maxPx ?? 640}px` }}
      data-testid={p.testId}
    >
      {p.colLabels && (
        <div className="gs-coords gs-coords-top" aria-hidden="true">
          {p.colLabels.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      )}
      <div className="gs-board-row">
        {p.rowLabels && (
          <div className="gs-coords gs-coords-left" aria-hidden="true">
            {p.rowLabels.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        )}
        <div className="gs-board" role="grid" aria-label={p.ariaLabel} ref={ref} onKeyDown={onKey}>
          {rowsOut}
          {p.overlay}
        </div>
      </div>
    </div>
  )
}
