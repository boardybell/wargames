import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { init } from '@app/state'
import {
  CommandInput,
  parseCommand,
  registerScreenVerbs,
  registerDefaultVerbs,
} from '@app/terminal'
import type { CampaignAction } from '@engine'
import { buildCtx, memoryPort, resetAll } from '../screens/harness'

let teardown: () => void

beforeEach(() => {
  resetAll()
  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
  registerDefaultVerbs()
  // A verb that maps to an engine action, for rejection and identity tests.
  registerScreenVerbs('menu', [
    {
      verb: 'DELIVER',
      helpText: 'DELIVER   deliver a token',
      parse: () => ({
        kind: 'action',
        action: { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } },
      }),
    },
    {
      verb: 'QUIT',
      helpText: 'QUIT   forfeit',
      parse: () => ({
        kind: 'action',
        action: { type: 'FORFEIT_MISSION' },
      }),
    },
  ])
  teardown = init({ ctx: buildCtx(), seedName: 'test-seed', port: memoryPort() })
})

afterEach(() => {
  teardown()
  vi.restoreAllMocks()
  cleanup()
})

function type(text: string): void {
  const input = screen.getByTestId('command-input')
  fireEvent.change(input, { target: { value: text } })
  fireEvent.submit(screen.getByTestId('command-form'))
}

describe('CommandInput', () => {
  it('prints UNRECOGNIZED COMMAND for unparseable input', () => {
    render(<CommandInput activeScreen="menu" onUiCommand={() => {}} />)
    type('frobnicate now')
    expect(screen.getByTestId('command-output').textContent).toContain(
      'UNRECOGNIZED COMMAND: FROBNICATE NOW',
    )
  })

  it('prints INVALID with the engine reason for a rejected action', () => {
    render(<CommandInput activeScreen="menu" onUiCommand={() => {}} />)
    // No active mission on the menu: MISSION_ACTION is rejected.
    type('deliver')
    expect(screen.getByTestId('command-output').textContent).toMatch(
      /^INVALID: /,
    )
  })

  it('routes a UI command to the handler', () => {
    const onUiCommand = vi.fn()
    render(<CommandInput activeScreen="menu" onUiCommand={onUiCommand} />)
    type('help')
    expect(onUiCommand).toHaveBeenCalledWith({ kind: 'OPEN_HELP' })
  })

  it('command-button identity: the parsed action equals the button action', () => {
    // The QUIT verb and a FORFEIT ActionBar button produce the identical
    // engine action value.
    const parsed = parseCommand('quit', 'menu')
    const buttonAction: CampaignAction = { type: 'FORFEIT_MISSION' }
    expect(parsed).toEqual({ kind: 'action', action: buttonAction })
  })
})
