// The engine's only randomness source: a JSON-safe value wrapper over
// pure-rand's xoroshiro128plus. RNG is state threaded through reducers;
// a snapshot therefore carries everything a replay needs. pure-rand's
// v8 API is imperative (generators mutate), so every function here
// reconstructs a fresh local generator from a defensive copy of the
// input state, works on that, and encodes a new state. Inputs are never
// written to, so deep-frozen snapshot states are safe regardless of
// library internals.
import {
  xoroshiro128plus,
  xoroshiro128plusFromState,
} from 'pure-rand/generator/xoroshiro128plus'
import { uniformInt } from 'pure-rand/distribution/uniformInt'

/** JSON-safe opaque encoding of the generator state. Treat as opaque
 *  outside this module. */
export interface RngState {
  readonly words: readonly number[]
}

const STATE_WORDS = 4

function materialize(rng: RngState) {
  const words = rng.words
  if (words.length !== STATE_WORDS || words.some((w) => !Number.isFinite(w))) {
    throw new Error(
      `rng: corrupt state (${JSON.stringify(words)}); expected ${STATE_WORDS} finite words`,
    )
  }
  return xoroshiro128plusFromState([...words])
}

function encode(generator: { getState(): readonly number[] }): RngState {
  return { words: [...generator.getState()] }
}

/** Deterministic: same finite seed, same state, same draw sequence
 *  forever. Non-finite seeds fail loudly at the boundary instead of
 *  poisoning a save that only detonates on restore. */
export function rngFromSeed(seed: number): RngState {
  if (!Number.isFinite(seed)) {
    throw new Error(`rng: seed must be finite, got ${seed}`)
  }
  return encode(xoroshiro128plus(seed))
}

/** Uniform integer draw, inclusive of BOTH bounds, delegating to
 *  pure-rand's unbiased uniform distribution (never modulo reduction).
 *  Returns the value plus a NEW RngState; the input is untouched. */
export function nextInt(
  rng: RngState,
  min: number,
  max: number,
): [number, RngState] {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
    throw new Error(`rng: invalid bounds [${min}, ${max}]`)
  }
  const generator = materialize(rng)
  const value = uniformInt(generator, min, max)
  return [value, encode(generator)]
}

/** A 2^64-separated stream per index: clone the current position and
 *  apply streamIndex jumps. Index zero is a plain clone. Rejects
 *  non-integer and negative indexes because silent stream aliasing is
 *  the worst failure mode a branch simulation can have. */
export function forkStream(rng: RngState, streamIndex: number): RngState {
  if (!Number.isInteger(streamIndex) || streamIndex < 0) {
    throw new Error(`rng: stream index must be a non-negative integer, got ${streamIndex}`)
  }
  const generator = materialize(rng)
  for (let i = 0; i < streamIndex; i++) {
    generator.jump()
  }
  return encode(generator)
}
