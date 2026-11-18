// Deterministic test harness: canonical serialization and hashing for
// run-twice and permutation suites. Test-tree code; the engine itself
// never hashes state.

type Plain = null | boolean | number | string | Plain[] | { [k: string]: Plain }

function fail(path: string, why: string): never {
  throw new Error(`canonical: ${why} at ${path || '<root>'}`)
}

function canonicalize(value: unknown, path: string): Plain {
  if (value === null) return null
  const t = typeof value
  if (t === 'boolean') return value as boolean
  if (t === 'number') {
    const n = value as number
    if (!Number.isFinite(n)) fail(path, `non-finite number ${n}`)
    return Object.is(n, -0) ? 0 : n
  }
  if (t === 'string') return value as string
  if (t === 'undefined') fail(path, 'undefined value')
  if (t === 'function') fail(path, 'function value')
  if (t === 'bigint') fail(path, 'bigint value')
  if (t === 'symbol') fail(path, 'symbol value')
  if (Array.isArray(value)) {
    return value.map((v, i) => canonicalize(v, `${path}[${i}]`))
  }
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) {
    fail(path, `non-plain object (${value?.constructor?.name ?? 'unknown'})`)
  }
  const out: { [k: string]: Plain } = {}
  const keys = Object.keys(value as object).sort()
  for (const k of keys) {
    out[k] = canonicalize((value as Record<string, unknown>)[k], `${path}.${k}`)
  }
  return out
}

/** Deterministic stringify: plain data only, keys recursively sorted,
 *  minus-zero normalized to zero. Throws loudly on NaN, Infinity,
 *  undefined, functions, Map, Set, Date, or any non-plain object. */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value, ''))
}

/** Two FNV-1a passes with distinct offset bases, concatenated to 64 bits
 *  so the permutation suites can compare thousands of states without
 *  birthday collisions. Deterministic; cryptographic strength not needed. */
export function stateHash(value: unknown): string {
  const s = canonicalStringify(value)
  let h1 = 0x811c9dc5
  let h2 = 0xcbf29ce4
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x01000193)
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0')
  )
}

/** Walks a value and throws with a path-bearing message on the first
 *  JSON-unsafe leaf. Shared by the property suites. */
export function assertJsonSafe(value: unknown): void {
  canonicalize(value, '')
}
