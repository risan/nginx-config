import { describe, expect, it } from 'vitest'

import { defaultsFor, OPTIONS, validateOptions } from '../../src/lib/engine.ts'
import {
  decodeShareHash,
  deriveDefaults,
  encodeShareHash,
  groupLabel,
  isShareHashTooLong,
  MAX_HASH_LENGTH,
  switchPreset,
  visibleGroups,
  visibleOptions,
  withoutInapplicable,
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
    const edited = new Set(['serverName', 'https', 'upstreams'])
    const restored = decodeShareHash(encodeShareHash(deriveDefaults(options, edited), edited))

    expect(restored?.options).toEqual(deriveDefaults(options, edited))
    expect([...(restored?.edited ?? [])].sort()).toEqual(['https', 'serverName', 'upstreams'])
  })

  it('stores only options that differ from the defaults', () => {
    const hash = encodeShareHash(defaultsFor('php', 'host'))
    const json = JSON.parse(
      atob(hash.slice('#c='.length).replaceAll('-', '+').replaceAll('_', '/')),
    )

    expect(json).toEqual({ profile: 'php', target: 'host' })
  })

  it('omits domain-derived paths the user did not edit, and keeps edited ones', () => {
    const options = deriveDefaults(
      { ...defaultsFor('static', 'host'), serverName: 'a.example.org' },
      new Set(),
    )
    const plain = JSON.parse(
      atob(encodeShareHash(options).slice(3).replaceAll('-', '+').replaceAll('_', '/')),
    )
    expect(plain.documentRoot).toBeUndefined()
    expect(plain.serverName).toBe('a.example.org')

    options.documentRoot = '/srv/site'
    const edited = JSON.parse(
      atob(
        encodeShareHash(options, new Set(['documentRoot']))
          .slice(3)
          .replaceAll('-', '+')
          .replaceAll('_', '/'),
      ),
    )
    expect(edited.documentRoot).toBe('/srv/site')
  })

  it('restores derived paths from the domain in the link', () => {
    const options = defaultsFor('static', 'host')
    options.serverName = 'a.example.org'
    options.https = 'manual'
    const restored = decodeShareHash(encodeShareHash(options, new Set(['serverName', 'https'])))

    expect(restored?.options.certificatePath).toBe(
      '/etc/letsencrypt/live/a.example.org/fullchain.pem',
    )
    expect(restored?.options.documentRoot).toBe('/var/www/a.example.org/public')
  })

  it('round trips non-ASCII text', () => {
    const options = defaultsFor('static', 'host')
    options.serverName = 'münchen.example'

    expect(decodeShareHash(encodeShareHash(options))?.options.serverName).toBe('münchen.example')
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
    const hash = hashOf(
      '{"profile":"static","target":"host","bogus":1,"gzip":"yes","serverName":"ok.example.com"}',
    )
    const restored = decodeShareHash(hash)

    expect(restored?.options.serverName).toBe('ok.example.com')
    expect(restored?.options.gzip).toBe(defaultsFor('static', 'host').gzip)
    expect(restored?.options).not.toHaveProperty('bogus')
  })

  it('does not let __proto__ or constructor.prototype keys pollute anything', () => {
    // Literal JSON: an object literal would set the prototype instead of an own key.
    const payload =
      '{"profile":"static","target":"host","__proto__":{"polluted":true},' +
      '"constructor":{"prototype":{"polluted":true}},"serverName":"ok.example.com"}'
    expect(Object.hasOwn(JSON.parse(payload), '__proto__')).toBe(true)

    const restored = decodeShareHash(hashOf(payload))

    expect(restored?.options.serverName).toBe('ok.example.com')
    expect(Object.getPrototypeOf(restored?.options)).toBe(Object.prototype)
    expect(Object.hasOwn(restored?.options ?? {}, '__proto__')).toBe(false)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('accepts a hash at the size limit and rejects one past it', () => {
    const build = (length: number) => {
      const options = defaultsFor('static', 'host')
      options.contentSecurityPolicy = 'a'.repeat(length)

      return encodeShareHash(options)
    }
    let length = 1
    while (build(length + 3).length <= MAX_HASH_LENGTH) {
      length += 3
    }
    const atLimit = build(length)
    const pastLimit = build(length + 3)

    expect(atLimit.length).toBeLessThanOrEqual(MAX_HASH_LENGTH)
    expect(isShareHashTooLong(atLimit)).toBe(false)
    expect(decodeShareHash(atLimit)?.options.contentSecurityPolicy).toHaveLength(length)
    expect(pastLimit.length).toBeGreaterThan(MAX_HASH_LENGTH)
    expect(isShareHashTooLong(pastLimit)).toBe(true)
    expect(decodeShareHash(pastLimit)).toBeNull()
  })

  it('rejects an oversized hash made of valid characters', () => {
    expect(decodeShareHash(`#c=${'A'.repeat(MAX_HASH_LENGTH)}`)).toBeNull()
  })
})

describe('domain-dependent defaults', () => {
  it('follow the domain until the user edits them', () => {
    const options = {
      ...defaultsFor('static', 'host'),
      serverName: 'App.Example.com',
      https: 'manual',
    }
    const derived = deriveDefaults(options, new Set(['serverName', 'https']))

    expect(derived.certificatePath).toBe('/etc/letsencrypt/live/app.example.com/fullchain.pem')
    expect(derived.certificateKeyPath).toBe('/etc/letsencrypt/live/app.example.com/privkey.pem')
    expect(derived.documentRoot).toBe('/var/www/app.example.com/public')
  })

  it('match what the renderer derives when the keys are absent', () => {
    for (const target of ['host', 'container'] as const) {
      const input = { profile: 'static', target, serverName: 'App.Example.com', https: 'manual' }
      const fromLib = validateOptions(input).options
      const fromUi = deriveDefaults(
        { ...defaultsFor('static', target), serverName: 'App.Example.com', https: 'manual' },
        new Set(['serverName', 'https']),
      )

      expect(fromUi.certificatePath).toBe(fromLib?.certificatePath)
      expect(fromUi.certificateKeyPath).toBe(fromLib?.certificateKeyPath)
      expect(fromUi.documentRoot).toBe(fromLib?.documentRoot)
    }
  })

  it('keep an edited value', () => {
    const options = {
      ...defaultsFor('static', 'host'),
      serverName: 'b.example.com',
      certificatePath: '/x/cert.pem',
    }

    expect(deriveDefaults(options, new Set(['certificatePath'])).certificatePath).toBe(
      '/x/cert.pem',
    )
  })

  it('follow the target as well as the domain when the preset changes', () => {
    const current = { ...defaultsFor('static', 'host'), serverName: 'c.example.com' }
    const next = switchPreset(current, new Set(['serverName']), 'static', 'container')

    expect(next.options.documentRoot).toBe('/usr/share/nginx/html')
    expect(next.options.certificatePath).toBe('/etc/nginx/tls/c.example.com/fullchain.pem')
  })
})

describe('switchPreset', () => {
  it('loads the defaults of the new profile', () => {
    expect(switchPreset(defaultsFor('static', 'host'), new Set(), 'spa', 'host').options).toEqual(
      defaultsFor('spa', 'host'),
    )
  })

  it('keeps an edited field that still applies', () => {
    const current = defaultsFor('static', 'host')
    current.serverName = 'kept.example.com'
    const next = switchPreset(current, new Set(['serverName']), 'php', 'container')

    expect(next.options.serverName).toBe('kept.example.com')
    expect(next.edited.has('serverName')).toBe(true)
  })

  it('does not carry over an untouched field from the old defaults', () => {
    const next = switchPreset(defaultsFor('static', 'host'), new Set(), 'static', 'container')

    expect(next.options.httpPort).toBe(defaultsFor('static', 'container').httpPort)
  })

  it('keeps an edited field that depends on another edited field', () => {
    const current = { ...defaultsFor('static', 'host'), https: 'acme', acmeEmail: 'a@example.com' }
    const next = switchPreset(current, new Set(['https', 'acmeEmail']), 'spa', 'host')

    expect(next.options.acmeEmail).toBe('a@example.com')
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

  it('resets the values of hidden fields to their defaults before validation', () => {
    const options = { ...defaultsFor('static', 'host'), https: 'off', acmeEmail: 'bad' }

    expect(withoutInapplicable(options).acmeEmail).toBe('')
    expect(options.acmeEmail).toBe('bad')
  })
})
