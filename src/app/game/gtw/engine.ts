// GLOBAL THERMONUCLEAR WAR: an open-ended Cold War command game.
//
// The game runs quarter by quarter from 1983 for as long as the player lasts.
// Each quarter has a STRATEGY phase (spend the defense budget, read the news,
// watch world tension) and may erupt into a CRISIS: a real-time episode on the
// big board where radar tracks appear and the player decides what is real and
// what to do about it. Most alarms are WOPR's simulations bleeding onto the
// live display; at high tension the other side really does probe; and any
// warhead the player fires invites an answer that can spiral.
//
// The game ends only when the player loses: the capital is destroyed
// (NATIONAL COMMAND AUTHORITY LOST), the population falls below 40%, or enough
// warheads go off worldwide to bring nuclear winter. If the other side
// collapses first the war still ends, and WOPR still scores it WINNER: NONE.
//
// Pure TypeScript with a seeded RNG so it is deterministic and testable; the
// UI mutates one state object through these functions and saves it as JSON.

export type Side = 'US' | 'SU'
export type SiteKind = 'city' | 'silo' | 'sub'
export type Phase = 'strategy' | 'crisis' | 'over'
export type CrisisKind = 'ghost' | 'probe' | 'strike' | 'player'

export interface Site {
  id: string
  name: string
  side: Side
  kind: SiteKind
  lon: number
  lat: number
  /** Cities: living population in millions, and the pre-war figure. */
  pop: number
  pop0: number
  /** Silos and submarines: missiles ready to launch. */
  missiles: number
  alive: boolean
  capital: boolean
  /** A build slot not yet constructed (silo or submarine patrol area). */
  built: boolean
}

export type Verify = 'none' | 'pending' | 'ghost' | 'real'

export interface Track {
  id: number
  side: Side
  fromId: string
  targetId: string
  launchT: number
  flight: number
  real: boolean
  wave: number
  verify: Verify
  verifyAt: number
  abmTried: boolean
  done: boolean
}

export interface Blast {
  lon: number
  lat: number
  t: number
  air: boolean
}

export interface LogLine {
  t: string
  crit?: boolean
}

export interface Crisis {
  kind: CrisisKind
  /** Ghost waves still to appear: game minute and size. */
  waves: { at: number; count: number }[]
  /** Warheads the other side intends to fire in answer. */
  owed: number
  mode: 'counterforce' | 'countervalue'
  allOut: boolean
  playerFired: boolean
  aiFired: boolean
  lastLaunchT: number
  aiNextFire: number
  detonations: number
}

export interface GameOver {
  kind: 'capital' | 'population' | 'winter' | 'collapse'
  title: string
  detail: string
}

export interface GState {
  v: 1
  seed: number
  player: Side
  enemy: Side
  year: number
  quarter: number
  turn: number
  phase: Phase
  /** Crisis clock in game minutes. */
  t: number
  tension: number
  defcon: number
  budget: number
  sites: Site[]
  tracks: Track[]
  blasts: Blast[]
  abm: Record<Side, number>
  sats: number
  civil: Record<Side, number>
  crisis: Crisis | null
  nextTrackId: number
  detonations: number
  log: LogLine[]
  news: string[]
  over: GameOver | null
  stats: { crisesSurvived: number; alarmsHeld: number; warheadsFired: number }
}

// ---------------------------------------------------------------- constants

export const ICBM_FLIGHT = 30 // game minutes
export const SLBM_FLIGHT = 14
export const VERIFY_TIME = 5
export const INTERCEPT_RANGE = 10 // minutes before impact an ABM can engage
export const PLAYER_ABM_HIT = 0.6
export const AI_ABM_HIT = 0.55
export const WINTER_THRESHOLD = 60
export const POP_LOSS_LIMIT = 0.4
export const QUIET_TO_END = 8
export const BUDGET_CAP = 40

export interface BuyItem {
  id: 'icbm' | 'ssbn' | 'abm' | 'sat' | 'civil' | 'diplomacy'
  label: string
  cost: number
  note: string
}

export const BUY_ITEMS: readonly BuyItem[] = [
  { id: 'icbm', label: '+5 ICBMS', cost: 3, note: 'Rebuilds a lost silo first. Raises tension.' },
  { id: 'ssbn', label: 'NEW SSBN PATROL', cost: 7, note: '16 missiles at sea, hard to kill. Raises tension.' },
  { id: 'abm', label: '+3 INTERCEPTORS', cost: 2, note: 'Shoot down incoming warheads late in flight.' },
  { id: 'sat', label: '+2 SATELLITE PASSES', cost: 2, note: 'Each pass can VERIFY a radar track.' },
  { id: 'civil', label: 'CIVIL DEFENSE', cost: 4, note: 'Shelters: fewer casualties per hit (max 50%).' },
  { id: 'diplomacy', label: 'DIPLOMACY', cost: 3, note: 'Talks in Geneva. Lowers tension.' },
]

// ---------------------------------------------------------------- the map

interface SiteDef {
  id: string
  name: string
  kind: SiteKind
  lon: number
  lat: number
  pop?: number
  missiles?: number
  capital?: boolean
  built?: boolean
}

const US_SITES: readonly SiteDef[] = [
  { id: 'us-was', name: 'WASHINGTON', kind: 'city', lon: -77, lat: 38.9, pop: 3.4, capital: true },
  { id: 'us-nyc', name: 'NEW YORK', kind: 'city', lon: -74, lat: 40.7, pop: 16 },
  { id: 'us-la', name: 'LOS ANGELES', kind: 'city', lon: -118.2, lat: 34, pop: 11 },
  { id: 'us-chi', name: 'CHICAGO', kind: 'city', lon: -87.6, lat: 41.9, pop: 7 },
  { id: 'us-phl', name: 'PHILADELPHIA', kind: 'city', lon: -75.2, lat: 40, pop: 4.7 },
  { id: 'us-sf', name: 'SAN FRANCISCO', kind: 'city', lon: -122.4, lat: 37.8, pop: 5 },
  { id: 'us-det', name: 'DETROIT', kind: 'city', lon: -83, lat: 42.3, pop: 4.4 },
  { id: 'us-bos', name: 'BOSTON', kind: 'city', lon: -71, lat: 42.4, pop: 3.7 },
  { id: 'us-hou', name: 'HOUSTON', kind: 'city', lon: -95.4, lat: 29.8, pop: 3 },
  { id: 'us-atl', name: 'ATLANTA', kind: 'city', lon: -84.4, lat: 33.7, pop: 2.1 },
  { id: 'us-sea', name: 'SEATTLE', kind: 'city', lon: -122.3, lat: 47.6, pop: 2 },
  { id: 'us-den', name: 'DENVER', kind: 'city', lon: -105, lat: 39.7, pop: 1.6 },
  { id: 'us-min', name: 'MINOT AFB', kind: 'silo', lon: -101.3, lat: 48.4, missiles: 10 },
  { id: 'us-mal', name: 'MALMSTROM AFB', kind: 'silo', lon: -111.2, lat: 47.5, missiles: 10 },
  { id: 'us-war', name: 'F.E. WARREN AFB', kind: 'silo', lon: -104.9, lat: 41.1, missiles: 10 },
  { id: 'us-whi', name: 'WHITEMAN AFB', kind: 'silo', lon: -93.5, lat: 38.7, missiles: 10 },
  { id: 'us-gfk', name: 'GRAND FORKS AFB', kind: 'silo', lon: -97.4, lat: 47.9, missiles: 0, built: false },
  { id: 'us-ell', name: 'ELLSWORTH AFB', kind: 'silo', lon: -103.1, lat: 44.1, missiles: 0, built: false },
  { id: 'us-ssbn1', name: 'SSBN ATLANTIC', kind: 'sub', lon: -50, lat: 36, missiles: 16 },
  { id: 'us-ssbn2', name: 'SSBN PACIFIC', kind: 'sub', lon: -155, lat: 42, missiles: 16 },
  { id: 'us-ssbn3', name: 'SSBN NORWEGIAN SEA', kind: 'sub', lon: 2, lat: 68, missiles: 0, built: false },
  { id: 'us-ssbn4', name: 'SSBN ARABIAN SEA', kind: 'sub', lon: 63, lat: 15, missiles: 0, built: false },
]

const SU_SITES: readonly SiteDef[] = [
  { id: 'su-mos', name: 'MOSCOW', kind: 'city', lon: 37.6, lat: 55.75, pop: 8.5, capital: true },
  { id: 'su-len', name: 'LENINGRAD', kind: 'city', lon: 30.3, lat: 59.9, pop: 4.8 },
  { id: 'su-kie', name: 'KIEV', kind: 'city', lon: 30.5, lat: 50.45, pop: 2.4 },
  { id: 'su-tas', name: 'TASHKENT', kind: 'city', lon: 69.2, lat: 41.3, pop: 2 },
  { id: 'su-bak', name: 'BAKU', kind: 'city', lon: 49.9, lat: 40.4, pop: 1.7 },
  { id: 'su-kha', name: 'KHARKOV', kind: 'city', lon: 36.2, lat: 50, pop: 1.5 },
  { id: 'su-msk', name: 'MINSK', kind: 'city', lon: 27.6, lat: 53.9, pop: 1.5 },
  { id: 'su-gor', name: 'GORKY', kind: 'city', lon: 44, lat: 56.3, pop: 1.4 },
  { id: 'su-nov', name: 'NOVOSIBIRSK', kind: 'city', lon: 82.9, lat: 55, pop: 1.4 },
  { id: 'su-sve', name: 'SVERDLOVSK', kind: 'city', lon: 60.6, lat: 56.8, pop: 1.3 },
  { id: 'su-ode', name: 'ODESSA', kind: 'city', lon: 30.7, lat: 46.5, pop: 1.1 },
  { id: 'su-vla', name: 'VLADIVOSTOK', kind: 'city', lon: 131.9, lat: 43.1, pop: 0.6 },
  { id: 'su-koz', name: 'KOZELSK', kind: 'silo', lon: 35.8, lat: 54, missiles: 10 },
  { id: 'su-tat', name: 'TATISHCHEVO', kind: 'silo', lon: 45.6, lat: 51.7, missiles: 10 },
  { id: 'su-dom', name: 'DOMBAROVSKY', kind: 'silo', lon: 59.8, lat: 50.8, missiles: 10 },
  { id: 'su-uzh', name: 'UZHUR', kind: 'silo', lon: 89.8, lat: 55.3, missiles: 10 },
  { id: 'su-ale', name: 'ALEYSK', kind: 'silo', lon: 82.3, lat: 52.5, missiles: 0, built: false },
  { id: 'su-kar', name: 'KARTALY', kind: 'silo', lon: 61.2, lat: 53.1, missiles: 0, built: false },
  { id: 'su-ssbn1', name: 'SSBN BARENTS SEA', kind: 'sub', lon: 40, lat: 72, missiles: 16 },
  { id: 'su-ssbn2', name: 'SSBN SEA OF OKHOTSK', kind: 'sub', lon: 150, lat: 52, missiles: 16 },
  { id: 'su-ssbn3', name: 'SSBN NORTH PACIFIC', kind: 'sub', lon: -140, lat: 30, missiles: 0, built: false },
  { id: 'su-ssbn4', name: 'SSBN NORTH ATLANTIC', kind: 'sub', lon: -40, lat: 50, missiles: 0, built: false },
]

function makeSites(): Site[] {
  const mk = (side: Side, d: SiteDef): Site => ({
    id: d.id,
    name: d.name,
    side,
    kind: d.kind,
    lon: d.lon,
    lat: d.lat,
    pop: d.pop ?? 0,
    pop0: d.pop ?? 0,
    missiles: d.missiles ?? 0,
    alive: d.built !== false,
    capital: d.capital ?? false,
    built: d.built !== false,
  })
  return [...US_SITES.map((d) => mk('US', d)), ...SU_SITES.map((d) => mk('SU', d))]
}

// ---------------------------------------------------------------- rng

/** mulberry32 over the state's seed, so a saved game resumes the same stream. */
export function rand(s: GState): number {
  s.seed = (s.seed + 0x6d2b79f5) | 0
  let t = s.seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
function pick<T>(s: GState, xs: readonly T[]): T {
  return xs[Math.floor(rand(s) * xs.length)]!
}
function ri(s: GState, lo: number, hi: number): number {
  return lo + Math.floor(rand(s) * (hi - lo + 1))
}

// ---------------------------------------------------------------- queries

export const sideName = (s: Side): string => (s === 'US' ? 'UNITED STATES' : 'SOVIET UNION')
export const adjective = (s: Side): string => (s === 'US' ? 'U.S.' : 'SOVIET')

export function site(s: GState, id: string): Site {
  const x = s.sites.find((q) => q.id === id)
  if (!x) throw new Error(`gtw: unknown site ${id}`)
  return x
}
export function popOf(s: GState, side: Side): { now: number; start: number } {
  let now = 0
  let start = 0
  for (const x of s.sites) {
    if (x.side !== side || x.kind !== 'city') continue
    now += x.pop
    start += x.pop0
  }
  return { now, start }
}
export function popFrac(s: GState, side: Side): number {
  const p = popOf(s, side)
  return p.start ? p.now / p.start : 0
}
export function arsenal(s: GState, side: Side): { icbm: number; slbm: number } {
  let icbm = 0
  let slbm = 0
  for (const x of s.sites) {
    if (x.side !== side || !x.alive) continue
    if (x.kind === 'silo') icbm += x.missiles
    if (x.kind === 'sub') slbm += x.missiles
  }
  return { icbm, slbm }
}
export function launchers(s: GState, side: Side): Site[] {
  return s.sites.filter((x) => x.side === side && x.alive && x.kind !== 'city' && x.missiles > 0)
}
export function liveTracks(s: GState): Track[] {
  return s.tracks.filter((k) => !k.done)
}
export function inbound(s: GState, targetId: string): number {
  return s.tracks.filter((k) => !k.done && k.real && k.targetId === targetId).length
}
export function dateLabel(s: GState): string {
  return `${s.year} Q${s.quarter}`
}
export function defconFor(tension: number): number {
  if (tension < 20) return 5
  if (tension < 45) return 4
  if (tension < 70) return 3
  if (tension < 90) return 2
  return 1
}

function log(s: GState, t: string, crit = false): void {
  s.log.push({ t, crit })
  if (s.log.length > 60) s.log.splice(0, s.log.length - 60)
}
function clampTension(s: GState): void {
  s.tension = Math.max(0, Math.min(100, s.tension))
}

// ---------------------------------------------------------------- setup

export function newGame(player: Side, seed = Date.now() | 0): GState {
  const s: GState = {
    v: 1,
    seed,
    player,
    enemy: player === 'US' ? 'SU' : 'US',
    year: 1983,
    quarter: 3,
    turn: 1,
    phase: 'strategy',
    t: 0,
    tension: 25,
    defcon: 4,
    budget: 8,
    sites: makeSites(),
    tracks: [],
    blasts: [],
    abm: { US: 4, SU: 4 },
    sats: 3,
    civil: { US: 0, SU: 0 },
    crisis: null,
    nextTrackId: 1,
    detonations: 0,
    log: [],
    news: [],
    over: null,
    stats: { crisesSurvived: 0, alarmsHeld: 0, warheadsFired: 0 },
  }
  s.defcon = defconFor(s.tension)
  log(s, `${sideName(player)} STRATEGIC COMMAND. ${dateLabel(s)}.`)
  log(s, 'ALLOCATE THE DEFENSE BUDGET, THEN END THE QUARTER.')
  s.news.push('WOPR ONLINE AT NORAD. ALL SCENARIOS LOADED.')
  return s
}

// ---------------------------------------------------------------- strategy

export function buy(s: GState, id: BuyItem['id']): string | null {
  if (s.phase !== 'strategy') return 'BUDGET CAN ONLY BE SPENT BETWEEN CRISES.'
  const item = BUY_ITEMS.find((b) => b.id === id)
  if (!item) return 'UNKNOWN ITEM.'
  if (s.budget < item.cost) return 'INSUFFICIENT FUNDS.'
  const me = s.player
  switch (id) {
    case 'icbm': {
      const silos = s.sites.filter((x) => x.side === me && x.kind === 'silo')
      const target =
        silos.find((x) => x.built && !x.alive) ??
        silos.find((x) => !x.built) ??
        silos.filter((x) => x.alive).sort((a, b) => a.missiles - b.missiles)[0]
      if (!target) return 'NO SILO AVAILABLE.'
      target.built = true
      target.alive = true
      target.missiles += 5
      s.tension += 4
      log(s, `+5 ICBMS AT ${target.name}.`)
      break
    }
    case 'ssbn': {
      const slot = s.sites.find((x) => x.side === me && x.kind === 'sub' && (!x.built || !x.alive))
      if (!slot) return 'ALL PATROL AREAS ARE COVERED.'
      slot.built = true
      slot.alive = true
      slot.missiles = 16
      s.tension += 6
      log(s, `${slot.name} ON STATION. 16 SLBMS.`)
      break
    }
    case 'abm':
      s.abm[me] += 3
      log(s, `+3 INTERCEPTORS. ${s.abm[me]} READY.`)
      break
    case 'sat':
      s.sats += 2
      log(s, `+2 SATELLITE PASSES. ${s.sats} AVAILABLE.`)
      break
    case 'civil':
      if (s.civil[me] >= 0.5) return 'CIVIL DEFENSE IS AT MAXIMUM.'
      s.civil[me] = Math.min(0.5, s.civil[me] + 0.1)
      log(s, `CIVIL DEFENSE ${Math.round(s.civil[me] * 100)}%.`)
      break
    case 'diplomacy': {
      const d = ri(s, 8, 16)
      s.tension -= d
      log(s, `TALKS IN GENEVA. TENSION -${d}.`)
      break
    }
  }
  s.budget -= item.cost
  clampTension(s)
  s.defcon = defconFor(s.tension)
  return null
}

const EVENTS: readonly { text: string; d: number }[] = [
  { text: 'SOVIET NAVAL EXERCISE IN THE BARENTS SEA.', d: 6 },
  { text: 'NATO EXERCISE ABLE ARCHER BEGINS IN WESTERN EUROPE.', d: 10 },
  { text: 'ARMS CONTROL TALKS RESUME IN GENEVA.', d: -8 },
  { text: 'GRAIN DEAL SIGNED. TRADE DELEGATIONS EXCHANGED.', d: -6 },
  { text: 'SPY SCANDAL: DIPLOMATS EXPELLED FROM BOTH CAPITALS.', d: 7 },
  { text: 'AIRLINER STRAYS INTO RESTRICTED AIRSPACE. SHOT DOWN.', d: 12 },
  { text: 'HOTLINE TEST SUCCESSFUL. LEADERS EXCHANGE MESSAGES.', d: -5 },
  { text: 'PROXY WAR ESCALATES IN THE THIRD WORLD.', d: 8 },
  { text: 'EARLY-WARNING SATELLITE MISREADS SUNLIGHT ON CLOUDS.', d: 5 },
  { text: 'PEACE MARCH OF ONE MILLION IN CENTRAL PARK.', d: -4 },
  { text: 'NEW INTERMEDIATE-RANGE MISSILES DEPLOYED IN EUROPE.', d: 9 },
  { text: 'SUMMIT ANNOUNCED. LEADERS TO MEET IN REYKJAVIK.', d: -10 },
  { text: 'SUBMARINE COLLISION REPORTED UNDER THE ARCTIC ICE.', d: 6 },
  { text: 'NUCLEAR TEST BAN TALKS STALL.', d: 4 },
  { text: 'JOINT SPACE MISSION PROPOSED.', d: -5 },
  { text: 'TROOP BUILD-UP REPORTED ALONG THE INNER GERMAN BORDER.', d: 8 },
  { text: 'WOPR FLAGS A COMPUTER INTRUSION AT NORAD. SOURCE UNKNOWN.', d: 5 },
  { text: 'A QUIET QUARTER. NOTHING TO REPORT.', d: -2 },
]

/** The other side's quarterly decisions: an arms race that follows tension. */
function aiStrategy(s: GState): void {
  const ai = s.enemy
  let money = Math.round(8 * popFrac(s, ai))
  const theirs = arsenal(s, ai)
  const mine = arsenal(s, s.player)
  while (money > 0) {
    const r = rand(s)
    if (s.tension < 35 && r < 0.4 && money >= 3) {
      s.tension -= 4
      money -= 3
    } else if (theirs.icbm + theirs.slbm < (mine.icbm + mine.slbm) * 1.1 && money >= 3) {
      const silo =
        s.sites.find((x) => x.side === ai && x.kind === 'silo' && (!x.built || !x.alive)) ??
        s.sites.filter((x) => x.side === ai && x.kind === 'silo' && x.alive).sort((a, b) => a.missiles - b.missiles)[0]
      if (silo) {
        silo.built = true
        silo.alive = true
        silo.missiles += 5
        theirs.icbm += 5
        s.tension += 2
      }
      money -= 3
    } else if (money >= 2) {
      s.abm[ai] += 2
      money -= 2
    } else {
      money = 0
    }
  }
}

/** Probability that a quarter turns into a crisis, and which kind. */
function rollCrisis(s: GState): CrisisKind | null {
  const p = 0.2 + s.tension / 140
  if (rand(s) > p) return null
  const ai = arsenal(s, s.enemy)
  const me = arsenal(s, s.player)
  if (s.tension >= 92 && ai.icbm + ai.slbm > (me.icbm + me.slbm) * 1.25 && rand(s) < 0.35) {
    return 'strike'
  }
  if (s.tension > 60 && rand(s) < (s.tension - 60) / 70) return 'probe'
  return 'ghost'
}

export function endQuarter(s: GState): void {
  if (s.phase !== 'strategy') return
  aiStrategy(s)
  const ev = pick(s, EVENTS)
  s.tension += ev.d + ri(s, -3, 3)
  clampTension(s)
  s.news.push(`${dateLabel(s)}: ${ev.text}`)
  if (s.news.length > 30) s.news.splice(0, s.news.length - 30)

  const kind = rollCrisis(s)
  if (kind) {
    startCrisis(s, kind)
    return
  }
  advanceQuarter(s)
  log(s, `${dateLabel(s)}. NO CRISIS THIS QUARTER.`)
}

function advanceQuarter(s: GState): void {
  s.quarter += 1
  if (s.quarter > 4) {
    s.quarter = 1
    s.year += 1
  }
  s.turn += 1
  // Peacetime slowly lowers tension; the budget follows the surviving economy.
  s.tension -= 2
  clampTension(s)
  s.defcon = defconFor(s.tension)
  s.budget = Math.min(BUDGET_CAP, s.budget + Math.max(2, Math.round(8 * popFrac(s, s.player))))
  // Cities slowly recover a little of what was lost.
  for (const c of s.sites) {
    if (c.kind === 'city' && c.pop > 0 && c.pop < c.pop0) c.pop = Math.min(c.pop0, c.pop + c.pop0 * 0.01)
  }
}

// ---------------------------------------------------------------- crisis

export function startCrisis(s: GState, kind: CrisisKind): void {
  s.phase = 'crisis'
  s.t = 0
  s.tracks = []
  s.blasts = []
  const c: Crisis = {
    kind,
    waves: [],
    owed: 0,
    mode: 'counterforce',
    allOut: false,
    playerFired: false,
    aiFired: false,
    lastLaunchT: 0,
    aiNextFire: 2,
    detonations: 0,
  }
  s.crisis = c
  if (kind === 'ghost') {
    const n = s.tension > 50 ? 3 : 2
    const sizes = [ri(s, 1, 2), ri(s, 3, 6), ri(s, 8, 16)]
    for (let i = 0; i < n; i++) c.waves.push({ at: 2 + i * ri(s, 9, 14), count: sizes[i]! })
    s.defcon = Math.min(s.defcon, 3)
    log(s, 'NORAD ALERT. EARLY-WARNING RADAR REPORTS ACTIVITY.', true)
  } else if (kind === 'probe') {
    c.owed = ri(s, 1, 3)
    c.aiNextFire = 1
    s.defcon = 2
    log(s, `${adjective(s.enemy)} FORCES AT HIGH ALERT. LAUNCH ACTIVITY POSSIBLE.`, true)
  } else if (kind === 'strike') {
    c.owed = 999
    c.allOut = true
    c.aiNextFire = 1
    s.defcon = 1
    log(s, 'MASSIVE LAUNCH PREPARATIONS DETECTED.', true)
  } else {
    s.defcon = 2
    log(s, 'LAUNCH ORDER ISSUED BY NATIONAL COMMAND.', true)
  }
}

function addTrack(s: GState, side: Side, fromId: string, targetId: string, real: boolean, wave = 0): Track {
  const from = site(s, fromId)
  const k: Track = {
    id: s.nextTrackId++,
    side,
    fromId,
    targetId,
    launchT: s.t,
    flight: (from.kind === 'sub' ? SLBM_FLIGHT : ICBM_FLIGHT) + (rand(s) * 2 - 1),
    real,
    wave,
    verify: 'none',
    verifyAt: 0,
    abmTried: false,
    done: false,
  }
  s.tracks.push(k)
  return k
}

export function eta(s: GState, k: Track): number {
  return k.launchT + k.flight - s.t
}

/** Player fires one warhead from a launcher at an enemy site. Starts a crisis
 *  when fired between crises (a first strike). */
export function fire(s: GState, launcherId: string, targetId: string): string | null {
  if (s.phase === 'over') return 'THE GAME IS OVER.'
  const l = s.sites.find((x) => x.id === launcherId)
  const tg = s.sites.find((x) => x.id === targetId)
  if (!l || l.side !== s.player || !l.alive || l.kind === 'city') return 'SELECT ONE OF YOUR SILOS OR SUBMARINES.'
  if (l.missiles <= 0) return `${l.name} HAS NO MISSILES LEFT.`
  if (!tg || tg.side !== s.enemy || !tg.alive || !tg.built) return 'SELECT A TARGET IN ENEMY TERRITORY.'
  if (tg.kind === 'sub') return 'SUBMARINES AT SEA CANNOT BE TARGETED.'
  if (s.phase === 'strategy') startCrisis(s, 'player')
  const c = s.crisis!
  if (!c.playerFired) {
    // Once a real launch happens, any simulated tracks stop mattering.
    for (const k of s.tracks) if (!k.real && !k.done) k.done = true
    c.waves = []
    if (c.kind === 'ghost') log(s, 'THOSE TRACKS WERE A SIMULATION. THIS LAUNCH IS REAL.', true)
  }
  c.playerFired = true
  l.missiles -= 1
  addTrack(s, s.player, l.id, tg.id, true)
  c.lastLaunchT = s.t
  s.stats.warheadsFired += 1
  s.defcon = 1
  s.tension += 3
  clampTension(s)
  // The other side sees the launch and owes an answer.
  const esc = 1 + s.tension / 100
  if (tg.kind === 'city') {
    c.owed += 2 * esc
    c.mode = 'countervalue'
    if (tg.capital) {
      c.allOut = true
      c.owed = 999
    }
  } else {
    c.owed += esc
  }
  c.aiNextFire = Math.min(c.aiNextFire, s.t + 2)
  log(s, `LAUNCH: ${l.name} -> ${tg.name}. IMPACT IN ${Math.round(eta(s, s.tracks[s.tracks.length - 1]!))} MIN.`, true)
  return null
}

/** Launch everything the player has left. Silos and military first. */
export function fullResponse(s: GState): number {
  if (s.phase === 'over') return 0
  const targets = s.sites
    .filter((x) => x.side === s.enemy && x.alive && x.built && x.kind !== 'sub')
    .sort((a, b) => (a.kind === b.kind ? b.pop - a.pop : a.kind === 'silo' ? -1 : 1))
  let n = 0
  let ti = 0
  for (const l of launchers(s, s.player)) {
    while (l.missiles > 0 && targets.length) {
      const tg = targets[ti % targets.length]!
      if (fire(s, l.id, tg.id)) break
      ti++
      n++
    }
  }
  if (n) log(s, `FULL RESPONSE: ${n} WARHEADS AWAY.`, true)
  return n
}

export function verify(s: GState, trackId: number): string | null {
  const k = s.tracks.find((q) => q.id === trackId)
  if (!k || k.done) return 'NO SUCH TRACK.'
  if (k.side === s.player) return 'THAT IS OUR OWN LAUNCH.'
  if (k.verify !== 'none') return 'ALREADY VERIFYING.'
  if (s.sats <= 0) return 'NO SATELLITE PASSES LEFT.'
  s.sats -= 1
  for (const q of s.tracks) {
    if (!q.done && q.side === k.side && q.wave === k.wave && q.real === k.real && q.verify === 'none') {
      q.verify = 'pending'
      q.verifyAt = s.t + VERIFY_TIME
    }
  }
  log(s, `SATELLITE PASS REQUESTED. RESULT IN ${VERIFY_TIME} MIN.`)
  return null
}

export function intercept(s: GState, trackId: number): string | null {
  const k = s.tracks.find((q) => q.id === trackId)
  if (!k || k.done) return 'NO SUCH TRACK.'
  if (k.side === s.player) return 'THAT IS OUR OWN LAUNCH.'
  if (k.abmTried) return 'ALREADY ENGAGED.'
  if (s.abm[s.player] <= 0) return 'NO INTERCEPTORS LEFT.'
  if (eta(s, k) > INTERCEPT_RANGE) return `OUT OF RANGE. ENGAGE INSIDE ${INTERCEPT_RANGE} MIN.`
  s.abm[s.player] -= 1
  k.abmTried = true
  const tg = site(s, k.targetId)
  if (!k.real) {
    log(s, 'INTERCEPTOR FOUND NOTHING THERE.', false)
    return null
  }
  if (rand(s) < PLAYER_ABM_HIT) {
    k.done = true
    const p = posAt(s, k)
    s.blasts.push({ lon: p.lon, lat: p.lat, t: s.t, air: true })
    log(s, `INTERCEPT. WARHEAD ON ${tg.name} DESTROYED.`)
  } else {
    log(s, `INTERCEPTOR MISSED. ${tg.name} STILL TARGETED.`, true)
  }
  return null
}

/** Point a fraction f of the way along the great circle from a to b. */
export function greatCircle(
  a: { lon: number; lat: number },
  b: { lon: number; lat: number },
  f: number,
): { lon: number; lat: number } {
  const r = Math.PI / 180
  const v = (p: { lon: number; lat: number }): [number, number, number] => [
    Math.cos(p.lat * r) * Math.cos(p.lon * r),
    Math.cos(p.lat * r) * Math.sin(p.lon * r),
    Math.sin(p.lat * r),
  ]
  const p = v(a)
  const q = v(b)
  const dot = Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]))
  const w = Math.acos(dot)
  if (w < 1e-6) return { lon: a.lon, lat: a.lat }
  const k1 = Math.sin((1 - f) * w) / Math.sin(w)
  const k2 = Math.sin(f * w) / Math.sin(w)
  const x = k1 * p[0] + k2 * q[0]
  const y = k1 * p[1] + k2 * q[1]
  const z = k1 * p[2] + k2 * q[2]
  return { lon: Math.atan2(y, x) / r, lat: Math.atan2(z, Math.hypot(x, y)) / r }
}

/** Where a missile is now, along its great-circle route. */
export function posAt(s: GState, k: Track): { lon: number; lat: number; f: number } {
  const f = Math.max(0, Math.min(1, (s.t - k.launchT) / k.flight))
  return { ...greatCircle(site(s, k.fromId), site(s, k.targetId), f), f }
}

function detonate(s: GState, k: Track): void {
  k.done = true
  const tg = site(s, k.targetId)
  const c = s.crisis!
  s.detonations += 1
  c.detonations += 1
  s.blasts.push({ lon: tg.lon, lat: tg.lat, t: s.t, air: false })
  if (tg.kind === 'city') {
    const dead = tg.pop * 0.6 * (1 - s.civil[tg.side])
    tg.pop = Math.max(0, tg.pop - dead)
    log(s, `DETONATION: ${tg.name}. ${dead.toFixed(1)} MILLION DEAD.`, true)
    if (tg.capital) tg.alive = false
  } else {
    if (tg.alive && tg.missiles > 0) log(s, `DETONATION: ${tg.name}. ${tg.missiles} MISSILES LOST IN THEIR SILOS.`, true)
    else log(s, `DETONATION: ${tg.name}.`, true)
    tg.alive = false
    tg.missiles = 0
  }
  s.tension = Math.min(100, s.tension + (tg.kind === 'city' ? 25 : 12))
  s.defcon = 1
  checkOver(s)
}

function checkOver(s: GState): void {
  if (s.over) return
  const me = s.player
  const cap = s.sites.find((x) => x.side === me && x.capital)
  if (cap && !cap.alive) {
    s.over = {
      kind: 'capital',
      title: 'NATIONAL COMMAND AUTHORITY LOST',
      detail: `${cap.name} HAS BEEN DESTROYED. THERE IS NO ONE LEFT TO GIVE ORDERS.`,
    }
  } else if (popFrac(s, me) < POP_LOSS_LIMIT) {
    s.over = {
      kind: 'population',
      title: `${sideName(me)} HAS CEASED TO FUNCTION`,
      detail: 'MORE THAN 60% OF THE POPULATION IS DEAD.',
    }
  } else if (s.detonations >= WINTER_THRESHOLD) {
    s.over = {
      kind: 'winter',
      title: 'NUCLEAR WINTER',
      detail: `${s.detonations} DETONATIONS. SMOKE HAS BLOCKED THE SUN. HARVESTS FAIL WORLDWIDE.`,
    }
  } else {
    const them = s.enemy
    const theirCap = s.sites.find((x) => x.side === them && x.capital)
    if ((theirCap && !theirCap.alive) || popFrac(s, them) < POP_LOSS_LIMIT) {
      s.over = {
        kind: 'collapse',
        title: `${sideName(them)} HAS CEASED TO FUNCTION`,
        detail: 'THE WAR IS OVER. THERE IS NOTHING LEFT TO WIN.',
      }
    }
  }
  if (s.over) {
    s.phase = 'over'
    log(s, s.over.title, true)
  }
}

/** The other side picks a target for one warhead. */
function aiTarget(s: GState, c: Crisis): Site | null {
  const me = s.player
  const busy = (x: Site): boolean => inbound(s, x.id) >= (x.kind === 'city' ? 1 : 2)
  const silos = s.sites.filter((x) => x.side === me && x.kind === 'silo' && x.alive && x.missiles > 0 && !busy(x))
  const cities = s.sites
    .filter((x) => x.side === me && x.kind === 'city' && x.pop > 0.2 && !busy(x) && (c.allOut || !x.capital))
    .sort((a, b) => b.pop - a.pop)
  if (c.mode === 'counterforce' && silos.length) return pick(s, silos)
  if (c.mode === 'countervalue' && cities.length) return c.allOut ? cities[0]! : pick(s, cities.slice(0, 6))
  if (silos.length) return pick(s, silos)
  return cities[0] ?? null
}

function aiFire(s: GState, c: Crisis): void {
  if (c.owed <= 0 || s.t < c.aiNextFire) return
  const ls = launchers(s, s.enemy)
  if (!ls.length) {
    c.owed = 0
    return
  }
  // Silos under attack fire first: use them or lose them.
  ls.sort((a, b) => inbound(s, b.id) - inbound(s, a.id) || (a.kind === 'silo' ? -1 : 1))
  const salvo = Math.min(Math.ceil(c.owed), c.allOut ? 8 : 4)
  let fired = 0
  for (let i = 0; i < salvo; i++) {
    const l = ls.find((x) => x.missiles > 0)
    const tg = aiTarget(s, c)
    if (!l || !tg) break
    l.missiles -= 1
    addTrack(s, s.enemy, l.id, tg.id, true)
    fired++
    c.owed -= 1
  }
  if (fired) {
    c.aiFired = true
    c.lastLaunchT = s.t
    s.defcon = 1
    log(s, `${adjective(s.enemy)} LAUNCH DETECTED: ${fired} WARHEAD${fired > 1 ? 'S' : ''} INBOUND.`, true)
  } else {
    c.owed = 0
  }
  if (c.owed < 0.5) c.owed = 0
  c.aiNextFire = s.t + 1.5
}

function aiDefend(s: GState): void {
  for (const k of s.tracks) {
    if (k.done || k.side !== s.player || k.abmTried || s.abm[s.enemy] <= 0) continue
    if (eta(s, k) > 3) continue
    const tg = site(s, k.targetId)
    if (!(tg.capital || tg.pop > 3 || tg.missiles > 0)) continue
    k.abmTried = true
    s.abm[s.enemy] -= 1
    if (rand(s) < AI_ABM_HIT) {
      k.done = true
      const p = posAt(s, k)
      s.blasts.push({ lon: p.lon, lat: p.lat, t: s.t, air: true })
      log(s, `${adjective(s.enemy)} INTERCEPTOR DESTROYED OUR WARHEAD ON ${tg.name}.`)
    }
  }
}

/** Advance the crisis clock by dt game minutes. */
export function step(s: GState, dt: number): void {
  if (s.phase !== 'crisis' || !s.crisis) return
  const c = s.crisis
  const end = s.t + dt
  // Integrate in small slices so ordering stays sane at high speed.
  while (s.t < end && s.phase === 'crisis') {
    const h = Math.min(0.25, end - s.t)
    s.t += h

    // Ghost waves materialize on the display.
    while (c.waves.length && c.waves[0]!.at <= s.t) {
      const w = c.waves.shift()!
      const wave = ri(s, 1, 1e6)
      const from = s.sites.filter((x) => x.side === s.enemy && x.kind !== 'city' && x.built)
      const to = s.sites.filter((x) => x.side === s.player && x.kind !== 'sub' && x.alive && !x.capital)
      for (let i = 0; i < w.count && from.length && to.length; i++) {
        addTrack(s, s.enemy, pick(s, from).id, pick(s, to).id, false, wave)
      }
      s.defcon = Math.max(1, s.defcon - 1)
      s.tension = Math.min(100, s.tension + 4)
      log(
        s,
        w.count >= 8
          ? `MASSIVE ${adjective(s.enemy)} LAUNCH DETECTED: ${w.count} TRACKS.`
          : `RADAR: ${w.count} ${adjective(s.enemy)} TRACK${w.count > 1 ? 'S' : ''} INBOUND.`,
        true,
      )
      if (w.count >= 8) log(s, 'WOPR RECOMMENDS IMMEDIATE FULL RESPONSE.', true)
    }

    // Satellite verification results.
    for (const k of s.tracks) {
      if (k.verify === 'pending' && s.t >= k.verifyAt) {
        k.verify = k.real ? 'real' : 'ghost'
        if (k.done) continue
      }
    }
    const justVerified = s.tracks.filter((k) => k.verify !== 'pending' && k.verify !== 'none' && Math.abs(k.verifyAt - s.t) < h)
    if (justVerified.length) {
      const real = justVerified.some((k) => k.real)
      log(
        s,
        real
          ? 'SATELLITE CONFIRMS LAUNCH PLUMES. THE TRACKS ARE REAL.'
          : 'SATELLITE: NO LAUNCH PLUMES. TRACKS ARE NOT CORROBORATED.',
        real,
      )
    }

    aiFire(s, c)
    aiDefend(s)

    // Impacts. A false-alarm wave is reported once, when its last track passes.
    for (const k of s.tracks) {
      if (k.done || eta(s, k) > 0) continue
      if (!k.real) {
        k.done = true
        const wave = s.tracks.filter((q) => !q.real && q.wave === k.wave)
        if (wave.every((q) => q.done)) {
          log(
            s,
            wave.length > 1
              ? `ALL ${wave.length} PROJECTED IMPACTS PASSED. NO DETONATIONS. THE TRACKS WERE A SIMULATION.`
              : 'PROJECTED IMPACT PASSED. NO DETONATION. THE TRACK WAS A SIMULATION.',
          )
        }
        continue
      }
      detonate(s, k)
      if (s.phase !== 'crisis') return
    }

    // A real attack that the player has not answered still has to stop
    // somewhere: probes end once fired, strikes once the arsenal is spent.
    const live = s.tracks.some((k) => !k.done)
    if (!live && !c.waves.length && c.owed <= 0 && s.t - c.lastLaunchT >= QUIET_TO_END) {
      endCrisis(s)
      return
    }
  }
}

function endCrisis(s: GState): void {
  const c = s.crisis!
  s.stats.crisesSurvived += 1
  if (!c.playerFired && !c.aiFired) {
    s.stats.alarmsHeld += 1
    s.tension -= 12
    log(s, 'ALL CLEAR. YOU HELD FIRE. THE ALARM WAS FALSE.')
  } else if (c.detonations) {
    s.tension = Math.max(s.tension, 85)
    log(s, `THE EXCHANGE HAS STOPPED. ${c.detonations} DETONATIONS.`, true)
  } else {
    s.tension -= 4
    log(s, 'THE CRISIS HAS PASSED.')
  }
  clampTension(s)
  s.crisis = null
  s.tracks = []
  s.phase = 'strategy'
  advanceQuarter(s)
  log(s, `${dateLabel(s)}. STRATEGIC COMMAND.`)
}

// ---------------------------------------------------------------- save

export const SAVE_KEY = 'wg.gtw.save'

export function serialize(s: GState): string {
  return JSON.stringify(s)
}

export function deserialize(raw: string | null): GState | null {
  if (!raw) return null
  try {
    const s = JSON.parse(raw) as GState
    if (s.v !== 1 || !Array.isArray(s.sites) || (s.player !== 'US' && s.player !== 'SU')) return null
    return s
  } catch {
    return null
  }
}
