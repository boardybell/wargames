import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION } from '@engine'

describe('foundation smoke', () => {
  it('imports the engine through the @engine alias in the node project', () => {
    expect(ENGINE_VERSION).toBe('0.1.0')
    expect('window' in globalThis).toBe(false)
  })
})
