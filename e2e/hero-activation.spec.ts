// Activation: a fresh load shows the operator station, and activating it reveals
// the SHALL WE PLAY A GAME menu with exactly the three mission rows and no fourth
// row. Mouse, Enter, and Space all activate; the mobile project adds tap.
import { test, expect } from '@playwright/test'
import { clearSaves } from './helpers/inject'

test.beforeEach(async ({ page }) => {
  await clearSaves(page)
})

test('fresh load shows the hero with the greeting and an activate affordance', async ({
  page,
}) => {
  await page.goto('./')
  const hero = page.getByTestId('hero-button')
  await expect(hero).toBeVisible()
  await expect(page.getByTestId('hero-greeting')).toContainText(
    'GREETINGS PROFESSOR FALKEN',
  )
})

test('activation reveals SHALL WE PLAY A GAME with exactly three rows, no fourth', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByTestId('hero-button').click()
  const menu = page.getByTestId('menu-screen')
  await expect(menu).toBeVisible()
  await expect(menu).toContainText('SHALL WE PLAY A GAME?')
  await expect(page.getByRole('menuitem', { name: /CRASH OUTLOOK/ })).toBeVisible()
  await expect(
    page.getByRole('menuitem', { name: /GROUND ALL FLIGHTS/ }),
  ).toBeVisible()
  await expect(
    page.getByRole('menuitem', { name: /FREEZE BANK ACCOUNTS/ }),
  ).toBeVisible()
  // The fourth row stays hidden until all three debriefs are acknowledged.
  await expect(page.getByRole('menuitem', { name: /GLOBAL FAILSAFE/ })).toHaveCount(
    0,
  )
})

test('Enter activates the terminal (keyboard entry)', async ({ page }) => {
  await page.goto('./')
  const hero = page.getByTestId('hero-button')
  await hero.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('menu-screen')).toBeVisible()
})

test('Space activates the terminal (keyboard entry)', async ({ page }) => {
  await page.goto('./')
  const hero = page.getByTestId('hero-button')
  await hero.focus()
  await page.keyboard.press('Space')
  await expect(page.getByTestId('menu-screen')).toBeVisible()
})
