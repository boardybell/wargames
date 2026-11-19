// HEARTS. A playable four-hand game: you plus three WOPR opponents. Pass three
// cards left, then play thirteen tricks following suit. Hearts score one point
// each, the queen of spades scores thirteen. Shooting the moon (all 26) sends
// 26 to everyone else. Running totals accumulate over a short match; the game
// ends when any player reaches the target and the LOW score wins. PLAY AGAIN,
// EXIT. Self-contained: fresh shuffled deck per hand, simple AI play.
import { useMemo, useState } from 'react'
import type { GameEntry, GameProps } from './types'

const SUITS = ['♣', '♦', '♠', '♥'] as const
const RANKS = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A',
] as const
const VALUE: Record<string, number> = Object.fromEntries(
  RANKS.map((r, i) => [r, i + 2]),
)

interface Card {
  readonly rank: (typeof RANKS)[number]
  readonly suit: (typeof SUITS)[number]
}

const cardId = (c: Card): string => `${c.rank}${c.suit}`
const isHeart = (c: Card): boolean => c.suit === '♥'
const isQueenSpades = (c: Card): boolean => c.rank === 'Q' && c.suit === '♠'
const points = (c: Card): number => (isQueenSpades(c) ? 13 : isHeart(c) ? 1 : 0)

function freshDeal(): Card[][] {
  const deck: Card[] = []
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit })
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = deck[i]!
    deck[i] = deck[j]!
    deck[j] = tmp
  }
  const hands: Card[][] = [[], [], [], []]
  deck.forEach((c, i) => hands[i % 4]!.push(c))
  for (const h of hands) sortHand(h)
  return hands
}

function sortHand(hand: Card[]): void {
  const suitOrder: Record<string, number> = { '♣': 0, '♦': 1, '♠': 2, '♥': 3 }
  hand.sort((a, b) => suitOrder[a.suit]! - suitOrder[b.suit]! || VALUE[a.rank]! - VALUE[b.rank]!)
}

const PLAYERS = ['YOU', 'WOPR-1', 'WOPR-2', 'WOPR-3'] as const
const TARGET = 50

interface Trick {
  readonly leader: number
  readonly cards: { player: number; card: Card }[]
}

type Phase = 'pass' | 'play' | 'handover' | 'matchover'

interface GameState {
  hands: Card[][]
  totals: number[]
  roundPoints: number[]
  phase: Phase
  heartsBroken: boolean
  current: number // whose turn to play
  trick: Trick
  tricksPlayed: number
  lastTrickWinner: number | null
  message: string
}

// Legal plays for a given hand against the current trick.
function legalPlays(
  hand: readonly Card[],
  trick: Trick,
  heartsBroken: boolean,
  tricksPlayed: number,
): Card[] {
  const leading = trick.cards.length === 0
  if (leading) {
    // First trick of the hand: must lead the two of clubs.
    if (tricksPlayed === 0) {
      const twoC = hand.find((c) => c.rank === '2' && c.suit === '♣')
      if (twoC) return [twoC]
    }
    if (!heartsBroken) {
      const nonHearts = hand.filter((c) => !isHeart(c))
      // Can only lead a heart if that is all you hold.
      if (nonHearts.length > 0) return nonHearts
    }
    return hand.slice()
  }
  const ledSuit = trick.cards[0]!.card.suit
  const following = hand.filter((c) => c.suit === ledSuit)
  if (following.length > 0) return following
  // Void in the led suit: on the first trick you may not dump points.
  if (tricksPlayed === 0) {
    const safe = hand.filter((c) => points(c) === 0)
    if (safe.length > 0) return safe
  }
  return hand.slice()
}

// AI play: follow suit low when possible, duck the queen, avoid taking points.
function aiChoose(
  hand: readonly Card[],
  trick: Trick,
  heartsBroken: boolean,
  tricksPlayed: number,
): Card {
  const legal = legalPlays(hand, trick, heartsBroken, tricksPlayed)
  if (legal.length === 1) return legal[0]!
  if (trick.cards.length === 0) {
    // Leading: play a low non-point card.
    const sorted = [...legal].sort((a, b) => VALUE[a.rank]! - VALUE[b.rank]!)
    return sorted[0]!
  }
  const ledSuit = trick.cards[0]!.card.suit
  const highestInTrick = Math.max(
    ...trick.cards.filter((p) => p.card.suit === ledSuit).map((p) => VALUE[p.card.rank]!),
  )
  const following = legal.filter((c) => c.suit === ledSuit)
  if (following.length > 0) {
    // Try to stay under the current high card; else play lowest.
    const under = following
      .filter((c) => VALUE[c.rank]! < highestInTrick)
      .sort((a, b) => VALUE[b.rank]! - VALUE[a.rank]!)
    if (under.length > 0) return under[0]!
    return [...following].sort((a, b) => VALUE[a.rank]! - VALUE[b.rank]!)[0]!
  }
  // Void: dump the queen of spades, then high hearts, then high cards.
  const queen = legal.find(isQueenSpades)
  if (queen) return queen
  const byDanger = [...legal].sort(
    (a, b) => points(b) - points(a) || VALUE[b.rank]! - VALUE[a.rank]!,
  )
  return byDanger[0]!
}

function trickWinner(trick: Trick): number {
  const ledSuit = trick.cards[0]!.card.suit
  let best = trick.cards[0]!
  for (const p of trick.cards) {
    if (p.card.suit === ledSuit && VALUE[p.card.rank]! > VALUE[best.card.rank]!) best = p
  }
  return best.player
}

function startHand(totals: number[]): GameState {
  const hands = freshDeal()
  // Each player passes three cards to the left. Human passes interactively; the
  // AI passes are computed when the human confirms. Find who holds 2 of clubs
  // after passing to set the leader, done later.
  return {
    hands,
    totals,
    roundPoints: [0, 0, 0, 0],
    phase: 'pass',
    heartsBroken: false,
    current: 0,
    trick: { leader: 0, cards: [] },
    tricksPlayed: 0,
    lastTrickWinner: null,
    message: 'PASS THREE CARDS LEFT.',
  }
}

// AI chooses three cards to pass: its three highest cards, queen of spades first.
function aiPassChoice(hand: readonly Card[]): Card[] {
  const ranked = [...hand].sort(
    (a, b) =>
      (isQueenSpades(b) ? 100 : points(b) * 10 + VALUE[b.rank]!) -
      (isQueenSpades(a) ? 100 : points(a) * 10 + VALUE[a.rank]!),
  )
  return ranked.slice(0, 3)
}

function Hearts({ onExit }: GameProps) {
  const [state, setState] = useState<GameState>(() => startHand([0, 0, 0, 0]))
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const myHand = state.hands[0]!

  const toggleSelect = (c: Card): void => {
    if (state.phase !== 'pass') return
    const id = cardId(c)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < 3) next.add(id)
      return next
    })
  }

  const confirmPass = (): void => {
    if (state.phase !== 'pass' || selected.size !== 3) return
    const hands = state.hands.map((h) => h.slice())
    // Each player passes to the player on their left (i -> i+1).
    const outgoing: Card[][] = [[], [], [], []]
    outgoing[0] = myHand.filter((c) => selected.has(cardId(c)))
    for (let p = 1; p < 4; p++) outgoing[p] = aiPassChoice(hands[p]!)
    for (let p = 0; p < 4; p++) {
      const pass = outgoing[p]!
      const ids = new Set(pass.map(cardId))
      hands[p] = hands[p]!.filter((c) => !ids.has(cardId(c)))
    }
    for (let p = 0; p < 4; p++) {
      const to = (p + 1) % 4
      hands[to] = hands[to]!.concat(outgoing[p]!)
    }
    for (const h of hands) sortHand(h)

    // The holder of the two of clubs leads the first trick.
    let leader = 0
    for (let p = 0; p < 4; p++) {
      if (hands[p]!.some((c) => c.rank === '2' && c.suit === '♣')) {
        leader = p
        break
      }
    }
    const next: GameState = {
      ...state,
      hands,
      phase: 'play',
      current: leader,
      trick: { leader, cards: [] },
      message: 'TWO OF CLUBS LEADS.',
    }
    setSelected(new Set())
    // If AI leads, advance.
    if (leader !== 0) setState(advanceAI(next))
    else setState(next)
  }

  // Resolve a completed trick: award points, set the next leader, detect hand end.
  const resolveTrick = (s: GameState): GameState => {
    const winner = trickWinner(s.trick)
    const pts = s.trick.cards.reduce((n, p) => n + points(p.card), 0)
    const roundPoints = s.roundPoints.slice()
    roundPoints[winner] = roundPoints[winner]! + pts
    const tricksPlayed = s.tricksPlayed + 1
    const broke = s.heartsBroken || s.trick.cards.some((p) => isHeart(p.card))

    if (tricksPlayed === 13) {
      // Apply scoring with shoot-the-moon.
      const shooter = roundPoints.findIndex((p) => p === 26)
      const finalRound = roundPoints.slice()
      if (shooter >= 0) {
        for (let p = 0; p < 4; p++) finalRound[p] = p === shooter ? 0 : 26
      }
      const totals = s.totals.map((t, p) => t + finalRound[p]!)
      const over = totals.some((t) => t >= TARGET)
      return {
        ...s,
        roundPoints: finalRound,
        totals,
        tricksPlayed,
        heartsBroken: broke,
        phase: over ? 'matchover' : 'handover',
        trick: { leader: winner, cards: [] },
        lastTrickWinner: winner,
        message:
          shooter >= 0
            ? `${PLAYERS[shooter]} SHOT THE MOON.`
            : 'HAND COMPLETE.',
      }
    }
    return {
      ...s,
      roundPoints,
      tricksPlayed,
      heartsBroken: broke,
      current: winner,
      trick: { leader: winner, cards: [] },
      lastTrickWinner: winner,
      message: `${PLAYERS[winner]} TAKES THE TRICK (${pts} PT).`,
    }
  }

  // Have AI players act until it is the human's turn or the trick resolves.
  const advanceAI = (start: GameState): GameState => {
    let s = start
    // Loop guard: at most 4 plays per trick cycle.
    for (let guard = 0; guard < 8; guard++) {
      if (s.phase !== 'play') return s
      if (s.current === 0 && s.trick.cards.length < 4) return s // human to act
      if (s.trick.cards.length === 4) {
        s = resolveTrick(s)
        continue
      }
      // AI play.
      const hand = s.hands[s.current]!
      const card = aiChoose(hand, s.trick, s.heartsBroken, s.tricksPlayed)
      s = playCardInto(s, s.current, card)
      if (s.trick.cards.length === 4) {
        s = resolveTrick(s)
      } else {
        s = { ...s, current: (s.current + 1) % 4 }
      }
    }
    return s
  }

  const playCardInto = (s: GameState, player: number, card: Card): GameState => {
    const hands = s.hands.map((h, i) =>
      i === player ? h.filter((c) => cardId(c) !== cardId(card)) : h,
    )
    const broke = s.heartsBroken || isHeart(card)
    return {
      ...s,
      hands,
      heartsBroken: broke,
      trick: { ...s.trick, cards: [...s.trick.cards, { player, card }] },
    }
  }

  const playMyCard = (card: Card): void => {
    if (state.phase !== 'play' || state.current !== 0) return
    const legal = legalPlays(myHand, state.trick, state.heartsBroken, state.tricksPlayed)
    if (!legal.some((c) => cardId(c) === cardId(card))) return
    let s = playCardInto(state, 0, card)
    if (s.trick.cards.length === 4) {
      s = resolveTrick(s)
      if (s.phase === 'play' && s.current !== 0) s = advanceAI(s)
    } else {
      s = { ...s, current: 1 }
      s = advanceAI(s)
    }
    setState(s)
  }

  const nextHand = (): void => {
    setState(startHand(state.totals))
    setSelected(new Set())
  }

  const newMatch = (): void => {
    setState(startHand([0, 0, 0, 0]))
    setSelected(new Set())
  }

  const legalNow = useMemo(() => {
    if (state.phase !== 'play' || state.current !== 0) return new Set<string>()
    return new Set(
      legalPlays(myHand, state.trick, state.heartsBroken, state.tricksPlayed).map(cardId),
    )
  }, [state, myHand])

  const winnerIdx =
    state.phase === 'matchover'
      ? state.totals.indexOf(Math.min(...state.totals))
      : -1

  const red = (c: Card): boolean => c.suit === '♥' || c.suit === '♦'

  return (
    <div className="wg-screen" data-testid="game-hearts">
      <div className="wg-out">
        <div className="wg-dim">WOPR HEARTS   TARGET {TARGET}, LOW SCORE WINS</div>
        <div style={{ marginBottom: '0.4rem' }}>
          {PLAYERS.map((p, i) => (
            <span key={p} className={i === 0 ? 'wg-amber' : 'wg-dim'}>
              {p} {state.totals[i]}
              {i < 3 ? '   ' : ''}
            </span>
          ))}
        </div>
        <div className="wg-dim" style={{ marginBottom: '0.5rem' }}>
          HAND POINTS: {state.roundPoints.map((p, i) => `${PLAYERS[i]} ${p}`).join('  ')}
        </div>

        {/* The current trick on the table. */}
        {state.phase === 'play' && (
          <div style={{ marginBottom: '0.5rem' }}>
            <span className="wg-amber">TRICK: </span>
            {state.trick.cards.length === 0 ? (
              <span className="wg-dim">(EMPTY)</span>
            ) : (
              state.trick.cards.map((p, i) => (
                <span key={i}>
                  {' '}
                  <span className="wg-dim">{PLAYERS[p.player]}:</span>
                  <span className={red(p.card) ? 'wg-red' : undefined}>
                    [{p.card.rank}
                    {p.card.suit}]
                  </span>
                </span>
              ))
            )}
          </div>
        )}

        <div className={state.message.includes('SHOT') ? 'wg-amber' : 'wg-dim'} style={{ marginBottom: '0.5rem' }}>
          {state.message}
          {state.phase === 'play' && state.current === 0 && state.trick.cards.length < 4
            ? ' YOUR PLAY.'
            : ''}
        </div>

        {state.phase === 'matchover' && (
          <div
            className={winnerIdx === 0 ? 'wg-big wg-amber' : 'wg-big wg-red'}
            style={{ marginBottom: '0.4rem' }}
            data-testid="hearts-outcome"
          >
            {winnerIdx === 0 ? 'YOU WIN THE MATCH.' : `${PLAYERS[winnerIdx]} WINS THE MATCH.`}
          </div>
        )}

        {/* Your hand. In pass phase, click to select 3. In play, click a legal card. */}
        {(state.phase === 'pass' || state.phase === 'play') && (
          <div style={{ marginBottom: '0.4rem' }}>
            <div className="wg-amber">YOUR HAND</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.1rem' }}>
              {myHand.map((c) => {
                const id = cardId(c)
                const isSel = selected.has(id)
                const playable =
                  state.phase === 'pass' ? true : legalNow.has(id)
                return (
                  <button
                    key={id}
                    type="button"
                    className="wg-opt"
                    onClick={() =>
                      state.phase === 'pass' ? toggleSelect(c) : playMyCard(c)
                    }
                    disabled={state.phase === 'play' && !playable}
                    data-testid={`hearts-card-${id}`}
                    style={{ opacity: state.phase === 'play' && !playable ? 0.4 : 1 }}
                  >
                    <span className={isSel ? 'wg-amber' : red(c) ? 'wg-red' : undefined}>
                      [{c.rank}
                      {c.suit}]
                      {isSel ? '*' : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="wg-opts">
          {state.phase === 'pass' && (
            <button
              type="button"
              className="wg-opt"
              onClick={confirmPass}
              disabled={selected.size !== 3}
              data-testid="hearts-pass"
              autoFocus
            >
              &gt; PASS {selected.size}/3 CARDS LEFT
            </button>
          )}
          {state.phase === 'handover' && (
            <button
              type="button"
              className="wg-opt"
              onClick={nextHand}
              data-testid="hearts-next"
              autoFocus
            >
              &gt; NEXT HAND
            </button>
          )}
          {state.phase === 'matchover' && (
            <button
              type="button"
              className="wg-opt"
              onClick={newMatch}
              data-testid="hearts-again"
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
          HEARTS = 1 PT, QUEEN OF SPADES = 13. FOLLOW SUIT. LOW SCORE WINS.
        </div>
      </div>
    </div>
  )
}

export const entry: GameEntry = { id: 'HEARTS', Component: Hearts }
