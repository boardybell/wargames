// CHESS engine fixtures (docs/games-design-review.md §7): perft legality
// counts, special moves, every ending reason, and the search.
import { describe, expect, it } from 'vitest'
import {
  fromFen,
  insufficientMaterial,
  legalMoves,
  newGame,
  perft,
  play,
  san,
  search,
  SEARCH,
  sqIndex,
  startPosition,
  toFen,
  type Game,
  type Move,
} from '@app/game/games/engines/chess'

const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'
const POS3 = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'
const POS4 = 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1'
const POS5 = 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8'

function find(g: Game, from: string, to: string, promo?: string): Move {
  const m = legalMoves(g.pos).find(
    (x) => x.from === sqIndex(from) && x.to === sqIndex(to) && (promo ? x.promo === promo : !x.promo || x.promo === 'Q'),
  )
  if (!m) throw new Error(`illegal ${from}${to}`)
  return m
}
const playAll = (g: Game, moves: string[]): Game =>
  moves.reduce((acc, s) => play(acc, find(acc, s.slice(0, 2), s.slice(2, 4), s[4])), g)

describe('chess perft', () => {
  it('start position: 20, 400, 8902', () => {
    const p = startPosition()
    expect(perft(p, 1)).toBe(20)
    expect(perft(p, 2)).toBe(400)
    expect(perft(p, 3)).toBe(8902)
  })
  it('kiwipete (castling, en passant, promotion): 48, 2039', () => {
    const p = fromFen(KIWIPETE)
    expect(perft(p, 1)).toBe(48)
    expect(perft(p, 2)).toBe(2039)
  })
  it('position 3 (en passant pins): 14, 191, 2812', () => {
    const p = fromFen(POS3)
    expect(perft(p, 1)).toBe(14)
    expect(perft(p, 2)).toBe(191)
    expect(perft(p, 3)).toBe(2812)
  })
  it('position 4 (promotions, castling through check): 6, 264, 9467', () => {
    const p = fromFen(POS4)
    expect(perft(p, 1)).toBe(6)
    expect(perft(p, 2)).toBe(264)
    expect(perft(p, 3)).toBe(9467)
  })
  it('position 5: 44, 1486', () => {
    const p = fromFen(POS5)
    expect(perft(p, 1)).toBe(44)
    expect(perft(p, 2)).toBe(1486)
  })
  it('FEN round-trips', () => {
    for (const f of [KIWIPETE, POS3, POS4, POS5]) expect(toFen(fromFen(f))).toBe(f)
  })
})

describe('chess special moves', () => {
  it('castles both ways and moves the rook; rights are lost after a king move', () => {
    const g = newGame(fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'))
    const ks = play(g, find(g, 'e1', 'g1'))
    expect(ks.pos.board[sqIndex('f1')]).toBe('wR')
    expect(ks.pos.board[sqIndex('h1')]).toBe('')
    expect(ks.moves[0]!.san).toBe('O-O')
    expect(ks.pos.castling).toBe('kq')
    const qs = play(ks, find(ks, 'e8', 'c8'))
    expect(qs.pos.board[sqIndex('d8')]).toBe('bR')
    expect(qs.moves[1]!.san).toBe('O-O-O')
    expect(qs.pos.castling).toBe('')
  })
  it('cannot castle out of, through, or into check', () => {
    // Black rook on f8 attacks f1: no kingside castling.
    const through = newGame(fromFen('4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1'))
    expect(legalMoves(through.pos).some((m) => m.castle === 'K')).toBe(false)
    expect(legalMoves(through.pos).some((m) => m.castle === 'Q')).toBe(true)
    const outOf = newGame(fromFen('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1'))
    expect(legalMoves(outOf.pos).some((m) => m.castle)).toBe(false)
  })
  it('captures en passant only immediately after the double step', () => {
    let g = newGame()
    g = playAll(g, ['e2e4', 'a7a6', 'e4e5', 'd7d5'])
    const ep = find(g, 'e5', 'd6')
    expect(ep.ep).toBe(true)
    const after = play(g, ep)
    expect(after.pos.board[sqIndex('d5')]).toBe('')
    expect(after.moves[after.moves.length - 1]!.san).toBe('exd6')
    // One move later the right has lapsed.
    const late = playAll(g, ['g1f3', 'a6a5'])
    expect(legalMoves(late.pos).some((m) => m.ep)).toBe(false)
  })
  it('offers all four promotion pieces', () => {
    const g = newGame(fromFen('8/P6k/8/8/8/8/8/K7 w - - 0 1'))
    const promos = legalMoves(g.pos).filter((m) => m.from === sqIndex('a7'))
    expect(promos.map((m) => m.promo).sort()).toEqual(['B', 'N', 'Q', 'R'])
    const n = play(g, find(g, 'a7', 'a8', 'N'))
    expect(n.pos.board[sqIndex('a8')]).toBe('wN')
    expect(n.moves[0]!.san).toBe('a8=N')
  })
  it('disambiguates SAN', () => {
    const p = fromFen('k7/8/8/8/8/8/8/KN3N2 w - - 0 1')
    const m = legalMoves(p).find((x) => x.from === sqIndex('b1') && x.to === sqIndex('d2'))!
    expect(san(p, m)).toBe('Nbd2')
  })
})

describe('chess endings', () => {
  it("fool's mate is checkmate", () => {
    const g = playAll(newGame(), ['f2f3', 'e7e5', 'g2g4', 'd8h4'])
    expect(g.ending).toEqual({ kind: 'checkmate', winner: 'b' })
    expect(g.moves[3]!.san).toBe('Qh4#')
  })
  it('stalemate is a draw', () => {
    const g = newGame(fromFen('k7/8/1Q6/8/8/8/8/7K w - - 0 1'))
    // Qc7 takes a7, b7 and b8 away without giving check.
    const s = play(g, find(g, 'b6', 'c7'))
    expect(s.ending).toEqual({ kind: 'draw', reason: 'stalemate' })
    const g2 = newGame(fromFen('k7/2Q5/8/8/8/8/8/7K b - - 0 1'))
    expect(g2.ending).toEqual({ kind: 'draw', reason: 'stalemate' })
  })
  it('bare kings and other dead positions end immediately', () => {
    const g = newGame(fromFen('k7/8/8/8/8/8/1q6/K7 w - - 0 1'))
    const bare = play(g, find(g, 'a1', 'b2'))
    expect(bare.ending).toEqual({ kind: 'draw', reason: 'insufficient' })
    expect(insufficientMaterial(fromFen('k7/8/8/8/8/8/8/KB6 w - - 0 1').board)).toBe(true)
    expect(insufficientMaterial(fromFen('k7/8/8/8/8/8/8/KN6 w - - 0 1').board)).toBe(true)
    // Bishops on the same colour squares: dead. Opposite colours: play on.
    expect(insufficientMaterial(fromFen('kb6/8/8/8/8/8/8/KB6 w - - 0 1').board)).toBe(false)
    expect(insufficientMaterial(fromFen('k1b5/8/8/8/8/8/8/KB6 w - - 0 1').board)).toBe(true)
    expect(insufficientMaterial(fromFen('k7/8/8/8/8/8/8/KNN5 w - - 0 1').board)).toBe(false)
    expect(insufficientMaterial(fromFen('k7/8/8/8/8/8/P7/K7 w - - 0 1').board)).toBe(false)
  })
  it('threefold repetition draws', () => {
    let g = newGame()
    const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8']
    g = playAll(g, cycle)
    expect(g.ending).toBeNull()
    g = playAll(g, cycle.slice(0, 3))
    expect(g.ending).toBeNull()
    g = playAll(g, cycle.slice(3))
    expect(g.ending).toEqual({ kind: 'draw', reason: 'repetition' })
  })
  it('50-move rule draws at 100 plies without capture or pawn move', () => {
    const g = newGame(fromFen('k7/8/8/8/8/8/8/KR6 w - - 99 80'))
    const d = play(g, find(g, 'b1', 'b2'))
    expect(d.ending).toEqual({ kind: 'draw', reason: 'fifty' })
    const g2 = newGame(fromFen('k7/8/8/8/8/8/8/KR6 w - - 98 80'))
    expect(play(g2, find(g2, 'b1', 'b2')).ending).toBeNull()
  })
  it('checkmate on the 100th ply beats the 50-move rule', () => {
    const g = newGame(fromFen('k7/8/1K6/8/8/8/8/7R w - - 99 80'))
    const m = play(g, find(g, 'h1', 'h8'))
    expect(m.ending).toEqual({ kind: 'checkmate', winner: 'w' })
  })
})

describe('chess search', () => {
  it('finds mate in one', () => {
    const p = fromFen('k7/8/1K6/8/8/8/8/7R w - - 0 1')
    const r = search(p, { ...SEARCH.standard, rand: () => 0 })
    expect(r.move!.to).toBe(sqIndex('h8'))
  })
  it('does not grab a defended pawn with the queen (looks at the reply)', () => {
    // Qxd5?? loses the queen to cxd5 / exd5.
    const p = fromFen('4k3/8/2p1p3/3p4/8/8/3Q4/4K3 w - - 0 1')
    for (const level of ['beginner', 'standard'] as const) {
      const r = search(p, { ...SEARCH[level], rand: () => 0.5 })
      expect(r.move!.to === sqIndex('d5') && r.move!.piece === 'wQ').toBe(false)
    }
  })
  it('takes a hanging queen', () => {
    const p = fromFen('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1')
    const r = search(p, { ...SEARCH.standard, rand: () => 0 })
    expect(r.move!.to).toBe(sqIndex('d5'))
  })
  it('stays within its node budget from the opening', () => {
    const p = startPosition()
    const t = performance.now()
    const r = search(p, SEARCH.standard)
    const ms = performance.now() - t
    expect(r.move).not.toBeNull()
    expect(r.nodes).toBeLessThanOrEqual(SEARCH.standard.maxNodes + 1)
    expect(ms).toBeLessThan(3000)
  })
})
