import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { buildTestContext, makeTestDoubleMission } from '@engine/testing'
import type { TestDoubleState } from '@engine/testing'
import { createCampaign, dispatch } from '@engine/campaign/engine'
import { FIXTURE_RECORDS } from '../records/fixtures'
import { stateHash } from '../harness/canonical'

const ctx = buildTestContext(FIXTURE_RECORDS)
const T0 = 1_000_000

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const inner of Object.values(value)) deepFreeze(inner)
    Object.freeze(value)
  }
  return value
}

function startAlpha(extended = false) {
  return dispatch(
    ctx,
    createCampaign(ctx, 'test-seed', { extendedTime: extended }),
    { type: 'START_MISSION', missionId: 'alpha' },
    T0,
  )
}

describe('mission-module lifecycle through the engine', () => {
  it('engine-produced substate round-trips via the registry saveSchema', () => {
    const started = startAlpha()
    const substate = started.state.activeMission?.substate
    const schema = ctx.missions['alpha']!.saveSchema
    const revived = v.parse(schema, JSON.parse(JSON.stringify(substate)))
    expect(revived).toEqual(substate)
    expect(() =>
      v.parse(schema, { ...(substate as object), smuggled: 'body text' }),
    ).toThrow()
    expect(() =>
      v.parse(schema, { ...(substate as object), delivered: 'three' }),
    ).toThrow()
  })

  it('missions see draws and times only through events, draws included', () => {
    const started = startAlpha()
    const acted = dispatch(
      ctx,
      started.state,
      { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } },
      T0 + 70_000,
    )
    const substate = acted.state.activeMission?.substate as TestDoubleState
    expect(substate.inputLog).toHaveLength(2)
    const drawEntry = substate.inputLog[0]!
    const match = drawEntry.match(
      new RegExp(`^scheduled:mid-stage@${T0 + 60_000}#(\\d)$`),
    )
    expect(match, drawEntry).not.toBeNull()
    const drawn = Number(match![1])
    expect(drawn).toBeGreaterThanOrEqual(1)
    expect(drawn).toBeLessThanOrEqual(6)
    expect(substate.inputLog[1]).toBe(`action:action-0@${T0 + 70_000}`)
  })

  it('draw delivery is replay-deterministic and advances campaign rng', () => {
    const a = dispatch(
      ctx,
      startAlpha().state,
      { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } },
      T0 + 70_000,
    )
    const b = dispatch(
      ctx,
      startAlpha().state,
      { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } },
      T0 + 70_000,
    )
    expect(stateHash(a.state)).toBe(stateHash(b.state))
    const freshRng = createCampaign(ctx, 'test-seed', {
      extendedTime: false,
    }).rng
    expect(a.state.rng).not.toEqual(freshRng)
  })

  it('module functions are pure and frozen-input safe', () => {
    const module = makeTestDoubleMission('alpha')
    const seed = ctx.seeds['test-seed']!
    const substate = deepFreeze(
      module.init(seed, { byKind: { commsDelayed: 5 } }, 240_000),
    )
    const event = deepFreeze({
      type: 'action' as const,
      id: 'action-0',
      kind: 'action',
      payload: { kind: 'DELIVER' as const },
      now: T0,
    })
    const first = module.reduce(substate, event)
    const second = module.reduce(substate, event)
    expect(first).toEqual(second)
    expect(module.validate(substate, { kind: 'DELIVER' })).toEqual(
      module.validate(substate, { kind: 'DELIVER' }),
    )
    expect(module.evaluate(substate, 'timeout')).toEqual(
      module.evaluate(substate, 'timeout'),
    )
  })

  it('tier ladder covers partial and poor counts', () => {
    const module = makeTestDoubleMission('alpha')
    const seed = ctx.seeds['test-seed']!
    const base = module.init(seed, { byKind: {} }, 240_000)
    expect(module.evaluate({ ...base, delivered: 2 }, 'timeout').tier).toBe(
      'partial',
    )
    expect(module.evaluate({ ...base, delivered: 1 }, 'timeout').tier).toBe(
      'poor',
    )
    expect(
      module.validate(base, { kind: 'FLY_A_KITE' }),
    ).toEqual({ valid: false, reason: 'UNKNOWN KIND' })
  })

  it('debrief renders from the settled outcome', () => {
    const module = makeTestDoubleMission('alpha')
    const outcome = module.evaluate(
      module.init(ctx.seeds['test-seed']!, { byKind: {} }, 240_000),
      'timeout',
    )
    const payload = module.debrief!(outcome)
    expect(payload.headline).toBe('FAILED (TIMEOUT)')
    expect(payload.missionId).toBe('alpha')
    expect(payload.lines[0]).toContain('SERVICE COST 30')
  })

  it('extended duration doubles endsAt and scales start-anchored offsets only', () => {
    const extended = startAlpha(true)
    expect(extended.state.activeMission?.endsAt).toBe(T0 + 480_000)
    const byId = Object.fromEntries(
      extended.state.missionQueue.map((e) => [e.id, e.scheduledAt]),
    )
    expect(byId['mid-stage']).toBe(T0 + 120_000)
    expect(byId['warn-30']).toBe(T0 + 480_000 - 30_000)
    expect(byId['warn-10']).toBe(T0 + 480_000 - 10_000)
  })
})

describe('bundle hygiene', () => {
  it('no engine module outside testing/ imports the test double', () => {
    const root = join(process.cwd(), 'src', 'engine')
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) {
          if (name === 'testing') continue
          walk(full)
        } else if (full.endsWith('.ts')) {
          const source = readFileSync(full, 'utf8')
          if (source.includes('@engine/testing') || /from '[^']*\/testing/.test(source)) {
            offenders.push(full)
          }
        }
      }
    }
    walk(root)
    expect(offenders).toEqual([])
  })
})
