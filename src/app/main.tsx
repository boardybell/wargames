// The only side-effectful module: it mounts the app into #root. A bare load
// boots the WarGamesGame front end (the WOPR hero, the full LIST GAMES, the war
// board) exactly as the github version does. The deeper engine-driven campaign
// (bootApp(), src/app/boot) is reachable behind ?engine while it is wired in
// behind the game list rather than replacing it.
import { StrictMode } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { bootApp } from './boot'
import { WarGamesGame } from './game/WarGamesGame'
import { initTheme } from './theme'
import './theme/theme.css'

/** A bare load boots the WarGamesGame front end (WOPR + full game list). The
 *  engine-driven deep campaign is opt-in behind ?engine until it is integrated
 *  behind the game list. */
function isEngineRequested(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('engine')
  } catch {
    return false
  }
}

const container = document.getElementById('root')
if (!container) {
  // A missing #root means a broken index.html; fail loud, not with a blank
  // page and no signal.
  throw new Error('shell: #root element not found')
}
// Publish palette tokens as CSS custom properties and inject the font faces.
initTheme()
const tree: ReactNode = isEngineRequested() ? bootApp() : <WarGamesGame />
createRoot(container).render(<StrictMode>{tree}</StrictMode>)
