// CHECKERS engine fixtures (docs/games-design-review.md §6).
import { describe, expect, it } from 'vitest'
import {
  boardFrom,
  captureRequired,
  chooseMove,
  completed,
  count,
  initialBoard,
  legalSequences,
  newGame,
  nextHops,
  partialBoard,
  play,
  type GameState,
  type Sequence,
  type Side,
} from '@app/game/games/engines/checkers'

const byPath = (seqs: readonly Sequence[], path: number[]): Sequence => {
  const s = completed(seqs, path)
  if (!s) throw new Error(`no move ${path.join('-')}`)
  return s
}
const step = (g: GameState, path: number[]): GameState => play(g, byPath(legalSequences(g.board, g.turn, g.mode), path))

describe('checkers engine', () => {
  it('starts with 12 pieces a side and 7 opening moves', () => {
    const b = initialBoard()
    expect(count(b, 'w').total).toBe(12)
    expect(count(b, 'b').total).toBe(12)
    expect(legalSequences(b, 'w', 'standard')).toHaveLength(7)
  })

  it('king circuit 42 over 35,19,17,33 returns to its origin and is selectable hop by hop', () => {
    const b = boardFrom({ W: [42], b: [35, 19, 17, 33] })
    const seqs = legalSequences(b, 'w', 'standard')
    expect(seqs).toHaveLength(2)
    for (const s of seqs) {
      expect(s.path[0]).toBe(42)
      expect(s.path[s.path.length - 1]).toBe(42)
      expect(s.captured).toHaveLength(4)
    }
    // Walk one circuit hop by hop: the origin square is a legal final landing.
    let path = [42]
    expect(nextHops(seqs, path).sort((a, z) => a - z)).toEqual([24, 28])
    for (const hop of [28, 10, 24]) {
      expect(nextHops(seqs, path)).toContain(hop)
      path = [...path, hop]
      expect(completed(seqs, path)).toBeUndefined()
    }
    // Part-way, the origin is empty and the piece sits on the last landing.
    const mid = partialBoard(b, path)
    expect(mid[42]).toBe('')
    expect(mid[24]).toBe('W')
    expect(nextHops(seqs, path)).toEqual([42])
    const done = completed(seqs, [...path, 42])
    expect(done).toBeDefined()
    expect(done!.board[42]).toBe('W')
    expect(count(done!.board, 'b').total).toBe(0)
  })

  it('standard rules make captures compulsory; casual offers steps too', () => {
    const b = boardFrom({ w: [45, 40], b: [36, 1] })
    expect(captureRequired(b, 'w', 'standard')).toBe(true)
    const std = legalSequences(b, 'w', 'standard')
    expect(std.every((s) => s.captured.length > 0)).toBe(true)
    expect(std.map((s) => s.path)).toEqual([[45, 27]])
    const casual = legalSequences(b, 'w', 'casual')
    expect(casual.some((s) => s.captured.length === 0)).toBe(true)
    expect(casual.some((s) => s.captured.length === 1)).toBe(true)
    expect(captureRequired(b, 'w', 'casual')).toBe(false)
  })

  it('lets the player choose a shorter capture branch', () => {
    // 45 can take 36 (then 18) or take 38 and stop.
    const b = boardFrom({ w: [45], b: [36, 18, 38] })
    const seqs = legalSequences(b, 'w', 'standard')
    const lens = seqs.map((s) => s.captured.length).sort()
    expect(lens).toEqual([1, 2])
    expect(completed(seqs, [45, 31])).toBeDefined()
    expect(completed(seqs, [45, 27])).toBeUndefined()
    expect(nextHops(seqs, [45, 27])).toEqual([9])
  })

  it('crowning ends a jump chain', () => {
    // Man at 17 jumps 10 to land on 3 and is crowned; a king could go on over 12.
    const b = boardFrom({ w: [17], b: [10, 12] })
    const seqs = legalSequences(b, 'w', 'standard')
    expect(seqs).toHaveLength(1)
    expect(seqs[0]!.path).toEqual([17, 3])
    expect(seqs[0]!.crowned).toBe(true)
    expect(seqs[0]!.board[3]).toBe('W')
    expect(seqs[0]!.board[12]).toBe('b')
  })

  it('a side with no legal move loses', () => {
    const b = boardFrom({ w: [17], b: [8, 10, 3, 46] })
    const g = newGame('casual', b, 'b' as Side)
    const after = step(g, [46, 53])
    expect(after.ending).toEqual({ winner: 'b', reason: 'no-moves' })
  })

  it('capturing the last piece wins', () => {
    const g = newGame('standard', boardFrom({ w: [45], b: [36] }), 'w')
    expect(step(g, [45, 27]).ending).toEqual({ winner: 'w', reason: 'no-pieces' })
  })

  it('threefold repetition is a draw', () => {
    let g = newGame('standard', boardFrom({ W: [62], B: [1] }), 'w')
    const cycle: number[][] = [
      [62, 53],
      [1, 10],
      [53, 62],
      [10, 1],
    ]
    for (let k = 0; k < 7; k++) {
      g = step(g, cycle[k % 4]!)
      expect(g.ending).toBeNull()
    }
    g = step(g, cycle[3]!)
    expect(g.ending).toEqual({ winner: 'draw', reason: 'repetition' })
  })

  it('40 moves each without a capture or man move is a draw', () => {
    const g0 = newGame('standard', boardFrom({ W: [62], B: [1] }), 'w')
    const g = { ...g0, quiet: 79 }
    expect(step(g, [62, 53]).ending).toEqual({ winner: 'draw', reason: 'no-progress' })
    // A man move resets the counter.
    const g2 = { ...newGame('standard', boardFrom({ W: [62], w: [40], B: [1] }), 'w'), quiet: 79 }
    const after = step(g2, [40, 33])
    expect(after.quiet).toBe(0)
    expect(after.ending).toBeNull()
  })

  it('standard AI looks at the reply and does not hang a piece', () => {
    // WOPR man at 12 may step to 19 (safe) or 21 (jumped by 30).
    const g = newGame('standard', boardFrom({ b: [12], w: [30, 56] }), 'b')
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const m = chooseMove(g, 'standard', () => r)
      expect(m!.path).toEqual([12, 19])
    }
  })

  it('beginner AI keeps the capture-greedy policy', () => {
    // Casual rules: capture optional, beginner still takes the double.
    const g = newGame('casual', boardFrom({ b: [10], w: [19, 37, 60] }), 'b')
    const m = chooseMove(g, 'beginner', () => 0.5)
    expect(m!.captured).toHaveLength(2)
  })
})
