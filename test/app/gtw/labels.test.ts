import { describe, expect, it } from 'vitest'
import { newGame } from '@app/game/gtw/engine'
import { layoutSiteLabels } from '@app/game/gtw/labels'

const measure = (t: string): number => t.length * 7.2

function run(W: number, H: number, focus: string[] = [], rails: { x: number; y: number; w: number; h: number }[] = []) {
  const s = newGame('US', 1)
  return layoutSiteLabels({ sites: s.sites, player: 'US', W, H, focus, launcherId: focus[0] ?? null, rails, measure })
}

describe('big board label placement', () => {
  it('never overlaps two labels and stays inside the board', () => {
    for (const [W, H] of [
      [1100, 760],
      [726, 726],
      [520, 520],
    ] as const) {
      const ls = run(W, H)
      for (const l of ls) {
        expect(l.left).toBeGreaterThanOrEqual(8)
        expect(l.top).toBeGreaterThanOrEqual(8)
        expect(l.left + l.width).toBeLessThanOrEqual(W - 8)
        expect(l.top + 16).toBeLessThanOrEqual(H - 8)
      }
      for (let i = 0; i < ls.length; i++)
        for (let j = i + 1; j < ls.length; j++) {
          const a = ls[i]!
          const b = ls[j]!
          const apart = a.left + a.width <= b.left || b.left + b.width <= a.left || a.top + 16 <= b.top || b.top + 16 <= a.top
          expect(apart, `${a.id} vs ${b.id} at ${W}x${H}`).toBe(true)
        }
    }
  })

  it('separates both dense clusters on a desktop-sized scope', () => {
    const ids = new Set(run(1100, 760).map((l) => l.id))
    for (const id of ['us-was', 'us-nyc', 'us-phl', 'us-bos', 'su-mos', 'su-len', 'su-koz', 'su-tat']) {
      expect(ids.has(id), id).toBe(true)
    }
  })

  it('shows only the focused labels on a phone-sized scope', () => {
    const ls = run(356, 356, ['us-min', 'su-uzh'])
    expect(ls.map((l) => l.id)).toEqual(['us-min', 'su-uzh'])
    expect(ls[0]!.text).toBe('MINOT AFB 10')
  })

  it('keeps labels out of the side rails', () => {
    const rails = [
      { x: 12, y: 16, w: 160, h: 728 },
      { x: 928, y: 16, w: 160, h: 728 },
    ]
    for (const l of run(1100, 760, [], rails)) {
      const inRail = rails.some((r) => l.left < r.x + r.w && r.x < l.left + l.width && l.top < r.y + r.h && r.y < l.top + 16)
      expect(inRail, l.id).toBe(false)
    }
  })
})
