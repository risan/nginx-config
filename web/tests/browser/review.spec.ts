import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { defaultsFor } from '../../src/lib/engine.ts'
import { encodeShareHash } from '../../src/lib/state.ts'

const code = (page: Page) => page.locator('[data-testid="config-code"]:visible')
const banner = (page: Page) => page.getByText(/Fix \d+ errors? to update/)

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

async function useProxy(page: Page) {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Reverse proxy' }).click()
}

test.describe('domain-dependent defaults', () => {
  test('certificate paths follow the domain until they are edited', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('combobox', { name: 'HTTPS' }).click()
    await page.getByRole('option', { name: 'My own certificate files' }).click()
    await page.getByRole('textbox', { name: 'Domain name' }).fill('app.example.com')

    await expect(code(page)).toContainText(
      'ssl_certificate /etc/letsencrypt/live/app.example.com/fullchain.pem;',
    )
    await expect(page.getByRole('textbox', { name: 'Certificate file' })).toHaveValue(
      '/etc/letsencrypt/live/app.example.com/fullchain.pem',
    )

    await page.getByRole('textbox', { name: 'Certificate file' }).fill('/srv/tls/cert.pem')
    await page.getByRole('textbox', { name: 'Domain name' }).fill('other.example.com')

    await expect(code(page)).toContainText('ssl_certificate /srv/tls/cert.pem;')
    await expect(code(page)).toContainText(
      'ssl_certificate_key /etc/letsencrypt/live/other.example.com/privkey.pem;',
    )
  })

  test('the files folder follows the target', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('radio', { name: 'Container' }).click()

    await expect(page.getByRole('textbox', { name: 'Files folder' })).toHaveValue(
      '/usr/share/nginx/html',
    )
  })

  test('a share link keeps derived paths following the domain', async ({ page }) => {
    const options = defaultsFor('static', 'host')
    Object.assign(options, { serverName: 'shared.example.com', https: 'manual' })
    await page.goto(`/${encodeShareHash(options, new Set(['serverName', 'https']))}`)

    await expect(page.getByRole('textbox', { name: 'Certificate file' })).toHaveValue(
      '/etc/letsencrypt/live/shared.example.com/fullchain.pem',
    )
  })
})

test.describe('errors', () => {
  test('a list item error shows beside the item, lights the dot, and its link focuses it', async ({
    page,
  }) => {
    await useProxy(page)
    await page.getByRole('button', { name: 'Add Backend servers' }).click()

    const item = page.locator('#row-upstreams [data-item="1"]')
    await expect(item.getByRole('alert')).toBeVisible()
    await expect(item.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
    await expect(banner(page)).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: 'Section navigation' }).getByRole('img', {
        name: 'has errors',
      }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Backend servers 2', exact: true }).click()

    await expect(item.getByRole('textbox')).toBeFocused()
  })

  test('immutable path and trusted proxy item errors show beside their items', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Add Cache forever under these paths' }).click()
    await page.getByRole('textbox', { name: 'Cache forever under these paths 1' }).fill('nope')

    await expect(
      page.locator('#row-immutablePaths [data-item="0"]').getByRole('alert'),
    ).toBeVisible()

    await page.getByRole('combobox', { name: 'Behind a CDN or load balancer?' }).click()
    await page.getByRole('option', { name: 'Another proxy or load balancer' }).first().click()
    await page.getByRole('button', { name: 'Add Trusted proxy addresses' }).click()
    await page.getByRole('textbox', { name: 'Trusted proxy addresses 1' }).fill('bad')

    await expect(
      page.locator('#row-trustedProxies [data-item="0"]').getByRole('alert'),
    ).toBeVisible()
  })

  test('a hidden invalid field does not block copy', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('combobox', { name: 'HTTPS' }).click()
    await page.getByRole('option', { name: /Automatic/ }).click()
    await page.getByRole('textbox', { name: 'Contact email' }).fill('bad')
    await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeDisabled()

    await page.getByRole('combobox', { name: 'HTTPS' }).click()
    await page.getByRole('option', { name: /Off/ }).click()

    await expect(banner(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled()
  })

  test('a stale balancing method does not block once an upstream is removed', async ({ page }) => {
    await useProxy(page)
    await page.getByRole('button', { name: 'Add Backend servers' }).click()
    await page.getByRole('textbox', { name: 'Backend servers 2 address' }).fill('127.0.0.1:3001')
    await page.getByRole('combobox', { name: 'Balancing method' }).click()
    await page.getByRole('option', { name: /least/i }).click()
    await expect(banner(page)).toHaveCount(0)

    await page.getByRole('button', { name: 'Remove Backend servers 2' }).click()

    await expect(banner(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled()
  })
})

test.describe('share link size', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('refuses a link the app could not read back, with an actionable message', async ({
    page,
  }) => {
    await page.goto('/')
    const toggles = page.getByRole('button', { name: /^Show advanced/ })
    while ((await toggles.count()) > 0) {
      await toggles.first().click()
    }
    await page
      .getByRole('textbox', { name: 'Content-Security-Policy' })
      .fill(`default-src ${'a'.repeat(17_000)}`)

    await page.getByRole('button', { name: 'Share' }).click()

    await expect(page.getByText(/too large for a share link/)).toBeVisible()
    await expect(page.getByText(/download the config instead/i)).toBeVisible()
    expect(page.url()).not.toContain('#c=')
  })

  test('copies a link for a normal configuration', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Share' }).click()

    await expect(page.getByText('Copied to clipboard')).toBeVisible()
    expect(page.url()).toContain('#c=')
  })
})

test.describe('changed-line markers', () => {
  test('an edit followed at once by a preset switch leaves no stuck marker', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('textbox', { name: 'Domain name' }).fill('marker.example.com')
    await expect(page.locator('.code-line.is-changed').first()).toBeVisible()

    await page.getByRole('radio', { name: 'Reverse proxy' }).click()

    await expect(code(page)).toContainText('proxy_pass')
    await page.waitForTimeout(2200)
    await expect(page.locator('.code-line.is-changed')).toHaveCount(0)
  })
})

test.describe('mobile preview sheet', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    permissions: ['clipboard-read', 'clipboard-write'],
  })

  async function openSheet(page: Page) {
    await page.goto('/')
    await page.getByRole('button', { name: /Preview nginx\.conf/ }).click()

    return page.getByRole('dialog')
  }

  test('every toolbar action fits the viewport and works', async ({ page }) => {
    const dialog = await openSheet(page)
    const actions = ['Wrap', 'Copy', 'Download', 'Share']

    for (const name of actions) {
      const button = dialog.getByRole('button', { name, exact: true })
      await expect(button).toBeVisible()
      const box = await button.boundingBox()
      expect(box?.x, name).toBeGreaterThanOrEqual(0)
      expect((box?.x ?? 0) + (box?.width ?? 0), name).toBeLessThanOrEqual(390)
    }

    await dialog.getByRole('button', { name: 'Wrap', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Wrap', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    await dialog.getByRole('button', { name: 'Copy', exact: true }).click()
    await expect(page.getByText('Copied to clipboard')).toBeVisible()

    const download = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Download' }).click()
    expect((await download).suggestedFilename()).toBe('nginx.conf')

    await dialog.getByRole('button', { name: 'Share' }).click()
    await expect(page).toHaveURL(/#c=/)
  })

  test('the sheet has no shadow', async ({ page }) => {
    const dialog = await openSheet(page)

    await expect(dialog).toHaveCSS('box-shadow', 'none')
  })

  test('has no accessibility violations with the sheet open', async ({ page }) => {
    await openSheet(page)
    await page.getByRole('dialog').getByRole('button', { name: 'Share' }).waitFor()

    const { violations } = await new AxeBuilder({ page }).analyze()
    const blocking = violations.filter((v) =>
      ['moderate', 'serious', 'critical'].includes(v.impact ?? ''),
    )

    expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`)).toEqual([])
  })
})

test.describe('accessibility beyond the home page', () => {
  async function expectNoViolations(page: Page) {
    const { violations } = await new AxeBuilder({ page }).analyze()
    const blocking = violations.filter((v) =>
      ['moderate', 'serious', 'critical'].includes(v.impact ?? ''),
    )

    expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`)).toEqual([])
  }

  for (const scheme of ['light', 'dark'] as const) {
    test(`docs pages (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      for (const path of ['/docs/', '/docs/security/', '/docs/tuning/']) {
        await page.goto(path)
        await expect(page.getByRole('main')).toBeVisible()
        await expectNoViolations(page)
      }
    })

    test(`a validation error state (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/')
      await page.getByRole('textbox', { name: 'Domain name' }).fill('not a domain')
      await expect(banner(page)).toBeVisible()

      await expectNoViolations(page)
    })
  }
})

test.describe('security policy and styling', () => {
  test('docs and the builder run without CSP errors', async ({ page }) => {
    const errors = trackConsoleErrors(page)
    await page.goto('/docs/security/')
    await expect(page.getByRole('main')).toBeVisible()
    await page.goto('/')
    await page.getByRole('combobox', { name: 'HTTPS' }).click()
    await page.getByRole('option', { name: /Automatic/ }).click()
    await page.getByRole('button', { name: 'Share' }).click()
    await expect(page.getByText(/Copied|Copy failed/)).toBeVisible()

    expect(errors).toEqual([])
  })

  test('the CSP meta policy hashes style elements and limits inline to attributes', async ({
    page,
  }) => {
    await page.goto('/')
    const policy = await page
      .locator('meta[http-equiv="content-security-policy"]')
      .getAttribute('content')

    expect(policy).toMatch(/style-src-elem 'self' 'sha256-/)
    expect(policy).toMatch(/style-src-attr 'unsafe-inline'/)
    expect(policy).not.toMatch(/style-src 'self' 'unsafe-inline'/)
    expect(policy).not.toMatch(/style-src-elem[^;]*'unsafe-inline'/)
  })

  test('select popovers use at most a faint shadow', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('combobox', { name: 'HTTPS' }).click()

    const shadow = await page
      .locator('[data-slot="select-content"]')
      .evaluate((el) => getComputedStyle(el).boxShadow)

    expect(shadow === 'none' || /0px 1px 2px/.test(shadow)).toBe(true)
  })
})
