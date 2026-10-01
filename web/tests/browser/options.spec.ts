import { expect, test, type Page } from '@playwright/test'

import { OPTIONS } from '../../src/lib/engine.ts'
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

// Each option is exercised once with a real interaction that proves the control is wired.
async function exercise(page: Page, kind: string, key: string) {
  const row = page.locator(`#row-${key}`)
  const control = row.locator(CONTROL).first()
  switch (kind) {
    case 'toggle': {
      const before = await control.getAttribute('aria-checked')
      await control.click()
      await expect(control).not.toHaveAttribute('aria-checked', before ?? '')
      break
    }
    case 'text':
    case 'number': {
      await control.fill(kind === 'number' ? '7' : 'x')
      await expect(control).toHaveValue(kind === 'number' ? '7' : 'x')
      break
    }
    case 'list':
    case 'upstreams': {
      const inputs = row.locator('input[type="text"], input:not([type])')
      const before = await inputs.count()
      await row.getByRole('button', { name: /^Add/ }).click()
      await expect(inputs).toHaveCount(before + 1)
      break
    }
    default:
      await expect(control).toBeVisible()
  }
}

test.describe('every option renders as a working control', () => {
  test.describe.configure({ mode: 'parallel' })

  for (const state of allStates()) {
    test(state.name, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => {
        console.log('PAGEERR', error.message)
        errors.push(error.message)
      })
      await page.goto(`/${encodeShareHash(state.options)}`)
      await expect(page.locator('[data-testid="config-code"]:visible')).toBeVisible()
      await expandAdvanced(page)

      const visible = visibleOptions(state.options)
      await expect(page.locator('[id^="row-"]')).toHaveCount(visible.length)
      for (const def of visible) {
        const row = page.locator(`#row-${def.key}`)
        await expect(row).toBeVisible()
        await expect(row.locator(CONTROL).first()).toBeVisible()
      }

      // Editing text, numbers, and lists never hides another row. A toggle can, so only one
      // toggle is flipped, last.
      const edits = visible.filter((def) =>
        ['text', 'number', 'list', 'upstreams'].includes(def.kind),
      )
      for (const def of edits) {
        await exercise(page, def.kind, def.key)
      }
      const toggle = visible.find((def) => def.kind === 'toggle')
      if (toggle !== undefined) {
        await exercise(page, 'toggle', toggle.key)
      }
      expect(errors).toEqual([])
    })
  }

  test('the states cover every option in the schema', () => {
    const covered = new Set(allStates().flatMap((s) => visibleOptions(s.options).map((d) => d.key)))

    expect(OPTIONS.filter((def) => !covered.has(def.key)).map((def) => def.key)).toEqual([])
  })
})
