// The browser-level verification matrix config. It serves the PRODUCTION build
// under the /wargames/ base (the real deployed artifact, not a test-mode build)
// and runs every spec against it at a desktop and a mobile viewport. The preview
// port lives in exactly one place: scripts/preview-port.mjs, owned by section 01
// and imported here so nothing hardcodes 4173 twice.
//
// webkit is listed but excluded from the default run (gate it behind PW_WEBKIT=1);
// it is the documented local manual pass. No em-dashes anywhere.
import { defineConfig, devices } from '@playwright/test'
import { PREVIEW_PORT } from './scripts/preview-port.mjs'

const BASE_URL = `http://localhost:${PREVIEW_PORT}/wargames/`

const projects = [
  {
    name: 'chromium-desktop',
    use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    // Every spec except the mobile-only one.
    testIgnore: /mobile\.spec\.ts/,
  },
  {
    name: 'chromium-mobile',
    use: {
      ...devices['Pixel 5'],
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    },
    // The mobile suite plus the tap cases of hero-activation and glossary.
    testMatch: /(mobile|hero-activation|glossary)\.spec\.ts/,
  },
]

if (process.env.PW_WEBKIT === '1') {
  projects.push({
    name: 'webkit',
    // webkit uses its own device descriptor; the manual local pass only.
    use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } },
    testIgnore: /mobile\.spec\.ts/,
  })
}

export default defineConfig({
  testDir: './e2e',
  // The matrix drives real engine countdowns via page.clock; give each spec
  // generous headroom. The keyboard-campaign spec raises its own further.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects,
  webServer: {
    // Build the production bundle under the subpath, then serve it with the
    // single shared port. reuseExistingServer locally so a preview already on
    // 4173 is reused rather than rebuilt.
    command: `VITE_BASE=/wargames/ npm run build && npm run preview -- --port ${PREVIEW_PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
