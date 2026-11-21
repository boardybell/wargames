// CHECKERS. English/American draughts against WOPR on the shared GridBoard.
// Rules live in engines/checkers.ts (pure, tested). This module owns the
// hop-by-hop selection, the AI turn timing and the presentation.
//
// Design: docs/games-design-review.md §6.
import { useEffect, useMemo, useState } from 'react'
import type { GameEntry, GameProps } from './types'
import { Action, ActionBar, GameReport, GameResult, GameShell, Panel, Segmented } from './ui/GameShell'
import { GridBoard, type CellState } from './ui/boards/GridBoard'
import { cue, fmtWLD, useEventLog, useGameKeys, useGameRecords, useTimers, type WLD } from './hooks'
import {
  captureRequired,
  chooseMove,
  colOf,
  completed,
  count,
  describe,
  isKing,
  legalSequences,
  newGame,
  nextHops,
  NO_PROGRESS_PLIES,
  partialBoard,
  play,
  playable,
  rowOf,
  sideOf,
  sq,
  type Difficulty,
  type Ending,
  type GameState,
  type Mode,
  type Sequence,
} from './engines/checkers'
import './styles/checkers.css'

const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const ROWS = ['8', '7', '6', '5', '4', '3', '2', '1']
const AI_DELAY = 450

const MODE_OPTS = [
  { value: 'standard' as Mode, label: 'STANDARD' },
  { value: 'casual' as Mode, label: 'CASUAL' },
]
const DIFF_OPTS = [
  { value: 'beginner' as Difficulty, label: 'BEGINNER' },
  { value: 'standard' as Difficulty, label: 'STANDARD' },
]

const REASON: Record<Ending['reason'], (youWon: boolean) => string> = {
  'no-pieces': (w) => (w ? 'WOPR HAS NO PIECES LEFT.' : 'ALL YOUR PIECES ARE GONE.'),
  'no-moves': (w) => (w ? 'WOPR HAS NO LEGAL MOVE.' : 'YOU HAVE NO LEGAL MOVE.'),
  repetition: () => 'THE SAME POSITION OCCURRED THREE TIMES WITH THE SAME SIDE TO MOVE.',
  'no-progress': () => `40 MOVES EACH WITHOUT A CAPTURE OR A MAN MOVING.`,
}

function Checkers({ onExit }: GameProps) {
  const rec = useGameRecords('checkers')
  const timers = useTimers()
  const log = useEventLog()
  // Settings for the game in progress, and the ones chosen for the next game.
  const [mode, setMode] = useState<Mode>('standard')
  const [diff, setDiff] = useState<Difficulty>('standard')
  const [nextMode, setNextMode] = useState<Mode>('standard')
  const [nextDiff, setNextDiff] = useState<Difficulty>('standard')
  const [game, setGame] = useState<GameState>(() => newGame('standard'))
  const [gameNo, setGameNo] = useState(1)
  /** Squares visited by the piece being moved; origin first. */
  const [sel, setSel] = useState<number[] | null>(null)
  const [notice, setNotice] = useState<string>('')

  const over = game.ending !== null
  const myTurn = !over && game.turn === 'w'
  const seqs = useMemo(() => (myTurn ? legalSequences(game.board, 'w', mode) : []), [game.board, myTurn, mode])
  const mustCapture = myTurn && captureRequired(game.board, 'w', mode)
  const locked = sel !== null && sel.length > 1
  const hops = useMemo(() => (sel ? nextHops(seqs, sel) : []), [seqs, sel])
  const movable = useMemo(() => new Set(seqs.map((s) => s.path[0]!)), [seqs])
  const shown = locked ? partialBoard(game.board, sel) : game.board
  const recKey = `${mode}-${diff}`

  const start = (m: Mode, d: Difficulty): void => {
    timers.clear()
    setMode(m)
    setDiff(d)
    setGame(newGame(m))
    setGameNo((n) => n + 1)
    setSel(null)
    setNotice('')
    log.reset()
  }
  const restart = (): void => start(nextMode, nextDiff)
  // Settings apply at once before the first move, otherwise at the next game.
  const changeMode = (m: Mode): void => {
    setNextMode(m)
    if (game.plies === 0) start(m, nextDiff)
  }
  const changeDiff = (d: Difficulty): void => {
    setNextDiff(d)
    if (game.plies === 0) start(nextMode, d)
  }

  const runAi = (s: GameState): void => {
    const choice = chooseMove(s, diff)
    if (!choice) return
    const after = play(s, choice)
    setGame(after)
    const caps = choice.captured.length
    log.push({
      text: `WOPR ${describe(choice)}${caps ? `, TAKES ${caps}` : ''}${choice.crowned ? ', CROWNED' : ''}.`,
      kind: caps ? 'bad' : 'info',
    })
    if (caps) cue.hit()
    else cue.tick()
    setNotice('')
  }

  const commit = (seq: Sequence): void => {
    const after = play(game, seq)
    setGame(after)
    setSel(null)
    setNotice('')
    const caps = seq.captured.length
    log.push({
      text: `YOU ${describe(seq)}${caps ? `, TAKE ${caps}` : ''}${seq.crowned ? ', CROWNED' : ''}.`,
      kind: caps ? 'good' : 'info',
    })
    if (caps) cue.hit()
    else cue.select()
    if (!after.ending) timers.later(() => runAi(after), AI_DELAY)
  }

  const advance = (path: number[]): void => {
    const done = completed(seqs, path)
    if (done) {
      commit(done)
      return
    }
    setSel(path)
    if (path.length > 1) {
      cue.hit()
      setNotice('CONTINUE JUMP')
    } else cue.select()
  }

  const deny = (why: string): void => {
    setNotice(why)
    cue.deny()
  }

  const activate = (x: number, y: number): void => {
    const i = y * 8 + x
    if (over) return
    if (!myTurn) return deny('WOPR IS MOVING')
    if (!playable(i)) return deny('PIECES USE THE DARK SQUARES ONLY')
    if (locked) {
      if (hops.includes(i)) advance([...sel, i])
      else deny('CONTINUE JUMP: THE MOVING PIECE IS LOCKED')
      return
    }
    if (sideOf(game.board[i]) === 'w') {
      if (sel && sel[0] === i) {
        setSel(null)
        setNotice('')
        return
      }
      if (movable.has(i)) advance([i])
      else deny(mustCapture ? 'CAPTURE REQUIRED: PICK A RINGED PIECE' : 'THAT PIECE HAS NO LEGAL MOVE')
      return
    }
    if (sel && hops.includes(i)) advance([...sel, i])
    else if (sel) deny('NOT A LEGAL LANDING SQUARE')
    else deny('SELECT ONE OF YOUR BLUE PIECES')
  }

  const cancel = (): void => {
    if (!sel || locked) return
    setSel(null)
    setNotice('')
  }

  useGameKeys((k) => {
    if (k === 'Escape' && sel && !locked) {
      cancel()
      return true
    }
    if ((k === 'n' || k === 'N') && over) {
      restart()
      return true
    }
    return false
  })

  // Record a finished game once and sound the result.
  const ending = game.ending
  const { recordOnce, tally } = rec
  useEffect(() => {
    if (!ending) return
    recordOnce(`ck-${gameNo}`, () => {
      const outcome = ending.winner === 'draw' ? 'draw' : ending.winner === 'w' ? 'win' : 'lose'
      tally(recKey, outcome)
      if (outcome === 'win') cue.win()
      else if (outcome === 'lose') cue.lose()
      else cue.draw()
    })
  }, [ending, gameNo, recordOnce, tally, recKey])

  // ---------------------------------------------------------------- board
  const ghosts = useMemo(() => {
    if (!locked) return new Set<number>()
    const out = new Set<number>()
    for (let k = 1; k < sel.length; k++) {
      const a = sel[k - 1]!
      const b = sel[k]!
      out.add(((rowOf(a) + rowOf(b)) / 2) * 8 + (colOf(a) + colOf(b)) / 2)
    }
    return out
  }, [locked, sel])
  const lastSet = useMemo(() => new Set(game.last ? [game.last.path[0]!, game.last.path[game.last.path.length - 1]!] : []), [game.last])
  const cur = sel ? sel[sel.length - 1]! : null

  const cellState = (x: number, y: number): CellState => {
    const i = y * 8 + x
    const target = hops.includes(i)
    const isJump = target && cur !== null && Math.abs(rowOf(i) - rowOf(cur)) === 2
    return {
      dark: playable(i),
      selected: cur === i,
      legal: target && !isJump,
      capture: isJump,
      last: lastSet.has(i),
      path: locked && sel.includes(i) && i !== cur,
      inRange: mustCapture && !sel && movable.has(i),
    }
  }
  const cell = (x: number, y: number) => {
    const i = y * 8 + x
    const c = shown[i]
    if (c) {
      const mine = sideOf(c) === 'w'
      return (
        <span className={`gs-disc ${mine ? 'mine' : 'theirs'}${isKing(c) ? ' ck-king' : ''}`} aria-hidden="true">
          {isKing(c) ? 'K' : ''}
        </span>
      )
    }
    if (ghosts.has(i)) return <span className="ck-ghost" aria-hidden="true">X</span>
    return null
  }
  const label = (x: number, y: number): string => {
    const i = y * 8 + x
    const c = shown[i]
    const who = c ? `${sideOf(c) === 'w' ? 'YOUR' : 'WOPR'} ${isKing(c) ? 'KING' : 'MAN'}` : ghosts.has(i) ? 'CAPTURED' : 'EMPTY'
    const st = cellState(x, y)
    const extra = [
      st.selected ? 'SELECTED' : '',
      st.capture ? 'JUMP LANDING' : st.legal ? 'LEGAL MOVE' : '',
      st.inRange ? 'MUST CAPTURE' : '',
      st.last ? 'LAST MOVE' : '',
    ].filter(Boolean)
    return [sq(i).toUpperCase(), who, ...extra].join(', ')
  }

  // ---------------------------------------------------------------- status
  const me = count(game.board, 'w')
  const ai = count(game.board, 'b')
  const phase = over
    ? 'GAME OVER'
    : !myTurn
      ? 'WOPR IS MOVING'
      : locked
        ? 'CONTINUE JUMP'
        : mustCapture
          ? sel
            ? 'CAPTURE REQUIRED: PICK A LANDING SQUARE'
            : 'CAPTURE REQUIRED: SELECT A RINGED PIECE'
          : sel
            ? 'SELECT A DESTINATION'
            : 'YOUR MOVE: SELECT A PIECE'
  const record = rec.get<WLD | undefined>(recKey, undefined)
  const outcome = ending ? (ending.winner === 'draw' ? 'draw' : ending.winner === 'w' ? 'win' : 'lose') : null
  const settingsPending = nextMode !== mode || nextDiff !== diff

  const side = ending && outcome ? (
    <GameResult
      outcome={outcome}
      headline={outcome === 'win' ? 'YOU WIN' : outcome === 'lose' ? 'WOPR WINS' : 'DRAW'}
      reason={REASON[ending.reason](outcome === 'win')}
      metrics={[
        { label: 'MOVES', value: Math.ceil(game.plies / 2) },
        { label: 'RECORD', value: fmtWLD(record) },
      ]}
      testId="checkers-result"
    >
      <Action variant="primary" onClick={restart} shortcut="N" testId="checkers-again">
        NEW GAME
      </Action>
    </GameResult>
  ) : (
    <Panel title="YOUR DECISION">
      <p className="ck-notice" data-testid="checkers-status">
        {notice || (locked ? 'CONTINUE JUMP' : mustCapture ? 'CAPTURE REQUIRED' : sel ? 'DOTS ARE STEPS. RINGS ARE JUMP LANDINGS.' : 'TAP ONE OF YOUR BLUE PIECES.')}
      </p>
      {mustCapture && !locked && <p className="gs-tone-dim">STANDARD RULES: A CAPTURE IS AVAILABLE, SO YOU MUST TAKE.</p>}
      {locked && <p className="gs-tone-dim">MORE JUMPS ARE AVAILABLE. THE SAME PIECE MUST KEEP JUMPING.</p>}
      <ActionBar label="Move actions">
        <Action
          onClick={cancel}
          disabled={!sel || locked}
          reason={locked ? 'A STARTED JUMP MUST BE COMPLETED' : undefined}
          shortcut="Esc"
          testId="checkers-cancel"
        >
          CANCEL SELECTION
        </Action>
      </ActionBar>
    </Panel>
  )

  return (
    <GameShell
      slug="checkers"
      title="CHECKERS"
      objective="TAKE OR BLOCK EVERY WOPR PIECE. YOU ARE BLUE, MOVING UP."
      phase={phase}
      phaseTone={over ? 'normal' : myTurn ? 'amber' : 'dim'}
      metrics={[
        { label: 'YOU', value: `${me.total}${me.kings ? ` · ${me.kings}K` : ''}`, title: `${me.men} men, ${me.kings} kings` },
        { label: 'WOPR', value: `${ai.total}${ai.kings ? ` · ${ai.kings}K` : ''}`, tone: 'red', title: `${ai.men} men, ${ai.kings} kings` },
        {
          label: 'NO PROGRESS',
          value: `${game.quiet}/${NO_PROGRESS_PLIES}`,
          tone: game.quiet >= NO_PROGRESS_PLIES - 20 ? 'amber' : 'dim',
          title: 'Plies since the last capture or man move',
        },
        { label: 'RECORD', value: fmtWLD(record), tone: 'dim', title: `Wins-losses-draws, ${mode} rules, WOPR ${diff}` },
      ]}
      toolbar={
        <>
          <Segmented label="RULES" value={nextMode} options={MODE_OPTS} onChange={changeMode} testId="checkers-mode" />
          <Segmented label="WOPR" value={nextDiff} options={DIFF_OPTS} onChange={changeDiff} testId="checkers-difficulty" />
        </>
      }
      help={
        <>
          <p>ENGLISH / AMERICAN DRAUGHTS ON AN 8 BY 8 BOARD. YOU PLAY BLUE (SOLID RING) FROM THE BOTTOM; WOPR PLAYS RED (DASHED RING).</p>
          <ul>
            <li>MEN MOVE ONE SQUARE DIAGONALLY FORWARD. KINGS (DOUBLE RING, K) MOVE ONE SQUARE DIAGONALLY EITHER WAY.</li>
            <li>JUMP AN ADJACENT ENEMY PIECE ONTO THE EMPTY SQUARE BEYOND IT TO CAPTURE. IF THE SAME PIECE CAN JUMP AGAIN IT MUST: SELECT EACH LANDING SQUARE IN TURN (CONTINUE JUMP). A KING MAY FINISH A CIRCUIT ON ITS STARTING SQUARE.</li>
            <li>A MAN REACHING THE FAR ROW IS CROWNED AND THE MOVE ENDS THERE.</li>
            <li>STANDARD RULES: CAPTURING IS COMPULSORY. WHEN ANY CAPTURE EXISTS YOU MUST TAKE ONE, BUT YOU MAY CHOOSE WHICH BRANCH, NOT NECESSARILY THE LONGEST.</li>
            <li>CASUAL RULES: CAPTURES ARE OPTIONAL. A STARTED JUMP MUST STILL BE COMPLETED.</li>
            <li>YOU WIN WHEN WOPR HAS NO PIECES OR NO LEGAL MOVE. DRAW BY THREEFOLD REPETITION (SAME POSITION, SAME SIDE TO MOVE) OR AFTER 40 MOVES EACH WITHOUT A CAPTURE OR A MAN MOVING. BOTH DRAWS ARE APPLIED AUTOMATICALLY.</li>
            <li>WOPR BEGINNER TAKES THE MOST PIECES IT CAN, OTHERWISE MOVES AT RANDOM. WOPR STANDARD LOOKS TWO PLIES AHEAD: MATERIAL, KINGS, DISTANCE TO CROWNING, AND YOUR BEST REPLY.</li>
            <li>SETTINGS CHANGE AT ONCE BEFORE THE FIRST MOVE, OTHERWISE AT THE NEXT GAME. NO OPENING BALLOT.</li>
            <li>KEYS: ARROWS MOVE ON THE BOARD, ENTER OR SPACE SELECTS, ESC CANCELS, N NEW GAME WHEN OVER.</li>
          </ul>
        </>
      }
      onRestart={restart}
      inProgress={game.plies > 0 && !over}
      restartLabel="NEW GAME"
      onExit={() => {
        timers.clear()
        onExit()
      }}
      side={
        <>
          {side}
          {settingsPending && <p className="ck-settings-note">NEW SETTINGS APPLY TO THE NEXT GAME.</p>}
        </>
      }
      report={<GameReport events={log.events} />}
      announce={log.events.length ? log.events[log.events.length - 1]!.text : ''}
    >
      <GridBoard
        cols={8}
        rows={8}
        cell={cell}
        state={cellState}
        label={label}
        onActivate={activate}
        colLabels={COLS}
        rowLabels={ROWS}
        ariaLabel="Checkers board"
        testId="checkers-board"
        maxPx={576}
        className="ck-board"
      />
    </GameShell>
  )
}

export const entry: GameEntry = { id: 'CHECKERS', Component: Checkers }
