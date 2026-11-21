// GIN RUMMY. A match to 100 against WOPR. Ten-card hands, opening upcard pass,
// draw from stock or discard, discard (never the card just picked up), KNOCK at
// 10 or less after the discard, GIN at 0. Knocks settle through one resolver
// with defender layoff (none against gin). Rules live in engines/gin-rummy.ts.
// Design: docs/games-design-review.md §3.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { GameEntry, GameProps } from './types'
import { Action, ActionBar, GameReport, GameResult, GameShell, Panel, Segmented } from './ui/GameShell'
import { CardHand, CardTile } from './ui/cards/CardTile'
import { cue, newSeed, useEventLog, useGameKeys, useGameRecords, usePhone, useTimers, fmtWLD, type WLD } from './hooks'
import {
  BOX_BONUS,
  GAME_BONUS,
  GIN_BONUS,
  KNOCK_LIMIT,
  MATCH_TARGET,
  STOCK_STOP,
  UNDERCUT_BONUS,
  aiStep,
  analyze,
  canDraw,
  deal,
  deadwoodAfter,
  describeSettlement,
  discardBlock,
  discardCard,
  draw,
  label,
  matchResult,
  meldLabels,
  newMatch,
  passUpcard,
  recordHand,
  topDiscard,
  type AiReport,
  type Card,
  type Difficulty,
  type HandState,
  type MatchState,
  type Meld,
  type Who,
} from './engines/gin-rummy'
import './styles/gin-rummy.css'

const DIFFS = [
  { value: 'beginner', label: 'BEGINNER' },
  { value: 'standard', label: 'STANDARD' },
] as const

function aiText(r: AiReport): string {
  const parts: string[] = []
  if (r.action === 'pass') return 'WOPR PASSES THE UPCARD.'
  if (r.action === 'take') parts.push(`WOPR TAKES ${label(r.took!)} FROM THE DISCARD.`)
  else parts.push('WOPR DRAWS FROM STOCK.')
  if (r.discarded) parts.push(`DISCARDS ${label(r.discarded)}.`)
  return parts.join(' ')
}

interface GroupsProps {
  readonly melds: readonly Meld[]
  readonly dead: readonly Card[]
  readonly layoffs?: readonly Card[]
  readonly deadLabel?: string
  readonly tile: (c: Card, inMeld: boolean) => ReactNode
}

/** Melds grouped and labeled RUN 1 / SET 1, deadwood kept separate. */
function MeldGroups({ melds, dead, layoffs, deadLabel, tile }: GroupsProps) {
  const labels = meldLabels(melds)
  return (
    <div className="gin-groups">
      {melds.map((m, i) => (
        <div key={labels[i]} className="gin-group" role="group" aria-label={labels[i]}>
          <span className="gin-group-label">{labels[i]}</span>
          <div className="gin-group-cards">{m.cards.map((c) => tile(c, true))}</div>
        </div>
      ))}
      {layoffs && layoffs.length > 0 && (
        <div className="gin-group gin-group-lay" role="group" aria-label="Laid off">
          <span className="gin-group-label">LAID OFF</span>
          <div className="gin-group-cards">{layoffs.map((c) => tile(c, true))}</div>
        </div>
      )}
      {dead.length > 0 && (
        <div className="gin-group gin-group-dead" role="group" aria-label={deadLabel ?? 'Deadwood'}>
          <span className="gin-group-label">{deadLabel ?? 'DEADWOOD'}</span>
          <div className="gin-group-cards">{dead.map((c) => tile(c, false))}</div>
        </div>
      )}
    </div>
  )
}

function GinRummy({ onExit }: GameProps) {
  const rec = useGameRecords('gin-rummy')
  const timers = useTimers()
  const log = useEventLog()
  const phone = usePhone()
  const [diff, setDiff] = useState<Difficulty>('standard')
  const [matchDiff, setMatchDiff] = useState<Difficulty>('standard')
  const [match, setMatch] = useState<MatchState>(newMatch)
  const [hand, setHand] = useState<HandState>(() => deal(newSeed(), 'WOPR'))
  const [sel, setSel] = useState<string | null>(null)
  const [lastAi, setLastAi] = useState<AiReport | null>(null)
  const [matchId, setMatchId] = useState(() => String(newSeed()))
  const matchRef = useRef(match)
  matchRef.current = match

  const over = matchResult(match)

  // Commit a new hand state; settle into the match exactly once when it ends.
  const commit = (next: HandState): void => {
    setHand(next)
    setSel(null)
    if (next.stage !== 'over' || !next.settlement) return
    const s = next.settlement
    const m2 = recordHand(matchRef.current, next.dealer, s)
    matchRef.current = m2
    setMatch(m2)
    log.push({ text: describeSettlement(s), kind: s.winner === 'YOU' ? 'good' : s.winner === 'WOPR' ? 'bad' : 'warn' })
    const res = matchResult(m2)
    if (res) {
      rec.recordOnce(matchId, () => rec.tally(`match-${matchDiff}`, res.winner === 'YOU' ? 'win' : 'lose'))
      if (res.winner === 'YOU') cue.win()
      else cue.lose()
    } else if (s.winner === 'YOU') cue.win()
    else if (s.winner === 'WOPR') cue.lose()
    else cue.draw()
  }

  // WOPR acts on its own turn after a short, cancellable pause.
  useEffect(() => {
    if (hand.turn !== 'WOPR' || hand.stage === 'over') return
    timers.later(() => {
      const { state, report } = aiStep(hand, matchDiff)
      setLastAi(report)
      cue.tick()
      log.push({
        text: aiText(report) + (report.knocked ? (state.settlement?.kind === 'gin' ? ' WOPR GOES GIN.' : ` WOPR KNOCKS AT ${state.settlement?.knockerDead}.`) : ''),
        kind: report.knocked ? 'bad' : 'info',
      })
      commit(state)
    }, 750)
    return () => timers.clear()
  }, [hand])

  const mine = hand.turn === 'YOU' && hand.stage !== 'over'
  const top = topDiscard(hand)
  const youHand = hand.hands.YOU
  const youAnal = useMemo(() => analyze(youHand), [youHand])
  const discardable = useMemo(
    () => (mine && hand.stage === 'discard' ? youAnal.melds.flatMap((m) => m.cards).concat(youAnal.dead).filter((c) => !discardBlock(hand, c.id)) : []),
    [mine, hand, youAnal],
  )
  const after = sel && mine && hand.stage === 'discard' ? deadwoodAfter(hand, sel) : null
  const canKnock = after !== null && after <= KNOCK_LIMIT

  // ---- human actions
  const takeUp = (): void => {
    if (!mine || !top || !canDraw(hand, 'discard')) return cue.deny()
    cue.card()
    log.push({ text: `YOU TAKE ${label(top)} FROM THE DISCARD.` })
    commit(draw(hand, 'discard'))
  }
  const drawStock = (): void => {
    if (!mine || !canDraw(hand, 'stock')) return cue.deny()
    cue.card()
    const next = draw(hand, 'stock')
    log.push({ text: `YOU DRAW ${label(next.hands.YOU[next.hands.YOU.length - 1]!)} FROM STOCK.` })
    commit(next)
  }
  const pass = (): void => {
    if (!mine || hand.stage !== 'upcard') return cue.deny()
    cue.select()
    log.push({ text: `YOU PASS THE UPCARD ${top ? label(top) : ''}.` })
    commit(passUpcard(hand))
  }
  const select = (id: string): void => {
    if (!mine || hand.stage !== 'discard' || discardBlock(hand, id)) return cue.deny()
    cue.select()
    setSel(id)
  }
  const doDiscard = (knock: boolean): void => {
    if (!sel || !mine || hand.stage !== 'discard') return cue.deny()
    if (knock && !canKnock) return cue.deny()
    const c = youHand.find((x) => x.id === sel)!
    cue.card()
    log.push({
      text: `YOU DISCARD ${label(c)}.${knock ? (after === 0 ? ' YOU GO GIN.' : ` YOU KNOCK AT ${after}.`) : ''}`,
      kind: knock ? 'good' : 'info',
    })
    commit(discardCard(hand, sel, knock))
  }

  const nextHand = (): void => {
    if (hand.stage !== 'over' || over) return
    timers.clear()
    cue.card()
    setLastAi(null)
    log.push({ text: `HAND ${match.history.length + 1}. ${match.nextDealer === 'YOU' ? 'YOU DEAL' : 'WOPR DEALS'}.` })
    commit(deal(newSeed(), match.nextDealer))
  }
  const newMatchNow = (): void => {
    timers.clear()
    log.reset()
    setMatch(newMatch())
    matchRef.current = newMatch()
    setMatchDiff(diff)
    setMatchId(String(newSeed()))
    setLastAi(null)
    setSel(null)
    setHand(deal(newSeed(), 'WOPR'))
  }

  useGameKeys((k) => {
    const key = k.toLowerCase()
    if (mine && hand.stage === 'discard' && (k === 'ArrowRight' || k === 'ArrowLeft') && discardable.length) {
      const i = discardable.findIndex((c) => c.id === sel)
      const n = discardable.length
      const j = i < 0 ? (k === 'ArrowRight' ? 0 : n - 1) : (i + (k === 'ArrowRight' ? 1 : -1) + n) % n
      select(discardable[j]!.id)
      return true
    }
    const act: Record<string, (() => void) | undefined> = mine
      ? hand.stage === 'upcard'
        ? { t: takeUp, p: pass }
        : hand.stage === 'draw'
          ? { s: drawStock, d: takeUp }
          : { x: () => doDiscard(false), k: () => doDiscard(true) }
      : hand.stage === 'over' && !over
        ? { n: nextHand }
        : {}
    const fn = act[key]
    if (fn) {
      fn()
      return true
    }
    return false
  })

  // ---- view pieces
  const s = hand.settlement
  const handOver = hand.stage === 'over'
  const tileFor = (c: Card, inMeld: boolean) => {
    const interactive = mine && hand.stage === 'discard'
    const block = interactive ? discardBlock(hand, c.id) : null
    const selected = sel === c.id
    const badge = selected
      ? `DW ${deadwoodAfter(hand, c.id)}`
      : hand.pickedUp === c.id
        ? 'TAKEN'
        : hand.drawn === c.id
          ? 'NEW'
          : undefined
    return (
      <CardTile
        key={c.id}
        card={c}
        mark={inMeld ? 'meld' : 'none'}
        selected={selected}
        badge={badge}
        onClick={interactive ? () => select(c.id) : undefined}
        disabled={!!block}
        label={block ? `${label(c)}, ${block.toLowerCase()}` : undefined}
        testId={`gin-card-${c.id}`}
      />
    )
  }
  const plainTile = (c: Card, inMeld: boolean) => <CardTile key={c.id} card={c} size="sm" mark={inMeld ? 'meld' : 'none'} />

  // Final arrangement view for each player.
  const finalView = (who: Who) => {
    if (s && s.kind !== 'void' && s.knocker === who)
      return { melds: s.knockerMelds, dead: s.knockerDeadCards, layoffs: [] as Card[], dw: s.knockerDead }
    if (s && s.kind !== 'void' && s.defense)
      return { melds: s.defense.melds, dead: s.defense.dead, layoffs: s.defense.layoffs, dw: s.defenderDead }
    const a = analyze(hand.hands[who])
    return { melds: a.melds, dead: a.dead, layoffs: [] as Card[], dw: a.deadwood }
  }

  const phase = over
    ? 'MATCH OVER'
    : handOver
      ? 'HAND OVER'
      : !mine
        ? hand.stage === 'upcard'
          ? 'WOPR DECIDES ON THE UPCARD'
          : "WOPR'S TURN"
        : hand.stage === 'upcard'
          ? 'TAKE OR PASS THE UPCARD'
          : hand.stage === 'draw'
            ? hand.mustDrawStock
              ? 'DRAW FROM STOCK'
              : 'DRAW FROM STOCK OR DISCARD'
            : sel
              ? 'DISCARD OR KNOCK'
              : 'SELECT A DISCARD'

  const recW = rec.get<WLD | undefined>(`match-${matchDiff}`, undefined)

  const settlementPanel = s && (
    <Panel title={`HAND ${match.history.length} RESULT`} tone={s.winner === 'YOU' ? 'amber' : s.winner === 'WOPR' ? 'red' : 'dim'}>
      <p data-testid="gin-outcome" style={{ fontSize: 19 }}>
        {describeSettlement(s)}
      </p>
      {s.kind !== 'void' && s.kind !== 'gin' && (
        <p className="gin-note">
          DEFENDER {s.defenderDeadRaw} DEADWOOD
          {s.layoffs.length ? `, LAID OFF ${s.layoffs.map(label).join(' ')}, NOW ${s.defenderDead}` : ', NO LAYOFFS'}.
        </p>
      )}
      {s.kind === 'gin' && <p className="gin-note">NO LAYOFF AGAINST GIN.</p>}
    </Panel>
  )

  let side: ReactNode
  if (over) {
    side = (
      <>
        <GameResult
          outcome={over.winner === 'YOU' ? 'win' : 'lose'}
          headline={over.winner === 'YOU' ? 'MATCH WON' : 'WOPR WINS THE MATCH'}
          reason={`${over.winner === 'YOU' ? 'YOU' : 'WOPR'} REACHED ${MATCH_TARGET}. FINAL WITH ${BOX_BONUS}/HAND BOX AND ${GAME_BONUS} GAME BONUS: YOU ${over.totals.YOU}, WOPR ${over.totals.WOPR}.`}
          metrics={[
            { label: 'HANDS', value: match.history.length },
            { label: 'BOXES', value: `${over.boxes.YOU}-${over.boxes.WOPR}` },
          ]}
          testId="gin-match-result"
        >
          <Action variant="primary" onClick={newMatchNow} testId="gin-again" autoFocus>
            NEW MATCH
          </Action>
        </GameResult>
        {settlementPanel}
      </>
    )
  } else if (handOver) {
    side = (
      <>
        {settlementPanel}
        <ActionBar>
          <Action variant="primary" onClick={nextHand} testId="gin-again" shortcut="N" autoFocus>
            NEXT HAND
          </Action>
        </ActionBar>
      </>
    )
  } else if (!mine) {
    side = (
      <Panel title="WOPR'S TURN">
        <p className="gin-note">WOPR IS DECIDING.</p>
      </Panel>
    )
  } else if (hand.stage === 'upcard') {
    side = (
      <Panel title="OPENING UPCARD">
        <p>{hand.upcardPasses === 0 ? 'NON-DEALER DECIDES FIRST.' : 'WOPR PASSED. YOUR OPTION AS DEALER.'}</p>
        <ActionBar label="Upcard">
          <Action variant="primary" onClick={takeUp} testId="gin-draw-discard" shortcut="T" autoFocus>
            TAKE {top ? label(top) : ''}
          </Action>
          <Action onClick={pass} testId="gin-pass" shortcut="P">
            PASS
          </Action>
        </ActionBar>
      </Panel>
    )
  } else if (hand.stage === 'draw') {
    side = (
      <Panel title="DRAW">
        <p>YOUR DEADWOOD {youAnal.deadwood}.</p>
        <ActionBar label="Draw">
          <Action variant="primary" onClick={drawStock} testId="gin-draw-stock" shortcut="S" autoFocus>
            DRAW STOCK
          </Action>
          <Action
            onClick={takeUp}
            disabled={!canDraw(hand, 'discard')}
            reason="BOTH PASSED THE UPCARD: DRAW FROM STOCK"
            testId="gin-draw-discard"
            shortcut="D"
          >
            TAKE {top ? label(top) : 'DISCARD'}
          </Action>
        </ActionBar>
      </Panel>
    )
  } else {
    const selCard = sel ? youHand.find((c) => c.id === sel) : undefined
    side = (
      <Panel title="DISCARD" className="gin-discard">
        {selCard ? (
          <p className="gin-after" data-testid="gin-after">
            AFTER DISCARD: {after}
          </p>
        ) : (
          <p className="gin-after gs-tone-amber" data-testid="gin-after">
            SELECT A DISCARD
          </p>
        )}
        <ActionBar label="Discard">
          <Action
            variant="primary"
            onClick={() => doDiscard(false)}
            disabled={!selCard}
            reason="SELECT A CARD"
            testId="gin-discard"
            shortcut="X"
          >
            DISCARD{selCard ? ` ${label(selCard)}` : ''}
          </Action>
          <Action
            onClick={() => doDiscard(true)}
            disabled={!canKnock}
            reason={selCard ? `NEED ${KNOCK_LIMIT} OR LESS` : 'SELECT A DISCARD'}
            testId="gin-knock"
            shortcut="K"
          >
            {after === 0 ? 'GIN' : 'KNOCK'}
          </Action>
        </ActionBar>
        <p className="gin-note">
          {hand.pickedUp ? `${label(youHand.find((c) => c.id === hand.pickedUp)!)} WAS PICKED UP: IT STAYS THIS TURN. ` : ''}
          ARROWS CYCLE CARDS.
        </p>
      </Panel>
    )
  }

  const report = (
    <>
      <GameReport events={log.events} title="TURN REPORT" />
      {match.history.length > 0 && (
        <Panel title="HAND HISTORY">
          <ol className="gin-history" data-testid="gin-history">
            {match.history.map((h) => (
              <li key={h.n} className={h.settlement.winner === 'YOU' ? 'is-you' : h.settlement.winner === 'WOPR' ? 'is-wopr' : ''}>
                #{h.n} {h.settlement.kind.toUpperCase()}
                {h.settlement.winner ? ` · ${h.settlement.winner} +${h.settlement.points}` : ' · NO SCORE'}
              </li>
            ))}
          </ol>
        </Panel>
      )}
    </>
  )

  // Phone: DISCARD / KNOCK sit right above the hand, beside its selected-card summary.
  const discardInFelt = phone && !over && !handOver && mine && hand.stage === 'discard'
  const woprFinal = handOver ? finalView('WOPR') : null
  const youFinal = handOver ? finalView('YOU') : null
  const inProgress = match.history.length > 0 || hand.stage !== 'upcard' || hand.upcardPasses > 0

  return (
    <GameShell
      slug="gin-rummy"
      title="GIN RUMMY"
      layout="table"
      objective={`FIRST TO ${MATCH_TARGET} POINTS. KNOCK AT ${KNOCK_LIMIT} OR LESS, GIN AT 0.`}
      phase={phase}
      phaseTone={mine ? 'amber' : 'dim'}
      metrics={[
        { label: 'YOU', value: match.scores.YOU, tone: 'normal' },
        { label: 'WOPR', value: match.scores.WOPR, tone: 'red' },
        { label: 'TARGET', value: MATCH_TARGET, tone: 'dim' },
        { label: 'HAND', value: match.history.length + (handOver ? 0 : 1) },
        { label: 'STOCK', value: hand.stock.length, tone: hand.stock.length <= STOCK_STOP + 2 ? 'amber' : 'normal' },
        { label: 'MATCHES', value: fmtWLD(recW), tone: 'dim', title: `Match record at ${matchDiff}` },
      ]}
      toolbar={
        <Segmented<Difficulty>
          label="WOPR"
          value={diff}
          options={DIFFS}
          onChange={(v) => {
            cue.select()
            setDiff(v)
            if (!inProgress) setMatchDiff(v)
          }}
          testId="gin-difficulty"
        />
      }
      help={
        <>
          <p>FORM MELDS: SETS (3-4 OF A RANK) OR RUNS (3+ IN ONE SUIT, ACE LOW). UNMELDED CARDS ARE DEADWOOD: ACE 1, PIPS FACE VALUE, 10/J/Q/K 10.</p>
          <ul>
            <li>OPENING: THE NON-DEALER MAY TAKE THE UPCARD OR PASS, THEN THE DEALER. IF BOTH PASS, THE NON-DEALER DRAWS FROM STOCK.</li>
            <li>EACH TURN: DRAW FROM STOCK OR TAKE THE TOP DISCARD, THEN DISCARD ONE. A CARD TAKEN FROM THE DISCARD CANNOT BE DISCARDED THE SAME TURN.</li>
            <li>KNOCK WHEN YOUR DEADWOOD AFTER THE DISCARD IS {KNOCK_LIMIT} OR LESS. GIN AT 0.</li>
            <li>AFTER A KNOCK THE DEFENDER LAYS OFF DEADWOOD ON THE KNOCKER&apos;S MELDS (NOT AGAINST GIN). KNOCKER SCORES THE DIFFERENCE.</li>
            <li>UNDERCUT: DEFENDER EQUAL OR LOWER SCORES THE DIFFERENCE + {UNDERCUT_BONUS}. GIN SCORES OPPONENT DEADWOOD + {GIN_BONUS}.</li>
            <li>IF A DISCARD LEAVES {STOCK_STOP} CARDS IN STOCK WITHOUT A KNOCK, THE HAND IS VOID.</li>
            <li>MATCH TO {MATCH_TARGET}. DEAL ALTERNATES EVERY HAND. END BONUSES: {BOX_BONUS} PER HAND WON, {GAME_BONUS} FOR THE MATCH. NO BIG GIN OR SHUTOUT DOUBLING.</li>
            <li>WOPR BEGINNER: TAKES A DISCARD ONLY IF IT MELDS DOWN THE RAW 11-CARD COUNT. STANDARD: COMPARES THE BEST 10-CARD RESULT AFTER EVERY LEGAL DISCARD AND KEEPS CONNECTED CARDS. BOTH KNOCK AS SOON AS LEGAL. WOPR NEVER SEES YOUR HAND. A LEVEL CHANGE MID-MATCH APPLIES NEXT MATCH.</li>
            <li>KEYS: T TAKE / P PASS UPCARD · S STOCK · D DISCARD PILE · ARROWS SELECT · X DISCARD · K KNOCK · N NEXT HAND.</li>
          </ul>
        </>
      }
      onRestart={newMatchNow}
      inProgress={inProgress && !over}
      restartLabel="NEW MATCH"
      onExit={() => {
        timers.clear()
        onExit()
      }}
      side={discardInFelt ? undefined : side}
      report={report}
      announce={log.events[log.events.length - 1]?.text}
    >
      <div className="gs-felt">
        <div className="gin-row" data-testid="gin-wopr">
          {woprFinal ? (
            <CardHand label={`WOPR · ${woprFinal.dw} DEADWOOD`}>
              <MeldGroups melds={woprFinal.melds} dead={woprFinal.dead} layoffs={woprFinal.layoffs} tile={plainTile} />
            </CardHand>
          ) : (
            <>
              <span className="gin-opp">WOPR: {hand.hands.WOPR.length} CARDS</span>
              <span className="gin-opp-last" data-testid="gin-wopr-last">
                {lastAi ? `LAST TURN: ${aiText(lastAi)}` : hand.dealer === 'WOPR' ? 'WOPR DEALT.' : 'YOU DEALT.'}
              </span>
              {diff !== matchDiff && <span className="gin-note">{diff.toUpperCase()} FROM NEXT MATCH.</span>}
            </>
          )}
        </div>

        <div className="gin-piles">
          <div className="gin-pile">
            {mine && canDraw(hand, 'stock') ? (
              <CardTile faceDown onClick={drawStock} label={`Draw from stock, ${hand.stock.length} cards`} eligible testId="gin-stock" />
            ) : (
              <CardTile faceDown label={`Stock, ${hand.stock.length} cards`} />
            )}
            <span>STOCK {hand.stock.length}</span>
          </div>
          <div className="gin-pile">
            {top ? (
              mine && canDraw(hand, 'discard') ? (
                <CardTile card={top} onClick={takeUp} eligible badge={hand.stage === 'upcard' ? 'UP' : undefined} label={`Take ${label(top)} from discard`} testId="gin-top" />
              ) : (
                <CardTile card={top} badge={hand.stage === 'upcard' ? 'UP' : undefined} />
              )
            ) : (
              <span className="gs-card gs-card-empty" role="img" aria-label="Discard pile empty" />
            )}
            <span>DISCARD {hand.discard.length}</span>
          </div>
        </div>

        {discardInFelt && side}

        <CardHand
          label={handOver ? `YOU · ${youFinal!.dw} DEADWOOD` : 'YOUR HAND'}
          total={handOver ? undefined : hand.stage === 'discard' && mine ? (after !== null ? `AFTER DISCARD: ${after}` : '11 CARDS') : `DEADWOOD ${youAnal.deadwood}`}
          testId="gin-hand"
        >
          {youFinal ? (
            <MeldGroups melds={youFinal.melds} dead={youFinal.dead} layoffs={youFinal.layoffs} tile={plainTile} />
          ) : (
            <MeldGroups melds={youAnal.melds} dead={youAnal.dead} tile={tileFor} />
          )}
        </CardHand>
      </div>
    </GameShell>
  )
}

export const entry: GameEntry = { id: 'GIN RUMMY', Component: GinRummy }
