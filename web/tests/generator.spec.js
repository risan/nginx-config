import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test.describe('Nginx Config Builder', () => {
  test('renders, switches profiles, validates input, and downloads the renderer output', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.code-frame code')).toContainText('worker_processes auto;')

    await page.locator('#profile-proxy').check()
    await expect(page.locator('#field-upstream')).toBeVisible()
    await expect(page.locator('#field-documentRoot')).toBeHidden()
    await expect(page.locator('.code-frame code')).toContainText('proxy_pass http://backend;')

    await page.locator('#field-serverName').fill('bad;return 444;')
    await expect(page.locator('.validation-box')).toContainText('Server name')
    await expect(page.locator('.primary-button')).toBeDisabled()

    await page.locator('#field-serverName').fill('api.example.com')
    await expect(page.locator('.primary-button')).toBeEnabled()
    const codeFrame = page.locator('.code-frame')
    expect(await codeFrame.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
    await codeFrame.evaluate((element) => { element.scrollTop = element.scrollHeight })
    await expect(page.locator('.export-actions-top .primary-button')).toBeVisible()
    const preview = (await page.locator('.code-frame code').textContent()).trimEnd()
    const downloadPromise = page.waitForEvent('download')
    await page.locator('.export-actions-top .primary-button').click()
    const download = await downloadPromise
    const downloadPath = await download.path()
    expect(downloadPath).toBeTruthy()
    expect((await readFile(downloadPath, 'utf8')).trimEnd()).toBe(preview)
  })

  test('keeps a narrow viewport usable and protects TLS/cache dependencies', async ({ page }) => {
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto('/')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }

    await page.setViewportSize({ width: 375, height: 1000 })
    await page.goto('/')
    await expect(page.locator('#toggle-hsts')).toBeDisabled()

    await page.locator('#profile-proxy').check()
    await page.locator('#toggle-proxyCache').check()
    await expect(page.locator('#toggle-streaming')).toBeDisabled()
    await page.locator('#toggle-proxyCache').uncheck()
    await page.locator('#toggle-streaming').check()
    await expect(page.locator('#toggle-proxyCache')).toBeDisabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})
