// Deep clone + deep freeze of CampaignState. All campaign state is JSON-safe
// plain data (no Map, Set, Date, class instances), so a structural recursive
// clone of plain objects and arrays is sufficient, and the deep freeze is the
// hard, under-test guarantee that a branch run cannot mutate the snapshot.
import type { CampaignState } from '../campaign/state'

/** The snapshot handed to runBranch: a frozen CampaignState. The runtime
 *  freeze is the actual guarantee; the type is the ordinary state so
 *  callers read it without ceremony. */
export type FrozenCampaignState = CampaignState

type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [k: string]: Json }

/** Structural recursive clone of JSON-safe data. Returns a fresh object
 *  graph sharing no references with the input. */
export function deepClone<T>(value: T): T {
  return cloneJson(value as unknown as Json) as unknown as T
}

function cloneJson(value: Json): Json {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(cloneJson)
  const out: Record<string, Json> = {}
  for (const key of Object.keys(value)) {
    out[key] = cloneJson((value as Record<string, Json>)[key] as Json)
  }
  return out
}

/** Recursively Object.freeze every object and array in the graph. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
    Object.freeze(value)
  }
  return value
}

/** Clone then freeze: the returned snapshot is an untouched comparand for
 *  the side-effect-free guarantee and a frozen input for branch runs. */
export function snapshot(state: CampaignState): FrozenCampaignState {
  return deepFreeze(deepClone(state))
}
