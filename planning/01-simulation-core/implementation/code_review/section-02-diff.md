diff --git a/src/engine/rng/index.ts b/src/engine/rng/index.ts
new file mode 100644
index 0000000..6bd03a6
--- /dev/null
+++ b/src/engine/rng/index.ts
@@ -0,0 +1,55 @@
+// The engine's only randomness source: a JSON-safe value wrapper over
+// pure-rand's xoroshiro128plus. RNG is state threaded through reducers;
+// a snapshot therefore carries everything a replay needs. pure-rand's
+// v8 API is imperative (generators mutate), so every function here
+// reconstructs a fresh local generator from the input state, works on
+// that, and encodes a new state. Inputs are never written to, which is
+// what makes deep-frozen snapshot states safe by construction.
+import {
+  xoroshiro128plus,
+  xoroshiro128plusFromState,
+} from 'pure-rand/generator/xoroshiro128plus'
+import { uniformInt } from 'pure-rand/distribution/uniformInt'
+
+/** JSON-safe opaque encoding of the generator state. Treat as opaque
+ *  outside this module. */
+export interface RngState {
+  readonly words: readonly number[]
+}
+
+function materialize(rng: RngState) {
+  return xoroshiro128plusFromState(rng.words)
+}
+
+function encode(generator: { getState(): readonly number[] }): RngState {
+  return { words: [...generator.getState()] }
+}
+
+/** Deterministic: same seed, same state, same draw sequence forever. */
+export function rngFromSeed(seed: number): RngState {
+  return encode(xoroshiro128plus(seed))
+}
+
+/** Uniform integer draw, inclusive of BOTH bounds, delegating to
+ *  pure-rand's unbiased uniform distribution (never modulo reduction).
+ *  Returns the value plus a NEW RngState; the input is untouched. */
+export function nextInt(
+  rng: RngState,
+  min: number,
+  max: number,
+): [number, RngState] {
+  const generator = materialize(rng)
+  const value = uniformInt(generator, min, max)
+  return [value, encode(generator)]
+}
+
+/** A 2^64-separated stream per index: clone the current position and
+ *  apply streamIndex jumps. Index zero is a plain clone. Pure and
+ *  deterministic; the input is untouched. */
+export function forkStream(rng: RngState, streamIndex: number): RngState {
+  const generator = materialize(rng)
+  for (let i = 0; i < streamIndex; i++) {
+    generator.jump()
+  }
+  return encode(generator)
+}
diff --git a/test/engine/rng/rng.test.ts b/test/engine/rng/rng.test.ts
new file mode 100644
index 0000000..586d03f
--- /dev/null
+++ b/test/engine/rng/rng.test.ts
@@ -0,0 +1,121 @@
+import { describe, expect, it } from 'vitest'
+import { forkStream, nextInt, rngFromSeed } from '@engine/rng'
+import type { RngState } from '@engine/rng'
+
+function deepFreeze<T>(value: T): T {
+  if (value && typeof value === 'object') {
+    for (const v of Object.values(value)) deepFreeze(v)
+    Object.freeze(value)
+  }
+  return value
+}
+
+function drawSequence(start: RngState, count: number): number[] {
+  const out: number[] = []
+  let rng = start
+  for (let i = 0; i < count; i++) {
+    const [value, next] = nextInt(rng, 0, 999_999)
+    out.push(value)
+    rng = next
+  }
+  return out
+}
+
+describe('rngFromSeed', () => {
+  it('yields identical draw sequences for identical seeds', () => {
+    expect(drawSequence(rngFromSeed(1984), 32)).toEqual(
+      drawSequence(rngFromSeed(1984), 32),
+    )
+  })
+
+  it('yields different sequences for different seeds', () => {
+    expect(drawSequence(rngFromSeed(1), 16)).not.toEqual(
+      drawSequence(rngFromSeed(2), 16),
+    )
+  })
+
+  it('produces JSON-safe state', () => {
+    const rng = rngFromSeed(7)
+    const roundTripped = JSON.parse(JSON.stringify(rng)) as RngState
+    expect(roundTripped).toEqual(rng)
+  })
+})
+
+describe('nextInt', () => {
+  it('is inclusive of both bounds and never outside the range', () => {
+    let rng = rngFromSeed(3)
+    const seen = new Set<number>()
+    for (let i = 0; i < 400; i++) {
+      const [value, next] = nextInt(rng, 1, 6)
+      expect(value).toBeGreaterThanOrEqual(1)
+      expect(value).toBeLessThanOrEqual(6)
+      expect(Number.isInteger(value)).toBe(true)
+      seen.add(value)
+      rng = next
+    }
+    expect(seen.has(1)).toBe(true)
+    expect(seen.has(6)).toBe(true)
+  })
+
+  it('returns a new state and never mutates the input', () => {
+    const rng = rngFromSeed(11)
+    const before = JSON.parse(JSON.stringify(rng)) as RngState
+    const [, next] = nextInt(rng, 0, 100)
+    expect(next).not.toBe(rng)
+    expect(rng).toEqual(before)
+  })
+
+  it('works on a deep-frozen state in strict mode and returns a fresh object', () => {
+    const rng = deepFreeze(rngFromSeed(13))
+    const run = () => nextInt(rng, 0, 100)
+    expect(run).not.toThrow()
+    const [, next] = run()
+    expect(Object.isFrozen(next)).toBe(false)
+    expect(next).not.toEqual(rng)
+  })
+
+  it('continues the exact sequence after a JSON round trip', () => {
+    const rng = rngFromSeed(21)
+    const full = drawSequence(rng, 20)
+    const prefix = drawSequence(rng, 10)
+    let mid = rng
+    for (let i = 0; i < 10; i++) {
+      const [, next] = nextInt(mid, 0, 999_999)
+      mid = next
+    }
+    const revived = JSON.parse(JSON.stringify(mid)) as RngState
+    const suffix = drawSequence(revived, 10)
+    expect([...prefix, ...suffix]).toEqual(full)
+  })
+})
+
+describe('forkStream', () => {
+  it('is deterministic for equal inputs', () => {
+    const base = rngFromSeed(99)
+    expect(drawSequence(forkStream(base, 2), 16)).toEqual(
+      drawSequence(forkStream(base, 2), 16),
+    )
+  })
+
+  it('never mutates its input', () => {
+    const base = deepFreeze(rngFromSeed(99))
+    const before = JSON.parse(JSON.stringify(base)) as RngState
+    forkStream(base, 3)
+    expect(base).toEqual(before)
+  })
+
+  it('separates streams: distinct indexes do not overlap over a large sample', () => {
+    const base = rngFromSeed(1234)
+    const a = new Set(drawSequence(forkStream(base, 0), 512))
+    const b = drawSequence(forkStream(base, 1), 512)
+    const overlap = b.filter((v) => a.has(v)).length
+    expect(overlap).toBeLessThan(8)
+  })
+
+  it('fork at index zero is a plain clone of the current position', () => {
+    const base = rngFromSeed(55)
+    expect(drawSequence(forkStream(base, 0), 8)).toEqual(
+      drawSequence(base, 8),
+    )
+  })
+})
