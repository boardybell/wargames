// Screenshot LIST GAMES entries at desktop and phone size for design review.
// usage: node scripts/shoot-games.mjs <baseUrl> <outDir> [slug,slug...]
// Needs a running server (npm run dev / preview). Not part of the test suite.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const GAMES = {
  'falkens-maze': 'FALKENS MAZE',
  blackjack: 'BLACK JACK',
  'gin-rummy': 'GIN RUMMY',
  hearts: 'HEARTS',
  bridge: 'BRIDGE',
  checkers: 'CHECKERS',
  chess: 'CHESS',
  poker: 'POKER',
  'fighter-combat': 'FIGHTER COMBAT',
  'guerrilla-engagement': 'GUERRILLA ENGAGEMENT',
  'desert-warfare': 'DESERT WARFARE',
  'air-to-ground': 'AIR-TO-GROUND ACTIONS',
  'theaterwide-tactical': 'THEATERWIDE TACTICAL WARFARE',
  'theaterwide-biochem': 'THEATERWIDE BIOTOXIC AND CHEMICAL WARFARE',
}
const [base = 'http://localhost:5173/', out = 'visuals/games-v2', only] = process.argv.slice(2)
const slugs = only ? only.split(',') : Object.keys(GAMES)
mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
for (const [tag, vp] of [
  ['d', { width: 1440, height: 900 }],
  ['m', { width: 390, height: 844 }],
]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: tag === 'm' ? 2 : 1 })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  for (const slug of slugs) {
    await page.goto(new URL('./?stage=menu', base).href)
    await page.getByTestId('games').waitFor({ timeout: 15000 })
    await page.getByRole('button', { name: GAMES[slug], exact: true }).click()
    const root = page.getByTestId(`game-${slug}`)
    await root.waitFor({ timeout: 10000 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${out}/${slug}-${tag}-1.png`, fullPage: false })
    // A second, more advanced state: click the primary action if there is one.
    const primary = root.locator('.gs-primary:not(:disabled)').first()
    if (await primary.count()) await primary.click().catch(() => {})
    else {
      const cell = root.locator('[role="gridcell"]').first()
      if (await cell.count()) await cell.click().catch(() => {})
    }
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${out}/${slug}-${tag}-2.png`, fullPage: true })
  }
  if (errors.length) console.log(tag, 'ERRORS', errors)
  await ctx.close()
}
await browser.close()
console.log('shots in', out)
