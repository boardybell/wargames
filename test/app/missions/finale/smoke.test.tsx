import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { init, getState } from '@app/state'
import { ScreenRouter } from '@app/screens'
import { registerDefaultVerbs } from '@app/terminal'
import { resetAll } from '../../screens/harness'
import { registerFinaleScreen } from '@app/missions/finale/FinaleScreen'
import { __resetFinaleView } from '@app/missions/finale/selectors'
import { makeFinaleCtx, startFinaleViaSend, finaleSub } from './fixture'

let teardown: () => void
let clock = 1_000_000

function advanceTo(ms: number): void {
  clock = ms
}

beforeEach(() => {
  resetAll()
  __resetFinaleView()
  clock = 1_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  registerDefaultVerbs()
  registerFinaleScreen()
  teardown = init({
    ctx: makeFinaleCtx(),
    seedName: 'test-seed',
    port: { read: () => null, write: () => {}, remove: () => {} },
  })
})

afterEach(() => {
  teardown()
  __resetFinaleView()
  vi.restoreAllMocks()
  cleanup()
})

describe('finale boot smoke', () => {
  it('reaches finale start and renders the three-view shell', () => {
    startFinaleViaSend(advanceTo)
    expect(getState().activeMission?.missionId).toBe('finale')
    expect(finaleSub()).toBeDefined()
    render(<ScreenRouter />)
    expect(screen.getByTestId('finale-screen')).toBeInTheDocument()
    expect(screen.getByTestId('finale-tab-case')).toBeInTheDocument()
    expect(screen.getByTestId('finale-incident-log')).toBeInTheDocument()
    expect(screen.getByTestId('finale-countdown')).toBeInTheDocument()
  })
})
