import { describe, expect, it } from 'vitest'

import {
  builderReducer,
  initialBuilderState,
  type BuilderState,
} from '../../src/lib/builder-state.ts'
import { groupErrors } from '../../src/lib/errors.ts'
import type { Options } from '../../src/lib/engine.ts'

function set(state: BuilderState, key: string, value: Options[string]): BuilderState {
  return builderReducer(state, { type: 'set', key, value })
}

describe('builderReducer', () => {
  it('renders a config from valid options', () => {
    const state = set(initialBuilderState(), 'serverName', 'a.example.com')

    expect(state.errors).toEqual({})
    expect(state.shown.config).toContain('server_name a.example.com;')
  })

  it('keeps the last valid config while an edit is invalid', () => {
    const valid = set(initialBuilderState(), 'serverName', 'a.example.com')
    const invalid = set(valid, 'serverName', 'bad name')

    expect(Object.keys(invalid.errors)).toEqual(['serverName'])
    expect(invalid.options.serverName).toBe('bad name')
    expect(invalid.shown.config).toContain('server_name a.example.com;')
  })

  it('switches presets and keeps edited fields', () => {
    const edited = set(initialBuilderState(), 'serverName', 'keep.example.com')
    const proxy = builderReducer(edited, { type: 'preset', profile: 'proxy', target: 'host' })

    expect(proxy.options.profile).toBe('proxy')
    expect(proxy.shown.config).toContain('server_name keep.example.com;')
  })

  it('points manual certificate paths at the new domain', () => {
    let state = set(initialBuilderState(), 'https', 'manual')
    state = set(state, 'serverName', 'app.example.com')

    expect(state.errors).toEqual({})
    expect(state.shown.config).toContain('/etc/letsencrypt/live/app.example.com/fullchain.pem')
    expect(state.shown.config).not.toContain('live/example.com')
  })

  it('keeps an edited certificate path when the domain changes', () => {
    let state = set(initialBuilderState(), 'https', 'manual')
    state = set(state, 'certificatePath', '/srv/tls/cert.pem')
    state = set(state, 'serverName', 'app.example.com')

    expect(state.shown.config).toContain('ssl_certificate /srv/tls/cert.pem;')
  })

  it('follows the target for the document root until it is edited', () => {
    const state = builderReducer(initialBuilderState(), {
      type: 'preset',
      profile: 'static',
      target: 'container',
    })

    expect(state.shown.config).toContain('root /usr/share/nginx/html;')
  })

  it('a hidden invalid field does not block the builder', () => {
    let state = set(initialBuilderState(), 'https', 'acme')
    state = set(state, 'acmeEmail', 'bad')
    expect(state.errors.acmeEmail).toBeTruthy()

    state = set(state, 'https', 'off')

    expect(state.errors).toEqual({})
    expect(state.shown.config).not.toContain('acme_certificate')
    expect(state.options.acmeEmail).toBe('bad')
  })

  it('restores a hidden value when its feature is switched back on', () => {
    let state = set(initialBuilderState(), 'https', 'acme')
    state = set(state, 'acmeEmail', 'me@example.com')
    state = set(state, 'https', 'off')
    state = set(state, 'https', 'acme')

    expect(state.options.acmeEmail).toBe('me@example.com')
    expect(state.errors).toEqual({})
  })

  it('a stale balancing method does not block once the second upstream is removed', () => {
    let state = builderReducer(initialBuilderState(), {
      type: 'preset',
      profile: 'proxy',
      target: 'host',
    })
    state = set(state, 'upstreams', [
      { address: '10.0.0.1:3000', backup: false },
      { address: '10.0.0.2:3000', backup: true },
    ])
    state = set(state, 'loadBalancing', 'least-conn')
    state = set(state, 'upstreams', [{ address: '10.0.0.1:3000', backup: false }])

    expect(state.errors).toEqual({})
  })
})

describe('groupErrors', () => {
  it('folds list item errors onto their field', () => {
    const grouped = groupErrors({
      'upstreams.0.address': 'Bad address',
      'immutablePaths.2': 'Bad path',
      serverName: 'Bad name',
      trustedProxies: 'Add one',
      'trustedProxies.1': 'Bad cidr',
    })

    expect(grouped.get('upstreams')).toEqual({ items: { 0: 'Bad address' } })
    expect(grouped.get('immutablePaths')?.items[2]).toBe('Bad path')
    expect(grouped.get('serverName')?.own).toBe('Bad name')
    expect(grouped.get('trustedProxies')).toEqual({ own: 'Add one', items: { 1: 'Bad cidr' } })
  })

  it('the validator reports an empty upstream as a list item error', () => {
    const state = set(
      builderReducer(initialBuilderState(), { type: 'preset', profile: 'proxy', target: 'host' }),
      'upstreams',
      [
        { address: '127.0.0.1:3000', backup: false },
        { address: '', backup: false },
      ],
    )

    expect(groupErrors(state.errors).get('upstreams')?.items[1]).toBeTruthy()
  })
})
