import {
  defaultsFor,
  derivedDefaults,
  GROUPS,
  OPTIONS,
  PROFILES,
  TARGETS,
  type GroupId,
  type OptionDef,
  type Options,
  type Profile,
  type Target,
  type Upstream,
} from './engine.ts'

export const MAX_HASH_LENGTH = 16_000

// Defaults that embed the domain name. The renderer derives them from serverName unless
// the caller sets them, so the UI keeps following the domain until the user edits one.
const DERIVED_KEYS = ['documentRoot', 'certificatePath', 'certificateKeyPath']
const PLAIN_HOSTNAME = /^[a-z0-9.-]+$/

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function visibleOptions(options: Options, group?: GroupId): OptionDef[] {
  return OPTIONS.filter(
    (def) => (group === undefined || def.group === group) && def.appliesTo(options),
  )
}

export function visibleGroups(options: Options): GroupId[] {
  return GROUPS.filter((group) => visibleOptions(options, group.id).length > 0).map((g) => g.id)
}

export function groupLabel(group: GroupId, profile: Profile): string {
  if (group === 'backend') {
    return profile === 'php' ? 'PHP' : 'Proxy'
  }

  return GROUPS.find((g) => g.id === group)?.label ?? group
}

// Refreshes every default that follows the profile, target, domain, or www redirect, for
// the fields the user has not edited. The renderer's helper owns what those defaults are.
export function deriveDefaults(options: Options, edited: ReadonlySet<string>): Options {
  const domain = String(options.serverName).toLowerCase()
  // While the domain is not valid yet, derive from the default one so half-typed text never
  // produces invalid paths in fields the user did not touch.
  const source = PLAIN_HOSTNAME.test(domain) ? options : { ...options, serverName: 'example.com' }
  const next = { ...options }
  for (const [key, value] of Object.entries(derivedDefaults(source))) {
    if (!edited.has(key) && value !== undefined) {
      next[key] = value
    }
  }

  return next
}

// Options that do not apply to the current profile, target, or other choices go back to
// their defaults before validation, so a hidden field can never block the builder.
export function withoutInapplicable(options: Options): Options {
  const defaults = defaultsFor(options.profile, options.target)
  const next = { ...options }
  for (const def of OPTIONS) {
    if (!def.appliesTo(options)) {
      next[def.key] = defaults[def.key] as Options[string]
    }
  }

  return next
}

// Switching profile or target loads the new defaults but keeps every field the user
// edited, as long as that field still applies to the new combination.
export function switchPreset(
  current: Options,
  edited: ReadonlySet<string>,
  profile: Profile,
  target: Target,
): { options: Options; edited: Set<string> } {
  const candidate = defaultsFor(profile, target)
  for (const def of OPTIONS) {
    if (edited.has(def.key)) {
      candidate[def.key] = current[def.key] as Options[string]
    }
  }

  const kept = new Set<string>()
  const next = defaultsFor(profile, target)
  for (const def of OPTIONS) {
    if (edited.has(def.key) && def.appliesTo(candidate)) {
      next[def.key] = current[def.key] as Options[string]
      kept.add(def.key)
    }
  }

  return { options: deriveDefaults(next, kept), edited: kept }
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string {
  const padded = text.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))

  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

// The hash carries only what differs from the defaults of the chosen profile and target.
// Domain-derived paths are included only when the user edited them.
export function encodeShareHash(options: Options, edited: ReadonlySet<string> = new Set()): string {
  const defaults = defaultsFor(options.profile, options.target)
  const diff: Record<string, unknown> = { profile: options.profile, target: options.target }

  for (const def of OPTIONS) {
    const include = DERIVED_KEYS.includes(def.key)
      ? edited.has(def.key)
      : !same(options[def.key], defaults[def.key])
    if (include) {
      diff[def.key] = options[def.key]
    }
  }

  return `#c=${toBase64Url(JSON.stringify(diff))}`
}

export function isShareHashTooLong(hash: string): boolean {
  return hash.length > MAX_HASH_LENGTH
}

function coerce(def: OptionDef, value: unknown): Options[string] | undefined {
  switch (def.kind) {
    case 'select':
    case 'text':
      return typeof value === 'string' ? value : undefined
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? value : undefined
    case 'toggle':
      return typeof value === 'boolean' ? value : undefined
    case 'list':
      return Array.isArray(value) && value.every((item) => typeof item === 'string')
        ? (value as string[])
        : undefined
    case 'upstreams': {
      const valid =
        Array.isArray(value) &&
        value.every(
          (item) =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as Upstream).address === 'string',
        )
      if (!valid) {
        return undefined
      }

      return (value as Upstream[]).map((item) => ({
        address: item.address,
        backup: item.backup === true,
      }))
    }
  }
}

export function decodeShareHash(hash: string): { options: Options; edited: Set<string> } | null {
  const match = /^#c=([A-Za-z0-9_-]+)$/.exec(hash)
  if (match === null || isShareHashTooLong(hash)) {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(fromBase64Url(match[1]))
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null
  }

  const input = parsed as Record<string, unknown>
  const profile = PROFILES.find((p) => p.id === input.profile)?.id
  const target = TARGETS.find((t) => t.id === input.target)?.id
  if (profile === undefined || target === undefined) {
    return null
  }

  const options = defaultsFor(profile, target)
  const edited = new Set<string>()
  for (const def of OPTIONS) {
    if (Object.hasOwn(input, def.key)) {
      const value = coerce(def, input[def.key])
      if (value !== undefined) {
        options[def.key] = value
        edited.add(def.key)
      }
    }
  }

  return { options: deriveDefaults(options, edited), edited }
}
