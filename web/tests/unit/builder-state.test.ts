import { describe, expect, it } from 'vitest'

import { builderReducer, initialBuilderState } from '../../src/lib/builder-state.ts'

describe('builderReducer', () => {
  it('renders a config from valid options', () => {
    const state = builderReducer(initialBuilderState(), {
      type: 'set',
      key: 'serverName',
      value: 'a.example.com',
    })

    expect(state.errors).toEqual({})
    expect(state.shown.config).toContain('server_name a.example.com;')
  })

  it('keeps the last valid config while an edit is invalid', () => {
    const valid = builderReducer(initialBuilderState(), {
      type: 'set',
      key: 'serverName',
      value: 'a.example.com',
    })
    const invalid = builderReducer(valid, { type: 'set', key: 'serverName', value: 'bad name' })

    expect(Object.keys(invalid.errors)).toEqual(['serverName'])
    expect(invalid.options.serverName).toBe('bad name')
    expect(invalid.shown.config).toContain('server_name a.example.com;')
  })

  it('switches presets and keeps edited fields', () => {
    const edited = builderReducer(initialBuilderState(), {
      type: 'set',
      key: 'serverName',
      value: 'keep.example.com',
    })
    const proxy = builderReducer(edited, { type: 'preset', profile: 'proxy', target: 'host' })

    expect(proxy.options.profile).toBe('proxy')
    expect(proxy.shown.config).toContain('server_name keep.example.com;')
  })
})
