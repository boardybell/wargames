// CHESS. A real, self-contained game of chess on the WOPR terminal. You play
// White; a greedy 1-ply AI plays Black. Full legal move generation for every
// piece (pawns with two-step, diagonal captures, and auto-queen promotion;
// sliding rook/bishop/queen with blocking; knight and king steps), illegal
// moves are rejected, and the game detects check, checkmate, and stalemate by
// generating the side-to-move's legal replies. Castling and en-passant are
// omitted on purpose to keep the rules honest and small.
import { useCallback, useMemo, useState } from 'react'
import type { GameEntry, GameProps } from './types'

// A board is 64 cells, index = row * 8 + col. Row 0 is Black's back rank (top),
// row 7 is White's back rank (bottom). A piece is two chars: colour + type.
// '' is an empty square.
type Piece = string // e.g. 'wK', 'bP', or ''
type Board = Piece[]
type Color = 'w' | 'b'

function glyph(p: Piece): string {
  switch (p) {
    case 'wK': return '♔'
    case 'wQ': return '♕'
    case 'wR': return '♖'
    case 'wB': return '♗'
    case 'wN': return '♘'
    case 'wP': return '♙'
    case 'bK': return '♚'
    case 'bQ': return '♛'
    case 'bR': return '♜'
    case 'bB': return '♝'
    case 'bN': return '♞'
    case 'bP': return '♟'
    default: return ''
  }
}

function value(type: string): number {
  switch (type) {
    case 'P': return 1
    case 'N': return 3
    case 'B': return 3
    case 'R': return 5
    case 'Q': return 9
    case 'K': return 1000
    default: return 0
  }
}

function initialBoard(): Board {
  const b: Board = new Array(64).fill('')
  const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
  for (let c = 0; c < 8; c++) {
    const t = back[c] ?? 'R'
    b[0 * 8 + c] = 'b' + t
    b[1 * 8 + c] = 'bP'
    b[6 * 8 + c] = 'wP'
    b[7 * 8 + c] = 'w' + t
  }
  return b
}

const rowOf = (i: number): number => Math.floor(i / 8)
const colOf = (i: number): number => i % 8
const onBoard = (r: number, c: number): boolean => r >= 0 && r < 8 && c >= 0 && c < 8
const colorOf = (p: Piece | undefined): Color | '' => (p ? (p.charAt(0) as Color) : '')
const typeOf = (p: Piece | undefined): string => (p ? p.charAt(1) : '')

interface Move {
  readonly from: number
  readonly to: number
}

// Pseudo-legal moves for the piece at `from` (ignores leaving your own king in
// check; that is filtered later in legalMoves).
function pseudoMoves(board: Board, from: number): number[] {
  const p = board[from]
  if (!p) return []
  const me = colorOf(p)
  const them: Color = me === 'w' ? 'b' : 'w'
  const r = rowOf(from)
  const c = colOf(from)
  const out: number[] = []
  const push = (rr: number, cc: number): void => {
    if (onBoard(rr, cc)) out.push(rr * 8 + cc)
  }
  const type = typeOf(p)

  if (type === 'P') {
    const dir = me === 'w' ? -1 : 1 // White moves up (toward row 0)
    const startRow = me === 'w' ? 6 : 1
    // Forward one, if empty.
    if (onBoard(r + dir, c) && board[(r + dir) * 8 + c] === '') {
      push(r + dir, c)
      // Forward two from the start row, if both squares empty.
      if (r === startRow && board[(r + 2 * dir) * 8 + c] === '') push(r + 2 * dir, c)
    }
    // Diagonal captures.
    for (const dc of [-1, 1]) {
      const rr = r + dir
      const cc = c + dc
      if (onBoard(rr, cc)) {
        const t = board[rr * 8 + cc]
        if (t && colorOf(t) === them) push(rr, cc)
      }
    }
    return out
  }

  if (type === 'N') {
    const steps = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1],
    ]
    for (const s of steps) {
      const rr = r + (s[0] ?? 0)
      const cc = c + (s[1] ?? 0)
      if (!onBoard(rr, cc)) continue
      const t = board[rr * 8 + cc] ?? ''
      if (!t || colorOf(t) === them) push(rr, cc)
    }
    return out
  }

  if (type === 'K') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const rr = r + dr
        const cc = c + dc
        if (!onBoard(rr, cc)) continue
        const t = board[rr * 8 + cc] ?? ''
        if (!t || colorOf(t) === them) push(rr, cc)
      }
    }
    return out
  }

  // Sliding pieces: rook, bishop, queen.
  const dirs: number[][] = []
  if (type === 'R' || type === 'Q') dirs.push([-1, 0], [1, 0], [0, -1], [0, 1])
  if (type === 'B' || type === 'Q') dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1])
  for (const d of dirs) {
    const dr = d[0] ?? 0
    const dc = d[1] ?? 0
    let rr = r + dr
    let cc = c + dc
    while (onBoard(rr, cc)) {
      const t = board[rr * 8 + cc] ?? ''
      if (!t) {
        out.push(rr * 8 + cc)
      } else {
        if (colorOf(t) === them) out.push(rr * 8 + cc)
        break // blocked by any piece
      }
      rr += dr
      cc += dc
    }
  }
  return out
}

function findKing(board: Board, color: Color): number {
  for (let i = 0; i < 64; i++) if (board[i] === color + 'K') return i
  return -1
}

// Is `color`'s king attacked, given this board?
function inCheck(board: Board, color: Color): boolean {
  const king = findKing(board, color)
  if (king < 0) return true // king already captured counts as "in check"
  const them: Color = color === 'w' ? 'b' : 'w'
  for (let i = 0; i < 64; i++) {
    if (colorOf(board[i]) === them) {
      if (pseudoMoves(board, i).includes(king)) return true
    }
  }
  return false
}

// Apply a move to a copy of the board, auto-promoting pawns to a queen.
function applyMove(board: Board, m: Move): Board {
  const next = board.slice()
  const p = next[m.from] ?? ''
  next[m.from] = ''
  let moved: Piece = p
  if (typeOf(p) === 'P') {
    const destRow = rowOf(m.to)
    if (destRow === 0 || destRow === 7) moved = colorOf(p) + 'Q'
  }
  next[m.to] = moved
  return next
}

// Fully legal moves for `color`: pseudo-legal moves that do not leave your own
// king in check.
function legalMoves(board: Board, color: Color): Move[] {
  const moves: Move[] = []
  for (let i = 0; i < 64; i++) {
    if (colorOf(board[i]) !== color) continue
    for (const to of pseudoMoves(board, i)) {
      const next = applyMove(board, { from: i, to })
      if (!inCheck(next, color)) moves.push({ from: i, to })
    }
  }
  return moves
}

function legalTargetsFrom(board: Board, from: number, color: Color): number[] {
  if (colorOf(board[from]) !== color) return []
  const out: number[] = []
  for (const to of pseudoMoves(board, from)) {
    const next = applyMove(board, { from, to })
    if (!inCheck(next, color)) out.push(to)
  }
  return out
}

// The greedy AI: among all legal moves, take the one capturing the most
// valuable piece; if nothing can be captured, play a random legal move.
function aiMove(board: Board, color: Color): Move | null {
  const moves = legalMoves(board, color)
  if (moves.length === 0) return null
  let best: Move[] = []
  let bestGain = -1
  for (const m of moves) {
    const target = board[m.to]
    const gain = target ? value(typeOf(target)) : 0
    if (gain > bestGain) {
      bestGain = gain
      best = [m]
    } else if (gain === bestGain) {
      best.push(m)
    }
  }
  return best[Math.floor(Math.random() * best.length)] ?? null
}

type Result = 'play' | 'white-wins' | 'black-wins' | 'draw'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const squareName = (i: number): string => (FILES[colOf(i)] ?? '?') + (8 - rowOf(i))

const cellStyle = (dark: boolean, selected: boolean, target: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  aspectRatio: '1',
  fontSize: 'clamp(1.1rem, 4.2vw, 2.1rem)',
  lineHeight: 1,
  cursor: 'pointer',
  background: selected
    ? 'rgba(255,184,77,0.35)'
    : dark
      ? 'rgba(108,182,255,0.10)'
      : 'rgba(108,182,255,0.02)',
  border: target ? '2px solid var(--amber)' : '1px solid rgba(108,182,255,0.18)',
  color: 'var(--glyph)',
  textShadow: '0 0 6px var(--glyph)',
  padding: 0,
  font: 'inherit',
})

function ChessGame({ onExit }: GameProps) {
  const [board, setBoard] = useState<Board>(initialBoard)
  const [turn, setTurn] = useState<Color>('w')
  const [selected, setSelected] = useState<number | null>(null)
  const [result, setResult] = useState<Result>('play')
  const [status, setStatus] = useState<string>('YOUR MOVE. YOU ARE WHITE.')

  const targets = useMemo(
    () => (selected !== null ? legalTargetsFrom(board, selected, 'w') : []),
    [board, selected],
  )

  const reset = useCallback((): void => {
    setBoard(initialBoard())
    setTurn('w')
    setSelected(null)
    setResult('play')
    setStatus('YOUR MOVE. YOU ARE WHITE.')
  }, [])

  // After White moves, evaluate and (if the game continues) let Black reply.
  const afterPlayerMove = useCallback((next: Board): void => {
    // Did White just end the game?
    const blackMoves = legalMoves(next, 'b')
    if (blackMoves.length === 0) {
      if (inCheck(next, 'b')) {
        setBoard(next)
        setResult('white-wins')
        setStatus('CHECKMATE. YOU WIN.')
      } else {
        setBoard(next)
        setResult('draw')
        setStatus('STALEMATE. A STRANGE GAME: A DRAW.')
      }
      return
    }

    // Black (AI) replies.
    const reply = aiMove(next, 'b')
    if (!reply) {
      setBoard(next)
      setResult('draw')
      setStatus('STALEMATE. A DRAW.')
      return
    }
    const after = applyMove(next, reply)

    const whiteMoves = legalMoves(after, 'w')
    if (whiteMoves.length === 0) {
      setBoard(after)
      if (inCheck(after, 'w')) {
        setResult('black-wins')
        setStatus('CHECKMATE. WOPR WINS.')
      } else {
        setResult('draw')
        setStatus('STALEMATE. A DRAW.')
      }
      setTurn('w')
      return
    }

    setBoard(after)
    setTurn('w')
    const blackMovedTo = squareName(reply.to)
    if (inCheck(after, 'w')) {
      setStatus(`WOPR MOVES ${blackMovedTo}. YOU ARE IN CHECK.`)
    } else {
      setStatus(`WOPR MOVES ${blackMovedTo}. YOUR MOVE.`)
    }
  }, [])

  const clickSquare = useCallback(
    (i: number): void => {
      if (result !== 'play' || turn !== 'w') return
      const p = board[i]

      // Selecting one of your own pieces.
      if (colorOf(p) === 'w') {
        setSelected(i)
        return
      }

      // Attempting to move the selected piece to square i.
      if (selected === null) return
      const legal = legalTargetsFrom(board, selected, 'w')
      if (!legal.includes(i)) {
        // Illegal move: reject it honestly, keep selection.
        setStatus('ILLEGAL MOVE. PICK A HIGHLIGHTED SQUARE.')
        return
      }
      const next = applyMove(board, { from: selected, to: i })
      setSelected(null)
      setTurn('b')
      setStatus('WOPR IS THINKING...')
      // Let the "thinking" paint, then resolve Black.
      setTimeout(() => afterPlayerMove(next), 260)
    },
    [board, selected, turn, result, afterPlayerMove],
  )

  const resultClass =
    result === 'white-wins' ? 'wg-amber' : result === 'black-wins' ? 'wg-red' : 'wg-amber'

  return (
    <div className="wg-screen" data-testid="game-chess">
      <div className="wg-out" style={{ overflow: 'auto' }}>
        <div className="wg-dim" style={{ letterSpacing: '0.1em', marginBottom: '0.4rem' }}>
          WOPR CHESS MODULE / YOU ARE WHITE
        </div>
        <div
          className={result !== 'play' ? `wg-big ${resultClass}` : undefined}
          style={{ marginBottom: '0.6rem', minHeight: '1.4em' }}
          aria-live="polite"
          data-testid="chess-status"
        >
          {status}
        </div>

        <div
          role="grid"
          aria-label="chess board"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(8, 1fr)',
            width: 'min(70vh, 92vw, 560px)',
            maxWidth: '100%',
            border: '1px solid rgba(108,182,255,0.4)',
          }}
        >
          {board.map((p, i) => {
            const dark = (rowOf(i) + colOf(i)) % 2 === 1
            const isSel = selected === i
            const isTarget = targets.includes(i)
            return (
              <button
                key={i}
                type="button"
                role="gridcell"
                aria-label={`${squareName(i)}${p ? ' ' + p : ' empty'}`}
                data-testid={`sq-${squareName(i)}`}
                onClick={() => clickSquare(i)}
                style={cellStyle(dark, isSel, isTarget)}
              >
                {glyph(p)}
              </button>
            )
          })}
        </div>

        <div className="wg-opts" style={{ marginTop: '0.9rem' }}>
          {result !== 'play' && (
            <button className="wg-opt" onClick={reset} autoFocus data-testid="chess-again">
              &gt; PLAY AGAIN
            </button>
          )}
          <button className="wg-opt wg-amber" onClick={onExit} data-testid="game-exit">
            &gt; EXIT TO GAMES
          </button>
        </div>
        <div className="wg-hint">
          CLICK A WHITE PIECE, THEN A HIGHLIGHTED SQUARE. PAWNS PROMOTE TO QUEEN.
        </div>
      </div>
    </div>
  )
}

export const entry: GameEntry = { id: 'CHESS', Component: ChessGame }
