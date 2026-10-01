import { describe, expect, it } from 'vitest'

import { defaultsFor, OPTIONS } from '../../src/lib/engine.ts'
import {
  decodeShareHash,
  encodeShareHash,
  groupLabel,
  switchPreset,
  visibleGroups,
  visibleOptions,
} from '../../src/lib/state.ts'

function hashOf(text: string): string {
  return `#c=${btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`
}

function keysOf(options: ReturnType<typeof defaultsFor>): string[] {
  return visibleOptions(options).map((def) => def.key)
}

describe('share hash', () => {
  it('round trips changed options', () => {
    const options = defaultsFor('proxy', 'container')
    options.serverName = 'app.example.org'
    options.https = 'acme'
    options.upstreams = [
      { address: '10.0.0.5:3000', backup: false },
      { address: '10.0.0.6:3000', backup: true },
    ]

    expect(decodeShareHash(encodeShareHash(options))).toEqual(options)
  })

  it('stores only options that differ from the defaults', () => {
    const hash = encodeShareHash(defaultsFor('php', 'host'))
    const encoded = hash.slice('#c='.length)
    const json = JSON.parse(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')))

    expect(json).toEqual({ profile: 'php', target: 'host' })
  })

  it('round trips non-ASCII text', () => {
    const options = defaultsFor('static', 'host')
    options.serverName = 'münchen.example'

    expect(decodeShareHash(encodeShareHash(options))?.serverName).toBe('münchen.example')
  })

  it.each([
    ['empty', ''],
    ['wrong prefix', '#x=abc'],
    ['not base64', '#c=@@@'],
    ['not json', hashOf('nope')],
    ['array', hashOf('[]')],
    ['unknown profile', hashOf(JSON.stringify({ profile: 'x', target: 'host' }))],
  ])('rejects %s', (_name, hash) => {
    expect(decodeShareHash(hash)).toBeNull()
  })

  it('ignores unknown keys and values of the wrong type', () => {
    const payload = {
      profile: 'static',
      target: 'host',
      bogus: 1,
      __proto__: { polluted: true },
      gzip: 'yes',
      serverName: 'ok.example.com',
    }
    const hash = hashOf(JSON.stringify(payload))
    const options = decodeShareHash(hash)

    expect(options?.serverName).toBe('ok.example.com')
    expect(options?.gzip).toBe(defaultsFor('static', 'host').gzip)
    expect(options).not.toHaveProperty('bogus')
  })
})

describe('switchPreset', () => {
  it('loads the defaults of the new profile', () => {
    expect(switchPreset(defaultsFor('static', 'host'), 'spa', 'host')).toEqual(
      defaultsFor('spa', 'host'),
    )
  })

  it('keeps an edited field that still applies', () => {
    const current = defaultsFor('static', 'host')
    current.serverName = 'kept.example.com'

    expect(switchPreset(current, 'php', 'container').serverName).toBe('kept.example.com')
  })

  it('does not carry over an untouched field from the old defaults', () => {
    const next = switchPreset(defaultsFor('static', 'host'), 'static', 'container')

    expect(next.httpPort).toBe(defaultsFor('static', 'container').httpPort)
  })
})

describe('field visibility', () => {
  it('hides fields whose appliesTo is false', () => {
    const staticKeys = keysOf(defaultsFor('static', 'host'))

    expect(staticKeys).toContain('documentRoot')
    expect(staticKeys).not.toContain('upstreams')
    expect(keysOf(defaultsFor('proxy', 'host'))).not.toContain('documentRoot')
  })

  it('shows conditional fields once their parent is on', () => {
    const options = defaultsFor('static', 'host')
    expect(keysOf(options)).not.toContain('acmeEmail')

    options.https = 'acme'

    expect(keysOf(options)).toContain('acmeEmail')
    expect(keysOf(options)).not.toContain('certificatePath')
  })

  it('every visible option belongs to a listed group', () => {
    const groups = new Set(visibleGroups(defaultsFor('proxy', 'host')))

    for (const def of visibleOptions(defaultsFor('proxy', 'host'))) {
      expect(groups.has(def.group)).toBe(true)
    }
    expect(OPTIONS.length).toBeGreaterThan(0)
  })

  it('names the backend group after the profile', () => {
    expect(groupLabel('backend', 'php')).toBe('PHP')
    expect(groupLabel('backend', 'proxy')).toBe('Proxy')
    expect(groupLabel('site', 'proxy')).toBe('Site')
  })
})
