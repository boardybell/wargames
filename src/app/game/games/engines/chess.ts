// CHESS rules engine (pure). Full FIDE move rules: castling rights, en passant,
// promotion to Q/R/B/N, check, checkmate, stalemate, threefold repetition,
// the 50-move rule, and dead positions by insufficient material. Plus a small
// alpha-beta search for WOPR.
//
// Board: 64 cells, index = row * 8 + col. Row 0 is rank 8 (Black's back rank),
// row 7 is rank 1. A piece is colour + type, e.g. 'wK', 'bP'; '' is empty.
//
// Design: docs/games-design-review.md §7.

export type Color = 'w' | 'b'
export type PieceType = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K'
export type PromoType = 'Q' | 'R' | 'B' | 'N'
export type Piece = string
export type Board = readonly Piece[]

export interface Position {
  readonly board: Piece[]
  readonly turn: Color
  /** Subset of 'KQkq'. */
  readonly castling: string
  /** En passant target square (the square passed over), or null. */
  readonly ep: number | null
  /** Plies since the last capture or pawn move (50-move rule). */
  readonly halfmove: number
  readonly fullmove: number
}

export interface Move {
  readonly from: number
  readonly to: number
  readonly piece: Piece
  readonly captured: Piece
  readonly promo?: PromoType
  readonly castle?: 'K' | 'Q'
  readonly ep?: boolean
}

export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')
export const rowOf = (i: number): number => i >> 3
export const colOf = (i: number): number => i & 7
export const colorOf = (p: Piece | undefined): Color | '' => (p ? (p[0] as Color) : '')
export const typeOf = (p: Piece | undefined): PieceType | '' => (p ? (p[1] as PieceType) : '')
const on = (r: number, c: number): boolean => r >= 0 && r < 8 && c >= 0 && c < 8
export const sqName = (i: number): string => `${'abcdefgh'[colOf(i)]}${8 - rowOf(i)}`
export const sqIndex = (name: string): number => (8 - Number(name[1])) * 8 + 'abcdefgh'.indexOf(name[0]!)

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export function fromFen(fen: string): Position {
  const [placement = '', turn = 'w', castling = '-', ep = '-', half = '0', full = '1'] = fen.trim().split(/\s+/)
  const board: Piece[] = new Array<Piece>(64).fill('')
  let i = 0
  for (const ch of placement) {
    if (ch === '/') continue
    if (/\d/.test(ch)) i += Number(ch)
    else {
      const color = ch === ch.toUpperCase() ? 'w' : 'b'
      board[i++] = color + ch.toUpperCase()
    }
  }
  return {
    board,
    turn: turn as Color,
    castling: castling === '-' ? '' : castling,
    ep: ep === '-' ? null : sqIndex(ep),
    halfmove: Number(half),
    fullmove: Number(full),
  }
}

export function toFen(p: Position): string {
  const rows: string[] = []
  for (let r = 0; r < 8; r++) {
    let s = ''
    let empty = 0
    for (let c = 0; c < 8; c++) {
      const pc = p.board[r * 8 + c]
      if (!pc) {
        empty++
        continue
      }
      if (empty) s += empty
      empty = 0
      s += pc[0] === 'w' ? pc[1] : pc[1]!.toLowerCase()
    }
    if (empty) s += empty
    rows.push(s)
  }
  return `${rows.join('/')} ${p.turn} ${p.castling || '-'} ${p.ep === null ? '-' : sqName(p.ep)} ${p.halfmove} ${p.fullmove}`
}

export const startPosition = (): Position => fromFen(START_FEN)

const KNIGHT = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
] as const
const KING = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
] as const
const ROOK_DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const
const BISHOP_DIRS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const

/** Is square `sq` attacked by any piece of colour `by`? */
export function attacked(board: Board, sq: number, by: Color): boolean {
  const r = rowOf(sq)
  const c = colOf(sq)
  // Pawns: white pawns attack upward (toward row 0), so they sit one row below.
  const pr = by === 'w' ? r + 1 : r - 1
  const pawn = by + 'P'
  if (on(pr, c - 1) && board[pr * 8 + c - 1] === pawn) return true
  if (on(pr, c + 1) && board[pr * 8 + c + 1] === pawn) return true
  const knight = by + 'N'
  for (const [dr, dc] of KNIGHT) if (on(r + dr, c + dc) && board[(r + dr) * 8 + c + dc] === knight) return true
  const king = by + 'K'
  for (const [dr, dc] of KING) if (on(r + dr, c + dc) && board[(r + dr) * 8 + c + dc] === king) return true
  const rook = by + 'R'
  const bishop = by + 'B'
  const queen = by + 'Q'
  for (const [dr, dc] of ROOK_DIRS) {
    let rr = r + dr
    let cc = c + dc
    while (on(rr, cc)) {
      const p = board[rr * 8 + cc]
      if (p) {
        if (p === rook || p === queen) return true
        break
      }
      rr += dr
      cc += dc
    }
  }
  for (const [dr, dc] of BISHOP_DIRS) {
    let rr = r + dr
    let cc = c + dc
    while (on(rr, cc)) {
      const p = board[rr * 8 + cc]
      if (p) {
        if (p === bishop || p === queen) return true
        break
      }
      rr += dr
      cc += dc
    }
  }
  return false
}

export const kingSquare = (board: Board, color: Color): number => board.indexOf(color + 'K')
export const inCheck = (p: Position, color: Color = p.turn): boolean => {
  const k = kingSquare(p.board, color)
  return k >= 0 && attacked(p.board, k, other(color))
}

const PROMOS: readonly PromoType[] = ['Q', 'R', 'B', 'N']

/** Pseudo-legal moves (may leave own king in check) for the side to move. */
export function pseudoMoves(p: Position, capturesOnly = false): Move[] {
  const out: Move[] = []
  const b = p.board
  const me = p.turn
  const them = other(me)
  for (let from = 0; from < 64; from++) {
    const piece = b[from]
    if (!piece || piece[0] !== me) continue
    const r = rowOf(from)
    const c = colOf(from)
    const t = piece[1]
    const add = (to: number, extra?: Partial<Move>): void => {
      out.push({ from, to, piece, captured: b[to] ?? '', ...extra })
    }
    if (t === 'P') {
      const dir = me === 'w' ? -1 : 1
      const startRow = me === 'w' ? 6 : 1
      const lastRow = me === 'w' ? 0 : 7
      const fr = r + dir
      const pushPawn = (to: number, extra?: Partial<Move>): void => {
        if (rowOf(to) === lastRow) for (const promo of PROMOS) add(to, { ...extra, promo })
        else add(to, extra)
      }
      if (on(fr, c) && !b[fr * 8 + c]) {
        if (!capturesOnly || fr === lastRow) pushPawn(fr * 8 + c)
        if (!capturesOnly && r === startRow && !b[(r + 2 * dir) * 8 + c]) add((r + 2 * dir) * 8 + c)
      }
      for (const dc of [-1, 1]) {
        if (!on(fr, c + dc)) continue
        const to = fr * 8 + c + dc
        const target = b[to]
        if (target && target[0] === them) pushPawn(to)
        else if (p.ep === to) out.push({ from, to, piece, captured: them + 'P', ep: true })
      }
      continue
    }
    if (t === 'N' || t === 'K') {
      for (const [dr, dc] of t === 'N' ? KNIGHT : KING) {
        if (!on(r + dr, c + dc)) continue
        const to = (r + dr) * 8 + c + dc
        const target = b[to]
        if (!target ? !capturesOnly : target[0] === them) add(to)
      }
      if (t === 'K' && !capturesOnly) castles(p, from, out)
      continue
    }
    const dirs = t === 'R' ? ROOK_DIRS : t === 'B' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS]
    for (const [dr, dc] of dirs) {
      let rr = r + dr
      let cc = c + dc
      while (on(rr, cc)) {
        const to = rr * 8 + cc
        const target = b[to]
        if (target) {
          if (target[0] === them) add(to)
          break
        }
        if (!capturesOnly) add(to)
        rr += dr
        cc += dc
      }
    }
  }
  return out
}

function castles(p: Position, from: number, out: Move[]): void {
  const me = p.turn
  const home = me === 'w' ? 60 : 4
  if (from !== home) return
  const b = p.board
  const them = other(me)
  const [kRight, qRight] = me === 'w' ? ['K', 'Q'] : ['k', 'q']
  if (attacked(b, home, them)) return
  if (p.castling.includes(kRight!) && b[home + 3] === me + 'R' && !b[home + 1] && !b[home + 2]) {
    if (!attacked(b, home + 1, them) && !attacked(b, home + 2, them))
      out.push({ from, to: home + 2, piece: me + 'K', captured: '', castle: 'K' })
  }
  if (p.castling.includes(qRight!) && b[home - 4] === me + 'R' && !b[home - 1] && !b[home - 2] && !b[home - 3]) {
    if (!attacked(b, home - 1, them) && !attacked(b, home - 2, them))
      out.push({ from, to: home - 2, piece: me + 'K', captured: '', castle: 'Q' })
  }
}

const CORNER_RIGHT: Record<number, string> = { 63: 'K', 56: 'Q', 7: 'k', 0: 'q' }

/** Apply a (pseudo-)legal move. Does not check legality. */
export function makeMove(p: Position, m: Move): Position {
  const b = p.board.slice()
  const me = p.turn
  b[m.from] = ''
  b[m.to] = m.promo ? me + m.promo : m.piece
  if (m.ep) b[m.to + (me === 'w' ? 8 : -8)] = ''
  if (m.castle === 'K') {
    b[m.to - 1] = b[m.to + 1]!
    b[m.to + 1] = ''
  } else if (m.castle === 'Q') {
    b[m.to + 1] = b[m.to - 2]!
    b[m.to - 2] = ''
  }
  let castling = p.castling
  if (castling) {
    if (m.piece[1] === 'K') castling = castling.replace(me === 'w' ? /[KQ]/g : /[kq]/g, '')
    const a = CORNER_RIGHT[m.from]
    const z = CORNER_RIGHT[m.to]
    if (a) castling = castling.replace(a, '')
    if (z) castling = castling.replace(z, '')
  }
  const pawn = m.piece[1] === 'P'
  const ep = pawn && Math.abs(m.to - m.from) === 16 ? (m.to + m.from) / 2 : null
  return {
    board: b,
    turn: other(me),
    castling,
    ep,
    halfmove: pawn || m.captured ? 0 : p.halfmove + 1,
    fullmove: me === 'b' ? p.fullmove + 1 : p.fullmove,
  }
}

/** Fully legal moves for the side to move. */
export function legalMoves(p: Position): Move[] {
  const me = p.turn
  return pseudoMoves(p).filter((m) => {
    const n = makeMove(p, m)
    return !attacked(n.board, kingSquare(n.board, me), other(me))
  })
}

export function perft(p: Position, depth: number): number {
  if (depth === 0) return 1
  const moves = legalMoves(p)
  if (depth === 1) return moves.length
  let n = 0
  for (const m of moves) n += perft(makeMove(p, m), depth - 1)
  return n
}

/** Dead position by insufficient material (no sequence of legal moves can mate). */
export function insufficientMaterial(board: Board): boolean {
  const minors: { t: string; shade: number }[] = []
  for (let i = 0; i < 64; i++) {
    const p = board[i]
    if (!p || p[1] === 'K') continue
    if (p[1] === 'P' || p[1] === 'R' || p[1] === 'Q') return false
    minors.push({ t: p[1]!, shade: (rowOf(i) + colOf(i)) % 2 })
  }
  if (minors.length <= 1) return true
  // Only bishops, all on one square colour: neither side can ever mate.
  return minors.every((m) => m.t === 'B') && minors.every((m) => m.shade === minors[0]!.shade)
}

/** Repetition key: placement, side to move, castling rights, and a usable en passant square. */
export function positionKey(p: Position): string {
  let ep = '-'
  if (p.ep !== null && legalMoves(p).some((m) => m.ep)) ep = sqName(p.ep)
  return `${p.board.map((x) => x || '.').join('')} ${p.turn} ${p.castling} ${ep}`
}

// ---------------------------------------------------------------- notation

/** Standard algebraic notation for a legal move in position `p`. */
export function san(p: Position, m: Move, legal: readonly Move[] = legalMoves(p)): string {
  let s: string
  if (m.castle) s = m.castle === 'K' ? 'O-O' : 'O-O-O'
  else {
    const t = m.piece[1]
    const capture = !!m.captured
    if (t === 'P') {
      s = capture ? `${sqName(m.from)[0]}x${sqName(m.to)}` : sqName(m.to)
      if (m.promo) s += `=${m.promo}`
    } else {
      const rivals = legal.filter((o) => o.piece === m.piece && o.to === m.to && o.from !== m.from)
      let dis = ''
      if (rivals.length) {
        const sameFile = rivals.some((o) => colOf(o.from) === colOf(m.from))
        const sameRank = rivals.some((o) => rowOf(o.from) === rowOf(m.from))
        if (!sameFile) dis = sqName(m.from)[0]!
        else if (!sameRank) dis = sqName(m.from)[1]!
        else dis = sqName(m.from)
      }
      s = `${t}${dis}${capture ? 'x' : ''}${sqName(m.to)}`
    }
  }
  const n = makeMove(p, m)
  if (inCheck(n)) s += legalMoves(n).length === 0 ? '#' : '+'
  return s
}

// ---------------------------------------------------------------- game

export type DrawReason = 'stalemate' | 'insufficient' | 'fifty' | 'repetition'
export type Ending = { readonly kind: 'checkmate'; readonly winner: Color } | { readonly kind: 'draw'; readonly reason: DrawReason }

export interface PlayedMove {
  readonly san: string
  readonly color: Color
  readonly from: number
  readonly to: number
}

export interface Game {
  readonly pos: Position
  /** Repetition keys of every position reached, including the start. */
  readonly keys: readonly string[]
  readonly moves: readonly PlayedMove[]
  readonly ending: Ending | null
}

export function newGame(pos: Position = startPosition()): Game {
  const g: Game = { pos, keys: [positionKey(pos)], moves: [], ending: null }
  return { ...g, ending: judge(g.pos, g.keys) }
}

/**
 * Ending of the position just reached. Checkmate and stalemate first; then the
 * draws, applied automatically: dead position (insufficient material), the
 * 50-move rule (100 plies without capture or pawn move) and threefold
 * repetition.
 */
export function judge(pos: Position, keys: readonly string[]): Ending | null {
  if (legalMoves(pos).length === 0)
    return inCheck(pos) ? { kind: 'checkmate', winner: other(pos.turn) } : { kind: 'draw', reason: 'stalemate' }
  if (insufficientMaterial(pos.board)) return { kind: 'draw', reason: 'insufficient' }
  if (pos.halfmove >= 100) return { kind: 'draw', reason: 'fifty' }
  const last = keys[keys.length - 1]
  if (last && keys.filter((k) => k === last).length >= 3) return { kind: 'draw', reason: 'repetition' }
  return null
}

export function play(g: Game, m: Move): Game {
  const notation = san(g.pos, m)
  const pos = makeMove(g.pos, m)
  const key = positionKey(pos)
  // Positions before an irreversible move can never recur; keep it short.
  const keys = pos.halfmove === 0 ? [key] : [...g.keys, key]
  return {
    pos,
    keys,
    moves: [...g.moves, { san: notation, color: g.pos.turn, from: m.from, to: m.to }],
    ending: judge(pos, keys),
  }
}

// ---------------------------------------------------------------- AI

export const VALUE: Record<string, number> = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 }
const MATE = 100000
const PAWN_ADV = [0, 0, 6, 12, 22, 38, 70, 0]
const CENTER = [0, 2, 5, 8, 8, 5, 2, 0]

/** Static evaluation from the side to move's point of view. */
export function evaluate(p: Position): number {
  const b = p.board
  let score = 0
  let queens = 0
  for (const x of b) if (x && x[1] === 'Q') queens++
  for (let i = 0; i < 64; i++) {
    const pc = b[i]
    if (!pc) continue
    const col = pc[0] as Color
    const t = pc[1]!
    const r = rowOf(i)
    const c = colOf(i)
    let v = VALUE[t]!
    if (t === 'P') {
      // Promotion distance.
      const adv = col === 'w' ? 6 - r : r - 1
      v += PAWN_ADV[adv + 1] ?? 0
      v += c >= 2 && c <= 5 ? 4 : 0
    } else if (t === 'N' || t === 'B') {
      v += CENTER[r]! + CENTER[c]!
      // Mobility of minor pieces and sliders.
      v += 3 * mobility(b, i, t)
    } else if (t === 'R' || t === 'Q') {
      v += 2 * mobility(b, i, t)
    } else if (t === 'K' && queens > 0) {
      // King safety while queens remain: stay home behind a pawn shield.
      const home = col === 'w' ? 7 : 0
      v += r === home ? 10 : -15 * Math.abs(r - home)
      const fr = col === 'w' ? r - 1 : r + 1
      for (const dc of [-1, 0, 1]) if (on(fr, c + dc) && b[fr * 8 + c + dc] === col + 'P') v += 9
      if (c >= 3 && c <= 4 && r === home) v -= 8
    }
    score += col === p.turn ? v : -v
  }
  return score
}

function mobility(b: Board, from: number, t: string): number {
  const r = rowOf(from)
  const c = colOf(from)
  let n = 0
  if (t === 'N') {
    for (const [dr, dc] of KNIGHT) if (on(r + dr, c + dc)) n++
    return n
  }
  const dirs = t === 'R' ? ROOK_DIRS : t === 'B' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS]
  for (const [dr, dc] of dirs) {
    let rr = r + dr
    let cc = c + dc
    while (on(rr, cc)) {
      n++
      if (b[rr * 8 + cc]) break
      rr += dr
      cc += dc
    }
  }
  return t === 'Q' ? n >> 1 : n
}

const orderScore = (m: Move): number =>
  (m.captured ? 10 * VALUE[m.captured[1]!]! - VALUE[m.piece[1]!]! + 1000 : 0) + (m.promo ? VALUE[m.promo]! : 0)

class Abort extends Error {}

export interface SearchOptions {
  /** Full-width plies. */
  readonly depth: number
  /** Extra capture-only plies at the leaves (0 disables). */
  readonly quiescence: number
  /** Node budget; the deepest finished iteration is used once it runs out. */
  readonly maxNodes: number
  /** Root moves within this many centipawns of the best are equally likely. */
  readonly margin: number
  readonly rand?: () => number
}

export const SEARCH: Record<'beginner' | 'standard', SearchOptions> = {
  beginner: { depth: 2, quiescence: 0, maxNodes: 40000, margin: 40 },
  standard: { depth: 3, quiescence: 4, maxNodes: 120000, margin: 0 },
}

export interface SearchResult {
  readonly move: Move | null
  readonly score: number
  readonly depth: number
  readonly nodes: number
}

/** Iterative-deepening alpha-beta over legal moves only. */
export function search(p: Position, opts: SearchOptions): SearchResult {
  const rand = opts.rand ?? Math.random
  let nodes = 0
  const tick = (): void => {
    if (++nodes > opts.maxNodes) throw new Abort()
  }

  const quiesce = (pos: Position, alpha: number, beta: number, qd: number): number => {
    tick()
    const stand = evaluate(pos)
    if (qd <= 0) return stand
    if (stand >= beta) return stand
    if (stand > alpha) alpha = stand
    const caps = pseudoMoves(pos, true).sort((a, z) => orderScore(z) - orderScore(a))
    const me = pos.turn
    for (const m of caps) {
      const n = makeMove(pos, m)
      if (attacked(n.board, kingSquare(n.board, me), other(me))) continue
      const v = -quiesce(n, -beta, -alpha, qd - 1)
      if (v >= beta) return v
      if (v > alpha) alpha = v
    }
    return alpha
  }

  const negamax = (pos: Position, depth: number, alpha: number, beta: number, ply: number): number => {
    tick()
    if (pos.halfmove >= 100 || insufficientMaterial(pos.board)) return 0
    if (depth <= 0) {
      // Mate / stalemate at the horizon still count as terminal.
      const any = hasLegal(pos)
      if (!any) return inCheck(pos) ? -MATE + ply : 0
      return opts.quiescence > 0 ? quiesce(pos, alpha, beta, opts.quiescence) : evaluate(pos)
    }
    const me = pos.turn
    const moves = pseudoMoves(pos).sort((a, z) => orderScore(z) - orderScore(a))
    let best = -Infinity
    let legal = 0
    for (const m of moves) {
      const n = makeMove(pos, m)
      if (attacked(n.board, kingSquare(n.board, me), other(me))) continue
      legal++
      const v = -negamax(n, depth - 1, -beta, -alpha, ply + 1)
      if (v > best) best = v
      if (v > alpha) alpha = v
      if (alpha >= beta) break
    }
    if (legal === 0) return inCheck(pos) ? -MATE + ply : 0
    return best
  }

  let root = legalMoves(p).sort((a, z) => orderScore(z) - orderScore(a))
  if (root.length === 0) return { move: null, score: inCheck(p) ? -MATE : 0, depth: 0, nodes: 0 }
  let result: SearchResult = { move: root[0]!, score: 0, depth: 0, nodes: 0 }
  for (let depth = 1; depth <= opts.depth; depth++) {
    try {
      const scored: { m: Move; v: number }[] = []
      let best = -Infinity
      for (const m of root) {
        const alpha = best === -Infinity ? -Infinity : best - opts.margin - 1
        const v = -negamax(makeMove(p, m), depth - 1, -Infinity, -alpha, 1)
        scored.push({ m, v })
        if (v > best) best = v
      }
      const pool = scored.filter((s) => s.v >= best - opts.margin)
      // Prefer a quicker mate / the plain best among the pool by score first.
      const top = best >= MATE - 100 ? pool.filter((s) => s.v === best) : pool
      const pick = top[Math.floor(rand() * top.length)] ?? top[0]!
      result = { move: pick.m, score: best, depth, nodes }
      // Search the best moves first on the next iteration.
      root = scored.sort((a, z) => z.v - a.v).map((s) => s.m)
      if (best >= MATE - 100) break
    } catch (e) {
      if (!(e instanceof Abort)) throw e
      break
    }
  }
  return { ...result, nodes }
}

function hasLegal(p: Position): boolean {
  const me = p.turn
  for (const m of pseudoMoves(p)) {
    const n = makeMove(p, m)
    if (!attacked(n.board, kingSquare(n.board, me), other(me))) return true
  }
  return false
}

/** Material balance in pawns from White's side (for display). */
export function materialBalance(board: Board): number {
  let s = 0
  for (const pc of board) if (pc) s += (pc[0] === 'w' ? 1 : -1) * VALUE[pc[1]!]!
  return Math.round(s / 100)
}
