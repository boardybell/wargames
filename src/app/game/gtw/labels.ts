// Map label placement for the big board (design: ChatGPT review P1.2).
// Labels live in screen pixels over the scope. Symbols never move; labels are
// placed in priority order around them, avoiding every symbol, every placed
// label and the side rails, and are suppressed (not shrunk) when nothing fits.
// The two dense clusters (US Northeast, Moscow region) get fixed label columns
// with leader lines.
import { BOARD, project } from './worldPath'
import type { Site } from './engine'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface PlacedLabel {
  id: string
  text: string
  side: 'mine' | 'theirs'
  left: number
  top: number
  width: number
  /** Leader polyline points ("x,y x,y ...") or '' when the label is adjacent. */
  leader: string
}

export interface LabelInput {
  sites: readonly Site[]
  player: Site['side']
  /** Rendered board surface size in CSS px. */
  W: number
  H: number
  /** Ids to place first, in order (selected launcher, inspected, track target). */
  focus: readonly string[]
  /** Selected launcher id, to show its missile count. */
  launcherId: string | null
  rails: readonly Rect[]
  measure: (text: string) => number
}

const LABEL_H = 16
const PAD = 6
const EDGE = 8
const GAP = 4
const SYMBOL = 8

/** Cluster columns: seed (projection units) and members top to bottom. */
const CLUSTERS: readonly { seed: [number, number]; ids: readonly string[]; alignRight?: boolean }[] = [
  { seed: [82, 145], ids: ['us-bos', 'us-nyc', 'us-phl', 'us-was'] },
  { seed: [158, 92], ids: ['su-tat', 'su-mos', 'su-koz', 'su-len'] },
  { seed: [121, 94], ids: ['su-ssbn1'], alignRight: true },
]
const CLUSTER_OF = new Map<string, { col: (typeof CLUSTERS)[number]; row: number }>()
for (const col of CLUSTERS) col.ids.forEach((id, row) => CLUSTER_OF.set(id, { col, row }))

export function scopeGeometry(W: number, H: number): { diameter: number; scale: number; ox: number; oy: number } {
  const diameter = Math.min(W, H)
  const scale = diameter / BOARD
  return { diameter, scale, ox: (W - diameter) / 2, oy: (H - diameter) / 2 }
}

function overlaps(a: Rect, b: Rect, gap = GAP): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap
}

export function layoutSiteLabels(inp: LabelInput): PlacedLabel[] {
  const { W, H, sites, player } = inp
  if (W <= 0 || H <= 0) return []
  const g = scopeGeometry(W, H)
  const screen = (x: Site): { x: number; y: number } => {
    const p = project(x.lon, x.lat)
    return { x: g.ox + p.x * g.scale, y: g.oy + p.y * g.scale }
  }
  const built = sites.filter((x) => x.built)
  const byId = new Map(built.map((x) => [x.id, x]))
  const isLauncher = (x: Site): boolean => x.kind !== 'city'
  const dead = (x: Site): boolean => !x.alive || (x.kind === 'city' && x.pop <= 0.05)

  // Which labels are wanted at this scope size, in priority order.
  const ordered: Site[] = []
  const push = (x: Site | undefined): void => {
    if (x && !ordered.includes(x)) ordered.push(x)
  }
  for (const id of inp.focus) push(byId.get(id))
  if (g.diameter >= 480) {
    const byIdSort = (a: Site, b: Site): number => (a.id < b.id ? -1 : 1)
    if (g.diameter >= 600) for (const col of CLUSTERS) for (const id of col.ids) push(byId.get(id))
    built.filter((x) => isLauncher(x) && !dead(x)).sort(byIdSort).forEach(push)
    built.filter((x) => x.capital && !dead(x)).sort(byIdSort).forEach(push)
    if (g.diameter >= 600) {
      built.filter((x) => x.kind === 'city' && x.pop0 >= 2 && !dead(x)).sort(byIdSort).forEach(push)
      built.filter(dead).sort(byIdSort).forEach(push)
    }
  }
  const limit = g.diameter < 480 ? 2 : Infinity

  const occupied: Rect[] = [...inp.rails]
  for (const x of built) {
    const p = screen(x)
    occupied.push({ x: p.x - SYMBOL / 2, y: p.y - SYMBOL / 2, w: SYMBOL, h: SYMBOL })
  }
  const inside = (r: Rect): boolean => r.x >= EDGE && r.y >= EDGE && r.x + r.w <= W - EDGE && r.y + r.h <= H - EDGE
  // A label must not collide with its own symbol either, but may sit next to it.
  const fits = (r: Rect): boolean => inside(r) && !occupied.some((o) => overlaps(r, o))

  const out: PlacedLabel[] = []
  for (const x of ordered) {
    if (out.length >= limit) break
    const text = x.id === inp.launcherId ? `${x.name} ${x.missiles}` : x.name
    const w = Math.ceil(inp.measure(text)) + PAD
    const p = screen(x)
    const cands: { x: number; y: number }[] = []
    const cl = g.diameter >= 600 ? CLUSTER_OF.get(x.id) : undefined
    if (cl) {
      const sx = g.ox + cl.col.seed[0] * g.scale
      const sy = g.oy + cl.col.seed[1] * g.scale + cl.row * 20
      cands.push({ x: cl.col.alignRight ? sx - w : sx, y: sy })
    }
    for (const dy of [0, -20, 20, -40, 40]) {
      cands.push({ x: p.x + 8, y: p.y - 8 + dy })
      cands.push({ x: p.x - w - 8, y: p.y - 8 + dy })
      cands.push({ x: p.x - w / 2, y: p.y - 24 + dy })
      cands.push({ x: p.x - w / 2, y: p.y + 8 + dy })
    }
    const hit = cands.map((c) => ({ x: c.x, y: c.y, w, h: LABEL_H })).find(fits)
    if (!hit) continue
    occupied.push(hit)
    // Leader: symbol -> elbow -> nearest label edge, with a 4px gap.
    const cy = hit.y + LABEL_H / 2
    const toRight = hit.x > p.x
    const ex = toRight ? hit.x - GAP : hit.x + w + GAP
    const far = Math.hypot(ex - p.x, cy - p.y) > 14
    const elbowX = toRight ? Math.max(p.x + 4, ex - 10) : Math.min(p.x - 4, ex + 10)
    out.push({
      id: x.id,
      text,
      side: x.side === player ? 'mine' : 'theirs',
      left: hit.x,
      top: hit.y,
      width: w,
      leader: far ? `${p.x.toFixed(1)},${p.y.toFixed(1)} ${elbowX.toFixed(1)},${cy.toFixed(1)} ${ex.toFixed(1)},${cy.toFixed(1)}` : '',
    })
  }
  return out
}
