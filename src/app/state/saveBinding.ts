// Binds the engine storage port to window.localStorage and schedules writes.
// Ordinary changes debounce; irreversible phase transitions and any
// settlement flush immediately; hiding or unloading the page flushes a
// pending write synchronously. Every storage call is fallible by engine-port
// contract, so nothing here throws into gameplay. The load recovery flag is
// exposed for the corrupt-save notice (section 06). Writes pause when another
// tab is detected (multi-tab).
import {
  BACKUP_KEY,
  PRIMARY_KEY,
  loadCampaign,
  persistCampaign,
  type CampaignAction,
  type EngineEvent,
  type RecoveryFlag,
  type StoragePort,
} from '@engine'
import { getContext, getState } from './store'

// Single source of truth: the engine owns the slot keys; the multi-tab
// watcher imports them so a key change cannot silently break the guard.
export const SAVE_KEYS = [PRIMARY_KEY, BACKUP_KEY] as const

const DEBOUNCE_MS = 600

const IMMEDIATE_ACTIONS = new Set<CampaignAction['type']>([
  'START_MISSION',
  'FORFEIT_MISSION',
  'ACKNOWLEDGE_DEBRIEF',
  'NEW_CAMPAIGN',
])

/** A StoragePort over window.localStorage. Calls may throw (Safari private
 *  mode, quota); the engine's persist/load handle that. */
export function createLocalStoragePort(): StoragePort {
  return {
    read: (key) => window.localStorage.getItem(key),
    write: (key, value) => {
      window.localStorage.setItem(key, value)
    },
    remove: (key) => {
      window.localStorage.removeItem(key)
    },
  }
}

let port: StoragePort = createLocalStoragePort()
let recovery: RecoveryFlag = 'clean'
let paused = false
let timer: ReturnType<typeof setTimeout> | null = null
let lastSaveOk = true

/** Whether the most recent write succeeded. The shell can surface a
 *  save-failing warning rather than losing data silently. */
export function getLastSaveOk(): boolean {
  return lastSaveOk
}

export function setPort(next: StoragePort): void {
  port = next
}

export function getRecoveryFlag(): RecoveryFlag {
  return recovery
}

export function pauseWrites(): void {
  paused = true
}

export function isPaused(): boolean {
  return paused
}

function clearTimer(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}

function flushNow(): void {
  clearTimer()
  if (paused) return
  const result = persistCampaign(port, getState(), getContext().missions)
  lastSaveOk = result.ok
}

function scheduleDebounced(): void {
  clearTimer()
  timer = setTimeout(flushNow, DEBOUNCE_MS)
}

// Coalescing variant: schedule a write only if none is pending, so a storm
// of lifecycle wakes (focus/blur/visibility churn on mobile) cannot keep
// pushing the debounce out and starve a pending write indefinitely.
function scheduleDebouncedCoalesce(): void {
  if (timer === null) timer = setTimeout(flushNow, DEBOUNCE_MS)
}

function hasSettlement(emitted: readonly EngineEvent[]): boolean {
  return emitted.some((e) => e.type === 'settlement')
}

/** Classify a dispatched action for debounce vs immediate flush. */
export function notifyAction(
  action: CampaignAction,
  emitted: readonly EngineEvent[],
): void {
  if (IMMEDIATE_ACTIONS.has(action.type) || hasSettlement(emitted)) {
    flushNow()
  } else {
    scheduleDebounced()
  }
}

/** A wake with a settlement in it (a deadline expired) flushes immediately;
 *  any other state-advancing wake debounces. */
export function notifyWake(emitted: readonly EngineEvent[]): void {
  if (hasSettlement(emitted)) flushNow()
  else scheduleDebouncedCoalesce()
}

/** visibilitychange-to-hidden and pagehide call this to persist a pending
 *  debounced write before the page may be frozen or discarded. */
export function flushPending(): void {
  if (timer !== null) flushNow()
}

/** Load the save at boot. Returns the restored state or null for a fresh
 *  start, and records the recovery flag for the notice. */
export function loadAtBoot(): ReturnType<typeof loadCampaign> {
  const result = loadCampaign(port, getContext().missions)
  recovery = result.recovery
  return result
}

/** Test-only. */
export function __resetSaveBinding(): void {
  clearTimer()
  port = createLocalStoragePort()
  recovery = 'clean'
  paused = false
  lastSaveOk = true
}
