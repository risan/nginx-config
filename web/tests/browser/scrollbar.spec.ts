import { expect, test, type Page } from '@playwright/test'

// Headless Chromium hides scrollbars by default. With them hidden the measured scrollbar
// width is 0, and scroll locking injects different CSS than on desktop browsers that
// show a classic scrollbar.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

const SCROLLBAR = 'html::-webkit-scrollbar { width: 15px; } html { overflow-y: scroll; }'

const scrollbarWidth = (page: Page) =>
  page.evaluate(() => window.innerWidth - document.documentElement.clientWidth)

test('opening a select and the mobile sheet with a real scrollbar raises no CSP errors', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/')
  await page.addStyleTag({ content: SCROLLBAR })
  expect(await scrollbarWidth(page)).toBeGreaterThan(0)

  await page.getByRole('combobox', { name: 'HTTPS' }).click()
  await expect(page.getByRole('option', { name: /Automatic/ })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await scrollbarWidth(page)).toBeGreaterThan(0)
  await page.getByRole('button', { name: /Preview nginx\.conf/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(errors).toEqual([])
})
