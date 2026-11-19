// FALKENS MAZE. A STRANGE GAME. Navigate a freshly generated perfect maze from
// the start (top-left) to the exit (bottom-right) with the arrow keys or the
// on-screen direction pad. Walls block movement, reaching the exit WINS, a move
// counter tracks every step, and a new random maze is generated each play.
// Self-contained: the maze is a perfect maze carved by a recursive-backtracker
// DFS, so a solution always exists.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameEntry, GameProps } from './types'

const COLS = 11
const ROWS = 11

// A cell knows which of its four walls are still standing. The carver knocks
// walls down to connect cells into one spanning tree (a perfect maze).
interface Cell {
  n: boolean
  e: boolean
  s: boolean
  w: boolean
  seen: boolean
}

interface Maze {
  readonly cells: Cell[]
  readonly cols: number
  readonly rows: number
}

const idx = (c: number, r: number): number => r * COLS + c

// Recursive backtracker carved iteratively so deep mazes never blow the stack.
function generate(): Maze {
  const cells: Cell[] = Array.from({ length: COLS * ROWS }, () => ({
    n: true,
    e: true,
    s: true,
    w: true,
    seen: false,
  }))
  const stack: Array<{ c: number; r: number }> = []
  let c = 0
  let r = 0
  cells[idx(c, r)]!.seen = true
  stack.push({ c, r })

  while (stack.length > 0) {
    const top = stack[stack.length - 1]!
    c = top.c
    r = top.r
    const nbrs: Array<{ c: number; r: number; dir: 'n' | 'e' | 's' | 'w' }> = []
    if (r > 0 && !cells[idx(c, r - 1)]!.seen) nbrs.push({ c, r: r - 1, dir: 'n' })
    if (c < COLS - 1 && !cells[idx(c + 1, r)]!.seen) nbrs.push({ c: c + 1, r, dir: 'e' })
    if (r < ROWS - 1 && !cells[idx(c, r + 1)]!.seen) nbrs.push({ c, r: r + 1, dir: 's' })
    if (c > 0 && !cells[idx(c - 1, r)]!.seen) nbrs.push({ c: c - 1, r, dir: 'w' })

    if (nbrs.length === 0) {
      stack.pop()
      continue
    }
    const pick = nbrs[Math.floor(Math.random() * nbrs.length)]!
    const here = cells[idx(c, r)]!
    const there = cells[idx(pick.c, pick.r)]!
    if (pick.dir === 'n') {
      here.n = false
      there.s = false
    } else if (pick.dir === 'e') {
      here.e = false
      there.w = false
    } else if (pick.dir === 's') {
      here.s = false
      there.n = false
    } else {
      here.w = false
      there.e = false
    }
    there.seen = true
    stack.push({ c: pick.c, r: pick.r })
  }
  return { cells, cols: COLS, rows: ROWS }
}

interface Pos {
  readonly c: number
  readonly r: number
}
const START: Pos = { c: 0, r: 0 }
const EXIT: Pos = { c: COLS - 1, r: ROWS - 1 }

function FalkensMaze({ onExit }: GameProps) {
  const [maze, setMaze] = useState<Maze>(() => generate())
  const [pos, setPos] = useState<Pos>(START)
  const [moves, setMoves] = useState(0)
  const [won, setWon] = useState(false)

  const move = useCallback(
    (dir: 'n' | 'e' | 's' | 'w'): void => {
      if (won) return
      setPos((p) => {
        const cell = maze.cells[idx(p.c, p.r)]!
        if (cell[dir]) return p // a wall blocks this direction
        const next: Pos =
          dir === 'n'
            ? { c: p.c, r: p.r - 1 }
            : dir === 'e'
              ? { c: p.c + 1, r: p.r }
              : dir === 's'
                ? { c: p.c, r: p.r + 1 }
                : { c: p.c - 1, r: p.r }
        setMoves((m) => m + 1)
        if (next.c === EXIT.c && next.r === EXIT.r) setWon(true)
        return next
      })
    },
    [maze, won],
  )

  // Keyboard control lives on a focusable root so arrows never scroll the page.
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  const onKey = (e: React.KeyboardEvent): void => {
    const k = e.key
    if (k === 'ArrowUp' || k === 'w' || k === 'W') {
      e.preventDefault()
      move('n')
    } else if (k === 'ArrowRight' || k === 'd' || k === 'D') {
      e.preventDefault()
      move('e')
    } else if (k === 'ArrowDown' || k === 's' || k === 'S') {
      e.preventDefault()
      move('s')
    } else if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
      e.preventDefault()
      move('w')
    }
  }

  const playAgain = (): void => {
    setMaze(generate())
    setPos(START)
    setMoves(0)
    setWon(false)
    rootRef.current?.focus()
  }

  // Render the maze as monospace glyphs. Each cell is two chars wide so the grid
  // reads square-ish in a terminal font. Walls are drawn from each cell's own
  // flags; the player is @, the exit is >.
  const rows = useMemo(() => {
    const out: string[] = []
    // Top border.
    let top = '+'
    for (let x = 0; x < maze.cols; x++) top += '--+'
    out.push(top)
    for (let r = 0; r < maze.rows; r++) {
      let mid = '|'
      let bot = '+'
      for (let c = 0; c < maze.cols; c++) {
        const cell = maze.cells[idx(c, r)]!
        const here = c === pos.c && r === pos.r
        const isExit = c === EXIT.c && r === EXIT.r
        const glyph = here ? ' @' : isExit ? ' >' : '  '
        mid += glyph + (cell.e ? '|' : ' ')
        bot += (cell.s ? '--' : '  ') + '+'
      }
      out.push(mid)
      out.push(bot)
    }
    return out
  }, [maze, pos])

  return (
    <div
      className="wg-screen"
      data-testid="game-falkens-maze"
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKey}
      style={{ outline: 'none' }}
    >
      <div className="wg-out">
        <div className="wg-dim">FALKENS MAZE</div>
        <div className="wg-dim" style={{ marginBottom: '0.4rem' }}>
          A STRANGE GAME. FIND THE EXIT ( &gt; ).   MOVES {moves}
        </div>

        <pre
          style={{
            margin: '0 0 0.6rem',
            lineHeight: 1,
            fontFamily: 'inherit',
            letterSpacing: '0',
          }}
        >
          {rows.join('\n')}
        </pre>

        {won && (
          <div className="wg-big wg-amber" style={{ marginBottom: '0.4rem' }}>
            YOU REACHED THE EXIT IN {moves} MOVES. YOU WIN.
          </div>
        )}

        <div className="wg-opts">
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="wg-opt"
              onClick={() => move('n')}
              data-testid="maze-up"
              disabled={won}
            >
              [ UP ]
            </button>
            <button
              type="button"
              className="wg-opt"
              onClick={() => move('w')}
              data-testid="maze-left"
              disabled={won}
            >
              [ LEFT ]
            </button>
            <button
              type="button"
              className="wg-opt"
              onClick={() => move('s')}
              data-testid="maze-down"
              disabled={won}
            >
              [ DOWN ]
            </button>
            <button
              type="button"
              className="wg-opt"
              onClick={() => move('e')}
              data-testid="maze-right"
              disabled={won}
            >
              [ RIGHT ]
            </button>
          </div>
          {won && (
            <button
              type="button"
              className="wg-opt"
              onClick={playAgain}
              data-testid="maze-again"
            >
              &gt; PLAY AGAIN
            </button>
          )}
          <button
            type="button"
            className="wg-opt wg-amber"
            onClick={onExit}
            data-testid="game-exit"
          >
            &gt; EXIT
          </button>
        </div>

        <div className="wg-hint">
          ARROW KEYS OR WASD TO MOVE. WALLS BLOCK YOU. A FRESH MAZE EACH PLAY.
        </div>
      </div>
    </div>
  )
}

export const entry: GameEntry = { id: 'FALKENS MAZE', Component: FalkensMaze }
