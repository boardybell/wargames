// SHALL WE PLAY A GAME? A self-contained, playable WarGames tribute built on
// the terminal look and the WOPR hero art. Hero -> push-in -> WOPR boot -> the
// games list -> GLOBAL THERMONUCLEAR WAR -> pick a side -> launch -> the war
// board escalates to DEFCON 1 -> WOPR runs every scenario and learns futility
// -> THE ONLY WINNING MOVE IS NOT TO PLAY -> a nice game of chess.
import { useEffect, useMemo, useRef, useState } from 'react'
import './game.css'

// ---------- sound (created and resumed on the activation gesture) ----------
let actx: AudioContext | null = null
let master: GainNode | null = null
let soundOn = false

function ctx(): AudioContext | null {
  if (actx) return actx
  try {
    const C =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (C) {
      actx = new C()
      master = actx.createGain()
      master.gain.value = 0.6
      master.connect(actx.destination)
    }
  } catch {
    actx = null
  }
  return actx
}

// Start audio inside a user gesture: resume the context and lay down a low
// room-hum bed so the machine is always audibly alive.
function startAudio(): void {
  soundOn = true
  const c = ctx()
  if (!c || !master) return
  try {
    void c.resume()
  } catch {
    /* ignore */
  }
  try {
    const hg = c.createGain()
    hg.gain.value = 0.05
    hg.connect(master)
    for (const f of [57, 57.7, 114]) {
      const o = c.createOscillator()
      o.type = 'sine'
      o.frequency.value = f
      o.connect(hg)
      o.start()
    }
  } catch {
    /* ignore */
  }
}

function beep(
  freq = 440,
  dur = 0.07,
  type: OscillatorType = 'square',
  gain = 0.14,
): void {
  if (!soundOn) return
  const c = ctx()
  if (!c || !master) return
  try {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = type
    o.frequency.value = freq
    o.connect(g)
    g.connect(master)
    const t = c.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.start(t)
    o.stop(t + dur + 0.03)
  } catch {
    // never let a dead speaker break the game
  }
}
// A rising two-tone confirm.
function chime(base = 520): void {
  beep(base, 0.09, 'square', 0.12)
  setTimeout(() => beep(base * 1.5, 0.12, 'square', 0.12), 90)
}
const thud = (): void => {
  beep(70, 0.5, 'sine', 0.6)
  beep(45, 0.6, 'triangle', 0.45)
}
function siren(): void {
  for (let i = 0; i < 8; i++) {
    setTimeout(() => beep(i % 2 ? 760 : 560, 0.2, 'sawtooth', 0.14), i * 190)
  }
}

const REDUCED =
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ---------- typewriter ----------
interface Seg {
  readonly text: string
  readonly cls?: string
}
type Script = readonly Seg[]

function Typer({
  script,
  cps = 42,
  onDone,
  tick = true,
}: {
  script: Script
  cps?: number
  onDone?: () => void
  tick?: boolean
}) {
  const total = useMemo(() => script.reduce((n, s) => n + s.text.length, 0), [script])
  const [shown, setShown] = useState(REDUCED ? total : 0)
  const doneRef = useRef(false)

  useEffect(() => {
    doneRef.current = false
    if (REDUCED) {
      setShown(total)
      return
    }
    setShown(0)
    let n = 0
    const id = setInterval(() => {
      n += 1
      setShown(n)
      if (tick && n % 2 === 0) beep(900 + (n % 4) * 70, 0.016, 'square', 0.06)
      if (n >= total) clearInterval(id)
    }, 1000 / cps)
    return () => clearInterval(id)
  }, [script, total, cps, tick])

  useEffect(() => {
    if (shown >= total && !doneRef.current) {
      doneRef.current = true
      const id = setTimeout(() => onDone?.(), 260)
      return () => clearTimeout(id)
    }
  }, [shown, total, onDone])

  const complete = shown >= total
  let remaining = shown
  return (
    <span>
      {script.map((s, i) => {
        const take = Math.max(0, Math.min(s.text.length, remaining))
        remaining -= s.text.length
        const slice = s.text.slice(0, take)
        return (
          <span key={i} className={s.cls}>
            {slice}
          </span>
        )
      })}
      {!complete && <span className="wg-cursor" />}
    </span>
  )
}

// ---------- content ----------
const seg = (text: string, cls?: string): Seg => ({ text, cls })

const BOOT: Script = [
  seg('CONNECTING 1200 BAUD...\n', 'wg-dim'),
  seg('CARRIER DETECTED\n', 'wg-dim'),
  seg('@LOGON\n'),
  seg('WOPR CPU PENTAGON STRATEGIC AIR COMMAND\n', 'wg-dim'),
  seg('PROTOVISION / FALKEN SCHEMATICS\n\n', 'wg-dim'),
]

const GREETING: Script = [
  seg('GREETINGS PROFESSOR FALKEN.\n\n'),
  seg('SHALL WE PLAY A GAME?\n', 'wg-big'),
]

const GAMES: readonly string[] = [
  'FALKENS MAZE',
  'BLACK JACK',
  'GIN RUMMY',
  'HEARTS',
  'BRIDGE',
  'CHECKERS',
  'CHESS',
  'POKER',
  'FIGHTER COMBAT',
  'GUERRILLA ENGAGEMENT',
  'DESERT WARFARE',
  'AIR-TO-GROUND ACTIONS',
  'THEATERWIDE TACTICAL WARFARE',
  'THEATERWIDE BIOTOXIC AND CHEMICAL WARFARE',
  'GLOBAL THERMONUCLEAR WAR',
]

interface City {
  readonly name: string
  readonly x: number
  readonly y: number
  readonly side: 'US' | 'SU'
}
const CITIES: readonly City[] = [
  { name: 'SEATTLE', x: 10, y: 22, side: 'US' },
  { name: 'LOS ANGELES', x: 8, y: 55, side: 'US' },
  { name: 'DENVER', x: 20, y: 42, side: 'US' },
  { name: 'WASHINGTON DC', x: 38, y: 38, side: 'US' },
  { name: 'NEW YORK', x: 40, y: 30, side: 'US' },
  { name: 'CHICAGO', x: 30, y: 30, side: 'US' },
  { name: 'MOSCOW', x: 66, y: 24, side: 'SU' },
  { name: 'LENINGRAD', x: 62, y: 18, side: 'SU' },
  { name: 'KIEV', x: 64, y: 34, side: 'SU' },
  { name: 'MINSK', x: 60, y: 28, side: 'SU' },
  { name: 'VLADIVOSTOK', x: 92, y: 40, side: 'SU' },
  { name: 'NOVOSIBIRSK', x: 80, y: 30, side: 'SU' },
]

// A live LED matrix for the WOPR lamp band: a grid of small red/amber/green
// lamps blinking on staggered cycles, so the computer looks like it is
// thinking. Computed once at module load (stable across renders).
const LAMP_COLORS = ['#ff4133', '#ff4133', '#ffae34', '#ffae34', '#4bd957']
const WOPR_LAMPS: ReadonlyArray<{ c: string; d: string; t: string; on: boolean }> =
  Array.from({ length: 46 * 6 }, (_, i) => {
    const r = (i * 2654435761) >>> 0 // a cheap stable hash per index
    return {
      c: LAMP_COLORS[r % LAMP_COLORS.length]!,
      d: `${((r >> 4) % 220) / 100}s`,
      t: `${0.4 + ((r >> 8) % 160) / 100}s`,
      on: (r >> 3) % 3 !== 0,
    }
  })

function WoprLights() {
  return (
    <div className="wg-wopr-lights" aria-hidden="true" data-testid="wopr-lights">
      {WOPR_LAMPS.map((l, i) => (
        <span
          key={i}
          className="wg-lamp"
          style={
            {
              '--c': l.c,
              '--d': l.d,
              '--t': l.t,
              opacity: l.on ? 1 : 0.12,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}

type Stage =
  | 'hero'
  | 'boot'
  | 'greeting'
  | 'menu'
  | 'chess'
  | 'side'
  | 'war'
  | 'learn'
  | 'end'

const STAGES: readonly Stage[] = [
  'hero', 'boot', 'greeting', 'menu', 'chess', 'side', 'war', 'learn', 'end',
]
function initialStage(): Stage {
  if (typeof window === 'undefined') return 'hero'
  const q = new URLSearchParams(window.location.search).get('stage')
  return q && (STAGES as readonly string[]).includes(q) ? (q as Stage) : 'hero'
}

export function WarGamesGame() {
  const [stage, setStage] = useState<Stage>(initialStage)
  const [pushing, setPushing] = useState(false)
  const [side, setSide] = useState<'US' | 'SU'>('US')

  const activate = (): void => {
    startAudio()
    // A rising power-on sweep so you hear the machine wake.
    beep(180, 0.5, 'sawtooth', 0.14)
    setTimeout(() => beep(360, 0.4, 'sawtooth', 0.12), 160)
    setTimeout(() => chime(520), 420)
    if (REDUCED) {
      setStage('boot')
      return
    }
    setPushing(true)
    setTimeout(() => setStage('boot'), 720)
  }

  return (
    <div className={REDUCED ? 'wg wg-reduce' : 'wg'} data-testid="wargames">
      {stage === 'hero' && (
        <div
          className={pushing ? 'wg-hero pushing' : 'wg-hero'}
          onClick={activate}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && activate()}
          data-testid="hero"
        >
          <img src="art/hero-desktop.jpg" alt="" />
          <WoprLights />
          <div className="wg-hero-vignette" />
          <div className="wg-hero-prompt">ACTIVATE TERMINAL</div>
        </div>
      )}

      {stage !== 'hero' && (
        <Screen
          stage={stage}
          side={side}
          onStage={setStage}
          onSide={setSide}
        />
      )}
    </div>
  )
}

function Screen({
  stage,
  side,
  onStage,
  onSide,
}: {
  stage: Stage
  side: 'US' | 'SU'
  onStage: (s: Stage) => void
  onSide: (s: 'US' | 'SU') => void
}) {
  useEffect(() => {
    if (stage === 'greeting') beep(140, 0.7, 'sine', 0.18)
    else if (stage === 'menu') chime(500)
    else if (stage === 'chess') beep(300, 0.3, 'sawtooth', 0.12)
    else if (stage === 'side') chime(420)
    else if (stage === 'end') {
      beep(392, 0.18, 'sine', 0.14)
      setTimeout(() => beep(523, 0.5, 'sine', 0.14), 220)
    }
  }, [stage])

  return (
    <div className="wg-screen" data-testid="screen">
      <div className="wg-out">
        {stage === 'boot' && (
          <Typer script={BOOT} cps={90} onDone={() => onStage('greeting')} />
        )}
        {stage === 'greeting' && <Greeting onDone={() => onStage('menu')} />}
        {stage === 'menu' && <Menu onPick={(g) => onStage(g === 'GLOBAL THERMONUCLEAR WAR' ? 'chess' : 'menu')} />}
        {stage === 'chess' && <Chess onLater={() => onStage('side')} onChess={() => onStage('end')} />}
        {stage === 'side' && (
          <SidePick
            onPick={(s) => {
              onSide(s)
              onStage('war')
            }}
          />
        )}
        {stage === 'war' && <War side={side} onDone={() => onStage('learn')} />}
        {stage === 'learn' && <Learn onDone={() => onStage('end')} />}
        {stage === 'end' && <Ending onAgain={() => onStage('greeting')} />}
      </div>
    </div>
  )
}

function Greeting({ onDone }: { onDone: () => void }) {
  const [done, setDone] = useState(false)
  return (
    <>
      <Typer script={GREETING} cps={22} onDone={() => setDone(true)} />
      {done && (
        <div className="wg-opts">
          <button className="wg-opt" onClick={onDone} autoFocus>
            &gt; LIST GAMES
          </button>
        </div>
      )}
    </>
  )
}

function Menu({ onPick }: { onPick: (g: string) => void }) {
  const [ready, setReady] = useState(false)
  return (
    <>
      <Typer
        script={[seg('LIST GAMES\n\n', 'wg-dim')]}
        cps={120}
        onDone={() => setReady(true)}
        tick={false}
      />
      {ready && (
        <div className="wg-opts" data-testid="games">
          {GAMES.map((g) => (
            <button
              key={g}
              className="wg-opt"
              onClick={() => {
                beep(720, 0.04)
                onPick(g)
              }}
            >
              {g === 'GLOBAL THERMONUCLEAR WAR' ? (
                <span className="wg-amber">{g}</span>
              ) : (
                g
              )}
            </button>
          ))}
          <div className="wg-hint">
            PICK A GAME. (THE INTERESTING ONE IS AT THE BOTTOM.)
          </div>
        </div>
      )}
    </>
  )
}

function Chess({ onLater, onChess }: { onLater: () => void; onChess: () => void }) {
  const [done, setDone] = useState(false)
  return (
    <>
      <Typer
        script={[seg("WOULDN'T YOU PREFER A GOOD GAME OF CHESS?\n")]}
        cps={28}
        onDone={() => setDone(true)}
      />
      {done && (
        <div className="wg-opts">
          <button className="wg-opt" onClick={onChess} autoFocus>
            &gt; YES. LET US PLAY CHESS.
          </button>
          <button className="wg-opt wg-amber" onClick={onLater}>
            &gt; LATER. LET US PLAY GLOBAL THERMONUCLEAR WAR.
          </button>
        </div>
      )}
    </>
  )
}

function SidePick({ onPick }: { onPick: (s: 'US' | 'SU') => void }) {
  const [done, setDone] = useState(false)
  return (
    <>
      <Typer
        script={[
          seg('WHICH SIDE DO YOU WANT?\n\n'),
          seg('  1.  UNITED STATES\n', 'wg-dim'),
          seg('  2.  SOVIET UNION\n', 'wg-dim'),
        ]}
        cps={48}
        onDone={() => setDone(true)}
      />
      {done && (
        <div className="wg-opts">
          <button className="wg-opt" onClick={() => onPick('US')} autoFocus>
            &gt; UNITED STATES
          </button>
          <button className="wg-opt" onClick={() => onPick('SU')}>
            &gt; SOVIET UNION
          </button>
        </div>
      )}
    </>
  )
}

interface Strike {
  readonly from: City
  readonly to: City
  readonly at: number
}

function War({ side, onDone }: { side: 'US' | 'SU'; onDone: () => void }) {
  const [defcon, setDefcon] = useState(5)
  const [hits, setHits] = useState<Set<string>>(new Set())
  const [arcs, setArcs] = useState<Strike[]>([])
  const [log, setLog] = useState<{ t: string; crit?: boolean }[]>([])
  const boardRef = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const timers: ReturnType<typeof setTimeout>[] = []
    const t = (ms: number, fn: () => void): void => {
      timers.push(setTimeout(fn, ms))
    }
    const attacker = side === 'US' ? 'SU' : 'US'
    const defender = side
    const targets = CITIES.filter((c) => c.side === defender)
    const sources = CITIES.filter((c) => c.side === attacker)

    const addLog = (line: string, crit = false): void =>
      setLog((l) => [...l.slice(-7), { t: line, crit }])

    t(200, () => addLog(`${side === 'US' ? 'U.S.' : 'USSR'} FIRST STRIKE AUTHORIZED. LAUNCH ORDER TRANSMITTED.`))
    t(900, () => {
      setDefcon(4)
      beep(320, 0.28, 'square', 0.12)
      addLog('SOVIET EARLY WARNING RADAR: INBOUND TRACKS DETECTED.')
    })
    t(1800, () => {
      setDefcon(3)
      beep(260, 0.3, 'square', 0.13)
      addLog('RETALIATORY LAUNCH DETECTED. 2,400 WARHEADS INBOUND.', true)
    })

    // Volleys of strikes both ways.
    const allStrikes: Strike[] = []
    let k = 0
    for (let i = 0; i < 9; i++) {
      const from = (i % 2 === 0 ? sources : targets)[k % 6]!
      const to = (i % 2 === 0 ? targets : sources)[(k + 2) % 6]!
      allStrikes.push({ from, to, at: 1400 + i * 650 })
      k++
    }
    allStrikes.forEach((s) => {
      t(s.at, () => {
        setArcs((a) => [...a, s])
        beep(900 - Math.random() * 300, 0.05, 'sawtooth', 0.03)
      })
      t(s.at + 520, () => {
        setHits((h) => new Set(h).add(s.to.name))
        thud()
        boardRef.current?.parentElement?.parentElement?.classList.add('shake')
        setTimeout(() => boardRef.current?.parentElement?.parentElement?.classList.remove('shake'), 500)
        addLog(`DETONATION: ${s.to.name}.`, true)
      })
    })

    t(5200, () => {
      setDefcon(2)
      beep(210, 0.32, 'square', 0.14)
    })
    t(6600, () => {
      setDefcon(1)
      siren()
      addLog('DEFCON 1. GENERAL NUCLEAR WAR IN PROGRESS.', true)
    })
    t(7600, () => addLog('WOPR HAS ASSUMED LAUNCH CONTROL. SIMULATING ALL REMAINING SCENARIOS...'))
    t(8600, () => onDone())

    return () => timers.forEach(clearTimeout)
  }, [side, onDone])

  return (
    <div className="wg-war">
      <div className={defcon <= 2 ? 'wg-defcon crit' : 'wg-defcon'}>
        <span>DEFCON</span>
        <b>{defcon}</b>
        <span className="wg-dim">GLOBAL THERMONUCLEAR WAR / SIMULATION</span>
      </div>
      <div className="wg-board" ref={boardRef}>
        {arcs.map((s, i) => {
          const dx = s.to.x - s.from.x
          const dy = s.to.y - s.from.y
          const len = Math.hypot(dx, dy)
          const ang = (Math.atan2(dy, dx) * 180) / Math.PI
          return (
            <div
              key={i}
              className="wg-arc"
              style={{
                left: `${s.from.x}%`,
                top: `${s.from.y}%`,
                width: `${len}%`,
                transform: `rotate(${ang}deg)`,
              }}
            />
          )
        })}
        {CITIES.map((c) => (
          <div
            key={c.name}
            className={hits.has(c.name) ? 'wg-city hit' : 'wg-city'}
            style={{ left: `${c.x}%`, top: `${c.y}%` }}
          >
            <span className="dot" />
            {c.name}
          </div>
        ))}
      </div>
      <div className="wg-log">
        {log.map((l, i) => (
          <span key={i} className={l.crit ? 'crit' : undefined}>
            {l.t}
          </span>
        ))}
      </div>
    </div>
  )
}

function randBoard(i: number): string[] {
  // A deterministic-ish full board of X/O for the montage flavor.
  const cells: string[] = []
  for (let n = 0; n < 9; n++) cells.push((i + n) % 3 === 0 ? 'X' : (i + n) % 3 === 1 ? 'O' : '')
  return cells
}

function Learn({ onDone }: { onDone: () => void }) {
  const [count, setCount] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const [line, setLine] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    let n = 0
    let delay = 150
    let stop = false
    const timers: ReturnType<typeof setTimeout>[] = []
    const run = (): void => {
      if (stop) return
      n += 1
      setCount(n)
      const scn = [
        'UNITED STATES FIRST STRIKE',
        'USSR FIRST STRIKE',
        'NATO / WARSAW PACT',
        'FAR EAST STRATEGIC EXCHANGE',
        'SURPRISE ATTACK',
        'MASS LAUNCH',
      ][n % 6]
      setLog((l) => [...l.slice(-6), `SCENARIO ${n}: ${scn}   WINNER: NONE`])
      beep(500 + (n % 7) * 60, 0.02, 'square', 0.02)
      if (n >= 42) {
        setLine(true)
        thud()
        timers.push(setTimeout(onDone, 4200))
        return
      }
      delay = Math.max(16, delay * 0.9)
      timers.push(setTimeout(run, delay))
    }
    timers.push(setTimeout(run, 400))
    return () => {
      stop = true
      timers.forEach(clearTimeout)
    }
  }, [onDone])

  return (
    <>
      <div className="wg-dim" style={{ marginBottom: '0.5rem' }}>
        WOPR LEARNING: {count} SIMULATIONS RUN
      </div>
      <div className="wg-learn">
        {Array.from({ length: Math.min(count, 48) }).map((_, i) => (
          <div className="wg-ttt" key={i}>
            {randBoard(i).map((c, j) => (
              <span key={j}>{c}</span>
            ))}
          </div>
        ))}
      </div>
      <div className="wg-log">
        {log.map((l, i) => (
          <span key={i} className="crit">
            {l}
          </span>
        ))}
      </div>
      {line && (
        <div className="wg-big wg-amber" style={{ marginTop: '0.8rem' }}>
          <Typer
            script={[seg('A STRANGE GAME.\nTHE ONLY WINNING MOVE IS NOT TO PLAY.')]}
            cps={20}
          />
        </div>
      )}
    </>
  )
}

function Ending({ onAgain }: { onAgain: () => void }) {
  const [done, setDone] = useState(false)
  return (
    <>
      <Typer
        script={[seg('\nHOW ABOUT A NICE GAME OF CHESS?\n', 'wg-big')]}
        cps={24}
        onDone={() => setDone(true)}
      />
      {done && (
        <div className="wg-opts">
          <button className="wg-opt" onClick={onAgain} autoFocus>
            &gt; SHALL WE PLAY A GAME?
          </button>
        </div>
      )}
    </>
  )
}
