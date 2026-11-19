// Read-only selectors over the active campaign for the GLOBAL FAILSAFE finale
// screen, plus the persisted CASE/COMPARISON/DECISION view preference and the
// pure snapshot builder the ComparisonView and EndingScreen feed to the engine
// projections. Authored truth (record bodies, rejection line text, ending
// readbacks) lives in the immutable seed and the section-03 catalog; live truth
// (slots, caseValid, sourceChecks) lives in the mission substate and campaign
// state. NO engine logic here: validation, projections, and endings are all
// engine-owned; this module only lifts reference facts and assembles the frozen
// snapshot the pure engine transforms read.
import { useSyncExternalStore } from 'react'
import type { CampaignState, SettledOutcome } from '@engine'
import { selectOpenExceptions } from '@engine'
import { deepFreeze } from '@engine/branch'
import { buildRecordGraph } from '@engine/records'
import { getContext } from '../../state'
import type {
  CaseFileCheck,
  FinaleCaseFile,
  FinaleState,
} from '@engine/missions/finale/types'
import type { FinalePayload } from '@engine/missions/finale/module'
import type {
  FinaleCaseState,
  FinaleSnapshot,
} from '@engine/missions/finale/projections'
import { FINALE_SLOTS } from '@engine/missions/finale/types'
import type { FinaleSlot } from '@engine/missions/finale/types'

export const FINALE = 'finale'

/** The immutable authored finale payload on the active seed (records,
 *  claimRunId, rootRecordId, fieldReportId), or undefined when the seed carries
 *  none. The screens guard undefined. */
export function finalePayload(state: CampaignState): FinalePayload | undefined {
  const seed = getContext().seeds[state.seedName]
  return seed?.missionPayloads[FINALE] as FinalePayload | undefined
}

/** Build the display-side FinaleCaseFile the views pass to listCandidates /
 *  fieldReportLegal. The static half (graph, ids) comes from the seed payload;
 *  the live half (sourceChecks, inspectedRecords) from campaign selectors. This
 *  is reference data only: ids and typed codes, never authored copy. */
export function buildDisplayCaseFile(
  state: CampaignState,
  payload: FinalePayload,
): FinaleCaseFile {
  const sourceChecks: CaseFileCheck[] = state.sourceChecks.map((c) => ({
    recordId: c.recordId,
    outcome: c.outcome,
    arrivedAfterSettlement: c.arrivedAfterSettlement,
  }))
  return {
    graph: buildRecordGraph(payload.records),
    claimRunId: payload.claimRunId,
    rootRecordId: payload.rootRecordId,
    fieldReportId: payload.fieldReportId,
    sourceChecks,
    inspectedRecords: [...state.inspectedRecords],
  }
}

/** The live reference half the VALIDATE / REQUEST FIELD REPORT actions carry. */
export function caseFileRefFrom(state: CampaignState): {
  sourceChecks: CaseFileCheck[]
  inspectedRecords: string[]
} {
  return {
    sourceChecks: state.sourceChecks.map((c) => ({
      recordId: c.recordId,
      outcome: c.outcome,
      arrivedAfterSettlement: c.arrivedAfterSettlement,
    })),
    inspectedRecords: [...state.inspectedRecords],
  }
}

/** The live finale substate while the finale is the active mission, else null. */
export function finaleSubstate(state: CampaignState): FinaleState | null {
  if (state.activeMission?.missionId !== FINALE) return null
  return (state.activeMission.substate as FinaleState) ?? null
}

/** The settled finale outcome once the finale has settled, else null. The
 *  EndingScreen keys off this (endingId, cause); the FinaleScreen short-circuits
 *  to the ending when it is present. */
export function settledFinale(state: CampaignState): SettledOutcome | null {
  return state.settled.find((s) => s.missionId === FINALE) ?? null
}

/** The three subsystem settled outcomes the branch baseline reads. Immutable
 *  after their missions settle, so they are the frozen baseline the projections
 *  key on; a late field report never touches them. */
export function finaleSettledMissions(
  state: CampaignState,
): readonly SettledOutcome[] {
  return state.settled.filter(
    (s) =>
      s.missionId === 'outlook' ||
      s.missionId === 'flights' ||
      s.missionId === 'bank',
  )
}

/** The REAL proved-slot set the engine persisted into the settled finale
 *  outcome at evaluate(): one integer 0/1 metric per slot (proved_<slot>). Read
 *  back verbatim so the earned-why names exactly what the player proved, never a
 *  set reconstructed from the single case_valid flag. Integers only. */
export function provedSlotsFromOutcome(
  outcome: SettledOutcome,
): readonly FinaleSlot[] {
  return FINALE_SLOTS.filter((slot) => outcome.metrics[`proved_${slot}`] === 1)
}

/** Derive the reference-only finale case state the earned-why readback names.
 *  provedSlots are the filled slots when the case validated; the field report
 *  corroborated iff its designated record has a completed (before-settlement)
 *  source check. When an explicit proved-slot set is supplied (the persisted
 *  bits from the settled outcome) it wins over the live-slot derivation, so the
 *  ending readback reflects what was actually proved at settlement. Record ids /
 *  booleans only, never authored copy. */
export function deriveFinaleCaseState(
  finaleState: FinaleState,
  state: CampaignState,
  fieldReportId: string,
  provedSlotsOverride?: readonly FinaleSlot[],
): FinaleCaseState {
  const provedSlots =
    provedSlotsOverride ??
    (finaleState.caseValid
      ? FINALE_SLOTS.filter((slot) => finaleState.slots[slot] !== null)
      : [])
  const fieldReportCorroborated = state.sourceChecks.some(
    (c) => c.recordId === fieldReportId && c.arrivedAfterSettlement !== true,
  )
  return { caseValid: finaleState.caseValid, provedSlots, fieldReportCorroborated }
}

/** Build the frozen FinaleSnapshot the pure engine projections read. The
 *  settled baseline and the open-exceptions baseline are immutable after finale
 *  start, so the branch column figures are frozen by construction: only
 *  caseState (which feeds the earned-why readback, never a column figure) tracks
 *  the live case. Deep-frozen so the transforms cannot mutate it. */
export function buildFinaleSnapshot(
  finaleState: FinaleState,
  state: CampaignState,
  fieldReportId: string,
  provedSlotsOverride?: readonly FinaleSlot[],
): FinaleSnapshot {
  const snapshot: FinaleSnapshot = {
    settled: finaleSettledMissions(state),
    openExceptionsBaseline: state.openExceptionsBaseline,
    caseState: deriveFinaleCaseState(
      finaleState,
      state,
      fieldReportId,
      provedSlotsOverride,
    ),
  }
  return deepFreeze(JSON.parse(JSON.stringify(snapshot)) as FinaleSnapshot)
}

/** OPEN EXCEPTIONS off the live campaign (shell chrome convenience). */
export function finaleOpenExceptions(state: CampaignState): number {
  return selectOpenExceptions(state)
}

// ---- Persisted CASE/COMPARISON/DECISION view preference -----------------
// The player's explicit view choice persists across reloads and restores on a
// remount, satisfying the global return-nav state-restore rule. In-memory is
// the session source of truth (works where localStorage is blocked, e.g. a
// headless test env); localStorage persists across reloads and a corrupt read
// falls to no-preference without throwing. Mirrors the bank/flights stores.
export type FinaleView = 'case' | 'comparison' | 'decision'

const FINALE_VIEWS: readonly FinaleView[] = ['case', 'comparison', 'decision']

function isFinaleView(value: unknown): value is FinaleView {
  return typeof value === 'string' && FINALE_VIEWS.includes(value as FinaleView)
}

const VIEW_KEY = 'wargames.finale.view'

let viewPref: FinaleView | null | undefined
const listeners = new Set<() => void>()

function load(): FinaleView | null {
  if (viewPref !== undefined) return viewPref
  try {
    const raw = window.localStorage.getItem(VIEW_KEY)
    viewPref = isFinaleView(raw) ? raw : null
  } catch {
    viewPref = null
  }
  return viewPref
}

export function getFinaleView(): FinaleView | null {
  return load()
}

export function setFinaleView(view: FinaleView): void {
  viewPref = view
  try {
    window.localStorage.setItem(VIEW_KEY, view)
  } catch {
    // In-memory still backs the session.
  }
  for (const listener of listeners) listener()
}

export function onFinaleView(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useFinaleView(): FinaleView | null {
  return useSyncExternalStore(onFinaleView, getFinaleView, getFinaleView)
}

/** Test-only: forget the stored preference. */
export function __resetFinaleView(): void {
  viewPref = undefined
  try {
    window.localStorage.removeItem(VIEW_KEY)
  } catch {
    // ignore
  }
  listeners.clear()
}
