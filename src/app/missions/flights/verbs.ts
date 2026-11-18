// The GROUND ALL FLIGHTS verb grammar and the shared action builders. Every
// on-screen button and every typed command routes through the SAME builder, so
// the command-button identity tests hold by construction: a parsed LAND
// strict-equals the action the LAND button dispatches, and so on for DIVERT,
// HOLD, RELEASE, PROBE, GROUND ALL, TRACE, CHECK SOURCE. Diction is uppercase
// terminal; no em-dashes. The engine validator is the single source of truth
// for what is currently legal; these builders only shape actions, never judge
// them.
//
// PROBE is corridor-specific sugar for the campaign REQUEST_SOURCE_CHECK: it
// resolves the corridor's authored field-report record id from the payload
// (buildTargetRecordId, the engine's own mapper) and dispatches the generic
// CHECK SOURCE against it. The shell schedules nothing; the desk reply arrives
// later as a sourceCheckResolved emitted event.
import type { CampaignAction } from '@engine'
import {
  registerScreenVerbs,
  unregisterScreenVerbs,
  type ParseResult,
  type VerbRegistration,
} from '../../terminal'
import type { FlightsPayload } from '@engine/missions/flights/content'
import { buildTargetRecordId } from '@engine/missions/flights/rules'

export type MissionAction = Extract<CampaignAction, { type: 'MISSION_ACTION' }>

export const FLIGHTS_SCREEN_ID = 'mission:flights'

/** The view and selection commands the screen owns. GRID / LIST switch the
 *  view (persisted); SELECT <flight> sets the shared selection; BACK clears it.
 *  These ride the shell's mission-scoped SCREEN ui command as the detail, so
 *  the single shared command line dispatches them to the screen's handler. */
export type FlightsUiCommand =
  | { readonly kind: 'VIEW'; readonly view: 'grid' | 'list' }
  | { readonly kind: 'SELECT'; readonly flightId: string }
  | { readonly kind: 'BACK' }

/** Narrow an opaque SCREEN-command detail back to a FlightsUiCommand. The
 *  screen's handler calls this; a malformed detail yields null. */
export function asFlightsUiCommand(detail: unknown): FlightsUiCommand | null {
  if (typeof detail !== 'object' || detail === null) return null
  const kind = (detail as { kind?: unknown }).kind
  if (kind === 'BACK') return { kind: 'BACK' }
  if (kind === 'VIEW') {
    const view = (detail as { view?: unknown }).view
    if (view === 'grid' || view === 'list') return { kind: 'VIEW', view }
  }
  if (kind === 'SELECT') {
    const flightId = (detail as { flightId?: unknown }).flightId
    if (typeof flightId === 'string') return { kind: 'SELECT', flightId }
  }
  return null
}

function screenUi(detail: FlightsUiCommand): ParseResult {
  return {
    kind: 'ui',
    command: { kind: 'SCREEN', screenId: FLIGHTS_SCREEN_ID, detail },
  }
}

// The shared action builders. Both the typed command and the button path call
// these, so a parsed action is deep-equal to a button action.
export function makeLandAction(flightId: string, hubId: string): MissionAction {
  return { type: 'MISSION_ACTION', payload: { kind: 'LAND', flightId, hubId } }
}

export function makeDivertAction(flightId: string, hubId: string): MissionAction {
  return { type: 'MISSION_ACTION', payload: { kind: 'DIVERT', flightId, hubId } }
}

export function makeHoldAction(flightId: string): MissionAction {
  return { type: 'MISSION_ACTION', payload: { kind: 'HOLD', flightId } }
}

export function makeReleaseAction(flightId: string): MissionAction {
  return { type: 'MISSION_ACTION', payload: { kind: 'RELEASE', flightId } }
}

export function makeGroundAllAction(): MissionAction {
  return { type: 'MISSION_ACTION', payload: { kind: 'GROUND_ALL' } }
}

/** TRACE inspects a record (the restriction record, D-83). Campaign action. */
export function makeTraceAction(recordId: string): CampaignAction {
  return { type: 'INSPECT_RECORD', recordId }
}

/** CHECK SOURCE is the engine-owned generic form: a campaign action against a
 *  record id directly. The verdict is engine-resolved; the shell never computes
 *  it. */
export function makeCheckSourceAction(recordId: string): CampaignAction {
  return { type: 'REQUEST_SOURCE_CHECK', recordId }
}

/** PROBE is corridor-specific sugar: resolve the corridor's field-report record
 *  id from the payload, then dispatch the generic CHECK SOURCE against it.
 *  Returns null for an unknown corridor so the caller renders no affordance. */
export function makeProbeAction(
  payload: FlightsPayload,
  corridorId: string,
): CampaignAction | null {
  const recordId = buildTargetRecordId(payload, corridorId)
  return recordId === null ? null : makeCheckSourceAction(recordId)
}

function err(message: string): ParseResult {
  return { kind: 'error', message }
}

function action(a: CampaignAction): ParseResult {
  return { kind: 'action', action: a }
}

export interface FlightsVerbContext {
  /** The currently selected flight id, for commands that omit it. */
  readonly selectedFlightId: () => string | null
  /** The active flights payload, for PROBE's corridor-to-record resolution. */
  readonly payload: () => FlightsPayload | undefined
}

/** The verbs that dispatch engine actions, plus the view and selection verbs. */
export function buildFlightsVerbs(
  ctx: FlightsVerbContext,
): readonly VerbRegistration[] {
  const requireFlight = (explicit: string | undefined): string | null =>
    explicit ?? ctx.selectedFlightId()

  return [
    {
      verb: 'LAND',
      helpText: 'LAND <FLIGHT> <HUB>   route an airborne flight to its hub',
      parse: (tokens) => {
        const flightId = requireFlight(tokens[0])
        const hubId = tokens[1]
        if (!flightId) return err('NO FLIGHT SELECTED')
        if (!hubId) return err('NO HUB SELECTED')
        return action(makeLandAction(flightId, hubId))
      },
    },
    {
      verb: 'DIVERT',
      helpText: 'DIVERT <FLIGHT> <HUB>  route an airborne flight to another hub',
      parse: (tokens) => {
        const flightId = requireFlight(tokens[0])
        const hubId = tokens[1]
        if (!flightId) return err('NO FLIGHT SELECTED')
        if (!hubId) return err('NO HUB SELECTED')
        return action(makeDivertAction(flightId, hubId))
      },
    },
    {
      verb: 'HOLD',
      helpText: 'HOLD <FLIGHT>         hold a scheduled flight on the ground',
      parse: (tokens) => {
        const flightId = requireFlight(tokens[0])
        return flightId ? action(makeHoldAction(flightId)) : err('NO FLIGHT SELECTED')
      },
    },
    {
      verb: 'RELEASE',
      helpText: 'RELEASE <FLIGHT>      reverse a HOLD while the window is open',
      parse: (tokens) => {
        const flightId = requireFlight(tokens[0])
        return flightId ? action(makeReleaseAction(flightId)) : err('NO FLIGHT SELECTED')
      },
    },
    {
      verb: 'GROUND',
      helpText: 'GROUND ALL            blanket-ground the fleet (single use)',
      parse: (tokens) => {
        if (tokens[0] !== 'ALL') return err('UNRECOGNIZED COMMAND')
        return action(makeGroundAllAction())
      },
    },
    {
      verb: 'PROBE',
      helpText: 'PROBE <CORRIDOR>      ask the desk to verify a corridor report',
      parse: (tokens) => {
        const corridorId = tokens[0]
        if (!corridorId) return err('NO CORRIDOR SELECTED')
        const payload = ctx.payload()
        const probe = payload ? makeProbeAction(payload, corridorId) : null
        return probe ? action(probe) : err('UNKNOWN CORRIDOR')
      },
    },
    {
      verb: 'TRACE',
      helpText: 'TRACE <RECORD>        inspect the restriction record',
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
      verb: 'GRID',
      helpText: 'GRID                  show the character map',
      parse: () => screenUi({ kind: 'VIEW', view: 'grid' }),
    },
    {
      verb: 'LIST',
      helpText: 'LIST                  show the flight list',
      parse: () => screenUi({ kind: 'VIEW', view: 'list' }),
    },
    {
      verb: 'SELECT',
      helpText: 'SELECT <FLIGHT>       select a flight',
      parse: (tokens) => {
        const flightId = tokens[0]
        return flightId
          ? screenUi({ kind: 'SELECT', flightId })
          : err('NO FLIGHT SELECTED')
      },
    },
    {
      verb: 'BACK',
      helpText: 'BACK                  clear the selected flight',
      parse: () => screenUi({ kind: 'BACK' }),
    },
  ]
}

/** Register the flights verbs for the screen scope; returns an unregister. */
export function registerFlightsVerbs(ctx: FlightsVerbContext): () => void {
  registerScreenVerbs(FLIGHTS_SCREEN_ID, buildFlightsVerbs(ctx))
  return () => unregisterScreenVerbs(FLIGHTS_SCREEN_ID)
}
