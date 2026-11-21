// FALKENS MAZE. Navigate a seeded perfect maze from the top-left start to the
// labeled exit with the arrow keys, WASD or the direction pad. A move into a
// wall is refused (WALL) and never counted. At the exit the shortest route is
// revealed with your efficiency; RETRY THIS MAZE replays the same seed, NEW
// MAZE carves another. Best moves are kept per seed and size. Rules live in
// engines/falkens-maze.ts (design: docs/games-design-review.md §1).
import { useState } from 'react'
import type { GameEntry, GameProps } from './types'
import { Action, ActionBar, GameReport, GameResult, GameShell, Panel, Segmented } from './ui/GameShell'
import { cue, newSeed, useEventLog, useGameKeys, useGameRecords } from './hooks'
import {
  DIR_NAME,
  SIZES,
  START,
  type Dir,
  type Maze,
  type MazeSize,
  type Pos,
  efficiency,
  exitOf,
  generate,
  hintFrom,
  isOpen,
  recordKey,
  samePos,
  shortestPath,
  tryMove,
} from './engines/falkens-maze'
import './styles/falkens-maze.css'

const U = 10 // SVG units per cell
/** Five-digit maze numbers: short enough to read and quote. */
const mazeSeed = (): number => (newSeed() % 90000) + 10000

interface Run {
  readonly maze: Maze
  readonly size: MazeSize
  readonly pos: Pos
  readonly moves: number
  readonly visited: readonly number[]
  readonly hints: number
  readonly hint: Dir | null
  readonly bump: { dir: Dir; n: number } | null
  readonly won: boolean
}

const freshRun = (size: MazeSize, seed: number): Run => ({
  maze: generate(seed, SIZES[size].n),
  size,
  pos: START,
  moves: 0,
  visited: [0],
  hints: 0,
  hint: null,
  bump: null,
  won: false,
})

interface Best {
  readonly moves: number
}

function MazeBoard({ run }: { run: Run }) {
  const { maze, pos } = run
  const exit = exitOf(maze)
  const W = maze.cols * U
  const H = maze.rows * U
  const walls: string[] = []
  for (let r = 0; r < maze.rows; r++)
    for (let c = 0; c < maze.cols; c++) {
      const cell = maze.cells[r * maze.cols + c]!
      const x = c * U
      const y = r * U
      if (cell.n) walls.push(`M${x} ${y}h${U}`)
      if (cell.w) walls.push(`M${x} ${y}v${U}`)
      if (c === maze.cols - 1 && cell.e) walls.push(`M${x + U} ${y}v${U}`)
      if (r === maze.rows - 1 && cell.s) walls.push(`M${x} ${y + U}h${U}`)
    }
  const route = run.won ? shortestPath(maze, START, exit) : []
  const ctr = (p: Pos): string => `${p.c * U + U / 2} ${p.r * U + U / 2}`
  const hintCell = run.hint ? tryMove(maze, pos, run.hint).pos : null
  const k = 2.2 // bracket arm length
  const px = pos.c * U
  const py = pos.r * U
  return (
    <svg
      className="mz-board"
      viewBox={`-2 -2 ${W + 4} ${H + 10}`}
      role="img"
      aria-label={`Maze ${maze.cols} by ${maze.rows}. You are at column ${pos.c + 1}, row ${pos.r + 1}. Exit at column ${exit.c + 1}, row ${exit.r + 1}.`}
      data-testid="maze-board"
    >
      {run.visited.map((i) => (
        <circle key={i} className="mz-trail" cx={(i % maze.cols) * U + U / 2} cy={Math.floor(i / maze.cols) * U + U / 2} r={0.7} />
      ))}
      {route.length > 1 && (
        <polyline className="mz-route" points={route.map(ctr).join(' ')} data-testid="maze-route" />
      )}
      <rect className="mz-exit" x={exit.c * U + 1.2} y={exit.r * U + 1.2} width={U - 2.4} height={U - 2.4} />
      <text className="mz-exit-label" x={W} y={H + 6.5} textAnchor="end">
        EXIT ▲
      </text>
      <text className="mz-start-label" x={0} y={H + 6.5}>
        START (TOP LEFT)
      </text>
      {hintCell && (
        <rect
          className="mz-hint"
          x={hintCell.c * U + 2}
          y={hintCell.r * U + 2}
          width={U - 4}
          height={U - 4}
          data-testid="maze-hint-cell"
        />
      )}
      <path className="mz-walls" d={walls.join('')} />
      <g className="mz-player" data-testid="maze-player">
        <path
          d={`M${px + 1.5 + k} ${py + 1.5}h${-k}v${k} M${px + U - 1.5 - k} ${py + 1.5}h${k}v${k} M${px + 1.5 + k} ${py + U - 1.5}h${-k}v${-k} M${px + U - 1.5 - k} ${py + U - 1.5}h${k}v${-k}`}
        />
        <rect className="mz-player-core" x={px + U / 2 - 1.6} y={py + U / 2 - 1.6} width={3.2} height={3.2} transform={`rotate(45 ${px + U / 2} ${py + U / 2})`} />
      </g>
    </svg>
  )
}

const PAD: readonly { d: Dir; area: string; testId: string; arrow: string }[] = [
  { d: 'n', area: 'up', testId: 'maze-up', arrow: '▲' },
  { d: 'w', area: 'left', testId: 'maze-left', arrow: '◀' },
  { d: 's', area: 'down', testId: 'maze-down', arrow: '▼' },
  { d: 'e', area: 'right', testId: 'maze-right', arrow: '▶' },
]

function FalkensMaze({ onExit }: GameProps) {
  const rec = useGameRecords('falkens-maze')
  const log = useEventLog()
  const [run, setRun] = useState<Run>(() => freshRun('standard', mazeSeed()))
  const [runId, setRunId] = useState(1)
  const { maze, pos, size } = run
  const exit = exitOf(maze)
  const key = recordKey(size, maze.seed)
  const best = rec.get<Best | null>(key, null)
  const shortest = shortestPath(maze, START, exit).length - 1

  const start = (sz: MazeSize, seed: number, why: string): void => {
    setRun(freshRun(sz, seed))
    setRunId((n) => n + 1)
    log.reset()
    log.push({ text: why })
    cue.tick()
  }
  const retry = (): void => start(size, maze.seed, `RETRYING MAZE #${maze.seed}. SAME WALLS.`)
  const fresh = (sz: MazeSize = size): void => start(sz, mazeSeed(), `NEW ${SIZES[sz].label} MAZE CARVED.`)

  const move = (d: Dir): void => {
    if (run.won) return
    const res = tryMove(maze, pos, d)
    if (!res.ok) {
      cue.deny()
      setRun({ ...run, bump: { dir: d, n: (run.bump?.n ?? 0) + 1 } })
      log.push({ text: `WALL ${DIR_NAME[d]}. NO MOVE COUNTED.`, kind: 'bad' })
      return
    }
    const moves = run.moves + 1
    const i = res.pos.r * maze.cols + res.pos.c
    const visited = run.visited.includes(i) ? run.visited : [...run.visited, i]
    const won = samePos(res.pos, exit)
    setRun({ ...run, pos: res.pos, moves, visited, hint: null, bump: null, won })
    if (won) {
      cue.win()
      const assisted = run.hints > 0
      const eff = efficiency(moves, shortest)
      log.push({ text: `EXIT REACHED IN ${moves} MOVES. SHORTEST ROUTE ${shortest}. EFFICIENCY ${eff}%.`, kind: 'good' })
      if (!assisted) {
        rec.recordOnce(`${key}:${runId}`, () => {
          rec.update<Best | null>(key, (p) => (!p || moves < p.moves ? { moves } : p))
        })
      }
    } else {
      cue.select()
      log.push({ text: `MOVED ${DIR_NAME[d]}. MOVE ${moves}.` })
    }
  }

  const hint = (): void => {
    if (run.won) return
    const d = hintFrom(maze, pos)
    if (!d) return
    cue.tick()
    setRun({ ...run, hint: d, hints: run.hints + 1, bump: null })
    log.push({ text: `HINT: NEXT STEP ${DIR_NAME[d]}. RUN MARKED ASSISTED.`, kind: 'warn' })
  }

  useGameKeys((k) => {
    const key = k.toLowerCase()
    const d: Dir | null =
      k === 'ArrowUp' || key === 'w' ? 'n' : k === 'ArrowDown' || key === 's' ? 's' : k === 'ArrowLeft' || key === 'a' ? 'w' : k === 'ArrowRight' || key === 'd' ? 'e' : null
    if (d) {
      move(d)
      return true
    }
    if (key === 'h' && !run.won) {
      hint()
      return true
    }
    if (run.won && key === 'r') {
      retry()
      return true
    }
    if (run.won && key === 'n') {
      fresh()
      return true
    }
    return false
  })

  const assisted = run.hints > 0
  const eff = efficiency(run.moves, shortest)
  const lastEv = log.events[log.events.length - 1]
  const bumped = run.bump !== null

  const phase = run.won
    ? 'EXIT REACHED'
    : bumped
      ? `WALL ${DIR_NAME[run.bump!.dir]}. NO MOVE COUNTED.`
      : run.hint
        ? `HINT: GO ${DIR_NAME[run.hint]}`
        : run.moves === 0
          ? 'FIND THE EXIT. CHOOSE A DIRECTION.'
          : 'CHOOSE A DIRECTION'

  const side = (
    <>
      {run.won ? (
        <GameResult
          outcome="win"
          headline="EXIT REACHED"
          reason={
            assisted
              ? `ASSISTED RUN (${run.hints} HINT${run.hints === 1 ? '' : 'S'}). BEST NOT UPDATED.`
              : moves2text(run.moves, shortest)
          }
          metrics={[
            { label: 'MOVES', value: run.moves },
            { label: 'SHORTEST', value: shortest },
            { label: 'EFFICIENCY', value: `${eff}%`, tone: eff === 100 ? 'amber' : 'normal' },
            { label: 'BEST', value: best ? best.moves : '—', tone: 'dim' },
          ]}
          testId="maze-result"
        >
          <Action variant="primary" onClick={retry} testId="maze-retry" shortcut="R">
            RETRY THIS MAZE
          </Action>
          <Action onClick={() => fresh()} testId="maze-again" shortcut="N">
            NEW MAZE
          </Action>
        </GameResult>
      ) : (
        <Panel title="NAVIGATION">
          <div className="mz-pad">
            <span className="mz-moves" data-testid="maze-moves">
              <span className="mz-moves-label">MOVES</span>
              {run.moves}
            </span>
            {assisted && <span className="mz-assisted">ASSISTED</span>}
            <div className="mz-pad-keys" role="group" aria-label="Direction pad">
            {PAD.map(({ d, area, testId, arrow }) => {
              const blocked = !isOpen(maze, pos, d)
              const cls = [
                'gs-btn',
                'mz-dir',
                `mz-${area}`,
                blocked ? 'mz-blocked' : '',
                run.hint === d ? 'mz-hinted' : '',
                run.bump?.dir === d ? `mz-bumped mz-bump-${run.bump.n % 2}` : '',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <button
                  key={d}
                  type="button"
                  className={cls}
                  onClick={() => move(d)}
                  data-testid={testId}
                  aria-label={`${DIR_NAME[d]}${blocked ? ', wall' : ''}`}
                  aria-keyshortcuts={d === 'n' ? 'ArrowUp' : d === 's' ? 'ArrowDown' : d === 'w' ? 'ArrowLeft' : 'ArrowRight'}
                >
                  <span aria-hidden="true">{arrow}</span>
                  <span className="mz-dir-name">{blocked ? 'WALL' : DIR_NAME[d]}</span>
                </button>
              )
            })}
            </div>
          </div>
          <ActionBar label="Assistance">
            <Action onClick={hint} testId="maze-hint" shortcut="H">
              HINT (MARKS RUN ASSISTED)
            </Action>
          </ActionBar>
        </Panel>
      )}
      <Panel title="KEY">
        <ul className="mz-key">
          <li>
            <span className="mz-key-player">[◆]</span> YOU
          </li>
          <li>
            <span className="mz-key-exit">▭</span> EXIT (BOTTOM RIGHT)
          </li>
          <li>
            <span className="mz-key-trail">·</span> CELLS VISITED
          </li>
          {run.won && (
            <li>
              <span className="mz-key-route">- -</span> SHORTEST ROUTE
            </li>
          )}
        </ul>
      </Panel>
    </>
  )

  return (
    <GameShell
      slug="falkens-maze"
      title="FALKENS MAZE"
      objective="REACH THE EXIT IN AS FEW MOVES AS THE MAZE ALLOWS."
      phase={phase}
      phaseTone={bumped ? 'red' : 'amber'}
      metrics={[
        { label: 'MAZE', value: `#${maze.seed}`, tone: 'dim', title: 'Maze seed: retry replays the same walls' },
        { label: 'SIZE', value: `${maze.cols} X ${maze.rows}` },
        { label: 'BEST', value: best ? `${best.moves} MOVES` : '—', tone: 'dim', title: 'Best unassisted moves for this maze and size' },
      ]}
      toolbar={
        <Segmented<MazeSize>
          label="SIZE"
          value={size}
          options={(Object.keys(SIZES) as MazeSize[]).map((s) => ({ value: s, label: SIZES[s].label }))}
          onChange={(s) => {
            if (s !== size) fresh(s)
          }}
          testId="maze-size"
        />
      }
      help={
        <>
          <p>MOVE FROM THE START (TOP LEFT) TO THE EXIT (BOTTOM RIGHT). EVERY MAZE IS PERFECT: EXACTLY ONE ROUTE CONNECTS ANY TWO CELLS.</p>
          <ul>
            <li>ARROW KEYS, WASD OR THE DIRECTION PAD MOVE ONE CELL. KEYS AND BUTTONS BEHAVE THE SAME.</li>
            <li>A DIRECTION BLOCKED BY A WALL IS MARKED WALL ON THE PAD. TRYING IT IS REFUSED AND DOES NOT COUNT AS A MOVE.</li>
            <li>THE SHORTEST ROUTE STAYS HIDDEN UNTIL YOU REACH THE EXIT; THEN IT IS DRAWN WITH YOUR EFFICIENCY (SHORTEST ROUTE DIVIDED BY YOUR MOVES).</li>
            <li>HINT (H) SHOWS THE NEXT STEP OF THE SHORTEST ROUTE. ANY HINT MARKS THE RUN ASSISTED, AND ASSISTED RUNS DO NOT SET A BEST.</li>
            <li>SIZE IS THE DIFFICULTY: SMALL 7 X 7, STANDARD 11 X 11, LARGE 15 X 15. CHANGING SIZE CARVES A NEW MAZE AT ONCE.</li>
            <li>BEST MOVES ARE SAVED PER MAZE NUMBER AND SIZE. RETRY THIS MAZE (R) REPLAYS THE SAME WALLS; NEW MAZE (N) CARVES ANOTHER.</li>
          </ul>
        </>
      }
      onRestart={retry}
      inProgress={run.moves > 0 && !run.won}
      restartLabel="RETRY THIS MAZE"
      onExit={onExit}
      side={side}
      report={<GameReport events={log.events} />}
      announce={lastEv?.text}
    >
      <div className="mz-frame">
        <MazeBoard run={run} />
      </div>
    </GameShell>
  )
}

function moves2text(moves: number, shortest: number): string {
  if (moves === shortest) return `PERFECT ROUTE. ${moves} MOVES, NONE WASTED.`
  return `${moves} MOVES AGAINST A SHORTEST ROUTE OF ${shortest}. ${moves - shortest} EXTRA.`
}

export const entry: GameEntry = { id: 'FALKENS MAZE', Component: FalkensMaze }
