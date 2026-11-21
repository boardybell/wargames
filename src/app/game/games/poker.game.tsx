// POKER. Five-card draw against WOPR. CLASSIC: hold, draw once, showdown.
// QUICK DRAW: $5 ante each, then after the draw one capped $10 bet or check
// and a call/fold reply; WOPR's replacement count is shown before you decide.
// Rules live in engines/poker.ts. Design: docs/games-design-review.md §8.
import { useState, type ReactNode } from 'react'
import type { GameEntry, GameProps } from './types'
import { Action, ActionBar, GameReport, GameResult, GameShell, Panel, Segmented } from './ui/GameShell'
import { CardHand, CardTile } from './ui/cards/CardTile'
import { cue, fmtWLD, newSeed, rng, useEventLog, useGameKeys, useGameRecords, type WLD } from './hooks'
import {
  ANTE,
  BET,
  FLOOR,
  GOAL,
  START_BANKROLL,
  aiBetAfterCheck,
  aiCallBet,
  aiHolds,
  canAfford,
  evaluate,
  handName,
  settlePot,
  showdown,
  shuffledDeck,
  type Card,
  type EndReason,
  type Winner,
} from './engines/poker'
import './styles/poker.css'

type Mode = 'classic' | 'quick'
const MODES = [
  { value: 'classic', label: 'CLASSIC' },
  { value: 'quick', label: 'QUICK DRAW' },
] as const

type Stage = 'hold' | 'bet' | 'respond' | 'done'
interface End {
  readonly winner: Winner
  readonly reason: EndReason
  readonly net: number
  readonly decisive: string
  readonly youName: string
  readonly woprName: string
}
interface Hand {
  readonly mode: Mode
  readonly deck: readonly Card[]
  readonly you: readonly Card[]
  readonly ai: readonly Card[]
  readonly stage: Stage
  readonly youDrew: number | null
  readonly aiDrew: number | null
  readonly replaced: ReadonlySet<number>
  readonly pot: number
  readonly youIn: number
  readonly end: End | null
}
interface Session {
  readonly bankroll: number
  readonly w: number
  readonly l: number
  readonly t: number
  readonly lastNet: number | null
}
const freshSession = (): Session => ({ bankroll: START_BANKROLL, w: 0, l: 0, t: 0, lastNet: null })

function dealHand(mode: Mode): Hand {
  const deck = shuffledDeck(newSeed())
  const you = deck.splice(-5)
  const ai = deck.splice(-5)
  const ante = mode === 'quick' ? ANTE : 0
  return { mode, deck, you, ai, stage: 'hold', youDrew: null, aiDrew: null, replaced: new Set(), pot: ante * 2, youIn: ante, end: null }
}

const money = (n: number): string => (n < 0 ? `-$${-n}` : `$${n}`)
const signed = (n: number): string => (n > 0 ? `+$${n}` : n < 0 ? `-$${-n}` : '$0')

function Poker({ onExit }: GameProps) {
  const rec = useGameRecords('poker')
  const log = useEventLog()
  const [mode, setMode] = useState<Mode>('classic')
  const [session, setSession] = useState<Session>(freshSession)
  const [hand, setHand] = useState<Hand>(() => dealHand('classic'))
  const [held, setHeld] = useState<ReadonlySet<number>>(new Set())

  const quick = hand.mode === 'quick'
  const youRank = evaluate(hand.you)

  // ---- settlement (in handlers only)
  const finish = (h: Hand, reason: EndReason, forced?: Winner): void => {
    const sd = showdown(h.you, h.ai)
    const winner: Winner = forced ?? (sd.result > 0 ? 'you' : sd.result < 0 ? 'wopr' : 'tie')
    const net = h.mode === 'quick' ? settlePot(h.pot, h.youIn, winner) : 0
    const end: End = { winner, reason, net, decisive: sd.decisive, youName: handName(sd.you), woprName: handName(sd.wopr) }
    setHand({ ...h, stage: 'done', end })
    const s2: Session = {
      bankroll: session.bankroll + net,
      w: session.w + (winner === 'you' ? 1 : 0),
      l: session.l + (winner === 'wopr' ? 1 : 0),
      t: session.t + (winner === 'tie' ? 1 : 0),
      lastNet: h.mode === 'quick' ? net : null,
    }
    setSession(s2)
    if (h.mode === 'classic') rec.tally('classic', winner === 'you' ? 'win' : winner === 'wopr' ? 'lose' : 'draw')
    else if (s2.bankroll > rec.get<number>('bestBankroll', START_BANKROLL)) rec.update<number>('bestBankroll', () => s2.bankroll)
    const text =
      reason === 'you-folded'
        ? `YOU FOLD. WOPR TAKES ${money(h.pot)}.`
        : reason === 'wopr-folded'
          ? `WOPR FOLDS. YOU TAKE ${money(h.pot)}.`
          : winner === 'tie'
            ? `${h.mode === 'quick' ? 'SPLIT POT' : 'TIED HAND'}. ${sd.decisive}`
            : `${winner === 'you' ? 'YOU WIN' : 'WOPR WINS'}. ${sd.decisive}`
    log.push({ text, kind: winner === 'you' ? 'good' : winner === 'wopr' ? 'bad' : 'warn' })
    if (winner === 'you') cue.win()
    else if (winner === 'wopr') cue.lose()
    else cue.draw()
  }

  // ---- actions
  const toggleHold = (i: number): void => {
    if (hand.stage !== 'hold') return cue.deny()
    cue.select()
    setHeld((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const draw = (): void => {
    if (hand.stage !== 'hold') return cue.deny()
    const deck = [...hand.deck]
    const replaced = new Set<number>()
    const you = hand.you.map((c, i) => {
      if (held.has(i)) return c
      replaced.add(i)
      return deck.pop()!
    })
    const keep = aiHolds(hand.ai)
    const ai = hand.ai.map((c, i) => (keep.has(i) ? c : deck.pop()!))
    const youDrew = replaced.size
    const aiDrew = 5 - keep.size
    cue.card()
    log.push({ text: `YOU DRAW ${youDrew}. WOPR DRAWS ${aiDrew}${aiDrew === 0 ? ' (STANDS PAT)' : ''}.` })
    const next: Hand = { ...hand, deck, you, ai, youDrew, aiDrew, replaced }
    setHeld(new Set())
    if (hand.mode === 'quick') setHand({ ...next, stage: 'bet' })
    else finish(next, 'showdown')
  }

  const roll = (): number => rng(newSeed())()

  const bet = (): void => {
    if (hand.stage !== 'bet') return cue.deny()
    const h: Hand = { ...hand, pot: hand.pot + BET, youIn: hand.youIn + BET }
    const reply = aiCallBet(evaluate(hand.ai), hand.youDrew ?? 0, roll())
    cue.select()
    log.push({ text: `YOU BET ${money(BET)}. WOPR ${reply === 'call' ? 'CALLS' : 'FOLDS'}.`, kind: reply === 'fold' ? 'good' : 'info' })
    if (reply === 'call') finish({ ...h, pot: h.pot + BET }, 'showdown')
    else finish(h, 'wopr-folded', 'you')
  }
  const check = (): void => {
    if (hand.stage !== 'bet') return cue.deny()
    const act = aiBetAfterCheck(evaluate(hand.ai), hand.youDrew ?? 0, roll())
    cue.select()
    if (act === 'check') {
      log.push({ text: 'YOU CHECK. WOPR CHECKS.' })
      finish(hand, 'showdown')
    } else {
      cue.tick()
      log.push({ text: `YOU CHECK. WOPR BETS ${money(BET)}.`, kind: 'warn' })
      setHand({ ...hand, stage: 'respond', pot: hand.pot + BET })
    }
  }
  const call = (): void => {
    if (hand.stage !== 'respond') return cue.deny()
    cue.select()
    log.push({ text: `YOU CALL ${money(BET)}.` })
    finish({ ...hand, pot: hand.pot + BET, youIn: hand.youIn + BET }, 'showdown')
  }
  const fold = (): void => {
    if (hand.stage !== 'respond') return cue.deny()
    finish(hand, 'you-folded', 'wopr')
  }

  const sessionOver = mode === 'quick' && hand.stage === 'done' && !canAfford(session.bankroll)
  const nextHand = (): void => {
    if (hand.stage !== 'done') return cue.deny()
    if (mode === 'quick' && !canAfford(session.bankroll)) return cue.deny()
    cue.card()
    setHeld(new Set())
    setHand(dealHand(mode))
    if (mode === 'quick') log.push({ text: `ANTE ${money(ANTE)} EACH. POT ${money(ANTE * 2)}.` })
  }
  const newSession = (): void => {
    log.reset()
    setSession(freshSession())
    setHeld(new Set())
    setHand(dealHand(mode))
  }
  const changeMode = (m: Mode): void => {
    cue.select()
    setMode(m)
    // An untouched classic hand can switch at once; otherwise it applies next hand.
    if (hand.stage === 'hold' && held.size === 0 && hand.mode === 'classic' && m === 'quick' && canAfford(session.bankroll)) {
      setHand({ ...hand, mode: 'quick', pot: ANTE * 2, youIn: ANTE })
      log.push({ text: `QUICK DRAW. ANTE ${money(ANTE)} EACH.` })
    } else if (hand.stage === 'hold' && hand.mode === 'quick' && m === 'classic' && held.size === 0) {
      setHand({ ...hand, mode: 'classic', pot: 0, youIn: 0 })
    }
  }

  useGameKeys((k) => {
    const key = k.toLowerCase()
    if (hand.stage === 'hold' && /^[1-5]$/.test(key)) {
      toggleHold(Number(key) - 1)
      return true
    }
    const map: Record<string, (() => void) | undefined> =
      hand.stage === 'hold'
        ? { d: draw }
        : hand.stage === 'bet'
          ? { b: bet, c: check }
          : hand.stage === 'respond'
            ? { c: call, f: fold }
            : sessionOver
              ? {}
              : { n: nextHand }
    const fn = map[key]
    if (fn) {
      fn()
      return true
    }
    return false
  })

  // ---- view
  const end = hand.end
  const reveal = hand.stage === 'done' && end?.reason !== 'wopr-folded' && end?.reason !== 'you-folded'
  const woprRank = evaluate(hand.ai)
  const phase =
    hand.stage === 'hold'
      ? 'HOLD CARDS, THEN DRAW'
      : hand.stage === 'bet'
        ? 'BET OR CHECK'
        : hand.stage === 'respond'
          ? 'WOPR BETS: CALL OR FOLD'
          : sessionOver
            ? 'SESSION OVER'
            : 'HAND SETTLED'

  const headline = !end
    ? ''
    : end.winner === 'tie'
      ? quick
        ? 'SPLIT POT.'
        : 'TIED HAND.'
      : end.reason === 'wopr-folded'
        ? 'WOPR FOLDS. YOU WIN.'
        : end.reason === 'you-folded'
          ? 'YOU FOLD. WOPR WINS.'
          : end.winner === 'you'
            ? 'YOU WIN.'
            : 'WOPR WINS.'

  const outcomePanel = end && (
    <Panel title="SHOWDOWN" tone={end.winner === 'you' ? 'amber' : end.winner === 'wopr' ? 'red' : 'dim'}>
      <p className="pk-headline" data-testid="poker-outcome">
        {headline}
      </p>
      {reveal ? (
        <>
          <p className="pk-line">YOU: {end.youName}</p>
          <p className="pk-line">WOPR: {end.woprName}</p>
          <p className="pk-decisive" data-testid="poker-decisive">
            {end.decisive}
          </p>
        </>
      ) : (
        <p className="pk-line">{end.reason === 'wopr-folded' ? 'WOPR FOLDED. HAND NOT SHOWN.' : 'YOU FOLDED. HANDS NOT SHOWN.'}</p>
      )}
      {quick && <p className="pk-line">POT {money(hand.pot)} · YOU {signed(end.net)}</p>}
    </Panel>
  )

  let side: ReactNode
  if (sessionOver) {
    side = (
      <>
        <GameResult
          outcome={session.bankroll >= START_BANKROLL ? 'win' : 'lose'}
          headline="SESSION OVER"
          reason={`BANKROLL ${money(session.bankroll)} CANNOT COVER THE ${money(ANTE)} ANTE PLUS ONE ${money(BET)} BET.`}
          metrics={[{ label: 'W-L-T', value: `${session.w}-${session.l}-${session.t}` }]}
          testId="poker-session"
        >
          <Action variant="primary" onClick={newSession} testId="poker-again" autoFocus>
            NEW SESSION
          </Action>
        </GameResult>
        {outcomePanel}
      </>
    )
  } else if (hand.stage === 'done') {
    side = (
      <>
        {outcomePanel}
        <ActionBar>
          <Action variant="primary" onClick={nextHand} testId="poker-again" shortcut="N" autoFocus>
            {mode === 'quick' ? `NEXT HAND · ANTE ${money(ANTE)}` : 'NEXT HAND'}
          </Action>
        </ActionBar>
      </>
    )
  } else if (hand.stage === 'hold') {
    side = (
      <Panel title="DRAW">
        <p>TAP CARDS TO HOLD. UNHELD CARDS ARE REPLACED ONCE.</p>
        <ActionBar label="Draw">
          <Action variant="primary" onClick={draw} testId="poker-draw" shortcut="D" autoFocus>
            {held.size === 5 ? 'STAND PAT' : `DRAW ${5 - held.size}`}
          </Action>
        </ActionBar>
        {quick && <p className="pk-line">POT {money(hand.pot)} (ANTES).</p>}
      </Panel>
    )
  } else if (hand.stage === 'bet') {
    side = (
      <Panel title="BETTING">
        <p className="pk-intel" data-testid="poker-wopr-drew">
          WOPR DREW {hand.aiDrew}
          {hand.aiDrew === 0 ? ' (PAT)' : ''}. POT {money(hand.pot)}.
        </p>
        <ActionBar label="Bet">
          <Action variant="primary" onClick={bet} testId="poker-bet" shortcut="B" autoFocus>
            BET {money(BET)}
          </Action>
          <Action onClick={check} testId="poker-check" shortcut="C">
            CHECK
          </Action>
        </ActionBar>
      </Panel>
    )
  } else {
    side = (
      <Panel title="BETTING" tone="red">
        <p className="pk-intel">
          WOPR DREW {hand.aiDrew} AND BETS {money(BET)}. POT {money(hand.pot)}.
        </p>
        <ActionBar label="Respond">
          <Action variant="primary" onClick={call} testId="poker-call" shortcut="C" autoFocus>
            CALL {money(BET)}
          </Action>
          <Action variant="danger" onClick={fold} testId="poker-fold" shortcut="F">
            FOLD
          </Action>
        </ActionBar>
      </Panel>
    )
  }

  const classicRec = rec.get<WLD | undefined>('classic', undefined)
  const metrics =
    hand.mode === 'quick' || mode === 'quick'
      ? [
          { label: 'BANKROLL', value: money(session.bankroll), tone: session.bankroll < START_BANKROLL ? ('red' as const) : ('normal' as const) },
          { label: 'POT', value: money(hand.stage === 'done' ? 0 : hand.pot), tone: 'amber' as const },
          { label: 'LAST', value: session.lastNet === null ? '—' : signed(session.lastNet), tone: session.lastNet && session.lastNet < 0 ? ('red' as const) : ('dim' as const) },
          { label: 'BEST', value: money(Math.max(rec.get<number>('bestBankroll', START_BANKROLL), session.bankroll)), tone: 'dim' as const },
        ]
      : [
          { label: 'SESSION W-L-T', value: `${session.w}-${session.l}-${session.t}` },
          { label: 'ALL TIME', value: fmtWLD(classicRec), tone: 'dim' as const },
        ]

  const youLabel = hand.stage === 'hold' ? 'YOU · CURRENT HAND' : 'YOU'
  const woprTotal =
    hand.aiDrew === null ? '5 CARDS' : reveal ? handName(woprRank) : `DREW ${hand.aiDrew}`

  return (
    <GameShell
      slug="poker"
      title="POKER"
      layout="table"
      objective={mode === 'quick' ? `FIVE-CARD DRAW FOR STAKES. TURN ${money(START_BANKROLL)} INTO ${money(GOAL)}.` : 'FIVE-CARD DRAW. BEAT WOPR AT THE SHOWDOWN.'}
      phase={phase}
      metrics={metrics}
      toolbar={<Segmented<Mode> label="MODE" value={mode} options={MODES} onChange={changeMode} testId="poker-mode" />}
      help={
        <>
          <p>FIVE-CARD DRAW AGAINST WOPR. HOLD ANY CARDS, REPLACE THE REST ONCE, BEST HAND WINS. FRESH 52-CARD DECK EACH HAND.</p>
          <ul>
            <li>RANKS, LOW TO HIGH: HIGH CARD, PAIR, TWO PAIR, THREE OF A KIND, STRAIGHT (A-2-3-4-5 COUNTS FIVE HIGH), FLUSH, FULL HOUSE, FOUR OF A KIND, STRAIGHT FLUSH. EQUAL CATEGORIES ARE DECIDED BY RANK, THEN KICKERS. SUITS NEVER BREAK TIES.</li>
            <li>CLASSIC: NO STAKES. A TIE IS A TIED HAND.</li>
            <li>QUICK DRAW: {money(START_BANKROLL)} BANKROLL, {money(ANTE)} ANTE EACH. NO BETTING BEFORE THE DRAW. AFTER IT YOU SEE HOW MANY CARDS WOPR DREW, THEN BET {money(BET)} OR CHECK. IF YOU BET, WOPR CALLS OR FOLDS. IF YOU CHECK, WOPR MAY BET {money(BET)} AND YOU CALL OR FOLD. ONE BET PER HAND, NO RAISES. TIES SPLIT THE POT.</li>
            <li>A QUICK DRAW HAND IS DEALT ONLY WHILE YOUR BANKROLL COVERS ANTE PLUS ONE BET ({money(FLOOR)}); BELOW THAT THE SESSION IS OVER.</li>
            <li>WOPR KEEPS ANY STRAIGHT OR BETTER WHOLE, KEEPS PAIRS AND TRIPS, THEN DRAWS TO FOUR-CARD FLUSHES AND STRAIGHTS. IT BETS ON ITS OWN HAND AND YOUR DRAW COUNT ONLY, AND SOMETIMES BLUFFS. IT NEVER SEES YOUR CARDS.</li>
            <li>MODE CHANGES APPLY TO THE NEXT HAND ONCE YOU HAVE STARTED HOLDING.</li>
            <li>KEYS: 1-5 HOLD · D DRAW · B BET · C CHECK / CALL · F FOLD · N NEXT HAND.</li>
          </ul>
        </>
      }
      onRestart={newSession}
      inProgress={session.w + session.l + session.t > 0 || hand.stage !== 'hold'}
      restartLabel="NEW SESSION"
      onExit={onExit}
      side={side}
      report={<GameReport events={log.events} />}
      announce={log.events[log.events.length - 1]?.text}
    >
      <div className="gs-felt pk-felt">
        <CardHand label="WOPR" total={woprTotal} testId="poker-wopr">
          {hand.ai.map((c, i) => (
            <CardTile key={i} card={c} faceDown={!reveal} size="lg" mark={reveal && end?.winner === 'wopr' ? 'win' : 'none'} />
          ))}
        </CardHand>
        {mode !== hand.mode && <p className="pk-line">{mode === 'quick' ? 'QUICK DRAW' : 'CLASSIC'} FROM NEXT HAND.</p>}
        <CardHand
          label={youLabel}
          total={<span data-testid="poker-category">{handName(youRank)}</span>}
          testId="poker-you"
          inactiveReason={hand.stage === 'hold' ? undefined : hand.stage === 'done' ? undefined : 'CARDS ARE SET AFTER THE DRAW.'}
        >
          {hand.you.map((c, i) =>
            hand.stage === 'hold' ? (
              <CardTile
                key={i}
                card={c}
                size="lg"
                selected={held.has(i)}
                badge={held.has(i) ? 'HELD' : undefined}
                onClick={() => toggleHold(i)}
                testId={`poker-card-${i}`}
              />
            ) : (
              <CardTile
                key={i}
                card={c}
                size="lg"
                badge={hand.replaced.has(i) && hand.stage !== 'done' ? 'NEW' : undefined}
                mark={end?.winner === 'you' && reveal ? 'win' : hand.replaced.has(i) && hand.stage !== 'done' ? 'last' : 'none'}
                testId={`poker-card-${i}`}
              />
            ),
          )}
        </CardHand>
      </div>
    </GameShell>
  )
}

export const entry: GameEntry = { id: 'POKER', Component: Poker }
