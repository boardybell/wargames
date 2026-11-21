// CHESS. Full FIDE rules against WOPR on the shared GridBoard. Rules and the
// search live in engines/chess.ts (pure, perft-tested). This module owns the
// selection, promotion picker, AI turn timing and presentation.
//
// Design: docs/games-design-review.md §7.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameEntry, GameProps } from './types'
import { Action, ActionBar, GameReport, GameResult, GameShell, Panel, Segmented } from './ui/GameShell'
import { GridBoard, type CellState } from './ui/boards/GridBoard'
import { cue, fmtWLD, useEventLog, useGameKeys, useGameRecords, useTimers, type WLD } from './hooks'
import {
  colorOf,
  inCheck,
  kingSquare,
  legalMoves,
  materialBalance,
  newGame,
  play,
  search,
  SEARCH,
  sqName,
  typeOf,
  type Ending,
  type Game,
  type Move,
  type PromoType,
} from './engines/chess'
import './styles/chess.css'

type Difficulty = 'beginner' | 'standard'
const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const ROWS = ['8', '7', '6', '5', '4', '3', '2', '1']
const AI_DELAY = 220
const TEXT = '︎' // force text (not emoji) presentation

const GLYPH: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
}
const NAME: Record<string, string> = { K: 'KING', Q: 'QUEEN', R: 'ROOK', B: 'BISHOP', N: 'KNIGHT', P: 'PAWN' }
const PROMOS: readonly PromoType[] = ['Q', 'R', 'B', 'N']
const DIFF_OPTS = [
  { value: 'beginner' as Difficulty, label: 'BEGINNER' },
  { value: 'standard' as Difficulty, label: 'STANDARD' },
]

function reasonText(e: Ending, playerTurnAtEnd: boolean): string {
  if (e.kind === 'checkmate')
    return e.winner === 'w' ? "CHECKMATE. WOPR'S KING IS IN CHECK WITH NO ESCAPE." : 'CHECKMATE. YOUR KING IS IN CHECK WITH NO ESCAPE.'
  switch (e.reason) {
    case 'stalemate':
      return `STALEMATE. ${playerTurnAtEnd ? 'YOU HAVE' : 'WOPR HAS'} NO LEGAL MOVE AND IS NOT IN CHECK.`
    case 'insufficient':
      return 'DEAD POSITION. NEITHER SIDE HAS THE MATERIAL TO CHECKMATE.'
    case 'fifty':
      return '50-MOVE RULE. 50 MOVES EACH WITHOUT A CAPTURE OR A PAWN MOVE.'
    case 'repetition':
      return 'THREEFOLD REPETITION. THE SAME POSITION OCCURRED THREE TIMES.'
  }
}

function Chess({ onExit }: GameProps) {
  const rec = useGameRecords('chess')
  const timers = useTimers()
  const log = useEventLog()
  const [diff, setDiff] = useState<Difficulty>('standard')
  const [nextDiff, setNextDiff] = useState<Difficulty>('standard')
  const [game, setGame] = useState<Game>(() => newGame())
  const [gameNo, setGameNo] = useState(1)
  const [sel, setSel] = useState<number | null>(null)
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null)
  const [notice, setNotice] = useState('')
  const movesRef = useRef<HTMLOListElement>(null)

  const over = game.ending !== null
  const myTurn = !over && game.pos.turn === 'w'
  const legal = useMemo(() => (myTurn ? legalMoves(game.pos) : []), [game.pos, myTurn])
  const targets = useMemo(() => (sel === null ? [] : legal.filter((m) => m.from === sel)), [legal, sel])
  const checkSq = inCheck(game.pos) ? kingSquare(game.pos.board, game.pos.turn) : -1
  const last = game.moves.length ? game.moves[game.moves.length - 1]! : null

  const start = (d: Difficulty): void => {
    timers.clear()
    setDiff(d)
    setGame(newGame())
    setGameNo((n) => n + 1)
    setSel(null)
    setPromo(null)
    setNotice('')
    log.reset()
  }
  const restart = (): void => start(nextDiff)
  const changeDiff = (d: Difficulty): void => {
    setNextDiff(d)
    if (game.moves.length === 0) start(d)
  }

  const describe = (g: Game, m: Move, who: 'YOU' | 'WOPR'): string => {
    const played = g.moves[g.moves.length - 1]!
    const cap = m.captured ? `, TAKES ${NAME[typeOf(m.captured)]}` : ''
    const check = g.ending?.kind === 'checkmate' ? '. CHECKMATE' : inCheck(g.pos) ? '. CHECK' : ''
    return `${who} ${played.san} (${sqName(m.from).toUpperCase()}-${sqName(m.to).toUpperCase()})${cap}${check}.`
  }

  const runAi = (g: Game): void => {
    const r = search(g.pos, SEARCH[diff])
    if (!r.move) return
    const after = play(g, r.move)
    setGame(after)
    log.push({ text: describe(after, r.move, 'WOPR'), kind: r.move.captured || inCheck(after.pos) ? 'bad' : 'info' })
    if (r.move.captured) cue.hit()
    else cue.tick()
    setNotice('')
  }

  const commit = (m: Move): void => {
    const after = play(game, m)
    setGame(after)
    setSel(null)
    setPromo(null)
    setNotice('')
    log.push({ text: describe(after, m, 'YOU'), kind: m.captured ? 'good' : 'info' })
    if (m.captured) cue.hit()
    else cue.select()
    // Paint the player's move and THINKING first, then search.
    if (!after.ending) timers.later(() => runAi(after), AI_DELAY)
  }

  const deny = (why: string): void => {
    setNotice(why)
    cue.deny()
  }

  const choosePromo = (t: PromoType): void => {
    if (!promo) return
    const m = legal.find((x) => x.from === promo.from && x.to === promo.to && x.promo === t)
    if (m) commit(m)
  }

  const activate = (x: number, y: number): void => {
    const i = y * 8 + x
    if (over) return
    if (!myTurn) return deny('WOPR IS THINKING')
    if (promo) {
      setPromo(null)
      setNotice('PROMOTION CANCELLED')
      return
    }
    if (colorOf(game.pos.board[i]) === 'w') {
      if (sel === i) {
        setSel(null)
        setNotice('')
        return
      }
      if (legal.some((m) => m.from === i)) {
        setSel(i)
        setNotice('')
        cue.select()
      } else deny(inCheck(game.pos) ? 'THAT PIECE CANNOT ANSWER THE CHECK' : 'THAT PIECE HAS NO LEGAL MOVE')
      return
    }
    if (sel === null) return deny('SELECT ONE OF YOUR BLUE PIECES')
    const options = targets.filter((m) => m.to === i)
    if (options.length === 0) return deny(inCheck(game.pos) ? 'ILLEGAL: YOUR KING MUST LEAVE CHECK' : 'NOT A LEGAL SQUARE FOR THAT PIECE')
    if (options.length > 1) {
      setPromo({ from: sel, to: i })
      cue.select()
      return
    }
    commit(options[0]!)
  }

  const cancel = (): void => {
    setPromo(null)
    setSel(null)
    setNotice('')
  }

  useGameKeys((k) => {
    const key = k.toUpperCase()
    if (promo && (PROMOS as readonly string[]).includes(key)) {
      choosePromo(key as PromoType)
      return true
    }
    if (k === 'Escape' && (sel !== null || promo)) {
      cancel()
      return true
    }
    if (key === 'N' && over) {
      restart()
      return true
    }
    return false
  })

  const ending = game.ending
  const { recordOnce, tally } = rec
  useEffect(() => {
    if (!ending) return
    recordOnce(`ch-${gameNo}`, () => {
      const outcome = ending.kind === 'draw' ? 'draw' : ending.winner === 'w' ? 'win' : 'lose'
      tally(diff, outcome)
      if (outcome === 'win') cue.win()
      else if (outcome === 'lose') cue.lose()
      else cue.draw()
    })
  }, [ending, gameNo, recordOnce, tally, diff])

  useEffect(() => {
    const el = movesRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [game.moves.length])

  // ---------------------------------------------------------------- board
  const targetSet = useMemo(() => new Map(targets.map((m) => [m.to, m])), [targets])
  const cellState = (x: number, y: number): CellState => {
    const i = y * 8 + x
    const t = targetSet.get(i)
    return {
      selected: sel === i || promo?.to === i,
      legal: !!t && !t.captured,
      capture: !!t && !!t.captured,
      last: !!last && (last.from === i || last.to === i),
      check: i === checkSq,
    }
  }
  const cell = (x: number, y: number) => {
    const p = game.pos.board[y * 8 + x]
    if (!p) return null
    return (
      <span className={`gs-piece ${p[0] === 'w' ? 'mine' : 'theirs'}`} aria-hidden="true">
        {GLYPH[p]}
        {TEXT}
      </span>
    )
  }
  const label = (x: number, y: number): string => {
    const i = y * 8 + x
    const p = game.pos.board[i]
    const st = cellState(x, y)
    return [
      sqName(i).toUpperCase(),
      p ? `${p[0] === 'w' ? 'YOUR' : 'WOPR'} ${NAME[p[1]!]}` : 'EMPTY',
      st.selected ? 'SELECTED' : '',
      st.capture ? 'LEGAL CAPTURE' : st.legal ? 'LEGAL MOVE' : '',
      st.check ? 'IN CHECK' : '',
      st.last ? 'LAST MOVE' : '',
    ]
      .filter(Boolean)
      .join(', ')
  }

  const overlay = promo ? (
    <div className="ch-promo" role="dialog" aria-label="Choose promotion piece" data-testid="chess-promo">
      <div className="ch-promo-box">
        <div className="ch-promo-title">PROMOTE PAWN TO</div>
        <div className="ch-promo-row">
          {PROMOS.map((t, k) => (
            <button
              key={t}
              type="button"
              className="gs-btn gs-secondary"
              onClick={() => choosePromo(t)}
              aria-label={`Promote to ${NAME[t]!.toLowerCase()}`}
              aria-keyshortcuts={t}
              autoFocus={k === 0}
              data-testid={`chess-promo-${t}`}
            >
              <span className="ch-promo-glyph" aria-hidden="true">
                {GLYPH[`w${t}`]}
                {TEXT}
              </span>
              <span>{t}</span>
            </button>
          ))}
        </div>
        <button type="button" className="gs-btn gs-quiet" onClick={cancel}>
          CANCEL
        </button>
      </div>
    </div>
  ) : null

  // ---------------------------------------------------------------- status
  const checked = inCheck(game.pos)
  const phase = over
    ? 'GAME OVER'
    : !myTurn
      ? 'WOPR IS THINKING'
      : promo
        ? 'CHOOSE A PROMOTION PIECE'
        : checked
          ? sel === null
            ? 'CHECK: SELECT A PIECE TO ANSWER IT'
            : 'CHECK: SELECT A DESTINATION'
          : sel === null
            ? 'YOUR MOVE: SELECT A PIECE'
            : 'SELECT A DESTINATION'
  const record = rec.get<WLD | undefined>(diff, undefined)
  const outcome = ending ? (ending.kind === 'draw' ? 'draw' : ending.winner === 'w' ? 'win' : 'lose') : null
  const bal = materialBalance(game.pos.board)
  const fullmove = game.pos.fullmove

  const pairs: { n: number; w?: string; b?: string }[] = []
  game.moves.forEach((m, k) => {
    const n = Math.floor(k / 2) + 1
    if (m.color === 'w') pairs.push({ n, w: m.san })
    else if (pairs.length && pairs[pairs.length - 1]!.b === undefined && pairs[pairs.length - 1]!.n === n) pairs[pairs.length - 1]!.b = m.san
    else pairs.push({ n, b: m.san })
  })
  const lastIdx = game.moves.length - 1

  const decision = ending && outcome ? (
    <GameResult
      outcome={outcome}
      headline={outcome === 'win' ? 'YOU WIN' : outcome === 'lose' ? 'WOPR WINS' : 'DRAW'}
      reason={reasonText(ending, game.pos.turn === 'w')}
      metrics={[
        { label: 'MOVES', value: Math.ceil(game.moves.length / 2) },
        { label: 'RECORD', value: fmtWLD(record) },
      ]}
      testId="chess-result"
    >
      <Action variant="primary" onClick={restart} shortcut="N" testId="chess-again">
        NEW GAME
      </Action>
    </GameResult>
  ) : (
    <Panel title="YOUR DECISION">
      <p className="ch-notice" data-testid="chess-status">
        {notice || (promo ? 'PICK Q, R, B OR N. ESC CANCELS.' : sel === null ? 'TAP ONE OF YOUR BLUE PIECES.' : 'DOTS ARE MOVES. RINGS ARE CAPTURES.')}
      </p>
      <ActionBar label="Move actions">
        <Action
          onClick={cancel}
          disabled={sel === null && !promo}
          shortcut="Esc"
          testId="chess-cancel"
        >
          CANCEL SELECTION
        </Action>
      </ActionBar>
    </Panel>
  )

  return (
    <GameShell
      slug="chess"
      title="CHESS"
      objective="CHECKMATE WOPR'S KING. YOU ARE BLUE (WHITE), MOVING UP."
      phase={phase}
      phaseTone={over ? 'normal' : checked && myTurn ? 'red' : myTurn ? 'amber' : 'dim'}
      metrics={[
        { label: 'MOVE', value: fullmove },
        {
          label: 'MATERIAL',
          value: bal === 0 ? 'EVEN' : bal > 0 ? `+${bal} YOU` : `+${-bal} WOPR`,
          tone: bal < 0 ? 'red' : bal > 0 ? 'amber' : 'dim',
        },
        {
          label: '50-MOVE',
          value: `${Math.floor(game.pos.halfmove / 2)}/50`,
          tone: game.pos.halfmove >= 80 ? 'amber' : 'dim',
          title: 'Moves since the last capture or pawn move',
        },
        { label: 'RECORD', value: fmtWLD(record), tone: 'dim', title: `Wins-losses-draws against WOPR ${diff}` },
      ]}
      toolbar={<Segmented label="WOPR" value={nextDiff} options={DIFF_OPTS} onChange={changeDiff} testId="chess-difficulty" />}
      help={
        <>
          <p>FULL CHESS RULES. YOU PLAY WHITE: BLUE OUTLINE PIECES AT THE BOTTOM. WOPR PLAYS BLACK: RED SOLID PIECES.</p>
          <ul>
            <li>SELECT A PIECE, THEN A MARKED SQUARE. DOTS ARE MOVES, RINGS ARE CAPTURES. AMBER SQUARES SHOW THE LAST MOVE; A RED SQUARE IS A KING IN CHECK.</li>
            <li>CASTLING: MOVE THE KING TWO SQUARES TOWARD AN UNMOVED ROOK. NOT OUT OF, THROUGH, OR INTO CHECK.</li>
            <li>EN PASSANT: A PAWN THAT JUST ADVANCED TWO SQUARES MAY BE CAPTURED AS IF IT HAD MOVED ONE, ON THE NEXT MOVE ONLY.</li>
            <li>PROMOTION: A PAWN REACHING THE LAST RANK BECOMES A QUEEN, ROOK, BISHOP OR KNIGHT OF YOUR CHOICE.</li>
            <li>CHECKMATE WINS. STALEMATE IS A DRAW. THESE DRAWS ARE APPLIED AUTOMATICALLY, NO CLAIM NEEDED: THREEFOLD REPETITION, 50 MOVES EACH WITHOUT A CAPTURE OR PAWN MOVE, AND DEAD POSITIONS WITH INSUFFICIENT MATERIAL (KING VS KING, KING AND ONE MINOR PIECE, BISHOPS ALL ON ONE SQUARE COLOUR). OTHER DEAD POSITIONS (FOR EXAMPLE LOCKED PAWN WALLS) ARE NOT DETECTED. NO CLOCK, NO RESIGNATION OR DRAW OFFERS.</li>
            <li>WOPR BEGINNER SEARCHES 2 PLIES AND PICKS AMONG NEAR-BEST MOVES. WOPR STANDARD SEARCHES 3 PLIES PLUS CAPTURE SEQUENCES. BOTH WEIGH MATERIAL, MOBILITY, KING SAFETY AND PAWN PROMOTION, AND TREAT MATE AS FINAL. BOTH PLAY ONLY LEGAL MOVES; NEITHER SEES ANYTHING YOU CANNOT.</li>
            <li>DIFFICULTY CHANGES AT ONCE BEFORE THE FIRST MOVE, OTHERWISE AT THE NEXT GAME.</li>
            <li>KEYS: ARROWS MOVE ON THE BOARD, ENTER OR SPACE SELECTS, ESC CANCELS, Q R B N PICK A PROMOTION, N NEW GAME WHEN OVER.</li>
          </ul>
        </>
      }
      onRestart={restart}
      inProgress={game.moves.length > 0 && !over}
      restartLabel="NEW GAME"
      onExit={() => {
        timers.clear()
        onExit()
      }}
      side={
        <>
          {decision}
          {nextDiff !== diff && <p className="ch-settings-note">NEW DIFFICULTY APPLIES TO THE NEXT GAME.</p>}
          <Panel title="MOVES">
            {pairs.length === 0 ? (
              <p className="gs-tone-dim">NO MOVES YET. WHITE MOVES FIRST.</p>
            ) : (
              <ol className="ch-moves" ref={movesRef} aria-label="Move list" data-testid="chess-moves">
                {pairs.map((p, k) => (
                  <li key={k}>
                    <span className="ch-n">{p.n}.</span>
                    <span className={2 * k === lastIdx ? 'ch-last' : undefined}>{p.w ?? '…'}</span>
                    <span className={`ch-b${2 * k + 1 === lastIdx ? ' ch-last' : ''}`}>{p.b ?? ''}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
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
        ariaLabel="Chess board"
        testId="chess-board"
        maxPx={576}
        checkered
        className="ch-board"
        overlay={overlay}
      />
    </GameShell>
  )
}

export const entry: GameEntry = { id: 'CHESS', Component: Chess }
