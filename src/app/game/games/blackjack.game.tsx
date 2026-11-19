// BLACK JACK. A full round against a WOPR dealer that hits to 16 and stands on
// 17. HIT / STAND, bust / blackjack / push / win detection, a running bankroll,
// PLAY AGAIN, EXIT. Self-contained: a fresh 52-card shoe per round, a
// Math.random shuffle, hard/soft ace scoring. Bankroll settles the moment a
// round resolves (inside the action handler, never during render).
import { useState } from 'react'
import type { GameEntry, GameProps } from './types'

const SUITS = ['♠', '♥', '♦', '♣'] as const
const RANKS = [
  'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K',
] as const

interface Card {
  readonly rank: (typeof RANKS)[number]
  readonly suit: (typeof SUITS)[number]
}

function freshDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit })
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = deck[i]!
    deck[i] = deck[j]!
    deck[j] = tmp
  }
  return deck
}

// Best total at or under 21: aces count 11 unless that busts, then 1.
function score(hand: readonly Card[]): number {
  let total = 0
  let aces = 0
  for (const c of hand) {
    if (c.rank === 'A') {
      aces += 1
      total += 11
    } else if (c.rank === 'K' || c.rank === 'Q' || c.rank === 'J') {
      total += 10
    } else {
      total += Number(c.rank)
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10
    aces -= 1
  }
  return total
}

const isBlackjack = (hand: readonly Card[]): boolean =>
  hand.length === 2 && score(hand) === 21

type Phase = 'player' | 'done'
type Result = 'WIN' | 'LOSE' | 'PUSH' | 'BLACKJACK'

interface Round {
  readonly deck: Card[]
  readonly player: Card[]
  readonly dealer: Card[]
  readonly phase: Phase
  readonly result: Result | null
}

const BET = 10

function deal(): Round {
  const deck = freshDeck()
  const player = [deck.pop()!, deck.pop()!]
  const dealer = [deck.pop()!, deck.pop()!]
  const playerBJ = isBlackjack(player)
  const dealerBJ = isBlackjack(dealer)
  if (playerBJ || dealerBJ) {
    const result: Result = playerBJ && dealerBJ ? 'PUSH' : playerBJ ? 'BLACKJACK' : 'LOSE'
    return { deck, player, dealer, phase: 'done', result }
  }
  return { deck, player, dealer, phase: 'player', result: null }
}

function payout(result: Result): number {
  switch (result) {
    case 'BLACKJACK':
      return Math.floor(BET * 1.5)
    case 'WIN':
      return BET
    case 'LOSE':
      return -BET
    case 'PUSH':
      return 0
  }
}

function CardSpan({ card, hidden }: { card: Card; hidden?: boolean }) {
  if (hidden) return <span className="wg-dim">[??]</span>
  const red = card.suit === '♥' || card.suit === '♦'
  return (
    <span className={red ? 'wg-red' : undefined}>
      [{card.rank}
      {card.suit}]
    </span>
  )
}

function BlackJack({ onExit }: GameProps) {
  const [bankroll, setBankroll] = useState(100)
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [round, setRound] = useState<Round>(deal)
  // Fresh deals can resolve immediately (dealt blackjack). Settle that case on
  // mount of each new round, tracked so a re-render never double-counts.
  const [settled, setSettled] = useState<Round | null>(null)

  const applyPayout = (result: Result): void => {
    const delta = payout(result)
    setBankroll((b) => b + delta)
    if (result === 'WIN' || result === 'BLACKJACK') setWins((w) => w + 1)
    else if (result === 'LOSE') setLosses((l) => l + 1)
  }

  const finish = (r: Round): void => {
    setRound(r)
    setSettled(r)
    if (r.result) applyPayout(r.result)
  }

  // A round dealt already-resolved (blackjack / dealer blackjack): settle once.
  if (round.phase === 'done' && settled !== round && round.result) {
    const resolved = round.result
    setSettled(round)
    applyPayout(resolved)
  }

  const dealerUpOnly = round.phase === 'player'
  const pScore = score(round.player)
  const dScore = score(round.dealer)

  const hit = (): void => {
    if (round.phase !== 'player') return
    const deck = round.deck.slice()
    const player = round.player.concat(deck.pop()!)
    if (score(player) > 21) {
      finish({ ...round, deck, player, phase: 'done', result: 'LOSE' })
    } else {
      setRound({ ...round, deck, player })
    }
  }

  const stand = (): void => {
    if (round.phase !== 'player') return
    const deck = round.deck.slice()
    const dealer = round.dealer.slice()
    while (score(dealer) < 17) dealer.push(deck.pop()!)
    const d = score(dealer)
    const p = score(round.player)
    let result: Result
    if (d > 21 || p > d) result = 'WIN'
    else if (p < d) result = 'LOSE'
    else result = 'PUSH'
    finish({ ...round, deck, dealer, phase: 'done', result })
  }

  const playAgain = (): void => {
    const r = deal()
    setRound(r)
    setSettled(null)
  }

  let outcomeText = ''
  if (round.phase === 'done' && round.result) {
    switch (round.result) {
      case 'BLACKJACK':
        outcomeText = 'BLACKJACK. YOU WIN 1.5X.'
        break
      case 'WIN':
        outcomeText = dScore > 21 ? 'DEALER BUSTS. YOU WIN.' : 'YOU WIN.'
        break
      case 'LOSE':
        outcomeText = pScore > 21 ? 'YOU BUST. DEALER WINS.' : 'DEALER WINS.'
        break
      case 'PUSH':
        outcomeText = 'PUSH. BET RETURNED.'
        break
    }
  }

  return (
    <div className="wg-screen" data-testid="game-blackjack">
      <div className="wg-out">
        <div className="wg-dim">WOPR BLACK JACK TABLE</div>
        <div className="wg-dim" style={{ marginBottom: '0.6rem' }}>
          BANKROLL ${bankroll}   BET ${BET}   W {wins} / L {losses}
        </div>

        <div style={{ marginBottom: '0.4rem' }}>
          <span className="wg-amber">DEALER </span>
          {round.dealer.map((c, i) => (
            <span key={i}>
              {' '}
              <CardSpan card={c} hidden={dealerUpOnly && i === 1} />
            </span>
          ))}
          {!dealerUpOnly && <span className="wg-dim">  = {dScore}</span>}
        </div>

        <div style={{ marginBottom: '0.6rem' }}>
          <span className="wg-amber">YOU    </span>
          {round.player.map((c, i) => (
            <span key={i}>
              {' '}
              <CardSpan card={c} />
            </span>
          ))}
          <span className="wg-dim">  = {pScore}</span>
        </div>

        {round.phase === 'done' && (
          <div
            className={round.result === 'LOSE' ? 'wg-big wg-red' : 'wg-big wg-amber'}
            style={{ marginBottom: '0.4rem' }}
            data-testid="bj-outcome"
          >
            {outcomeText}
          </div>
        )}

        <div className="wg-opts">
          {round.phase === 'player' ? (
            <>
              <button
                type="button"
                className="wg-opt"
                onClick={hit}
                data-testid="bj-hit"
                autoFocus
              >
                &gt; HIT
              </button>
              <button
                type="button"
                className="wg-opt"
                onClick={stand}
                data-testid="bj-stand"
              >
                &gt; STAND
              </button>
            </>
          ) : (
            <button
              type="button"
              className="wg-opt"
              onClick={playAgain}
              data-testid="bj-again"
              autoFocus
            >
              &gt; PLAY AGAIN
            </button>
          )}
          <button
            type="button"
            className="wg-opt wg-amber"
            onClick={onExit}
            data-testid="game-exit"
          >
            &gt; EXIT
          </button>
        </div>

        <div className="wg-hint">
          DEALER HITS TO 16, STANDS ON 17. BLACKJACK PAYS 3:2.
        </div>
      </div>
    </div>
  )
}

export const entry: GameEntry = { id: 'BLACK JACK', Component: BlackJack }
