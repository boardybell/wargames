// The GLOBAL FAILSAFE finale verb grammar and the shared action builders. Every
// on-screen button and every typed command routes through the SAME builder, so
// the command-button identity tests hold by construction: a parsed SELECT
// strict-equals the action the slot button dispatches, and so on for the whole
// surface (SELECT, ORDER / MOVE UP/DOWN, VALIDATE, REQUEST FIELD REPORT, RUN
// COMPARISON, COMMIT). Each verb maps one to one onto an engine MISSION_ACTION
// or a view switch; there is no shell-side game logic here, only argument
// parsing and the live case-file bundle the shell threads through. Diction is
// uppercase terminal; no em-dashes. The engine validator is the only judge of
// legality; these builders only shape actions.
import type { CampaignAction } from '@engine'
import type {
  CaseFileCheck,
  CommitChoice,
  FinaleSlot,
} from '@engine/missions/finale/types'
import { FINALE_SLOTS, SUBSYSTEM_SLOTS } from '@engine/missions/finale/types'
import {
  registerScreenVerbs,
  unregisterScreenVerbs,
  type ParseResult,
  type VerbRegistration,
} from '../../terminal'

export type MissionAction = Extract<CampaignAction, { type: 'MISSION_ACTION' }>

export const FINALE_SCREEN_ID = 'mission:finale'

/** The live reference half of the case file the shell lifts from campaign
 *  selectors and threads into VALIDATE / REQUEST FIELD REPORT. Record ids and
 *  typed outcome codes only, never a reply body. */
export interface FinaleCaseFileRef {
  readonly sourceChecks: readonly CaseFileCheck[]
  readonly inspectedRecords: readonly string[]
}

/** The view commands the screen owns. CASE / COMPARISON / DECISION switch the
 *  active view (persisted); BACK returns to the case view (the mobile back
 *  affordance); COMMIT opens the commit confirmation gate for a choice (the
 *  typed path routes through the SAME native confirm dialog the DecisionView
 *  button raises, so command and button reach the irreversible action
 *  identically). These ride the shell's mission-scoped SCREEN ui command. */
export type FinaleUiCommand =
  | { readonly kind: 'VIEW'; readonly view: 'case' | 'comparison' | 'decision' }
  | { readonly kind: 'BACK' }
  | { readonly kind: 'COMMIT'; readonly choice: CommitChoice }

function isCommitChoice(value: unknown): value is CommitChoice {
  return value === 'staged' || value === 'hold' || value === 'repeat'
}

/** Narrow an opaque SCREEN-command detail back to a FinaleUiCommand. */
export function asFinaleUiCommand(detail: unknown): FinaleUiCommand | null {
  if (typeof detail !== 'object' || detail === null) return null
  const kind = (detail as { kind?: unknown }).kind
  if (kind === 'BACK') return { kind: 'BACK' }
  if (kind === 'COMMIT') {
    const choice = (detail as { choice?: unknown }).choice
    if (isCommitChoice(choice)) return { kind: 'COMMIT', choice }
  }
  if (kind === 'VIEW') {
    const view = (detail as { view?: unknown }).view
    if (view === 'case' || view === 'comparison' || view === 'decision') {
      return { kind: 'VIEW', view }
    }
  }
  return null
}

function screenUi(detail: FinaleUiCommand): ParseResult {
  return {
    kind: 'ui',
    command: { kind: 'SCREEN', screenId: FINALE_SCREEN_ID, detail },
  }
}

function isSlot(value: string | undefined): value is FinaleSlot {
  return value !== undefined && (FINALE_SLOTS as readonly string[]).includes(value)
}

// ── The shared action builders. Both the typed command and the button path
//    call these, so a parsed action is deep-equal to a button action. ──────

export function makeSelectAction(
  slot: FinaleSlot,
  recordId: string,
): MissionAction {
  return { type: 'MISSION_ACTION', payload: { kind: 'SELECT', slot, recordId } }
}

export function makeClearAction(slot: FinaleSlot): MissionAction {
  return { type: 'MISSION_ACTION', payload: { kind: 'CLEAR', slot } }
}

export function makeReorderAction(ordering: readonly string[]): MissionAction {
  return {
    type: 'MISSION_ACTION',
    payload: { kind: 'REORDER', ordering: [...ordering] },
  }
}

export function makeValidateAction(caseFile: FinaleCaseFileRef): MissionAction {
  return {
    type: 'MISSION_ACTION',
    payload: {
      kind: 'VALIDATE',
      caseFile: {
        sourceChecks: [...caseFile.sourceChecks],
        inspectedRecords: [...caseFile.inspectedRecords],
      },
    },
  }
}

export function makeRequestFieldReportAction(
  caseFile: FinaleCaseFileRef,
): MissionAction {
  return {
    type: 'MISSION_ACTION',
    payload: {
      kind: 'REQUEST_FIELD_REPORT',
      caseFile: {
        sourceChecks: [...caseFile.sourceChecks],
        inspectedRecords: [...caseFile.inspectedRecords],
      },
    },
  }
}

/** REQUEST FIELD REPORT issues the engine-owned desk check against the
 *  designated record in the SAME dispatch spirit the other missions use: the
 *  finale flag is set by the MISSION_ACTION above, and the reply joins
 *  campaign.sourceChecks through this engine-owned source-check request. */
export function makeFieldReportSourceCheckAction(
  fieldReportId: string,
): CampaignAction {
  return { type: 'REQUEST_SOURCE_CHECK', recordId: fieldReportId }
}

export function makeRunComparisonAction(): MissionAction {
  return { type: 'MISSION_ACTION', payload: { kind: 'RUN_COMPARISON' } }
}

export function makeCommitAction(choice: CommitChoice): MissionAction {
  return { type: 'MISSION_ACTION', payload: { kind: 'COMMIT', choice } }
}

function err(message: string): ParseResult {
  return { kind: 'error', message }
}

function action(a: CampaignAction): ParseResult {
  return { kind: 'action', action: a }
}

/** Compute the reordering that moves recordId one place up or down within the
 *  current ordering over the three subsystem record ids. Pure; the ORDER verb
 *  and the MOVE UP/DOWN buttons both call this so they produce identical
 *  orderings. Returns null when the move is not possible (record not present or
 *  already at the edge), which the caller surfaces as a no-op. */
export function moveWithin(
  ordering: readonly string[],
  recordId: string,
  direction: 'up' | 'down',
): string[] | null {
  const index = ordering.indexOf(recordId)
  if (index === -1) return null
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= ordering.length) return null
  const next = [...ordering]
  const tmp = next[index]!
  next[index] = next[target]!
  next[target] = tmp
  return next
}

export interface FinaleVerbContext {
  /** The live case-file reference facts the shell lifts from campaign state. */
  readonly caseFile: () => FinaleCaseFileRef
  /** The current event-time ordering over the three subsystem record ids. */
  readonly ordering: () => readonly string[]
  /** The record currently targeted by a subsystem slot, for MOVE UP/DOWN with a
   *  slot argument. Maps a subsystem slot name to its filled record id, or null. */
  readonly recordForSlot: (slot: FinaleSlot) => string | null
}

/** The verbs that dispatch engine actions, plus the view commands. */
export function buildFinaleVerbs(
  ctx: FinaleVerbContext,
): readonly VerbRegistration[] {
  return [
    {
      verb: 'SELECT',
      helpText: 'SELECT <RECORD> <SLOT> attach a record to a case slot',
      parse: (tokens) => {
        const recordId = tokens[0]
        const slot = tokens[1]?.toLowerCase()
        if (!recordId) return err('NO RECORD')
        if (!isSlot(slot)) return err('NO SLOT')
        return action(makeSelectAction(slot, recordId))
      },
    },
    {
      verb: 'CLEAR',
      helpText: 'CLEAR <SLOT>           empty a case slot',
      parse: (tokens) => {
        const slot = tokens[0]?.toLowerCase()
        if (!isSlot(slot)) return err('NO SLOT')
        return action(makeClearAction(slot))
      },
    },
    {
      verb: 'MOVE',
      helpText: 'MOVE <RECORD> UP|DOWN  reorder a subsystem slot',
      parse: (tokens) => {
        const recordId = tokens[0]
        const dir = tokens[1]
        if (!recordId) return err('NO RECORD')
        if (dir !== 'UP' && dir !== 'DOWN') return err('NO DIRECTION')
        const ordering = ctx.ordering()
        if (!ordering.includes(recordId)) {
          return err('RECORD NOT IN SUBSYSTEM ORDER')
        }
        const next = moveWithin(ordering, recordId, dir === 'UP' ? 'up' : 'down')
        if (next === null) return err('CANNOT MOVE FURTHER')
        return action(makeReorderAction(next))
      },
    },
    {
      verb: 'VALIDATE',
      helpText: 'VALIDATE               certify the assembled case',
      parse: () => action(makeValidateAction(ctx.caseFile())),
    },
    {
      verb: 'REQUEST',
      helpText: 'REQUEST FIELD REPORT   ask the field desk to corroborate',
      parse: (tokens) => {
        if (tokens[0] !== 'FIELD' || tokens[1] !== 'REPORT') {
          return err('UNRECOGNIZED COMMAND')
        }
        return action(makeRequestFieldReportAction(ctx.caseFile()))
      },
    },
    {
      verb: 'RUN',
      helpText: 'RUN COMPARISON         project the three orders',
      parse: (tokens) => {
        if (tokens[0] !== 'COMPARISON') return err('UNRECOGNIZED COMMAND')
        return action(makeRunComparisonAction())
      },
    },
    {
      verb: 'COMMIT',
      helpText: 'COMMIT STAGED|HOLD|REPEAT  settle the finale on one order',
      parse: (tokens) => {
        const raw = tokens[0]
        const choice: CommitChoice | null =
          raw === 'STAGED'
            ? 'staged'
            : raw === 'HOLD'
              ? 'hold'
              : raw === 'REPEAT'
                ? 'repeat'
                : null
        if (choice === null) return err('NO COMMIT CHOICE')
        // Route the typed COMMIT through the SAME confirmation gate the button
        // raises: this opens the native confirm dialog (REPEAT quotes its
        // projection figures); Enter/confirm dispatches the commit, Escape/cancel
        // leaves state untouched. The irreversible action never bypasses it.
        return screenUi({ kind: 'COMMIT', choice })
      },
    },
    {
      verb: 'CASE',
      helpText: 'CASE                   show the case builder',
      parse: () => screenUi({ kind: 'VIEW', view: 'case' }),
    },
    {
      verb: 'COMPARISON',
      helpText: 'COMPARISON             show the three-order comparison',
      parse: () => screenUi({ kind: 'VIEW', view: 'comparison' }),
    },
    {
      verb: 'DECISION',
      helpText: 'DECISION               show the commit decision',
      parse: () => screenUi({ kind: 'VIEW', view: 'decision' }),
    },
    {
      verb: 'BACK',
      helpText: 'BACK                   return to the case builder',
      parse: () => screenUi({ kind: 'BACK' }),
    },
  ]
}

/** Register the finale verbs for the screen scope; returns an unregister. */
export function registerFinaleVerbs(ctx: FinaleVerbContext): () => void {
  registerScreenVerbs(FINALE_SCREEN_ID, buildFinaleVerbs(ctx))
  return () => unregisterScreenVerbs(FINALE_SCREEN_ID)
}

/** The subsystem slots, exported so the views iterate exactly the three slots
 *  that reorder (the root and observation slots expose no ordering controls). */
export { SUBSYSTEM_SLOTS }
