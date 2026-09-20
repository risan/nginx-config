import { describe, expect, it } from 'vitest'
import {
  applyPreset,
  isFieldVisible,
  presetForProfile,
  validationEntries,
} from './app-logic.js'

const presets = [
  { id: 'static', label: 'Static site', description: 'Files', defaults: { profile: 'static', documentRoot: '/srv/site' } },
  { id: 'proxy', label: 'Reverse proxy', description: 'Service', defaults: { profile: 'proxy', upstream: 'app:3000' } },
]

describe('generator form logic', () => {
  it('shows only fields that match the selected workload', () => {
    expect(isFieldVisible({ profile: 'static', tls: false }, 'documentRoot')).toBe(true)
    expect(isFieldVisible({ profile: 'static', tls: false }, 'upstream')).toBe(false)
    expect(isFieldVisible({ profile: 'proxy', tls: false }, 'upstream')).toBe(true)
    expect(isFieldVisible({ profile: 'php', tls: false }, 'upstream')).toBe(true)
    expect(isFieldVisible({ profile: 'proxy', tls: false }, 'documentRoot')).toBe(false)
    expect(isFieldVisible({ profile: 'static', tls: true }, 'certificatePath')).toBe(true)
    expect(isFieldVisible({ profile: 'static', tls: false }, 'certificatePath')).toBe(false)
  })

  it('applies a preset without mutating the base options', () => {
    const base = { profile: 'static', documentRoot: '/srv/old', gzip: true }
    const result = applyPreset(base, presetForProfile(presets, 'proxy'))

    expect(result).toEqual({ profile: 'proxy', documentRoot: '/srv/old', gzip: true, upstream: 'app:3000' })
    expect(base).toEqual({ profile: 'static', documentRoot: '/srv/old', gzip: true })
  })

  it('turns renderer errors into displayable entries', () => {
    expect(validationEntries({ serverName: 'Use a hostname', listenPort: 'Use a valid port' })).toEqual([
      { field: 'serverName', label: 'Server name', message: 'Use a hostname' },
      { field: 'listenPort', label: 'HTTP port', message: 'Use a valid port' },
    ])
  })
})
