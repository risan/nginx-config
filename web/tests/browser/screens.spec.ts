import { test } from '@playwright/test'

// Review screenshots, not assertions. Run with SCREENS=1; output stays in test-results/.
test.skip(process.env.SCREENS !== '1', 'set SCREENS=1 to capture review screenshots')

const sizes = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1100', width: 1100, height: 800 },
  { name: '390', width: 390, height: 844 },
]

for (const size of sizes) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`screenshot ${size.name} ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height })
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/')
      await page.getByRole('radio', { name: 'Reverse proxy' }).click()
      await page.getByRole('radio', { name: 'Built-in ACME' }).click()
      await page.waitForTimeout(3000)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: `test-results/screens/${size.name}-${scheme}.png` })
      if (size.name === '1440') {
        await page.screenshot({
          path: `test-results/screens/${size.name}-${scheme}-full.png`,
          fullPage: true,
        })
      }
    })
  }
}
