// Subpath assets: every script, style, image, font, and audio URL the app
// requests across load, activation, and a mission start must begin with the
// /wargames/ base. No raw root-absolute asset path may appear, or the site would
// 404 its assets when deployed under the project subpath.
//
// Note for maintainers: base "/" also builds (the root-domain case is a one-line
// VITE_BASE change documented in the README). CI builds with VITE_BASE set to
// /<repo>/ so this assertion matches the deployed artifact.
import { test, expect } from '@playwright/test'
import { PREVIEW_PORT } from '../scripts/preview-port.mjs'
import { clearSaves } from './helpers/inject'
import { activate, gotoApp, startMission } from './helpers/play'

const T0 = 1_700_000_000_000
const ASSET_RE = /\.(js|mjs|css|png|jpe?g|webp|svg|woff2?|ttf|otf|mp3|ogg|wav|m4a)(\?|$)/i

test('every same-origin asset request stays under /wargames/', async ({
  page,
}) => {
  await page.clock.install({ time: T0 })
  await clearSaves(page)

  const offenders: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    // Only same-origin requests are our assets; ignore cross-origin.
    if (url.origin !== `http://localhost:${PREVIEW_PORT}`) return
    if (!ASSET_RE.test(url.pathname)) return
    if (!url.pathname.startsWith('/wargames/')) {
      offenders.push(url.pathname)
    }
  })

  await gotoApp(page)
  await activate(page)
  await startMission(page, 'outlook')
  // Let any lazy mission assets request.
  await page.waitForTimeout(300)

  expect(
    offenders,
    `assets escaped the /wargames/ base: ${offenders.join(', ')}`,
  ).toEqual([])
})
