// Context-sensitive HELP and the default verb set. HELP lists exactly the
// verbs valid on the active screen (its own plus the unshadowed shell verbs).
// LIST GAMES is registered only on the menu screen, so it appears in idle
// HELP and nowhere else: when a mission is active the phase screen is not the
// menu, so the verb is simply out of scope.
import {
  registerScreenVerbs,
  registerShellVerb,
  verbsForScreen,
  type ParseResult,
  type VerbRegistration,
} from './commandGrammar'

export interface HelpLine {
  readonly verb: string
  readonly helpText: string
}

export function getContextHelp(activeScreen: string): HelpLine[] {
  return verbsForScreen(activeScreen).map((reg) => ({
    verb: reg.verb,
    helpText: reg.helpText,
  }))
}

const ok = (command: ParseResult): ParseResult => command

const SHELL_VERBS: VerbRegistration[] = [
  {
    verb: 'HELP',
    helpText: 'HELP           list the commands available here',
    parse: () => ok({ kind: 'ui', command: { kind: 'OPEN_HELP' } }),
  },
  {
    verb: 'SETTINGS',
    helpText: 'SETTINGS       open settings',
    parse: () => ok({ kind: 'ui', command: { kind: 'OPEN_SETTINGS' } }),
  },
  {
    verb: 'SOUND',
    helpText: 'SOUND ON|OFF   toggle sound',
    parse: (tokens) => {
      const arg = tokens[0]
      if (arg === 'ON') return { kind: 'ui', command: { kind: 'SET_SOUND', on: true } }
      if (arg === 'OFF') return { kind: 'ui', command: { kind: 'SET_SOUND', on: false } }
      return { kind: 'error', message: 'SOUND EXPECTS ON OR OFF' }
    },
  },
]

const MENU_VERBS: VerbRegistration[] = [
  {
    verb: 'LIST',
    helpText: 'LIST GAMES     list the games this machine knows',
    parse: (tokens) =>
      tokens[0] === 'GAMES'
        ? { kind: 'ui', command: { kind: 'LIST_GAMES' } }
        : { kind: 'error', message: 'DID YOU MEAN LIST GAMES' },
  },
]

const DEBRIEF_VERBS: VerbRegistration[] = [
  {
    verb: 'ACKNOWLEDGE',
    helpText: 'ACKNOWLEDGE    acknowledge this debrief',
    parse: () => ({ kind: 'ui', command: { kind: 'ACKNOWLEDGE' } }),
  },
]

let defaultsRegistered = false

/** Register the built-in shell and screen verbs. Idempotent: a second call
 *  (HMR, a repeated init, StrictMode) is a no-op rather than a collision
 *  throw. The grammar reset in tests clears the registries; call
 *  __resetDefaultVerbs alongside it so the guard re-arms. */
export function registerDefaultVerbs(): void {
  if (defaultsRegistered) return
  for (const reg of SHELL_VERBS) registerShellVerb(reg)
  registerScreenVerbs('menu', MENU_VERBS)
  registerScreenVerbs('debrief', DEBRIEF_VERBS)
  defaultsRegistered = true
}

/** Test-only: re-arm the idempotence guard after __resetGrammar. */
export function __resetDefaultVerbs(): void {
  defaultsRegistered = false
}
