// BRIDGE. A simplified but correct game of contract bridge. Four hands are
// dealt (YOU = South, plus West / North / East AI). The auction is simplified:
// you name a contract level (1-7) and a trump suit (or NO TRUMP) and the AI
// opponents pass, so you become declarer with North as dummy. Then all 13
// tricks are played with correct follow-suit and trump rules: you play South
// and the visible dummy North, the AI plays East and West. Tricks won by your
// side are counted against the contract (6 + level needed) and the hand is
// scored made or down. EXIT any time.
import { useMemo, useState } from 'react'
import type { GameEntry, GameProps } from './types'

const SUITS = ['♠', '♥', '♦', '♣'] as const
const RANKS = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A',
] as const
type Suit = (typeof SUITS)[number]
type Rank = (typeof RANKS)[number]
// Seats go clockwise. YOU sit South; North is your partner (dummy).
type Seat = 'S' | 'W' | 'N' | 'E'
const CLOCKWISE: Record<Seat, Seat> = { S: 'W', W: 'N', N: 'E', E: 'S' }

interface Card {
  readonly rank: Rank
  readonly suit: Suit
  readonly id: string
}

const rankVal = (r: Rank): number => RANKS.indexOf(r)

function freshDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS)
    for (const rank of RANKS) deck.push({ rank, suit, id: `${rank}${suit}` })
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = deck[i]!
    deck[i] = deck[j]!
    deck[j] = tmp
  }
  return deck
}

const sortHand = (h: readonly Card[]): Card[] =>
  [...h].sort((a, b) =>
    a.suit === b.suit
      ? rankVal(b.rank) - rankVal(a.rank)
      : SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit),
  )

type Trump = Suit | 'NT'

interface Play {
  readonly seat: Seat
  readonly card: Card
}

type Phase = 'bid' | 'play' | 'done'

interface State {
  hands: Record<Seat, Card[]>
  trump: Trump
  level: number
  phase: Phase
  turn: Seat
  trick: Play[]
  leadSuit: Suit | null
  nsTricks: number // your side (South + North)
  ewTricks: number
  log: string[]
}

const YOUR_SIDE: ReadonlySet<Seat> = new Set<Seat>(['S', 'N'])

function deal(): Record<Seat, Card[]> {
  const deck = freshDeck()
  const hands: Record<Seat, Card[]> = { S: [], W: [], N: [], E: [] }
  const order: Seat[] = ['S', 'W', 'N', 'E']
  for (let i = 0; i < deck.length; i++) {
    hands[order[i % 4]!]!.push(deck[i]!)
  }
  return hands
}

function fresh(): State {
  return {
    hands: deal(),
    trump: 'NT',
    level: 1,
    phase: 'bid',
    turn: 'W', // left of declarer leads the first trick once play starts
    trick: [],
    leadSuit: null,
    nsTricks: 0,
    ewTricks: 0,
    log: [],
  }
}

// Legal plays: must follow the led suit if able, otherwise anything.
function legalCards(hand: readonly Card[], lead: Suit | null): Card[] {
  if (!lead) return [...hand]
  const inSuit = hand.filter((c) => c.suit === lead)
  return inSuit.length > 0 ? inSuit : [...hand]
}

// Decide the winning play of a completed four-card trick.
function trickWinner(trick: readonly Play[], trump: Trump, lead: Suit): Play {
  let best = trick[0]!
  for (const p of trick) {
    const bestTrump = trump !== 'NT' && best.card.suit === trump
    const pTrump = trump !== 'NT' && p.card.suit === trump
    if (pTrump && !bestTrump) {
      best = p
    } else if (pTrump && bestTrump) {
      if (rankVal(p.card.rank) > rankVal(best.card.rank)) best = p
    } else if (!pTrump && !bestTrump) {
      // Only cards of the led suit can win a non-trumped trick.
      if (p.card.suit === lead && best.card.suit === lead) {
        if (rankVal(p.card.rank) > rankVal(best.card.rank)) best = p
      } else if (p.card.suit === lead && best.card.suit !== lead) {
        best = p
      }
    }
  }
  return best
}

// AI card choice for a seat: play a legal card. If leading, lead the highest of
// a long side suit; if following, win cheaply when possible else dump the
// lowest. Deliberately simple but always legal and mildly sensible.
function aiPick(hand: readonly Card[], trick: readonly Play[], lead: Suit | null, trump: Trump): Card {
  const legal = legalCards(hand, lead)
  if (trick.length === 0) {
    // Lead the highest card overall (cheap heuristic).
    return [...legal].sort((a, b) => rankVal(b.rank) - rankVal(a.rank))[0]!
  }
  const leadSuit = lead!
  // Try to win cheaply.
  const winners = legal.filter((c) => {
    const trial = [...trick, { seat: 'E' as Seat, card: c }]
    return trickWinner(trial, trump, leadSuit).card.id === c.id
  })
  if (winners.length > 0) {
    return winners.sort((a, b) => rankVal(a.rank) - rankVal(b.rank))[0]!
  }
  // Can't win: throw the lowest legal card.
  return [...legal].sort((a, b) => rankVal(a.rank) - rankVal(b.rank))[0]!
}

function CardSpan({ card }: { card: Card }) {
  const red = card.suit === '♥' || card.suit === '♦'
  return (
    <span className={red ? 'wg-red' : undefined}>
      [{card.rank}
      {card.suit}]
    </span>
  )
}

const seatName = (s: Seat): string =>
  s === 'S' ? 'YOU (S)' : s === 'N' ? 'DUMMY (N)' : s === 'W' ? 'WEST' : 'EAST'

// Apply a card from a seat, resolving a completed trick and advancing turn.
// Returns the next state. Pure, so it is usable from any handler.
function applyAndAdvance(base: State, seat: Seat, card: Card): State {
    let s: State = {
      ...base,
      hands: { ...base.hands, [seat]: base.hands[seat]!.filter((c) => c.id !== card.id) },
      trick: [...base.trick, { seat, card }],
      leadSuit: base.leadSuit ?? card.suit,
    }
    const log = [...s.log]

    if (s.trick.length === 4) {
      const winner = trickWinner(s.trick, s.trump, s.leadSuit!)
      const winnerSide = YOUR_SIDE.has(winner.seat) ? 'NS' : 'EW'
      log.push(
        `TRICK: ${s.trick.map((p) => `${p.seat}:${p.card.rank}${p.card.suit}`).join(' ')} -> ${winner.seat} WINS (${winnerSide}).`,
      )
      s = {
        ...s,
        trick: [],
        leadSuit: null,
        turn: winner.seat,
        nsTricks: s.nsTricks + (winnerSide === 'NS' ? 1 : 0),
        ewTricks: s.ewTricks + (winnerSide === 'EW' ? 1 : 0),
        log: log.slice(-8),
      }
      // Hand over?
      const total = s.nsTricks + s.ewTricks
      if (total === 13) {
        const need = 6 + s.level
        const made = s.nsTricks >= need
        const diff = s.nsTricks - need
        const result = made
          ? `CONTRACT MADE. ${s.nsTricks} TRICKS (NEEDED ${need}).${diff > 0 ? ` +${diff} OVERTRICK${diff > 1 ? 'S' : ''}.` : ''}`
          : `CONTRACT DOWN ${need - s.nsTricks}. ${s.nsTricks} TRICKS (NEEDED ${need}).`
        return { ...s, phase: 'done', log: [...s.log, result].slice(-9) }
      }
    } else {
      s = { ...s, turn: CLOCKWISE[seat], log: log.slice(-8) }
    }
    return s
}

// Advance AI (East/West) seats automatically; stop on a human seat (S or N) or
// when the hand ends. Pure.
function driveAi(start: State): State {
  let s = start
  let guard = 0
  while (s.phase === 'play' && (s.turn === 'E' || s.turn === 'W') && guard < 60) {
    guard += 1
    const hand = s.hands[s.turn]!
    const card = aiPick(hand, s.trick, s.leadSuit, s.trump)
    s = applyAndAdvance(s, s.turn, card)
  }
  return s
}

function BridgeGame({ onExit }: GameProps) {
  const [st, setSt] = useState<State>(() => fresh())

  // ---- auction ----
  // Begin play. West (left of the South declarer) leads trick one, so drive the
  // AI forward immediately until a seat you control (South or dummy North) is on
  // turn. No render-time nudge needed.
  const startPlay = (level: number, trump: Trump): void => {
    setSt((prev) => {
      const begun: State = {
        ...prev,
        level,
        trump,
        phase: 'play',
        turn: 'W',
        trick: [],
        leadSuit: null,
        nsTricks: 0,
        ewTricks: 0,
        log: [
          `CONTRACT: ${level}${trump === 'NT' ? 'NT' : trump}. YOU DECLARE, NORTH IS DUMMY.`,
          'WEST LEADS.',
        ],
      }
      return driveAi(begun)
    })
  }

  const humanPlay = (seat: Seat, card: Card): void => {
    setSt((prev) => {
      if (prev.phase !== 'play' || prev.turn !== seat) return prev
      const legal = legalCards(prev.hands[seat]!, prev.leadSuit)
      if (!legal.some((c) => c.id === card.id)) return prev
      const after = applyAndAdvance(prev, seat, card)
      return driveAi(after)
    })
  }

  const youToPlay = st.phase === 'play' && (st.turn === 'S' || st.turn === 'N')

  const youHand = useMemo(() => sortHand(st.hands.S), [st.hands.S])
  const dummyHand = useMemo(() => sortHand(st.hands.N), [st.hands.N])

  const activeSeat: Seat | null = youToPlay ? st.turn : null
  const legalNow = useMemo(() => {
    if (!activeSeat) return new Set<string>()
    return new Set(legalCards(st.hands[activeSeat]!, st.leadSuit).map((c) => c.id))
  }, [activeSeat, st.hands, st.leadSuit])

  const playAgain = (): void => setSt(fresh())

  const contractLabel = `${st.level}${st.trump === 'NT' ? 'NT' : st.trump}`
  const need = 6 + st.level

  return (
    <div className="wg-screen" data-testid="game-bridge">
      <div className="wg-out">
        <div className="wg-dim">WOPR CONTRACT BRIDGE</div>

        {st.phase === 'bid' && (
          <Auction onBid={startPlay} youHand={youHand} />
        )}

        {st.phase !== 'bid' && (
          <>
            <div className="wg-dim" style={{ marginBottom: '0.4rem' }}>
              CONTRACT {contractLabel}  NEED {need}   YOUR TRICKS {st.nsTricks} /
              OPP {st.ewTricks}
              {activeSeat ? `   PLAY FOR ${seatName(activeSeat)}` : ''}
            </div>

            {/* Dummy (North) is face up; you play it too. */}
            <HandRow
              label="DUMMY (N)"
              hand={dummyHand}
              active={activeSeat === 'N'}
              legal={activeSeat === 'N' ? legalNow : null}
              onPlay={(c) => humanPlay('N', c)}
              testPrefix="bridge-n"
            />

            <div style={{ margin: '0.5rem 0' }}>
              <span className="wg-amber">TRICK </span>
              {st.trick.length === 0 ? (
                <span className="wg-dim"> (NONE PLAYED)</span>
              ) : (
                st.trick.map((p) => (
                  <span key={p.card.id}>
                    {' '}
                    {p.seat}:<CardSpan card={p.card} />
                  </span>
                ))
              )}
            </div>

            <HandRow
              label="YOU (S)"
              hand={youHand}
              active={activeSeat === 'S'}
              legal={activeSeat === 'S' ? legalNow : null}
              onPlay={(c) => humanPlay('S', c)}
              testPrefix="bridge-s"
            />

            <div className="wg-log" style={{ marginTop: '0.5rem' }}>
              {st.log.map((l, i) => (
                <span key={i}>{l}</span>
              ))}
            </div>

            {st.phase === 'done' && (
              <div
                className={st.nsTricks >= need ? 'wg-big wg-amber' : 'wg-big wg-red'}
                style={{ marginTop: '0.4rem' }}
              >
                {st.nsTricks >= need ? 'CONTRACT MADE.' : 'CONTRACT DOWN.'}
              </div>
            )}
          </>
        )}

        <div className="wg-opts">
          {st.phase === 'done' && (
            <button
              type="button"
              className="wg-opt"
              onClick={playAgain}
              data-testid="bridge-again"
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

        {st.phase === 'play' && (
          <div className="wg-hint">
            FOLLOW SUIT IF YOU CAN. TRUMPS BEAT OTHER SUITS. WIN {need} TRICKS TO
            MAKE {contractLabel}.
          </div>
        )}
      </div>
    </div>
  )
}

function Auction({
  onBid,
  youHand,
}: {
  onBid: (level: number, trump: Trump) => void
  youHand: readonly Card[]
}) {
  const [level, setLevel] = useState(1)
  const [trump, setTrump] = useState<Trump>('NT')
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <div className="wg-dim" style={{ marginBottom: '0.4rem' }}>
        YOU DECLARE. NAME A CONTRACT; THE OPPONENTS PASS. NORTH IS YOUR DUMMY.
      </div>
      <HandRow label="YOU (S)" hand={youHand} active={false} legal={null} onPlay={() => {}} testPrefix="bridge-bid-s" />
      <div style={{ marginTop: '0.5rem', marginBottom: '0.3rem' }}>
        <span className="wg-amber">LEVEL </span>
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <button
            key={n}
            type="button"
            className={level === n ? 'wg-opt wg-amber' : 'wg-opt'}
            style={{ border: level === n ? '1px solid var(--amber)' : '1px solid transparent' }}
            onClick={() => setLevel(n)}
            data-testid={`bridge-level-${n}`}
          >
            {n}
          </button>
        ))}
      </div>
      <div style={{ marginBottom: '0.5rem' }}>
        <span className="wg-amber">TRUMP </span>
        {(['♣', '♦', '♥', '♠', 'NT'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={trump === t ? 'wg-opt wg-amber' : 'wg-opt'}
            style={{ border: trump === t ? '1px solid var(--amber)' : '1px solid transparent' }}
            onClick={() => setTrump(t)}
            data-testid={`bridge-trump-${t === 'NT' ? 'nt' : t}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="wg-opts">
        <button
          type="button"
          className="wg-opt"
          onClick={() => onBid(level, trump)}
          data-testid="bridge-confirm-bid"
          autoFocus
        >
          &gt; BID {level}
          {trump === 'NT' ? 'NT' : trump} AND PLAY (NEED {6 + level} TRICKS)
        </button>
      </div>
    </div>
  )
}

function HandRow({
  label,
  hand,
  active,
  legal,
  onPlay,
  testPrefix,
}: {
  label: string
  hand: readonly Card[]
  active: boolean
  legal: Set<string> | null
  onPlay: (c: Card) => void
  testPrefix: string
}) {
  return (
    <div style={{ marginBottom: '0.3rem' }}>
      <div className="wg-amber" style={{ marginBottom: '0.15rem' }}>
        {label}
        {active ? '  <-- YOUR PLAY' : ''}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.1rem' }}>
        {hand.map((c) => {
          const playable = active && (!legal || legal.has(c.id))
          return (
            <button
              key={c.id}
              type="button"
              className="wg-opt"
              style={{ opacity: active && legal && !legal.has(c.id) ? 0.4 : 1 }}
              disabled={!playable}
              onClick={() => onPlay(c)}
              data-testid={`${testPrefix}-${c.id}`}
            >
              <CardSpan card={c} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export const entry: GameEntry = { id: 'BRIDGE', Component: BridgeGame }
