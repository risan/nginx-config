import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { OPTIONS } from '../../src/lib/engine.ts'

const code = (page: Page) => page.locator('[data-testid="config-code"]:visible')

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  page.on('pageerror', (error) => errors.push(error.message))

  return errors
}

async function chooseHttps(page: Page, label: string) {
  await page.getByRole('combobox', { name: 'HTTPS' }).click()
  await page.getByRole('option', { name: label }).click()
}

test.describe('builder', () => {
  test('acme with HTTP/3 renders the directives the plan requires', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('radio', { name: 'Reverse proxy' }).click()
    await chooseHttps(page, 'Automatic (NGINX ACME module)')
    await page.getByRole('textbox', { name: 'Contact email' }).fill('admin@example.com')
    await page.getByRole('switch', { name: 'HTTP/3 (QUIC)' }).click()

    for (const directive of [
      'http2 on;',
      'ssl_reject_handshake on;',
      'return 308 https://example.com',
      'add_header_inherit merge;',
      'acme_certificate letsencrypt;',
      'quic_retry on;',
    ]) {
      await expect(code(page)).toContainText(directive)
    }
    await expect(page.getByRole('tab', { name: /Warnings \([1-9]/ })).toBeVisible()
  })

  test('marks changed lines after an edit, then fades the marker', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.code-line.is-changed')).toHaveCount(0)

    await page.getByRole('textbox', { name: 'Domain name' }).fill('changed.example.com')

    await expect(page.locator('.code-line.is-changed').first()).toBeVisible()
    await expect(page.locator('.code-line.is-changed')).toHaveCount(0, { timeout: 4000 })
  })

  test('does not mark lines when a share link is restored', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('radio', { name: 'Reverse proxy' }).click()
    await page.getByRole('button', { name: 'Share' }).click()
    const link = page.url()
    await page.goto('/')
    await page.goto(link)
    await page.reload()

    await expect(page.locator('[data-testid="config-code"]:visible')).toContainText('proxy_pass')
    await expect(page.locator('.code-line.is-changed')).toHaveCount(0)
  })

  test('deploy and warnings tabs show real content', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('tab', { name: 'Deploy' }).click()
    await expect(page.getByText('Test the config')).toBeVisible()

    await page.getByRole('tab', { name: /Warnings/ }).click()
    await expect(page.getByRole('tabpanel').getByRole('button', { name: /IPv6/ })).toBeVisible()
  })

  test('loads without console errors and shows a config', async ({ page }) => {
    const errors = trackConsoleErrors(page)
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(code(page)).toContainText('server_name example.com;')
    expect(errors).toEqual([])
  })

  test('runs under the production CSP headers and meta policy', async ({ page }) => {
    const errors = trackConsoleErrors(page)
    const response = await page.goto('/')
    const header = response?.headers()['content-security-policy'] ?? ''

    expect(header).toContain("frame-ancestors 'none'")
    expect(header).not.toContain('script-src')
    await expect(page.locator('meta[http-equiv="content-security-policy"]')).toHaveAttribute(
      'content',
      /script-src 'self' 'sha256-/,
    )

    await page.getByRole('radio', { name: 'PHP' }).click()
    await expect(code(page)).toContainText('fastcgi_pass')
    await page.getByRole('button', { name: /switch to dark theme/i }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    expect(errors).toEqual([])
  })

  test('switching profile changes the preview', async ({ page }) => {
    await page.goto('/')
    await expect(code(page)).toContainText('try_files $uri $uri/ =404;')

    await page.getByRole('radio', { name: 'Reverse proxy' }).click()
    await expect(code(page)).toContainText('proxy_pass http://backend;')

    await page.getByRole('radio', { name: 'PHP' }).click()
    await expect(code(page)).toContainText('fastcgi_pass')
  })

  test('switching target changes the preview and keeps edits', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('textbox', { name: 'Domain name' }).fill('keep.example.com')
    await page.getByRole('radio', { name: 'Container' }).click()

    await expect(code(page)).toContainText('listen 8080;')
    await expect(code(page)).toContainText('server_name keep.example.com;')
  })

  test('toggling an option changes the preview', async ({ page }) => {
    await page.goto('/')
    await expect(code(page)).toContainText('gzip on;')

    await page.getByRole('switch', { name: 'Compress responses (gzip)' }).click()

    await expect(code(page)).not.toContainText('gzip on;')
  })

  test('options that depend on another option appear and disappear', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('textbox', { name: 'Contact email' })).toHaveCount(0)

    await chooseHttps(page, 'Automatic (NGINX ACME module)')

    await expect(page.getByRole('textbox', { name: 'Contact email' })).toBeVisible()
  })

  test('advanced options sit behind a per-section toggle', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('spinbutton', { name: 'gzip level' })).toHaveCount(0)

    await page
      .getByRole('button', { name: /show advanced/i })
      .first()
      .click()

    await expect(page.getByRole('spinbutton', { name: 'gzip level' })).toBeVisible()
  })

  test('an invalid value shows an error and blocks copy and download', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('textbox', { name: 'Domain name' }).fill('not a domain')

    await expect(page.getByRole('alert').filter({ hasText: 'domain name' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Download' })).toBeDisabled()
    await expect(page.getByText(/Fix 1 error to update/)).toBeVisible()
    await expect(code(page)).toContainText('server_name example.com;')

    await page.getByRole('button', { name: 'Domain name', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Domain name' })).toBeFocused()

    await page.getByRole('textbox', { name: 'Domain name' }).fill('fixed.example.com')
    await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled()
    await expect(code(page)).toContainText('server_name fixed.example.com;')
  })

  test('a share link restores the state in a fresh page', async ({ page, context, browser }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/')
    await page.getByRole('radio', { name: 'Reverse proxy' }).click()
    await page.getByRole('textbox', { name: 'Domain name' }).fill('shared.example.com')
    await page.getByRole('button', { name: 'Share' }).click()
    await expect(page).toHaveURL(/#c=/)
    const link = page.url()

    const fresh = await browser.newPage()
    await fresh.goto(link)

    await expect(fresh.getByRole('radio', { name: 'Reverse proxy' })).toHaveAttribute(
      'data-state',
      'on',
    )
    await expect(fresh.getByRole('textbox', { name: 'Domain name' })).toHaveValue(
      'shared.example.com',
    )
    await expect(fresh.locator('[data-testid="config-code"]:visible')).toContainText(
      'server_name shared.example.com;',
    )
    await fresh.close()
  })

  test('the theme toggle switches and remembers the theme', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /switch to dark theme/i }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)

    await page.reload()

    await expect(page.locator('html')).toHaveClass(/dark/)
  })

  test('has no serious accessibility violations in light and dark', async ({ page }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/')
      await expect(code(page)).toBeVisible()

      const { violations } = await new AxeBuilder({ page }).analyze()
      const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')

      expect(
        blocking.map((v) => `${scheme}: ${v.id} (${v.nodes.map((n) => n.target).join(' | ')})`),
      ).toEqual([])
    }
  })
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the bottom bar opens the preview in a sheet', async ({ page }) => {
    await page.goto('/')
    await expect(code(page)).toHaveCount(0)

    await page.getByRole('button', { name: /Preview nginx\.conf/ }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('[data-testid="config-code"]')).toContainText('server_name')
  })

  test('control strip and section tabs fit inside the viewport', async ({ page }) => {
    await page.goto('/')
    const width = page.viewportSize()?.width ?? 0
    const targets = [
      page.getByRole('radiogroup', { name: 'What are you serving?' }),
      page.getByRole('radiogroup', { name: 'Where does it run?' }),
      ...(await page.getByRole('navigation', { name: 'Sections' }).getByRole('link').all()),
    ]

    for (const target of targets) {
      const box = await target.boundingBox()
      expect(box).not.toBeNull()
      expect(box?.x).toBeGreaterThanOrEqual(0)
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width)
    }
    await expect(page.getByRole('radio', { name: 'Server / VM' })).toBeInViewport({ ratio: 1 })
  })

  test('has no horizontal page scroll', async ({ page }) => {
    await page.goto('/')

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )

    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test.describe('static pages', () => {
  test('docs render with rewritten links', async ({ page }) => {
    await page.goto('/docs/')
    await page
      .getByRole('link', { name: /Security guide/ })
      .first()
      .click()

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('article a[href$=".md"]')).toHaveCount(0)
  })

  test('unknown routes serve the 404 page', async ({ page }) => {
    const response = await page.goto('/nope/')

    expect(response?.status()).toBe(404)
  })

  test('home page has SEO metadata', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://nginx-config.risanb.com/',
    )
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /nginx\.conf/)
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'What each option does' })).toBeVisible()
    await expect(page.locator('#reference ~ div dt')).toHaveCount(OPTIONS.length)
  })
})
