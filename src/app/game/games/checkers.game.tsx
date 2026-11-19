// CHECKERS. Real 8x8 American draughts on the WOPR terminal. You are the light
// pieces (moving up the board); a simple AI plays the dark pieces. Diagonal
// single steps, jumps over an adjacent enemy to an empty square, multi-jump
// chains (you must continue a jump with the same piece if more jumps exist),
// kinging on the far back rank, and kings moving both directions. The AI prefers
// captures and otherwise plays a random legal move. You win when the opponent
// has no pieces or no legal move. Rule note: captures are legal but not forced
// (jumps are offered, never mandatory), kept this way so the rules stay honest.
import { useCallback, useMemo, useState } from 'react'
import type { GameEntry, GameProps } from './types'

// Board: 64 cells, index = row * 8 + col. Row 0 is the top (AI back rank), row 7
// is the bottom (player back rank). Play happens only on dark squares, where
// (row + col) is odd.
type Cell = '' | 'w' | 'b' | 'W' | 'B' // '' empty; w/b men; W/B kings
type Board = Cell[]
type Side = 'w' | 'b'

const isPlayer = (c: Cell | undefined): boolean => c === 'w' || c === 'W'
const isAI = (c: Cell | undefined): boolean => c === 'b' || c === 'B'
const isKing = (c: Cell | undefined): boolean => c === 'W' || c === 'B'
const sideOf = (c: Cell | undefined): Side | '' =>
  c === 'w' || c === 'W' ? 'w' : c === 'b' || c === 'B' ? 'b' : ''

const rowOf = (i: number): number => Math.floor(i / 8)
const colOf = (i: number): number => i % 8
const onBoard = (r: number, c: number): boolean => r >= 0 && r < 8 && c >= 0 && c < 8
const idx = (r: number, c: number): number => r * 8 + c
const playable = (r: number, c: number): boolean => (r + c) % 2 === 1

function initialBoard(): Board {
  const b: Board = new Array(64).fill('')
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (!playable(r, c)) continue
      if (r < 3) b[idx(r, c)] = 'b' // AI (dark) on top three rows
      else if (r > 4) b[idx(r, c)] = 'w' // player (light) on bottom three rows
    }
  }
  return b
}

// Diagonal directions a piece may move. Player men move up (toward row 0 =>
// dr -1), AI men move down (dr +1). Kings move both.
function directions(cell: Cell): number[][] {
  if (isKing(cell)) return [[-1, -1], [-1, 1], [1, -1], [1, 1]]
  if (isPlayer(cell)) return [[-1, -1], [-1, 1]]
  return [[1, -1], [1, 1]]
}

interface Move {
  readonly from: number
  readonly to: number
  readonly captured: number | null // index of jumped piece, or null for a step
}

// Promote a man that has reached the far back rank.
function promoted(cell: Cell, to: number): Cell {
  const r = rowOf(to)
  if (cell === 'w' && r === 0) return 'W'
  if (cell === 'b' && r === 7) return 'B'
  return cell
}

function applyMove(board: Board, m: Move): Board {
  const next = board.slice()
  const cell = next[m.from] ?? ''
  next[m.from] = ''
  if (m.captured !== null) next[m.captured] = ''
  next[m.to] = promoted(cell, m.to)
  return next
}

// Jump moves available to the single piece at `from` (one hop each).
function jumpsFrom(board: Board, from: number): Move[] {
  const cell = board[from]
  if (!cell) return []
  const side = sideOf(cell)
  const out: Move[] = []
  for (const d of directions(cell)) {
    const dr = d[0] ?? 0
    const dc = d[1] ?? 0
    const mr = rowOf(from) + dr
    const mc = colOf(from) + dc
    const lr = rowOf(from) + 2 * dr
    const lc = colOf(from) + 2 * dc
    if (!onBoard(lr, lc)) continue
    const mid = board[idx(mr, mc)]
    const land = board[idx(lr, lc)]
    if (mid && sideOf(mid) !== side && land === '') {
      out.push({ from, to: idx(lr, lc), captured: idx(mr, mc) })
    }
  }
  return out
}

// Simple (non-capturing) steps available to the piece at `from`.
function stepsFrom(board: Board, from: number): Move[] {
  const cell = board[from]
  if (!cell) return []
  const out: Move[] = []
  for (const d of directions(cell)) {
    const dr = d[0] ?? 0
    const dc = d[1] ?? 0
    const r = rowOf(from) + dr
    const c = colOf(from) + dc
    if (onBoard(r, c) && board[idx(r, c)] === '') out.push({ from, to: idx(r, c), captured: null })
  }
  return out
}

// A full move sequence: a single step, or a chain of one or more jumps with the
// same piece. Returned as a list of (board-after, path-of-indices) so multi-jump
// chains resolve to one committed move.
interface Sequence {
  readonly board: Board
  readonly path: number[] // squares visited, starting at the origin
  readonly captures: number // how many pieces were taken
}

// Expand every maximal jump chain beginning at `from` on `board`.
function jumpChains(board: Board, from: number, path: number[], caps: number): Sequence[] {
  const jumps = jumpsFrom(board, from)
  if (jumps.length === 0) {
    return path.length > 1 ? [{ board, path, captures: caps }] : []
  }
  const out: Sequence[] = []
  for (const j of jumps) {
    const nb = applyMove(board, j)
    // If the man promoted mid-jump, standard rules stop the chain. Detect a
    // kinging on this hop and stop there.
    const becameKing = !isKing(board[from]) && isKing(nb[j.to])
    if (becameKing) {
      out.push({ board: nb, path: [...path, j.to], captures: caps + 1 })
    } else {
      out.push(...jumpChains(nb, j.to, [...path, j.to], caps + 1))
    }
  }
  return out
}

// Every legal full move for `side`. If any jumps exist they are included
// alongside steps (jumps are offered, not forced).
function legalSequences(board: Board, side: Side): Sequence[] {
  const out: Sequence[] = []
  for (let i = 0; i < 64; i++) {
    if (sideOf(board[i]) !== side) continue
    // Jump chains.
    out.push(...jumpChains(board, i, [i], 0))
    // Simple steps.
    for (const s of stepsFrom(board, i)) {
      out.push({ board: applyMove(board, s), path: [i, s.to], captures: 0 })
    }
  }
  return out
}

function countPieces(board: Board, side: Side): number {
  let n = 0
  for (const c of board) if (sideOf(c) === side) n++
  return n
}

// The AI: prefer the sequence that captures the most pieces, else a random move.
function aiChoose(board: Board): Sequence | null {
  const seqs = legalSequences(board, 'b')
  if (seqs.length === 0) return null
  let best = -1
  let pool: Sequence[] = []
  for (const s of seqs) {
    if (s.captures > best) {
      best = s.captures
      pool = [s]
    } else if (s.captures === best) {
      pool.push(s)
    }
  }
  return pool[Math.floor(Math.random() * pool.length)] ?? null
}

const GLYPH: Record<Cell, string> = { '': '', w: '●', b: '●', W: '♚', B: '♚' }

type Result = 'play' | 'player-wins' | 'ai-wins'

const cellStyle = (
  dark: boolean,
  cell: Cell,
  selected: boolean,
  target: boolean,
): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  aspectRatio: '1',
  fontSize: 'clamp(1rem, 4vw, 2rem)',
  lineHeight: 1,
  cursor: dark ? 'pointer' : 'default',
  background: selected
    ? 'rgba(255,184,77,0.35)'
    : dark
      ? 'rgba(108,182,255,0.12)'
      : 'rgba(108,182,255,0.02)',
  border: target ? '2px solid var(--amber)' : '1px solid rgba(108,182,255,0.18)',
  color: isAI(cell) ? 'var(--red)' : 'var(--glyph)',
  textShadow: isAI(cell) ? '0 0 8px var(--red)' : '0 0 8px var(--glyph)',
  padding: 0,
  font: 'inherit',
})

function CheckersGame({ onExit }: GameProps) {
  const [board, setBoard] = useState<Board>(initialBoard)
  const [turn, setTurn] = useState<Side>('w')
  const [selected, setSelected] = useState<number | null>(null)
  const [result, setResult] = useState<Result>('play')
  const [status, setStatus] = useState<string>('YOUR MOVE. YOU ARE THE BLUE DISCS.')

  // Legal full moves for the player, grouped by origin square so a click knows
  // where a selected piece may land.
  const playerSeqs = useMemo(() => legalSequences(board, 'w'), [board])
  const targetsFor = useCallback(
    (from: number): number[] =>
      playerSeqs.filter((s) => s.path[0] === from).map((s) => s.path[s.path.length - 1]!),
    [playerSeqs],
  )
  const targets = selected !== null ? targetsFor(selected) : []

  const reset = useCallback((): void => {
    setBoard(initialBoard())
    setTurn('w')
    setSelected(null)
    setResult('play')
    setStatus('YOUR MOVE. YOU ARE THE BLUE DISCS.')
  }, [])

  // Resolve the AI reply and the end conditions after the player commits a move.
  const afterPlayerMove = useCallback((next: Board): void => {
    // Did the player leave the AI with nothing?
    if (countPieces(next, 'b') === 0 || legalSequences(next, 'b').length === 0) {
      setBoard(next)
      setResult('player-wins')
      setStatus('WOPR HAS NO MOVES. YOU WIN.')
      return
    }

    const choice = aiChoose(next)
    if (!choice) {
      setBoard(next)
      setResult('player-wins')
      setStatus('WOPR HAS NO MOVES. YOU WIN.')
      return
    }
    const after = choice.board

    // Did the AI just win?
    if (countPieces(after, 'w') === 0 || legalSequences(after, 'w').length === 0) {
      setBoard(after)
      setResult('ai-wins')
      setStatus(
        countPieces(after, 'w') === 0 ? 'ALL YOUR DISCS ARE GONE. WOPR WINS.' : 'YOU HAVE NO MOVES. WOPR WINS.',
      )
      setTurn('w')
      return
    }

    setBoard(after)
    setTurn('w')
    setStatus(choice.captures > 0 ? `WOPR JUMPS AND TAKES ${choice.captures}. YOUR MOVE.` : 'WOPR MOVES. YOUR MOVE.')
  }, [])

  const clickCell = useCallback(
    (i: number): void => {
      if (result !== 'play' || turn !== 'w') return
      const cell = board[i]

      // Select one of your own pieces.
      if (isPlayer(cell)) {
        setSelected(i)
        return
      }

      if (selected === null) return
      // Find the committed sequence from `selected` landing on `i`.
      const seq = playerSeqs.find(
        (s) => s.path[0] === selected && s.path[s.path.length - 1] === i,
      )
      if (!seq) {
        setStatus('ILLEGAL MOVE. PICK A HIGHLIGHTED SQUARE.')
        return
      }
      setSelected(null)
      setTurn('b')
      setStatus('WOPR IS THINKING...')
      setTimeout(() => afterPlayerMove(seq.board), 240)
    },
    [board, selected, turn, result, playerSeqs, afterPlayerMove],
  )

  const playerCount = countPieces(board, 'w')
  const aiCount = countPieces(board, 'b')
  const resultClass = result === 'player-wins' ? 'wg-amber' : 'wg-red'

  return (
    <div className="wg-screen" data-testid="game-checkers">
      <div className="wg-out" style={{ overflow: 'auto' }}>
        <div className="wg-dim" style={{ letterSpacing: '0.1em', marginBottom: '0.4rem' }}>
          WOPR DRAUGHTS MODULE / YOU: {playerCount} &nbsp; WOPR: {aiCount}
        </div>
        <div
          className={result !== 'play' ? `wg-big ${resultClass}` : undefined}
          style={{ marginBottom: '0.6rem', minHeight: '1.4em' }}
          aria-live="polite"
          data-testid="checkers-status"
        >
          {status}
        </div>

        <div
          role="grid"
          aria-label="checkers board"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(8, 1fr)',
            width: 'min(70vh, 92vw, 560px)',
            maxWidth: '100%',
            border: '1px solid rgba(108,182,255,0.4)',
          }}
        >
          {board.map((cell, i) => {
            const dark = playable(rowOf(i), colOf(i))
            const isSel = selected === i
            const isTarget = targets.includes(i)
            return (
              <button
                key={i}
                type="button"
                role="gridcell"
                aria-label={`row ${rowOf(i)} col ${colOf(i)}${cell ? ' ' + cell : ' empty'}`}
                data-testid={`cell-${i}`}
                onClick={() => clickCell(i)}
                disabled={!dark}
                style={cellStyle(dark, cell, isSel, isTarget)}
              >
                {GLYPH[cell]}
              </button>
            )
          })}
        </div>

        <div className="wg-opts" style={{ marginTop: '0.9rem' }}>
          {result !== 'play' && (
            <button className="wg-opt" onClick={reset} autoFocus data-testid="checkers-again">
              &gt; PLAY AGAIN
            </button>
          )}
          <button className="wg-opt wg-amber" onClick={onExit} data-testid="game-exit">
            &gt; EXIT TO GAMES
          </button>
        </div>
        <div className="wg-hint">
          CLICK A BLUE DISC, THEN A HIGHLIGHTED SQUARE. JUMPS CHAIN. REACH THE TOP ROW TO CROWN A KING.
        </div>
      </div>
    </div>
  )
}

export const entry: GameEntry = { id: 'CHECKERS', Component: CheckersGame }
