// THEATERWIDE BIOTOXIC AND CHEMICAL WARFARE rules engine
// (docs/games-design-review.md §14). Pure; randomness comes from `rand`.
//
// Five regions in a chain. You hold NORTH BASIN and HOME HEARTLAND, the enemy
// holds ENEMY HEARTLAND and SOUTH FRONTIER, CENTRAL CORRIDOR is neutral.
//
// TURN ORDER (documented in HOW TO PLAY):
//   1. WOPR's action follows its DECLARED POSTURE, which comes from the
//      escalation level at the start of the turn (shown before you choose):
//      a strike chance and target list. At RETALIATORY (4+) a strike is a
//      two-agent salvo on HOME HEARTLAND and NORTH BASIN. When it does not
//      strike it decontaminates its worst region at 30+, otherwise holds.
//   2. DEFEND actions: the defended region is scrubbed (-25..-39) and for this
//      turn takes only HALF of any agent deployed into it, receives no spread
//      and sends none.
//   3. DEPLOY actions: +40..+59 contamination on the target (halved if defended).
//   4. SPREAD: every undefended region at 20+ adds floor(level / 6) to each
//      undefended neighbor.
//   5. DECAY: undefended regions lose 5.
//   6. CASUALTIES: each side loses floor(level / 12) population per region it holds.
//   7. ESCALATION: +2 when you deploy, +1 when WOPR deploys; two consecutive turns
//      without your deployment lower it by 1. Range 0..5.
//   8. OUTCOME: a side below 40 has collapsed (40 itself survives). After turn
//      12, CEASEFIRE: a lead of more than 10 wins, otherwise parity.

export type Side = 'US' | 'AI'
export type ActionKind = 'DEPLOY' | 'DEFEND' | 'HOLD'
export interface Action {
  readonly kind: ActionKind
  readonly target: number | null
}

export const REGION_NAMES = ['NORTH BASIN', 'HOME HEARTLAND', 'CENTRAL CORRIDOR', 'ENEMY HEARTLAND', 'SOUTH FRONTIER'] as const
export const REGION_SHORT = ['N BASIN', 'HOME', 'CORRIDOR', 'ENEMY', 'S FRONT'] as const
export const REGION_SIDE: readonly (Side | 'N')[] = ['US', 'US', 'N', 'AI', 'AI']
export const REGION_COUNT = 5
export const START_POP = 100
export const SURVIVE_AT = 40
export const MAX_TURNS = 12
export const START_STOCKPILE = 5
export const CEASEFIRE_MARGIN = 10
export const MAX_ESCALATION = 5
export const START_ESCALATION = 1
export const SPREAD_FROM = 20
export const DECAY = 5
export const DEPLOY_BASE = 40
export const DEPLOY_SPAN = 20 // +0..19
export const SCRUB_BASE = 25
export const SCRUB_SPAN = 15 // +0..14
export const RESTRAINT_TURNS = 2

export interface Region {
  readonly contam: number
  /** Defended during the most recent turn (display only; defense lasts one turn). */
  readonly defended: boolean
}

export type EndReason = 'own-collapse' | 'enemy-collapse' | 'mutual-collapse' | 'ceasefire-advantage' | 'ceasefire-parity'
export interface Result {
  readonly outcome: 'win' | 'lose' | 'draw'
  readonly reason: EndReason
  /** For ceasefire-advantage: who leads. */
  readonly leader: Side | null
  readonly usPop: number
  readonly aiPop: number
}

export interface State {
  readonly regions: readonly Region[]
  readonly usPop: number
  readonly aiPop: number
  readonly usStock: number
  readonly aiStock: number
  /** Turn about to be played, 1-based. */
  readonly turn: number
  readonly escalation: number
  readonly peakEscalation: number
  /** Consecutive turns without your deployment (resets when it lowers escalation). */
  readonly restraint: number
  readonly deploys: { readonly us: number; readonly ai: number }
  readonly result: Result | null
}

export function initialState(): State {
  return {
    regions: REGION_NAMES.map(() => ({ contam: 0, defended: false })),
    usPop: START_POP,
    aiPop: START_POP,
    usStock: START_STOCKPILE,
    aiStock: START_STOCKPILE,
    turn: 1,
    escalation: START_ESCALATION,
    peakEscalation: START_ESCALATION,
    restraint: 0,
    deploys: { us: 0, ai: 0 },
    result: null,
  }
}

export const neighbors = (i: number): number[] => [i - 1, i + 1].filter((n) => n >= 0 && n < REGION_COUNT)
const randInt = (rand: () => number, n: number): number => Math.floor(rand() * n)

/** Regions you may target with an action. */
export function eligibleTargets(kind: ActionKind): number[] {
  const all = [0, 1, 2, 3, 4]
  if (kind === 'DEPLOY') return all.filter((i) => REGION_SIDE[i] !== 'US')
  if (kind === 'DEFEND') return all.filter((i) => REGION_SIDE[i] !== 'AI')
  return []
}

/** Why the action cannot be executed, or null. */
export function actionProblem(s: State, a: Action): string | null {
  if (s.result) return 'THE CONFLICT IS OVER'
  if (a.kind === 'HOLD') return null
  if (a.kind === 'DEPLOY' && s.usStock <= 0) return 'STOCKPILE EMPTY'
  if (a.target === null) return a.kind === 'DEPLOY' ? 'SELECT AN ENEMY OR NEUTRAL REGION' : 'SELECT A FRIENDLY OR NEUTRAL REGION'
  if (!eligibleTargets(a.kind).includes(a.target)) return 'REGION NOT ELIGIBLE FOR THIS ACTION'
  return null
}

// ---------------------------------------------------------------- WOPR posture
export interface Posture {
  readonly level: number
  readonly name: string
  /** Chance WOPR deploys this turn (if it has stockpile). */
  readonly strike: number
  /** Regions hit when it deploys (a salvo spends one agent per region). */
  readonly targets: readonly number[]
}
const POSTURES: readonly Omit<Posture, 'level'>[] = [
  { name: 'CALM', strike: 0.05, targets: [2] },
  { name: 'WARY', strike: 0.15, targets: [2] },
  { name: 'GUARDED', strike: 0.35, targets: [2] },
  { name: 'HOSTILE', strike: 0.6, targets: [1] },
  { name: 'RETALIATORY', strike: 0.85, targets: [1, 0] },
  { name: 'RETALIATORY', strike: 0.95, targets: [1, 0] },
]
export function posture(escalation: number): Posture {
  const l = Math.max(0, Math.min(MAX_ESCALATION, escalation))
  return { level: l, ...POSTURES[l]! }
}
/** WOPR cleans its worst region when it reaches this level and it does not strike. */
export const AI_DECON_AT = 30

/**
 * WOPR's actions for this turn: declared posture + start-of-turn map only.
 * A strike deploys on each posture target while stockpile lasts.
 */
export function aiChoose(s: State, rand: () => number): Action[] {
  const p = posture(s.escalation)
  if (s.aiStock > 0 && rand() < p.strike) {
    return p.targets.slice(0, s.aiStock).map((t) => ({ kind: 'DEPLOY' as const, target: t }))
  }
  const worst = [3, 4].sort((a, b) => s.regions[b]!.contam - s.regions[a]!.contam)[0]!
  if (s.regions[worst]!.contam >= AI_DECON_AT) return [{ kind: 'DEFEND', target: worst }]
  return [{ kind: 'HOLD', target: null }]
}

// ---------------------------------------------------------------- spread
/** Spread each region would send to each neighbor given contamination and defenses. */
export function spreadPlan(contam: readonly number[], defended: readonly boolean[]): { from: number; to: number; amount: number }[] {
  const out: { from: number; to: number; amount: number }[] = []
  contam.forEach((c, i) => {
    if (c < SPREAD_FROM || defended[i]) return
    for (const n of neighbors(i)) if (!defended[n]) out.push({ from: i, to: n, amount: Math.floor(c / 6) })
  })
  return out
}

export const damageOf = (contam: number): number => Math.floor(contam / 12)

// ---------------------------------------------------------------- turn
export interface Deployment {
  readonly by: Side
  readonly target: number
  readonly rolled: number
  readonly applied: number
  readonly halved: boolean
}
export interface Scrub {
  readonly by: Side
  readonly target: number
  readonly amount: number
}
export interface TurnReport {
  readonly turn: number
  readonly us: Action
  readonly ai: readonly Action[]
  readonly posture: Posture
  readonly deployments: readonly Deployment[]
  readonly scrubs: readonly Scrub[]
  readonly spread: readonly { from: number; to: number; amount: number }[]
  readonly damage: { readonly us: number; readonly ai: number }
  readonly escalation: { readonly before: number; readonly after: number }
  readonly result: Result | null
}

export function playTurn(s: State, us: Action, rand: () => number): { state: State; report: TurnReport } {
  const problem = actionProblem(s, us)
  if (problem) throw new Error(problem)
  const pos = posture(s.escalation)
  const ai = aiChoose(s, rand)
  const orders: (readonly [Side, Action])[] = [['US', us], ...ai.map((a) => ['AI', a] as const)]
  const contam = s.regions.map((r) => r.contam)
  const defended = contam.map(() => false)
  const scrubs: Scrub[] = []
  const deployments: Deployment[] = []

  // 2. Defenses first.
  for (const [by, a] of orders) {
    if (a.kind !== 'DEFEND' || a.target === null) continue
    const amount = SCRUB_BASE + randInt(rand, SCRUB_SPAN)
    defended[a.target] = true
    contam[a.target] = Math.max(0, contam[a.target]! - amount)
    scrubs.push({ by, target: a.target, amount })
  }
  // 3. Deployments, halved into a defended region.
  for (const [by, a] of orders) {
    if (a.kind !== 'DEPLOY' || a.target === null) continue
    const rolled = DEPLOY_BASE + randInt(rand, DEPLOY_SPAN)
    const halved = defended[a.target]!
    const applied = halved ? Math.floor(rolled / 2) : rolled
    contam[a.target] = Math.min(100, contam[a.target]! + applied)
    deployments.push({ by, target: a.target, rolled, applied, halved })
  }
  // 4. Spread.
  const spread = spreadPlan(contam, defended)
  for (const sp of spread) contam[sp.to] = Math.min(100, contam[sp.to]! + sp.amount)
  // 5. Decay.
  contam.forEach((c, i) => {
    if (!defended[i]) contam[i] = Math.max(0, c - DECAY)
  })
  // 6. Casualties.
  const damage = { us: 0, ai: 0 }
  contam.forEach((c, i) => {
    const side = REGION_SIDE[i]
    if (side === 'US') damage.us += damageOf(c)
    else if (side === 'AI') damage.ai += damageOf(c)
  })
  const usPop = Math.max(0, s.usPop - damage.us)
  const aiPop = Math.max(0, s.aiPop - damage.ai)
  // 7. Escalation.
  const usDeployed = us.kind === 'DEPLOY'
  const aiDeploys = ai.filter((a) => a.kind === 'DEPLOY').length
  const aiDeployed = aiDeploys > 0
  let escalation = s.escalation + (usDeployed ? 2 : 0) + (aiDeployed ? 1 : 0)
  let restraint = usDeployed ? 0 : s.restraint + 1
  if (restraint >= RESTRAINT_TURNS) {
    escalation -= 1
    restraint = 0
  }
  escalation = Math.max(0, Math.min(MAX_ESCALATION, escalation))
  // 8. Outcome.
  const result = judge(usPop, aiPop, s.turn)

  const state: State = {
    regions: contam.map((c, i) => ({ contam: c, defended: defended[i]! })),
    usPop,
    aiPop,
    usStock: s.usStock - (usDeployed ? 1 : 0),
    aiStock: s.aiStock - aiDeploys,
    turn: s.turn + 1,
    escalation,
    peakEscalation: Math.max(s.peakEscalation, escalation),
    restraint,
    deploys: { us: s.deploys.us + (usDeployed ? 1 : 0), ai: s.deploys.ai + aiDeploys },
    result,
  }
  return {
    state,
    report: {
      turn: s.turn,
      us,
      ai,
      posture: pos,
      deployments,
      scrubs,
      spread,
      damage,
      escalation: { before: s.escalation, after: escalation },
      result,
    },
  }
}

/** Outcome after a turn's casualties. */
export function judge(usPop: number, aiPop: number, turn: number): Result | null {
  const usDown = usPop < SURVIVE_AT
  const aiDown = aiPop < SURVIVE_AT
  const base = { usPop, aiPop, leader: null }
  if (usDown && aiDown) return { ...base, outcome: 'lose', reason: 'mutual-collapse' }
  if (aiDown) return { ...base, outcome: 'win', reason: 'enemy-collapse' }
  if (usDown) return { ...base, outcome: 'lose', reason: 'own-collapse' }
  if (turn < MAX_TURNS) return null
  if (usPop - aiPop > CEASEFIRE_MARGIN) return { ...base, outcome: 'win', reason: 'ceasefire-advantage', leader: 'US' }
  if (aiPop - usPop > CEASEFIRE_MARGIN) return { ...base, outcome: 'lose', reason: 'ceasefire-advantage', leader: 'AI' }
  return { ...base, outcome: 'draw', reason: 'ceasefire-parity' }
}

export function headline(r: Result): string {
  switch (r.reason) {
    case 'own-collapse':
      return 'YOUR POPULATION FELL BELOW 40. COLLAPSE.'
    case 'enemy-collapse':
      return 'ENEMY POPULATION FELL BELOW 40. YOU ENDURE.'
    case 'mutual-collapse':
      return 'BOTH POPULATIONS FELL BELOW 40. MUTUAL COLLAPSE.'
    case 'ceasefire-advantage':
      return r.leader === 'US' ? 'CEASEFIRE. YOUR POPULATION LEADS.' : 'CEASEFIRE. ENEMY POPULATION LEADS.'
    case 'ceasefire-parity':
      return 'CEASEFIRE. PARITY.'
  }
}

/** Factual debrief lines: outcome rule, escalation, losses, survivors. */
export function debrief(s: State): string[] {
  const r = s.result
  if (!r) return []
  const lines: string[] = []
  if (r.reason === 'ceasefire-advantage' || r.reason === 'ceasefire-parity') {
    const gap = Math.abs(r.usPop - r.aiPop)
    lines.push(
      r.reason === 'ceasefire-parity'
        ? `TURN ${MAX_TURNS} REACHED. GAP ${gap} IS NOT MORE THAN ${CEASEFIRE_MARGIN}.`
        : `TURN ${MAX_TURNS} REACHED. ${r.leader === 'US' ? 'YOU LEAD' : 'ENEMY LEADS'} BY ${gap}, MORE THAN ${CEASEFIRE_MARGIN}.`,
    )
  } else {
    lines.push(`ENDED ON TURN ${s.turn - 1}. A SIDE BELOW ${SURVIVE_AT} HAS COLLAPSED.`)
  }
  lines.push(`ESCALATION ENDED AT ${s.escalation}/${MAX_ESCALATION}, PEAK ${s.peakEscalation}. DEPLOYMENTS: YOU ${s.deploys.us}, WOPR ${s.deploys.ai}.`)
  lines.push(`LOSSES: FRIENDLY ${START_POP - r.usPop}, ENEMY ${START_POP - r.aiPop}.`)
  lines.push(`SURVIVING POPULATION: FRIENDLY ${r.usPop}, ENEMY ${r.aiPop}.`)
  return lines
}

export function scripted(values: readonly number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]!
}
