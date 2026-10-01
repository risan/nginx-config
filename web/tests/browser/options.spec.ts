import { expect, test, type Locator, type Page } from '@playwright/test'

import { encodeShareHash, visibleOptions } from '../../src/lib/state.ts'
import { allStates } from '../option-states.ts'

const CONTROL =
  '[data-control] :is(input, button, [role="radio"], [role="switch"], [role="combobox"])'

async function expandAdvanced(page: Page) {
  const toggles = page.getByRole('button', { name: /^Show advanced/ })
  while ((await toggles.count()) > 0) {
    await toggles.first().click()
  }
}

const previewText = (page: Page) => page.locator('[data-testid="config-code"]:visible').innerText()

// Flips one toggle or select, proves the builder reacted (the preview changed, or the new
// combination is invalid and the error banner says so), then puts the choice back and
// proves the preview returns to what it was.
async function proveControlChangesOutput(page: Page, kind: string, key: string) {
  const row = page.locator(`#row-${key}`)
  await expect(row, `row ${key} should be visible before it is changed`).toBeVisible()
  const before = await previewText(page)
  const banner = page.getByText(/Fix \d+ errors? to update/)

  let undo: () => Promise<void>
  if (kind === 'toggle') {
    const control = row.getByRole('switch')
    await control.click()
    undo = () => control.click()
  } else {
    const radios = row.getByRole('radio')
    await expect(radios.or(row.getByRole('combobox')).first()).toBeVisible()
    if ((await radios.count()) > 0) {
      const original = row.locator('[role="radio"][data-state="on"]')
      const originalName = await original.innerText()
      await radios.locator('xpath=self::*[@data-state="off"]').first().click()
      undo = () => row.getByRole('radio', { name: originalName, exact: true }).click()
    } else {
      const combo = row.getByRole('combobox')
      const originalName = (await combo.innerText()).trim()
      await combo.click()
      await page.getByRole('option').filter({ hasNotText: originalName }).first().click()
      undo = async () => {
        await combo.click()
        await page.getByRole('option', { name: originalName, exact: true }).click()
      }
    }
  }

  await expect
    .poll(async () => (await previewText(page)) !== before || (await banner.isVisible()), {
      message: `changing ${key} did not change the preview or report an error`,
      timeout: 3000,
    })
    .toBe(true)

  await undo()
  await expect
    .poll(() => previewText(page), { message: `undoing ${key} did not restore the preview` })
    .toBe(before)
}

async function editControl(page: Page, kind: string, key: string) {
  const row = page.locator(`#row-${key}`)
  const control: Locator = row.locator(CONTROL).first()
  if (kind === 'text' || kind === 'number') {
    const value = kind === 'number' ? '7' : 'x'
    await control.fill(value)
    await expect(control).toHaveValue(value)

    return
  }

  const inputs = row.locator('input[type="text"], input:not([type])')
  const count = await inputs.count()
  await row.getByRole('button', { name: /^Add/ }).click()
  await expect(inputs).toHaveCount(count + 1)
}

test.describe('every option renders as a working control', () => {
  test.describe.configure({ mode: 'parallel', timeout: 120_000 })
  test.use({ actionTimeout: 5000 })

  for (const state of allStates()) {
    test(state.name, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') {
          errors.push(message.text())
        }
      })
      await page.goto(`/${encodeShareHash(state.options)}`)
      await expect(page.locator('[data-testid="config-code"]:visible')).toBeVisible()
      await expect(page.getByText(/Fix \d+ errors? to update/)).toHaveCount(0)
      await expandAdvanced(page)

      const visible = visibleOptions(state.options)
      await expect(page.locator('[id^="row-"]')).toHaveCount(visible.length)
      for (const def of visible) {
        const row = page.locator(`#row-${def.key}`)
        await expect(row).toBeVisible()
        await expect(row.locator(CONTROL).first()).toBeVisible()
      }

      // Selects and toggles first, one at a time with an undo, since either can hide rows.
      for (const def of visible.filter((d) => d.kind === 'toggle' || d.kind === 'select')) {
        await proveControlChangesOutput(page, def.kind, def.key)
      }

      // Text, numbers, and lists never hide another row, so they can follow in one pass.
      for (const def of visible.filter((d) =>
        ['text', 'number', 'list', 'upstreams'].includes(d.kind),
      )) {
        await editControl(page, def.kind, def.key)
      }
      expect(errors).toEqual([])
    })
  }
})
