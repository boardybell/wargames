import { describe, expect, it } from 'vitest'
import {
  aiStep,
  aiWantsDiscard,
  analyze,
  bestDefense,
  cards,
  deal,
  deadwoodAfter,
  discardBlock,
  discardCard,
  draw,
  canDraw,
  matchResult,
  meldLabels,
  newMatch,
  passUpcard,
  recordHand,
  settleKnock,
  type HandState,
} from '@app/game/games/engines/gin-rummy'

// Knocker: RUN 4-5-6♠, SET K, RUN 8-9-10♥, deadwood 5♦ = 5.
const KNOCKER = cards('4♠ 5♠ 6♠ K♥ K♦ K♣ 8♥ 9♥ 10♥ 5♦')
// Defender: SET Q, RUN 9-10-J-Q♦ (one queen shared via best partition), deadwood 7♠ 2♥ 3♦ = 12.
const DEFENDER = cards('Q♠ Q♥ Q♣ 9♦ 10♦ J♦ Q♦ 7♠ 2♥ 3♦')

describe('gin rummy analyzer', () => {
  it('returns the actual meld groups and labels them', () => {
    const a = analyze(KNOCKER)
    expect(a.deadwood).toBe(5)
    expect(a.melds).toHaveLength(3)
    expect(a.dead.map((c) => c.id)).toEqual(['5♦'])
    expect(meldLabels(a.melds)).toEqual(['RUN 1', 'RUN 2', 'SET 1'])
    for (const m of a.melds) expect(m.cards).toHaveLength(3)
  })
  it('chooses overlapping runs/sets optimally', () => {
    // 7♠ 7♥ 7♦ set vs 5-6-7♠ run: best uses both 7s set and 4-5-6♠ run.
    const a = analyze(cards('4♠ 5♠ 6♠ 7♠ 7♥ 7♦ 2♣ 9♣ K♣ Q♣'))
    expect(a.deadwood).toBe(2 + 9 + 10 + 10)
  })
})

describe('knock settlement with layoff', () => {
  it('review fixture: defender 12 deadwood laying off a 7 vs knock 5 must undercut', () => {
    expect(analyze(DEFENDER).deadwood).toBe(12)
    const s = settleKnock('YOU', KNOCKER, DEFENDER)
    expect(s.defenderDeadRaw).toBe(12)
    expect(s.layoffs.map((c) => c.id)).toEqual(['7♠'])
    expect(s.defenderDead).toBe(5)
    expect(s.kind).toBe('undercut')
    expect(s.winner).toBe('WOPR')
    expect(s.points).toBe(25)
  })
  it('the same resolver settles a WOPR knock', () => {
    const s = settleKnock('WOPR', KNOCKER, DEFENDER)
    expect(s.kind).toBe('undercut')
    expect(s.winner).toBe('YOU')
  })
  it('scores an ordinary knock after layoff', () => {
    const def = cards('7♠ 8♠ 2♥ 3♦ J♣ Q♣ A♦ A♣ A♥ 4♦')
    // raw: 7+8+2+3+10+10+4 = 44, A set melded. Lays off 7♠ 8♠ (chained) onto 4-6♠.
    const s = settleKnock('YOU', KNOCKER, def)
    expect(s.layoffs.map((c) => c.id)).toEqual(['7♠', '8♠'])
    expect(s.defenderDead).toBe(2 + 3 + 10 + 10 + 4)
    expect(s.kind).toBe('knock')
    expect(s.points).toBe(29 - 5)
  })
  it('allows no layoff against gin', () => {
    const gin = cards('4♠ 5♠ 6♠ K♥ K♦ K♣ 8♥ 9♥ 10♥ J♥')
    const s = settleKnock('WOPR', gin, DEFENDER)
    expect(s.kind).toBe('gin')
    expect(s.layoffs).toHaveLength(0)
    expect(s.points).toBe(12 + 25)
  })
  it('layoff onto a set takes the fourth card', () => {
    const d = bestDefense(cards('K♠ 2♥ 3♦ J♣ Q♣ A♦ A♣ A♥ 4♦ 9♣'), analyze(KNOCKER).melds, false)
    expect(d.layoffs.map((c) => c.id)).toContain('K♠')
  })
})

// A hand where YOU are non-dealer and must decide on the upcard.
function opening(): HandState {
  return deal(1234, 'WOPR')
}

describe('turn legality', () => {
  it('deals ten each, one upcard, non-dealer decides first', () => {
    const s = opening()
    expect(s.hands.YOU).toHaveLength(10)
    expect(s.hands.WOPR).toHaveLength(10)
    expect(s.discard).toHaveLength(1)
    expect(s.stock).toHaveLength(31)
    expect(s.stage).toBe('upcard')
    expect(s.turn).toBe('YOU')
    expect(canDraw(s, 'stock')).toBe(false)
  })
  it('opening pass: both pass, then the non-dealer must draw from stock', () => {
    let s = passUpcard(opening())
    expect(s.turn).toBe('WOPR')
    s = passUpcard(s)
    expect(s.stage).toBe('draw')
    expect(s.turn).toBe('YOU')
    expect(canDraw(s, 'discard')).toBe(false)
    expect(canDraw(s, 'stock')).toBe(true)
  })
  it('the picked-up discard may not be returned the same turn', () => {
    const s0 = opening()
    const up = s0.discard[0]!
    const s = draw(s0, 'discard')
    expect(s.drawnFrom).toBe('discard')
    expect(s.pickedUp).toBe(up.id)
    expect(discardBlock(s, up.id)).toBe('PICKED UP THIS TURN')
    expect(() => discardCard(s, up.id)).toThrow()
    const other = s.hands.YOU.find((c) => c.id !== up.id)!
    const after = discardCard(s, other.id)
    expect(after.turn).toBe('WOPR')
    expect(after.pickedUp).toBeNull()
  })
  it('knock eligibility is computed after the chosen discard', () => {
    const s: HandState = { ...opening(), stage: 'discard', turn: 'YOU', hands: { YOU: [...KNOCKER, ...cards('Q♠')], WOPR: DEFENDER }, pickedUp: null }
    expect(deadwoodAfter(s, 'Q♠')).toBe(5)
    expect(deadwoodAfter(s, '5♦')).toBe(10)
    expect(deadwoodAfter(s, '4♠')).toBeGreaterThan(10)
    expect(() => discardCard(s, '4♠', true)).toThrow('illegal knock')
    const k = discardCard(s, 'Q♠', true)
    expect(k.stage).toBe('over')
    expect(k.settlement?.kind).toBe('undercut')
  })
  it('the hand is void when a discard leaves two cards in stock', () => {
    const base = opening()
    const s: HandState = { ...base, stage: 'draw', turn: 'YOU', stock: base.stock.slice(0, 3) }
    const d = draw(s, 'stock')
    expect(d.stock).toHaveLength(2)
    const out = discardCard(d, d.hands.YOU[0]!.id)
    expect(out.stage).toBe('over')
    expect(out.settlement?.kind).toBe('void')
    expect(out.settlement?.winner).toBeNull()
  })
})

describe('WOPR policy', () => {
  // Deadwood K♣ Q♣ 9♦ ... ; upcard A♥ melds with nothing.
  const hand = cards('4♠ 5♠ 6♠ K♥ K♦ K♣ 8♥ 9♥ 10♥ Q♣')
  const ace = cards('A♦')[0]!
  it('BEGINNER keeps the original raw 11-card comparison and refuses the exchange', () => {
    expect(aiWantsDiscard(hand, ace, 'beginner')).toBe(false)
  })
  it('STANDARD compares the best 10-card result after each discard and takes it', () => {
    expect(aiWantsDiscard(hand, ace, 'standard')).toBe(true)
  })
  it('never returns the picked-up card and knocks through the shared resolver', () => {
    let s = deal(77, 'YOU') // WOPR is non-dealer and acts first
    for (let i = 0; i < 40 && s.stage !== 'over'; i++) {
      if (s.turn === 'WOPR') {
        const before = s
        const { state, report } = aiStep(s, 'standard')
        if (report.action === 'take') expect(report.discarded?.id).not.toBe(report.took?.id)
        if (report.knocked) expect(state.settlement?.knocker).toBe('WOPR')
        expect(state).not.toBe(before)
        s = state
      } else if (s.stage === 'upcard') s = passUpcard(s)
      else {
        s = draw(s, 'stock')
        s = discardCard(s, s.drawn!)
      }
    }
    expect(s.stage).toBe('over')
  })
})

describe('match scoring', () => {
  it('accumulates to 100 with alternating dealer, box and game bonuses', () => {
    let m = newMatch()
    expect(m.nextDealer).toBe('WOPR')
    const win = settleKnock('YOU', cards('4♠ 5♠ 6♠ K♥ K♦ K♣ 8♥ 9♥ 10♥ J♥'), DEFENDER) // gin 37
    m = recordHand(m, 'WOPR', win)
    expect(m.nextDealer).toBe('YOU')
    m = recordHand(m, 'YOU', settleKnock('WOPR', KNOCKER, DEFENDER)) // undercut, YOU +25
    m = recordHand(m, 'WOPR', win)
    expect(matchResult(m)).toBeNull()
    m = recordHand(m, 'YOU', win)
    expect(m.scores.YOU).toBe(37 * 3 + 25)
    const r = matchResult(m)!
    expect(r.winner).toBe('YOU')
    expect(r.boxes.YOU).toBe(4)
    expect(r.totals.YOU).toBe(136 + 4 * 25 + 100)
    expect(m.history).toHaveLength(4)
  })
})
