import { describe, expect, it } from 'vitest'
import {
  aiPass,
  aiPlay,
  aiStep,
  applyPass,
  card,
  cardId,
  confirmPass,
  deal,
  legalPlays,
  matchStatus,
  moonThreat,
  newMatch,
  nextHand,
  outcomeFor,
  passDirection,
  passTarget,
  play,
  playCard,
  scoreHand,
  startPlay,
  trickWinner,
  type AiView,
  type Card,
  type Match,
  type Play,
} from '@app/game/games/engines/hearts'

const cs = (s: string): Card[] => s.split(' ').filter(Boolean).map(card)
const plays = (s: string, first = 0): Play[] => cs(s).map((c, i) => ({ player: (first + i) % 4, card: c }))
const view = (o: Partial<AiView> & { hand: Card[] }): AiView => ({
  me: 3,
  trick: [],
  heartsBroken: true,
  firstTrick: false,
  played: new Set(),
  voids: [[], [], [], []],
  taken: [0, 0, 0, 0],
  ...o,
})

describe('hearts deal and pass', () => {
  it('deals 13 distinct cards each, reproducibly from a seed', () => {
    const a = deal(42)
    expect(a.map((h) => h.length)).toEqual([13, 13, 13, 13])
    expect(new Set(a.flat().map(cardId)).size).toBe(52)
    expect(deal(42).map((h) => h.map(cardId))).toEqual(a.map((h) => h.map(cardId)))
  })

  it('STANDARD cycles left/right/across/keep; QUICK always passes left', () => {
    expect([1, 2, 3, 4, 5].map((n) => passDirection(n, 'standard'))).toEqual(['left', 'right', 'across', 'keep', 'left'])
    expect([1, 2, 3, 4].map((n) => passDirection(n, 'quick'))).toEqual(['left', 'left', 'left', 'left'])
    expect(passTarget(0, 'left')).toBe(1)
    expect(passTarget(0, 'right')).toBe(3)
    expect(passTarget(0, 'across')).toBe(2)
  })

  it('applies passes in the right direction and keeps 13 cards each', () => {
    const hands = deal(7)
    const out = hands.map((h) => h.slice(0, 3))
    const right = applyPass(hands, out, 'right')
    expect(right.map((h) => h.length)).toEqual([13, 13, 13, 13])
    // player 0 passes right to player 3
    for (const c of out[0]!) expect(right[3]!.map(cardId)).toContain(cardId(c))
    const keep = applyPass(hands, out, 'keep')
    expect(keep[0]!.map(cardId).sort()).toEqual(hands[0]!.map(cardId).sort())
  })

  it('a KEEP hand skips the pass phase', () => {
    let m: Match = newMatch('standard', 1)
    expect(m.phase).toBe('pass')
    for (let i = 0; i < 3; i++) m = nextHand({ ...m, phase: 'handover' }, 10 + i)
    expect(m.handNo).toBe(4)
    expect(m.dir).toBe('keep')
    expect(m.phase).toBe('play')
  })

  it('AI passes the unprotected queen of spades', () => {
    expect(aiPass(cs('Q♠ 3♠ 2♣ 4♣ 5♣ 6♦ 7♦ 8♦ 9♥ 2♥ 3♥ 4♦ 5♦')).map(cardId)).toContain('Q♠')
  })
})

describe('hearts trick rules', () => {
  it('first lead must be the two of clubs; no points on trick one when void', () => {
    expect(legalPlays(cs('2♣ 9♦ A♠'), [], false, true).map(cardId)).toEqual(['2♣'])
    expect(legalPlays(cs('Q♠ 5♥ 9♦'), plays('2♣'), false, true).map(cardId)).toEqual(['9♦'])
    expect(legalPlays(cs('Q♠ 5♥'), plays('2♣'), false, true).map(cardId)).toEqual(['Q♠', '5♥'])
  })
  it('hearts cannot be led until broken unless only hearts remain', () => {
    expect(legalPlays(cs('5♥ 9♦'), [], false, false).map(cardId)).toEqual(['9♦'])
    expect(legalPlays(cs('5♥ 9♥'), [], false, false).map(cardId)).toEqual(['5♥', '9♥'])
  })
  it('highest card of the led suit wins', () => {
    expect(trickWinner(plays('5♦ A♠ 9♦ 2♦'))).toBe(2)
  })
  it('records the completed trick, its winner and points, and exposed voids', () => {
    const hands = [cs('2♣ 3♦'), cs('5♣ 4♦'), cs('Q♠ 5♦'), cs('K♣ 6♦')]
    let s = startPlay(hands)
    expect(s.current).toBe(0)
    s = playCard(s, card('2♣'))
    s = playCard(s, card('5♣'))
    s = { ...s, tricksPlayed: 1 } // allow the queen discard for this fixture
    s = playCard(s, card('Q♠'))
    s = playCard(s, card('K♣'))
    expect(s.lastTrick).toMatchObject({ winner: 3, points: 13 })
    expect(s.lastTrick!.plays.map((p) => cardId(p.card))).toEqual(['2♣', '5♣', 'Q♠', 'K♣'])
    expect(s.voids[2]).toEqual(['♣'])
    expect(s.taken).toEqual([0, 0, 0, 13])
    expect(s.current).toBe(3)
    expect(() => playCard(s, card('3♦'))).toThrow()
  })
  it('shooting the moon sends 26 to the others', () => {
    expect(scoreHand([26, 0, 0, 0])).toEqual({ points: [0, 26, 26, 26], shooter: 0 })
    expect(scoreHand([13, 5, 8, 0]).shooter).toBeNull()
  })
})

describe('hearts match ties (review §4 bug: first minimum silently won)', () => {
  it('a tied low score is not a sole win: it calls a tie-break hand', () => {
    const s = matchStatus([40, 40, 55, 101], 100, 0)
    expect(s).toEqual({ kind: 'tiebreak', tied: [0, 1], low: 40 })
    expect(outcomeFor(0, s)).toBeNull()
  })
  it('a single low scorer wins', () => {
    const s = matchStatus([39, 40, 55, 101], 100, 0)
    expect(s).toMatchObject({ kind: 'over', winners: [0], shared: false })
    expect(outcomeFor(0, s)).toBe('win')
    expect(outcomeFor(1, s)).toBe('lose')
  })
  it('a tie that survives the tie-break hands is a stated shared win', () => {
    const s = matchStatus([60, 60, 70, 110], 100, 3)
    expect(s).toMatchObject({ kind: 'over', winners: [0, 1], shared: true })
    expect(outcomeFor(0, s)).toBe('draw')
    expect(outcomeFor(2, s)).toBe('lose')
  })
  it('below target the match continues', () => {
    expect(matchStatus([10, 10, 20, 30], 100, 0).kind).toBe('continue')
  })
})

describe('hearts AI', () => {
  it('last on a point-free trick sheds its highest card under the winner', () => {
    const v = view({ hand: cs('3♦ 9♦ J♦ 2♣'), trick: plays('Q♦ 4♦ 5♦', 0) })
    expect(cardId(aiPlay(v).card)).toBe('J♦')
  })
  it('last on a point-free trick it must win anyway, it spends a high card when a safe exit remains', () => {
    const v = view({ hand: cs('K♦ A♦ 2♣'), trick: plays('5♦ 4♦ 6♦', 0) })
    expect(cardId(aiPlay(v).card)).toBe('A♦')
  })
  it('drops the queen under a higher spade', () => {
    const v = view({ me: 2, hand: cs('Q♠ 3♠ 4♦'), trick: plays('K♠ 2♠', 0) })
    expect(cardId(aiPlay(v).card)).toBe('Q♠')
  })
  it('dumps the queen when void', () => {
    const v = view({ hand: cs('Q♠ 3♠ 9♥'), trick: plays('5♦ 4♦ 6♦', 0) })
    expect(cardId(aiPlay(v).card)).toBe('Q♠')
  })
  it('detects a moon run and takes a pointed trick away from the shooter', () => {
    const taken = [0, 18, 0, 0]
    expect(moonThreat(view({ hand: [], taken }))).toBe(1)
    const v = view({ me: 3, hand: cs('2♥ K♥ 5♣'), taken, trick: plays('9♥ J♥ 3♥', 0) })
    expect(cardId(aiPlay(v).card)).toBe('K♥')
  })
  it('will not feed hearts to a moon shooter when void', () => {
    const v = view({ me: 3, hand: cs('A♥ 5♣ 9♣'), taken: [0, 18, 0, 0], trick: plays('2♦ A♦ 3♦', 0) })
    expect(aiPlay(v).card.suit).toBe('♣')
  })
  it('avoids leading a suit an opponent has shown out of', () => {
    const v = view({ me: 3, hand: cs('4♦ 5♣'), voids: [['♦'], [], [], []], played: new Set(['2♣', '3♣', '2♦', '3♦']) })
    expect(cardId(aiPlay(v).card)).toBe('5♣')
  })
  it('AI never sees another hand: the view carries only its own', () => {
    const m = confirmPass(newMatch('quick', 9), deal(9)[0]!.slice(0, 3))
    const s = m.hand!
    const v = { ...s }
    expect(Object.keys(aiPlay({ me: 1, hand: s.hands[1]!, trick: [], heartsBroken: false, firstTrick: true, played: new Set(), voids: v.voids, taken: v.taken })).sort()).toEqual(['card', 'why'])
  })
})

describe('hearts full hands', () => {
  it('plays seeded matches to completion with legal AI play and 26 points per hand', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      let m: Match = newMatch('quick', seed)
      let guard = 0
      while (m.phase !== 'matchover' && guard++ < 2000) {
        if (m.phase === 'pass') m = confirmPass(m, m.dealt[0]!.slice(0, 3))
        else if (m.phase === 'handover') m = nextHand(m, seed * 1000 + m.handNo)
        else if (m.hand!.current === 0) {
          const h = m.hand!
          const legal = legalPlays(h.hands[0]!, h.trick, h.heartsBroken, h.tricksPlayed === 0)
          const before = m.totals.reduce((a, b) => a + b, 0)
          m = play(m, legal[0]!)
          if (m.handScore && m.phase !== 'play') {
            const after = m.totals.reduce((a, b) => a + b, 0)
            expect([26, 78]).toContain(after - before)
          }
        } else m = aiStep(m)!.match
      }
      expect(m.phase).toBe('matchover')
      expect(m.status.kind).toBe('over')
    }
  })
})

