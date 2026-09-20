import { defineConfig } from '@playwright/test'

const playwrightPort = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? '4173', 10)

if (!Number.isInteger(playwrightPort) || playwrightPort < 1 || playwrightPort > 65535) {
  throw new Error('PLAYWRIGHT_PORT must be an integer between 1 and 65535.')
}

const playwrightBaseURL = `http://127.0.0.1:${playwrightPort}`

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: playwrightBaseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${playwrightPort} --strictPort`,
    url: playwrightBaseURL,
    // CI and local checks must target this app. Opt into reuse explicitly when
    // a developer has already started the matching Vite server on this port.
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_EXISTING === 'true',
  },
})
