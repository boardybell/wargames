import { beforeEach, describe, expect, it } from 'vitest'
import { __resetGrammar } from '@app/terminal/commandGrammar'
import {
  __resetDefaultVerbs,
  getContextHelp,
  registerDefaultVerbs,
} from '@app/terminal/helpRegistry'

beforeEach(() => {
  __resetGrammar()
  __resetDefaultVerbs()
  registerDefaultVerbs()
})

describe('context HELP', () => {
  it('lists the verbs valid on the active screen', () => {
    const verbs = getContextHelp('menu').map((h) => h.verb)
    expect(verbs).toContain('HELP')
    expect(verbs).toContain('SETTINGS')
    expect(verbs).toContain('LIST')
  })

  it('LIST GAMES appears only in idle (menu) help, nowhere else', () => {
    expect(getContextHelp('menu').some((h) => h.verb === 'LIST')).toBe(true)
    expect(getContextHelp('mission:alpha').some((h) => h.verb === 'LIST')).toBe(
      false,
    )
    expect(getContextHelp('debrief').some((h) => h.verb === 'LIST')).toBe(false)
  })

  it('the debrief screen exposes ACKNOWLEDGE in its help', () => {
    expect(getContextHelp('debrief').some((h) => h.verb === 'ACKNOWLEDGE')).toBe(
      true,
    )
  })
})
