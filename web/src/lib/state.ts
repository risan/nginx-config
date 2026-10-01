import {
  defaultsFor,
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

const MAX_HASH_LENGTH = 16_000

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

// Switching profile or target loads the new defaults but keeps every field the user
// changed, as long as that field still applies to the new combination.
export function switchPreset(current: Options, profile: Profile, target: Target): Options {
  const previousDefaults = defaultsFor(current.profile, current.target)
  const next = defaultsFor(profile, target)

  for (const def of OPTIONS) {
    const edited = !same(current[def.key], previousDefaults[def.key])
    if (edited && def.appliesTo(next)) {
      next[def.key] = current[def.key] as Options[string]
    }
  }

  return next
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
export function encodeShareHash(options: Options): string {
  const defaults = defaultsFor(options.profile, options.target)
  const diff: Record<string, unknown> = { profile: options.profile, target: options.target }

  for (const def of OPTIONS) {
    if (!same(options[def.key], defaults[def.key])) {
      diff[def.key] = options[def.key]
    }
  }

  return `#c=${toBase64Url(JSON.stringify(diff))}`
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

export function decodeShareHash(hash: string): Options | null {
  const match = /^#c=([A-Za-z0-9_-]+)$/.exec(hash)
  if (match === null || hash.length > MAX_HASH_LENGTH) {
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
  for (const def of OPTIONS) {
    if (Object.hasOwn(input, def.key)) {
      const value = coerce(def, input[def.key])
      if (value !== undefined) {
        options[def.key] = value
      }
    }
  }

  return options
}
