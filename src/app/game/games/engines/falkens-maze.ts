// FALKENS MAZE rules: seeded perfect-maze generation (iterative recursive
// backtracker), wall-checked movement, shortest route (BFS) and efficiency.
// Pure functions; the component only renders and dispatches.
import { rng } from '../hooks'

export type Dir = 'n' | 'e' | 's' | 'w'
export const DIRS: readonly Dir[] = ['n', 'e', 's', 'w']

export type MazeSize = 'small' | 'standard' | 'large'
export const SIZES: Record<MazeSize, { readonly n: number; readonly label: string }> = {
  small: { n: 7, label: 'SMALL' },
  standard: { n: 11, label: 'STANDARD' },
  large: { n: 15, label: 'LARGE' },
}

/** Standing walls of one cell. */
export interface Cell {
  readonly n: boolean
  readonly e: boolean
  readonly s: boolean
  readonly w: boolean
}

export interface Maze {
  readonly seed: number
  readonly cols: number
  readonly rows: number
  readonly cells: readonly Cell[]
}

export interface Pos {
  readonly c: number
  readonly r: number
}

export const START: Pos = { c: 0, r: 0 }
export const exitOf = (m: Maze): Pos => ({ c: m.cols - 1, r: m.rows - 1 })
export const samePos = (a: Pos, b: Pos): boolean => a.c === b.c && a.r === b.r
const idx = (m: { cols: number }, p: Pos): number => p.r * m.cols + p.c

const DELTA: Record<Dir, Pos> = { n: { c: 0, r: -1 }, e: { c: 1, r: 0 }, s: { c: 0, r: 1 }, w: { c: -1, r: 0 } }
const OPP: Record<Dir, Dir> = { n: 's', e: 'w', s: 'n', w: 'e' }
export const DIR_NAME: Record<Dir, string> = { n: 'UP', e: 'RIGHT', s: 'DOWN', w: 'LEFT' }

/** Same seed and size always carve the same maze. */
export function generate(seed: number, n: number): Maze {
  const rand = rng(seed)
  const cols = n
  const rows = n
  const cells = Array.from({ length: cols * rows }, () => ({ n: true, e: true, s: true, w: true }))
  const seen = new Array<boolean>(cols * rows).fill(false)
  const stack: Pos[] = [START]
  seen[0] = true
  while (stack.length > 0) {
    const p = stack[stack.length - 1]!
    const nbrs: Dir[] = []
    for (const d of DIRS) {
      const q = { c: p.c + DELTA[d].c, r: p.r + DELTA[d].r }
      if (q.c >= 0 && q.r >= 0 && q.c < cols && q.r < rows && !seen[q.r * cols + q.c]) nbrs.push(d)
    }
    if (nbrs.length === 0) {
      stack.pop()
      continue
    }
    const d = nbrs[Math.floor(rand() * nbrs.length)]!
    const q = { c: p.c + DELTA[d].c, r: p.r + DELTA[d].r }
    cells[p.r * cols + p.c]![d] = false
    cells[q.r * cols + q.c]![OPP[d]] = false
    seen[q.r * cols + q.c] = true
    stack.push(q)
  }
  return { seed, cols, rows, cells }
}

export const cellAt = (m: Maze, p: Pos): Cell => m.cells[idx(m, p)]!
export const isOpen = (m: Maze, p: Pos, d: Dir): boolean => !cellAt(m, p)[d]

/** Directions without a wall from p. */
export const openDirs = (m: Maze, p: Pos): Dir[] => DIRS.filter((d) => isOpen(m, p, d))

export type MoveResult = { readonly ok: true; readonly pos: Pos } | { readonly ok: false; readonly pos: Pos }

/** A blocked move leaves the position unchanged and does not count as a move. */
export function tryMove(m: Maze, p: Pos, d: Dir): MoveResult {
  if (!isOpen(m, p, d)) return { ok: false, pos: p }
  return { ok: true, pos: { c: p.c + DELTA[d].c, r: p.r + DELTA[d].r } }
}

/** BFS route from a to b inclusive of both ends. A perfect maze has exactly one. */
export function shortestPath(m: Maze, a: Pos, b: Pos): Pos[] {
  const prev = new Array<number>(m.cols * m.rows).fill(-2)
  const q: Pos[] = [a]
  prev[idx(m, a)] = -1
  while (q.length > 0) {
    const p = q.shift()!
    if (samePos(p, b)) break
    for (const d of openDirs(m, p)) {
      const nx = { c: p.c + DELTA[d].c, r: p.r + DELTA[d].r }
      if (prev[idx(m, nx)] !== -2) continue
      prev[idx(m, nx)] = idx(m, p)
      q.push(nx)
    }
  }
  const out: Pos[] = []
  let i = idx(m, b)
  if (prev[i] === -2) return out
  while (i !== -1) {
    out.push({ c: i % m.cols, r: Math.floor(i / m.cols) })
    i = prev[i]!
  }
  return out.reverse()
}

/** Minimum moves start -> exit. */
export const shortestMoves = (m: Maze): number => shortestPath(m, START, exitOf(m)).length - 1

/** Direction of the next step on the shortest route from p, or null at the exit. */
export function hintFrom(m: Maze, p: Pos): Dir | null {
  const path = shortestPath(m, p, exitOf(m))
  const next = path[1]
  if (!next) return null
  return DIRS.find((d) => p.c + DELTA[d].c === next.c && p.r + DELTA[d].r === next.r) ?? null
}

/** Shortest / actual as a whole percentage (100 = perfect route). */
export const efficiency = (moves: number, shortest: number): number =>
  moves <= 0 ? 0 : Math.round((Math.min(shortest, moves) / moves) * 100)

export const recordKey = (size: MazeSize, seed: number): string => `best:${size}:${seed}`
