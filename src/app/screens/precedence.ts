// The input precedence stack, resolved as a pure function so every collision
// case is unit-testable. Top wins:
//   1. An open native dialog consumes all keys (the stack yields; showModal
//      traps keys at the browser level).
//   2. An active diegetic prompt consumes only its answer keys; other keys
//      fall through to the layers below.
//   3. A running type-in swallows any non-consumed key and completes.
//   4. Menu and screen shortcuts (gated by the shared key-handler bail).
//   5. Global shortcuts (also screen-gated here).
// The sound prompt (section 05) plugs into layer 2 as a generic prompt; the
// type-in completion API comes from section 03.
import { shouldHandleKey, type KeyLike } from '../a11y/keyHandler'

export interface PrecedenceState {
  readonly dialogOpen: boolean
  /** The prompt's answer keys, or null when no prompt is active. */
  readonly promptAnswerKeys: readonly string[] | null
  readonly typeInRunning: boolean
}

export type PrecedenceResult =
  | { readonly kind: 'dialog' }
  | { readonly kind: 'prompt-answer'; readonly key: string }
  | { readonly kind: 'complete-type-in' }
  | { readonly kind: 'screen' }
  | { readonly kind: 'ignore' }

export function resolvePrecedence(
  state: PrecedenceState,
  event: KeyLike,
): PrecedenceResult {
  if (state.dialogOpen) return { kind: 'dialog' }
  if (state.promptAnswerKeys) {
    if (state.promptAnswerKeys.includes(event.key)) {
      return { kind: 'prompt-answer', key: event.key }
    }
    // A non-answer key during a prompt falls through to the layers below.
  }
  if (state.typeInRunning) return { kind: 'complete-type-in' }
  // Screen and global shortcuts honor the shared bail (editable target, held
  // modifier, IME composition).
  if (!shouldHandleKey(event)) return { kind: 'ignore' }
  return { kind: 'screen' }
}
