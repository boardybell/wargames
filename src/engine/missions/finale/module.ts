// The GLOBAL FAILSAFE finale mission module and its construction under mission
// id 'finale'. Pure: it reads authored record truth from the seed captured at
// construction and never touches Date, Math.random, or timers. The finale
// registers as a mission module for lifecycle purposes (row 4, unlocked when
// all three debriefs are acknowledged through the existing engine unlock
// selector); its three settlement outcomes are the endings.
//
// Substate is strictly reference-only: record ids in the slots and ordering, a
// typed { code, slot } rejection, booleans, integer counters. The case file
// (records, checks, clues, highlights) is campaign state the shell reads
// through selectors and threads into VALIDATE / REQUEST FIELD REPORT as a
// reference bundle; it is never copied into FinaleState. The comparison
// snapshot is engine-owned and lives outside mission substate entirely.
//
// Settlement is synchronous: COMMIT sets `committed` in the same reduce and
// terminal() returns non-null the instant it is set, so a commit landing in
// the same wake as the final-phase timeout wins deterministically (the engine
// polls terminal() after every reduce and drain, and the campaign settle guard
// is exactly-once). evaluate() maps timeout and forfeit onto the collapsed,
// repeated-order path.
import type {
  EvaluatedOutcome,
  FoldedConsequences,
  MissionEvent,
  MissionModule,
  SeedDefinition,
} from '../types'
import type { SettlementCause } from '../../campaign/types'
import type { ScheduledEventSpec } from '../../time'
import { buildRecordGraph } from '../../records'
import type { EvidenceRecord, RecordGraph } from '../../records'
import {
  validateCase,
  validateFinaleContent,
  fieldReportLegal,
} from './caseBuilder'
import { resolveEnding } from './endings'
import { finaleSaveSchema } from './types'
import type {
  CaseFileCheck,
  CommitChoice,
  FinaleCaseFile,
  FinaleSlot,
  FinaleState,
} from './types'

export const FINALE_MISSION_ID = 'finale'

const START_EVENT_ID = 'finale-start'
const START_EVENT_KIND = 'finaleStart'

/** Authored content the finale module needs at construction: the seed-wide
 *  record set (for the case-file graph and the parent-chain root), the
 *  exercise run id the observation is checked against, and the designated
 *  field-report record. Mirrors how the other modules close over a payload;
 *  section 04 assembles one per seed. */
export interface FinalePayload {
  readonly records: readonly EvidenceRecord[]
  readonly claimRunId: string
  readonly rootRecordId: string
  readonly fieldReportId: string
}

/** The schedule a seed authors for the finale. A start-anchored offset-0 event
 *  stamps the absolute deadline once time begins (start-anchored offsets scale
 *  under extended time). The 30 and 10 second warnings and finaleFinalPhase are
 *  end-anchored to endsAt and never scale (amendment 9). Section 04 wires the
 *  real near-end finaleFinalPhase offset; the seed catalog already authors a
 *  20-second end-anchored finaleFinalPhase for the shipped seeds. */
export function finaleSchedule(
  finalPhaseSecondsBeforeEnd: number,
  startOffsets: readonly number[] = [],
): readonly ScheduledEventSpec[] {
  const specs: ScheduledEventSpec[] = [
    {
      id: START_EVENT_ID,
      offsetSeconds: 0,
      anchor: 'start',
      kind: START_EVENT_KIND,
      payload: null,
    },
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
      id: 'final-phase',
      offsetSeconds: finalPhaseSecondsBeforeEnd,
      anchor: 'end',
      kind: 'finaleFinalPhase',
      payload: null,
    },
  ]
  startOffsets.forEach((offset, index) => {
    specs.push({
      id: `finale-beat-${index}`,
      offsetSeconds: offset,
      anchor: 'start',
      kind: 'timerMilestone',
      payload: null,
    })
  })
  return specs
}

interface FinaleAction {
  readonly kind?: string
  readonly slot?: FinaleSlot
  readonly recordId?: string | null
  readonly ordering?: readonly string[]
  readonly choice?: CommitChoice
  /** The live reference half of the case file the shell lifts from campaign
   *  selectors. Record ids and typed outcome codes only, never a reply body. */
  readonly caseFile?: {
    readonly sourceChecks?: readonly CaseFileCheck[]
    readonly inspectedRecords?: readonly string[]
  }
}

function isCommitChoice(value: unknown): value is CommitChoice {
  return value === 'staged' || value === 'hold' || value === 'repeat'
}

function isSlot(value: unknown): value is FinaleSlot {
  return (
    value === 'outlook' ||
    value === 'flights' ||
    value === 'bank' ||
    value === 'root' ||
    value === 'observation'
  )
}

/** Construct the GLOBAL FAILSAFE module over an authored payload. The record
 *  graph and the static case-file facts are built once; every method stays
 *  pure over (state, event). */
export function makeFinaleMission(
  payload: FinalePayload,
): MissionModule<FinaleState> {
  const graph: RecordGraph = buildRecordGraph(payload.records)

  function assembleCaseFile(action: FinaleAction): FinaleCaseFile {
    const live = action.caseFile ?? {}
    return {
      graph,
      claimRunId: payload.claimRunId,
      rootRecordId: payload.rootRecordId,
      fieldReportId: payload.fieldReportId,
      sourceChecks: live.sourceChecks ?? [],
      inspectedRecords: live.inspectedRecords ?? [],
    }
  }

  function select(
    state: FinaleState,
    slot: FinaleSlot,
    recordId: string,
  ): FinaleState {
    return { ...state, slots: { ...state.slots, [slot]: recordId } }
  }

  function clear(state: FinaleState, slot: FinaleSlot): FinaleState {
    return { ...state, slots: { ...state.slots, [slot]: null } }
  }

  function reorder(state: FinaleState, ordering: readonly string[]): FinaleState {
    return { ...state, ordering: [...ordering] }
  }

  /** VALIDATE: delegate to the shared validator and write caseValid and
   *  lastRejection. The recognition beat is NOT a separate persisted latch: it
   *  IS the caseValid false-to-true transition the line selectors (section 03)
   *  and shell (section 04) key on. It is therefore derivable from caseValid
   *  alone (false before this reduce, true after), fires exactly once because a
   *  re-validation of an already-valid case leaves caseValid true (no new
   *  transition), and emits no new EngineEvent kind (emitted stays a closed
   *  union). */
  function validate(state: FinaleState, action: FinaleAction): FinaleState {
    const result = validateCase(state, assembleCaseFile(action))
    if (result.ok) {
      return { ...state, caseValid: true, lastRejection: null }
    }
    return {
      ...state,
      caseValid: false,
      lastRejection: { code: result.code, slot: result.slot },
    }
  }

  /** REQUEST FIELD REPORT: legal only when no corroborated candidate exists.
   *  Illegal once one does (a no-op; the structured refusal is the unchanged
   *  state). Legal: set fieldReportRequested. The shell then dispatches the
   *  engine desk check (REQUEST_SOURCE_CHECK) against the designated record;
   *  CHECK SOURCE is engine-owned, so the reply joins campaign.sourceChecks and
   *  thereafter corroborates the observation slot. */
  function requestFieldReport(
    state: FinaleState,
    action: FinaleAction,
  ): FinaleState {
    if (!fieldReportLegal(state, assembleCaseFile(action))) return state
    return { ...state, fieldReportRequested: true }
  }

  /** COMMIT: set `committed` once; it never changes thereafter. Settlement is
   *  synchronous via terminal() polling the committed field in the same reduce. */
  function commit(state: FinaleState, choice: CommitChoice): FinaleState {
    if (state.committed !== null) return state
    return { ...state, committed: choice }
  }

  function reduceAction(state: FinaleState, event: MissionEvent): FinaleState {
    const base = state
    const action = (event.payload ?? {}) as FinaleAction
    switch (action.kind) {
      case 'SELECT': {
        if (!isSlot(action.slot) || typeof action.recordId !== 'string') {
          return base
        }
        return select(base, action.slot, action.recordId)
      }
      case 'CLEAR': {
        if (!isSlot(action.slot)) return base
        return clear(base, action.slot)
      }
      case 'REORDER': {
        if (!Array.isArray(action.ordering)) return base
        return reorder(base, action.ordering)
      }
      case 'VALIDATE':
        return validate(base, action)
      case 'REQUEST_FIELD_REPORT':
        return requestFieldReport(base, action)
      case 'RUN_COMPARISON':
        // Display-only bookkeeping. SECTION-02 SEAM: the real three-future
        // branch run is pure over the engine-owned snapshot (runBranch); this
        // module only counts the comparison and never mutates case state or
        // settles as a side effect.
        return { ...base, comparisonsRun: base.comparisonsRun + 1 }
      case 'COMMIT': {
        if (!isCommitChoice(action.choice)) return base
        return commit(base, action.choice)
      }
      default:
        return base
    }
  }

  return {
    id: FINALE_MISSION_ID,

    init(
      seed: SeedDefinition,
      _consequences: FoldedConsequences,
      durationMs: number,
    ): FinaleState {
      // Amendment 12 bounded wait, ENFORCED at construction: the designated
      // field-report record's authored desk delay must leave the decision
      // margin ahead of the materialized deadline (durationMs already doubled
      // under extended time). A seed whose field-report desk delay would let
      // REQUEST FIELD REPORT stall the player past the commit window is
      // rejected here; the engine maps the throw to a MISSION INIT FAILED
      // refusal rather than silently accepting an unwinnable finale.
      const contentErrors = validateFinaleContent(
        { fieldReportId: payload.fieldReportId, durationMs },
        seed.deskChecks,
      )
      if (contentErrors.length > 0) {
        throw new Error(
          `FINALE CONTENT INVALID: ${contentErrors
            .map((e) => `${e.code} ${e.detail}`)
            .join('; ')}`,
        )
      }
      return {
        slots: {
          outlook: null,
          flights: null,
          bank: null,
          root: null,
          observation: null,
        },
        ordering: [],
        caseValid: false,
        lastRejection: null,
        comparisonsRun: 0,
        fieldReportRequested: false,
        committed: null,
      }
    },

    validate(_state, payloadIn) {
      const action = payloadIn as FinaleAction | null
      if (!action || typeof action.kind !== 'string') {
        return { valid: false, reason: 'MALFORMED ACTION' }
      }
      switch (action.kind) {
        case 'SELECT': {
          if (!isSlot(action.slot)) {
            return { valid: false, reason: 'NO SLOT SELECTED' }
          }
          if (typeof action.recordId !== 'string') {
            return { valid: false, reason: 'NO RECORD SELECTED' }
          }
          return { valid: true }
        }
        case 'CLEAR': {
          if (!isSlot(action.slot)) {
            return { valid: false, reason: 'NO SLOT SELECTED' }
          }
          return { valid: true }
        }
        case 'REORDER': {
          if (!Array.isArray(action.ordering)) {
            return { valid: false, reason: 'NO ORDERING SUPPLIED' }
          }
          return { valid: true }
        }
        case 'VALIDATE':
        case 'REQUEST_FIELD_REPORT':
        case 'RUN_COMPARISON':
          return { valid: true }
        case 'COMMIT': {
          if (!isCommitChoice(action.choice)) {
            return { valid: false, reason: 'NO COMMIT CHOICE' }
          }
          return { valid: true }
        }
        default:
          return { valid: false, reason: 'UNKNOWN ACTION' }
      }
    },

    reduce(state, event: MissionEvent): FinaleState {
      // Scheduled events (start, warnings, finaleFinalPhase) carry no substate
      // change; the deadline is engine-owned (activeMission.endsAt) and the
      // shell reads each beat off the emitted event's identity.
      return event.type === 'scheduled' ? state : reduceAction(state, event)
    },

    evaluate(state, cause: SettlementCause): EvaluatedOutcome {
      // staged and hold commits settle completed; a repeat commit settles
      // collapsed; timeout and forfeit map onto the collapsed, repeated-order
      // path. terminal() already resolved a commit to its cause before the
      // engine reached any timeout, so the cause the engine hands evaluate is
      // authoritative; this guard only classifies the non-commit causes.
      const committed = state.committed
      const repeatedOrder =
        cause === 'timeout' || cause === 'forfeit' || committed === 'repeat'
      const tier = repeatedOrder ? 'failed' : 'full'
      // Section 02 wiring: resolveEnding is the pure cause-plus-action mapping
      // (staged->recovery, hold->containment, repeat/timeout/forfeit->failure).
      // The earned-why readback (deriveEarnedWhy) is derived shell-side from the
      // settled metrics; the endingId carried here is the selector it keys on.
      const endingId = resolveEnding(committed, cause).endingId
      return {
        missionId: FINALE_MISSION_ID,
        cause,
        tier,
        metrics: {
          committed_staged: committed === 'staged' ? 1 : 0,
          committed_hold: committed === 'hold' ? 1 : 0,
          committed_repeat: committed === 'repeat' ? 1 : 0,
          case_valid: state.caseValid ? 1 : 0,
          comparisons_run: state.comparisonsRun,
          field_report_requested: state.fieldReportRequested ? 1 : 0,
        },
        clueId: null,
        consequences: [],
        endingId,
      }
    },

    /** Polled after every reduce and drain. A commit settles synchronously:
     *  the instant `committed` is non-null terminal() returns, so the engine
     *  settles in the same reduce. staged and hold complete; repeat collapses.
     *  The commit-vs-timeout race is decided here for the commit: a terminal
     *  result is produced by the reduce that set `committed`, before any
     *  timeout settlement for a later same-wake event can run, and the campaign
     *  settle guard is exactly-once, so a timeout cannot override a committed
     *  recovery. */
    terminal(state) {
      if (state.committed === null) return null
      return state.committed === 'repeat' ? 'collapsed' : 'completed'
    },

    saveSchema: finaleSaveSchema,
  }
}
