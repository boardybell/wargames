import { describe, expect, it } from 'vitest'
import { shouldBailFromKeyHandling, type KeyLike } from '@app/a11y/keys'
import { shouldHandleKey } from '@app/a11y/keyHandler'

function editable(tag: string): HTMLElement {
  return document.createElement(tag)
}

function contentEditableDiv(): HTMLElement {
  const d = document.createElement('div')
  Object.defineProperty(d, 'isContentEditable', { value: true })
  return d
}

const plainTarget = document.createElement('div')

describe('shouldBailFromKeyHandling', () => {
  const bailCases: Array<[string, KeyLike]> = [
    ['input target', { key: 'a', target: editable('input') }],
    ['textarea target', { key: 'a', target: editable('textarea') }],
    ['select target', { key: 'a', target: editable('select') }],
    ['contentEditable target', { key: 'a', target: contentEditableDiv() }],
    ['ctrl held', { key: 'a', ctrlKey: true, target: plainTarget }],
    ['meta held', { key: 'a', metaKey: true, target: plainTarget }],
    ['alt held', { key: 'a', altKey: true, target: plainTarget }],
    ['composing', { key: 'a', isComposing: true, target: plainTarget }],
  ]

  for (const [name, event] of bailCases) {
    it(`bails for ${name}`, () => {
      expect(shouldBailFromKeyHandling(event)).toBe(true)
      expect(shouldHandleKey(event)).toBe(false)
    })
  }

  it('does not bail for a plain key on a non-editable target', () => {
    const event: KeyLike = { key: '1', target: plainTarget }
    expect(shouldBailFromKeyHandling(event)).toBe(false)
    expect(shouldHandleKey(event)).toBe(true)
  })

  it('does not bail when target is null', () => {
    expect(shouldBailFromKeyHandling({ key: 'Enter', target: null })).toBe(false)
  })
})
