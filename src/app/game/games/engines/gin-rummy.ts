// GIN RUMMY rules engine (pure). Meld analysis with actual meld groups, knock
// settlement with defender layoff (none against gin), turn legality (draw source,
// picked-up discard may not be returned the same turn), the opening upcard pass,
// the two-card stock stop, match scoring to 100, and the WOPR policies.
// Design: docs/games-design-review.md §3.
import { rng as makeRng } from '../hooks'

export const SUITS = ['♠', '♥', '♦', '♣'] as const
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const
export type Suit = (typeof SUITS)[number]
export type Rank = (typeof RANKS)[number]
export type Who = 'YOU' | 'WOPR'
export type Difficulty = 'beginner' | 'standard'

export interface Card {
  readonly rank: Rank
  readonly suit: Suit
  readonly id: string
}

export const KNOCK_LIMIT = 10
export const GIN_BONUS = 25
export const UNDERCUT_BONUS = 25
export const BOX_BONUS = 25
export const GAME_BONUS = 100
export const MATCH_TARGET = 100
/** The hand is void when a discard leaves this many cards (or fewer) in the stock. */
export const STOCK_STOP = 2

export const other = (w: Who): Who => (w === 'YOU' ? 'WOPR' : 'YOU')
export const rankOrder = (r: Rank): number => RANKS.indexOf(r)
export const cardValue = (r: Rank): number => Math.min(10, RANKS.indexOf(r) + 1)
export const card = (s: string): Card => {
  // "7♠", "10♥", "A♦"
  const suit = s.slice(-1) as Suit
  const rank = s.slice(0, -1) as Rank
  if (!SUITS.includes(suit) || !RANKS.includes(rank)) throw new Error(`bad card ${s}`)
  return { rank, suit, id: `${rank}${suit}` }
}
export const cards = (s: string): Card[] => s.split(/\s+/).filter(Boolean).map(card)
export const label = (c: Card): string => `${c.rank}${c.suit}`

export function shuffledDeck(seed: number): Card[] {
  const r = makeRng(seed)
  const deck: Card[] = []
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit, id: `${rank}${suit}` })
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
  }
  return deck
}

// ---------------------------------------------------------------- melds
export interface Meld {
  readonly kind: 'run' | 'set'
  readonly cards: readonly Card[]
}

const byRank = (a: Card, b: Card): number => rankOrder(a.rank) - rankOrder(b.rank)

/** Every legal meld (3+ set, or 3+ consecutive run in one suit, ace low). */
export function allMelds(hand: readonly Card[]): Meld[] {
  const melds: Meld[] = []
  for (const rank of RANKS) {
    const same = hand.filter((c) => c.rank === rank)
    if (same.length >= 3) melds.push({ kind: 'set', cards: same })
    if (same.length === 4) for (let drop = 0; drop < 4; drop++) melds.push({ kind: 'set', cards: same.filter((_, i) => i !== drop) })
  }
  for (const suit of SUITS) {
    const inSuit = hand.filter((c) => c.suit === suit).sort(byRank)
    let run: Card[] = []
    const flush = (): void => {
      for (let a = 0; a < run.length; a++) for (let b = a + 2; b < run.length; b++) melds.push({ kind: 'run', cards: run.slice(a, b + 1) })
    }
    for (const c of inSuit) {
      const last = run[run.length - 1]
      if (last && rankOrder(c.rank) === rankOrder(last.rank) + 1) run.push(c)
      else {
        flush()
        run = [c]
      }
    }
    flush()
  }
  return melds
}

export interface Analysis {
  readonly deadwood: number
  readonly melds: readonly Meld[]
  readonly dead: readonly Card[]
}

const sum = (cs: readonly Card[]): number => cs.reduce((s, c) => s + cardValue(c.rank), 0)

/** Best non-overlapping meld arrangement (minimum deadwood), with the actual groups. */
export function analyze(hand: readonly Card[]): Analysis {
  const melds = allMelds(hand)
  const total = sum(hand)
  let best: { dead: number; chosen: Meld[] } = { dead: total, chosen: [] }
  const used = new Set<string>()
  const chosen: Meld[] = []
  const search = (i: number, saved: number): void => {
    if (total - saved < best.dead) best = { dead: total - saved, chosen: [...chosen] }
    for (let j = i; j < melds.length; j++) {
      const m = melds[j]!
      if (m.cards.some((c) => used.has(c.id))) continue
      for (const c of m.cards) used.add(c.id)
      chosen.push(m)
      search(j + 1, saved + sum(m.cards))
      chosen.pop()
      for (const c of m.cards) used.delete(c.id)
    }
  }
  search(0, 0)
  const inMeld = new Set(best.chosen.flatMap((m) => m.cards.map((c) => c.id)))
  const ordered = [...best.chosen]
    .map((m) => ({ ...m, cards: [...m.cards].sort(byRank) }))
    .sort((a, b) => (a.kind === b.kind ? byRank(a.cards[0]!, b.cards[0]!) : a.kind === 'run' ? -1 : 1))
  const dead = hand.filter((c) => !inMeld.has(c.id)).sort((a, b) => byRank(a, b) || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit))
  return { deadwood: best.dead, melds: ordered, dead }
}

/** "RUN 1", "SET 1", ... in display order. */
export function meldLabels(melds: readonly Meld[]): string[] {
  let r = 0
  let s = 0
  return melds.map((m) => (m.kind === 'run' ? `RUN ${++r}` : `SET ${++s}`))
}

// ---------------------------------------------------------------- layoff
/**
 * Which of `subset` can legally be laid off onto the knocker's melds (sets take
 * the fourth card; runs extend at either end, chaining). Fixpoint attach.
 */
function canLayOffAll(subset: readonly Card[], melds: readonly Meld[]): boolean {
  const ext = melds.map((m) => ({
    kind: m.kind,
    suit: m.cards[0]!.suit,
    rank: m.cards[0]!.rank,
    lo: Math.min(...m.cards.map((c) => rankOrder(c.rank))),
    hi: Math.max(...m.cards.map((c) => rankOrder(c.rank))),
    size: m.cards.length,
  }))
  let left = [...subset]
  let progress = true
  while (left.length && progress) {
    progress = false
    for (const c of [...left]) {
      const r = rankOrder(c.rank)
      const m = ext.find((e) =>
        e.kind === 'set' ? e.rank === c.rank && e.size < 4 : e.suit === c.suit && (r === e.lo - 1 || r === e.hi + 1),
      )
      if (!m) continue
      if (m.kind === 'set') m.size++
      else if (r === m.lo - 1) m.lo = r
      else m.hi = r
      left = left.filter((x) => x.id !== c.id)
      progress = true
    }
  }
  return left.length === 0
}

export interface DefenseResult {
  readonly deadwood: number
  readonly layoffs: readonly Card[]
  readonly melds: readonly Meld[]
  readonly dead: readonly Card[]
}

/**
 * The defender's best legal arrangement against a knock: choose which cards to
 * lay off onto the knocker's melds and meld the rest, minimizing deadwood.
 * No layoff against gin.
 */
export function bestDefense(defender: readonly Card[], knockerMelds: readonly Meld[], gin: boolean): DefenseResult {
  const base = analyze(defender)
  if (gin) return { deadwood: base.deadwood, layoffs: [], melds: base.melds, dead: base.dead }
  // Only cards that could ever touch a knocker meld are candidates.
  const candidates = defender.filter((c) =>
    knockerMelds.some((m) =>
      m.kind === 'set' ? m.cards[0]!.rank === c.rank : m.cards[0]!.suit === c.suit,
    ),
  )
  let best: DefenseResult = { deadwood: base.deadwood, layoffs: [], melds: base.melds, dead: base.dead }
  const n = candidates.length
  for (let mask = 1; mask < 1 << n; mask++) {
    const subset = candidates.filter((_, i) => mask & (1 << i))
    if (!canLayOffAll(subset, knockerMelds)) continue
    const ids = new Set(subset.map((c) => c.id))
    const rest = analyze(defender.filter((c) => !ids.has(c.id)))
    if (rest.deadwood < best.deadwood || (rest.deadwood === best.deadwood && subset.length < best.layoffs.length)) {
      best = { deadwood: rest.deadwood, layoffs: subset.sort(byRank), melds: rest.melds, dead: rest.dead }
    }
  }
  return best
}

// ---------------------------------------------------------------- settlement
export type SettlementKind = 'gin' | 'knock' | 'undercut' | 'void'
export interface Settlement {
  readonly kind: SettlementKind
  readonly knocker: Who | null
  readonly winner: Who | null
  readonly points: number
  readonly knockerDead: number
  readonly defenderDeadRaw: number
  readonly defenderDead: number
  readonly layoffs: readonly Card[]
  readonly knockerMelds: readonly Meld[]
  readonly knockerDeadCards: readonly Card[]
  readonly defense: DefenseResult | null
}

/** One resolver for both human and WOPR knocks. Knocker holds exactly ten cards. */
export function settleKnock(knocker: Who, knockerHand: readonly Card[], defenderHand: readonly Card[]): Settlement {
  const k = analyze(knockerHand)
  if (k.deadwood > KNOCK_LIMIT) throw new Error('illegal knock')
  const gin = k.deadwood === 0
  const raw = analyze(defenderHand).deadwood
  const def = bestDefense(defenderHand, k.melds, gin)
  const common = {
    knocker,
    knockerDead: k.deadwood,
    defenderDeadRaw: raw,
    defenderDead: def.deadwood,
    layoffs: def.layoffs,
    knockerMelds: k.melds,
    knockerDeadCards: k.dead,
    defense: def,
  }
  if (gin) return { ...common, kind: 'gin', winner: knocker, points: def.deadwood + GIN_BONUS }
  if (def.deadwood <= k.deadwood)
    return { ...common, kind: 'undercut', winner: other(knocker), points: k.deadwood - def.deadwood + UNDERCUT_BONUS }
  return { ...common, kind: 'knock', winner: knocker, points: def.deadwood - k.deadwood }
}

const VOID: Settlement = {
  kind: 'void',
  knocker: null,
  winner: null,
  points: 0,
  knockerDead: 0,
  defenderDeadRaw: 0,
  defenderDead: 0,
  layoffs: [],
  knockerMelds: [],
  knockerDeadCards: [],
  defense: null,
}

// ---------------------------------------------------------------- hand state
export type Stage = 'upcard' | 'draw' | 'discard' | 'over'
export interface HandState {
  readonly stock: readonly Card[]
  readonly discard: readonly Card[]
  readonly hands: Readonly<Record<Who, readonly Card[]>>
  readonly dealer: Who
  readonly turn: Who
  readonly stage: Stage
  /** Players who have passed the opening upcard (0..2). */
  readonly upcardPasses: number
  /** Both passed the upcard: the non-dealer's first draw must come from stock. */
  readonly mustDrawStock: boolean
  readonly drawnFrom: 'stock' | 'discard' | null
  /** The card just taken from the discard pile; it may not be discarded this turn. */
  readonly pickedUp: string | null
  /** The card just drawn (either source). */
  readonly drawn: string | null
  readonly settlement: Settlement | null
}

export function deal(seed: number, dealer: Who): HandState {
  const deck = shuffledDeck(seed)
  const you: Card[] = []
  const wopr: Card[] = []
  const nonDealer = other(dealer)
  for (let i = 0; i < 10; i++) {
    ;(nonDealer === 'YOU' ? you : wopr).push(deck.pop()!)
    ;(dealer === 'YOU' ? you : wopr).push(deck.pop()!)
  }
  const up = deck.pop()!
  return {
    stock: deck,
    discard: [up],
    hands: { YOU: you, WOPR: wopr },
    dealer,
    turn: nonDealer,
    stage: 'upcard',
    upcardPasses: 0,
    mustDrawStock: false,
    drawnFrom: null,
    pickedUp: null,
    drawn: null,
    settlement: null,
  }
}

export const topDiscard = (s: HandState): Card | undefined => s.discard[s.discard.length - 1]

/** Pass the opening upcard. After both pass, the non-dealer must draw from stock. */
export function passUpcard(s: HandState): HandState {
  if (s.stage !== 'upcard') throw new Error('not upcard stage')
  if (s.upcardPasses === 0) return { ...s, upcardPasses: 1, turn: s.dealer }
  return { ...s, upcardPasses: 2, stage: 'draw', turn: other(s.dealer), mustDrawStock: true }
}

export function canDraw(s: HandState, source: 'stock' | 'discard'): boolean {
  if (s.stage === 'upcard') return source === 'discard'
  if (s.stage !== 'draw') return false
  if (source === 'discard') return !s.mustDrawStock && s.discard.length > 0
  return s.stock.length > 0
}

export function draw(s: HandState, source: 'stock' | 'discard'): HandState {
  if (!canDraw(s, source)) throw new Error(`cannot draw from ${source}`)
  const who = s.turn
  const stock = [...s.stock]
  const discard = [...s.discard]
  const c = source === 'stock' ? stock.pop()! : discard.pop()!
  return {
    ...s,
    stock,
    discard,
    hands: { ...s.hands, [who]: [...s.hands[who], c] },
    stage: 'discard',
    mustDrawStock: false,
    drawnFrom: source,
    pickedUp: source === 'discard' ? c.id : null,
    drawn: c.id,
  }
}

/** Why a card cannot be discarded now, or null when it can. */
export function discardBlock(s: HandState, id: string): string | null {
  if (s.stage !== 'discard') return 'DRAW FIRST'
  if (!s.hands[s.turn].some((c) => c.id === id)) return 'NOT IN HAND'
  if (s.pickedUp === id) return 'PICKED UP THIS TURN'
  return null
}

/** Deadwood after discarding `id` (the value that decides knock eligibility). */
export function deadwoodAfter(s: HandState, id: string): number {
  return analyze(s.hands[s.turn].filter((c) => c.id !== id)).deadwood
}

/**
 * Discard `id`, optionally knocking. A plain discard that leaves STOCK_STOP or
 * fewer cards in stock ends the hand void.
 */
export function discardCard(s: HandState, id: string, knock = false): HandState {
  const block = discardBlock(s, id)
  if (block) throw new Error(block)
  const who = s.turn
  const c = s.hands[who].find((x) => x.id === id)!
  const mine = s.hands[who].filter((x) => x.id !== id)
  const next: HandState = {
    ...s,
    discard: [...s.discard, c],
    hands: { ...s.hands, [who]: mine },
    drawnFrom: null,
    pickedUp: null,
    drawn: null,
  }
  if (knock) {
    if (analyze(mine).deadwood > KNOCK_LIMIT) throw new Error('illegal knock')
    return { ...next, stage: 'over', settlement: settleKnock(who, mine, s.hands[other(who)]) }
  }
  if (s.stage === 'discard' && next.stock.length <= STOCK_STOP) return { ...next, stage: 'over', settlement: VOID }
  // A take of the opening upcard by the dealer hands the first real turn to the non-dealer.
  return { ...next, stage: 'draw', turn: other(who) }
}

// ---------------------------------------------------------------- WOPR policy
/** Best discard choice for an 11-card hand: lowest resulting deadwood. */
export function bestDiscard(
  hand: readonly Card[],
  forbidden: string | null,
  difficulty: Difficulty,
): { id: string; deadwood: number } {
  let best: { id: string; deadwood: number; value: number; links: number } | null = null
  for (const c of hand) {
    if (c.id === forbidden) continue
    const rest = hand.filter((x) => x.id !== c.id)
    const d = analyze(rest).deadwood
    const v = cardValue(c.rank)
    // STANDARD breaks ties by keeping cards that connect to others (pairs or
    // same-suit neighbours), so it holds live draws instead of dumping them.
    const links = difficulty === 'standard' ? connections(c, rest) : 0
    if (
      !best ||
      d < best.deadwood ||
      (d === best.deadwood && (links < best.links || (links === best.links && v > best.value)))
    )
      best = { id: c.id, deadwood: d, value: v, links }
  }
  return { id: best!.id, deadwood: best!.deadwood }
}

function connections(c: Card, rest: readonly Card[]): number {
  return rest.filter(
    (x) => x.rank === c.rank || (x.suit === c.suit && Math.abs(rankOrder(x.rank) - rankOrder(c.rank)) <= 2),
  ).length
}

/**
 * Should WOPR take the discard top?
 * BEGINNER (the original policy): take it when the raw 11-card deadwood is lower
 * than the current 10-card deadwood.
 * STANDARD: take it when the best legal 10-card result after any allowed
 * discard (never the pickup itself) beats the current hand.
 */
export function aiWantsDiscard(hand: readonly Card[], top: Card, difficulty: Difficulty): boolean {
  const cur = analyze(hand).deadwood
  const withTop = [...hand, top]
  if (difficulty === 'beginner') return analyze(withTop).deadwood < cur
  return bestDiscard(withTop, top.id, difficulty).deadwood < cur
}

export interface AiReport {
  readonly who: Who
  readonly action: 'pass' | 'take' | 'stock'
  readonly took?: Card
  readonly discarded?: Card
  readonly knocked?: boolean
}

/** One complete WOPR decision from the current state (pass, or draw + discard). */
export function aiStep(s: HandState, difficulty: Difficulty): { state: HandState; report: AiReport } {
  const who = s.turn
  const hand = s.hands[who]
  const top = topDiscard(s)
  if (s.stage === 'upcard') {
    if (top && aiWantsDiscard(hand, top, difficulty)) {
      const drawn = draw(s, 'discard')
      return finishAi(drawn, difficulty, { who, action: 'take', took: top })
    }
    return { state: passUpcard(s), report: { who, action: 'pass' } }
  }
  if (s.stage !== 'draw') throw new Error('WOPR cannot act now')
  if (top && canDraw(s, 'discard') && aiWantsDiscard(hand, top, difficulty))
    return finishAi(draw(s, 'discard'), difficulty, { who, action: 'take', took: top })
  return finishAi(draw(s, 'stock'), difficulty, { who, action: 'stock' })
}

function finishAi(s: HandState, difficulty: Difficulty, base: AiReport): { state: HandState; report: AiReport } {
  const hand = s.hands[s.turn]
  const choice = bestDiscard(hand, s.pickedUp, difficulty)
  const discarded = hand.find((c) => c.id === choice.id)!
  // Both levels knock the moment it is legal; WOPR never sees your hand.
  const knock = choice.deadwood <= KNOCK_LIMIT
  return { state: discardCard(s, choice.id, knock), report: { ...base, discarded, knocked: knock } }
}

// ---------------------------------------------------------------- match
export interface HandRecord {
  readonly n: number
  readonly dealer: Who
  readonly settlement: Settlement
}
export interface MatchState {
  readonly scores: Readonly<Record<Who, number>>
  readonly history: readonly HandRecord[]
  /** Dealer of the next hand (alternates every hand). */
  readonly nextDealer: Who
}
export const newMatch = (): MatchState => ({ scores: { YOU: 0, WOPR: 0 }, history: [], nextDealer: 'WOPR' })

export function recordHand(m: MatchState, dealer: Who, s: Settlement): MatchState {
  const scores = { ...m.scores }
  if (s.winner) scores[s.winner] += s.points
  return { scores, history: [...m.history, { n: m.history.length + 1, dealer, settlement: s }], nextDealer: other(dealer) }
}

export interface MatchResult {
  readonly winner: Who
  readonly totals: Readonly<Record<Who, number>>
  readonly boxes: Readonly<Record<Who, number>>
}
/** Null while the match goes on; otherwise final totals with box and game bonuses. */
export function matchResult(m: MatchState): MatchResult | null {
  const { YOU, WOPR } = m.scores
  if (YOU < MATCH_TARGET && WOPR < MATCH_TARGET) return null
  const winner: Who = YOU >= WOPR ? 'YOU' : 'WOPR'
  const boxes = { YOU: 0, WOPR: 0 }
  for (const h of m.history) if (h.settlement.winner) boxes[h.settlement.winner]++
  const totals = {
    YOU: YOU + boxes.YOU * BOX_BONUS + (winner === 'YOU' ? GAME_BONUS : 0),
    WOPR: WOPR + boxes.WOPR * BOX_BONUS + (winner === 'WOPR' ? GAME_BONUS : 0),
  }
  return { winner, totals, boxes }
}

/** Short typed summary of a settlement for reports and history. */
export function describeSettlement(s: Settlement): string {
  const name = (w: Who): string => (w === 'YOU' ? 'YOU' : 'WOPR')
  switch (s.kind) {
    case 'void':
      return 'STOCK DOWN TO TWO. HAND VOID. NO SCORE.'
    case 'gin':
      return `${name(s.knocker!)} WENT GIN. ${name(s.winner!)} SCORES ${s.points} (${s.defenderDead} DEADWOOD + ${GIN_BONUS} GIN BONUS).`
    case 'undercut':
      return `UNDERCUT. ${name(s.knocker!)} KNOCKED AT ${s.knockerDead}, ${name(other(s.knocker!))} HELD ${s.defenderDead}. ${name(s.winner!)} SCORES ${s.points}.`
    case 'knock':
      return `${name(s.knocker!)} KNOCKED AT ${s.knockerDead}, ${name(other(s.knocker!))} HELD ${s.defenderDead}. ${name(s.winner!)} SCORES ${s.points}.`
  }
}
