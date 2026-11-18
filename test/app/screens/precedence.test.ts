import { describe, expect, it } from 'vitest'
import {
  resolvePrecedence,
  type PrecedenceState,
} from '@app/screens/precedence'
import type { KeyLike } from '@app/a11y/keyHandler'

const base: PrecedenceState = {
  dialogOpen: false,
  promptAnswerKeys: null,
  typeInRunning: false,
}
const key = (k: string, extra: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  ...extra,
})

describe('input precedence stack (top wins)', () => {
  it('an open dialog consumes every key', () => {
    expect(resolvePrecedence({ ...base, dialogOpen: true }, key('1'))).toEqual({
      kind: 'dialog',
    })
  })

  it('a prompt consumes its answer keys; other keys fall through', () => {
    const state = { ...base, promptAnswerKeys: ['Y', 'N'] }
    expect(resolvePrecedence(state, key('Y'))).toEqual({
      kind: 'prompt-answer',
      key: 'Y',
    })
    expect(resolvePrecedence(state, key('X'))).toEqual({ kind: 'screen' })
  })

  it('Y during the sound prompt answers it and does not skip a running type-in', () => {
    const state = { ...base, promptAnswerKeys: ['Y', 'N'], typeInRunning: true }
    expect(resolvePrecedence(state, key('Y'))).toEqual({
      kind: 'prompt-answer',
      key: 'Y',
    })
  })

  it('pressing 1 during a type-in completes it and is swallowed (no row select)', () => {
    expect(
      resolvePrecedence({ ...base, typeInRunning: true }, key('1')),
    ).toEqual({ kind: 'complete-type-in' })
  })

  it('menu shortcuts are ignored while an editable target is focused', () => {
    const input = document.createElement('input')
    expect(resolvePrecedence(base, key('1', { target: input }))).toEqual({
      kind: 'ignore',
    })
  })

  it('a held modifier bails out of screen shortcuts', () => {
    expect(resolvePrecedence(base, key('1', { ctrlKey: true }))).toEqual({
      kind: 'ignore',
    })
  })

  it('a plain key reaches screen shortcuts', () => {
    expect(resolvePrecedence(base, key('1'))).toEqual({ kind: 'screen' })
  })
})
