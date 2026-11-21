import { describe, expect, it } from 'vitest'
import {
  actionProblem,
  aiChoose,
  debrief,
  headline,
  initialState,
  judge,
  MAX_TURNS,
  playTurn,
  posture,
  scripted,
  spreadPlan,
  type State,
} from '@app/game/games/engines/theaterwide-biochem'
import { rng } from '@app/game/games/hooks'

const HOLD = { kind: 'HOLD', target: null } as const
const withContam = (s: State, c: number[]): State => ({ ...s, regions: c.map((contam) => ({ contam, defended: false })) })

describe('theaterwide biochem: outcomes are typed and explained', () => {
  it('exactly 40 survives; below 40 collapses', () => {
    expect(judge(40, 40, 1)).toBeNull()
    expect(judge(39, 80, 1)).toMatchObject({ outcome: 'lose', reason: 'own-collapse', usPop: 39, aiPop: 80 })
    expect(judge(80, 39, 1)).toMatchObject({ outcome: 'win', reason: 'enemy-collapse' })
    expect(judge(39, 39, 1)).toMatchObject({ outcome: 'lose', reason: 'mutual-collapse' })
  })

  it('ceasefire: lead of more than 10 wins, otherwise parity', () => {
    expect(judge(90, 79, MAX_TURNS)).toMatchObject({ outcome: 'win', reason: 'ceasefire-advantage', leader: 'US' })
    expect(judge(90, 80, MAX_TURNS)).toMatchObject({ outcome: 'draw', reason: 'ceasefire-parity' })
    const behind = judge(70, 95, MAX_TURNS)!
    expect(behind).toMatchObject({ outcome: 'lose', reason: 'ceasefire-advantage', leader: 'AI', usPop: 70, aiPop: 95 })
    // A healthy side losing by comparison is told so, not POPULATION COLLAPSE.
    expect(headline(behind)).toBe('CEASEFIRE. ENEMY POPULATION LEADS.')
    expect(judge(90, 79, MAX_TURNS - 1)).toBeNull()
  })

  it('every result carries both final populations and a factual debrief', () => {
    const rand = rng(99)
    let s = initialState()
    while (!s.result) s = playTurn(s, s.usStock > 0 && s.turn % 3 === 1 ? { kind: 'DEPLOY', target: 3 } : HOLD, rand).state
    expect(s.result.usPop).toBe(s.usPop)
    expect(s.result.aiPop).toBe(s.aiPop)
    const d = debrief(s).join(' ')
    expect(d).toMatch(/ESCALATION ENDED AT \d\/5, PEAK \d/)
    expect(d).toContain(`LOSSES: FRIENDLY ${100 - s.usPop}, ENEMY ${100 - s.aiPop}`)
    expect(d).toContain(`SURVIVING POPULATION: FRIENDLY ${s.usPop}, ENEMY ${s.aiPop}`)
  })
})

describe('theaterwide biochem: DEFEND is a real shield', () => {
  // escalation 3 = HOSTILE: strikes HOME HEARTLAND on a roll under 0.6.
  const hostile: State = { ...initialState(), escalation: 3 }
  // rand order: WOPR strike check, then scrub roll (if any), then deploy roll.
  it('halves an incoming deployment into the defended region', () => {
    const open = playTurn(hostile, HOLD, scripted([0.1, 0.5])).report
    const shielded = playTurn(hostile, { kind: 'DEFEND', target: 1 }, scripted([0.1, 0, 0.5])).report
    const o = open.deployments.find((d) => d.by === 'AI')!
    const d = shielded.deployments.find((x) => x.by === 'AI')!
    expect(o.halved).toBe(false)
    expect(d.halved).toBe(true)
    expect(d.rolled).toBe(o.rolled)
    expect(d.applied).toBe(Math.floor(o.rolled / 2))
  })

  it('blocks spread into and out of the defended region', () => {
    const plan = spreadPlan([0, 0, 60, 0, 0], [false, true, false, false, false])
    expect(plan).toEqual([{ from: 2, to: 3, amount: 10 }])
    expect(spreadPlan([0, 60, 0, 0, 0], [false, true, false, false, false])).toEqual([])
  })
})

describe('theaterwide biochem: escalation persists and drives the declared posture', () => {
  it('rises on deployment and falls after two restraint turns', () => {
    const calmAi = () => 0.99 // WOPR never strikes; scrub/deploy rolls at max
    let s = initialState()
    expect(s.escalation).toBe(1)
    s = playTurn(s, { kind: 'DEPLOY', target: 3 }, calmAi).state
    expect(s.escalation).toBe(3)
    s = playTurn(s, HOLD, calmAi).state
    expect(s.escalation).toBe(3)
    s = playTurn(s, HOLD, calmAi).state
    expect(s.escalation).toBe(2)
    expect(s.peakEscalation).toBe(3)
  })

  it('a WOPR deployment adds one', () => {
    const s = { ...initialState(), escalation: 3, restraint: 0 }
    const { state, report } = playTurn(s, HOLD, scripted([0.1, 0.5]))
    expect(report.ai[0]!.kind).toBe('DEPLOY')
    expect(state.escalation).toBe(4)
  })

  it('posture changes with escalation; RETALIATORY fires a salvo', () => {
    expect(posture(0).name).toBe('CALM')
    expect(posture(0).targets).toEqual([2])
    expect(posture(3).targets).toEqual([1])
    expect(posture(4).targets).toEqual([1, 0])
    const salvo = aiChoose({ ...initialState(), escalation: 4 }, () => 0.1)
    expect(salvo.map((a) => a.target)).toEqual([1, 0])
    const quiet = aiChoose(withContam({ ...initialState(), escalation: 0 }, [0, 0, 0, 50, 10]), () => 0.9)
    expect(quiet).toEqual([{ kind: 'DEFEND', target: 3 }])
  })

  it('salvo cannot exceed the enemy stockpile', () => {
    const a = aiChoose({ ...initialState(), escalation: 5, aiStock: 1 }, () => 0.1)
    expect(a).toHaveLength(1)
  })
})

describe('theaterwide biochem: action gating', () => {
  it('explains why EXECUTE is unavailable', () => {
    const s = initialState()
    expect(actionProblem(s, { kind: 'DEPLOY', target: null })).toBe('SELECT AN ENEMY OR NEUTRAL REGION')
    expect(actionProblem(s, { kind: 'DEFEND', target: null })).toBe('SELECT A FRIENDLY OR NEUTRAL REGION')
    expect(actionProblem(s, { kind: 'DEPLOY', target: 1 })).toBe('REGION NOT ELIGIBLE FOR THIS ACTION')
    expect(actionProblem({ ...s, usStock: 0 }, { kind: 'DEPLOY', target: 3 })).toBe('STOCKPILE EMPTY')
    expect(actionProblem(s, HOLD)).toBeNull()
  })
})
