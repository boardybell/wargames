// Shared game hooks: scoped shortcuts, sound cues, records, and safe timers.
import { useCallback, useEffect, useRef, useState } from 'react'
import { shouldBailFromKeyHandling } from '../../../a11y/keys'
import { beep, chime, thud, siren } from '../../sound'

// ---------------------------------------------------------------- keys
/**
 * Scoped game shortcuts. Never touches Tab / Shift+Tab, ignores modified keys
 * and editable targets, and lets a focused button own Enter and Space (so
 * activating EXIT never also triggers a game shortcut). Return true from the
 * handler to preventDefault.
 */
export function useGameKeys(handler: (key: string, e: KeyboardEvent) => boolean | void, enabled = true): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Tab') return
      if (shouldBailFromKeyHandling(e)) return
      const t = e.target
      if ((e.key === 'Enter' || e.key === ' ') && t instanceof HTMLElement && t.closest('button, a, [role="gridcell"], summary')) return
      if (t instanceof HTMLElement && t.closest('[role="grid"]') && e.key.startsWith('Arrow')) return
      if (ref.current(e.key, e) === true) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}

// ---------------------------------------------------------------- audio
/**
 * Event cues through the shared sound helpers (respects SOUND OFF and the one
 * AudioContext). Call cues from event handlers or effects keyed on committed
 * events, never from render or state updaters.
 */
export const cue = {
  /** Accepted selection or move. */
  select: (): void => beep(880, 0.04, 'square', 0.06),
  /** Opponent move / neutral tick. */
  tick: (): void => beep(520, 0.05, 'square', 0.05),
  /** Rejected input (wall, illegal). */
  deny: (): void => beep(140, 0.09, 'square', 0.08),
  /** Capture, hit, damage. */
  hit: (): void => {
    beep(110, 0.18, 'triangle', 0.25)
    beep(70, 0.25, 'sine', 0.25)
  },
  /** Card dealt / flipped. */
  card: (): void => beep(1400, 0.02, 'triangle', 0.05),
  /** Completed hand or objective. */
  win: (): void => chime(620),
  lose: (): void => {
    beep(330, 0.14, 'square', 0.1)
    setTimeout(() => beep(220, 0.22, 'square', 0.1), 140)
  },
  draw: (): void => chime(440),
  /** Major threshold only. */
  alarm: (): void => siren(),
  boom: (): void => thud(),
}

// ---------------------------------------------------------------- records
const RECORDS_KEY = 'wg.records.v1'
type RecordStore = Record<string, Record<string, unknown>>

function readStore(): RecordStore {
  try {
    const raw = window.localStorage.getItem(RECORDS_KEY)
    if (!raw) return {}
    const v = JSON.parse(raw) as unknown
    return v && typeof v === 'object' ? (v as RecordStore) : {}
  } catch {
    return {}
  }
}
function writeStore(s: RecordStore): void {
  try {
    window.localStorage.setItem(RECORDS_KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable: records just aren't kept */
  }
}

export interface WLD {
  w: number
  l: number
  d: number
}

/**
 * Versioned per-game records. `get(key, fallback)` reads; `update(key, fn)`
 * writes. Use `recordOnce(sessionId, fn)` to record a finished result exactly
 * once even if the effect re-runs.
 */
export function useGameRecords(game: string) {
  const [store, setStore] = useState<Record<string, unknown>>(() => readStore()[game] ?? {})
  const seen = useRef(new Set<string>())
  const get = useCallback(<T,>(key: string, fallback: T): T => (key in store ? (store[key] as T) : fallback), [store])
  const update = useCallback(
    <T,>(key: string, fn: (prev: T | undefined) => T): void => {
      const all = readStore()
      const mine = { ...(all[game] ?? {}) }
      mine[key] = fn(mine[key] as T | undefined)
      all[game] = mine
      writeStore(all)
      setStore(mine)
    },
    [game],
  )
  const recordOnce = useCallback((sessionId: string, fn: () => void): void => {
    if (seen.current.has(sessionId)) return
    seen.current.add(sessionId)
    fn()
  }, [])
  /** Bump a win/loss/draw tally under key. */
  const tally = useCallback(
    (key: string, outcome: 'win' | 'lose' | 'draw'): void =>
      update<WLD>(key, (p) => {
        const r = p ?? { w: 0, l: 0, d: 0 }
        return { w: r.w + (outcome === 'win' ? 1 : 0), l: r.l + (outcome === 'lose' ? 1 : 0), d: r.d + (outcome === 'draw' ? 1 : 0) }
      }),
    [update],
  )
  return { get, update, recordOnce, tally }
}

export const fmtWLD = (r: WLD | undefined): string => (r ? `${r.w}-${r.l}${r.d ? `-${r.d}` : ''}` : '0-0')

// ---------------------------------------------------------------- timers
/** setTimeout that is cancelled on unmount and on clear() (restart / exit). */
export function useTimers() {
  const ids = useRef(new Set<ReturnType<typeof setTimeout>>())
  useEffect(() => {
    const set = ids.current
    return () => {
      set.forEach(clearTimeout)
      set.clear()
    }
  }, [])
  const later = useCallback((fn: () => void, ms: number): void => {
    const id = setTimeout(() => {
      ids.current.delete(id)
      fn()
    }, ms)
    ids.current.add(id)
  }, [])
  const clear = useCallback((): void => {
    ids.current.forEach(clearTimeout)
    ids.current.clear()
  }, [])
  return { later, clear }
}

// ---------------------------------------------------------------- events
/** Typed report events with monotonically increasing ids. */
export function useEventLog<K extends string = 'info' | 'good' | 'bad' | 'warn'>(max = 200) {
  const [events, setEvents] = useState<{ id: number; text: string; kind?: K }[]>([])
  const next = useRef(1)
  const push = useCallback(
    (...items: { text: string; kind?: K }[]): void => {
      setEvents((prev) => [...prev, ...items.map((it) => ({ ...it, id: next.current++ }))].slice(-max))
    },
    [max],
  )
  const reset = useCallback((): void => setEvents([]), [])
  return { events, push, reset }
}

// ---------------------------------------------------------------- rng
/** Small seeded RNG (mulberry32) for reproducible scenarios and replays. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const newSeed = (): number => Math.floor(Math.random() * 1e9)
