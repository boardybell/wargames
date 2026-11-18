// The command line grammar. Input is normalized (trim, collapse internal
// whitespace, upper-case), verb-first. Verbs are registered by the shell and
// by screens (missions register per-screen verbs); an active screen's verbs
// shadow shell verbs. A colliding registration in the same scope throws at
// registration time so a mission cannot silently stomp a shell verb. Parsing
// yields the same typed engine action a button would dispatch, a local UI
// command (overlays), or an error line.
import type { CampaignAction } from '@engine'

export type LocalUiCommand =
  | { readonly kind: 'OPEN_HELP' }
  | { readonly kind: 'OPEN_SETTINGS' }
  | { readonly kind: 'CLOSE_OVERLAY' }
  | { readonly kind: 'LIST_GAMES' }
  | { readonly kind: 'ACKNOWLEDGE' }
  | { readonly kind: 'SET_SOUND'; readonly on: boolean }
  // A mission-scoped UI command the shell does not interpret: it carries an
  // opaque detail that the active screen (identified by screenId) handles
  // itself, so a mission can switch its own views through the single shared
  // command line without the shell growing a per-mission case. ScreenRouter
  // routes this to the screen's registered handler.
  | { readonly kind: 'SCREEN'; readonly screenId: string; readonly detail: unknown }

export type ParseResult =
  | { readonly kind: 'action'; readonly action: CampaignAction }
  | { readonly kind: 'ui'; readonly command: LocalUiCommand }
  | { readonly kind: 'error'; readonly message: string }

export interface VerbRegistration {
  readonly verb: string
  parse(tokens: readonly string[]): ParseResult
  readonly helpText: string
}

const shellVerbs = new Map<string, VerbRegistration>()
const screenVerbs = new Map<string, Map<string, VerbRegistration>>()

export function normalizeCommand(raw: string): string[] {
  const collapsed = raw.trim().replace(/\s+/g, ' ').toUpperCase()
  return collapsed.length === 0 ? [] : collapsed.split(' ')
}

export function registerShellVerb(reg: VerbRegistration): void {
  const verb = reg.verb.toUpperCase()
  if (shellVerbs.has(verb)) {
    throw new Error(`command: shell verb ${verb} already registered`)
  }
  shellVerbs.set(verb, { ...reg, verb })
}

export function registerScreenVerbs(
  screenId: string,
  regs: readonly VerbRegistration[],
): void {
  const scope = screenVerbs.get(screenId) ?? new Map<string, VerbRegistration>()
  for (const reg of regs) {
    const verb = reg.verb.toUpperCase()
    if (scope.has(verb)) {
      throw new Error(
        `command: screen verb ${verb} already registered on ${screenId}`,
      )
    }
    scope.set(verb, { ...reg, verb })
  }
  screenVerbs.set(screenId, scope)
}

/** Drop a screen's verb scope. A screen calls this on unmount so a later
 *  remount can re-register the same verbs without a duplicate-registration
 *  throw. Unknown screen ids are a no-op. */
export function unregisterScreenVerbs(screenId: string): void {
  screenVerbs.delete(screenId)
}

/** Active-screen verbs shadow shell verbs. */
export function resolveVerb(
  verb: string,
  activeScreen: string,
): VerbRegistration | null {
  const upper = verb.toUpperCase()
  return screenVerbs.get(activeScreen)?.get(upper) ?? shellVerbs.get(upper) ?? null
}

export function parseCommand(raw: string, activeScreen: string): ParseResult {
  const tokens = normalizeCommand(raw)
  if (tokens.length === 0) {
    return { kind: 'error', message: 'UNRECOGNIZED COMMAND' }
  }
  const [verb, ...args] = tokens
  const reg = resolveVerb(verb!, activeScreen)
  if (!reg) {
    return { kind: 'error', message: `UNRECOGNIZED COMMAND: ${tokens.join(' ')}` }
  }
  return reg.parse(args)
}

/** The verbs visible in HELP for a screen: its own plus the shell verbs it
 *  does not shadow, in a stable order. */
export function verbsForScreen(activeScreen: string): VerbRegistration[] {
  const own = screenVerbs.get(activeScreen) ?? new Map()
  const merged = new Map<string, VerbRegistration>(shellVerbs)
  for (const [verb, reg] of own) merged.set(verb, reg)
  return [...merged.values()].sort((a, b) => (a.verb < b.verb ? -1 : 1))
}

/** Test-only. */
export function __resetGrammar(): void {
  shellVerbs.clear()
  screenVerbs.clear()
}
