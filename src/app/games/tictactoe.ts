// Tic-tac-toe played optimally by both sides, from the empty board to a draw.
// The WOPR-learns-futility beat from the film, played straight: the machine
// plays itself and cannot win. Pure functions over its own board type, zero
// imports from engine or app state, deterministic by construction (ties in move
// evaluation break by lowest cell index), so the emitted move list is identical
// on every run.
export type Player = 'X' | 'O'
export type Cell = Player | null
export type Board = readonly Cell[]

export interface Move {
  readonly player: Player
  readonly cell: number
}

export interface GameResult {
  readonly moves: readonly Move[]
  readonly result: 'draw' | Player
}

const LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

function winner(board: Board): Player | null {
  for (const [a, b, c] of LINES) {
    const v = board[a]
    if (v && v === board[b] && v === board[c]) return v
  }
  return null
}

function isFull(board: Board): boolean {
  return board.every((c) => c !== null)
}

const other = (p: Player): Player => (p === 'X' ? 'O' : 'X')

// Score from X's perspective: X win +1, O win -1, draw 0. Returns the chosen
// cell too, lowest index among equally optimal moves (strict comparisons keep
// the first seen, and cells are scanned in ascending order).
function best(board: Cell[], player: Player): { score: number; cell: number } {
  const win = winner(board)
  if (win === 'X') return { score: 1, cell: -1 }
  if (win === 'O') return { score: -1, cell: -1 }
  if (isFull(board)) return { score: 0, cell: -1 }

  let bestCell = -1
  let bestScore = player === 'X' ? -Infinity : Infinity
  for (let i = 0; i < 9; i++) {
    if (board[i] !== null) continue
    board[i] = player
    const { score } = best(board, other(player))
    board[i] = null
    if (player === 'X' ? score > bestScore : score < bestScore) {
      bestScore = score
      bestCell = i
    }
  }
  return { score: bestScore, cell: bestCell }
}

/** Play the whole game optimally. Both optimal means a draw, every time. */
export function playOptimalGame(): GameResult {
  const board: Cell[] = Array<Cell>(9).fill(null)
  const moves: Move[] = []
  let player: Player = 'X'
  while (winner(board) === null && !isFull(board)) {
    const { cell } = best(board, player)
    board[cell] = player
    moves.push({ player, cell })
    player = other(player)
  }
  return { moves, result: winner(board) ?? 'draw' }
}

/** Apply the first n moves to a fresh board (for the replay view). */
export function boardAfter(moves: readonly Move[], n: number): Cell[] {
  const board: Cell[] = Array<Cell>(9).fill(null)
  for (let i = 0; i < n && i < moves.length; i++) {
    const move = moves[i]!
    board[move.cell] = move.player
  }
  return board
}
