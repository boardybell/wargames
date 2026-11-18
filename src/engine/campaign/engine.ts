// The dispatch choke point: every player mutation flows through here,
// time passes only via the embedded advance, and the emitted list is
// the structural exactly-once side channel. Replay folds over the
// (action, now) envelope log reproduce state exactly; emitted exists so
// the shell never diffs state.
import { advanceToNow, materializeSchedule } from '../time'
import type { ProcessedEvent, TimeSlice } from '../time'
import { rngFromSeed } from '../rng'
import type {
  FoldedConsequences,
  MissionRegistry,
  SeedDefinition,
} from '../missions/types'
import type { CampaignState } from './state'
import type {
  CampaignAction,
  CampaignPhase,
  Consequence,
  DispatchResult,
  EngineEvent,
  MissionId,
  SettledOutcome,
  SettlementCause,
} from './types'

export interface BriefingLine {
  readonly kind: string
  readonly text: string
}

export interface EngineContext {
  readonly seeds: Readonly<Record<string, SeedDefinition>>
  readonly missions: MissionRegistry
  /** The three playable missions, in menu order. */
  readonly missionOrder: readonly MissionId[]
}

/** Per-kind aggregate caps (integer units), applied once to the sum,
 *  never pairwise, so folding is order-independent. */
export const CONSEQUENCE_CAPS: Readonly<Record<string, number>> = {
  commsDelayed: 40,
  flightsDisrupted: 40,
  paymentsDelayed: 40,
}

export function createCampaign(
  ctx: EngineContext,
  seedName: string,
  preferences: { extendedTime: boolean },
): CampaignState {
  const seed = ctx.seeds[seedName]
  if (!seed) throw new Error(`campaign: unknown seed ${seedName}`)
  return {
    seedName,
    // Desk-reply jitter is deferred to the seeds split; rng rides in
    // state now so replays and branch forkStream (section 09) share one
    // stream from day one.
    rng: { words: [...rngFromSeed(seed.seedNumber).words] },
    openExceptionsBaseline: seed.openExceptionsBaseline,
    lastNow: 0,
    phase: 'menu',
    activeMission: null,
    missionQueue: [],
    campaignQueue: [],
    settled: [],
    acknowledgedDebriefs: [],
    startedMissionIds: [],
    cluesFound: [],
    sourceChecks: [],
    inspectedRecords: [],
    appliedConsequences: [],
    preferences: { extendedTime: preferences.extendedTime },
  }
}

function slice(state: CampaignState): TimeSlice {
  return {
    lastNow: state.lastNow,
    missionQueue: state.missionQueue,
    campaignQueue: state.campaignQueue,
    endsAt: state.activeMission?.endsAt ?? null,
    missionSettled:
      state.activeMission === null ||
      state.settled.some((s) => s.missionId === state.activeMission?.missionId),
  }
}

function mergeClues(
  state: CampaignState,
  ids: readonly string[],
  emitted: EngineEvent[],
): CampaignState {
  const fresh = ids.filter((id) => !state.cluesFound.includes(id))
  if (fresh.length === 0) return state
  for (const clueId of fresh) emitted.push({ type: 'clueFound', clueId })
  return { ...state, cluesFound: [...state.cluesFound, ...fresh].sort() }
}

function changePhase(
  state: CampaignState,
  to: CampaignPhase,
  emitted: EngineEvent[],
): CampaignState {
  if (state.phase === to) return state
  emitted.push({ type: 'phaseChanged', from: state.phase, to })
  return { ...state, phase: to }
}

/** The monotonic settlement guard: section 08's load-path merge guard
 *  imports this so a stale backup can never resurrect a settled
 *  mission. */
export function isMissionSettled(
  state: CampaignState,
  missionId: MissionId,
): boolean {
  return state.settled.some((s) => s.missionId === missionId)
}

function settle(
  ctx: EngineContext,
  state: CampaignState,
  cause: SettlementCause,
  emitted: EngineEvent[],
): CampaignState {
  const runtime = state.activeMission
  if (!runtime) return state
  if (isMissionSettled(state, runtime.missionId)) {
    return state
  }
  const module = ctx.missions[runtime.missionId]
  if (!module) throw new Error(`campaign: unknown mission ${runtime.missionId}`)
  const outcome: SettledOutcome = module.evaluate(runtime.substate, cause)
  emitted.push({
    type: 'settlement',
    missionId: runtime.missionId,
    cause,
    tier: outcome.tier,
  })
  let next: CampaignState = {
    ...state,
    settled: [...state.settled, outcome].sort((a, b) =>
      a.missionId < b.missionId ? -1 : a.missionId > b.missionId ? 1 : 0,
    ),
    activeMission: null,
    missionQueue: [],
  }
  if (outcome.clueId) next = mergeClues(next, [outcome.clueId], emitted)
  next = changePhase(next, 'debrief', emitted)
  return next
}

function pollMission(
  ctx: EngineContext,
  state: CampaignState,
  emitted: EngineEvent[],
): CampaignState {
  const runtime = state.activeMission
  if (!runtime) return state
  const module = ctx.missions[runtime.missionId]
  if (!module) throw new Error(`campaign: unknown mission ${runtime.missionId}`)
  let next = state
  if (module.clues) {
    next = mergeClues(next, module.clues(runtime.substate), emitted)
  }
  const terminal = module.terminal?.(runtime.substate) ?? null
  if (terminal !== null) {
    next = settle(ctx, next, terminal, emitted)
  }
  return next
}

function resolveDeskReply(
  state: CampaignState,
  event: ProcessedEvent,
  emitted: EngineEvent[],
): CampaignState {
  const payload = event.payload as {
    recordId: string
    outcome: 'CONFIRMED' | 'CONTRADICTED' | 'PENDING' | 'UNKNOWN'
    requestedDuringMission: string | null
  }
  const arrivedAfterSettlement =
    payload.requestedDuringMission !== null &&
    state.settled.some((s) => s.missionId === payload.requestedDuringMission)
  emitted.push({
    type: 'sourceCheckResolved',
    recordId: payload.recordId,
    outcome: payload.outcome,
    arrivedAfterSettlement,
  })
  return {
    ...state,
    sourceChecks: [
      ...state.sourceChecks,
      {
        recordId: payload.recordId,
        outcome: payload.outcome,
        resolvedAt: event.scheduledAt,
        arrivedAfterSettlement,
      },
    ],
  }
}

function applyProcessedEvent(
  ctx: EngineContext,
  state: CampaignState,
  event: ProcessedEvent,
  emitted: EngineEvent[],
): CampaignState {
  if (event.queue === 'campaign') {
    if (event.kind === 'deskReply') {
      return resolveDeskReply(state, event, emitted)
    }
    emitted.push({
      type: 'scheduledEventFired',
      id: event.id,
      kind: event.kind,
      queue: 'campaign',
    })
    return state
  }
  if (event.kind === 'timerMilestone') {
    emitted.push({ type: 'timerMilestone', id: event.id })
  } else if (event.kind === 'finaleFinalPhase') {
    emitted.push({ type: 'finaleFinalPhase' })
  } else {
    emitted.push({
      type: 'scheduledEventFired',
      id: event.id,
      kind: event.kind,
      queue: 'mission',
    })
  }
  const runtime = state.activeMission
  if (!runtime) return state
  const module = ctx.missions[runtime.missionId]
  if (!module) throw new Error(`campaign: unknown mission ${runtime.missionId}`)
  const substate = module.reduce(runtime.substate, {
    type: 'scheduled',
    id: event.id,
    kind: event.kind,
    payload: event.payload,
    now: event.scheduledAt,
  })
  let next: CampaignState = {
    ...state,
    activeMission: { ...runtime, substate },
  }
  next = pollMission(ctx, next, emitted)
  return next
}

function advance(
  ctx: EngineContext,
  state: CampaignState,
  rawNow: number,
  emitted: EngineEvent[],
): CampaignState {
  const result = advanceToNow(slice(state), rawNow)
  if (
    result.slice.lastNow === state.lastNow &&
    result.processed.length === 0 &&
    !result.timedOut
  ) {
    // Provable no-op: same reference, so a repeat rejection cannot even
    // churn object identity.
    return state
  }
  let next: CampaignState = {
    ...state,
    lastNow: result.slice.lastNow,
    missionQueue: [...result.slice.missionQueue],
    campaignQueue: [...result.slice.campaignQueue],
  }
  // Timeout settlement interleaves into the drain at endsAt: events at
  // or before the deadline apply first (the buzzer rule), the mission
  // settles, and only then do later events apply, so a post-deadline
  // mission event can never reduce into (or complete) a mission whose
  // time already ran out, and a desk reply landing past the deadline in
  // the same wake sees the settled mission.
  const deadline = state.activeMission?.endsAt ?? null
  let settledAtDeadline = false
  for (const event of result.processed) {
    if (
      !settledAtDeadline &&
      result.timedOut &&
      deadline !== null &&
      event.scheduledAt > deadline
    ) {
      next = settle(ctx, next, 'timeout', emitted)
      settledAtDeadline = true
    }
    next = applyProcessedEvent(ctx, next, event, emitted)
  }
  if (result.timedOut && !settledAtDeadline) {
    next = settle(ctx, next, 'timeout', emitted)
  }
  return next
}

/** Wake entry: time passes, nothing else. */
export function advanceCampaign(
  ctx: EngineContext,
  state: CampaignState,
  now: number,
): DispatchResult<CampaignState> {
  const emitted: EngineEvent[] = []
  const next = advance(ctx, state, now, emitted)
  return { state: next, emitted, rejection: null }
}

function foldConsequences(
  state: CampaignState,
  target: MissionId,
  emitted: EngineEvent[],
): { folded: FoldedConsequences; markers: CampaignState['appliedConsequences'] } {
  const pending: Consequence[] = state.settled
    .flatMap((outcome) => outcome.consequences)
    .filter(
      (consequence) =>
        !state.appliedConsequences.some(
          (marker) =>
            marker.consequenceId === consequence.id &&
            marker.targetMissionId === target,
        ),
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const sums: Record<string, number> = {}
  for (const consequence of pending) {
    sums[consequence.kind] = (sums[consequence.kind] ?? 0) + consequence.magnitude
  }
  const byKind: Record<string, number> = {}
  for (const [kind, sum] of Object.entries(sums)) {
    byKind[kind] = Math.min(sum, CONSEQUENCE_CAPS[kind] ?? sum)
  }
  const markers = [...state.appliedConsequences]
  for (const consequence of pending) {
    markers.push({ consequenceId: consequence.id, targetMissionId: target })
    emitted.push({
      type: 'consequenceApplied',
      consequenceId: consequence.id,
      targetMissionId: target,
    })
  }
  markers.sort((a, b) =>
    a.consequenceId !== b.consequenceId
      ? a.consequenceId < b.consequenceId
        ? -1
        : 1
      : a.targetMissionId < b.targetMissionId
        ? -1
        : 1,
  )
  return { folded: { byKind }, markers }
}

function fail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason }
}

function reduceAction(
  ctx: EngineContext,
  state: CampaignState,
  action: CampaignAction,
  now: number,
  emitted: EngineEvent[],
): { ok: true; state: CampaignState } | { ok: false; reason: string } {
  const seed = ctx.seeds[state.seedName]
  if (!seed) return fail('UNKNOWN SEED IN STATE')

  switch (action.type) {
    case 'START_MISSION': {
      if (state.phase !== 'menu') return fail('NOT IN MENU')
      const module = ctx.missions[action.missionId]
      if (!module) return fail('UNKNOWN MISSION')
      if (state.settled.some((s) => s.missionId === action.missionId)) {
        return fail('MISSION SETTLED')
      }
      const durationMs = seed.missionDurationsMs[action.missionId]
      if (durationMs === undefined) return fail('NO DURATION AUTHORED')
      const { folded, markers } = foldConsequences(
        state,
        action.missionId,
        emitted,
      )
      const briefing: BriefingLine[] = Object.entries(folded.byKind)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([kind, magnitude]) => ({
          kind,
          text: `CARRIED CONSEQUENCE ${kind.toUpperCase()}: MAGNITUDE ${magnitude}`,
        }))
      const duration = state.preferences.extendedTime ? 'extended' : 'standard'
      let queue, endsAt
      try {
        ;({ queue, endsAt } = materializeSchedule(
          seed.schedules[action.missionId] ?? [],
          now,
          duration,
          durationMs,
        ))
      } catch {
        return fail('SCHEDULE AUTHORING ERROR')
      }
      let substate: unknown
      try {
        substate = module.init(seed, folded, endsAt - now)
      } catch {
        return fail('MISSION INIT FAILED')
      }
      void briefing
      emitted.push({ type: 'missionStarted', missionId: action.missionId })
      let next: CampaignState = {
        ...state,
        appliedConsequences: markers,
        startedMissionIds: state.startedMissionIds.includes(action.missionId)
          ? state.startedMissionIds
          : [...state.startedMissionIds, action.missionId].sort(),
        activeMission: {
          missionId: action.missionId,
          endsAt,
          actionCount: 0,
          substate,
        },
        missionQueue: queue,
      }
      next = changePhase(next, 'mission', emitted)
      next = pollMission(ctx, next, emitted)
      return { ok: true, state: next }
    }
    case 'FORFEIT_MISSION': {
      if (state.phase !== 'mission' || !state.activeMission) {
        return fail('NO ACTIVE MISSION')
      }
      return { ok: true, state: settle(ctx, state, 'forfeit', emitted) }
    }
    case 'ACKNOWLEDGE_DEBRIEF': {
      if (state.phase === 'mission') return fail('MISSION IN PROGRESS')
      if (!isMissionSettled(state, action.missionId)) {
        return fail('NOT SETTLED')
      }
      if (state.acknowledgedDebriefs.includes(action.missionId)) {
        return fail('ALREADY ACKNOWLEDGED')
      }
      emitted.push({ type: 'debriefAcknowledged', missionId: action.missionId })
      let next: CampaignState = {
        ...state,
        acknowledgedDebriefs: [
          ...state.acknowledgedDebriefs,
          action.missionId,
        ].sort(),
      }
      if (next.phase === 'debrief') next = changePhase(next, 'menu', emitted)
      return { ok: true, state: next }
    }
    case 'INSPECT_RECORD': {
      if (!seed.records.some((r) => r.id === action.recordId)) {
        return fail('UNKNOWN RECORD')
      }
      let next: CampaignState = state.inspectedRecords.includes(action.recordId)
        ? state
        : {
            ...state,
            inspectedRecords: [
              ...state.inspectedRecords,
              action.recordId,
            ].sort(),
          }
      const clueEntry = seed.clueRecords.find(
        (entry) => entry.recordId === action.recordId,
      )
      if (clueEntry) next = mergeClues(next, [clueEntry.clueId], emitted)
      return { ok: true, state: next }
    }
    case 'REQUEST_SOURCE_CHECK': {
      const entry = seed.deskChecks.find(
        (check) => check.recordId === action.recordId,
      )
      if (!entry) return fail('NO DESK FOR RECORD')
      // One desk answer per record per campaign: a pending or resolved
      // check closes the desk, so corroboration cannot be farmed by
      // re-asking. The id is record-derived and therefore unique.
      const replyId = `desk-${action.recordId}`
      if (state.campaignQueue.some((e) => e.id === replyId)) {
        return fail('CHECK PENDING')
      }
      if (state.sourceChecks.some((c) => c.recordId === action.recordId)) {
        return fail('CHECK ALREADY ANSWERED')
      }
      return {
        ok: true,
        state: {
          ...state,
          campaignQueue: [
            ...state.campaignQueue,
            {
              id: replyId,
              scheduledAt: now + entry.delaySeconds * 1000,
              kind: 'deskReply',
              payload: {
                recordId: action.recordId,
                outcome: entry.outcome,
                requestedDuringMission: state.activeMission?.missionId ?? null,
              },
            },
          ],
        },
      }
    }
    case 'SET_PREFERENCE': {
      if (
        action.preference === 'extendedTime' &&
        state.startedMissionIds.length > 0
      ) {
        return fail('CAMPAIGN HAS BEGUN')
      }
      return {
        ok: true,
        state: {
          ...state,
          preferences: { ...state.preferences, extendedTime: action.value },
        },
      }
    }
    case 'NEW_CAMPAIGN': {
      if (!ctx.seeds[action.seedName]) return fail('UNKNOWN SEED')
      emitted.push({ type: 'campaignReset', seedName: action.seedName })
      const carried = action.resetPreferences
        ? { extendedTime: false }
        : state.preferences
      return {
        ok: true,
        state: {
          ...createCampaign(ctx, action.seedName, carried),
          lastNow: now,
        },
      }
    }
    case 'MISSION_ACTION': {
      const runtime = state.activeMission
      if (state.phase !== 'mission' || !runtime) {
        return fail('NO ACTIVE MISSION')
      }
      const module = ctx.missions[runtime.missionId]
      if (!module) return fail('UNKNOWN MISSION')
      const validity = module.validate(runtime.substate, action.payload)
      if (!validity.valid) return fail(validity.reason)
      const substate = module.reduce(runtime.substate, {
        type: 'action',
        id: `action-${runtime.actionCount}`,
        kind: 'action',
        payload: action.payload,
        now,
      })
      let next: CampaignState = {
        ...state,
        activeMission: {
          ...runtime,
          substate,
          actionCount: runtime.actionCount + 1,
        },
      }
      next = pollMission(ctx, next, emitted)
      return { ok: true, state: next }
    }
    default:
      return fail('UNKNOWN ACTION')
  }
}

/** The envelope choke point: clamp and drain first, then validate and
 *  reduce. Rejected actions return the input state untouched (same
 *  reference) beside the drain result. */
export function dispatch(
  ctx: EngineContext,
  state: CampaignState,
  action: CampaignAction,
  now: number,
): DispatchResult<CampaignState> {
  const emitted: EngineEvent[] = []
  const advanced = advance(ctx, state, now, emitted)
  const reduced = reduceAction(ctx, advanced, action, advanced.lastNow, emitted)
  if (!reduced.ok) {
    return {
      state: advanced,
      emitted,
      rejection: { rejected: true, reason: reduced.reason },
    }
  }
  return { state: reduced.state, emitted, rejection: null }
}
