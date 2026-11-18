// Minimal stub mission for campaign-machine specs: deliver 3 of 5
// tokens before the deadline, one decoy, one consequence emitted.
// Section 06 supersedes it with the permanent test double.
import * as v from 'valibot'
import type {
  FoldedConsequences,
  MissionEvent,
  MissionModule,
  SeedDefinition,
} from '@engine/missions/types'
import type { SettledOutcome, SettlementCause } from '@engine/campaign/types'

export interface StubState {
  delivered: number
  goal: number
  decoySent: boolean
  poisoned: boolean
  auditRead: boolean
  inbound: Record<string, number>
}

const stubSchema = v.object({
  delivered: v.pipe(v.number(), v.integer()),
  goal: v.pipe(v.number(), v.integer()),
  decoySent: v.boolean(),
  poisoned: v.boolean(),
  auditRead: v.boolean(),
  inbound: v.record(v.string(), v.pipe(v.number(), v.integer())),
})

export type StubAction =
  | { kind: 'DELIVER' }
  | { kind: 'DECOY' }
  | { kind: 'POISON' }
  | { kind: 'READ_AUDIT' }

export function makeStubMission(id: string): MissionModule<StubState> {
  return {
    id,
    init(
      _seed: SeedDefinition,
      consequences: FoldedConsequences,
      _durationMs: number,
    ): StubState {
      return {
        delivered: 0,
        goal: 3,
        decoySent: false,
        poisoned: false,
        auditRead: false,
        inbound: { ...consequences.byKind },
      }
    },
    validate(state, payload) {
      const action = payload as StubAction
      if (!action || typeof action.kind !== 'string') {
        return { valid: false, reason: 'MALFORMED ACTION' }
      }
      if (action.kind === 'DELIVER' && state.delivered >= state.goal) {
        return { valid: false, reason: 'GOAL ALREADY MET' }
      }
      return { valid: true }
    },
    reduce(state, event: MissionEvent): StubState {
      if (event.type === 'action') {
        const action = event.payload as StubAction
        if (action.kind === 'DELIVER') {
          return { ...state, delivered: state.delivered + 1 }
        }
        if (action.kind === 'DECOY') return { ...state, decoySent: true }
        if (action.kind === 'POISON') return { ...state, poisoned: true }
        if (action.kind === 'READ_AUDIT') return { ...state, auditRead: true }
      }
      return state
    },
    evaluate(state, cause: SettlementCause): SettledOutcome {
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
                  magnitude: ({ alpha: 30, beta: 20, gamma: 5 } as Record<string, number>)[id] ?? 10,
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
    saveSchema: stubSchema,
  }
}
