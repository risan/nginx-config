import { expect, test, type Locator, type Page } from '@playwright/test'

import type { Options } from '../../src/lib/engine.ts'
import { encodeShareHash, visibleOptions } from '../../src/lib/state.ts'
import { DERIVED_KEYS, expectedFor, planEdit, type PlannedEdit } from '../option-edits.ts'
import { allStates, editStates } from '../option-states.ts'

const CONTROL =
  '[data-control] :is(input, button, [role="radio"], [role="switch"], [role="combobox"])'
const banner = (page: Page) => page.getByText(/Fix \d+ errors? to update/)

async function expandAdvanced(page: Page) {
  const toggles = page.getByRole('button', { name: /^Show advanced/ })
  while ((await toggles.count()) > 0) {
    await toggles.first().click()
  }
}

// The exact text of the visible preview, one entry per logical line.
const previewConfig = (page: Page) =>
  page
    .locator('[data-testid="config-code"]:visible')
    .evaluate((el) =>
      [...el.querySelectorAll('.code-line')]
        .map((line) => line.children[1]?.textContent ?? '')
        .join('\n'),
    )

const trimmed = (config: string) => config.replace(/\n$/, '')

async function setSelect(page: Page, row: Locator, label: string) {
  const radios = row.getByRole('radio')
  await expect(radios.or(row.getByRole('combobox')).first()).toBeVisible()
  if ((await radios.count()) > 0) {
    await row.getByRole('radio', { name: label, exact: true }).click()

    return
  }
  await row.getByRole('combobox').click()
  await page.getByRole('option', { name: label, exact: true }).click()
}

async function apply(page: Page, plan: PlannedEdit, direction: 'edit' | 'undo') {
  const row = page.locator(`#row-${plan.def.key}`)
  await expect(row, `row ${plan.def.key} should be visible`).toBeVisible()
  const toValue = direction === 'edit' ? plan.value : plan.original

  switch (plan.kind) {
    case 'toggle':
      await row.getByRole('switch').click()
      break
    case 'select':
      await setSelect(page, row, (direction === 'edit' ? plan.label : plan.originalLabel) ?? '')
      break
    case 'field':
      await row.locator('[data-control] input').first().fill(String(toValue))
      break
    case 'list':
    case 'upstreams': {
      const inputs = row.locator('[data-item] input[type="text"], [data-item] input:not([type])')
      if (direction === 'edit') {
        const count = await inputs.count()
        await row.getByRole('button', { name: /^Add/ }).click()
        await expect(inputs).toHaveCount(count + 1)
        const added = plan.value as Array<string | { address: string }>
        const last = added[added.length - 1]
        await inputs.nth(count).fill(typeof last === 'string' ? last : (last?.address ?? ''))
      } else {
        const count = await inputs.count()
        await row.getByRole('button', { name: new RegExp(`^Remove .* ${count}$`) }).click()
      }
      break
    }
  }
}

// One edit, proven against the renderer: the preview must equal the renderer's output for
// the edited options exactly (or the renderer's own error must show), and undoing the edit
// must restore the previous preview and clear every error.
async function proveEdit(
  page: Page,
  options: Options,
  editedDerived: Set<string>,
  plan: PlannedEdit,
) {
  const key = plan.def.key
  const before = await previewConfig(page)
  const expected = expectedFor(options, { [key]: plan.value }, editedDerived)

  await apply(page, plan, 'edit')

  if (expected.config !== null) {
    await expect
      .poll(() => previewConfig(page), { message: `after editing ${key}` })
      .toBe(trimmed(expected.config))
    await expect(banner(page), `errors after editing ${key}`).toHaveCount(0)
  } else {
    await expect(banner(page), `renderer errors for ${key}`).toBeVisible()
    for (const message of Object.values(expected.errors).slice(0, 3)) {
      await expect(page.getByRole('alert').filter({ hasText: message }).first()).toBeVisible()
    }
    expect(await previewConfig(page), `preview kept while ${key} is invalid`).toBe(before)
  }

  await apply(page, plan, 'undo')
  await expect.poll(() => previewConfig(page), { message: `after undoing ${key}` }).toBe(before)
  await expect(banner(page), `errors left after undoing ${key}`).toHaveCount(0)
  await expect(page.getByRole('alert'), `alerts left after undoing ${key}`).toHaveCount(0)

  if (DERIVED_KEYS.includes(key)) {
    editedDerived.add(key)
  }
}

test.describe('every option renders as a control', () => {
  test.describe.configure({ mode: 'parallel' })

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
      await expect(banner(page)).toHaveCount(0)
      await expandAdvanced(page)

      const visible = visibleOptions(state.options)
      await expect(page.locator('[id^="row-"]')).toHaveCount(visible.length)
      for (const def of visible) {
        await expect(page.locator(`#row-${def.key}`)).toBeVisible()
        await expect(page.locator(`#row-${def.key}`).locator(CONTROL).first()).toBeVisible()
      }

      // The first preview must already be the renderer's own output for these options.
      const base = expectedFor(state.options, {}, new Set())
      expect(await previewConfig(page)).toBe(trimmed(base.config ?? ''))
      expect(errors).toEqual([])
    })
  }
})

test.describe('every option changes the preview as the renderer says', () => {
  test.describe.configure({ mode: 'parallel', timeout: 240_000 })
  test.use({ actionTimeout: 8000 })

  for (const state of editStates()) {
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
      await expandAdvanced(page)

      // Selects and toggles first (they can hide rows, so each is undone), then fields and
      // lists, in schema order so a domain edit comes before the paths that follow it.
      const visible = visibleOptions(state.options)
      const editedDerived = new Set<string>()
      const order = [
        ...visible.filter((d) => d.kind === 'toggle' || d.kind === 'select'),
        ...visible.filter((d) => d.kind !== 'toggle' && d.kind !== 'select'),
      ]
      for (const def of order) {
        const plan = planEdit(def, state.options)
        expect(plan, `a planned edit for ${def.key}`).not.toBeNull()
        if (plan !== null) {
          await proveEdit(page, state.options, editedDerived, plan)
        }
      }
      expect(errors).toEqual([])
    })
  }
})

// Invalid input: the renderer's specific message must show next to the field, the preview
// must keep the last valid config, and undoing must clear everything.
test.describe('invalid edits show the renderer error', () => {
  test.describe.configure({ mode: 'parallel', timeout: 180_000 })
  test.use({ actionTimeout: 8000 })

  const invalidStates = allStates().filter((s) => s.name.includes('https=acme/full'))
  for (const state of invalidStates) {
    test(state.name, async ({ page }) => {
      await page.goto(`/${encodeShareHash(state.options)}`)
      await expect(page.locator('[data-testid="config-code"]:visible')).toBeVisible()
      await expandAdvanced(page)

      let checked = 0
      for (const def of visibleOptions(state.options)) {
        if (def.kind !== 'text' && def.kind !== 'number') {
          continue
        }
        const bad = def.kind === 'number' ? -5 : 'bad value!'
        const expected = expectedFor(state.options, { [def.key]: bad }, new Set())
        const message = expected.errors[def.key]
        if (message === undefined) {
          continue
        }

        const before = await previewConfig(page)
        const original = String(state.options[def.key] ?? '')
        const input = page.locator(`#row-${def.key} [data-control] input`).first()
        await input.fill(String(bad))

        await expect(banner(page), `banner for ${def.key}`).toBeVisible()
        await expect(
          page.locator(`#row-${def.key}`).getByRole('alert').filter({ hasText: message }),
          `error for ${def.key}`,
        ).toBeVisible()
        expect(await previewConfig(page)).toBe(before)

        await input.fill(original)
        await expect(banner(page), `errors left after undoing ${def.key}`).toHaveCount(0)
        await expect.poll(() => previewConfig(page)).toBe(before)
        checked++
      }
      expect(checked).toBeGreaterThan(5)
    })
  }
})
