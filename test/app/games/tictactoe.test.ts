import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { playOptimalGame, boardAfter } from '@app/games'

describe('optimal tic-tac-toe', () => {
  it('two optimal players reach a draw from the empty board', () => {
    const game = playOptimalGame()
    expect(game.result).toBe('draw')
    // A draw fills the board: nine moves, every cell taken.
    expect(game.moves).toHaveLength(9)
    const final = boardAfter(game.moves, game.moves.length)
    expect(final.every((c) => c !== null)).toBe(true)
  })

  it('the move list is deterministic across independent runs', () => {
    const a = playOptimalGame()
    const b = playOptimalGame()
    expect(a.moves).toEqual(b.moves)
  })

  it('alternates X and O starting with X, each cell used once', () => {
    const { moves } = playOptimalGame()
    moves.forEach((m, i) => {
      expect(m.player).toBe(i % 2 === 0 ? 'X' : 'O')
    })
    const cells = moves.map((m) => m.cell).sort((x, y) => x - y)
    expect(cells).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('is pure: boardAfter never mutates the move list and is reproducible', () => {
    const { moves } = playOptimalGame()
    const first = boardAfter(moves, 5)
    const second = boardAfter(moves, 5)
    expect(first).toEqual(second)
    expect(moves).toHaveLength(9)
  })

  it('imports nothing from app state or the engine (dependency-free by construction)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/app/games/tictactoe.ts'),
      'utf8',
    )
    expect(src).not.toMatch(/from ['"].*app\/state/)
    expect(src).not.toMatch(/from ['"]@app\/state/)
    expect(src).not.toMatch(/from ['"]@engine/)
    expect(src).not.toMatch(/from ['"].*\/engine/)
  })
})
