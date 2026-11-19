// POKER. Five-card draw against one WOPR opponent. Deal 5, toggle HOLD on any
// cards, DRAW replacements, the AI draws by its own heuristic, then both hands
// are revealed and ranked (high card .. straight flush) and a winner declared.
// PLAY AGAIN, EXIT. Self-contained: fresh shuffled 52-card deck per hand.
import { useState } from 'react'
import type { GameEntry, GameProps } from './types'

const SUITS = ['♠', '♥', '♦', '♣'] as const
const RANKS = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A',
] as const
// Numeric value per rank for comparison (2 = 2 .. A = 14).
const VALUE: Record<string, number> = Object.fromEntries(
  RANKS.map((r, i) => [r, i + 2]),
)

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

const CATEGORY = [
  'HIGH CARD',
  'ONE PAIR',
  'TWO PAIR',
  'THREE OF A KIND',
  'STRAIGHT',
  'FLUSH',
  'FULL HOUSE',
  'FOUR OF A KIND',
  'STRAIGHT FLUSH',
] as const

// A comparable rank: [category, ...tiebreak values high to low]. Compare
// element by element; higher wins.
interface Ranked {
  readonly cat: number
  readonly label: string
  readonly tiebreak: number[]
}

function evaluate(hand: readonly Card[]): Ranked {
  const values = hand.map((c) => VALUE[c.rank]!).sort((a, b) => b - a)
  const suits = hand.map((c) => c.suit)
  const flush = suits.every((s) => s === suits[0])

  // Count by value, then order groups by (count desc, value desc).
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  const groups = [...counts.entries()].sort((a, b) =>
    b[1] - a[1] || b[0] - a[0],
  )
  const groupVals = groups.map((g) => g[0])
  const groupSizes = groups.map((g) => g[1])

  // Straight detection, with the wheel (A-2-3-4-5) handled explicitly.
  const uniqDesc = [...new Set(values)].sort((a, b) => b - a)
  let straight = false
  let straightHigh = 0
  if (uniqDesc.length === 5) {
    if (uniqDesc[0]! - uniqDesc[4]! === 4) {
      straight = true
      straightHigh = uniqDesc[0]!
    } else if (
      uniqDesc[0] === 14 &&
      uniqDesc[1] === 5 &&
      uniqDesc[2] === 4 &&
      uniqDesc[3] === 3 &&
      uniqDesc[4] === 2
    ) {
      straight = true
      straightHigh = 5 // the five-high wheel
    }
  }

  let cat: number
  if (straight && flush) cat = 8
  else if (groupSizes[0] === 4) cat = 7
  else if (groupSizes[0] === 3 && groupSizes[1] === 2) cat = 6
  else if (flush) cat = 5
  else if (straight) cat = 4
  else if (groupSizes[0] === 3) cat = 3
  else if (groupSizes[0] === 2 && groupSizes[1] === 2) cat = 2
  else if (groupSizes[0] === 2) cat = 1
  else cat = 0

  let tiebreak: number[]
  if (cat === 8 || cat === 4) tiebreak = [straightHigh]
  else tiebreak = groupVals

  return { cat, label: CATEGORY[cat]!, tiebreak }
}

// Positive if A beats B, negative if B beats A, 0 on a true tie.
function compare(a: Ranked, b: Ranked): number {
  if (a.cat !== b.cat) return a.cat - b.cat
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const d = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

// AI discard heuristic: keep any card that is part of a pair-or-better or a
// four-flush; otherwise keep the two highest. Returns indices to HOLD.
function aiHolds(hand: readonly Card[]): Set<number> {
  const counts = new Map<string, number[]>()
  hand.forEach((c, i) => {
    const key = c.rank
    counts.set(key, [...(counts.get(key) ?? []), i])
  })
  const paired = new Set<number>()
  for (const idxs of counts.values()) if (idxs.length >= 2) idxs.forEach((i) => paired.add(i))

  if (paired.size >= 2) return paired

  // Four to a flush: hold that suit.
  const bySuit = new Map<string, number[]>()
  hand.forEach((c, i) => bySuit.set(c.suit, [...(bySuit.get(c.suit) ?? []), i]))
  for (const idxs of bySuit.values()) if (idxs.length >= 4) return new Set(idxs)

  // Otherwise keep the two highest cards.
  const order = hand
    .map((c, i) => ({ i, v: VALUE[c.rank]! }))
    .sort((a, b) => b.v - a.v)
  return new Set([order[0]!.i, order[1]!.i])
}

type Phase = 'draw' | 'showdown'

function CardSpan({ card, held }: { card: Card; held?: boolean }) {
  const red = card.suit === '♥' || card.suit === '♦'
  return (
    <span className={held ? 'wg-amber' : red ? 'wg-red' : undefined}>
      [{card.rank}
      {card.suit}]
    </span>
  )
}

interface HandState {
  readonly deck: Card[]
  readonly you: Card[]
  readonly ai: Card[]
}

function newHand(): HandState {
  const deck = freshDeck()
  const you = [deck.pop()!, deck.pop()!, deck.pop()!, deck.pop()!, deck.pop()!]
  const ai = [deck.pop()!, deck.pop()!, deck.pop()!, deck.pop()!, deck.pop()!]
  return { deck, you, ai }
}

function Poker({ onExit }: GameProps) {
  const [state, setState] = useState<HandState>(newHand)
  const [held, setHeld] = useState<Set<number>>(new Set())
  const [phase, setPhase] = useState<Phase>('draw')
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [ties, setTies] = useState(0)

  const toggleHold = (i: number): void => {
    if (phase !== 'draw') return
    setHeld((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const draw = (): void => {
    if (phase !== 'draw') return
    const deck = state.deck.slice()
    // Your draw: replace unheld cards.
    const you = state.you.map((c, i) => (held.has(i) ? c : deck.pop()!))
    // AI draw: keep its heuristic holds, replace the rest.
    const keep = aiHolds(state.ai)
    const ai = state.ai.map((c, i) => (keep.has(i) ? c : deck.pop()!))

    const result = compare(evaluate(you), evaluate(ai))
    if (result > 0) setWins((w) => w + 1)
    else if (result < 0) setLosses((l) => l + 1)
    else setTies((t) => t + 1)

    setState({ deck, you, ai })
    setPhase('showdown')
  }

  const playAgain = (): void => {
    setState(newHand())
    setHeld(new Set())
    setPhase('draw')
  }

  const youRank = evaluate(state.you)
  const aiRank = evaluate(state.ai)
  const result = phase === 'showdown' ? compare(youRank, aiRank) : 0
  const outcome =
    result > 0 ? 'YOU WIN.' : result < 0 ? 'WOPR WINS.' : 'SPLIT POT. TIE.'

  return (
    <div className="wg-screen" data-testid="game-poker">
      <div className="wg-out">
        <div className="wg-dim">WOPR FIVE CARD DRAW</div>
        <div className="wg-dim" style={{ marginBottom: '0.6rem' }}>
          W {wins} / L {losses} / T {ties}
        </div>

        <div style={{ marginBottom: '0.4rem' }}>
          <span className="wg-amber">WOPR   </span>
          {state.ai.map((c, i) =>
            phase === 'showdown' ? (
              <span key={i}>
                {' '}
                <CardSpan card={c} />
              </span>
            ) : (
              <span key={i} className="wg-dim">
                {' '}
                [??]
              </span>
            ),
          )}
          {phase === 'showdown' && <span className="wg-dim">  {aiRank.label}</span>}
        </div>

        <div style={{ marginBottom: '0.6rem' }}>
          <span className="wg-amber">YOU    </span>
          {state.you.map((c, i) => (
            <button
              key={i}
              type="button"
              className="wg-opt"
              style={{ display: 'inline-block' }}
              onClick={() => toggleHold(i)}
              data-testid={`poker-card-${i}`}
              disabled={phase !== 'draw'}
            >
              <CardSpan card={c} held={held.has(i)} />
              {phase === 'draw' && held.has(i) ? '*' : ''}
            </button>
          ))}
          {phase === 'showdown' && <span className="wg-dim">  {youRank.label}</span>}
        </div>

        {phase === 'showdown' && (
          <div
            className={result < 0 ? 'wg-big wg-red' : 'wg-big wg-amber'}
            style={{ marginBottom: '0.4rem' }}
            data-testid="poker-outcome"
          >
            {outcome}
          </div>
        )}

        <div className="wg-opts">
          {phase === 'draw' ? (
            <button
              type="button"
              className="wg-opt"
              onClick={draw}
              data-testid="poker-draw"
              autoFocus
            >
              &gt; DRAW ({5 - held.size} CARDS)
            </button>
          ) : (
            <button
              type="button"
              className="wg-opt"
              onClick={playAgain}
              data-testid="poker-again"
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
          {phase === 'draw'
            ? 'CLICK CARDS TO HOLD (MARKED *), THEN DRAW.'
            : 'HAND SETTLED. PLAY AGAIN OR EXIT.'}
        </div>
      </div>
    </div>
  )
}

export const entry: GameEntry = { id: 'POKER', Component: Poker }
