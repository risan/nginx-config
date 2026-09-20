/**
 * Form metadata belongs to the browser UI. Nginx directives and their defaults
 * stay in lib/config.js so the preview and exported file always use one renderer.
 */

export const FIELD_LABELS = {
  serverName: 'Server name',
  listenPort: 'HTTP port',
  httpsPort: 'HTTPS port',
  documentRoot: 'Document root',
  upstream: 'Upstream service',
  certificatePath: 'Certificate path',
  certificateKeyPath: 'Private key path',
}

const PROFILE_FIELDS = {
  static: new Set(['documentRoot', 'assetCache']),
  spa: new Set(['documentRoot', 'assetCache']),
  php: new Set(['documentRoot', 'upstream', 'assetCache']),
  go: new Set(['upstream', 'websocket', 'streaming', 'proxyCache', 'rateLimit']),
  proxy: new Set(['upstream', 'websocket', 'streaming', 'proxyCache', 'rateLimit']),
}

export function isFieldVisible(profile, field) {
  if (['serverName', 'listenPort', 'httpsPort', 'tls', 'hsts'].includes(field)) {
    return true
  }

  if (field === 'gzip') return true

  if (['certificatePath', 'certificateKeyPath'].includes(field)) {
    return Boolean(profile && profile.tls)
  }

  return PROFILE_FIELDS[profile.profile]?.has(field) ?? false
}

export function cloneOptions(options) {
  return { ...options }
}

export function presetForProfile(presets, profile) {
  return presets.find((preset) => preset.id === profile) ?? null
}

export function applyPreset(base, preset) {
  return cloneOptions({ ...base, ...(preset?.defaults ?? {}) })
}

export function validationEntries(errors) {
  return Object.entries(errors ?? {}).map(([field, message]) => ({
    field,
    label: FIELD_LABELS[field] ?? field,
    message: String(message),
  }))
}
