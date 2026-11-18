import { describe, expect, it } from 'vitest'
import {
  BACKUP_KEY,
  PRIMARY_KEY,
  decodeSave,
  encodeSave,
  loadCampaign,
  mergeGuard,
  persistCampaign,
  runMigrations,
} from '@engine/save'
import type { Migration, StoragePort } from '@engine/save'
import { buildTestContext } from '@engine/testing'
import { createCampaign, dispatch } from '@engine/campaign/engine'
import type { CampaignState } from '@engine/campaign/state'
import { FIXTURE_RECORDS } from '../records/fixtures'
import { stateHash } from '../harness/canonical'

const ctx = buildTestContext(FIXTURE_RECORDS)
const registry = ctx.missions
const T0 = 1_000_000

function memoryPort(seed: Record<string, string> = {}): StoragePort & {
  store: Record<string, string>
} {
  const store: Record<string, string> = { ...seed }
  return {
    store,
    read: (k) => store[k] ?? null,
    write: (k, v) => {
      store[k] = v
    },
    remove: (k) => {
      delete store[k]
    },
  }
}

function won(): CampaignState {
  let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, T0)
  for (const action of [
    { type: 'START_MISSION', missionId: 'alpha' } as const,
    { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } } as const,
    { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } } as const,
    { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } } as const,
  ]) {
    state = dispatch(ctx, state, action, state.lastNow + 1_000).state
  }
  return state
}

describe('codec', () => {
  it('encode/decode round-trips a mid-mission state byte-for-byte', () => {
    const started = dispatch(
      ctx,
      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
      { type: 'START_MISSION', missionId: 'alpha' },
      T0,
    ).state
    const revived = decodeSave(encodeSave(started), registry)
    expect(stateHash(revived)).toBe(stateHash(started))
    expect(revived.activeMission).not.toBeNull()
  })

  it('corrupt mission substate fails validation', () => {
    const started = dispatch(
      ctx,
      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
      { type: 'START_MISSION', missionId: 'alpha' },
      T0,
    ).state
    const raw = encodeSave(started)
    const poisoned = JSON.parse(raw)
    poisoned.state.activeMission.substate.delivered = 'three'
    expect(() => decodeSave(JSON.stringify(poisoned), registry)).toThrow()
  })

  it('an unknown version throws, a missing migration throws', () => {
    const future = JSON.stringify({ version: 99, state: won() })
    expect(() => decodeSave(future, registry)).toThrow(/version/)
  })
})

describe('load fallthrough', () => {
  it('intact primary loads clean', () => {
    const port = memoryPort({ [PRIMARY_KEY]: encodeSave(won()) })
    const result = loadCampaign(port, registry)
    expect(result.recovery).toBe('clean')
    expect(result.state?.settled).toHaveLength(1)
  })

  it('corrupt primary falls to backup', () => {
    const port = memoryPort({
      [PRIMARY_KEY]: '{not valid json',
      [BACKUP_KEY]: encodeSave(won()),
    })
    const result = loadCampaign(port, registry)
    expect(result.recovery).toBe('recovered-backup')
    expect(result.state).not.toBeNull()
  })

  it('corrupt both falls to fresh with reset flag', () => {
    const port = memoryPort({
      [PRIMARY_KEY]: 'garbage',
      [BACKUP_KEY]: 'also garbage',
    })
    const result = loadCampaign(port, registry)
    expect(result).toEqual({ state: null, recovery: 'reset' })
  })

  it('a throwing migration falls through, not just parse errors', () => {
    const port = memoryPort({
      [PRIMARY_KEY]: JSON.stringify({ version: -1, state: won() }),
      [BACKUP_KEY]: encodeSave(won()),
    })
    const result = loadCampaign(port, registry)
    expect(result.recovery).toBe('recovered-backup')
  })

  it('a primary with valid JSON but a broken mission substate falls to backup', () => {
    // Structurally valid envelope, but the active mission substate violates
    // the module schema. Only the composed decode (not a bare JSON parse)
    // catches this, so it exercises the end-to-end loader fallthrough.
    const started = dispatch(
      ctx,
      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
      { type: 'START_MISSION', missionId: 'alpha' },
      T0,
    ).state
    const poisoned = JSON.parse(encodeSave(started)) as {
      state: { activeMission: { substate: { delivered: unknown } } }
    }
    poisoned.state.activeMission.substate.delivered = 'three'
    const port = memoryPort({
      [PRIMARY_KEY]: JSON.stringify(poisoned),
      [BACKUP_KEY]: encodeSave(won()),
    })
    const result = loadCampaign(port, registry)
    expect(result.recovery).toBe('recovered-backup')
    expect(result.state).not.toBeNull()
  })
})

describe('monotonic merge guard', () => {
  it('a stale backup cannot resurrect a settled mission as active', () => {
    const session = won()
    const staleActive = dispatch(
      ctx,
      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
      { type: 'START_MISSION', missionId: 'alpha' },
      T0,
    ).state
    const merged = mergeGuard(staleActive, session)
    expect(merged.activeMission).toBeNull()
    expect(merged.settled.some((s) => s.missionId === 'alpha')).toBe(true)
  })

  it('self-consistency runs on a fresh boot with no in-session facts', () => {
    // A single corrupt slot where a mission is both settled and active;
    // no session has settled anything yet. The guard must still drop the
    // contradictory active pointer, not pass the corruption through.
    const session = won()
    const settledOutcome = session.settled[0]!
    const stale = dispatch(
      ctx,
      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
      { type: 'START_MISSION', missionId: 'alpha' },
      T0,
    ).state
    const corrupt: CampaignState = { ...stale, settled: [settledOutcome] }
    const merged = mergeGuard(corrupt, null)
    expect(merged.activeMission).toBeNull()
    expect(merged.settled.some((s) => s.missionId === 'alpha')).toBe(true)
  })

  it('the live session is authoritative; a loaded outcome never overwrites it', () => {
    const session = won()
    const sessionTier = session.settled[0]!.tier
    const loadedWithDifferent: CampaignState = {
      ...session,
      settled: [{ ...session.settled[0]!, tier: 'failed' as const }],
    }
    const merged = mergeGuard(loadedWithDifferent, session)
    expect(merged.settled[0]?.tier).toBe(sessionTier)
  })

  it('in-session wins even at an EQUAL settleSeq (divergent lineages)', () => {
    // The real collision: two campaigns both settle their first mission at
    // the same ordinal. settleSeq is per-lineage and not comparable across
    // saves, so the loaded copy must not win a tie on it.
    const session = won()
    const loadedSameSeq: CampaignState = {
      ...session,
      settled: [
        {
          ...session.settled[0]!,
          tier: 'failed' as const,
          settleSeq: session.settled[0]!.settleSeq,
        },
      ],
    }
    const merged = mergeGuard(loadedSameSeq, session)
    expect(merged.settled[0]?.tier).toBe(session.settled[0]!.tier)
  })

  it('a loaded save can ADD a mission the session never settled', () => {
    // Session settled only alpha; a load carries a beta settlement the
    // session never saw. Merge moves settlement forward, additively.
    const session = won()
    const other = won()
    const betaOutcome = {
      ...other.settled[0]!,
      missionId: 'beta' as const,
    }
    const loaded: CampaignState = {
      ...session,
      settled: [...session.settled, betaOutcome],
    }
    const merged = mergeGuard(loaded, session)
    expect(merged.settled.map((s) => s.missionId).sort()).toEqual([
      'alpha',
      'beta',
    ])
  })

  it('folds an additively-imported outcome clue into cluesFound', () => {
    // A loaded save carries a settled beta the session never saw, and that
    // outcome has a clue. The merge must record the clue, not just the
    // settled fact, or the campaign is internally inconsistent.
    const session = won()
    const betaOutcome = {
      ...session.settled[0]!,
      missionId: 'beta' as const,
      clueId: 'clue-beta' as const,
    }
    // loaded.cluesFound deliberately omits clue-beta: the fold must derive
    // it from the settled outcome, not from copying the loaded clue list.
    const loaded: CampaignState = {
      ...session,
      settled: [...session.settled, betaOutcome],
    }
    const merged = mergeGuard(loaded, session)
    expect(merged.settled.some((s) => s.missionId === 'beta')).toBe(true)
    expect(merged.cluesFound).toContain('clue-beta')
  })

  it('is idempotent: guarding a guarded state changes nothing', () => {
    const session = won()
    const staleActive = dispatch(
      ctx,
      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
      { type: 'START_MISSION', missionId: 'alpha' },
      T0,
    ).state
    const once = mergeGuard(staleActive, session)
    const twice = mergeGuard(once, session)
    expect(stateHash(twice)).toBe(stateHash(once))
  })

  it('the settle counter never regresses below an imported settleSeq', () => {
    const session = won()
    const highSeq = session.settled[0]!.settleSeq + 5
    const loaded: CampaignState = {
      ...session,
      settleCounter: 0,
      settled: [{ ...session.settled[0]!, settleSeq: highSeq }],
    }
    // On a fresh boot (no session) the loaded save is the base; its counter
    // must be lifted above the highest settleSeq it carries.
    const merged = mergeGuard(loaded, null)
    expect(merged.settleCounter).toBeGreaterThan(highSeq)
  })

  it('runs on the backup load path too', () => {
    const session = won()
    const staleBackup = dispatch(
      ctx,
      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
      { type: 'START_MISSION', missionId: 'alpha' },
      T0,
    ).state
    const port = memoryPort({
      [PRIMARY_KEY]: 'corrupt',
      [BACKUP_KEY]: encodeSave(staleBackup),
    })
    const result = loadCampaign(port, registry, session)
    expect(result.recovery).toBe('recovered-backup')
    expect(result.state?.activeMission).toBeNull()
    expect(result.state?.settled.some((s) => s.missionId === 'alpha')).toBe(
      true,
    )
  })
})

describe('persist and storage port', () => {
  it('double-buffers: the backup trails the primary by one generation', () => {
    const port = memoryPort()
    const first = encodeSave(won())
    const second = encodeSave(
      dispatch(
        ctx,
        createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
        { type: 'START_MISSION', missionId: 'alpha' },
        T0,
      ).state,
    )
    // First save: only the primary exists, nothing older to preserve.
    expect(persistCampaign(port, won(), registry).ok).toBe(true)
    expect(port.store[PRIMARY_KEY]).toBe(first)
    expect(port.store[BACKUP_KEY]).toBeUndefined()
    // Second save: the prior good primary moves into the backup slot.
    const startedState = dispatch(
      ctx,
      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
      { type: 'START_MISSION', missionId: 'alpha' },
      T0,
    ).state
    expect(persistCampaign(port, startedState, registry).ok).toBe(true)
    expect(port.store[PRIMARY_KEY]).toBe(second)
    expect(port.store[BACKUP_KEY]).toBe(first)
  })

  it('a failed primary write restores the prior good primary', () => {
    const priorPayload = encodeSave(won())
    const store: Record<string, string> = { [PRIMARY_KEY]: priorPayload }
    const port: StoragePort = {
      read: (k) => store[k] ?? null,
      write: (k, value) => {
        if (k === PRIMARY_KEY && value !== priorPayload) {
          throw new Error('disk full, not quota-tagged')
        }
        store[k] = value
      },
      remove: (k) => {
        delete store[k]
      },
    }
    const started = dispatch(
      ctx,
      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
      { type: 'START_MISSION', missionId: 'alpha' },
      T0,
    ).state
    const result = persistCampaign(port, started, registry)
    expect(result.ok).toBe(false)
    // The slot is never left torn: the prior good primary is intact.
    expect(store[PRIMARY_KEY]).toBe(priorPayload)
  })

  it('quota error drops the backup slot and retries primary once', () => {
    const store: Record<string, string> = { [BACKUP_KEY]: 'old' }
    let primaryAttempts = 0
    const port: StoragePort = {
      read: (k) => store[k] ?? null,
      write: (k, v) => {
        if (k === PRIMARY_KEY) {
          primaryAttempts += 1
          if (primaryAttempts === 1) {
            const err = new Error('quota') as Error & { name: string }
            err.name = 'QuotaExceededError'
            throw err
          }
        }
        store[k] = v
      },
      remove: (k) => {
        delete store[k]
      },
    }
    const result = persistCampaign(port, won(), registry)
    expect(result.ok).toBe(true)
    expect(primaryAttempts).toBe(2)
  })

  it('a structurally broken substate is rejected at write, not next load', () => {
    const started = dispatch(
      ctx,
      createCampaign(ctx, 'test-seed', { extendedTime: false }, T0),
      { type: 'START_MISSION', missionId: 'alpha' },
      T0,
    ).state
    const broken: CampaignState = {
      ...started,
      activeMission: {
        ...started.activeMission!,
        // delivered must be an integer; a string fails the mission schema.
        substate: {
          ...(started.activeMission!.substate as Record<string, unknown>),
          delivered: 'three',
        },
      },
    }
    const port = memoryPort()
    const result = persistCampaign(port, broken, registry)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('INVALID STATE')
    expect(port.store[PRIMARY_KEY]).toBeUndefined()
  })

  it('every port call is fallible without crashing the engine', () => {
    const alwaysThrows: StoragePort = {
      read: () => {
        throw new Error('read blocked')
      },
      write: () => {
        throw new Error('write blocked')
      },
      remove: () => {
        throw new Error('remove blocked')
      },
    }
    expect(() => loadCampaign(alwaysThrows, registry)).not.toThrow()
    expect(loadCampaign(alwaysThrows, registry).recovery).toBe('reset')
    expect(() => persistCampaign(alwaysThrows, won(), registry)).not.toThrow()
    expect(persistCampaign(alwaysThrows, won(), registry).ok).toBe(false)
  })
})

describe('migration pipeline exists from day one', () => {
  it('a real v0-to-v1 migration transforms and advances the version', () => {
    // Inject a migration that strips a legacy field and stamps v1. This
    // exercises the actual application loop, not just its error path.
    const current = won()
    const asV0 = { version: 0, state: { ...current, legacyField: true } }
    const dropLegacy: Migration = (raw) => {
      const env = raw as { state: Record<string, unknown> }
      const { legacyField: _drop, ...rest } = env.state
      void _drop
      return { version: 1, state: rest }
    }
    const migrated = runMigrations(asV0, [dropLegacy]) as {
      version: number
      state: Record<string, unknown>
    }
    expect(migrated.version).toBe(1)
    expect('legacyField' in migrated.state).toBe(false)
  })

  it('a throwing migration propagates so the loader can fall through', () => {
    const boom: Migration = () => {
      throw new Error('migration blew up')
    }
    expect(() =>
      runMigrations({ version: 0, state: {} }, [boom]),
    ).toThrow(/blew up/)
  })

  it('a missing version defaults to 0 and routes through migration', () => {
    let sawVersion0 = false
    const noop: Migration = (raw) => {
      sawVersion0 = true
      return { version: 1, state: (raw as { state: unknown }).state }
    }
    runMigrations({ state: { any: true } }, [noop])
    expect(sawVersion0).toBe(true)
  })

  it('an unregistered older version throws missing-migration', () => {
    const current = won()
    const asV0 = { version: 0, state: current }
    const port = memoryPort({
      [PRIMARY_KEY]: JSON.stringify(asV0),
      [BACKUP_KEY]: encodeSave(current),
    })
    // Shipped MIGRATIONS is empty, so a v0 payload has no MIGRATIONS[0]
    // and correctly throws, falling the loader through to backup.
    const result = loadCampaign(port, registry)
    expect(result.recovery).toBe('recovered-backup')
  })
})

describe('byte budget', () => {
  it('a full-campaign save with inspections stays under 64 KB', () => {
    const recordIds = FIXTURE_RECORDS.map((r) => r.id)
    let state = createCampaign(ctx, 'test-seed', { extendedTime: false }, T0)
    for (const missionId of ['alpha', 'beta', 'gamma']) {
      state = dispatch(
        ctx,
        state,
        { type: 'START_MISSION', missionId },
        state.lastNow + 1_000,
      ).state
      // Inspect every record while the mission is open; inspection records
      // are the heaviest persisted collection, so a realistic save folds
      // them in, not just the deliveries.
      for (const recordId of recordIds) {
        state = dispatch(
          ctx,
          state,
          { type: 'INSPECT_RECORD', recordId },
          state.lastNow + 1_000,
        ).state
      }
      for (let i = 0; i < 3; i++) {
        state = dispatch(
          ctx,
          state,
          { type: 'MISSION_ACTION', payload: { kind: 'DELIVER' } },
          state.lastNow + 1_000,
        ).state
      }
      state = dispatch(
        ctx,
        state,
        { type: 'ACKNOWLEDGE_DEBRIEF', missionId },
        state.lastNow + 1_000,
      ).state
    }
    const bytes = new TextEncoder().encode(encodeSave(state)).length
    expect(bytes).toBeLessThan(64 * 1024)
  })
})
