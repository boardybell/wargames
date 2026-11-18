// The shared key-handler guard, expressed as the positive predicate the
// terminal framework and grid consume. It is the inverse of the section-09
// bail predicate in keys.ts; both names exist so callers read naturally
// (shouldHandleKey at a shortcut site, shouldBailFromKeyHandling at a
// precedence gate). KeyLike is re-exported so existing importers are undisturbed.
import { shouldBailFromKeyHandling, type KeyLike } from './keys'

export type { KeyLike }

/** True when a screen/menu shortcut handler should act on this key. */
export function shouldHandleKey(event: KeyLike): boolean {
  return !shouldBailFromKeyHandling(event)
}
