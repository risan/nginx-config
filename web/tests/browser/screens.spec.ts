import { test } from '@playwright/test'

import { defaultsFor } from '../../src/lib/engine.ts'
import { encodeShareHash } from '../../src/lib/state.ts'

// Review screenshots, not assertions. Run with SCREENS=1; output stays in test-results/.
test.skip(process.env.SCREENS !== '1', 'set SCREENS=1 to capture review screenshots')

const acmeProxy = defaultsFor('proxy', 'container')
Object.assign(acmeProxy, {
  https: 'acme',
  acmeEmail: 'admin@example.com',
  http3: true,
  websocketPath: '/ws/',
})

const scenarios = [
  { name: 'static-host', options: defaultsFor('static', 'host') },
  { name: 'proxy-container-acme-h3', options: acmeProxy },
  { name: 'php-host', options: defaultsFor('php', 'host') },
]
const sizes = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
]

for (const scenario of scenarios) {
  for (const size of sizes) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`${scenario.name} ${size.name} ${scheme}`, async ({ page }) => {
        await page.setViewportSize({ width: size.width, height: size.height })
        await page.emulateMedia({ colorScheme: scheme })
        await page.goto(`/${encodeShareHash(scenario.options)}`)
        await page.waitForTimeout(800)
        await page.screenshot({
          path: `test-results/screens/${scenario.name}-${size.name}-${scheme}.png`,
        })
        if (size.name === '1440' && scheme === 'light') {
          await page.screenshot({
            path: `test-results/screens/${scenario.name}-${size.name}-full.png`,
            fullPage: true,
          })
        }
      })
    }
  }
}
