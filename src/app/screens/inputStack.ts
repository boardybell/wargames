// The live wiring of the precedence stack. A capture-phase key handler at the
// screen root runs resolvePrecedence FIRST, so a higher layer (an open dialog,
// an active diegetic prompt, or a running type-in) swallows a key before it
// can reach the screen's own handlers (MenuRows, etc). Section 05 plugs the
// sound prompt into setPrompt and the greeting type-in into setTypeIn; section
// 06 toggles setDialogOpen. Until then the state is empty and keys pass
// straight through to the screen, preserving menu navigation.
import { resolvePrecedence } from './precedence'
import type { KeyLike } from '../a11y/keyHandler'

let dialogOpen = false
let promptAnswerKeys: readonly string[] | null = null
let promptOnAnswer: ((key: string) => void) | null = null
let typeInRunning = false
let typeInComplete: (() => void) | null = null

export function setDialogOpen(open: boolean): void {
  dialogOpen = open
}

export function setPrompt(
  answerKeys: readonly string[],
  onAnswer: (key: string) => void,
): void {
  promptAnswerKeys = answerKeys
  promptOnAnswer = onAnswer
}

export function clearPrompt(): void {
  promptAnswerKeys = null
  promptOnAnswer = null
}

export function setTypeIn(running: boolean, complete: (() => void) | null): void {
  typeInRunning = running
  typeInComplete = complete
}

function toKeyLike(event: KeyboardEvent): KeyLike {
  return {
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    isComposing: event.isComposing,
    target: event.target,
  }
}

/** Resolve a key against the stack. Returns 'consumed' when a higher layer
 *  handled it (the caller should preventDefault and stop propagation so the
 *  screen never sees it), or 'pass' to let it reach screen handlers. */
export function handleCapturedKey(event: KeyboardEvent): 'consumed' | 'pass' {
  const result = resolvePrecedence(
    { dialogOpen, promptAnswerKeys, typeInRunning },
    toKeyLike(event),
  )
  switch (result.kind) {
    case 'prompt-answer':
      promptOnAnswer?.(result.key)
      return 'consumed'
    case 'complete-type-in':
      typeInComplete?.()
      return 'consumed'
    case 'dialog':
      // A native modal dialog owns the keys; swallow from the screen.
      return 'consumed'
    default:
      // 'screen' and 'ignore' fall through to the screen's own handlers.
      return 'pass'
  }
}

/** Test-only. */
export function __resetInputStack(): void {
  dialogOpen = false
  promptAnswerKeys = null
  promptOnAnswer = null
  typeInRunning = false
  typeInComplete = null
}
