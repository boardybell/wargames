import { describe, expect, it } from 'vitest'
import {
  card,
  contractPoints,
  deal,
  defView,
  defend,
  explainWin,
  isOver,
  legalCards,
  playCard,
  scoreContract,
  startPlay,
  trickWinner,
  type Card,
  type DefView,
  type Play,
  type Seat,
} from '@app/game/games/engines/bridge'

const cs = (s: string): Card[] => s.split(' ').filter(Boolean).map(card)
const plays = (s: string, first: Seat): Play[] => {
  const order: Seat[] = ['N', 'E', 'S', 'W']
  const i0 = order.indexOf(first)
  return cs(s).map((c, i) => ({ seat: order[(i0 + i) % 4]!, card: c }))
}
const view = (o: Partial<DefView> & { seat: Seat; hand: Card[] }): DefView => ({
  dummy: null,
  trick: [],
  trump: 'NT',
  played: new Set(),
  voids: { N: [], E: [], S: [], W: [] },
  ...o,
})

describe('bridge scoring (undoubled, not vulnerable)', () => {
  it.each([
    [3, 'NT', 9, 400],
    [4, '♠', 11, 450],
    [2, '♥', 8, 110],
    [1, 'NT', 7, 90],
    [6, '♣', 12, 920],
    [7, 'NT', 13, 1520],
    [5, '♦', 11, 400],
    [3, '♣', 11, 150],
    [4, '♥', 8, -100],
    [7, '♠', 12, -50],
  ] as const)('%i%s with %i tricks scores %i', (level, strain, tricks, total) => {
    expect(scoreContract(level, strain, tricks).total).toBe(total)
  })
  it('breaks the score into contract points, bonus, slam, overtricks', () => {
    const s = scoreContract(6, '♠', 13)
    expect(s.lines.map((l) => [l.label, l.points])).toEqual([
      ['CONTRACT 6♠', 180],
      ['GAME BONUS', 300],
      ['SMALL SLAM BONUS', 500],
      ['1 OVERTRICK AT 30', 30],
    ])
    expect(contractPoints(3, 'NT')).toBe(100)
    expect(scoreContract(2, '♦', 6).lines).toEqual([{ label: '2 UNDERTRICKS AT 50', points: -100 }])
  })
})

describe('bridge play rules', () => {
  it('the same seed deals the same cards (REPLAY DEAL)', () => {
    const a = deal(1234)
    expect(deal(1234)).toEqual(a)
    expect(Object.values(a).flat()).toHaveLength(52)
  })
  it('trumps beat the led suit; otherwise the highest of the led suit wins', () => {
    expect(trickWinner(plays('K♦ A♣ 2♠ Q♦', 'N'), '♠').seat).toBe('S')
    expect(trickWinner(plays('K♦ A♣ 2♠ A♦', 'N'), 'NT').seat).toBe('W')
    expect(trickWinner(plays('K♦ 3♠ 2♠ A♦', 'N'), '♠').seat).toBe('E')
  })
  it('must follow suit when able', () => {
    expect(legalCards(cs('A♠ 2♦ 3♦'), plays('K♦', 'N')).map((c) => c.id)).toEqual(['2♦', '3♦'])
  })
  it('explains a ruff', () => {
    expect(explainWin(plays('K♦ 3♠ 2♦ A♦', 'N'), '♠')).toBe('EAST RUFFED WITH 3♠.')
    expect(explainWin(plays('K♦ 3♣ 2♦ A♦', 'N'), 'NT')).toBe('WEST WON WITH A♦, HIGHEST DIAMOND.')
  })
  it('plays a seeded deal to 13 tricks with legal defense', () => {
    for (const seed of [1, 2, 3, 99]) {
      let s = startPlay(deal(seed), 3, 'NT')
      while (!isOver(s)) {
        const seat = s.turn
        if (seat === 'E' || seat === 'W') s = playCard(s, seat, defend(defView(s, seat)).card)
        else s = playCard(s, seat, legalCards(s.hands[seat], s.trick)[0]!)
      }
      expect(s.ns + s.ew).toBe(13)
      expect(s.lastTrick?.no).toBe(13)
    }
  })
})

describe('bridge defense is partner-aware (review §5)', () => {
  it('last seat does not overtake a partner who is winning: plays low', () => {
    // W led A♥... no: N led, E plays K♠ winning, S low, W last holds A♠.
    const v = view({ seat: 'W', hand: cs('A♠ 4♠ 9♦'), trick: plays('2♠ K♠ 3♠', 'N') })
    const ch = defend(v)
    expect(ch.card.id).toBe('4♠')
    expect(ch.why).toMatch(/PARTNER EAST ALREADY WINNING/)
  })
  it('last seat void does not ruff partner’s winner: discards a non-trump', () => {
    const v = view({ seat: 'W', trump: '♥', hand: cs('2♥ 9♦ 3♣'), trick: plays('2♠ A♠ 3♠', 'N') })
    const ch = defend(v)
    expect(ch.card.suit).not.toBe('♥')
  })
  it('ruffs cheaply when the opponents are winning in fourth seat', () => {
    const v = view({ seat: 'W', trump: '♥', hand: cs('2♥ 9♥ 3♣'), trick: plays('2♠ 3♠ A♠', 'N') })
    expect(defend(v).card.id).toBe('2♥')
  })
  it('third seat: partner winning but dummy can still beat it → plays a card that holds over dummy', () => {
    // E led Q♠, S played 2♠, W third, N (dummy) still to play with K♠.
    const v = view({ seat: 'W', hand: cs('A♠ 5♠'), dummy: cs('K♠ 3♦'), trick: plays('Q♠ 2♠', 'E') })
    expect(defend(v).card.id).toBe('A♠')
  })
  it('third seat: partner safely winning against visible dummy → plays low', () => {
    const v = view({ seat: 'W', hand: cs('K♠ 5♠'), dummy: cs('J♠ 3♦'), trick: plays('A♠ 2♠', 'E') })
    expect(defend(v).card.id).toBe('5♠')
  })
  it('opening lead prefers the top of a sequence', () => {
    const v = view({ seat: 'E', trump: '♠', hand: cs('K♦ Q♦ 4♦ 7♣ 6♣ 5♣ 4♣ 3♥') })
    expect(defend(v).card.id).toBe('K♦')
  })
  it('opening lead avoids a long suit that dummy can ruff', () => {
    const v = view({
      seat: 'E',
      trump: '♠',
      hand: cs('9♦ 4♦ 8♣ 7♣ 6♣ 5♣ 4♣ 3♥'),
      dummy: cs('A♠ K♠ 2♥ 4♥ 2♦'),
      played: new Set(['9♥']),
    })
    expect(defend(v).card.suit).toBe('♦')
  })
  it('leads a suit partner has shown out of so partner can ruff', () => {
    const v = view({
      seat: 'E',
      trump: '♠',
      hand: cs('8♣ 3♣ 9♦ 7♦ 6♦ 5♦'),
      voids: { N: [], E: [], S: [], W: ['♣'] },
      played: new Set(['A♣']),
    })
    expect(defend(v).card.suit).toBe('♣')
  })
  it('defender view never includes declarer’s hand', () => {
    const s = startPlay(deal(5), 3, 'NT')
    const v = defView(s, 'W')
    expect(v.dummy).toBeNull() // dummy is not exposed before the opening lead
    expect(Object.keys(v)).not.toContain('hands')
  })
})
