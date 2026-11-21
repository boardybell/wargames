// The GLOBAL THERMONUCLEAR WAR big board. Wraps the engine in a NORAD-style
// display: a polar radar-scope world map with cities, silos, submarines,
// missile tracks and detonations, a command panel for the strategy phase
// (budget, news) and the crisis phase (verify, intercept, launch), and a
// command log. The game is saved to the browser after every move so it can be
// resumed later; it only ends when the player loses.
//
// Layout and visual design co-developed with ChatGPT (design review in
// docs/gtw-design-review.md, sections P1-P3).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  adjective,
  arsenal,
  BUY_ITEMS,
  buy,
  dateLabel,
  deserialize,
  endQuarter,
  eta,
  fire,
  fullResponse,
  greatCircle,
  intercept,
  INTERCEPT_RANGE,
  liveTracks,
  newGame,
  popOf,
  posAt,
  SAVE_KEY,
  serialize,
  sideName,
  site,
  step,
  verify,
  WINTER_THRESHOLD,
  type GState,
  type Side,
  type Site,
  type Track,
} from './engine'
import { BOARD, LAND_PATH, latRadius, project } from './worldPath'
import { layoutSiteLabels, scopeGeometry, type Rect } from './labels'
import { beep, chime, siren, thud } from '../sound'
import './gtw.css'

/** Game minutes per real second at 1x. */
const GAME_PER_SEC = 1.2
const RAIL_MIN_GUTTER = 168

export function loadSavedGame(): GState | null {
  try {
    return deserialize(window.localStorage.getItem(SAVE_KEY))
  } catch {
    return null
  }
}
function saveGame(s: GState): void {
  try {
    if (s.phase === 'over') window.localStorage.removeItem(SAVE_KEY)
    else window.localStorage.setItem(SAVE_KEY, serialize(s))
  } catch {
    /* private mode: the game just isn't saved */
  }
}

export interface GtwProps {
  /** Start a new war on this side, or resume the saved one. */
  readonly start: Side | 'resume'
  /** The war is over (lost). */
  readonly onDone: () => void
  /** Leave for the games list; the game stays saved. */
  readonly onExit: () => void
}

const trackId = (k: Track): string => `T${String(k.id).padStart(2, '0')}`
const kindName = (x: Site): string => (x.kind === 'city' ? 'CITY' : x.kind === 'silo' ? 'ICBM FIELD' : 'SSBN')

function useSize<T extends HTMLElement>(): [React.MutableRefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = (): void => {
      const r = el.getBoundingClientRect()
      setSize((s) => (Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height }))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size]
}

export function GlobalThermonuclearWar({ start, onDone, onExit }: GtwProps) {
  const ref = useRef<GState | null>(null)
  if (ref.current === null) {
    ref.current = (start === 'resume' ? loadSavedGame() : null) ?? newGame(start === 'resume' ? 'US' : start)
  }
  const s = ref.current
  const [, setFrame] = useState(0)
  const redraw = useCallback(() => setFrame((n) => n + 1), [])
  const [speed, setSpeed] = useState(1)
  const [paused, setPaused] = useState(false)
  const [launcher, setLauncher] = useState<string | null>(null)
  const [selTrack, setSelTrack] = useState<number | null>(null)
  const [inspected, setInspected] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [railMode, setRailMode] = useState(false)
  const [confirm, setConfirm] = useState<null | { kind: 'first'; targetId: string } | { kind: 'full' }>(null)
  const seenLog = useRef(s.log.length)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const barRef = useRef<HTMLElement | null>(null)

  const act = useCallback(
    (fn: (g: GState) => string | null | void): void => {
      const r = fn(s)
      setMsg(typeof r === 'string' ? r : null)
      saveGame(s)
      redraw()
    },
    [s, redraw],
  )

  // Real-time crisis clock.
  useEffect(() => {
    if (s.phase !== 'crisis' || paused) return
    let raf = 0
    let last = performance.now()
    let lastSave = last
    const tick = (now: number): void => {
      const dt = Math.min(0.25, (now - last) / 1000)
      last = now
      step(s, dt * GAME_PER_SEC * speed)
      if (now - lastSave > 2000) {
        saveGame(s)
        lastSave = now
      }
      redraw()
      if (s.phase === 'crisis') raf = requestAnimationFrame(tick)
      else saveGame(s)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [s, s.phase, paused, speed, redraw])

  // Sound cues from new log lines.
  useEffect(() => {
    const fresh = s.log.slice(seenLog.current)
    seenLog.current = s.log.length
    for (const l of fresh) {
      if (l.t.startsWith('DETONATION')) thud()
      else if (/INBOUND|LAUNCH DETECTED|MASSIVE/.test(l.t)) siren()
      else if (l.t.startsWith('INTERCEPT') || l.t.startsWith('ALL CLEAR')) chime(600)
      else if (l.t.startsWith('LAUNCH:')) beep(180, 0.4, 'sawtooth', 0.12)
    }
  })

  // Persist on unmount (leaving for the menu mid-crisis keeps the state).
  useEffect(() => () => saveGame(s), [s])

  // The phone layout scrolls under a sticky header; tell focus scrolling how
  // tall that header really is.
  useLayoutEffect(() => {
    const bar = barRef.current
    const root = rootRef.current
    if (!bar || !root) return
    const ro = new ResizeObserver(() => root.style.setProperty('--gtw-header-height', `${bar.offsetHeight}px`))
    ro.observe(bar)
    return () => ro.disconnect()
  }, [])

  const me = s.player
  const them = s.enemy
  const myPop = popOf(s, me)
  const theirPop = popOf(s, them)
  const tracks = liveTracks(s)
  const incoming = tracks.filter((k) => k.side === them).sort((a, b) => eta(s, a) - eta(s, b))
  const sel = launcher ? (s.sites.find((x) => x.id === launcher && x.alive && x.missiles > 0) ?? null) : null
  const selectedTrack = selTrack !== null ? (tracks.find((k) => k.id === selTrack) ?? null) : null
  const groundBlasts = s.blasts.filter((b) => !b.air)

  const canSelect = (x: Site): boolean => x.side === me && x.kind !== 'city' && x.alive && x.missiles > 0
  const canTarget = (x: Site): boolean => x.side === them && x.alive && x.built && x.kind !== 'sub'

  const clickSite = (x: Site): void => {
    if (s.phase === 'over') return
    if (canSelect(x)) {
      setLauncher(x.id === launcher ? null : x.id)
      setInspected(null)
      setMsg(null)
      beep(760, 0.04)
      return
    }
    if (canTarget(x) && sel) {
      if (s.phase === 'strategy') {
        setConfirm({ kind: 'first', targetId: x.id })
        return
      }
      act((g) => fire(g, sel.id, x.id))
      return
    }
    setInspected(x.id)
    if (canTarget(x)) setMsg('SELECT ONE OF YOUR SILOS OR SUBMARINES FIRST.')
  }

  const over = s.phase === 'over' && s.over
  const phaseLabel =
    s.phase === 'crisis'
      ? `${paused ? 'CRISIS PAUSED / ' : 'CRISIS '}T+${Math.floor(s.t)} MIN`
      : s.phase === 'over'
        ? 'GAME OVER'
        : 'STRATEGY'

  const forces = <ForcesReadout s={s} crisis={s.phase === 'crisis'} />
  const selection = (
    <SelectionReadout s={s} launcher={sel} track={selectedTrack} inspected={inspected ? site(s, inspected) : null} />
  )
  const legend = <MapKey />

  return (
    <div
      className="gtw"
      data-testid="gtw"
      data-phase={s.phase}
      data-alert={s.defcon <= 2 ? 'critical' : 'normal'}
      ref={rootRef}
    >
      <header className="gtw-bar" ref={barRef}>
        <div className="gtw-identity">
          <span className="gtw-title">GLOBAL THERMONUCLEAR WAR</span>
          <span className="gtw-context">
            {dateLabel(s)} <span className="gtw-phase">{phaseLabel}</span>
          </span>
        </div>
        <button type="button" className="gtw-btn gtw-exit" onClick={onExit}>
          SAVE &amp; EXIT
        </button>
        <dl className="gtw-metrics">
          <div className="gtw-metric-defcon">
            <dt>DEFCON</dt>
            <dd className={s.defcon <= 2 ? 'gtw-defcon crit' : 'gtw-defcon'}>
              <b>{s.defcon}</b>
            </dd>
          </div>
          <div className="gtw-metric-tension">
            <dt>TENSION</dt>
            <dd className="gtw-tension">
              {Math.round(s.tension)}%
              <i aria-hidden="true">
                <u style={{ width: `${s.tension}%` }} />
              </i>
            </dd>
          </div>
          <div className="gtw-metric-detonations">
            <dt>DETONATIONS</dt>
            <dd className={s.detonations > WINTER_THRESHOLD * 0.6 ? 'gtw-them' : undefined}>
              {s.detonations}/{WINTER_THRESHOLD}
            </dd>
          </div>
          <div className="gtw-metric-pop">
            <dt>{adjective(me)} POP</dt>
            <dd>
              {myPop.now.toFixed(1)}M/{myPop.start.toFixed(0)}M
            </dd>
          </div>
          <div className="gtw-metric-pop gtw-them">
            <dt>{adjective(them)} POP</dt>
            <dd>{theirPop.now.toFixed(1)}M</dd>
          </div>
        </dl>
        {s.phase === 'crisis' && (
          <div className="gtw-speed">
            <button
              type="button"
              className={paused ? 'gtw-btn on' : 'gtw-btn'}
              aria-pressed={paused}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? 'RESUME' : 'PAUSE'}
            </button>
            {[1, 2, 4].map((v) => (
              <button
                key={v}
                type="button"
                className={speed === v && !paused ? 'gtw-btn on' : 'gtw-btn'}
                aria-pressed={speed === v && !paused}
                onClick={() => {
                  setSpeed(v)
                  setPaused(false)
                }}
              >
                {v}X
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="gtw-main">
        <BigBoard
          s={s}
          launcher={sel?.id ?? null}
          selTrack={selTrack}
          inspected={inspected}
          canSelect={canSelect}
          canTarget={canTarget}
          onSite={clickSite}
          onTrack={(k) => setSelTrack(k.id)}
          onRailMode={setRailMode}
          leftRail={
            <>
              {legend}
              {selection}
            </>
          }
          rightRail={forces}
        />

        <aside className="gtw-panel">
          <div className="gtw-panel-head">
            {s.phase === 'crisis' ? (
              <>
                <h3 className="gtw-crit">INCOMING ({incoming.length})</h3>
                <p className="gtw-dim">
                  INTERCEPTORS {s.abm[me]} / SATELLITE PASSES {s.sats}
                </p>
              </>
            ) : (
              <>
                <h3>STRATEGIC COMMAND: {sideName(me)}</h3>
                <div className="gtw-budget">
                  <span>BUDGET / CREDITS</span>
                  <b>{s.budget}</b>
                </div>
                {s.phase === 'strategy' && groundBlasts.length > 0 && (
                  <p className="gtw-after-action">
                    LAST EXCHANGE: {groundBlasts.length} DETONATIONS. STRATEGIC COMMAND RESUMED.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="gtw-panel-body">
            {s.phase === 'strategy' && (
              <>
                {s.news.length > 0 && (
                  <section className="gtw-latest">
                    <h4>LATEST</h4>
                    <p>{s.news[s.news.length - 1]}</p>
                  </section>
                )}
                <div className="gtw-buys">
                  {BUY_ITEMS.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      className="gtw-btn"
                      disabled={s.budget < b.cost}
                      onClick={() => act((g) => buy(g, b.id))}
                    >
                      <span>{b.label}</span>
                      <span className="gtw-buy-cost">{b.cost} CR</span>
                      <small>{b.note}</small>
                    </button>
                  ))}
                </div>
                {s.news.length > 1 && (
                  <details className="gtw-details">
                    <summary>NEWS ARCHIVE</summary>
                    <ul className="gtw-news">
                      {s.news
                        .slice(-5, -1)
                        .reverse()
                        .map((n, i) => (
                          <li key={i}>{n}</li>
                        ))}
                    </ul>
                  </details>
                )}
              </>
            )}

            {s.phase === 'crisis' && (
              <>
                {incoming.length === 0 && <p className="gtw-dim">NO TRACKS.</p>}
                <ul className="gtw-tracks">
                  {incoming.map((k) => (
                    <TrackRow
                      key={k.id}
                      s={s}
                      k={k}
                      selected={selTrack === k.id}
                      onSelect={() => setSelTrack(k.id)}
                      onVerify={() => {
                        setSelTrack(k.id)
                        act((g) => verify(g, k.id))
                      }}
                      onIntercept={() => {
                        setSelTrack(k.id)
                        act((g) => intercept(g, k.id))
                      }}
                    />
                  ))}
                </ul>
                <section>
                  <h4>RESPONSE</h4>
                  <p className="gtw-hint">
                    {sel
                      ? `${sel.name} SELECTED (${sel.missiles}). CLICK AN ENEMY TARGET TO FIRE ONE WARHEAD.`
                      : 'SELECT YOUR SILO OR SUBMARINE TO FIRE. OR HOLD FIRE.'}
                  </p>
                </section>
              </>
            )}

            <SiteIndex
              s={s}
              launcher={sel}
              canSelect={canSelect}
              canTarget={canTarget}
              onSite={clickSite}
              onInspect={setInspected}
            />

            {!railMode && (
              <>
                <details className="gtw-details" open>
                  <summary>SELECTION</summary>
                  {selection}
                </details>
                <details className="gtw-details" open={s.phase !== 'crisis'}>
                  <summary>FORCES</summary>
                  {forces}
                </details>
                <details className="gtw-details">
                  <summary>MAP KEY</summary>
                  {legend}
                </details>
              </>
            )}
          </div>

          <div className="gtw-panel-footer">
            {s.phase === 'strategy' && (
              <>
                <button
                  type="button"
                  className="gtw-btn gtw-primary"
                  onClick={() => {
                    setLauncher(null)
                    act((g) => endQuarter(g))
                  }}
                  data-testid="gtw-end-quarter"
                >
                  END QUARTER &gt;
                </button>
                <p className="gtw-hint gtw-dim">
                  TO STRIKE FIRST: SELECT YOUR SILO OR SUBMARINE, THEN AN ENEMY TARGET.
                </p>
              </>
            )}
            {s.phase === 'crisis' && (
              <button type="button" className="gtw-btn gtw-danger" onClick={() => setConfirm({ kind: 'full' })}>
                FULL RESPONSE
              </button>
            )}
          </div>
        </aside>
      </div>

      <CommandLog s={s} msg={msg} />

      {confirm && (
        <div className="gtw-modal" role="dialog" aria-modal="true">
          <div>
            {confirm.kind === 'first' ? (
              <p>
                INITIATE A FIRST STRIKE ON {site(s, confirm.targetId).name}?
                <br />
                <span className="gtw-dim">THE {sideName(them)} WILL ANSWER.</span>
              </p>
            ) : (
              <p>
                LAUNCH EVERY REMAINING WARHEAD?
                <br />
                <span className="gtw-dim">THERE IS NO CALLING THEM BACK.</span>
              </p>
            )}
            <button
              type="button"
              className="gtw-btn gtw-danger"
              onClick={() => {
                const c = confirm
                setConfirm(null)
                if (c.kind === 'first' && sel) act((g) => fire(g, sel.id, c.targetId))
                else if (c.kind === 'full') act((g) => (fullResponse(g), null))
              }}
            >
              CONFIRM
            </button>
            <button type="button" className="gtw-btn" autoFocus onClick={() => setConfirm(null)}>
              CANCEL
            </button>
          </div>
        </div>
      )}

      {over && <GameOverPanel s={s} onDone={onDone} />}
    </div>
  )
}

// ---------------------------------------------------------------- readouts

function ForcesReadout({ s, crisis }: { s: GState; crisis: boolean }) {
  const me = s.player
  const mine = arsenal(s, me)
  const theirs = arsenal(s, s.enemy)
  const icbm: [string, ReactNode] = ['ICBM', mine.icbm]
  const slbm: [string, ReactNode] = ['SLBM', mine.slbm]
  const abm: [string, ReactNode] = ['INTERCEPTORS', s.abm[me]]
  const sats: [string, ReactNode] = ['SATELLITE PASSES', s.sats]
  const civil: [string, ReactNode] = ['CIVIL DEFENSE', `${Math.round(s.civil[me] * 100)}%`]
  // In a crisis the defensive counts are what matter first.
  const rows = crisis ? [abm, sats, icbm, slbm, civil] : [icbm, slbm, abm, sats, civil]
  return (
    <div className="gtw-readout">
      <h4>FORCES</h4>
      <dl className="gtw-forces">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <div className="gtw-them">
          <dt>{adjective(s.enemy)} (EST.)</dt>
          <dd>{Math.round((theirs.icbm + theirs.slbm) / 5) * 5} WARHEADS</dd>
        </div>
      </dl>
    </div>
  )
}

function SelectionReadout({
  s,
  launcher,
  track,
  inspected,
}: {
  s: GState
  launcher: Site | null
  track: Track | null
  inspected: Site | null
}) {
  const siteLine = (x: Site): ReactNode => (
    <>
      <b className={x.side === s.player ? undefined : 'gtw-them'}>{x.name}</b>
      <span className="gtw-dim">
        {' '}
        {adjective(x.side)} {kindName(x)}
        {x.kind === 'city'
          ? `, ${x.pop.toFixed(1)}M OF ${x.pop0.toFixed(1)}M`
          : x.alive
            ? `, ${x.missiles} MISSILES`
            : ', DESTROYED'}
      </span>
    </>
  )
  return (
    <div className="gtw-readout">
      <h4>SELECTED</h4>
      {!launcher && !track && !inspected && <p className="gtw-dim">NOTHING SELECTED.</p>}
      {launcher && <p>LAUNCHER: {siteLine(launcher)}</p>}
      {track && (
        <p>
          TRACK {trackId(track)}: <b>{site(s, track.targetId).name}</b>{' '}
          <span className="gtw-dim">
            {Math.max(0, Math.ceil(eta(s, track)))} MIN, {statusText(track)}
          </span>
        </p>
      )}
      {inspected && <p>SITE: {siteLine(inspected)}</p>}
    </div>
  )
}

function MapKey() {
  const sym = (d: ReactNode): ReactNode => (
    <svg className="gtw-key-symbol" viewBox="-1.5 -1.5 3 3" aria-hidden="true">
      {d}
    </svg>
  )
  return (
    <div className="gtw-readout gtw-key">
      <h4>POLAR SCOPE</h4>
      <p className="gtw-dim">NORTH POLE / 10N RIM</p>
      <ul>
        <li>{sym(<circle r={1} />)} CITY</li>
        <li>{sym(<path d="M0 -1.3 L1.2 0.9 L-1.2 0.9 Z" />)} ICBM FIELD</li>
        <li>{sym(<path d="M0 -1.2 L1.2 0 L0 1.2 L-1.2 0 Z" />)} SSBN PATROL</li>
        <li>
          <i className="gtw-key-line mine" /> YOUR FORCES
        </li>
        <li className="gtw-them">
          <i className="gtw-key-line theirs" /> OPPOSING FORCES
        </li>
        <li className="gtw-amber">
          <i className="gtw-key-bracket" /> SELECTED / ALERT
        </li>
      </ul>
    </div>
  )
}

function SiteIndex({
  s,
  launcher,
  canSelect,
  canTarget,
  onSite,
  onInspect,
}: {
  s: GState
  launcher: Site | null
  canSelect: (x: Site) => boolean
  canTarget: (x: Site) => boolean
  onSite: (x: Site) => void
  onInspect: (id: string) => void
}) {
  const built = s.sites.filter((x) => x.built)
  const mine = built.filter(canSelect)
  const targets = built.filter(canTarget)
  const other = built.filter((x) => !canSelect(x) && !canTarget(x))
  return (
    <details className="gtw-details gtw-site-index">
      <summary>SITES</summary>
      <h4>YOUR LAUNCHERS</h4>
      {mine.length === 0 && <p className="gtw-dim">NONE READY.</p>}
      {mine.map((x) => (
        <button
          key={x.id}
          type="button"
          className={launcher?.id === x.id ? 'gtw-btn on' : 'gtw-btn'}
          aria-pressed={launcher?.id === x.id}
          onClick={() => onSite(x)}
        >
          {x.name} ({x.missiles})
        </button>
      ))}
      <h4>ENEMY TARGETS</h4>
      {targets.map((x) => (
        <button
          key={x.id}
          type="button"
          className="gtw-btn gtw-them"
          onClick={() => (launcher ? onSite(x) : onInspect(x.id))}
        >
          {launcher ? `FIRE AT ${x.name}` : x.name}
        </button>
      ))}
      <h4>OTHER SITES</h4>
      {other.map((x) => (
        <button
          key={x.id}
          type="button"
          className={x.side === s.player ? 'gtw-btn' : 'gtw-btn gtw-them'}
          onClick={() => onInspect(x.id)}
        >
          {x.name}
        </button>
      ))}
    </details>
  )
}

function statusText(k: Track): string {
  return k.verify === 'ghost'
    ? 'NOT CORROBORATED'
    : k.verify === 'real'
      ? 'CONFIRMED'
      : k.verify === 'pending'
        ? 'VERIFYING'
        : 'UNVERIFIED'
}

function TrackRow({
  s,
  k,
  selected,
  onSelect,
  onVerify,
  onIntercept,
}: {
  s: GState
  k: Track
  selected: boolean
  onSelect: () => void
  onVerify: () => void
  onIntercept: () => void
}) {
  const t = eta(s, k)
  const tg = site(s, k.targetId)
  const reason = k.abmTried
    ? 'INTERCEPTOR ENGAGED'
    : s.abm[s.player] <= 0
      ? 'NO INTERCEPTORS'
      : t > INTERCEPT_RANGE
        ? `INTERCEPT AT ${INTERCEPT_RANGE} MIN`
        : k.verify === 'none' && s.sats <= 0
          ? 'NO SATELLITE PASSES'
          : ''
  return (
    <li className={selected ? 'sel' : undefined} data-track={k.id} data-verify={k.verify}>
      <button type="button" className="gtw-track-summary" aria-pressed={selected} onClick={onSelect}>
        <span className="gtw-track-id">{trackId(k)}</span>
        <span className="gtw-track-target">{tg.name}</span>
        <strong className="gtw-track-eta">{Math.max(0, Math.ceil(t))} MIN</strong>
        <span className="gtw-track-status" data-status={k.verify}>
          {statusText(k)}
        </span>
      </button>
      <div className="gtw-row-btns">
        <button type="button" className="gtw-btn" disabled={k.verify !== 'none' || s.sats <= 0} onClick={onVerify}>
          VERIFY
        </button>
        <button
          type="button"
          className="gtw-btn"
          disabled={k.abmTried || s.abm[s.player] <= 0 || t > INTERCEPT_RANGE}
          onClick={onIntercept}
        >
          {k.abmTried ? 'ENGAGED' : 'INTERCEPT'}
        </button>
      </div>
      {reason && <small className="gtw-track-reason">{reason}</small>}
    </li>
  )
}

function CommandLog({ s, msg }: { s: GState; msg: string | null }) {
  const visible = s.log.slice(-5)
  const base = s.log.length - visible.length
  const linesRef = useRef<HTMLDivElement | null>(null)
  const atBottom = useRef(true)
  useLayoutEffect(() => {
    const el = linesRef.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  })
  return (
    <div className="gtw-log">
      <div className="gtw-log-heading">COMMAND LOG</div>
      <div
        className="gtw-log-lines"
        aria-live="polite"
        ref={linesRef}
        onScroll={(e) => {
          const el = e.currentTarget
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 4
        }}
      >
        {visible.map((l, i) => (
          <span key={base + i} className={l.crit ? 'crit' : undefined}>
            {l.t}
          </span>
        ))}
        {msg && <span className="gtw-msg">&gt; {msg}</span>}
      </div>
    </div>
  )
}

function GameOverPanel({ s, onDone }: { s: GState; onDone: () => void }) {
  const me = popOf(s, s.player)
  const them = popOf(s, s.enemy)
  const years = (s.turn - 1) / 4
  return (
    <div className="gtw-modal gtw-over" role="dialog" aria-modal="true" data-testid="gtw-over">
      <div>
        <h2 className="gtw-crit">{s.over!.title}</h2>
        <p>{s.over!.detail}</p>
        <dl className="gtw-forces">
          {(
            [
              ['COMMAND HELD', `${years.toFixed(2)} YEARS (TO ${dateLabel(s)})`],
              ['CRISES SURVIVED', s.stats.crisesSurvived],
              ['FALSE ALARMS HELD', s.stats.alarmsHeld],
              ['WARHEADS YOU FIRED', s.stats.warheadsFired],
              [`${adjective(s.player)} DEAD`, `${(me.start - me.now).toFixed(1)} MILLION`],
              [`${adjective(s.enemy)} DEAD`, `${(them.start - them.now).toFixed(1)} MILLION`],
            ] as [string, ReactNode][]
          ).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="gtw-crit">WINNER: NONE</p>
        <button type="button" className="gtw-btn gtw-primary" autoFocus onClick={onDone}>
          CONTINUE &gt;
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- the map

/** The flown part of a track as a polyline of great-circle samples. */
function routePoints(s: GState, k: Track, f: number): string {
  const a = site(s, k.fromId)
  const b = site(s, k.targetId)
  const n = 28
  const pts: string[] = []
  for (let i = 0; i <= n; i++) {
    const g = greatCircle(a, b, (f * i) / n)
    const p = project(g.lon, g.lat)
    pts.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`)
  }
  return pts.join(' ')
}

function brackets(cx: number, cy: number, r: number, arm: number): string {
  const d: string[] = []
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    const x = cx + sx * r
    const y = cy + sy * r
    d.push(`M${x - sx * arm} ${y}L${x} ${y}L${x} ${y - sy * arm}`)
  }
  return d.join('')
}

let measureCtx: CanvasRenderingContext2D | null = null
function measurer(el: HTMLElement | null): (t: string) => number {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  const family = el ? getComputedStyle(el).fontFamily : 'monospace'
  return (t) => {
    if (!measureCtx) return t.length * 7.2
    measureCtx.font = `12px ${family}`
    return measureCtx.measureText(t).width
  }
}

function BigBoard({
  s,
  launcher,
  selTrack,
  inspected,
  canSelect,
  canTarget,
  onSite,
  onTrack,
  onRailMode,
  leftRail,
  rightRail,
}: {
  s: GState
  launcher: string | null
  selTrack: number | null
  inspected: string | null
  canSelect: (x: Site) => boolean
  canTarget: (x: Site) => boolean
  onSite: (x: Site) => void
  onTrack: (k: Track) => void
  onRailMode: (on: boolean) => void
  leftRail: ReactNode
  rightRail: ReactNode
}) {
  const [surfRef, size] = useSize<HTMLDivElement>()
  const [fontsReady, setFontsReady] = useState(0)
  useEffect(() => {
    let live = true
    document.fonts?.ready.then(() => live && setFontsReady((n) => n + 1)).catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const W = size.w
  const H = size.h
  const g = scopeGeometry(W, H)
  const gutter = (W - g.diameter) / 2
  const wide = typeof window !== 'undefined' && window.innerWidth > 900
  const railMode = W > 0 && gutter >= RAIL_MIN_GUTTER && wide
  useEffect(() => onRailMode(railMode), [railMode, onRailMode])

  const rails: Rect[] = railMode
    ? [
        { x: 12, y: 16, w: gutter - 24, h: H - 32 },
        { x: W - gutter + 12, y: 16, w: gutter - 24, h: H - 32 },
      ]
    : []

  const me = s.player
  const targetOfTrack = selTrack !== null ? s.tracks.find((k) => k.id === selTrack && !k.done)?.targetId : undefined
  // Recompute labels only when something they depend on changes, not on
  // every missile frame (the engine mutates the same state object).
  const labelKey = [
    W,
    H,
    fontsReady,
    launcher,
    inspected,
    targetOfTrack,
    railMode,
    s.sites.map((x) => `${x.built ? 1 : 0}${x.alive ? 1 : 0}${x.pop > 0.05 ? 1 : 0}${x.id === launcher ? x.missiles : ''}`).join(''),
  ].join('|')
  const labels = useMemo(
    () =>
      layoutSiteLabels({
        sites: s.sites,
        player: me,
        W,
        H,
        focus: [launcher, inspected, targetOfTrack].filter((x): x is string => !!x),
        launcherId: launcher,
        rails,
        measure: measurer(surfRef.current),
      }),
    [labelKey],
  )

  const grid = useMemo(() => {
    const c = BOARD / 2
    const lines: string[] = []
    for (const lat of [70, 50, 30]) {
      const r = latRadius(lat)
      lines.push(`M${c - r} ${c}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`)
    }
    for (let lon = -180; lon < 180; lon += 30) {
      const p = project(lon, 10)
      lines.push(`M${c} ${c}L${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    }
    return lines.join('')
  }, [])

  const scale = g.scale || 1
  const live = s.tracks.filter((k) => !k.done)
  const crisis = s.phase === 'crisis'
  const impactSites = crisis
    ? []
    : Array.from(new Map(s.blasts.filter((b) => !b.air).map((b) => [`${b.lon},${b.lat}`, b])).values())
  const hitR = Math.max(2.6, 8 / scale)

  return (
    <div className="gtw-board">
      <div className="gtw-board-surface" ref={surfRef}>
        <svg
          className="gtw-map-svg"
          viewBox={`0 0 ${BOARD} ${BOARD}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Polar map of the Northern Hemisphere"
        >
          <defs>
            <clipPath id="gtw-scope">
              <circle cx={BOARD / 2} cy={BOARD / 2} r={BOARD / 2} />
            </clipPath>
          </defs>
          <circle className="gtw-rim" cx={BOARD / 2} cy={BOARD / 2} r={BOARD / 2 - 0.2} />
          <g clipPath="url(#gtw-scope)">
            <path className="gtw-grid" d={grid} />
            <path className="gtw-land" d={LAND_PATH} />
          </g>

          {/* Track trails and their wide hit paths. */}
          {live.map((k) => {
            const pos = posAt(s, k)
            const pts = routePoints(s, k, pos.f)
            const cls = ['gtw-track', k.side === me ? 'mine' : 'theirs', k.verify === 'ghost' ? 'ghost' : '', selTrack === k.id ? 'sel' : ''].join(' ')
            return (
              <g key={k.id} className={cls} data-verify={k.verify} onClick={() => onTrack(k)}>
                <polyline className="gtw-track-trail" points={pts} />
                <polyline className="gtw-track-hit" points={pts} />
              </g>
            )
          })}

          {impactSites.map((b, i) => {
            const p = project(b.lon, b.lat)
            const r = 5 / scale
            const t = 3 / scale
            return (
              <g key={i} className="gtw-impact-mark" transform={`translate(${p.x} ${p.y})`}>
                <circle r={r} />
                <path d={`M0 ${-r - t}V${-r}M0 ${r}V${r + t}M${-r - t} 0H${-r}M${r} 0H${r + t}`} />
              </g>
            )
          })}

          {s.sites
            .filter((x) => x.built)
            .map((x) => {
              const p = project(x.lon, x.lat)
              const mine = x.side === me
              const cls = [
                'gtw-site',
                x.kind,
                mine ? 'mine' : 'theirs',
                x.alive && (x.kind !== 'city' || x.pop > 0.05) ? '' : 'dead',
                launcher === x.id ? 'sel' : '',
                launcher !== null && canTarget(x) ? 'target' : '',
                canSelect(x) ? 'select' : '',
              ].join(' ')
              const r = x.kind === 'city' ? 0.5 + Math.sqrt(x.pop0) * 0.3 : 1.1
              return (
                <g
                  key={x.id}
                  className={cls}
                  transform={`translate(${p.x} ${p.y})`}
                  onClick={() => onSite(x)}
                  data-site={x.id}
                >
                  <title>{`${x.name}, ${adjective(x.side)} ${kindName(x)}`}</title>
                  {x.kind === 'city' && <circle r={r} />}
                  {x.kind === 'silo' && <path d="M0 -1.3 L1.2 0.9 L-1.2 0.9 Z" />}
                  {x.kind === 'sub' && <path d="M0 -1.2 L1.2 0 L0 1.2 L-1.2 0 Z" />}
                  <circle className="hit" r={hitR} />
                </g>
              )
            })}

          {/* Selection brackets sit outside the ownership-colored groups. */}
          {[launcher, inspected].filter((x): x is string => !!x).map((id) => {
            const x = s.sites.find((q) => q.id === id)
            if (!x) return null
            const p = project(x.lon, x.lat)
            return <path key={`b-${id}`} className="gtw-bracket" d={brackets(p.x, p.y, 7 / scale, 3 / scale)} />
          })}

          {/* Track heads and the selected-track reticle. */}
          {live.map((k) => {
            const pos = posAt(s, k)
            const head = project(pos.lon, pos.lat)
            const cls = ['gtw-track', k.side === me ? 'mine' : 'theirs', k.verify === 'ghost' ? 'ghost' : ''].join(' ')
            return (
              <g key={`h-${k.id}`} className={cls} data-verify={k.verify} onClick={() => onTrack(k)}>
                <circle className="gtw-track-head" cx={head.x} cy={head.y} r={2.5 / scale} />
                {selTrack === k.id && (
                  <path className="gtw-track-reticle" d={brackets(head.x, head.y, 7 / scale, 3 / scale)} />
                )}
              </g>
            )
          })}

          {crisis &&
            s.blasts
              .filter((b) => s.t - b.t < 4)
              .map((b, i) => {
                const p = project(b.lon, b.lat)
                const age = Math.max(0, Math.min(1, (s.t - b.t) / 4))
                return (
                  <g key={`x-${i}`} className={b.air ? 'gtw-blast air' : 'gtw-blast'} transform={`translate(${p.x} ${p.y})`} opacity={1 - age}>
                    <circle className="gtw-blast-ring" r={(b.air ? 1 : 2) + age * (b.air ? 2 : 4)} />
                    {!b.air && <circle className="gtw-blast-ring inner" r={0.8 + age * 3} />}
                    {age < 0.15 && <circle className="gtw-blast-core" r={1.5 / scale} />}
                  </g>
                )
              })}
        </svg>

        <svg className="gtw-label-leaders" viewBox={`0 0 ${Math.max(1, W)} ${Math.max(1, H)}`} aria-hidden="true">
          {labels
            .filter((l) => l.leader)
            .map((l) => (
              <polyline key={l.id} points={l.leader} className={l.side} />
            ))}
        </svg>
        <div className="gtw-label-layer" aria-hidden="true">
          {labels.map((l) => (
            <span key={l.id} className={`gtw-site-label ${l.side}`} style={{ left: l.left, top: l.top }}>
              {l.text}
            </span>
          ))}
        </div>

        {railMode && (
          <>
            <aside className="gtw-board-rail gtw-board-rail-left" style={{ width: gutter - 24 }}>
              {leftRail}
            </aside>
            <aside className="gtw-board-rail gtw-board-rail-right" style={{ width: gutter - 24 }}>
              {rightRail}
            </aside>
          </>
        )}
      </div>
    </div>
  )
}
