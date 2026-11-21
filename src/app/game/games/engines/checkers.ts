// CHECKERS rules engine (pure). English/American draughts on an 8x8 board.
// Index = row * 8 + col; row 0 is the top (WOPR's back rank), row 7 the bottom
// (player's back rank). Play happens on dark squares, where (row + col) is odd.
//
// 'w' = player (blue, moves up), 'b' = WOPR (red, moves down). Upper case = king.
//
// Rule sets:
// - STANDARD: captures are compulsory. If any capture exists the side must
//   capture, and may choose any capturing branch (not necessarily the longest).
//   A started jump must be completed. A man that reaches the far rank is
//   crowned and the move ends there.
// - CASUAL: captures are optional; once a jump is started it must still be
//   completed.
// Draws (both rule sets): threefold repetition of the same position with the
// same side to move, or 40 moves by each side (80 plies) without a capture or
// a man (uncrowned piece) moving.
//
// Design: docs/games-design-review.md §6.

export type Cell = '' | 'w' | 'b' | 'W' | 'B'
export type Board = readonly Cell[]
export type Side = 'w' | 'b'
export type Mode = 'standard' | 'casual'
export type Difficulty = 'beginner' | 'standard'

export const NO_PROGRESS_PLIES = 80

export const isKing = (c: Cell | undefined): boolean => c === 'W' || c === 'B'
export const sideOf = (c: Cell | undefined): Side | '' =>
  c === 'w' || c === 'W' ? 'w' : c === 'b' || c === 'B' ? 'b' : ''
export const other = (s: Side): Side => (s === 'w' ? 'b' : 'w')
export const rowOf = (i: number): number => Math.floor(i / 8)
export const colOf = (i: number): number => i % 8
const onBoard = (r: number, c: number): boolean => r >= 0 && r < 8 && c >= 0 && c < 8
const idx = (r: number, c: number): number => r * 8 + c
export const playable = (i: number): boolean => (rowOf(i) + colOf(i)) % 2 === 1

/** Algebraic name of a square (a1 bottom-left from the player's side). */
export const sq = (i: number): string => `${'abcdefgh'[colOf(i)]}${8 - rowOf(i)}`

export function initialBoard(): Cell[] {
  const b: Cell[] = new Array<Cell>(64).fill('')
  for (let i = 0; i < 64; i++) {
    if (!playable(i)) continue
    if (rowOf(i) < 3) b[i] = 'b'
    else if (rowOf(i) > 4) b[i] = 'w'
  }
  return b
}

/** Build a board from piece lists (test fixtures). */
export function boardFrom(pieces: Partial<Record<Cell, readonly number[]>>): Cell[] {
  const b: Cell[] = new Array<Cell>(64).fill('')
  for (const [k, list] of Object.entries(pieces) as [Cell, readonly number[]][]) for (const i of list) b[i] = k
  return b
}

const KING_DIRS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const
function directions(cell: Cell): readonly (readonly [number, number])[] {
  if (isKing(cell)) return KING_DIRS
  return cell === 'w' ? KING_DIRS.slice(0, 2) : KING_DIRS.slice(2)
}

function promoted(cell: Cell, to: number): Cell {
  if (cell === 'w' && rowOf(to) === 0) return 'W'
  if (cell === 'b' && rowOf(to) === 7) return 'B'
  return cell
}

export interface Hop {
  readonly from: number
  readonly to: number
  /** Square of the jumped piece, or null for a plain step. */
  readonly captured: number | null
}

export function applyHop(board: Board, h: Hop): Cell[] {
  const next = board.slice()
  const cell = next[h.from] ?? ''
  next[h.from] = ''
  if (h.captured !== null) next[h.captured] = ''
  next[h.to] = promoted(cell, h.to)
  return next
}

/** Single jumps available to the piece at `from`. */
export function jumpsFrom(board: Board, from: number): Hop[] {
  const cell = board[from]
  if (!cell) return []
  const side = sideOf(cell)
  const out: Hop[] = []
  for (const [dr, dc] of directions(cell)) {
    const lr = rowOf(from) + 2 * dr
    const lc = colOf(from) + 2 * dc
    if (!onBoard(lr, lc)) continue
    const mid = idx(rowOf(from) + dr, colOf(from) + dc)
    const m = board[mid]
    if (m && sideOf(m) !== side && board[idx(lr, lc)] === '') out.push({ from, to: idx(lr, lc), captured: mid })
  }
  return out
}

function stepsFrom(board: Board, from: number): Hop[] {
  const cell = board[from]
  if (!cell) return []
  const out: Hop[] = []
  for (const [dr, dc] of directions(cell)) {
    const r = rowOf(from) + dr
    const c = colOf(from) + dc
    if (onBoard(r, c) && board[idx(r, c)] === '') out.push({ from, to: idx(r, c), captured: null })
  }
  return out
}

/** A complete move: one step, or a maximal jump chain by one piece. */
export interface Sequence {
  /** Squares visited, origin first. Unique per legal move. */
  readonly path: readonly number[]
  /** Squares of the pieces taken, in order. */
  readonly captured: readonly number[]
  readonly board: Cell[]
  /** A man reached the far rank on this move. */
  readonly crowned: boolean
}

function jumpChains(board: Cell[], at: number, path: number[], caps: number[], startKing: boolean): Sequence[] {
  const jumps = jumpsFrom(board, at)
  if (jumps.length === 0) return path.length > 1 ? [{ path, captured: caps, board, crowned: false }] : []
  const out: Sequence[] = []
  for (const j of jumps) {
    const nb = applyHop(board, j)
    const np = [...path, j.to]
    const nc = [...caps, j.captured as number]
    // Crowning ends the move (English rules).
    if (!startKing && isKing(nb[j.to])) out.push({ path: np, captured: nc, board: nb, crowned: true })
    else out.push(...jumpChains(nb, j.to, np, nc, startKing))
  }
  return out
}

/** Every legal complete move for `side` under `mode`. */
export function legalSequences(board: Board, side: Side, mode: Mode): Sequence[] {
  const jumps: Sequence[] = []
  const steps: Sequence[] = []
  for (let i = 0; i < 64; i++) {
    const cell = board[i]
    if (sideOf(cell) !== side) continue
    jumps.push(...jumpChains(board.slice(), i, [i], [], isKing(cell)))
    for (const s of stepsFrom(board, i)) {
      const nb = applyHop(board, s)
      steps.push({ path: [i, s.to], captured: [], board: nb, crowned: !isKing(cell) && isKing(nb[s.to]) })
    }
  }
  if (mode === 'standard' && jumps.length > 0) return jumps
  return [...jumps, ...steps]
}

export const captureRequired = (board: Board, side: Side, mode: Mode): boolean =>
  mode === 'standard' && legalSequences(board, side, mode).some((s) => s.captured.length > 0)

/**
 * Hop-by-hop selection: given the legal moves and the squares visited so far
 * (origin first), the squares the piece may hop to next. Empty when `path`
 * already completes a move.
 */
export function nextHops(seqs: readonly Sequence[], path: readonly number[]): number[] {
  const out = new Set<number>()
  for (const s of seqs) {
    if (s.path.length <= path.length) continue
    if (path.every((p, k) => s.path[k] === p)) out.add(s.path[path.length]!)
  }
  return [...out]
}

/** The legal move exactly matching `path`, if it is complete. */
export const completed = (seqs: readonly Sequence[], path: readonly number[]): Sequence | undefined =>
  seqs.find((s) => s.path.length === path.length && s.path.every((p, k) => path[k] === p))

/** The board while a jump is part-way through `path` (captured pieces removed). */
export function partialBoard(board: Board, path: readonly number[]): Cell[] {
  let b = board.slice()
  for (let k = 1; k < path.length; k++) {
    const from = path[k - 1]!
    const to = path[k]!
    const jumped = Math.abs(rowOf(to) - rowOf(from)) === 2 ? idx((rowOf(to) + rowOf(from)) / 2, (colOf(to) + colOf(from)) / 2) : null
    b = applyHop(b, { from, to, captured: jumped })
  }
  return b
}

export function count(board: Board, side: Side): { men: number; kings: number; total: number } {
  let men = 0
  let kings = 0
  for (const c of board) {
    if (sideOf(c) !== side) continue
    if (isKing(c)) kings++
    else men++
  }
  return { men, kings, total: men + kings }
}

// ---------------------------------------------------------------- game state

export type EndReason = 'no-pieces' | 'no-moves' | 'repetition' | 'no-progress'
export interface Ending {
  readonly winner: Side | 'draw'
  readonly reason: EndReason
}

export interface GameState {
  readonly board: Cell[]
  readonly turn: Side
  readonly mode: Mode
  /** Plies since the last capture or man move. */
  readonly quiet: number
  /** Position keys (board + side to move) since the last irreversible move. */
  readonly keys: readonly string[]
  readonly last: Sequence | null
  readonly ending: Ending | null
  readonly plies: number
}

export const positionKey = (board: Board, turn: Side): string => `${turn}:${board.map((c) => c || '.').join('')}`

export function newGame(mode: Mode, board: Cell[] = initialBoard(), turn: Side = 'w'): GameState {
  return { board, turn, mode, quiet: 0, keys: [positionKey(board, turn)], last: null, ending: null, plies: 0 }
}

/** Commit a complete legal move and evaluate the ending conditions. */
export function play(s: GameState, seq: Sequence): GameState {
  const mover = s.turn
  const next = other(mover)
  const piece = s.board[seq.path[0]!]
  const irreversible = seq.captured.length > 0 || !isKing(piece)
  const quiet = irreversible ? 0 : s.quiet + 1
  const key = positionKey(seq.board, next)
  const keys = irreversible ? [key] : [...s.keys, key]
  let ending: Ending | null = null
  if (count(seq.board, next).total === 0) ending = { winner: mover, reason: 'no-pieces' }
  else if (legalSequences(seq.board, next, s.mode).length === 0) ending = { winner: mover, reason: 'no-moves' }
  else if (keys.filter((k) => k === key).length >= 3) ending = { winner: 'draw', reason: 'repetition' }
  else if (quiet >= NO_PROGRESS_PLIES) ending = { winner: 'draw', reason: 'no-progress' }
  return { board: seq.board, turn: next, mode: s.mode, quiet, keys, last: seq, ending, plies: s.plies + 1 }
}

// ---------------------------------------------------------------- AI

const MAN = 100
const KING = 165
const WIN = 100000

/** Static evaluation from `side`'s point of view. */
export function evaluate(board: Board, side: Side): number {
  let score = 0
  for (let i = 0; i < 64; i++) {
    const c = board[i]
    const s = sideOf(c)
    if (!s) continue
    let v: number
    if (isKing(c)) v = KING
    else {
      // Promotion distance: a man gains value as it approaches the far rank.
      const advanced = s === 'w' ? 7 - rowOf(i) : rowOf(i)
      v = MAN + advanced * 4
      // A man still guarding its own back rank blocks enemy crowning.
      if (advanced === 0) v += 6
    }
    // Small centre preference for every piece.
    const col = colOf(i)
    if (col >= 2 && col <= 5) v += 3
    score += s === side ? v : -v
  }
  return score
}

/**
 * Choose a move for `side`.
 * - beginner: the old capture-greedy policy (most pieces taken, random among
 *   ties, otherwise any legal move).
 * - standard: bounded two-ply search: every own move, then the opponent's
 *   best reply, scoring material, kings, promotion distance and the reply.
 */
export function chooseMove(
  s: GameState,
  difficulty: Difficulty,
  rand: () => number = Math.random,
): Sequence | null {
  const side = s.turn
  const mine = legalSequences(s.board, side, s.mode)
  if (mine.length === 0) return null
  if (difficulty === 'beginner') {
    const best = Math.max(...mine.map((m) => m.captured.length))
    const pool = mine.filter((m) => m.captured.length === best)
    return pool[Math.floor(rand() * pool.length)] ?? pool[0]!
  }
  const opp = other(side)
  let bestScore = -Infinity
  let pool: Sequence[] = []
  for (const m of mine) {
    const replies = legalSequences(m.board, opp, s.mode)
    let worst: number
    if (replies.length === 0) worst = WIN
    else {
      worst = Infinity
      for (const r of replies) {
        const v = legalSequences(r.board, side, s.mode).length === 0 ? -WIN : evaluate(r.board, side)
        if (v < worst) worst = v
      }
    }
    if (worst > bestScore) {
      bestScore = worst
      pool = [m]
    } else if (worst === bestScore) pool.push(m)
  }
  return pool[Math.floor(rand() * pool.length)] ?? pool[0]!
}

/** Human-readable move, e.g. "C3-D4" or "C3xE5xC7". */
export const describe = (seq: Sequence): string =>
  seq.path.map((p) => sq(p).toUpperCase()).join(seq.captured.length > 0 ? 'x' : '-')
