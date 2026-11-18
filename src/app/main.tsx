// The only side-effectful module: mounts the App into #root. Everything
// else in src/app is pure or render-pure so the shell stays testable.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initTheme } from './theme'
import './theme/theme.css'

const container = document.getElementById('root')
if (!container) {
  // A missing #root means a broken index.html; fail loud, not with a blank
  // page and no signal.
  throw new Error('shell: #root element not found')
}
// Publish palette tokens as CSS custom properties and inject the font faces.
initTheme()
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
