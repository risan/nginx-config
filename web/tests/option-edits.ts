import {
  generateConfig,
  OPTIONS,
  validateOptions,
  type OptionDef,
  type Options,
  type Upstream,
} from '../src/lib/engine.ts'
import { withoutInapplicable } from '../src/lib/state.ts'

type Value = Options[string]

// Paths that follow the domain until the user edits them.
export const DERIVED_KEYS = ['documentRoot', 'certificatePath', 'certificateKeyPath']

// A valid replacement for each text or number option. Container certificate paths must
// live under /etc/nginx/tls/, so those depend on the target.
const VALID_VALUES: Record<string, (o: Options) => Value> = {
  serverName: () => 'edited.example.org',
  documentRoot: () => '/srv/edited/public',
  certificatePath: (o) =>
    o.target === 'container'
      ? '/etc/nginx/tls/edited/fullchain.pem'
      : '/etc/ssl/edited/fullchain.pem',
  certificateKeyPath: (o) =>
    o.target === 'container' ? '/etc/nginx/tls/edited/privkey.pem' : '/etc/ssl/edited/privkey.pem',
  acmeEmail: () => 'edit@example.org',
  gzipLevel: () => 3,
  clientMaxBodySize: () => '3m',
  contentSecurityPolicy: () => "default-src 'none'",
  rateLimitRate: () => 25,
  rateLimitBurst: () => 30,
  connLimit: () => 30,
  websocketPath: () => '/socket/',
  streamingPath: () => '/stream/',
  proxyReadTimeout: () => 90,
  upstreamTlsName: () => 'backend.example.net',
  httpPort: () => 8081,
  httpsPort: () => 8444,
  publicHttpPort: () => 8082,
  publicHttpsPort: () => 8445,
  workerConnections: () => 2048,
  workerUser: () => 'www-data',
  resolver: () => '1.1.1.1',
}

const LIST_ITEMS: Record<string, string> = {
  immutablePaths: '/static-assets/',
  trustedProxies: '192.0.2.0/24',
}

export type EditKind = 'toggle' | 'select' | 'field' | 'list' | 'upstreams'

export interface PlannedEdit {
  def: OptionDef
  kind: EditKind
  value: Value
  original: Value
  // For selects: the labels the user clicks.
  label?: string
  originalLabel?: string
}

export function planEdit(def: OptionDef, options: Options): PlannedEdit | null {
  const original = options[def.key] as Value
  switch (def.kind) {
    case 'toggle':
      return { def, kind: 'toggle', value: original !== true, original }
    case 'select': {
      const choices = def.choices ?? []
      const next = choices.find((choice) => choice.value !== original)
      const current = choices.find((choice) => choice.value === original)
      if (next === undefined || current === undefined) {
        return null
      }

      return {
        def,
        kind: 'select',
        value: next.value,
        original,
        label: next.label,
        originalLabel: current.label,
      }
    }
    case 'text':
    case 'number': {
      const make = VALID_VALUES[def.key]

      return make === undefined ? null : { def, kind: 'field', value: make(options), original }
    }
    case 'list': {
      const item = LIST_ITEMS[def.key]

      return item === undefined
        ? null
        : { def, kind: 'list', value: [...(original as string[]), item], original }
    }
    case 'upstreams': {
      const added: Upstream = { address: '127.0.0.1:3001', backup: false }

      return { def, kind: 'upstreams', value: [...(original as Upstream[]), added], original }
    }
  }
}

export interface Expected {
  config: string | null
  errors: Record<string, string>
}

// What the renderer says about these options, computed the way the builder does: fields
// the user has not edited follow the domain, and fields that do not apply are reset.
export function expectedFor(
  options: Options,
  edits: Record<string, Value>,
  editedDerived: ReadonlySet<string>,
): Expected {
  const input: Record<string, Value> = { ...options }
  for (const key of DERIVED_KEYS) {
    if (!editedDerived.has(key) && !(key in edits)) {
      delete input[key]
    }
  }
  Object.assign(input, edits)

  const result = validateOptions(withoutInapplicable(input as Options))

  return {
    config: result.valid && result.options !== null ? generateConfig(result.options) : null,
    errors: result.errors,
  }
}

export function editableDefs(options: Options): OptionDef[] {
  return OPTIONS.filter((def) => def.appliesTo(options))
}
