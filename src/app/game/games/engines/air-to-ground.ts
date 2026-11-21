// AIR-TO-GROUND ACTIONS rules. Six defended targets, a flight of six aircraft,
// two attack profiles. One function (odds) produces the LOSS / HIT / DAMAGE
// numbers both the display and resolution use. Target order matters: a
// destroyed radar lowers every remaining SAM rating; a surviving command bunker
// raises every remaining AAA rating after sorties 3 and 6. Missions are seeded:
// the seed fixes the defense ratings and every sortie's dice.
import { rng } from '../hooks'

export type Profile = 'HIGH' | 'LOW'
export type TargetKind = 'radar' | 'sam' | 'armor' | 'command' | 'fuel' | 'airfield'

export interface Target {
  readonly id: number
  readonly name: string
  readonly kind: TargetKind
  /** Current ratings (0..RATING_MAX). */
  readonly sam: number
  readonly aaa: number
  /** Ratings at mission start, to show what target order changed. */
  readonly baseSam: number
  readonly baseAaa: number
  readonly toughness: number
  readonly damage: number
  readonly destroyed: boolean
}

export type EndReason = 'all-destroyed' | 'flight-lost'

export interface Mission {
  readonly seed: number
  readonly targets: readonly Target[]
  readonly aircraft: number
  /** Number of the next sortie to fly (1-based). */
  readonly sortie: number
  readonly lost: number
  readonly hits: number
  readonly outcome: 'win' | 'lose' | null
  readonly reason: EndReason | null
}

export type EventKind = 'procedure' | 'success' | 'loss' | 'effect'
export interface SortieEvent {
  readonly kind: EventKind
  readonly text: string
}

export const START_AIRCRAFT = 6
export const RATING_MAX = 95
export const RADAR_SAM_CUT = 10
export const COMMAND_AAA_RISE = 5
export const COMMAND_SORTIES: readonly number[] = [3, 6]

const DEFS: readonly { name: string; kind: TargetKind; sam: number; aaa: number; toughness: number }[] = [
  { name: 'RADAR SITE BRAVO', kind: 'radar', sam: 20, aaa: 55, toughness: 2 },
  { name: 'SAM BATTERY GRID-7', kind: 'sam', sam: 65, aaa: 30, toughness: 2 },
  { name: 'ARMOR COLUMN', kind: 'armor', sam: 25, aaa: 60, toughness: 3 },
  { name: 'COMMAND BUNKER', kind: 'command', sam: 55, aaa: 45, toughness: 3 },
  { name: 'FUEL DEPOT', kind: 'fuel', sam: 35, aaa: 50, toughness: 2 },
  { name: 'AIRFIELD VECTOR-9', kind: 'airfield', sam: 50, aaa: 40, toughness: 3 },
]

export const clampRating = (v: number): number => Math.max(0, Math.min(RATING_MAX, v))

/** One sentence per target class describing its effect on the rest of the mission. */
export function effectText(kind: TargetKind): string | null {
  if (kind === 'radar') return `DESTROY IT: SAM -${RADAR_SAM_CUT} ON EVERY REMAINING TARGET.`
  if (kind === 'command')
    return `WHILE STANDING: AAA +${COMMAND_AAA_RISE} ON EVERY REMAINING TARGET AFTER SORTIES ${COMMAND_SORTIES.join(' AND ')}.`
  return null
}

/**
 * Seeded mission. Seed 0 is the reference mission (unadjusted ratings, used by
 * the review's numbers); other seeds shift each rating by -10..+10 in steps of 5.
 */
export function createMission(seed: number): Mission {
  const r = rng(seed)
  const shift = (): number => (seed === 0 ? 0 : (Math.floor(r() * 5) - 2) * 5)
  const targets = DEFS.map((d, id): Target => {
    const sam = Math.max(5, Math.min(85, d.sam + shift()))
    const aaa = Math.max(5, Math.min(85, d.aaa + shift()))
    return { id, name: d.name, kind: d.kind, sam, aaa, baseSam: sam, baseAaa: aaa, toughness: d.toughness, damage: 0, destroyed: false }
  })
  return { seed, targets, aircraft: START_AIRCRAFT, sortie: 1, lost: 0, hits: 0, outcome: null, reason: null }
}

export interface Odds {
  /** Percent chance the aircraft is shot down. */
  readonly loss: number
  /** Percent chance the ordnance hits (rolled separately from loss). */
  readonly hit: number
  /** Damage on a hit. */
  readonly damage: number
}

/** The single source of truth for display and resolution. */
export function odds(t: Pick<Target, 'sam' | 'aaa'>, profile: Profile): Odds {
  if (profile === 'HIGH') return { loss: clampRating(t.sam + Math.floor(t.aaa / 5)), hit: 55, damage: 1 }
  return { loss: clampRating(t.aaa + Math.floor(t.sam / 5)), hit: 75, damage: 2 }
}

/** The two 1..100 dice for a sortie, fixed by mission seed and sortie number. */
export function sortieRolls(seed: number, sortie: number): { loss: number; hit: number } {
  const r = rng((seed * 7919 + sortie * 104729) >>> 0)
  return { loss: Math.floor(r() * 100) + 1, hit: Math.floor(r() * 100) + 1 }
}

/** True if the command bunker will raise AAA once the given sortie resolves. */
export const commandEscalatesAfter = (sortie: number): boolean => COMMAND_SORTIES.includes(sortie)

export function nextEscalation(m: Mission): number | null {
  const bunker = m.targets.find((t) => t.kind === 'command')
  if (!bunker || bunker.destroyed) return null
  return COMMAND_SORTIES.find((s) => s >= m.sortie) ?? null
}

export interface SortieResult {
  readonly mission: Mission
  readonly events: readonly SortieEvent[]
  readonly lostAircraft: boolean
  readonly hit: boolean
  readonly destroyed: boolean
}

/**
 * Fly one sortie. A roll at or under LOSS downs the aircraft; a roll at or
 * under HIT damages the target. The two rolls are independent: ordnance
 * released before the aircraft is hit still counts.
 */
export function flySortie(m: Mission, targetId: number, profile: Profile, dice = sortieRolls(m.seed, m.sortie)): SortieResult {
  const tgt = m.targets.find((t) => t.id === targetId)
  if (m.outcome || !tgt || tgt.destroyed) return { mission: m, events: [], lostAircraft: false, hit: false, destroyed: false }
  const o = odds(tgt, profile)
  const ev: SortieEvent[] = []
  ev.push({ kind: 'procedure', text: `SORTIE ${m.sortie}: ${profile} PROFILE ON ${tgt.name}. LOSS ${o.loss}% · HIT ${o.hit}%.` })

  const lostAircraft = dice.loss <= o.loss
  ev.push(
    lostAircraft
      ? { kind: 'loss', text: profile === 'HIGH' ? 'SAM INTERCEPT. ONE AIRCRAFT LOST.' : 'AAA HIT. ONE AIRCRAFT LOST.' }
      : { kind: 'procedure', text: 'DEFENSES EVADED. AIRCRAFT RETURNING.' },
  )

  const hit = dice.hit <= o.hit
  let destroyed = false
  let targets = m.targets.map((t) => {
    if (t.id !== tgt.id || !hit) return t
    const damage = Math.min(t.toughness, t.damage + o.damage)
    destroyed = damage >= t.toughness
    return { ...t, damage, destroyed }
  })
  if (hit) {
    ev.push({
      kind: 'success',
      text: `ORDNANCE ON TARGET${lostAircraft ? ' BEFORE THE LOSS' : ''}. ${o.damage} DAMAGE.`,
    })
  } else {
    ev.push({ kind: 'procedure', text: 'ORDNANCE WIDE. NO DAMAGE.' })
  }
  if (destroyed) {
    ev.push({ kind: 'success', text: `${tgt.name} DESTROYED.` })
    if (tgt.kind === 'radar') {
      targets = targets.map((t) => (t.destroyed ? t : { ...t, sam: clampRating(t.sam - RADAR_SAM_CUT) }))
      ev.push({ kind: 'effect', text: `RADAR DOWN. SAM RATINGS -${RADAR_SAM_CUT} ON REMAINING TARGETS.` })
    }
  }

  const bunker = targets.find((t) => t.kind === 'command')
  if (bunker && !bunker.destroyed && commandEscalatesAfter(m.sortie) && targets.some((t) => !t.destroyed)) {
    targets = targets.map((t) => (t.destroyed ? t : { ...t, aaa: clampRating(t.aaa + COMMAND_AAA_RISE) }))
    ev.push({ kind: 'effect', text: `COMMAND BUNKER STANDING. AAA RATINGS +${COMMAND_AAA_RISE} ON REMAINING TARGETS.` })
  }

  const aircraft = m.aircraft - (lostAircraft ? 1 : 0)
  const remaining = targets.filter((t) => !t.destroyed).length
  let outcome: Mission['outcome'] = null
  let reason: EndReason | null = null
  if (remaining === 0) {
    outcome = 'win'
    reason = 'all-destroyed'
  } else if (aircraft <= 0) {
    outcome = 'lose'
    reason = 'flight-lost'
  }
  return {
    mission: {
      ...m,
      targets,
      aircraft,
      sortie: m.sortie + 1,
      lost: m.lost + (lostAircraft ? 1 : 0),
      hits: m.hits + (hit ? 1 : 0),
      outcome,
      reason,
    },
    events: ev,
    lostAircraft,
    hit,
    destroyed,
  }
}

export const destroyedCount = (m: Mission): number => m.targets.filter((t) => t.destroyed).length
