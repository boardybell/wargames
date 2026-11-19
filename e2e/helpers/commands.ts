// Map the engine's proven winning action envelopes onto the typed commands the
// real shell command line accepts, so a browser playthrough issues exactly the
// moves the engine solvability fixtures prove win. The envelopes are the single
// source of the winning moves; this file only renders each CampaignAction as the
// verb string a player would type, and pairs it with the timestamp the script
// authored (fed to page.clock so the engine sees the same now the fixture did).
//
// Reusing the fixtures (rather than re-authoring moves) keeps the browser
// playthrough bound to a proven win: if a mission stops being winnable the
// engine solvability test fails first, and these specs fail honestly rather than
// masking it.
import type { CampaignAction } from '@engine'

export interface TimedCommand {
  /** The command text to type into the shared command input. */
  readonly text: string
  /** The wall-clock ms the script authored for this action (page.clock time). */
  readonly at: number
}

type Envelope = [CampaignAction, number]

/** Render a single MISSION_ACTION / campaign action as the verb string the
 *  shell grammar parses back to the identical action. Throws on an action shape
 *  no verb covers, so a drift between fixtures and grammar surfaces loudly. */
export function actionToCommand(action: CampaignAction): string {
  if (action.type === 'INSPECT_RECORD') return `TRACE ${action.recordId}`
  if (action.type === 'REQUEST_SOURCE_CHECK') {
    return `CHECK SOURCE ${action.recordId}`
  }
  if (action.type === 'MISSION_ACTION') {
    const p = action.payload as Record<string, unknown>
    const kind = p.kind as string
    switch (kind) {
      // Outlook
      case 'READ':
        return `READ ${p.messageId}`
      case 'FLAG':
        return `FLAG ${p.messageId}`
      case 'QUEUE':
        return `QUEUE ${p.messageId} ${(p.channel as string).toUpperCase()}`
      case 'SEND':
        return `SEND ${p.messageId} ${(p.channel as string).toUpperCase()} ${p.recipient}`
      // Flights
      case 'LAND':
        return `LAND ${p.flightId} ${p.hubId}`
      case 'DIVERT':
        return `DIVERT ${p.flightId} ${p.hubId}`
      case 'GROUND_ALL':
        return 'GROUND ALL'
      // Bank
      case 'HOLD':
        // HOLD carries accountId (bank) or flightId (flights); both single-arg.
        return `HOLD ${p.accountId ?? p.flightId}`
      case 'RELEASE':
        return `RELEASE ${p.accountId ?? p.flightId}`
      case 'LIMIT':
        return `LIMIT ${p.accountId} ${p.cap}`
      case 'PAY':
        return `PAY ${p.paymentId}`
      // Finale
      case 'SELECT':
        return `SELECT ${p.recordId} ${p.slot}`
      case 'VALIDATE':
        return 'VALIDATE'
      case 'RUN_COMPARISON':
        return 'RUN COMPARISON'
      case 'COMMIT':
        return `COMMIT ${(p.choice as string).toUpperCase()}`
      default:
        throw new Error(`commands: no verb for mission action kind ${kind}`)
    }
  }
  throw new Error(`commands: no verb for action type ${action.type}`)
}

/** Convert a fixture envelope list to timed commands, dropping the START_MISSION
 *  envelope (the browser starts the mission from the menu, not by command) and
 *  any ACKNOWLEDGE_DEBRIEF envelope (acknowledged through the debrief control).
 *  Returns the move commands and the start/end timestamps the script spanned. */
export function envelopesToCommands(envelopes: Envelope[]): {
  readonly startAt: number
  readonly endAt: number
  readonly commands: TimedCommand[]
} {
  const startEnv = envelopes.find((e) => e[0].type === 'START_MISSION')
  const startAt = startEnv ? startEnv[1] : envelopes[0]![1]
  const commands: TimedCommand[] = []
  let endAt = startAt
  for (const [action, at] of envelopes) {
    if (action.type === 'START_MISSION') continue
    if (action.type === 'ACKNOWLEDGE_DEBRIEF') continue
    commands.push({ text: actionToCommand(action), at })
    if (at > endAt) endAt = at
  }
  return { startAt, endAt, commands }
}
