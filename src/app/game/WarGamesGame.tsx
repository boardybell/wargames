// SHALL WE PLAY A GAME? A self-contained, playable WarGames tribute built on
// the terminal look and the WOPR hero art. Hero -> push-in -> WOPR boot -> the
// games list -> GLOBAL THERMONUCLEAR WAR (chess offer, pick a side) -> the
// open-ended Cold War command game (gtw/) -> when the player finally loses,
// WOPR runs every scenario and learns futility -> THE ONLY WINNING MOVE IS NOT
// TO PLAY -> a nice game of chess.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { bootApp } from '../boot'
import { gameFor } from './games/registry'
import './game.css'
import { beep, chime, ctx, enableSound, muteSound, saveSoundPref, soundPref, startAudio, thud } from './sound'
import { setMachineRoomLevel } from './machineRoom'
import { GlobalThermonuclearWar, loadSavedGame } from './gtw/GlobalThermonuclearWar'
import { dateLabel, sideName } from './gtw/engine'

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

/** The machine room on the hero. Plays straight away when the browser allows
 *  it; otherwise it starts on the visitor's first key press or tap, or from the
 *  SOUND switch in the corner (which does not activate the terminal). */
function HeroSound() {
  const [state, setState] = useState<'on' | 'off' | 'waiting'>(() =>
    soundPref() === 'off' ? 'off' : 'waiting',
  )

  useEffect(() => {
    if (state !== 'waiting') return
    const c = ctx()
    if (!c) return
    // Allowed already (a returning visitor, or a permissive browser)?
    if (c.state === 'running') {
      enableSound('hero')
      setState('on')
      return
    }
    const unlock = (e?: Event): void => {
      // A press on the SOUND switch is handled by the switch itself.
      const t = e?.target
      if (t instanceof Element && t.closest('.wg-hero-sound')) return
      if (soundPref() === 'off') return
      enableSound('hero')
      setState('on')
    }
    const opts = { capture: true, once: true } as const
    window.addEventListener('keydown', unlock, opts)
    window.addEventListener('pointerdown', unlock, opts)
    window.addEventListener('touchstart', unlock, opts)
    // Some browsers allow a resume without a gesture; try once.
    c.resume()
      .then(() => {
        if (c.state === 'running' && soundPref() !== 'off') unlock()
      })
      .catch(() => {})
    return () => {
      window.removeEventListener('keydown', unlock, opts)
      window.removeEventListener('pointerdown', unlock, opts)
      window.removeEventListener('touchstart', unlock, opts)
    }
  }, [state])

  const toggle = (e: React.SyntheticEvent): void => {
    // The whole hero is the ACTIVATE button; the switch must not trigger it.
    e.stopPropagation()
    if (state === 'on') {
      saveSoundPref('off')
      muteSound()
      setState('off')
    } else {
      saveSoundPref('on')
      enableSound('hero')
      setMachineRoomLevel('hero')
      setState('on')
    }
  }

  return (
    <button
      type="button"
      className={`wg-hero-sound ${state === 'on' ? 'on' : ''}`}
      onClick={toggle}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      aria-pressed={state === 'on'}
      data-testid="hero-sound"
    >
      SOUND {state === 'on' ? 'ON' : 'OFF'}
    </button>
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
  | 'campaign'
  | 'game'

const STAGES: readonly Stage[] = [
  'hero', 'boot', 'greeting', 'menu', 'chess', 'side', 'war', 'learn', 'end',
  'campaign', 'game',
]

/** Mounts the playable game chosen from LIST GAMES. Every entry except GLOBAL
 *  THERMONUCLEAR WAR (which launches the campaign) lands here. */
function GameHost({ id, onExit }: { id: string; onExit: () => void }) {
  const entry = gameFor(id)
  if (!entry) {
    return (
      <div className="wg-screen" data-testid="screen">
        <div className="wg-out">
          <div className="wg-dim">{id}: SIMULATION UNAVAILABLE.</div>
          <button className="wg-opt" onClick={onExit} autoFocus>
            BACK TO GAMES
          </button>
        </div>
      </div>
    )
  }
  const Game = entry.Component
  return <Game onExit={onExit} />
}

/** GLOBAL THERMONUCLEAR WAR launches the real campaign: the engine-driven
 *  CRASH OUTLOOK, GROUND ALL FLIGHTS, FREEZE BANK ACCOUNTS, and the GLOBAL
 *  FAILSAFE finale. The front end already played the WOPR boot, so the campaign
 *  skips its own hero and drops straight into SHALL WE PLAY A GAME. bootApp has
 *  engine init side effects, so it runs exactly once per mount. */
function Campaign() {
  const nodeRef = useRef<ReactNode | null>(null)
  if (nodeRef.current === null) nodeRef.current = bootApp({ skipHero: true })
  return (
    <div
      data-testid="campaign"
      style={{ position: 'fixed', inset: 0, zIndex: 10 }}
    >
      {nodeRef.current}
    </div>
  )
}
function initialStage(): Stage {
  if (typeof window === 'undefined') return 'hero'
  const q = new URLSearchParams(window.location.search).get('stage')
  return q && (STAGES as readonly string[]).includes(q) ? (q as Stage) : 'hero'
}

export function WarGamesGame() {
  const [stage, setStage] = useState<Stage>(initialStage)
  const [pushing, setPushing] = useState(false)
  const [gtwStart, setGtwStart] = useState<'US' | 'SU' | 'resume'>('US')
  const [game, setGame] = useState<string | null>(null)

  const pickGame = (g: string): void => {
    setGame(g)
    setStage('game')
  }

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
          <div className="wg-hero-frame">
            <img src="art/hero-desktop.jpg" alt="" />
            <WoprLights />
          </div>
          <div className="wg-hero-vignette" />
          <div className="wg-hero-prompt">ACTIVATE TERMINAL</div>
          <HeroSound />
        </div>
      )}

      {stage === 'campaign' && <Campaign />}

      {stage === 'game' && game && (
        <GameHost id={game} onExit={() => setStage('menu')} />
      )}

      {stage === 'war' && (
        <GlobalThermonuclearWar
          start={gtwStart}
          onDone={() => setStage('learn')}
          onExit={() => setStage('menu')}
        />
      )}

      {stage !== 'hero' && stage !== 'campaign' && stage !== 'game' && stage !== 'war' && (
        <Screen
          stage={stage}
          onStage={setStage}
          onGtw={(g) => {
            setGtwStart(g)
            setStage('war')
          }}
          onPickGame={pickGame}
        />
      )}
    </div>
  )
}

function Screen({
  stage,
  onStage,
  onGtw,
  onPickGame,
}: {
  stage: Stage
  onStage: (s: Stage) => void
  onGtw: (start: 'US' | 'SU' | 'resume') => void
  onPickGame: (g: string) => void
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
        {stage === 'menu' && (
          <Menu
            onPick={(g) =>
              g === 'GLOBAL THERMONUCLEAR WAR' ? onStage('chess') : onPickGame(g)
            }
          />
        )}
        {stage === 'chess' && <Chess onLater={() => onStage('side')} onChess={() => onPickGame('CHESS')} />}
        {stage === 'side' && <SidePick onPick={onGtw} />}

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

function SidePick({ onPick }: { onPick: (s: 'US' | 'SU' | 'resume') => void }) {
  const [done, setDone] = useState(false)
  const saved = useMemo(() => loadSavedGame(), [])
  return (
    <>
      <Typer
        script={[
          seg('FINE.\n\n'),
          seg('WHICH SIDE DO YOU WANT?\n\n'),
          seg('  1.  UNITED STATES\n', 'wg-dim'),
          seg('  2.  SOVIET UNION\n', 'wg-dim'),
        ]}
        cps={48}
        onDone={() => setDone(true)}
      />
      {done && (
        <div className="wg-opts">
          {saved && (
            <button className="wg-opt wg-amber" onClick={() => onPick('resume')} autoFocus>
              &gt; RESUME COMMAND: {sideName(saved.player)}, {dateLabel(saved)}
            </button>
          )}
          <button className="wg-opt" onClick={() => onPick('US')} autoFocus={!saved}>
            &gt; UNITED STATES{saved ? ' (NEW GAME)' : ''}
          </button>
          <button className="wg-opt" onClick={() => onPick('SU')}>
            &gt; SOVIET UNION{saved ? ' (NEW GAME)' : ''}
          </button>
        </div>
      )}
    </>
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
