import { describe, expect, it } from 'vitest'

import { OPTIONS } from '../../src/lib/engine.ts'
import { editableDefs, expectedFor, planEdit } from '../option-edits.ts'
import { allStates, editStates } from '../option-states.ts'

describe('planned option edits', () => {
  it('every option has a planned edit that changes the renderer output somewhere', () => {
    const changes = new Set<string>()
    const noEdit = new Set(OPTIONS.map((def) => def.key))

    for (const state of allStates()) {
      const base = expectedFor(state.options, {}, new Set())
      expect(base.errors, state.name).toEqual({})

      for (const def of editableDefs(state.options)) {
        const plan = planEdit(def, state.options)
        if (plan === null) {
          continue
        }
        noEdit.delete(def.key)
        const after = expectedFor(state.options, { [def.key]: plan.value }, new Set())
        if (after.config !== null && after.config !== base.config) {
          changes.add(def.key)
        }
      }
    }

    expect([...noEdit], 'options without a planned edit').toEqual([])
    expect(
      OPTIONS.filter((def) => !changes.has(def.key)).map((def) => def.key),
      'options whose edit never changes the config',
    ).toEqual([])
  })

  it('the browser edit states can prove every option', () => {
    const proven = new Set<string>()
    for (const state of editStates()) {
      for (const def of editableDefs(state.options)) {
        const plan = planEdit(def, state.options)
        const base = expectedFor(state.options, {}, new Set())
        const after = plan && expectedFor(state.options, { [def.key]: plan.value }, new Set())
        if (after?.config != null && after.config !== base.config) {
          proven.add(def.key)
        }
      }
    }

    expect(OPTIONS.filter((def) => !proven.has(def.key)).map((def) => def.key)).toEqual([])
  })
})
