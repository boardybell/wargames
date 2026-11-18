// The FREEZE BANK ACCOUNTS verb grammar and the shared action builders. Every
// on-screen button and every typed command routes through the SAME builder, so
// the command-button identity tests hold by construction: a parsed HOLD strict-
// equals the action the HOLD button dispatches, and so on for RELEASE, LIMIT,
// PAY, TRACE, CHECK SOURCE. Diction is uppercase terminal; no em-dashes. The
// engine validator is the single source of truth for what is currently legal;
// these builders only shape actions, never judge them. There is ZERO clue logic
// here: TRACE dispatches the engine-owned INSPECT_RECORD and the clue logs
// engine-side; CHECK SOURCE dispatches REQUEST_SOURCE_CHECK and the verdict
// arrives later as a sourceCheckResolved emitted event.
import type { CampaignAction } from '@engine'
import {
  registerScreenVerbs,
  unregisterScreenVerbs,
  type ParseResult,
  type VerbRegistration,
} from '../../terminal'

export type MissionAction = Extract<CampaignAction, { type: 'MISSION_ACTION' }>

export const BANK_SCREEN_ID = 'mission:bank'

/** The view and selection commands the screen owns. LEDGER / FEED / PAYMENTS
 *  switch the view (persisted); BACK returns to the ledger (the mobile back
 *  affordance). These ride the shell's mission-scoped SCREEN ui command as the
 *  detail, so the single shared command line dispatches them to the screen's
 *  handler. */
export type BankUiCommand =
  | { readonly kind: 'VIEW'; readonly view: 'ledger' | 'feed' | 'payments' }
  | { readonly kind: 'BACK' }

/** Narrow an opaque SCREEN-command detail back to a BankUiCommand. The screen's
 *  handler calls this; a malformed detail yields null. */
export function asBankUiCommand(detail: unknown): BankUiCommand | null {
  if (typeof detail !== 'object' || detail === null) return null
  const kind = (detail as { kind?: unknown }).kind
  if (kind === 'BACK') return { kind: 'BACK' }
  if (kind === 'VIEW') {
    const view = (detail as { view?: unknown }).view
    if (view === 'ledger' || view === 'feed' || view === 'payments') {
      return { kind: 'VIEW', view }
    }
  }
  return null
}

function screenUi(detail: BankUiCommand): ParseResult {
  return {
    kind: 'ui',
    command: { kind: 'SCREEN', screenId: BANK_SCREEN_ID, detail },
  }
}

// The shared action builders. Both the typed command and the button path call
// these, so a parsed action is deep-equal to a button action.
export function makeHoldAction(accountId: string): MissionAction {
  return { type: 'MISSION_ACTION', payload: { kind: 'HOLD', accountId } }
}

export function makeReleaseAction(accountId: string): MissionAction {
  return { type: 'MISSION_ACTION', payload: { kind: 'RELEASE', accountId } }
}

export function makeLimitAction(accountId: string, cap: number): MissionAction {
  return { type: 'MISSION_ACTION', payload: { kind: 'LIMIT', accountId, cap } }
}

export function makePayAction(paymentId: string): MissionAction {
  return { type: 'MISSION_ACTION', payload: { kind: 'PAY', paymentId } }
}

/** TRACE inspects a record (the hold-justification record, B04). Campaign
 *  action; the clue logs engine-side through clueRecords. */
export function makeTraceAction(recordId: string): CampaignAction {
  return { type: 'INSPECT_RECORD', recordId }
}

/** CHECK SOURCE is the engine-owned generic form: a campaign action against a
 *  record id directly. The verdict is engine-resolved; the shell never computes
 *  it. */
export function makeCheckSourceAction(recordId: string): CampaignAction {
  return { type: 'REQUEST_SOURCE_CHECK', recordId }
}

function err(message: string): ParseResult {
  return { kind: 'error', message }
}

function action(a: CampaignAction): ParseResult {
  return { kind: 'action', action: a }
}

export interface BankVerbContext {
  /** The currently selected account id, for commands that omit it. */
  readonly selectedAccountId: () => string | null
}

/** The verbs that dispatch engine actions, plus the view and selection verbs. */
export function buildBankVerbs(
  ctx: BankVerbContext,
): readonly VerbRegistration[] {
  const requireAccount = (explicit: string | undefined): string | null =>
    explicit ?? ctx.selectedAccountId()

  return [
    {
      verb: 'HOLD',
      helpText: 'HOLD <ACCOUNT>        freeze an account (reversible)',
      parse: (tokens) => {
        const accountId = requireAccount(tokens[0])
        return accountId
          ? action(makeHoldAction(accountId))
          : err('NO ACCOUNT SELECTED')
      },
    },
    {
      verb: 'RELEASE',
      helpText: 'RELEASE <ACCOUNT>     reverse a HOLD on an account',
      parse: (tokens) => {
        const accountId = requireAccount(tokens[0])
        return accountId
          ? action(makeReleaseAction(accountId))
          : err('NO ACCOUNT SELECTED')
      },
    },
    {
      verb: 'LIMIT',
      helpText: 'LIMIT <ACCOUNT> <CAP> cap an account to a limited release',
      parse: (tokens) => {
        const accountId = requireAccount(tokens[0])
        if (!accountId) return err('NO ACCOUNT SELECTED')
        const raw = tokens[1]
        if (raw === undefined) return err('NO CAP')
        const cap = Number(raw)
        if (!Number.isInteger(cap) || cap < 0) return err('BAD LIMIT CAP')
        return action(makeLimitAction(accountId, cap))
      },
    },
    {
      verb: 'PAY',
      helpText: 'PAY <PAYMENT>         clear a critical payment',
      parse: (tokens) => {
        const paymentId = tokens[0]
        return paymentId ? action(makePayAction(paymentId)) : err('NO PAYMENT')
      },
    },
    {
      verb: 'TRACE',
      helpText: 'TRACE <RECORD>        inspect a record and trace its provenance',
      parse: (tokens) => {
        const recordId = tokens[0]
        return recordId ? action(makeTraceAction(recordId)) : err('NO RECORD')
      },
    },
    {
      verb: 'CHECK',
      helpText: 'CHECK SOURCE <RECORD> ask the desk to verify a record',
      parse: (tokens) => {
        if (tokens[0] !== 'SOURCE') return err('UNRECOGNIZED COMMAND')
        const recordId = tokens[1]
        return recordId ? action(makeCheckSourceAction(recordId)) : err('NO RECORD')
      },
    },
    {
      verb: 'LEDGER',
      helpText: 'LEDGER                show the account ledger',
      parse: () => screenUi({ kind: 'VIEW', view: 'ledger' }),
    },
    {
      verb: 'FEED',
      helpText: 'FEED                  show the withdrawal request feed',
      parse: () => screenUi({ kind: 'VIEW', view: 'feed' }),
    },
    {
      verb: 'PAYMENTS',
      helpText: 'PAYMENTS              show the critical payments',
      parse: () => screenUi({ kind: 'VIEW', view: 'payments' }),
    },
    {
      verb: 'BACK',
      helpText: 'BACK                  return to the ledger',
      parse: () => screenUi({ kind: 'BACK' }),
    },
  ]
}

/** Register the bank verbs for the screen scope; returns an unregister. */
export function registerBankVerbs(ctx: BankVerbContext): () => void {
  registerScreenVerbs(BANK_SCREEN_ID, buildBankVerbs(ctx))
  return () => unregisterScreenVerbs(BANK_SCREEN_ID)
}
