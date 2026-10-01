import { describe, expect, it } from 'vitest'

import { OPTIONS, validateOptions } from '../../src/lib/engine.ts'
import { visibleOptions } from '../../src/lib/state.ts'
import { allStates } from '../option-states.ts'

describe('real option schema', () => {
  it('the test states make every option applicable at least once', () => {
    const covered = new Set(allStates().flatMap((s) => visibleOptions(s.options).map((d) => d.key)))

    expect(OPTIONS.filter((def) => !covered.has(def.key)).map((def) => def.key)).toEqual([])
  })

  it('every fixture is a valid configuration', () => {
    for (const state of allStates()) {
      const result = validateOptions(state.options)

      expect(result.errors, state.name).toEqual({})
      expect(result.valid, state.name).toBe(true)
    }
  })

  it('every option has a label, help and why text, and select options have choices', () => {
    for (const def of OPTIONS) {
      expect(def.label, def.key).not.toBe('')
      expect(def.help, def.key).not.toBe('')
      expect(def.why, def.key).not.toBe('')
      if (def.kind === 'select') {
        expect(def.choices?.length, def.key).toBeGreaterThan(1)
      }
    }
  })

  it('rejects an empty number field instead of treating it as zero', () => {
    const options = allStates()[0].options
    const result = validateOptions({ ...options, workerConnections: '' })

    expect(result.valid).toBe(false)
    expect(result.errors.workerConnections).toBeTruthy()
  })
})
