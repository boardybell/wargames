// HEARTS rules and opponent policy (pure). Design: docs/games-design-review.md §4.
// Players are indices 0..3 clockwise: 0 = YOU (south), 1 = WOPR-1 (west, your
// left), 2 = WOPR-2 (north, across), 3 = WOPR-3 (east, your right).
//
// The AI functions see only what a seated player could know: their own hand,
// the cards on the table, every card already played, publicly exposed voids,
// the points each player has taken this hand, and the cards they passed. They
// never receive another player's hand.

export const SUITS = ['♣', '♦', '♠', '♥'] as const
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const
export type Suit = (typeof SUITS)[number]
export type Rank = (typeof RANKS)[number]
export interface Card {
  readonly rank: Rank
  readonly suit: Suit
}
export const VALUE: Record<Rank, number> = Object.fromEntries(RANKS.map((r, i) => [r, i + 2])) as Record<Rank, number>

export const cardId = (c: Card): string => `${c.rank}${c.suit}`
export const card = (id: string): Card => ({ rank: id.slice(0, -1) as Rank, suit: id.slice(-1) as Suit })
export const isHeart = (c: Card): boolean => c.suit === '♥'
export const isQueenSpades = (c: Card): boolean => c.rank === 'Q' && c.suit === '♠'
export const points = (c: Card): number => (isQueenSpades(c) ? 13 : isHeart(c) ? 1 : 0)
export const PLAYER_NAMES = ['YOU', 'WOPR-1', 'WOPR-2', 'WOPR-3'] as const

const SUIT_ORDER: Record<Suit, number> = { '♣': 0, '♦': 1, '♠': 2, '♥': 3 }
export function sortHand(hand: readonly Card[]): Card[] {
  return [...hand].sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || VALUE[a.rank] - VALUE[b.rank])
}

/** Small seeded RNG (mulberry32), local so the engine stays dependency-free. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function deal(seed: number): Card[][] {
  const r = seeded(seed)
  const deck: Card[] = []
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit })
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
  }
  const hands: Card[][] = [[], [], [], []]
  deck.forEach((c, i) => hands[i % 4]!.push(c))
  return hands.map(sortHand)
}

// ---------------------------------------------------------------- match rules
export type Mode = 'standard' | 'quick'
export type PassDir = 'left' | 'right' | 'across' | 'keep'
export const TARGET: Record<Mode, number> = { standard: 100, quick: 50 }
const CYCLE: readonly PassDir[] = ['left', 'right', 'across', 'keep']
/** Pass direction for hand n (1-based). STANDARD cycles; QUICK always passes left. */
export function passDirection(handNo: number, mode: Mode): PassDir {
  return mode === 'quick' ? 'left' : CYCLE[(handNo - 1) % 4]!
}
const OFFSET: Record<PassDir, number> = { left: 1, across: 2, right: 3, keep: 0 }
export const passTarget = (from: number, dir: PassDir): number => (from + OFFSET[dir]) % 4

/** Apply everyone's three passed cards. Returns new sorted hands. */
export function applyPass(hands: readonly (readonly Card[])[], outgoing: readonly (readonly Card[])[], dir: PassDir): Card[][] {
  if (dir === 'keep') return hands.map((h) => sortHand(h))
  const next = hands.map((h, p) => {
    const out = new Set(outgoing[p]!.map(cardId))
    return h.filter((c) => !out.has(cardId(c)))
  })
  for (let p = 0; p < 4; p++) next[passTarget(p, dir)]!.push(...outgoing[p]!)
  return next.map(sortHand)
}

export interface Play {
  readonly player: number
  readonly card: Card
}

/** Legal plays. `firstTrick` = no trick completed yet this hand. */
export function legalPlays(hand: readonly Card[], trick: readonly Play[], heartsBroken: boolean, firstTrick: boolean): Card[] {
  if (trick.length === 0) {
    if (firstTrick) {
      const two = hand.find((c) => c.rank === '2' && c.suit === '♣')
      if (two) return [two]
    }
    if (!heartsBroken) {
      const nonHearts = hand.filter((c) => !isHeart(c))
      if (nonHearts.length > 0) return nonHearts
    }
    return hand.slice()
  }
  const led = trick[0]!.card.suit
  const follow = hand.filter((c) => c.suit === led)
  if (follow.length > 0) return follow
  if (firstTrick) {
    const safe = hand.filter((c) => points(c) === 0)
    if (safe.length > 0) return safe
  }
  return hand.slice()
}

export function trickWinner(trick: readonly Play[]): number {
  const led = trick[0]!.card.suit
  let best = trick[0]!
  for (const p of trick) if (p.card.suit === led && VALUE[p.card.rank] > VALUE[best.card.rank]) best = p
  return best.player
}
export const trickPoints = (trick: readonly Play[]): number => trick.reduce((n, p) => n + points(p.card), 0)

export interface HandScore {
  readonly points: number[]
  readonly shooter: number | null
}
/** Apply shoot-the-moon: all 26 to one player sends 26 to each other player. */
export function scoreHand(taken: readonly number[]): HandScore {
  const shooter = taken.findIndex((p) => p === 26)
  if (shooter < 0) return { points: taken.slice(), shooter: null }
  return { points: taken.map((_, p) => (p === shooter ? 0 : 26)), shooter }
}

export const MAX_TIEBREAK_HANDS = 3
export type MatchStatus =
  | { readonly kind: 'continue' }
  | { readonly kind: 'tiebreak'; readonly tied: number[]; readonly low: number }
  | { readonly kind: 'over'; readonly winners: number[]; readonly low: number; readonly shared: boolean }

/**
 * Match status after a hand. The match ends when anyone reaches the target;
 * the LOW total wins. If the low total is tied, tie-break hands are played
 * until one player holds it alone. After MAX_TIEBREAK_HANDS tie-break hands a
 * remaining tie is a shared win, named explicitly.
 */
export function matchStatus(totals: readonly number[], target: number, tiebreaksPlayed: number): MatchStatus {
  const reached = totals.some((t) => t >= target)
  if (!reached && tiebreaksPlayed === 0) return { kind: 'continue' }
  const low = Math.min(...totals)
  const winners = totals.flatMap((t, i) => (t === low ? [i] : []))
  if (winners.length === 1) return { kind: 'over', winners, low, shared: false }
  if (tiebreaksPlayed >= MAX_TIEBREAK_HANDS) return { kind: 'over', winners, low, shared: true }
  return { kind: 'tiebreak', tied: winners, low }
}

export type Outcome = 'win' | 'lose' | 'draw'
export function outcomeFor(player: number, s: MatchStatus): Outcome | null {
  if (s.kind !== 'over') return null
  if (!s.winners.includes(player)) return 'lose'
  return s.shared ? 'draw' : 'win'
}

// ---------------------------------------------------------------- hand state
export interface LastTrick {
  readonly no: number
  readonly plays: readonly Play[]
  readonly winner: number
  readonly points: number
}
export interface HandState {
  readonly hands: Card[][]
  readonly trick: Play[]
  readonly current: number
  readonly tricksPlayed: number
  readonly heartsBroken: boolean
  /** Points taken this hand (before moon adjustment). */
  readonly taken: number[]
  /** Every card played this hand, in order (public). */
  readonly played: string[]
  /** voids[p] = suits p has publicly shown out of. */
  readonly voids: Suit[][]
  readonly lastTrick: LastTrick | null
}

export function startPlay(hands: Card[][]): HandState {
  const leader = Math.max(0, hands.findIndex((h) => h.some((c) => c.rank === '2' && c.suit === '♣')))
  return {
    hands,
    trick: [],
    current: leader,
    tricksPlayed: 0,
    heartsBroken: false,
    taken: [0, 0, 0, 0],
    played: [],
    voids: [[], [], [], []],
    lastTrick: null,
  }
}

/** Play one card for the current player. Throws on an illegal play. Resolves a completed trick. */
export function playCard(s: HandState, c: Card): HandState {
  const p = s.current
  const hand = s.hands[p]!
  const legal = legalPlays(hand, s.trick, s.heartsBroken, s.tricksPlayed === 0)
  if (!legal.some((x) => cardId(x) === cardId(c))) throw new Error(`illegal play ${cardId(c)} by ${p}`)
  const hands = s.hands.map((h, i) => (i === p ? h.filter((x) => cardId(x) !== cardId(c)) : h))
  const voids = s.voids.map((v) => v.slice())
  if (s.trick.length > 0) {
    const led = s.trick[0]!.card.suit
    if (c.suit !== led && !voids[p]!.includes(led)) voids[p]!.push(led)
  }
  const trick = [...s.trick, { player: p, card: c }]
  const played = [...s.played, cardId(c)]
  const heartsBroken = s.heartsBroken || isHeart(c)
  if (trick.length < 4) return { ...s, hands, trick, voids, played, heartsBroken, current: (p + 1) % 4 }
  const winner = trickWinner(trick)
  const pts = trickPoints(trick)
  const taken = s.taken.slice()
  taken[winner] = taken[winner]! + pts
  return {
    hands,
    trick: [],
    current: winner,
    tricksPlayed: s.tricksPlayed + 1,
    heartsBroken,
    taken,
    played,
    voids,
    lastTrick: { no: s.tricksPlayed + 1, plays: trick, winner, points: pts },
  }
}

// ---------------------------------------------------------------- AI
/** What a seated AI may know. No other hand is included. */
export interface AiView {
  readonly me: number
  readonly hand: readonly Card[]
  readonly trick: readonly Play[]
  readonly heartsBroken: boolean
  readonly firstTrick: boolean
  readonly played: ReadonlySet<string>
  readonly voids: readonly (readonly Suit[])[]
  readonly taken: readonly number[]
}

export function viewFor(s: HandState, me: number): AiView {
  return {
    me,
    hand: s.hands[me]!,
    trick: s.trick,
    heartsBroken: s.heartsBroken,
    firstTrick: s.tricksPlayed === 0,
    played: new Set(s.played),
    voids: s.voids,
    taken: s.taken,
  }
}

/** Cards of a suit not yet played and not in my hand (held by someone else). */
function outstanding(v: AiView, suit: Suit): Card[] {
  const mine = new Set(v.hand.map(cardId))
  return RANKS.map((rank) => ({ rank, suit })).filter((c) => !v.played.has(cardId(c)) && !mine.has(cardId(c)))
}

/**
 * The player trying to shoot the moon, if any: one other player has taken
 * every point so far and at least 10 of them (or the queen plus hearts).
 */
export function moonThreat(v: AiView): number | null {
  const total = v.taken.reduce((a, b) => a + b, 0)
  if (total < 10) return null
  const holders = v.taken.flatMap((t, i) => (t > 0 ? [i] : []))
  if (holders.length !== 1 || holders[0] === v.me) return null
  return holders[0]!
}

const low = (cs: readonly Card[]): Card => [...cs].sort((a, b) => VALUE[a.rank] - VALUE[b.rank])[0]!
const high = (cs: readonly Card[]): Card => [...cs].sort((a, b) => VALUE[b.rank] - VALUE[a.rank])[0]!

export interface AiChoice {
  readonly card: Card
  readonly why: string
}

export function aiPlay(v: AiView): AiChoice {
  const legal = legalPlays(v.hand, v.trick, v.heartsBroken, v.firstTrick)
  if (legal.length === 1) return { card: legal[0]!, why: 'ONLY LEGAL CARD' }
  const threat = moonThreat(v)
  if (v.trick.length === 0) return aiLead(v, legal, threat)

  const led = v.trick[0]!.card.suit
  const following = legal.filter((c) => c.suit === led)
  const top = Math.max(...v.trick.filter((p) => p.card.suit === led).map((p) => VALUE[p.card.rank]))
  const winnerNow = trickWinner(v.trick)
  const last = v.trick.length === 3
  const pts = trickPoints(v.trick)

  if (following.length > 0) {
    const under = following.filter((c) => VALUE[c.rank] < top)
    const over = following.filter((c) => VALUE[c.rank] > top)
    // Moon defense: take a pointed trick away from the shooter.
    if (threat !== null && winnerNow === threat && over.length > 0 && (pts > 0 || last)) {
      const safeOver = over.filter((c) => !isQueenSpades(c))
      if (safeOver.length > 0) return { card: last ? low(safeOver) : high(safeOver), why: `BLOCKS ${PLAYER_NAMES[threat]} MOON` }
    }
    // Spades: drop the queen under a higher spade already on the trick.
    const queen = following.find(isQueenSpades)
    if (queen && top > VALUE.Q && (threat === null || winnerNow !== threat)) return { card: queen, why: 'QUEEN UNDER A HIGHER SPADE' }
    if (last && pts === 0) {
      // Point-free trick, last to play: shed the most dangerous card it can.
      if (under.length > 0) return { card: high(under), why: 'SHEDS HIGH CARD UNDER THE WINNER' }
      const overSafe = over.filter((c) => !isQueenSpades(c))
      if (overSafe.length > 0) {
        const after = v.hand.filter((c) => cardId(c) !== cardId(high(overSafe)))
        // Winning means leading next: only spend the high card if a safe low exit remains.
        const exit = after.some((c) => !isHeart(c) && VALUE[c.rank] <= 7) || after.length === 0
        return exit ? { card: high(overSafe), why: 'TAKES A CLEAN TRICK WITH ITS HIGHEST' } : { card: low(overSafe), why: 'TAKES A CLEAN TRICK CHEAPLY' }
      }
    }
    if (under.length > 0) return { card: high(under), why: 'DUCKS UNDER THE WINNER' }
    const nonQueen = following.filter((c) => !isQueenSpades(c))
    if (last) return { card: nonQueen.length ? low(nonQueen) : following[0]!, why: 'FORCED TO WIN' }
    // Not last and cannot duck: play low so a later player may still overtake.
    return { card: nonQueen.length ? low(nonQueen) : low(following), why: 'CANNOT DUCK' }
  }

  // Void in the led suit: discard.
  const giftingShooter = threat !== null && winnerNow === threat
  if (giftingShooter) {
    const clean = legal.filter((c) => points(c) === 0)
    if (clean.length > 0) return { card: high(clean), why: `KEEPS POINTS FROM ${PLAYER_NAMES[threat]}` }
  }
  const queen = legal.find(isQueenSpades)
  if (queen) return { card: queen, why: 'DUMPS THE QUEEN' }
  const queenOut = !v.played.has('Q♠') && !v.hand.some(isQueenSpades)
  if (queenOut) {
    const bigSpade = legal.filter((c) => c.suit === '♠' && VALUE[c.rank] > VALUE.Q)
    if (bigSpade.length) return { card: high(bigSpade), why: 'SHEDS A SPADE ABOVE THE QUEEN' }
  }
  const hearts = legal.filter(isHeart)
  if (hearts.length) return { card: high(hearts), why: 'DUMPS A HEART' }
  // Shed the highest card from the suit where it is most likely to win later.
  const danger = (c: Card): number => {
    const higherOut = outstanding(v, c.suit).filter((o) => VALUE[o.rank] > VALUE[c.rank]).length
    return VALUE[c.rank] - higherOut * 2
  }
  return { card: [...legal].sort((a, b) => danger(b) - danger(a))[0]!, why: 'SHEDS ITS MOST DANGEROUS CARD' }
}

function aiLead(v: AiView, legal: readonly Card[], threat: number | null): AiChoice {
  if (threat !== null) {
    const hearts = legal.filter(isHeart)
    if (hearts.length) return { card: high(hearts), why: `LEADS HIGH TO STOP ${PLAYER_NAMES[threat]}` }
  }
  const holdsQueen = v.hand.some(isQueenSpades)
  const queenOut = !v.played.has('Q♠') && !holdsQueen
  const othersVoid = (suit: Suit): boolean => v.voids.some((vs, i) => i !== v.me && vs.includes(suit))
  // Score each candidate: lower = safer.
  const risk = (c: Card): number => {
    const out = outstanding(v, c.suit)
    const lower = out.filter((o) => VALUE[o.rank] < VALUE[c.rank]).length
    let r = VALUE[c.rank]
    if (out.length === 0) r += 20 // nobody else can follow: we win it
    else if (lower === 0) r -= 6 // guaranteed to lose the trick
    if (othersVoid(c.suit)) r += 12 // someone will dump points on it
    if (isHeart(c)) r += 4
    if (c.suit === '♠') {
      if (holdsQueen) r += 10 // do not draw out our own queen's guards
      else if (queenOut && VALUE[c.rank] < VALUE.Q) r -= 4 // flush the queen
      else if (queenOut) r += 15 // A/K spade could catch the queen
    }
    if (isQueenSpades(c)) r += 30
    return r
  }
  const best = [...legal].sort((a, b) => risk(a) - risk(b))[0]!
  return { card: best, why: c2why(best, queenOut, holdsQueen) }
}
const c2why = (c: Card, queenOut: boolean, holdsQueen: boolean): string =>
  c.suit === '♠' && queenOut && !holdsQueen && VALUE[c.rank] < VALUE.Q ? 'LEADS LOW SPADE TO FLUSH THE QUEEN' : 'LEADS ITS SAFEST LOW CARD'

/** Three cards to pass. Dangerous high cards first; tries to void a short suit. */
export function aiPass(hand: readonly Card[]): Card[] {
  const spades = hand.filter((c) => c.suit === '♠')
  const protectedQueen = hand.some(isQueenSpades) && spades.length >= 5
  const score = (c: Card): number => {
    if (isQueenSpades(c)) return protectedQueen ? 0 : 100
    if (c.suit === '♠' && VALUE[c.rank] > VALUE.Q) return spades.length >= 5 ? 5 : 90
    let s = VALUE[c.rank] * 3
    if (isHeart(c)) s += 6
    const len = hand.filter((x) => x.suit === c.suit).length
    if (c.suit !== '♠' && len <= 2) s += 12 // help void a short suit
    if (c.rank === '2' && c.suit === '♣') s -= 20
    return s
  }
  return [...hand].sort((a, b) => score(b) - score(a)).slice(0, 3)
}

// ---------------------------------------------------------------- match flow
export type Phase = 'pass' | 'play' | 'handover' | 'matchover'
export interface Match {
  readonly mode: Mode
  readonly target: number
  readonly handNo: number
  readonly seed: number
  readonly dir: PassDir
  readonly totals: number[]
  /** Tie-break hands already completed. */
  readonly tiebreaks: number
  /** Status going into / coming out of the current hand. */
  readonly status: MatchStatus
  readonly phase: Phase
  /** Hands as dealt (pass phase). */
  readonly dealt: Card[][]
  readonly hand: HandState | null
  /** Cards you received in the pass (ids). */
  readonly received: string[]
  /** Who passed to you, if anyone. */
  readonly receivedFrom: number | null
  /** Notable AI decisions in the trick in progress / last trick. */
  readonly notes: string[]
  readonly lastNotes: string[]
  readonly handScore: HandScore | null
}

function beginHand(base: Omit<Match, 'phase' | 'dealt' | 'hand' | 'received' | 'receivedFrom' | 'notes' | 'lastNotes' | 'handScore' | 'dir'>): Match {
  const dealt = deal(base.seed)
  const dir = passDirection(base.handNo, base.mode)
  const m: Match = { ...base, dir, dealt, phase: 'pass', hand: null, received: [], receivedFrom: null, notes: [], lastNotes: [], handScore: null }
  return dir === 'keep' ? { ...m, phase: 'play', hand: startPlay(dealt.map((h) => h.slice())) } : m
}

export function newMatch(mode: Mode, seed: number): Match {
  return beginHand({ mode, target: TARGET[mode], handNo: 1, seed, totals: [0, 0, 0, 0], tiebreaks: 0, status: { kind: 'continue' } })
}

export function nextHand(m: Match, seed: number): Match {
  if (m.phase !== 'handover') return m
  return beginHand({ mode: m.mode, target: m.target, handNo: m.handNo + 1, seed, totals: m.totals, tiebreaks: m.tiebreaks, status: m.status })
}

export function confirmPass(m: Match, mine: readonly Card[]): Match {
  if (m.phase !== 'pass' || mine.length !== 3) return m
  const outgoing = m.dealt.map((h, p) => (p === 0 ? mine.slice() : aiPass(h)))
  const hands = applyPass(m.dealt, outgoing, m.dir)
  const from = [0, 1, 2, 3].find((q) => q !== 0 && passTarget(q, m.dir) === 0) ?? null
  return {
    ...m,
    phase: 'play',
    hand: startPlay(hands),
    received: from === null ? [] : outgoing[from]!.map(cardId),
    receivedFrom: from,
  }
}

const NOTABLE = /QUEEN|MOON|STOP|KEEPS|SHEDS A SPADE/
/** Play a card for whoever is current. Finishes the hand after trick 13. */
export function play(m: Match, c: Card, why?: string): Match {
  if (m.phase !== 'play' || !m.hand) return m
  const who = m.hand.current
  const hand = playCard(m.hand, c)
  const notes = why && NOTABLE.test(why) ? [...m.notes, `${PLAYER_NAMES[who]} ${why}`] : m.notes
  const done = hand.lastTrick && hand.lastTrick !== m.hand.lastTrick
  const base: Match = done ? { ...m, hand, notes: [], lastNotes: notes, received: who === 0 ? [] : m.received } : { ...m, hand, notes, received: who === 0 ? [] : m.received }
  if (hand.tricksPlayed < 13) return base
  const score = scoreHand(hand.taken)
  const totals = m.totals.map((t, i) => t + score.points[i]!)
  const tiebreaks = m.tiebreaks + (m.status.kind === 'tiebreak' ? 1 : 0)
  const status = matchStatus(totals, m.target, tiebreaks)
  return { ...base, totals, tiebreaks, status, handScore: score, phase: status.kind === 'over' ? 'matchover' : 'handover' }
}

/** One AI play, or null when it is not an AI's turn. */
export function aiStep(m: Match): { match: Match; choice: AiChoice; player: number } | null {
  if (m.phase !== 'play' || !m.hand || m.hand.current === 0) return null
  const player = m.hand.current
  const choice = aiPlay(viewFor(m.hand, player))
  return { match: play(m, choice.card, choice.why), choice, player }
}
