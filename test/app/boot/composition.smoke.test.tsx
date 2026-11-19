// The composition root is the product: a bare load must boot the engine-driven
// shell (hero -> activation -> the SHALL WE PLAY A GAME menu), reach a real
// mission screen, and reach the real GLOBAL FAILSAFE finale screen through the
// real engine and the derived finale payload. This guards against a regression
// to a blank boot or to the standalone WarGamesGame as the entry: bootApp wires
// the production context (the catalog seeds plus the four real mission modules),
// registers every mission screen and the finale, and mounts the hero stage.
//
// It renders bootApp() exactly as main.tsx does, so that one seam is exercised
// without touching the DOM mount.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bootApp } from '@app/boot'
import { send, getState } from '@app/state'
import { getContext } from '@app/state/store'
import type { CampaignState } from '@engine'
import type { CaseFileCheck, FinaleState } from '@engine/missions/finale/types'
import { resetAll as resetScreens, memoryPort } from '../screens/harness'
import { mockAnimate, resetHero } from '../hero/harness'
import { DEFAULT_SEED_NAME } from '@engine/seeds/context'
import { FINALE_FIELD_REPORT } from '@engine/seeds/catalog'

let animCtl: ReturnType<typeof mockAnimate>
/** A mutable wall clock the send()/wake() path samples through Date.now, so the
 *  winnability step can advance time for the field-report desk reply. */
let clock = 1_000_000

/** A fresh in-memory save slot per test: bootApp creates a new campaign on the
 *  default seed rather than restoring a prior one, and the boot never touches
 *  real localStorage. */
function boot() {
  return bootApp({ port: memoryPort() })
}

beforeEach(() => {
  resetScreens()
  resetHero()
  clock = 1_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  animCtl = mockAnimate()
})

afterEach(() => {
  animCtl.restore()
  cleanup()
  vi.restoreAllMocks()
})

function finishPushIn(): void {
  const dolly = animCtl.anims.find(
    (a) =>
      typeof a.keyframes[1]?.transform === 'string' &&
      (a.keyframes[1].transform as string).includes('scale'),
  )
  act(() => {
    dolly!.anim.finish()
  })
}

describe('app composition root', () => {
  it('boots the production context: default seed plus the four real missions', () => {
    boot()
    const ctx = getContext()
    expect(ctx.seeds[DEFAULT_SEED_NAME]).toBeDefined()
    // The three playable missions in menu order, plus the finale registered.
    expect([...ctx.missionOrder]).toEqual(['outlook', 'flights', 'bank'])
    expect(ctx.missions.outlook).toBeDefined()
    expect(ctx.missions.flights).toBeDefined()
    expect(ctx.missions.bank).toBeDefined()
    expect(ctx.missions.finale).toBeDefined()
  })

  it('a bare load shows the hero, and activation reveals the SHALL WE PLAY A GAME menu', () => {
    render(boot())
    expect(screen.getByTestId('hero-button')).toBeInTheDocument()

    act(() => {
      fireEvent.click(screen.getByTestId('hero-button'))
    })
    finishPushIn()

    expect(screen.queryByTestId('hero-button')).toBeNull()
    expect(screen.getByTestId('menu-screen')).toBeInTheDocument()
    expect(screen.getByText(/SHALL WE PLAY A GAME\?/)).toBeInTheDocument()
  })

  it('a chosen mission is reachable: starting CRASH OUTLOOK renders its real screen', () => {
    render(boot())
    act(() => {
      fireEvent.click(screen.getByTestId('hero-button'))
    })
    finishPushIn()

    act(() => {
      send({ type: 'START_MISSION', missionId: 'outlook' })
    })
    // The real OutlookScreen, not the generic fallback mission frame.
    expect(screen.getByTestId('screen-root').getAttribute('data-active-screen')).toBe(
      'mission:outlook',
    )
    expect(screen.getByTestId('outlook-screen')).toBeInTheDocument()
    expect(screen.queryByTestId('mission-frame')).toBeNull()
  })

  it('the finale is reachable: starting the finale renders the real GLOBAL FAILSAFE screen', () => {
    // START_MISSION is gated on phase=menu and not-settled only, so the finale
    // starts from a fresh campaign too. This drives the real engine through
    // makeFinaleMission(...).init() with the payload derived from the seed; a
    // content-invalid finale would fail init and never render its screen.
    render(boot())
    act(() => {
      fireEvent.click(screen.getByTestId('hero-button'))
    })
    finishPushIn()

    act(() => {
      send({ type: 'START_MISSION', missionId: 'finale' })
    })
    expect(screen.getByTestId('screen-root').getAttribute('data-active-screen')).toBe(
      'mission:finale',
    )
    // The real GLOBAL FAILSAFE screen, proving the derived finale payload
    // passed makeFinaleMission(...).init() rather than failing to a frame.
    expect(screen.getByTestId('finale-screen')).toBeInTheDocument()
    expect(screen.queryByTestId('mission-frame')).toBeNull()
  })

  it('the finale is WINNABLE: the derived default-seed case validates and commits to recovery', () => {
    // Reachability alone is not winnability: a derived finale could render yet
    // never validate (wrong root, an unanswerable field report). Drive the real
    // production shell on the default seed (exercise-r04) through the real
    // engine to a certified case and a STAGED RECOVERY commit, proving the
    // app-root wiring ships a finale the player can actually finish.
    render(boot())
    act(() => {
      fireEvent.click(screen.getByTestId('hero-button'))
    })
    finishPushIn()
    act(() => {
      send({ type: 'START_MISSION', missionId: 'finale' })
    })
    expect(getState().activeMission?.missionId).toBe('finale')

    const fieldReportId = FINALE_FIELD_REPORT[DEFAULT_SEED_NAME]!
    // Corroborate the observation through the real desk: request the field
    // report, advance past its 45s delay so the reply lands.
    clock = 1_000_500
    act(() => {
      send({ type: 'REQUEST_SOURCE_CHECK', recordId: fieldReportId })
    })
    clock = 1_060_000
    act(() => {
      send({ type: 'INSPECT_RECORD', recordId: fieldReportId })
    })

    const caseFileFrom = (state: CampaignState) => ({
      sourceChecks: state.sourceChecks.map(
        (c): CaseFileCheck => ({
          recordId: c.recordId,
          outcome: c.outcome,
          arrivedAfterSettlement: c.arrivedAfterSettlement,
        }),
      ),
      inspectedRecords: [...state.inspectedRecords],
    })

    // Fill the five derived slots: EXERCISE root C17, the three subsystem
    // records in event-time order, the landed field report as the observation.
    const fills: Array<[string, string]> = [
      ['outlook', 'C17'],
      ['flights', 'F06'],
      ['bank', 'B04'],
      ['root', 'C17'],
      ['observation', fieldReportId],
    ]
    let now = 1_061_000
    for (const [slot, recordId] of fills) {
      clock = now
      act(() => {
        send({ type: 'MISSION_ACTION', payload: { kind: 'SELECT', slot, recordId } })
      })
      now += 1_000
    }
    clock = now
    act(() => {
      send({ type: 'MISSION_ACTION', payload: { kind: 'REORDER', ordering: ['C17', 'F06', 'B04'] } })
    })
    now += 1_000
    clock = now
    act(() => {
      send({
        type: 'MISSION_ACTION',
        payload: { kind: 'VALIDATE', caseFile: caseFileFrom(getState()) },
      })
    })
    expect((getState().activeMission!.substate as FinaleState).caseValid).toBe(true)

    now += 1_000
    clock = now
    act(() => {
      send({ type: 'MISSION_ACTION', payload: { kind: 'COMMIT', choice: 'staged' } })
    })
    const outcome = getState().settled.find((s) => s.missionId === 'finale')!
    expect(outcome.cause).toBe('completed')
    expect(outcome.endingId).toBe('recovery')
  })
})
