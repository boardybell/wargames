// BLACK JACK. Hit / stand / double against a WOPR dealer that stands on all 17s.
// $100 session bankroll, $10 bet; a hand is only dealt when the bankroll covers
// the bet, otherwise SESSION OVER. Blackjack pays 3:2, pushes return the bet.
// No splitting or insurance (stated in HOW TO PLAY). Bankroll settles inside
// the action handler that resolves the hand, never during render.
//
// Reference conversion for the shared shell (docs/games-design-review.md §2).
import { useState } from 'react'
import type { GameEntry, GameProps } from './types'
import { Action, ActionBar, GameResult, GameShell, Panel } from './ui/GameShell'
import { CardHand, CardTile } from './ui/cards/CardTile'
import { cue, useGameKeys, useGameRecords } from './hooks'

const SUITS = ['♠', '♥', '♦', '♣'] as const
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const

export interface Card {
  readonly rank: (typeof RANKS)[number]
  readonly suit: (typeof SUITS)[number]
}

function freshDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit })
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
  }
  return deck
}

/** Best total at or under 21: aces count 11 unless that busts, then 1. */
export function score(hand: readonly Card[]): number {
  let total = 0
  let aces = 0
  for (const c of hand) {
    if (c.rank === 'A') {
      aces += 1
      total += 11
    } else if (c.rank === 'K' || c.rank === 'Q' || c.rank === 'J') total += 10
    else total += Number(c.rank)
  }
  while (total > 21 && aces > 0) {
    total -= 10
    aces -= 1
  }
  return total
}
const isSoft = (hand: readonly Card[]): boolean => {
  let hard = 0
  for (const c of hand) hard += c.rank === 'A' ? 1 : c.rank === 'K' || c.rank === 'Q' || c.rank === 'J' ? 10 : Number(c.rank)
  return hand.some((c) => c.rank === 'A') && hard + 10 <= 21
}
const isBlackjack = (hand: readonly Card[]): boolean => hand.length === 2 && score(hand) === 21

type Result = 'WIN' | 'LOSE' | 'PUSH' | 'BLACKJACK'
interface Round {
  readonly deck: Card[]
  readonly player: Card[]
  readonly dealer: Card[]
  readonly phase: 'player' | 'done'
  readonly result: Result | null
  readonly bet: number
  readonly doubled: boolean
}

export const BET = 10
export const START_BANKROLL = 100
export const GOAL = 200

function deal(): Round {
  const deck = freshDeck()
  const player = [deck.pop()!, deck.pop()!]
  const dealer = [deck.pop()!, deck.pop()!]
  const pBJ = isBlackjack(player)
  const dBJ = isBlackjack(dealer)
  if (pBJ || dBJ) {
    const result: Result = pBJ && dBJ ? 'PUSH' : pBJ ? 'BLACKJACK' : 'LOSE'
    return { deck, player, dealer, phase: 'done', result, bet: BET, doubled: false }
  }
  return { deck, player, dealer, phase: 'player', result: null, bet: BET, doubled: false }
}

/** Net bankroll change for a resolved hand. */
export function payout(result: Result, bet: number): number {
  switch (result) {
    case 'BLACKJACK':
      return Math.floor(bet * 1.5)
    case 'WIN':
      return bet
    case 'LOSE':
      return -bet
    case 'PUSH':
      return 0
  }
}

function resolveDealer(r: Round, player: Card[], deck: Card[]): Round {
  const dealer = r.dealer.slice()
  if (score(player) <= 21) while (score(dealer) < 17) dealer.push(deck.pop()!)
  const d = score(dealer)
  const p = score(player)
  const result: Result = p > 21 ? 'LOSE' : d > 21 || p > d ? 'WIN' : p < d ? 'LOSE' : 'PUSH'
  return { ...r, deck, player, dealer, phase: 'done', result }
}

interface Session {
  bankroll: number
  hands: number
  wins: number
  losses: number
  pushes: number
  lastNet: number | null
}
const freshSession = (): Session => ({ bankroll: START_BANKROLL, hands: 0, wins: 0, losses: 0, pushes: 0, lastNet: null })

function BlackJack({ onExit }: GameProps) {
  const rec = useGameRecords('blackjack')
  const [session, setSession] = useState<Session>(freshSession)
  const [round, setRound] = useState<Round | null>(null)

  const settle = (r: Round): void => {
    setRound(r)
    if (!r.result) return
    const net = payout(r.result, r.bet)
    setSession((s) => {
      const next = {
        bankroll: s.bankroll + net,
        hands: s.hands + 1,
        wins: s.wins + (net > 0 ? 1 : 0),
        losses: s.losses + (net < 0 ? 1 : 0),
        pushes: s.pushes + (net === 0 ? 1 : 0),
        lastNet: net,
      }
      return next
    })
    const best = rec.get<number>('bestBankroll', START_BANKROLL)
    const after = session.bankroll + net
    if (after > best) rec.update<number>('bestBankroll', () => after)
    if (net > 0) cue.win()
    else if (net < 0) cue.lose()
    else cue.draw()
  }

  const canDeal = session.bankroll >= BET
  const startHand = (): void => {
    if (!canDeal) return
    cue.card()
    const r = deal()
    if (r.phase === 'done') settle(r)
    else setRound(r)
  }

  const hit = (): void => {
    if (!round || round.phase !== 'player') return
    const deck = round.deck.slice()
    const player = round.player.concat(deck.pop()!)
    cue.card()
    if (score(player) > 21) settle({ ...round, deck, player, phase: 'done', result: 'LOSE' })
    else setRound({ ...round, deck, player })
  }
  const stand = (): void => {
    if (!round || round.phase !== 'player') return
    settle(resolveDealer(round, round.player, round.deck.slice()))
  }
  const canDouble = !!round && round.phase === 'player' && round.player.length === 2 && session.bankroll >= round.bet * 2
  const double = (): void => {
    if (!round || !canDouble) return
    const deck = round.deck.slice()
    const player = round.player.concat(deck.pop()!)
    cue.card()
    settle(resolveDealer({ ...round, bet: round.bet * 2, doubled: true }, player, deck))
  }
  const newSession = (): void => {
    setSession(freshSession())
    setRound(null)
  }

  useGameKeys((k) => {
    const key = k.toLowerCase()
    if (round?.phase === 'player') {
      const act = key === 'h' ? hit : key === 's' ? stand : key === 'd' && canDouble ? double : null
      if (act) {
        act()
        return true
      }
    } else if (key === 'n' && canDeal) {
      startHand()
      return true
    }
    return false
  })

  const playing = round?.phase === 'player'
  const dScore = round ? score(round.dealer) : 0
  const pScore = round ? score(round.player) : 0
  const sessionOver = !playing && !canDeal

  let outcome = ''
  if (round?.phase === 'done' && round.result) {
    const dbl = round.doubled ? ' (DOUBLED)' : ''
    outcome =
      round.result === 'BLACKJACK'
        ? 'BLACKJACK. PAYS 3:2.'
        : round.result === 'WIN'
          ? (dScore > 21 ? 'DEALER BUSTS. YOU WIN.' : `YOU WIN ${pScore} TO ${dScore}.`) + dbl
          : round.result === 'LOSE'
            ? (pScore > 21 ? 'YOU BUST. DEALER WINS.' : isBlackjack(round.dealer) ? 'DEALER BLACKJACK.' : `DEALER WINS ${dScore} TO ${pScore}.`) + dbl
            : `PUSH AT ${pScore}. BET RETURNED.`
  }
  const net = session.lastNet
  const netText = net === null ? '—' : net > 0 ? `+$${net}` : net < 0 ? `-$${-net}` : '$0'

  const side = sessionOver ? (
    <GameResult
      outcome={session.bankroll >= START_BANKROLL ? 'win' : 'lose'}
      headline="SESSION OVER"
      reason={`BANKROLL $${session.bankroll} CANNOT COVER THE $${BET} BET.`}
      metrics={[
        { label: 'HANDS', value: session.hands },
        { label: 'W-L-P', value: `${session.wins}-${session.losses}-${session.pushes}` },
      ]}
      testId="bj-outcome"
    >
      <Action variant="primary" onClick={newSession} testId="bj-again" autoFocus>
        NEW SESSION
      </Action>
    </GameResult>
  ) : (
    <Panel title={playing ? 'YOUR DECISION' : 'NEXT HAND'}>
      {round?.phase === 'done' && (
        <p
          className={round.result === 'LOSE' ? 'gs-tone-red' : round.result === 'PUSH' ? '' : 'gs-tone-amber'}
          data-testid="bj-outcome"
          style={{ fontSize: 20 }}
        >
          {outcome}
        </p>
      )}
      {playing ? (
        <ActionBar label="Hand actions">
          <Action variant="primary" onClick={hit} testId="bj-hit" shortcut="H" autoFocus>
            HIT
          </Action>
          <Action onClick={stand} testId="bj-stand" shortcut="S">
            STAND
          </Action>
          <Action
            onClick={double}
            disabled={!canDouble}
            reason={round && round.player.length > 2 ? 'FIRST TWO CARDS ONLY' : `NEEDS $${BET * 2}`}
            testId="bj-double"
            shortcut="D"
          >
            DOUBLE
          </Action>
        </ActionBar>
      ) : (
        <ActionBar>
          <Action variant="primary" onClick={startHand} testId="bj-again" shortcut="N" autoFocus>
            {round ? 'DEAL NEXT HAND' : 'DEAL'} · BET ${BET}
          </Action>
        </ActionBar>
      )}
      {session.bankroll >= GOAL && <p className="gs-tone-amber">OBJECTIVE MET: ${GOAL}.</p>}
    </Panel>
  )

  return (
    <GameShell
      slug="blackjack"
      title="BLACK JACK"
      layout="table"
      objective={`TURN $${START_BANKROLL} INTO $${GOAL}. BET $${BET} A HAND.`}
      phase={playing ? 'HIT, STAND OR DOUBLE' : sessionOver ? 'SESSION OVER' : round ? 'HAND COMPLETE' : 'PLACE YOUR BET'}
      metrics={[
        { label: 'BANKROLL', value: `$${session.bankroll}`, tone: session.bankroll < START_BANKROLL ? 'red' : 'normal' },
        { label: 'LAST HAND', value: netText, tone: net && net > 0 ? 'amber' : net && net < 0 ? 'red' : 'dim' },
        { label: 'W-L-P', value: `${session.wins}-${session.losses}-${session.pushes}` },
        { label: 'BEST', value: `$${Math.max(rec.get<number>('bestBankroll', START_BANKROLL), session.bankroll)}`, tone: 'dim' },
      ]}
      help={
        <>
          <p>GET CLOSER TO 21 THAN THE DEALER WITHOUT GOING OVER. ACES COUNT 1 OR 11, FACE CARDS 10.</p>
          <ul>
            <li>DEALER HITS TO 16 AND STANDS ON ALL 17S.</li>
            <li>BLACKJACK (ACE + TEN ON THE DEAL) PAYS 3:2. PUSHES RETURN THE BET.</li>
            <li>DOUBLE ON YOUR FIRST TWO CARDS: BET TWICE, TAKE EXACTLY ONE CARD.</li>
            <li>NO SPLITTING OR INSURANCE. FRESH 52-CARD DECK EACH HAND.</li>
            <li>KEYS: H HIT · S STAND · D DOUBLE · N NEXT HAND.</li>
          </ul>
        </>
      }
      onRestart={newSession}
      inProgress={session.hands > 0 || playing}
      restartLabel="NEW SESSION"
      onExit={onExit}
      side={side}
      announce={outcome}
    >
      <div className="gs-felt">
        <CardHand
          label="DEALER"
          total={round ? (playing ? `${score([round.dealer[0]!])} SHOWING` : dScore) : undefined}
          testId="bj-dealer"
        >
          {round ? (
            round.dealer.map((c, i) => <CardTile key={i} card={c} faceDown={playing && i === 1} size="lg" />)
          ) : (
            <span className="gs-hand-reason">CARDS APPEAR WHEN YOU DEAL.</span>
          )}
        </CardHand>
        <CardHand
          label={round?.doubled ? 'YOU · DOUBLED' : 'YOU'}
          total={round ? `${pScore}${isSoft(round.player) && pScore < 21 ? ' SOFT' : ''}` : undefined}
          testId="bj-player"
        >
          {round ? round.player.map((c, i) => <CardTile key={i} card={c} size="lg" />) : null}
        </CardHand>
      </div>
    </GameShell>
  )
}

export const entry: GameEntry = { id: 'BLACK JACK', Component: BlackJack }
