// Temporary stand-in for lib/options.ts and lib/render.ts. engine.ts re-exports this
// until the real modules land; it only has to exercise every control kind.
export type Profile = 'static' | 'spa' | 'php' | 'proxy'
export type Target = 'host' | 'container'
export type GroupId = 'site' | 'https' | 'performance' | 'security' | 'backend' | 'advanced'
export type OptionKind = 'select' | 'toggle' | 'text' | 'number' | 'list' | 'upstreams'
export interface Choice {
  value: string
  label: string
  help?: string
}
export interface Upstream {
  address: string
  backup: boolean
}
export type Options = Record<string, string | number | boolean | string[] | Upstream[]> & {
  profile: Profile
  target: Target
}
export interface OptionDef {
  key: string
  group: GroupId
  kind: OptionKind
  label: string
  help: string
  why: string
  docs?: string
  choices?: Choice[]
  placeholder?: string
  unit?: string
  min?: number
  max?: number
  advanced?: boolean
  experimental?: boolean
  appliesTo(o: Options): boolean
}

export const NGINX_VERSION = '1.30.5'

export const PROFILES: { id: Profile; label: string; description: string }[] = [
  { id: 'static', label: 'Static', description: 'Plain files from a directory.' },
  { id: 'spa', label: 'SPA', description: 'Single-page app with index.html fallback.' },
  { id: 'php', label: 'PHP', description: 'PHP-FPM behind NGINX.' },
  { id: 'proxy', label: 'Reverse proxy', description: 'Forward requests to an app server.' },
]

export const TARGETS: { id: Target; label: string; description: string }[] = [
  { id: 'host', label: 'Server / VM', description: 'Packages on a VM or bare metal.' },
  { id: 'container', label: 'Container', description: 'Non-root container image.' },
]

export const GROUPS: { id: GroupId; label: string; description: string }[] = [
  { id: 'site', label: 'Site', description: 'Name, root and upstreams.' },
  { id: 'https', label: 'HTTPS', description: 'Certificates and TLS.' },
  { id: 'performance', label: 'Performance', description: 'Compression and caching.' },
  { id: 'security', label: 'Security', description: 'Headers and limits.' },
  { id: 'backend', label: 'Backend', description: 'Backend-specific settings.' },
  { id: 'advanced', label: 'Advanced', description: 'Ports and low-level settings.' },
]

const always = () => true
const files = (o: Options) => o.profile !== 'proxy'
const hasBackend = (o: Options) => o.profile === 'php' || o.profile === 'proxy'
const httpsOn = (o: Options) => o.https !== 'off'

export const OPTIONS: OptionDef[] = [
  {
    key: 'serverName',
    group: 'site',
    kind: 'text',
    label: 'Server name',
    help: 'The domain this config answers for.',
    why: 'Requests for any other Host are rejected by the catch-all server.',
    docs: 'https://nginx.org/en/docs/http/ngx_http_core_module.html#server_name',
    placeholder: 'example.com',
    appliesTo: always,
  },
  {
    key: 'wwwRedirect',
    group: 'site',
    kind: 'select',
    label: 'www redirect',
    help: 'Redirect between the apex and www names.',
    why: 'One canonical host avoids duplicate content.',
    choices: [
      { value: 'off', label: 'Off' },
      { value: 'to-apex', label: 'www to apex' },
      { value: 'to-www', label: 'Apex to www' },
    ],
    appliesTo: always,
  },
  {
    key: 'documentRoot',
    group: 'site',
    kind: 'text',
    label: 'Document root',
    help: 'Absolute path of the files to serve.',
    why: 'NGINX serves files below this directory.',
    docs: 'https://nginx.org/en/docs/http/ngx_http_core_module.html#root',
    placeholder: '/var/www/example.com/public',
    appliesTo: files,
  },
  {
    key: 'upstreams',
    group: 'site',
    kind: 'upstreams',
    label: 'Upstreams',
    help: 'host:port or unix:/path.sock. Mark spares as backup.',
    why: 'Backup servers only receive traffic when the others fail.',
    docs: 'https://nginx.org/en/docs/http/ngx_http_upstream_module.html#server',
    placeholder: '127.0.0.1:3000',
    appliesTo: hasBackend,
  },
  {
    key: 'https',
    group: 'https',
    kind: 'select',
    label: 'HTTPS',
    help: 'Where the certificate comes from.',
    why: 'Browsers and search engines expect TLS.',
    choices: [
      { value: 'off', label: 'Off' },
      { value: 'manual', label: 'Certificate files', help: 'You provide the files.' },
      { value: 'acme', label: 'Built-in ACME', help: 'NGINX gets the certificate.' },
    ],
    appliesTo: always,
  },
  {
    key: 'certificatePath',
    group: 'https',
    kind: 'text',
    label: 'Certificate path',
    help: 'Full chain PEM file.',
    why: 'Sent to clients during the TLS handshake.',
    placeholder: '/etc/nginx/tls/example.com/fullchain.pem',
    appliesTo: (o) => o.https === 'manual',
  },
  {
    key: 'acmeEmail',
    group: 'https',
    kind: 'text',
    label: 'ACME contact email',
    help: 'Used by the certificate authority for expiry notices.',
    why: 'Required by the ACME account.',
    placeholder: 'admin@example.com',
    appliesTo: (o) => o.https === 'acme',
  },
  {
    key: 'hsts',
    group: 'https',
    kind: 'select',
    label: 'HSTS',
    help: 'Tell browsers to always use HTTPS.',
    why: 'Prevents downgrade attacks. Preload is hard to undo.',
    docs: 'https://developer.mozilla.org/docs/Web/HTTP/Headers/Strict-Transport-Security',
    choices: [
      { value: 'off', label: 'Off' },
      { value: 'host', label: 'This host' },
      { value: 'subdomains', label: 'With subdomains' },
      { value: 'preload', label: 'Preload' },
    ],
    appliesTo: httpsOn,
  },
  {
    key: 'http3',
    group: 'https',
    kind: 'toggle',
    label: 'HTTP/3 (QUIC)',
    help: 'Also listen on UDP for HTTP/3.',
    why: 'Faster on lossy networks. Needs UDP open in the firewall.',
    experimental: true,
    appliesTo: httpsOn,
  },
  {
    key: 'gzip',
    group: 'performance',
    kind: 'toggle',
    label: 'Gzip compression',
    help: 'Compress text responses.',
    why: 'Smaller transfers. Risky for dynamic secrets (BREACH).',
    appliesTo: always,
  },
  {
    key: 'gzipLevel',
    group: 'performance',
    kind: 'number',
    label: 'Gzip level',
    help: '1 is fast, 9 is small.',
    why: 'Levels above 1 cost CPU for little gain.',
    min: 1,
    max: 9,
    advanced: true,
    appliesTo: (o) => o.gzip === true,
  },
  {
    key: 'immutablePaths',
    group: 'performance',
    kind: 'list',
    label: 'Immutable asset paths',
    help: 'URI prefixes with fingerprinted files.',
    why: 'Browsers cache them for a year without revalidating.',
    placeholder: '/assets/',
    appliesTo: files,
  },
  {
    key: 'clientMaxBodySize',
    group: 'security',
    kind: 'text',
    label: 'Max request body',
    help: 'Largest upload accepted, such as 16m.',
    why: 'Limits memory and disk use by abusive clients.',
    placeholder: '1m',
    appliesTo: always,
  },
  {
    key: 'frameOptions',
    group: 'security',
    kind: 'select',
    label: 'Framing',
    help: 'Who may embed the site in a frame.',
    why: 'Blocks clickjacking.',
    choices: [
      { value: 'off', label: 'Allow' },
      { value: 'sameorigin', label: 'Same origin' },
      { value: 'deny', label: 'Deny' },
    ],
    appliesTo: always,
  },
  {
    key: 'rateLimit',
    group: 'security',
    kind: 'select',
    label: 'Rate limit',
    help: 'Limit requests per client address.',
    why: 'Slows brute force and scraping.',
    choices: [
      { value: 'off', label: 'Off' },
      { value: 'on', label: 'On' },
      { value: 'dry-run', label: 'Dry run' },
    ],
    appliesTo: hasBackend,
  },
  {
    key: 'rateLimitRate',
    group: 'security',
    kind: 'number',
    label: 'Requests per second',
    help: 'Average allowed rate.',
    why: 'Sets the leaky bucket refill rate.',
    min: 1,
    max: 10000,
    unit: 'r/s',
    appliesTo: (o) => hasBackend(o) && o.rateLimit !== 'off',
  },
  {
    key: 'websocketPath',
    group: 'backend',
    kind: 'text',
    label: 'WebSocket path',
    help: 'URI prefix that upgrades to WebSocket.',
    why: 'Needs Upgrade headers and long timeouts.',
    placeholder: '/ws/',
    appliesTo: (o) => o.profile === 'proxy',
  },
  {
    key: 'proxyReadTimeout',
    group: 'backend',
    kind: 'number',
    label: 'Read timeout',
    help: 'How long to wait for the backend.',
    why: 'Slow endpoints fail with 504 after this time.',
    min: 1,
    max: 3600,
    unit: 's',
    advanced: true,
    appliesTo: (o) => o.profile === 'proxy',
  },
  {
    key: 'httpPort',
    group: 'advanced',
    kind: 'number',
    label: 'HTTP port',
    help: 'Port NGINX listens on.',
    why: 'Containers run unprivileged and use 8080.',
    min: 1,
    max: 65535,
    appliesTo: always,
  },
  {
    key: 'ipv6',
    group: 'advanced',
    kind: 'toggle',
    label: 'Listen on IPv6',
    help: 'Add [::] listeners.',
    why: 'Fails to start if the host has no IPv6.',
    appliesTo: always,
  },
]

export function defaultsFor(profile: Profile, target: Target): Options {
  const container = target === 'container'
  const fileProfile = profile === 'static' || profile === 'spa'
  return {
    profile,
    target,
    serverName: 'example.com',
    wwwRedirect: 'off',
    documentRoot: container ? '/usr/share/nginx/html' : '/var/www/example.com/public',
    upstreams: [
      {
        address:
          profile === 'php'
            ? container
              ? '127.0.0.1:9000'
              : 'unix:/run/php/php-fpm.sock'
            : '127.0.0.1:3000',
        backup: false,
      },
    ],
    https: 'off',
    certificatePath: '/etc/nginx/tls/example.com/fullchain.pem',
    acmeEmail: '',
    hsts: 'off',
    http3: false,
    gzip: fileProfile,
    gzipLevel: 1,
    immutablePaths: profile === 'spa' ? ['/assets/'] : profile === 'php' ? ['/build/'] : [],
    clientMaxBodySize: profile === 'php' ? '16m' : '1m',
    frameOptions: 'sameorigin',
    rateLimit: 'off',
    rateLimitRate: 10,
    websocketPath: '',
    proxyReadTimeout: 60,
    httpPort: container ? 8080 : 80,
    ipv6: !container,
  }
}

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

export function validateOptions(input: unknown): {
  valid: boolean
  errors: Record<string, string>
  options: Options | null
} {
  const errors: Record<string, string> = {}
  const o = input as Options
  if (!HOST.test(String(o.serverName ?? ''))) {
    errors.serverName = 'Enter a valid domain name, such as example.com.'
  }
  if (!/^\/[^\s;{}]*$/.test(String(o.documentRoot ?? ''))) {
    errors.documentRoot = 'Use an absolute path without spaces.'
  }
  if (o.https === 'acme' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(o.acmeEmail ?? ''))) {
    errors.acmeEmail = 'Enter a valid email address.'
  }
  if (!/^[1-9][0-9]{0,4}[km]$/.test(String(o.clientMaxBodySize ?? ''))) {
    errors.clientMaxBodySize = 'Use a number with k or m, such as 16m.'
  }
  const port = Number(o.httpPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.httpPort = 'Use a port from 1 to 65535.'
  }
  const level = Number(o.gzipLevel)
  if (!Number.isInteger(level) || level < 1 || level > 9) {
    errors.gzipLevel = 'Use a whole number from 1 to 9.'
  }
  if (Array.isArray(o.immutablePaths)) {
    const bad = (o.immutablePaths as string[]).find((p) => !/^\/[A-Za-z0-9._~/-]*\/$/.test(p))
    if (bad !== undefined) {
      errors.immutablePaths = `"${bad}" must start and end with a slash.`
    }
  }
  if (Array.isArray(o.upstreams)) {
    const bad = (o.upstreams as Upstream[]).find(
      (u) => !/^(unix:\/\S+|[A-Za-z0-9.-]+:[0-9]{1,5})$/.test(u.address),
    )
    if (bad !== undefined) {
      errors.upstreams = `"${bad.address}" must be host:port or unix:/path.`
    }
  }
  const valid = Object.keys(errors).length === 0
  return { valid, errors, options: valid ? o : null }
}

export function generateConfig(o: Options): string {
  const tls = o.https !== 'off'
  const lines: string[] = [
    `# nginx ${NGINX_VERSION} - ${o.profile} on ${o.target}`,
    'worker_processes auto;',
    '',
    'events {',
    '    worker_connections 4096;',
    '}',
    '',
    'http {',
    '    server_tokens off;',
    '    include mime.types;',
  ]
  if (o.gzip === true) {
    lines.push('    gzip on;', `    gzip_comp_level ${String(o.gzipLevel)};`)
  }
  if (o.profile === 'proxy' || o.profile === 'php') {
    lines.push('', '    upstream backend {')
    for (const u of o.upstreams as Upstream[]) {
      lines.push(`        server ${u.address}${u.backup ? ' backup' : ''};`)
    }
    lines.push('    }')
  }
  lines.push('', '    server {')
  lines.push(`        listen ${String(o.httpPort)};`)
  if (o.ipv6 === true) {
    lines.push(`        listen [::]:${String(o.httpPort)};`)
  }
  lines.push(`        server_name ${String(o.serverName)};`)
  if (tls) {
    lines.push('        # TLS')
    lines.push('        ssl_protocols TLSv1.2 TLSv1.3;')
    lines.push('        add_header Strict-Transport-Security "max-age=63072000" always;')
  }
  if (o.profile !== 'proxy') {
    lines.push(`        root ${String(o.documentRoot)};`)
  }
  lines.push(`        client_max_body_size ${String(o.clientMaxBodySize)};`)
  for (const path of (o.immutablePaths as string[]) ?? []) {
    lines.push('', `        location ^~ ${path} {`)
    lines.push('            add_header Cache-Control "public, max-age=31536000, immutable";')
    lines.push('        }')
  }
  lines.push('', '        location / {')
  if (o.profile === 'proxy') {
    lines.push('            proxy_pass http://backend;')
  } else if (o.profile === 'php') {
    lines.push('            try_files $uri $uri/ /index.php$is_args$args;')
  } else {
    lines.push(`            try_files $uri $uri/ ${o.profile === 'spa' ? '/index.html' : '=404'};`)
  }
  lines.push('        }', '    }', '}')
  return `${lines.join('\n')}\n`
}

export function deploySteps(o: Options): { title: string; command?: string; note?: string }[] {
  const steps: { title: string; command?: string; note?: string }[] = [
    { title: 'Save the file', command: 'sudo tee /etc/nginx/nginx.conf' },
    { title: 'Test the configuration', command: 'sudo nginx -t' },
    { title: 'Reload NGINX', command: 'sudo systemctl reload nginx' },
  ]
  if (o.https === 'acme') {
    steps.push({ title: 'Keep port 80 open', note: 'The ACME challenge needs public port 80.' })
  }
  return steps
}

export function warnings(o: Options): { level: 'info' | 'warn'; message: string; key?: string }[] {
  const list: { level: 'info' | 'warn'; message: string; key?: string }[] = []
  if (o.http3 === true) {
    list.push({ level: 'warn', message: 'HTTP/3 is experimental. Open UDP 443.', key: 'http3' })
  }
  if (o.hsts === 'preload') {
    list.push({ level: 'warn', message: 'HSTS preload is hard to undo.', key: 'hsts' })
  }
  if (o.gzip === true && (o.profile === 'php' || o.profile === 'proxy')) {
    list.push({ level: 'warn', message: 'Gzip on dynamic pages can enable BREACH.', key: 'gzip' })
  }
  return list
}
