// Shared harness for the engine-binding tests: a real engine over the
// test-double mission, an in-memory storage port, and the module resets so
// each test starts from a clean singleton.
import { buildTestContext } from '@engine/testing'
import type { EngineContext, StoragePort } from '@engine'
import { __resetStore } from '@app/state/store'
import { __resetConsumers } from '@app/state/events'
import { __resetClock } from '@app/state/displayClock'
import { __resetSaveBinding } from '@app/state/saveBinding'
import { __resetMultiTab } from '@app/state/multiTab'

export function buildCtx(): EngineContext {
  return buildTestContext([])
}

export interface MemoryPort extends StoragePort {
  store: Record<string, string>
}

export function memoryPort(seed: Record<string, string> = {}): MemoryPort {
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

export function resetAll(): void {
  __resetStore()
  __resetConsumers()
  __resetClock()
  __resetSaveBinding()
  __resetMultiTab()
}
