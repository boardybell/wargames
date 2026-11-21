// POKER (five-card draw) rules engine (pure): hand ranking, WOPR hold policy
// that preserves made hands, showdown explanation with the decisive rank, and
// the QUICK DRAW stake (ante, one capped bet/check, call/fold after the draw).
// Design: docs/games-design-review.md §8.
import { rng as makeRng } from '../hooks'

export const SUITS = ['♠', '♥', '♦', '♣'] as const
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const
export type Suit = (typeof SUITS)[number]
export type Rank = (typeof RANKS)[number]
export interface Card {
  readonly rank: Rank
  readonly suit: Suit
}
export const VALUE: Record<string, number> = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]))

export const card = (s: string): Card => {
  const suit = s.slice(-1) as Suit
  const rank = s.slice(0, -1) as Rank
  if (!SUITS.includes(suit) || !RANKS.includes(rank)) throw new Error(`bad card ${s}`)
  return { rank, suit }
}
export const cards = (s: string): Card[] => s.split(/\s+/).filter(Boolean).map(card)

export function shuffledDeck(seed: number): Card[] {
  const r = makeRng(seed)
  const deck: Card[] = []
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit })
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
  }
  return deck
}

export const CATEGORY = [
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

export interface Ranked {
  readonly cat: number
  readonly label: string
  /** Comparison values, high to low; for straights only the high card. */
  readonly tiebreak: readonly number[]
}

export function evaluate(hand: readonly Card[]): Ranked {
  const values = hand.map((c) => VALUE[c.rank]!).sort((a, b) => b - a)
  const flush = hand.every((c) => c.suit === hand[0]!.suit)
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const sizes = groups.map((g) => g[1])
  const uniq = [...new Set(values)]
  let straightHigh = 0
  if (uniq.length === 5) {
    if (uniq[0]! - uniq[4]! === 4) straightHigh = uniq[0]!
    else if (uniq.join() === '14,5,4,3,2') straightHigh = 5
  }
  const straight = straightHigh > 0
  let cat: number
  if (straight && flush) cat = 8
  else if (sizes[0] === 4) cat = 7
  else if (sizes[0] === 3 && sizes[1] === 2) cat = 6
  else if (flush) cat = 5
  else if (straight) cat = 4
  else if (sizes[0] === 3) cat = 3
  else if (sizes[0] === 2 && sizes[1] === 2) cat = 2
  else if (sizes[0] === 2) cat = 1
  else cat = 0
  const tiebreak = straight ? [straightHigh] : groups.map((g) => g[0])
  return { cat, label: CATEGORY[cat]!, tiebreak }
}

/** Positive if A beats B, negative if B beats A, 0 on a true tie. */
export function compare(a: Ranked, b: Ranked): number {
  if (a.cat !== b.cat) return a.cat - b.cat
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const d = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

// ---------------------------------------------------------------- naming
const NAME: Record<number, string> = {
  2: 'TWO', 3: 'THREE', 4: 'FOUR', 5: 'FIVE', 6: 'SIX', 7: 'SEVEN', 8: 'EIGHT',
  9: 'NINE', 10: 'TEN', 11: 'JACK', 12: 'QUEEN', 13: 'KING', 14: 'ACE',
}
const PLURAL: Record<number, string> = {
  2: 'TWOS', 3: 'THREES', 4: 'FOURS', 5: 'FIVES', 6: 'SIXES', 7: 'SEVENS', 8: 'EIGHTS',
  9: 'NINES', 10: 'TENS', 11: 'JACKS', 12: 'QUEENS', 13: 'KINGS', 14: 'ACES',
}
export const rankName = (v: number): string => NAME[v] ?? String(v)

/** Full name of a hand, e.g. PAIR OF FIVES, FULL HOUSE, SEVENS OVER FIVES. */
export function handName(r: Ranked): string {
  const t = r.tiebreak
  switch (r.cat) {
    case 8:
      return t[0] === 14 ? 'ROYAL FLUSH' : `STRAIGHT FLUSH, ${rankName(t[0]!)} HIGH`
    case 7:
      return `FOUR ${PLURAL[t[0]!]}`
    case 6:
      return `FULL HOUSE, ${PLURAL[t[0]!]} OVER ${PLURAL[t[1]!]}`
    case 5:
      return `FLUSH, ${rankName(t[0]!)} HIGH`
    case 4:
      return `STRAIGHT, ${rankName(t[0]!)} HIGH`
    case 3:
      return `THREE ${PLURAL[t[0]!]}`
    case 2:
      return `TWO PAIR, ${PLURAL[t[0]!]} AND ${PLURAL[t[1]!]}`
    case 1:
      return `PAIR OF ${PLURAL[t[0]!]}`
    default:
      return `${rankName(t[0]!)} HIGH`
  }
}

export interface Showdown {
  /** Positive: player wins; negative: WOPR wins; 0: tie. */
  readonly result: number
  readonly you: Ranked
  readonly wopr: Ranked
  /** The decisive rank, e.g. PAIR OF FIVES. ACE KICKER WINS. */
  readonly decisive: string
}

/** Explain why one hand beats another (or that they tie). */
export function explain(a: Ranked, b: Ranked): string {
  const res = compare(a, b)
  if (res === 0) return `IDENTICAL RANKS: ${handName(a)}.`
  const [w, l] = res > 0 ? [a, b] : [b, a]
  if (w.cat !== l.cat) return `${w.label} BEATS ${l.label}.`
  let i = 0
  while (w.tiebreak[i] === l.tiebreak[i]) i++
  const v = w.tiebreak[i]!
  if (i === 0) return `${handName(w)} BEATS ${handName(l)}.`
  // Same primary rank: name the shared part, then the deciding card.
  if (w.cat === 2 && i === 1) return `BOTH ${PLURAL[w.tiebreak[0]!]} UP. ${PLURAL[v]} SECOND PAIR WINS.`
  const shared =
    w.cat === 1
      ? `PAIR OF ${PLURAL[w.tiebreak[0]!]}`
      : w.cat === 2
        ? `TWO PAIR, ${PLURAL[w.tiebreak[0]!]} AND ${PLURAL[w.tiebreak[1]!]}`
        : w.cat === 3
          ? `THREE ${PLURAL[w.tiebreak[0]!]}`
          : w.cat === 5
            ? `FLUSH, ${rankName(w.tiebreak[0]!)} HIGH`
            : `${rankName(w.tiebreak[0]!)} HIGH`
  return `${shared}. ${rankName(v)} KICKER WINS.`
}

export function showdown(you: readonly Card[], wopr: readonly Card[]): Showdown {
  const a = evaluate(you)
  const b = evaluate(wopr)
  return { result: compare(a, b), you: a, wopr: b, decisive: explain(a, b) }
}

// ---------------------------------------------------------------- WOPR holds
/**
 * Indices WOPR holds. Evaluates the hand first: a straight, flush, full house,
 * quads or straight flush is kept whole. Then trips / two pair / pair are kept.
 * With nothing paired it keeps a four-card flush, then four to a straight (ace high
 * or low), otherwise its two highest cards.
 */
export function aiHolds(hand: readonly Card[]): Set<number> {
  const r = evaluate(hand)
  if (r.cat >= 4) return new Set(hand.map((_, i) => i))
  const byRank = new Map<number, number[]>()
  hand.forEach((c, i) => byRank.set(VALUE[c.rank]!, [...(byRank.get(VALUE[c.rank]!) ?? []), i]))
  const paired = [...byRank.values()].filter((ix) => ix.length >= 2).flat()
  if (paired.length) return new Set(paired)
  const bySuit = new Map<string, number[]>()
  hand.forEach((c, i) => bySuit.set(c.suit, [...(bySuit.get(c.suit) ?? []), i]))
  for (const ix of bySuit.values()) if (ix.length >= 4) return new Set(ix)
  const draw = fourStraight(hand)
  if (draw) return draw
  const order = hand.map((c, i) => ({ i, v: VALUE[c.rank]! })).sort((a, b) => b.v - a.v)
  return new Set([order[0]!.i, order[1]!.i])
}

/** Four consecutive distinct ranks (ace may play low), if present. */
function fourStraight(hand: readonly Card[]): Set<number> | null {
  for (let hi = 14; hi >= 4; hi--) {
    const want = [hi, hi - 1, hi - 2, hi - 3].map((v) => (v === 1 ? 14 : v))
    const idx: number[] = []
    for (const v of want) {
      const i = hand.findIndex((c, j) => VALUE[c.rank] === v && !idx.includes(j))
      if (i < 0) break
      idx.push(i)
    }
    if (idx.length === 4) return new Set(idx)
  }
  return null
}

// ---------------------------------------------------------------- QUICK DRAW
export const START_BANKROLL = 100
export const ANTE = 5
export const BET = 10
export const GOAL = 200
/** A hand is dealt only when the bankroll covers the ante plus one bet. */
export const FLOOR = ANTE + BET
export const canAfford = (bankroll: number): boolean => bankroll >= FLOOR

/** Strength 0..1 of a made five-card hand for betting decisions. */
export function strength(r: Ranked): number {
  if (r.cat >= 3) return 0.85 + r.cat * 0.015
  if (r.cat === 2) return 0.7
  if (r.cat === 1) return 0.3 + (r.tiebreak[0]! - 2) * 0.03 // pair of twos .3 .. aces .66
  return 0.05 + (r.tiebreak[0]! - 7) * 0.02
}

/**
 * WOPR's post-draw betting, using only its own hand and how many cards you
 * replaced (the public information). `roll` is a 0..1 random draw for the
 * occasional bluff or light call, so the policy is not fully readable.
 */
export function aiBetAfterCheck(wopr: Ranked, youDrew: number, roll: number): 'bet' | 'check' {
  const s = strength(wopr)
  const youPat = youDrew === 0
  if (s >= (youPat ? 0.85 : 0.55)) return 'bet'
  if (s < 0.2 && roll < 0.12) return 'bet' // bluff
  return 'check'
}
export function aiCallBet(wopr: Ranked, youDrew: number, roll: number): 'call' | 'fold' {
  const s = strength(wopr)
  const need = youDrew === 0 ? 0.7 : youDrew >= 3 ? 0.3 : 0.45
  if (s >= need) return 'call'
  return roll < 0.15 ? 'call' : 'fold'
}

export type Winner = 'you' | 'wopr' | 'tie'
export type EndReason = 'showdown' | 'you-folded' | 'wopr-folded'

/** Net bankroll change for the player at the end of a QUICK DRAW hand. */
export function settlePot(pot: number, youIn: number, winner: Winner): number {
  if (winner === 'you') return pot - youIn
  if (winner === 'wopr') return -youIn
  return pot / 2 - youIn
}
