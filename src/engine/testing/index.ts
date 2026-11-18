// The permanent test-double mission (amendment 5): exported for every
// downstream split's test tree, excluded from the shipped public
// surface and the production bundle. It exercises the full lifecycle:
// both terminal causes, a clues() path, consequence emission, a
// timerMilestone schedule, and a reference-only substate schema. It
// also records every input it sees so tests can prove missions receive
// draws and times only through events.
import * as v from 'valibot'
import type {
  EvaluatedOutcome,
  FoldedConsequences,
  MissionEvent,
  MissionModule,
  SeedDefinition,
} from '../missions/types'
import type {
  SettledOutcome,
  SettlementCause,
} from '../campaign/types'
import type { EngineContext } from '../campaign/engine'
import type { ScheduledEventSpec } from '../time'
import type { EvidenceRecord } from '../records'

export interface TestDoubleState {
  delivered: number
  goal: number
  decoySent: boolean
  poisoned: boolean
  auditRead: boolean
  inbound: Record<string, number>
  /** Every event input observed, proving nothing arrives ambiently. */
  inputLog: string[]
}

export const testDoubleSchema = v.strictObject({
  delivered: v.pipe(v.number(), v.integer()),
  goal: v.pipe(v.number(), v.integer()),
  decoySent: v.boolean(),
  poisoned: v.boolean(),
  auditRead: v.boolean(),
  inbound: v.record(v.string(), v.pipe(v.number(), v.integer())),
  inputLog: v.array(v.string()),
})

export type TestDoubleAction =
  | { kind: 'DELIVER' }
  | { kind: 'DECOY' }
  | { kind: 'POISON' }
  | { kind: 'READ_AUDIT' }

const CONSEQUENCE_MAGNITUDES: Record<string, number> = {
  alpha: 30,
  beta: 20,
  gamma: 5,
}

export function makeTestDoubleMission(
  id: string,
): MissionModule<TestDoubleState> {
  return {
    id,
    init(
      _seed: SeedDefinition,
      consequences: FoldedConsequences,
      _durationMs: number,
    ): TestDoubleState {
      return {
        delivered: 0,
        goal: 3,
        decoySent: false,
        poisoned: false,
        auditRead: false,
        inbound: { ...consequences.byKind },
        inputLog: [],
      }
    },
    validate(state, payload) {
      const action = payload as TestDoubleAction
      if (!action || typeof action.kind !== 'string') {
        return { valid: false, reason: 'MALFORMED ACTION' }
      }
      if (!['DELIVER', 'DECOY', 'POISON', 'READ_AUDIT'].includes(action.kind)) {
        return { valid: false, reason: 'UNKNOWN KIND' }
      }
      if (action.kind === 'DELIVER' && state.delivered >= state.goal) {
        return { valid: false, reason: 'GOAL ALREADY MET' }
      }
      return { valid: true }
    },
    reduce(state, event: MissionEvent): TestDoubleState {
      const drawn = (event.payload as { drawnValue?: number } | null)
        ?.drawnValue
      const logged = {
        ...state,
        inputLog: [
          ...state.inputLog,
          `${event.type}:${event.id}@${event.now}` +
            (drawn === undefined ? '' : `#${drawn}`),
        ],
      }
      if (event.type === 'action') {
        const action = event.payload as TestDoubleAction
        if (action.kind === 'DELIVER') {
          return { ...logged, delivered: logged.delivered + 1 }
        }
        if (action.kind === 'DECOY') return { ...logged, decoySent: true }
        if (action.kind === 'POISON') return { ...logged, poisoned: true }
        if (action.kind === 'READ_AUDIT') return { ...logged, auditRead: true }
      }
      return logged
    },
    evaluate(state, cause: SettlementCause): EvaluatedOutcome {
      const tier =
        state.delivered >= state.goal
          ? 'full'
          : state.delivered === 2
            ? 'partial'
            : state.delivered === 1
              ? 'poor'
              : 'failed'
      return {
        missionId: id,
        cause,
        tier,
        metrics: {
          wopr_resolved: state.goal - state.delivered,
          service_cost: (state.goal - state.delivered) * 10,
        },
        clueId: state.auditRead ? `clue-${id}` : null,
        consequences:
          tier === 'full'
            ? []
            : [
                {
                  id: `cq-${id}`,
                  kind: 'commsDelayed',
                  magnitude: CONSEQUENCE_MAGNITUDES[id] ?? 10,
                },
              ],
      }
    },
    terminal(state) {
      if (state.poisoned) return 'collapsed'
      if (state.delivered >= state.goal) return 'completed'
      return null
    },
    clues(state) {
      return state.auditRead ? [`clue-${id}`] : []
    },
    debrief(outcome: SettledOutcome) {
      return {
        missionId: outcome.missionId,
        headline: `${outcome.tier.toUpperCase()} (${outcome.cause.toUpperCase()})`,
        lines: [
          `DELIVERED METRIC SERVICE COST ${outcome.metrics['service_cost'] ?? 0}`,
        ],
        clueId: outcome.clueId,
      }
    },
    saveSchema: testDoubleSchema,
  }
}

const TEST_SCHEDULE: ScheduledEventSpec[] = [
  {
    id: 'warn-30',
    offsetSeconds: 30,
    anchor: 'end',
    kind: 'timerMilestone',
    payload: null,
  },
  {
    id: 'warn-10',
    offsetSeconds: 10,
    anchor: 'end',
    kind: 'timerMilestone',
    payload: null,
  },
  {
    id: 'mid-stage',
    offsetSeconds: 60,
    anchor: 'start',
    kind: 'stage',
    payload: { draw: { min: 1, max: 6 } },
  },
]

export const TEST_DOUBLE_SCHEDULE = TEST_SCHEDULE

/** A ready-to-use context over three test-double missions and the
 *  supplied record graph; the campaign and downstream suites build on
 *  this one helper. */
export function buildTestContext(
  records: readonly EvidenceRecord[],
  overrides: Partial<SeedDefinition> = {},
  ctxOverrides: Partial<Pick<EngineContext, 'missions' | 'missionOrder'>> = {},
): EngineContext {
  const seed: SeedDefinition = {
    name: 'test-seed',
    description: 'test-double fixture seed',
    seedNumber: 1984,
    exerciseRunId: 'R04',
    records,
    deskChecks: [],
    clueRecords: [],
    missionPayloads: { alpha: null, beta: null, gamma: null },
    schedules: { alpha: TEST_SCHEDULE, beta: [], gamma: [] },
    missionDurationsMs: { alpha: 240_000, beta: 240_000, gamma: 240_000 },
    openExceptionsBaseline: 12,
    ...overrides,
  }
  return {
    seeds: { [seed.name]: seed },
    missions: ctxOverrides.missions ?? {
      alpha: makeTestDoubleMission('alpha'),
      beta: makeTestDoubleMission('beta'),
      gamma: makeTestDoubleMission('gamma'),
    },
    missionOrder: ctxOverrides.missionOrder ?? ['alpha', 'beta', 'gamma'],
  }
}
