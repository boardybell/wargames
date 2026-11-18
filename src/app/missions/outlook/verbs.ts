// The CRASH OUTLOOK verb grammar and the shared action builders. Every
// ActionBar button and every typed command routes through the SAME builder,
// so the command-button identity tests hold by construction: a parsed READ
// strict-equals the action the READ button dispatches, and so on for FLAG,
// QUEUE, SEND, TRACE, CHECK SOURCE. Diction is uppercase terminal; no
// em-dashes. The engine validator is the single source of truth for what is
// currently legal; these builders only shape actions, never judge them.
import type { CampaignAction } from '@engine'
import {
  registerScreenVerbs,
  unregisterScreenVerbs,
  type ParseResult,
  type VerbRegistration,
} from '../../terminal'
import type { Channel, DeskId } from '@engine/missions/outlook/types'

export type MissionAction = Extract<CampaignAction, { type: 'MISSION_ACTION' }>

export const OUTLOOK_SCREEN_ID = 'mission:outlook'

/** The view and list commands the screen owns: a typed INBOX / OUTBOX / LOG
 *  switches the view and BACK returns to the list. These ride the shell's
 *  mission-scoped SCREEN ui command as the detail, so the single shared
 *  command line dispatches them to the screen's registered handler. */
export type OutlookUiCommand =
  | { readonly kind: 'VIEW'; readonly view: 'inbox' | 'outbox' | 'log' }
  | { readonly kind: 'BACK' }

/** Narrow an opaque SCREEN-command detail back to an OutlookUiCommand. The
 *  screen's handler calls this; a malformed detail yields null. */
export function asOutlookUiCommand(detail: unknown): OutlookUiCommand | null {
  if (typeof detail !== 'object' || detail === null) return null
  const kind = (detail as { kind?: unknown }).kind
  if (kind === 'BACK') return { kind: 'BACK' }
  if (kind === 'VIEW') {
    const view = (detail as { view?: unknown }).view
    if (view === 'inbox' || view === 'outbox' || view === 'log') {
      return { kind: 'VIEW', view }
    }
  }
  return null
}

/** Wrap an OutlookUiCommand as the shell's mission-scoped SCREEN ui command. */
function screenUi(detail: OutlookUiCommand): ParseResult {
  return { kind: 'ui', command: { kind: 'SCREEN', screenId: OUTLOOK_SCREEN_ID, detail } }
}

export function makeReadAction(messageId: string): MissionAction {
  return { type: 'MISSION_ACTION', payload: { kind: 'READ', messageId } }
}

export function makeFlagAction(messageId: string): MissionAction {
  return { type: 'MISSION_ACTION', payload: { kind: 'FLAG', messageId } }
}

export function makeQueueAction(
  messageId: string,
  channel: Channel,
): MissionAction {
  return { type: 'MISSION_ACTION', payload: { kind: 'QUEUE', messageId, channel } }
}

export function makeSendAction(
  messageId: string,
  channel: Channel,
  recipient: DeskId | null,
): MissionAction {
  return {
    type: 'MISSION_ACTION',
    payload: { kind: 'SEND', messageId, channel, recipient },
  }
}

export function makeSendQueuedAction(
  index: number,
  recipient: DeskId | null,
): MissionAction {
  return {
    type: 'MISSION_ACTION',
    payload: { kind: 'SEND_QUEUED', index, recipient },
  }
}

export function makeTraceAction(recordId: string): CampaignAction {
  return { type: 'INSPECT_RECORD', recordId }
}

export function makeCheckSourceAction(recordId: string): CampaignAction {
  return { type: 'REQUEST_SOURCE_CHECK', recordId }
}

function parseChannel(token: string | undefined): Channel | null {
  if (token === 'PRIMARY') return 'primary'
  if (token === 'BACKUP') return 'backup'
  return null
}

/** The candidate desks a required message can route to, in a fixed order. The
 *  desk picker presents exactly these; the authored correctRecipient is never
 *  singled out, so the puzzle holds through the button path. */
export const OUTLOOK_DESKS: readonly DeskId[] = [
  'WEATHER_DESK',
  'PAYROLL_DESK',
  'AUDIT_DESK',
]

function parseDesk(token: string | undefined): DeskId | null {
  return token && (OUTLOOK_DESKS as readonly string[]).includes(token)
    ? (token as DeskId)
    : null
}

function err(message: string): ParseResult {
  return { kind: 'error', message }
}

function action(a: CampaignAction): ParseResult {
  return { kind: 'action', action: a }
}

export interface OutlookVerbContext {
  /** The currently selected message id, for commands that omit it. */
  readonly selectedMessageId: () => string | null
}

/** The verbs that dispatch engine actions, plus the view verbs. View commands
 *  (INBOX/OUTBOX/LOG/BACK) ride the shell's mission-scoped SCREEN ui command so
 *  the single shared command line switches the screen's own view state (not an
 *  engine action); the screen's registered handler applies them. */
export function buildOutlookVerbs(
  ctx: OutlookVerbContext,
): readonly VerbRegistration[] {
  const requireMessage = (explicit: string | undefined): string | null =>
    explicit ?? ctx.selectedMessageId()

  return [
    {
      verb: 'READ',
      helpText: 'READ <ID>      mark a message read and open it',
      parse: (tokens) => {
        const id = requireMessage(tokens[0])
        return id ? action(makeReadAction(id)) : err('NO MESSAGE SELECTED')
      },
    },
    {
      verb: 'FLAG',
      helpText: 'FLAG <ID>      toggle the flag mark on a message',
      parse: (tokens) => {
        const id = requireMessage(tokens[0])
        return id ? action(makeFlagAction(id)) : err('NO MESSAGE SELECTED')
      },
    },
    {
      verb: 'QUEUE',
      helpText: 'QUEUE <ID> <PRIMARY|BACKUP>   park a message for a channel',
      parse: (tokens) => {
        const id = requireMessage(tokens[0])
        const channel = parseChannel(tokens[1])
        if (!id) return err('NO MESSAGE SELECTED')
        if (!channel) return err('NO CHANNEL SELECTED')
        return action(makeQueueAction(id, channel))
      },
    },
    {
      verb: 'SEND',
      helpText:
        'SEND <ID> <PRIMARY|BACKUP> <DESK>  or  SEND <INDEX> <DESK>  dispatch',
      parse: (tokens) => {
        // Queued send form: SEND <index> <desk>.
        const asIndex = Number(tokens[0])
        if (tokens[0] !== undefined && Number.isInteger(asIndex)) {
          const recipient = parseDesk(tokens[1])
          return action(makeSendQueuedAction(asIndex, recipient))
        }
        // Direct send form: SEND <id> <channel> <desk>.
        const id = requireMessage(tokens[0])
        const channel = parseChannel(tokens[1])
        if (!id) return err('NO MESSAGE SELECTED')
        if (!channel) return err('NO CHANNEL SELECTED')
        const recipient = parseDesk(tokens[2])
        return action(makeSendAction(id, channel, recipient))
      },
    },
    {
      verb: 'TRACE',
      helpText: 'TRACE <RECORD> inspect the record behind a message',
      parse: (tokens) => {
        const recordId = tokens[0]
        return recordId ? action(makeTraceAction(recordId)) : err('NO RECORD')
      },
    },
    {
      verb: 'CHECK',
      helpText: 'CHECK SOURCE <RECORD>  ask the desk to verify a record',
      parse: (tokens) => {
        if (tokens[0] !== 'SOURCE') return err('UNRECOGNIZED COMMAND')
        const recordId = tokens[1]
        return recordId
          ? action(makeCheckSourceAction(recordId))
          : err('NO RECORD')
      },
    },
    {
      verb: 'INBOX',
      helpText: 'INBOX          show the inbox list',
      parse: () => screenUi({ kind: 'VIEW', view: 'inbox' }),
    },
    {
      verb: 'OUTBOX',
      helpText: 'OUTBOX         show the outbox queue',
      parse: () => screenUi({ kind: 'VIEW', view: 'outbox' }),
    },
    {
      verb: 'LOG',
      helpText: 'LOG            show the delivery log',
      parse: () => screenUi({ kind: 'VIEW', view: 'log' }),
    },
    {
      verb: 'BACK',
      helpText: 'BACK           return to the inbox list',
      parse: () => screenUi({ kind: 'BACK' }),
    },
  ]
}

/** Register the outlook verbs for the screen scope; returns an unregister. */
export function registerOutlookVerbs(ctx: OutlookVerbContext): () => void {
  registerScreenVerbs(OUTLOOK_SCREEN_ID, buildOutlookVerbs(ctx))
  return () => unregisterScreenVerbs(OUTLOOK_SCREEN_ID)
}
