// BRIDGE declarer practice: rules, scoring and defender policy (pure).
// Design: docs/games-design-review.md §5.
//
// You declare from South with North as dummy; East and West defend. Scoring
// is duplicate-style for an undoubled, non-vulnerable contract. Defenders see
// their own hand, dummy (face up after the opening lead) and every card
// played, never declarer's or partner's hidden hand.

export const SUITS = ['♠', '♥', '♦', '♣'] as const
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const
export type Suit = (typeof SUITS)[number]
export type Rank = (typeof RANKS)[number]
export type Strain = Suit | 'NT'
export type Seat = 'N' | 'E' | 'S' | 'W'
export interface Card {
  readonly rank: Rank
  readonly suit: Suit
  readonly id: string
}
export const card = (id: string): Card => ({ rank: id.slice(0, -1) as Rank, suit: id.slice(-1) as Suit, id })
export const rankVal = (r: Rank): number => RANKS.indexOf(r)
export const NEXT: Record<Seat, Seat> = { N: 'E', E: 'S', S: 'W', W: 'N' }
export const PARTNER: Record<Seat, Seat> = { N: 'S', S: 'N', E: 'W', W: 'E' }
export const isNS = (s: Seat): boolean => s === 'N' || s === 'S'
export const SEAT_NAME: Record<Seat, string> = { N: 'NORTH', E: 'EAST', S: 'SOUTH', W: 'WEST' }
export const STRAIN_NAME: Record<Strain, string> = { '♠': 'SPADES', '♥': 'HEARTS', '♦': 'DIAMONDS', '♣': 'CLUBS', NT: 'NO TRUMP' }
export const contractLabel = (level: number, strain: Strain): string => `${level}${strain === 'NT' ? 'NT' : strain}`

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

export const sortHand = (h: readonly Card[]): Card[] =>
  [...h].sort((a, b) => (a.suit === b.suit ? rankVal(b.rank) - rankVal(a.rank) : SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit)))

/** The same seed always deals the same four hands (REPLAY DEAL). */
export function deal(seed: number): Record<Seat, Card[]> {
  const r = seeded(seed)
  const deck: Card[] = []
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit, id: `${rank}${suit}` })
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
  }
  const hands: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] }
  const order: Seat[] = ['N', 'E', 'S', 'W']
  deck.forEach((c, i) => hands[order[i % 4]!].push(c))
  for (const s of order) hands[s] = sortHand(hands[s])
  return hands
}

export const hcp = (h: readonly Card[]): number => h.reduce((n, c) => n + Math.max(0, rankVal(c.rank) - 8), 0)

// ---------------------------------------------------------------- play rules
export interface Play {
  readonly seat: Seat
  readonly card: Card
}

export function legalCards(hand: readonly Card[], trick: readonly Play[]): Card[] {
  if (trick.length === 0) return [...hand]
  const led = trick[0]!.card.suit
  const follow = hand.filter((c) => c.suit === led)
  return follow.length > 0 ? follow : [...hand]
}

/** Winning play of a (possibly partial) trick. */
export function trickWinner(trick: readonly Play[], trump: Strain): Play {
  const led = trick[0]!.card.suit
  let best = trick[0]!
  for (const p of trick.slice(1)) {
    const bT = trump !== 'NT' && best.card.suit === trump
    const pT = trump !== 'NT' && p.card.suit === trump
    if (pT && !bT) best = p
    else if (pT === bT && p.card.suit === best.card.suit && rankVal(p.card.rank) > rankVal(best.card.rank)) best = p
    else if (!pT && !bT && p.card.suit === led && best.card.suit !== led) best = p
  }
  return best
}

// ---------------------------------------------------------------- scoring
export interface ScoreLine {
  readonly label: string
  readonly points: number
}
export interface Score {
  readonly made: boolean
  readonly need: number
  readonly tricks: number
  /** Signed: positive when the contract makes. */
  readonly total: number
  readonly lines: ScoreLine[]
}

const perTrick = (strain: Strain): number => (strain === '♣' || strain === '♦' ? 20 : 30)
export function contractPoints(level: number, strain: Strain): number {
  return strain === 'NT' ? 40 + 30 * (level - 1) : perTrick(strain) * level
}

/** Undoubled, non-vulnerable duplicate score from declarer's side. */
export function scoreContract(level: number, strain: Strain, tricks: number): Score {
  const need = 6 + level
  if (tricks < need) {
    const under = need - tricks
    return { made: false, need, tricks, total: -50 * under, lines: [{ label: `${under} UNDERTRICK${under > 1 ? 'S' : ''} AT 50`, points: -50 * under }] }
  }
  const cp = contractPoints(level, strain)
  const lines: ScoreLine[] = [{ label: `CONTRACT ${contractLabel(level, strain)}`, points: cp }]
  lines.push(cp >= 100 ? { label: 'GAME BONUS', points: 300 } : { label: 'PARTSCORE BONUS', points: 50 })
  if (level === 6) lines.push({ label: 'SMALL SLAM BONUS', points: 500 })
  if (level === 7) lines.push({ label: 'GRAND SLAM BONUS', points: 1000 })
  const over = tricks - need
  if (over > 0) lines.push({ label: `${over} OVERTRICK${over > 1 ? 'S' : ''} AT ${perTrick(strain)}`, points: over * perTrick(strain) })
  return { made: true, need, tricks, total: lines.reduce((n, l) => n + l.points, 0), lines }
}

// ---------------------------------------------------------------- deal state
export interface LastTrick {
  readonly no: number
  readonly plays: readonly Play[]
  readonly winner: Seat
  readonly why: string
  readonly notes: readonly string[]
}
export interface PlayState {
  readonly level: number
  readonly strain: Strain
  readonly hands: Record<Seat, Card[]>
  readonly trick: Play[]
  readonly turn: Seat
  readonly ns: number
  readonly ew: number
  readonly played: string[]
  readonly voids: Record<Seat, Suit[]>
  readonly notes: string[]
  readonly lastTrick: LastTrick | null
}

export function startPlay(hands: Record<Seat, Card[]>, level: number, strain: Strain): PlayState {
  return {
    level,
    strain,
    hands: { N: hands.N.slice(), E: hands.E.slice(), S: hands.S.slice(), W: hands.W.slice() },
    trick: [],
    turn: 'W', // left of the South declarer leads
    ns: 0,
    ew: 0,
    played: [],
    voids: { N: [], E: [], S: [], W: [] },
    notes: [],
    lastTrick: null,
  }
}
export const tricksDone = (s: PlayState): number => s.ns + s.ew
export const isOver = (s: PlayState): boolean => tricksDone(s) === 13

/** Why the trick went to its winner, in one short line. */
export function explainWin(trick: readonly Play[], trump: Strain): string {
  const w = trickWinner(trick, trump)
  const led = trick[0]!.card.suit
  const c = `${w.card.rank}${w.card.suit}`
  if (trump !== 'NT' && w.card.suit === trump && led !== trump) {
    const ruffs = trick.filter((p) => p.card.suit === trump).length
    return `${SEAT_NAME[w.seat]} ${ruffs > 1 ? 'OVERRUFFED' : 'RUFFED'} WITH ${c}.`
  }
  if (trump !== 'NT' && w.card.suit === trump) return `${SEAT_NAME[w.seat]} WON WITH ${c}, HIGHEST TRUMP.`
  return `${SEAT_NAME[w.seat]} WON WITH ${c}, HIGHEST ${STRAIN_NAME[w.card.suit].replace(/S$/, '')}.`
}

export function playCard(s: PlayState, seat: Seat, c: Card, note?: string): PlayState {
  if (s.turn !== seat || isOver(s)) throw new Error(`not ${seat}'s turn`)
  if (!legalCards(s.hands[seat], s.trick).some((x) => x.id === c.id)) throw new Error(`illegal ${c.id} by ${seat}`)
  const hands = { ...s.hands, [seat]: s.hands[seat].filter((x) => x.id !== c.id) }
  const voids = { ...s.voids }
  if (s.trick.length > 0) {
    const led = s.trick[0]!.card.suit
    if (c.suit !== led && !voids[seat].includes(led)) voids[seat] = [...voids[seat], led]
  }
  const trick = [...s.trick, { seat, card: c }]
  const notes = note && !/ONLY LEGAL CARD/.test(note) ? [...s.notes, note] : s.notes
  const played = [...s.played, c.id]
  if (trick.length < 4) return { ...s, hands, voids, trick, notes, played, turn: NEXT[seat] }
  const w = trickWinner(trick, s.strain)
  const ns = s.ns + (isNS(w.seat) ? 1 : 0)
  const ew = s.ew + (isNS(w.seat) ? 0 : 1)
  return {
    ...s,
    hands,
    voids,
    played,
    trick: [],
    notes: [],
    turn: w.seat,
    ns,
    ew,
    lastTrick: { no: ns + ew, plays: trick, winner: w.seat, why: explainWin(trick, s.strain), notes },
  }
}

// ---------------------------------------------------------------- defense
/** What a defender may see: own hand, dummy (after the lead), the table and played cards. */
export interface DefView {
  readonly seat: Seat
  readonly hand: readonly Card[]
  readonly dummy: readonly Card[] | null
  readonly trick: readonly Play[]
  readonly trump: Strain
  readonly played: ReadonlySet<string>
  readonly voids: Readonly<Record<Seat, readonly Suit[]>>
}

export function defView(s: PlayState, seat: Seat): DefView {
  return {
    seat,
    hand: s.hands[seat],
    dummy: s.played.length > 0 ? s.hands.N : null,
    trick: s.trick,
    trump: s.strain,
    played: new Set(s.played),
    voids: s.voids,
  }
}

export interface DefChoice {
  readonly card: Card
  readonly why: string
}

const lowest = (cs: readonly Card[]): Card => [...cs].sort((a, b) => rankVal(a.rank) - rankVal(b.rank))[0]!
const beats = (trick: readonly Play[], seat: Seat, c: Card, trump: Strain): boolean =>
  trickWinner([...trick, { seat, card: c }], trump).card.id === c.id

/** Cheapest discard: lowest card of a non-trump suit, avoiding honors and singleton guards. */
function cheapDiscard(v: DefView, legal: readonly Card[]): Card {
  const nonTrump = legal.filter((c) => c.suit !== v.trump)
  const pool = nonTrump.length > 0 ? nonTrump : legal
  const score = (c: Card): number => {
    const len = v.hand.filter((x) => x.suit === c.suit).length
    return rankVal(c.rank) * 2 - (len >= 4 ? 0 : 3) + (rankVal(c.rank) >= 9 && len <= 2 ? 10 : 0)
  }
  return [...pool].sort((a, b) => score(a) - score(b))[0]!
}

/** True when no card still to be played can beat the current winner (partner). */
function partnerSafe(v: DefView, w: Play): boolean {
  const remaining = 3 - v.trick.length // players after me
  if (remaining === 0) return true
  // The only player after me is declarer's side. If it is dummy, look.
  const after = NEXT[v.seat]
  const led = v.trick[0]!.card.suit
  if (after === 'N' && v.dummy) {
    const legal = legalCards(v.dummy, v.trick)
    return !legal.some((c) => beats(v.trick, 'N', c, v.trump))
  }
  // Hidden declarer: safe if every higher card of the winning suit is gone or mine,
  // and (in a suit contract) declarer has not shown out of the led suit.
  const mine = new Set(v.hand.map((c) => c.id))
  const higherOut = RANKS.filter((r) => rankVal(r) > rankVal(w.card.rank))
    .map((r) => `${r}${w.card.suit}`)
    .some((id) => !v.played.has(id) && !mine.has(id))
  if (higherOut) return false
  if (v.trump !== 'NT' && w.card.suit !== v.trump && v.voids[after].includes(led)) return false
  return true
}

export function defend(v: DefView): DefChoice {
  const legal = legalCards(v.hand, v.trick)
  if (legal.length === 1) return { card: legal[0]!, why: 'ONLY LEGAL CARD' }
  if (v.trick.length === 0) return defLead(v, legal)
  const led = v.trick[0]!.card.suit
  const w = trickWinner(v.trick, v.trump)
  const partnerWinning = w.seat === PARTNER[v.seat]
  const last = v.trick.length === 3
  const following = legal[0]!.suit === led

  if (partnerWinning && partnerSafe(v, w)) {
    const c = following ? lowest(legal) : cheapDiscard(v, legal)
    return { card: c, why: `${following ? 'PLAYED LOW' : 'DISCARDED'}: PARTNER ${SEAT_NAME[w.seat]} ALREADY WINNING` }
  }

  const winners = legal.filter((c) => beats(v.trick, v.seat, c, v.trump))
  if (winners.length === 0) {
    const c = following ? lowest(legal) : cheapDiscard(v, legal)
    return { card: c, why: following ? 'CANNOT BEAT IT: PLAYED LOW' : 'CANNOT WIN: DISCARDED CHEAPLY' }
  }
  // Second hand (declarer's side led, partner still to play): low unless last chance.
  if (v.trick.length === 1 && !partnerWinning) {
    const ruff = !following
    if (following) return { card: lowest(legal), why: 'SECOND HAND LOW' }
    if (ruff) {
      // Ruff a declarer-side lead only when the trick is not partner's to take.
      return { card: lowest(winners), why: 'RUFFED WITH ITS LOWEST TRUMP' }
    }
  }
  // Must beat dummy too when dummy plays after me.
  const after = NEXT[v.seat]
  let pool = winners
  if (!last && after === 'N' && v.dummy) {
    const dummyLegal = legalCards(v.dummy, [...v.trick])
    const safe = winners.filter((c) => {
      const t = [...v.trick, { seat: v.seat, card: c }]
      return !dummyLegal.some((d) => beats(t, 'N', d, v.trump))
    })
    if (safe.length > 0) pool = safe
  }
  const c = lowest(pool)
  const ruff = c.suit === v.trump && led !== v.trump
  return { card: c, why: ruff ? 'RUFFED WITH ITS LOWEST TRUMP' : last ? 'WON CHEAPLY IN FOURTH SEAT' : 'THIRD HAND: CHEAPEST CARD THAT HOLDS' }
}

function defLead(v: DefView, legal: readonly Card[]): DefChoice {
  const bySuit = (s: Suit): Card[] => legal.filter((c) => c.suit === s).sort((a, b) => rankVal(b.rank) - rankVal(a.rank))
  const declarerRuffs = (s: Suit): boolean =>
    v.trump !== 'NT' &&
    s !== v.trump &&
    ((v.dummy !== null && !v.dummy.some((c) => c.suit === s) && v.dummy.some((c) => c.suit === v.trump)) || v.voids.S.includes(s))
  const partnerRuffs = (s: Suit): boolean => v.trump !== 'NT' && s !== v.trump && v.voids[PARTNER[v.seat]].includes(s) && !v.voids[PARTNER[v.seat]].includes(v.trump as Suit)
  let best: { card: Card; why: string; score: number } | null = null
  for (const s of SUITS) {
    const cs = bySuit(s)
    if (cs.length === 0) continue
    let score = cs.length
    let pick = cs[cs.length - 1]!
    let why = 'LED LOW FROM ITS LONGEST SUIT'
    const top = cs[0]!
    const second = cs[1]
    if (second && rankVal(top.rank) - rankVal(second.rank) === 1 && rankVal(top.rank) >= 10) {
      pick = top
      why = 'LED TOP OF A SEQUENCE'
      score += 4
    } else if (rankVal(top.rank) === 12 && v.trump !== 'NT') {
      pick = top
      why = 'CASHED AN ACE'
      score += 2
    } else if (cs.length >= 4) {
      pick = cs[3]! // fourth best
      why = 'LED FOURTH BEST FROM ITS LONGEST SUIT'
    }
    if (partnerRuffs(s)) {
      score += 8
      pick = cs[cs.length - 1]!
      why = 'LED A SUIT PARTNER CAN RUFF'
    }
    if (declarerRuffs(s)) score -= 10
    if (s === v.trump) score -= 6
    if (!best || score > best.score) best = { card: pick, why, score }
  }
  return { card: best!.card, why: best!.why }
}
