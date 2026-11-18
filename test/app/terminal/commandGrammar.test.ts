import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetGrammar,
  normalizeCommand,
  parseCommand,
  registerScreenVerbs,
  registerShellVerb,
} from '@app/terminal/commandGrammar'

beforeEach(() => __resetGrammar())

describe('normalize', () => {
  it('trims, collapses internal whitespace, and upper-cases', () => {
    expect(normalizeCommand('  read   m03 ')).toEqual(['READ', 'M03'])
    expect(normalizeCommand('')).toEqual([])
    expect(normalizeCommand('   ')).toEqual([])
  })
})

describe('parse', () => {
  it('resolves a shell verb verb-first', () => {
    registerShellVerb({
      verb: 'HELP',
      helpText: 'h',
      parse: () => ({ kind: 'ui', command: { kind: 'OPEN_HELP' } }),
    })
    expect(parseCommand('help', 'menu')).toEqual({
      kind: 'ui',
      command: { kind: 'OPEN_HELP' },
    })
  })

  it('an active-screen mission verb shadows the shell verb', () => {
    registerShellVerb({
      verb: 'READ',
      helpText: 'shell',
      parse: () => ({ kind: 'ui', command: { kind: 'OPEN_HELP' } }),
    })
    registerScreenVerbs('mission:alpha', [
      {
        verb: 'READ',
        helpText: 'mission',
        parse: () => ({ kind: 'error', message: 'MISSION READ' }),
      },
    ])
    expect(parseCommand('read x', 'mission:alpha')).toEqual({
      kind: 'error',
      message: 'MISSION READ',
    })
    // On a screen without the mission verb, the shell verb resolves.
    expect(parseCommand('read x', 'menu').kind).toBe('ui')
  })

  it('a colliding registration throws at registration time', () => {
    registerShellVerb({
      verb: 'HELP',
      helpText: 'h',
      parse: () => ({ kind: 'error', message: 'x' }),
    })
    expect(() =>
      registerShellVerb({
        verb: 'HELP',
        helpText: 'h2',
        parse: () => ({ kind: 'error', message: 'y' }),
      }),
    ).toThrow(/already registered/)
  })

  it('unknown input renders UNRECOGNIZED COMMAND with the normalized input', () => {
    expect(parseCommand('frobnicate now', 'menu')).toEqual({
      kind: 'error',
      message: 'UNRECOGNIZED COMMAND: FROBNICATE NOW',
    })
  })
})
