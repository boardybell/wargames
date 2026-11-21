import { describe, expect, it } from 'vitest'
import {
  FLOOR,
  aiBetAfterCheck,
  aiCallBet,
  aiHolds,
  canAfford,
  cards,
  evaluate,
  explain,
  handName,
  settlePot,
  showdown,
} from '@app/game/games/engines/poker'

const all = new Set([0, 1, 2, 3, 4])

describe('WOPR keeps made hands', () => {
  it.each([
    ['mixed-suit straight', '5♠ 6♥ 7♦ 8♣ 9♠', 'STRAIGHT'],
    ['wheel', 'A♣ 2♦ 3♥ 4♠ 5♣', 'STRAIGHT'],
    ['flush', '2♥ 7♥ 9♥ J♥ K♥', 'FLUSH'],
    ['full house', '7♠ 7♥ 7♦ 5♣ 5♠', 'FULL HOUSE'],
    ['quads', '9♠ 9♥ 9♦ 9♣ 2♠', 'FOUR OF A KIND'],
  ])('%s is held whole', (_name, hand, label) => {
    const h = cards(hand)
    expect(evaluate(h).label).toBe(label)
    expect(aiHolds(h)).toEqual(all)
  })
  it('the wheel ranks five high, below a six-high straight', () => {
    expect(evaluate(cards('A♣ 2♦ 3♥ 4♠ 5♣')).tiebreak).toEqual([5])
    expect(showdown(cards('2♣ 3♦ 4♥ 5♠ 6♣'), cards('A♣ 2♦ 3♥ 4♠ 5♣')).result).toBeGreaterThan(0)
  })
  it('keeps pair / two pair / trips, then four-card draws', () => {
    expect(aiHolds(cards('K♠ K♥ 2♦ 7♣ 9♠'))).toEqual(new Set([0, 1]))
    expect(aiHolds(cards('K♠ K♥ 2♦ 2♣ 9♠'))).toEqual(new Set([0, 1, 2, 3]))
    expect(aiHolds(cards('4♠ 4♥ 4♦ 8♣ J♠'))).toEqual(new Set([0, 1, 2]))
    expect(aiHolds(cards('2♥ 7♥ 9♥ J♥ K♠'))).toEqual(new Set([0, 1, 2, 3]))
    expect(aiHolds(cards('5♠ 6♥ 7♦ 8♣ K♠'))).toEqual(new Set([0, 1, 2, 3]))
    expect(aiHolds(cards('2♠ 5♥ 9♦ J♣ K♠'))).toEqual(new Set([3, 4]))
  })
})

describe('showdown explanation', () => {
  it('names the decisive kicker', () => {
    const sd = showdown(cards('5♠ 5♥ A♦ 7♣ 3♠'), cards('5♦ 5♣ K♦ 7♥ 3♥'))
    expect(sd.result).toBeGreaterThan(0)
    expect(handName(sd.you)).toBe('PAIR OF FIVES')
    expect(sd.decisive).toBe('PAIR OF FIVES. ACE KICKER WINS.')
  })
  it('names the category when categories differ', () => {
    expect(explain(evaluate(cards('2♥ 7♥ 9♥ J♥ K♥')), evaluate(cards('5♠ 6♥ 7♦ 8♣ 9♠')))).toBe('FLUSH BEATS STRAIGHT.')
  })
  it('names the higher primary rank', () => {
    expect(explain(evaluate(cards('K♠ K♥ 2♦ 7♣ 9♠')), evaluate(cards('5♦ 5♣ A♦ 7♥ 3♥')))).toBe('PAIR OF KINGS BEATS PAIR OF FIVES.')
    expect(handName(evaluate(cards('7♠ 7♥ 7♦ 5♣ 5♠')))).toBe('FULL HOUSE, SEVENS OVER FIVES')
  })
  it('two pair decided by the second pair', () => {
    expect(explain(evaluate(cards('K♠ K♥ 9♦ 9♣ 2♠')), evaluate(cards('K♦ K♣ 5♦ 5♣ A♠')))).toBe('BOTH KINGS UP. NINES SECOND PAIR WINS.')
  })
  it('true ties report identical ranks', () => {
    const sd = showdown(cards('5♠ 6♥ 7♦ 8♣ 9♠'), cards('5♥ 6♦ 7♣ 8♠ 9♥'))
    expect(sd.result).toBe(0)
    expect(sd.decisive).toMatch(/^IDENTICAL RANKS/)
  })
})

describe('QUICK DRAW stake', () => {
  it('enforces the bankroll floor of ante plus one bet', () => {
    expect(FLOOR).toBe(15)
    expect(canAfford(15)).toBe(true)
    expect(canAfford(14)).toBe(false)
  })
  it('settles the pot from the player view', () => {
    // ante 5 each + bet 10 each: pot 30, you put in 15.
    expect(settlePot(30, 15, 'you')).toBe(15)
    expect(settlePot(30, 15, 'wopr')).toBe(-15)
    expect(settlePot(30, 15, 'tie')).toBe(0)
    expect(settlePot(10, 5, 'wopr')).toBe(-5)
  })
  it('WOPR bets strong hands, folds weak ones to a bet, respects a pat opponent', () => {
    const trips = evaluate(cards('4♠ 4♥ 4♦ 8♣ J♠'))
    const junk = evaluate(cards('2♠ 5♥ 9♦ J♣ K♠'))
    const twoPair = evaluate(cards('K♠ K♥ 2♦ 2♣ 9♠'))
    expect(aiBetAfterCheck(trips, 3, 0.9)).toBe('bet')
    expect(aiCallBet(junk, 1, 0.9)).toBe('fold')
    expect(aiCallBet(twoPair, 3, 0.9)).toBe('call')
    expect(aiBetAfterCheck(twoPair, 0, 0.9)).toBe('check')
  })
})
