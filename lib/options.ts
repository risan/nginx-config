import {
  isLoopbackHost,
  isStrictIPv4,
  isUnspecifiedHost,
  isValidHostname,
  isValidIPv6,
  isValidPort,
  parseCidr,
  parseHostPort
} from './addresses.ts';

export const SCHEMA_VERSION = 2;

export type Profile = 'static' | 'spa' | 'php' | 'proxy';
export type Target = 'host' | 'container';
export type GroupId = 'site' | 'https' | 'performance' | 'security' | 'backend' | 'advanced';
export type OptionKind = 'select' | 'toggle' | 'text' | 'number' | 'list' | 'upstreams';

export interface Choice {
  value: string;
  label: string;
  help?: string;
}

export interface Upstream {
  address: string;
  backup: boolean;
}

export type Options = Record<string, string | number | boolean | string[] | Upstream[]> & {
  profile: Profile;
  target: Target;
};

export interface OptionDef {
  key: string;
  group: GroupId;
  kind: OptionKind;
  label: string;
  help: string;
  why: string;
  docs?: string;
  choices?: Choice[];
  placeholder?: string;
  unit?: string;
  min?: number;
  max?: number;
  advanced?: boolean;
  experimental?: boolean;
  appliesTo(o: Options): boolean;
}

// The same keys as Options, with exact types. The renderer reads options through this.
export type ResolvedOptions = {
  profile: Profile;
  target: Target;
  serverName: string;
  wwwRedirect: 'off' | 'to-apex' | 'to-www';
  documentRoot: string;
  upstreams: Upstream[];
  https: 'off' | 'manual' | 'acme';
  certificatePath: string;
  certificateKeyPath: string;
  acmeEmail: string;
  acmeStaging: boolean;
  tlsProfile: 'intermediate' | 'modern';
  hsts: 'off' | 'host' | 'subdomains' | 'preload';
  http3: boolean;
  gzip: boolean;
  gzipLevel: number;
  gzipStatic: boolean;
  immutablePaths: string[];
  openFileCache: boolean;
  proxyCache: boolean;
  fastcgiCache: boolean;
  accessLogBuffer: boolean;
  clientMaxBodySize: string;
  frameOptions: 'off' | 'sameorigin' | 'deny';
  contentSecurityPolicy: string;
  cspReportOnly: boolean;
  permissionsPolicy: boolean;
  crossOriginOpenerPolicy: 'off' | 'same-origin-allow-popups' | 'same-origin';
  rateLimit: 'off' | 'on' | 'dry-run';
  rateLimitRate: number;
  rateLimitBurst: number;
  connLimit: number;
  realIp: 'off' | 'cloudflare' | 'custom';
  trustedProxies: string[];
  realIpHeader: 'X-Forwarded-For' | 'X-Real-IP' | 'proxy_protocol';
  loadBalancing: 'round-robin' | 'least-conn' | 'hash-ip';
  websocketPath: string;
  streamingPath: string;
  proxyReadTimeout: number;
  upstreamTls: boolean;
  upstreamTlsName: string;
  httpPort: number;
  httpsPort: number;
  publicHttpPort: number;
  publicHttpsPort: number;
  ipv6: boolean;
  workerConnections: number;
  workerUser: string;
  resolver: string;
  statusEndpoint: boolean;
};

export const PROFILES: { id: Profile; label: string; description: string }[] = [
  { id: 'static', label: 'Static site', description: 'Serve files from a folder. Missing paths return 404.' },
  { id: 'spa', label: 'Single-page app', description: 'Serve files and fall back to index.html for app routes.' },
  { id: 'php', label: 'PHP', description: 'Run PHP scripts through PHP-FPM.' },
  { id: 'proxy', label: 'Reverse proxy', description: 'Forward requests to one or more app servers.' }
];

export const TARGETS: { id: Target; label: string; description: string }[] = [
  { id: 'host', label: 'Server or VM', description: 'NGINX installed from packages. Ports 80 and 443, logs in /var/log/nginx.' },
  { id: 'container', label: 'Container', description: 'Non-root container. Ports 8080 and 8443, logs to stdout and stderr.' }
];

export const GROUPS: { id: GroupId; label: string; description: string }[] = [
  { id: 'site', label: 'Site', description: 'Domain name, files, and backend servers.' },
  { id: 'https', label: 'HTTPS', description: 'Certificates, TLS policy, and HTTP/3.' },
  { id: 'performance', label: 'Performance', description: 'Compression and caching.' },
  { id: 'security', label: 'Security', description: 'Headers, limits, and real client IPs.' },
  { id: 'backend', label: 'Backend', description: 'Options for the PHP or proxy backend.' },
  { id: 'advanced', label: 'Advanced', description: 'Ports, IPv6, and process settings.' }
];

const DOCS = {
  core: 'https://nginx.org/en/docs/http/ngx_http_core_module.html',
  coreMain: 'https://nginx.org/en/docs/ngx_core_module.html',
  proxy: 'https://nginx.org/en/docs/http/ngx_http_proxy_module.html',
  upstream: 'https://nginx.org/en/docs/http/ngx_http_upstream_module.html',
  ssl: 'https://nginx.org/en/docs/http/ngx_http_ssl_module.html',
  acme: 'https://nginx.org/en/docs/http/ngx_http_acme_module.html',
  v3: 'https://nginx.org/en/docs/http/ngx_http_v3_module.html',
  gzip: 'https://nginx.org/en/docs/http/ngx_http_gzip_module.html',
  gzipStatic: 'https://nginx.org/en/docs/http/ngx_http_gzip_static_module.html',
  realip: 'https://nginx.org/en/docs/http/ngx_http_realip_module.html',
  limitReq: 'https://nginx.org/en/docs/http/ngx_http_limit_req_module.html',
  limitConn: 'https://nginx.org/en/docs/http/ngx_http_limit_conn_module.html',
  headers: 'https://nginx.org/en/docs/http/ngx_http_headers_module.html',
  log: 'https://nginx.org/en/docs/http/ngx_http_log_module.html',
  fastcgi: 'https://nginx.org/en/docs/http/ngx_http_fastcgi_module.html',
  websocket: 'https://nginx.org/en/docs/http/websocket.html',
  serverNames: 'https://nginx.org/en/docs/http/server_names.html',
  stubStatus: 'https://nginx.org/en/docs/http/ngx_http_stub_status_module.html',
  mdnHsts: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security',
  mdnXfo: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Frame-Options',
  mdnCsp: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy',
  mdnPermissions: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy',
  mdnCoop: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy',
  tlsref: 'https://docs.tlsref.org/'
};

const PATH_PATTERN = /^\/(?:[A-Za-z0-9._~+@%=-]+\/)*[A-Za-z0-9._~+@%=-]+\/?$/;
const URI_PREFIX_PATTERN = /^\/[A-Za-z0-9._~/-]*$/;
const UNSAFE_TOKEN_PATTERN = /[\u0000-\u001f\u007f\s;{}"'`$\\]/;
const UNSAFE_HEADER_VALUE_PATTERN = /[\u0000-\u001f\u007f"\\${}]/;
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;
const BODY_SIZE_PATTERN = /^[1-9][0-9]{0,4}[km]$/;
const USER_PATTERN = /^[a-z_][a-z0-9_-]{0,31}$/;

const always = () => true;
const servesFiles = (o: Options) => o.profile !== 'proxy';
const hasBackend = (o: Options) => o.profile === 'php' || o.profile === 'proxy';
const isProxy = (o: Options) => o.profile === 'proxy';
const isPhp = (o: Options) => o.profile === 'php';
const httpsEnabled = (o: Options) => o.https !== 'off';

export function isValidPath(value: unknown, allowRoot = false): value is string {
  if (typeof value !== 'string' || value.length === 0 || UNSAFE_TOKEN_PATTERN.test(value) || !PATH_PATTERN.test(value)) {
    return false;
  }
  if (!allowRoot && value === '/') {
    return false;
  }

  return value.split('/').every((part) => part !== '.' && part !== '..');
}

function stripTrailingSlash(value: string): string {
  return value.length > 1 ? value.replace(/\/+$/, '') : value;
}

export type UpstreamAddress =
  | { kind: 'unix'; path: string }
  | { kind: 'address'; host: string; port: number; hostname: boolean };

// Returns null for text that is not a valid backend address.
export function parseUpstreamAddress(address: string): UpstreamAddress | null {
  if (address.startsWith('unix:')) {
    const path = address.slice('unix:'.length);

    return isValidPath(path) ? { kind: 'unix', path } : null;
  }

  const parsed = parseHostPort(address);
  if (!parsed) {
    return null;
  }

  const isIpLiteral = address.startsWith('[') || isStrictIPv4(parsed.host);
  const hostname = !isIpLiteral && parsed.host.toLowerCase() !== 'localhost';

  return { kind: 'address', host: parsed.host, port: parsed.port, hostname };
}

export function usesHostnameUpstream(upstreams: Upstream[]): boolean {
  return upstreams.some((upstream) => {
    const parsed = parseUpstreamAddress(upstream.address);

    return parsed?.kind === 'address' && parsed.hostname;
  });
}

export function canonicalServerName(o: Pick<ResolvedOptions, 'serverName' | 'wwwRedirect'>): string {
  const base = o.serverName.replace(/^www\./, '');

  return o.wwwRedirect === 'to-www' ? `www.${base}` : o.wwwRedirect === 'to-apex' ? base : o.serverName;
}

export function aliasServerName(o: Pick<ResolvedOptions, 'serverName' | 'wwwRedirect'>): string | null {
  if (o.wwwRedirect === 'off') {
    return null;
  }

  const base = o.serverName.replace(/^www\./, '');

  return o.wwwRedirect === 'to-www' ? base : `www.${base}`;
}

function defaultDocumentRoot(target: Target, serverName: string): string {
  return target === 'host' ? `/var/www/${serverName}/public` : '/usr/share/nginx/html';
}

// The certbot lineage name. The canonical name comes first in every certbot command, so it is the one name
// the certificate paths can rely on.
export function certificateName(o: Pick<ResolvedOptions, 'serverName' | 'wwwRedirect'>): string {
  return canonicalServerName(o);
}

export const CONTAINER_CERTIFICATE_ROOT = '/etc/nginx/tls';

function defaultCertificatePaths(target: Target, name: string): { certificatePath: string; certificateKeyPath: string } {
  const directory = target === 'host' ? `/etc/letsencrypt/live/${name}` : `${CONTAINER_CERTIFICATE_ROOT}/${name}`;

  return { certificatePath: `${directory}/fullchain.pem`, certificateKeyPath: `${directory}/privkey.pem` };
}

const WWW_REDIRECTS = ['off', 'to-apex', 'to-www'];

/**
 * Every default that follows the profile, the target, the server name, or the www redirect.
 * The UI calls this after one of those four changes and applies the result to fields the user has not edited.
 */
export function derivedDefaults(o: Options): Partial<Options> {
  const serverName = typeof o.serverName === 'string' ? o.serverName.toLowerCase() : 'example.com';
  const wwwRedirect = WWW_REDIRECTS.includes(o.wwwRedirect as string) ? (o.wwwRedirect as ResolvedOptions['wwwRedirect']) : 'off';
  const base = defaultsFor(o.profile, o.target);
  const name = certificateName({ serverName, wwwRedirect });

  return {
    documentRoot: defaultDocumentRoot(o.target, serverName),
    ...defaultCertificatePaths(o.target, name),
    upstreams: base.upstreams,
    httpPort: base.httpPort,
    httpsPort: base.httpsPort,
    ipv6: base.ipv6,
    workerConnections: base.workerConnections,
    resolver: base.resolver
  };
}

function defaultUpstreams(profile: Profile, target: Target): Upstream[] {
  if (profile === 'proxy') {
    return [{ address: '127.0.0.1:3000', backup: false }];
  }
  if (profile === 'php') {
    return [{ address: target === 'host' ? 'unix:/run/php/php-fpm.sock' : '127.0.0.1:9000', backup: false }];
  }

  return [];
}

export function defaultsFor(profile: Profile, target: Target): ResolvedOptions {
  const host = target === 'host';
  const serverName = 'example.com';
  const staticContent = profile === 'static' || profile === 'spa';

  return {
    profile,
    target,
    serverName,
    wwwRedirect: 'off',
    documentRoot: defaultDocumentRoot(target, serverName),
    upstreams: defaultUpstreams(profile, target),
    https: 'off',
    ...defaultCertificatePaths(target, serverName),
    acmeEmail: '',
    acmeStaging: false,
    tlsProfile: 'intermediate',
    hsts: 'off',
    http3: false,
    // Compressing dynamic pages can leak secrets (BREACH), so it is off for PHP and proxy.
    gzip: staticContent,
    gzipLevel: 1,
    gzipStatic: staticContent,
    immutablePaths: profile === 'spa' ? ['/assets/'] : profile === 'php' ? ['/build/'] : [],
    openFileCache: false,
    proxyCache: false,
    fastcgiCache: false,
    accessLogBuffer: false,
    clientMaxBodySize: profile === 'php' ? '16m' : '1m',
    frameOptions: 'sameorigin',
    contentSecurityPolicy: '',
    cspReportOnly: false,
    permissionsPolicy: false,
    crossOriginOpenerPolicy: 'off',
    rateLimit: 'off',
    rateLimitRate: 10,
    rateLimitBurst: 20,
    connLimit: 0,
    realIp: 'off',
    trustedProxies: [],
    realIpHeader: 'X-Forwarded-For',
    loadBalancing: 'round-robin',
    websocketPath: '',
    streamingPath: '',
    proxyReadTimeout: 60,
    upstreamTls: false,
    upstreamTlsName: '',
    httpPort: host ? 80 : 8080,
    httpsPort: host ? 443 : 8443,
    publicHttpPort: 80,
    publicHttpsPort: 443,
    ipv6: host,
    workerConnections: host ? 4096 : 1024,
    workerUser: 'nginx',
    resolver: host ? '127.0.0.53' : '127.0.0.11',
    statusEndpoint: false
  };
}

type Validator = (value: unknown, o: ResolvedOptions) => string | null;

interface OptionSpec extends OptionDef {
  validate: Validator;
}

function oneOf(choices: Choice[]): Validator {
  const allowed = choices.map((choice) => choice.value);

  return (value) => (typeof value === 'string' && allowed.includes(value) ? null : `Choose one of: ${allowed.join(', ')}.`);
}

function integerBetween(minimum: number, maximum: number): Validator {
  return (value) =>
    typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum
      ? null
      : `Use a whole number from ${minimum} to ${maximum}.`;
}

const isBoolean: Validator = (value) => (typeof value === 'boolean' ? null : 'Use true or false.');

const isPort: Validator = (value) => (isValidPort(value) ? null : 'Use a whole number from 1 to 65535.');

function absolutePath(allowEmpty = false): Validator {
  return (value) => {
    if (allowEmpty && value === '') {
      return null;
    }

    return isValidPath(value) ? null : 'Use an absolute path without spaces, quotes, or dot segments.';
  };
}

export function isValidHeaderValue(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 1000 && !UNSAFE_HEADER_VALUE_PATTERN.test(value);
}

function hasDotSegment(path: string): boolean {
  return path.split('/').some((part) => part === '.' || part === '..');
}

const ACME_CHALLENGE_PREFIX = '/.well-known/acme-challenge/';

// A prefix location matches by string prefix, so a path above, equal to, or below the challenge
// folder would take challenge requests away from the HTTP-01 location.
function overlapsAcmeChallenge(path: string): boolean {
  return ACME_CHALLENGE_PREFIX.startsWith(path) || path.startsWith(ACME_CHALLENGE_PREFIX.slice(0, -1));
}

function validateUriPrefix(value: string, label: string): string | null {
  if (value === '/' || !URI_PREFIX_PATTERN.test(value) || value.includes('//') || hasDotSegment(value)) {
    return `${label} must start with / and use letters, digits, dots, dashes, or slashes. It cannot be / alone.`;
  }
  if (overlapsAcmeChallenge(value)) {
    return `${label} cannot overlap ${ACME_CHALLENGE_PREFIX}, which is reserved for certificate challenges.`;
  }

  return null;
}

const CHOICES = {
  wwwRedirect: [
    { value: 'off', label: 'No redirect' },
    { value: 'to-apex', label: 'www to the bare domain', help: 'www.example.com goes to example.com.' },
    { value: 'to-www', label: 'Bare domain to www', help: 'example.com goes to www.example.com.' }
  ],
  https: [
    { value: 'off', label: 'Off (HTTP only)' },
    { value: 'manual', label: 'My own certificate files', help: 'You issue and renew the certificate, for example with certbot.' },
    { value: 'acme', label: 'Automatic (NGINX ACME module)', help: 'NGINX gets and renews Let\u2019s Encrypt certificates itself.' }
  ],
  tlsProfile: [
    { value: 'intermediate', label: 'Intermediate', help: 'TLS 1.2 and 1.3. Works with almost all clients.' },
    { value: 'modern', label: 'Modern', help: 'TLS 1.3 only. Older clients cannot connect.' }
  ],
  hsts: [
    { value: 'off', label: 'Off' },
    { value: 'host', label: 'This domain only', help: 'max-age of 2 years.' },
    { value: 'subdomains', label: 'Include subdomains', help: 'Every subdomain must work over HTTPS.' },
    { value: 'preload', label: 'Preload', help: 'Browsers ship the rule. Very hard to undo.' }
  ],
  frameOptions: [
    { value: 'off', label: 'Off' },
    { value: 'sameorigin', label: 'Same origin only' },
    { value: 'deny', label: 'Never allow framing' }
  ],
  crossOriginOpenerPolicy: [
    { value: 'off', label: 'Off' },
    { value: 'same-origin-allow-popups', label: 'Same origin, allow popups', help: 'Safe for most sign-in and payment popups.' },
    { value: 'same-origin', label: 'Same origin', help: 'Can break cross-origin popups.' }
  ],
  rateLimit: [
    { value: 'off', label: 'Off' },
    { value: 'on', label: 'On', help: 'Extra requests get status 429.' },
    { value: 'dry-run', label: 'Log only (dry run)', help: 'Count and log, but never block.' }
  ],
  realIp: [
    { value: 'off', label: 'No, clients connect directly' },
    { value: 'cloudflare', label: 'Cloudflare', help: 'Trusts the published Cloudflare address ranges.' },
    { value: 'custom', label: 'Another proxy or load balancer' }
  ],
  realIpHeader: [
    { value: 'X-Forwarded-For', label: 'X-Forwarded-For' },
    { value: 'X-Real-IP', label: 'X-Real-IP' },
    { value: 'proxy_protocol', label: 'PROXY protocol', help: 'The proxy must send the PROXY protocol header.' }
  ],
  loadBalancing: [
    { value: 'round-robin', label: 'Round robin' },
    { value: 'least-conn', label: 'Least connections' },
    { value: 'hash-ip', label: 'Same client, same server', help: 'Hash of the client IP. Cannot use backup servers.' }
  ]
} satisfies Record<string, Choice[]>;

function listOfText(label: string, maximumItems: number): Validator {
  return (value) => {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      return `${label} must be a list of text values.`;
    }
    if (value.length > maximumItems) {
      return `Use at most ${maximumItems} entries.`;
    }

    return null;
  };
}

const SPECS: OptionSpec[] = [
  {
    key: 'serverName',
    group: 'site',
    kind: 'text',
    label: 'Domain name',
    help: 'The domain this site answers for.',
    why: 'NGINX picks this site by the Host name in each request. Requests for any other name are closed without an answer.',
    docs: DOCS.serverNames,
    placeholder: 'example.com',
    appliesTo: always,
    validate: (value) => (isValidHostname(value) ? null : 'Use one domain name or IPv4 address, with no spaces or punctuation.')
  },
  {
    key: 'wwwRedirect',
    group: 'site',
    kind: 'select',
    label: 'www redirect',
    help: 'Send one of the two names to the other.',
    why: 'Search engines and cookies treat www.example.com and example.com as different sites. A permanent redirect keeps one address. With HTTPS the certificate must cover both names.',
    docs: DOCS.serverNames,
    choices: CHOICES.wwwRedirect,
    appliesTo: always,
    validate: oneOf(CHOICES.wwwRedirect)
  },
  {
    key: 'documentRoot',
    group: 'site',
    kind: 'text',
    label: 'Files folder',
    help: 'The folder NGINX serves files from.',
    why: 'This is the root of your site on disk. The NGINX user needs read access to it.',
    docs: `${DOCS.core}#root`,
    placeholder: '/var/www/example.com/public',
    appliesTo: servesFiles,
    validate: absolutePath()
  },
  {
    key: 'upstreams',
    group: 'site',
    kind: 'upstreams',
    label: 'Backend servers',
    help: 'host:port, or unix:/path for a socket. Add backups for failover.',
    why: 'NGINX forwards dynamic requests to these servers. With two or more, a failed server is skipped for a while. A backup server only gets traffic when the others are down.',
    docs: `${DOCS.upstream}#server`,
    placeholder: '127.0.0.1:3000',
    appliesTo: hasBackend,
    validate: () => null
  },
  {
    key: 'https',
    group: 'https',
    kind: 'select',
    label: 'HTTPS',
    help: 'Encrypt traffic with TLS and redirect HTTP to HTTPS.',
    why: 'Browsers mark plain HTTP as not secure and HTTP/2 needs TLS. Use your own certificate files, or let the NGINX ACME module get one from Let\u2019s Encrypt.',
    docs: DOCS.ssl,
    choices: CHOICES.https,
    appliesTo: always,
    validate: oneOf(CHOICES.https)
  },
  {
    key: 'certificatePath',
    group: 'https',
    kind: 'text',
    label: 'Certificate file',
    help: 'Full chain file (certificate plus intermediates).',
    why: 'Clients need the intermediate certificates to trust yours. certbot calls this file fullchain.pem.',
    docs: `${DOCS.ssl}#ssl_certificate`,
    placeholder: '/etc/letsencrypt/live/example.com/fullchain.pem',
    appliesTo: (o) => o.https === 'manual',
    validate: absolutePath()
  },
  {
    key: 'certificateKeyPath',
    group: 'https',
    kind: 'text',
    label: 'Private key file',
    help: 'The key that belongs to the certificate.',
    why: 'Keep this file readable only by root. NGINX reads it at start while it still runs as root.',
    docs: `${DOCS.ssl}#ssl_certificate_key`,
    placeholder: '/etc/letsencrypt/live/example.com/privkey.pem',
    appliesTo: (o) => o.https === 'manual',
    validate: absolutePath()
  },
  {
    key: 'acmeEmail',
    group: 'https',
    kind: 'text',
    label: 'Contact email',
    help: 'Let\u2019s Encrypt sends expiry notices here.',
    why: 'The ACME account needs a contact address. NGINX also accepts the Let\u2019s Encrypt terms of service for you.',
    docs: `${DOCS.acme}#contact`,
    placeholder: 'admin@example.com',
    appliesTo: (o) => o.https === 'acme',
    validate: (value) =>
      value === '' || (typeof value === 'string' && value.length <= 254 && EMAIL_PATTERN.test(value)) ? null : 'Use a valid email address.'
  },
  {
    key: 'acmeStaging',
    group: 'https',
    kind: 'toggle',
    label: 'Use the staging server',
    help: 'Test certificates that browsers do not trust.',
    why: 'The production server limits failed attempts. Use staging until issuing works, then turn this off.',
    docs: 'https://letsencrypt.org/docs/staging-environment/',
    appliesTo: (o) => o.https === 'acme',
    validate: isBoolean
  },
  {
    key: 'tlsProfile',
    group: 'https',
    kind: 'select',
    label: 'TLS policy',
    help: 'Which TLS versions and ciphers clients may use.',
    why: 'Intermediate follows the Mozilla guideline and works with nearly every client. Modern allows only TLS 1.3 and is stricter.',
    docs: DOCS.tlsref,
    choices: CHOICES.tlsProfile,
    appliesTo: httpsEnabled,
    validate: oneOf(CHOICES.tlsProfile)
  },
  {
    key: 'hsts',
    group: 'https',
    kind: 'select',
    label: 'HSTS',
    help: 'Tell browsers to use HTTPS only for this site.',
    why: 'After the first visit the browser refuses plain HTTP for 2 years. Preload adds the domain to lists shipped inside browsers, and removal takes months.',
    docs: DOCS.mdnHsts,
    choices: CHOICES.hsts,
    appliesTo: httpsEnabled,
    validate: oneOf(CHOICES.hsts)
  },
  {
    key: 'http3',
    group: 'https',
    kind: 'toggle',
    label: 'HTTP/3 (QUIC)',
    help: 'Also answer on UDP. Experimental in NGINX.',
    why: 'HTTP/3 can load pages faster on bad networks. NGINX still marks the module experimental. You must open the HTTPS port for UDP too.',
    docs: DOCS.v3,
    experimental: true,
    appliesTo: httpsEnabled,
    validate: isBoolean
  },
  {
    key: 'gzip',
    group: 'performance',
    kind: 'toggle',
    label: 'Compress responses (gzip)',
    help: 'Shrink text files on the fly.',
    why: 'Text, JSON, and SVG compress well. For pages that change per user, compression can leak secrets (BREACH), so it is off by default for PHP and proxy.',
    docs: DOCS.gzip,
    appliesTo: always,
    validate: isBoolean
  },
  {
    key: 'gzipLevel',
    group: 'performance',
    kind: 'number',
    label: 'gzip level',
    help: 'Higher saves more bytes and uses more CPU.',
    why: 'Level 1 is the NGINX default and gets most of the gain. Raise it only after you measure CPU use.',
    docs: `${DOCS.gzip}#gzip_comp_level`,
    min: 1,
    max: 9,
    advanced: true,
    appliesTo: (o) => o.gzip === true,
    validate: integerBetween(1, 9)
  },
  {
    key: 'gzipStatic',
    group: 'performance',
    kind: 'toggle',
    label: 'Serve prebuilt .gz files',
    help: 'Use file.js.gz next to file.js when it exists.',
    why: 'Your build compresses files once, so NGINX spends no CPU per request. The .gz file must have the same modification time as the original. Without a .gz file this costs one extra file lookup.',
    docs: DOCS.gzipStatic,
    appliesTo: servesFiles,
    validate: isBoolean
  },
  {
    key: 'immutablePaths',
    group: 'performance',
    kind: 'list',
    label: 'Cache forever under these paths',
    help: 'Folders whose file names contain a content hash.',
    why: 'Files like /assets/app-3f9a1c.js change name when they change, so browsers can keep them for a year. Only list folders where every name has a hash. Each path starts and ends with /.',
    docs: `${DOCS.headers}#add_header`,
    placeholder: '/assets/',
    appliesTo: servesFiles,
    validate: listOfText('Cache paths', 20)
  },
  {
    key: 'openFileCache',
    group: 'performance',
    kind: 'toggle',
    label: 'Cache open files',
    help: 'Remember file handles and sizes for a short time.',
    why: 'Saves file system lookups on busy sites with many small files. Changed files can show up to 30 seconds late.',
    docs: `${DOCS.core}#open_file_cache`,
    advanced: true,
    appliesTo: servesFiles,
    validate: isBoolean
  },
  {
    key: 'proxyCache',
    group: 'performance',
    kind: 'toggle',
    label: 'Cache public responses',
    help: 'Keep GET responses for 10 minutes.',
    why: 'Repeat requests are answered by NGINX without asking the backend. Requests with cookies or Authorization, and responses with Set-Cookie, private, or no-store, are never cached.',
    docs: `${DOCS.proxy}#proxy_cache`,
    appliesTo: isProxy,
    validate: isBoolean
  },
  {
    key: 'fastcgiCache',
    group: 'performance',
    kind: 'toggle',
    label: 'Cache public PHP responses',
    help: 'Keep GET responses for 10 minutes.',
    why: 'Repeat requests skip PHP. Requests with cookies or Authorization, and responses with Set-Cookie, private, or no-store, are never cached. Check your app before you enable this.',
    docs: `${DOCS.fastcgi}#fastcgi_cache`,
    appliesTo: isPhp,
    validate: isBoolean
  },
  {
    key: 'accessLogBuffer',
    group: 'performance',
    kind: 'toggle',
    label: 'Buffer access log writes',
    help: 'Write the log in batches of 32k, or every 5 seconds.',
    why: 'Fewer writes help on busy servers. A crash can lose the last few seconds of log lines.',
    docs: `${DOCS.log}#access_log`,
    advanced: true,
    appliesTo: always,
    validate: isBoolean
  },
  {
    key: 'clientMaxBodySize',
    group: 'security',
    kind: 'text',
    label: 'Largest upload',
    help: 'Biggest request body NGINX accepts, for example 1m or 16m.',
    why: 'Bigger requests get status 413. NGINX does not allow turning this check off here, because unlimited uploads can fill your disk.',
    docs: `${DOCS.core}#client_max_body_size`,
    placeholder: '1m',
    appliesTo: always,
    validate: (value) => (typeof value === 'string' && BODY_SIZE_PATTERN.test(value) ? null : 'Use a number with k or m, for example 512k or 16m.')
  },
  {
    key: 'frameOptions',
    group: 'security',
    kind: 'select',
    label: 'Clickjacking protection',
    help: 'Control which sites may show yours in a frame.',
    why: 'Other sites can hide your page in a frame and trick users into clicking. This sends X-Frame-Options and the matching frame-ancestors rule.',
    docs: DOCS.mdnXfo,
    choices: CHOICES.frameOptions,
    appliesTo: always,
    validate: oneOf(CHOICES.frameOptions)
  },
  {
    key: 'contentSecurityPolicy',
    group: 'security',
    kind: 'text',
    label: 'Content-Security-Policy',
    help: 'Leave empty to send none.',
    why: 'A policy limits where scripts and styles can load from. A wrong policy breaks your site, so test it in report-only mode first.',
    docs: DOCS.mdnCsp,
    placeholder: "default-src 'self'; object-src 'none'; base-uri 'self'",
    advanced: true,
    appliesTo: always,
    validate: (value) =>
      value === '' || isValidHeaderValue(value)
        ? null
        : 'Use at most 1000 characters. Quotes ("), backslashes, $, braces, and line breaks are not allowed.'
  },
  {
    key: 'cspReportOnly',
    group: 'security',
    kind: 'toggle',
    label: 'Report only',
    help: 'Browsers log violations but do not block.',
    why: 'Lets you see what a policy would break before you enforce it. The frame-ancestors rule is still enforced.',
    docs: DOCS.mdnCsp,
    advanced: true,
    appliesTo: (o) => typeof o.contentSecurityPolicy === 'string' && o.contentSecurityPolicy !== '',
    validate: isBoolean
  },
  {
    key: 'permissionsPolicy',
    group: 'security',
    kind: 'toggle',
    label: 'Turn off powerful browser features',
    help: 'Blocks camera, microphone, location, payment, and USB.',
    why: 'Your pages and any embedded frames cannot ask for these features. Turn it off if your site needs one of them.',
    docs: DOCS.mdnPermissions,
    appliesTo: always,
    validate: isBoolean
  },
  {
    key: 'crossOriginOpenerPolicy',
    group: 'security',
    kind: 'select',
    label: 'Cross-Origin-Opener-Policy',
    help: 'Isolate your page from windows opened by other sites.',
    why: 'Protects against some cross-window attacks. The strict value breaks sign-in and payment popups.',
    docs: DOCS.mdnCoop,
    choices: CHOICES.crossOriginOpenerPolicy,
    advanced: true,
    appliesTo: always,
    validate: oneOf(CHOICES.crossOriginOpenerPolicy)
  },
  {
    key: 'rateLimit',
    group: 'security',
    kind: 'select',
    label: 'Rate limit',
    help: 'Limit requests per client IP on dynamic pages.',
    why: 'Slows down password guessing and scraping. Static files are not counted. Behind a CDN, also set the real client IP, or all users share one limit.',
    docs: DOCS.limitReq,
    choices: CHOICES.rateLimit,
    appliesTo: hasBackend,
    validate: oneOf(CHOICES.rateLimit)
  },
  {
    key: 'rateLimitRate',
    group: 'security',
    kind: 'number',
    label: 'Requests per second',
    help: 'Sustained rate allowed for each client IP.',
    why: 'Requests above this rate wait or fail, depending on the burst size.',
    docs: `${DOCS.limitReq}#limit_req_zone`,
    unit: 'r/s',
    min: 1,
    max: 10000,
    appliesTo: (o) => hasBackend(o) && o.rateLimit !== 'off',
    validate: integerBetween(1, 10000)
  },
  {
    key: 'rateLimitBurst',
    group: 'security',
    kind: 'number',
    label: 'Burst size',
    help: 'Extra requests allowed at once. 0 means none.',
    why: 'Pages often send several requests together. A burst lets them through without delay.',
    docs: `${DOCS.limitReq}#limit_req`,
    unit: 'requests',
    min: 0,
    max: 10000,
    appliesTo: (o) => hasBackend(o) && o.rateLimit !== 'off',
    validate: integerBetween(0, 10000)
  },
  {
    key: 'connLimit',
    group: 'security',
    kind: 'number',
    label: 'Connections per client IP',
    help: '0 means no limit.',
    why: 'Stops one client from holding many connections. With HTTP/2 and HTTP/3, each running request counts as a connection.',
    docs: DOCS.limitConn,
    unit: 'connections',
    min: 0,
    max: 10000,
    advanced: true,
    appliesTo: always,
    validate: integerBetween(0, 10000)
  },
  {
    key: 'realIp',
    group: 'security',
    kind: 'select',
    label: 'Behind a CDN or load balancer?',
    help: 'Read the real client IP from the proxy in front of NGINX.',
    why: 'Without this, logs and rate limits see the proxy address, not the visitor. NGINX only trusts the header from the proxy ranges you list.',
    docs: DOCS.realip,
    choices: CHOICES.realIp,
    appliesTo: always,
    validate: oneOf(CHOICES.realIp)
  },
  {
    key: 'trustedProxies',
    group: 'security',
    kind: 'list',
    label: 'Trusted proxy addresses',
    help: 'IPs or CIDR ranges of your proxy. /0 is not allowed.',
    why: 'Only these addresses may tell NGINX the client IP and the original scheme. Trusting too much lets anyone fake their IP.',
    docs: `${DOCS.realip}#set_real_ip_from`,
    placeholder: '203.0.113.0/24',
    appliesTo: (o) => o.realIp === 'custom',
    validate: listOfText('Trusted proxies', 200)
  },
  {
    key: 'realIpHeader',
    group: 'security',
    kind: 'select',
    label: 'Client IP header',
    help: 'The header where your proxy puts the client IP.',
    why: 'Use the header your proxy really sets. PROXY protocol sends the IP before the HTTP request and needs proxy support.',
    docs: `${DOCS.realip}#real_ip_header`,
    choices: CHOICES.realIpHeader,
    appliesTo: (o) => o.realIp === 'custom',
    validate: oneOf(CHOICES.realIpHeader)
  },
  {
    key: 'loadBalancing',
    group: 'backend',
    kind: 'select',
    label: 'Balancing method',
    help: 'How requests are shared between backend servers.',
    why: 'Round robin takes turns. Least connections prefers the least busy server. The hash method keeps the same client on the same server.',
    docs: `${DOCS.upstream}#least_conn`,
    choices: CHOICES.loadBalancing,
    appliesTo: (o) => isProxy(o) && Array.isArray(o.upstreams) && o.upstreams.length >= 2,
    validate: oneOf(CHOICES.loadBalancing)
  },
  {
    key: 'websocketPath',
    group: 'backend',
    kind: 'text',
    label: 'WebSocket path',
    help: 'Optional. Path prefix that upgrades to WebSocket, for example /ws/.',
    why: 'Only this path gets WebSocket headers and long timeouts. Other requests keep normal connection reuse to the backend.',
    docs: DOCS.websocket,
    placeholder: '/ws/',
    appliesTo: isProxy,
    validate: (value) => (value === '' ? null : typeof value === 'string' ? validateUriPrefix(value, 'The path') : 'Use text.')
  },
  {
    key: 'streamingPath',
    group: 'backend',
    kind: 'text',
    label: 'Streaming path',
    help: 'Optional. Path prefix for server-sent events, for example /events/.',
    why: 'Turns off response buffering for this path only, so events arrive at once. Your app can also send the X-Accel-Buffering: no header instead.',
    docs: `${DOCS.proxy}#proxy_buffering`,
    placeholder: '/events/',
    appliesTo: isProxy,
    validate: (value) => (value === '' ? null : typeof value === 'string' ? validateUriPrefix(value, 'The path') : 'Use text.')
  },
  {
    key: 'proxyReadTimeout',
    group: 'backend',
    kind: 'number',
    label: 'Backend read timeout',
    help: 'How long NGINX waits for the next part of a response.',
    why: 'The NGINX default is 60 seconds. Raise it only for slow endpoints, because a stuck request holds a connection that long.',
    docs: `${DOCS.proxy}#proxy_read_timeout`,
    unit: 'seconds',
    min: 1,
    max: 3600,
    advanced: true,
    appliesTo: isProxy,
    validate: integerBetween(1, 3600)
  },
  {
    key: 'upstreamTls',
    group: 'backend',
    kind: 'toggle',
    label: 'Backend uses HTTPS',
    help: 'Connect to the backend over TLS and check its certificate.',
    why: 'Protects traffic between NGINX and a backend on another machine. NGINX does not check backend certificates unless asked, so this turns checking on.',
    docs: `${DOCS.proxy}#proxy_ssl_verify`,
    advanced: true,
    appliesTo: isProxy,
    validate: isBoolean
  },
  {
    key: 'upstreamTlsName',
    group: 'backend',
    kind: 'text',
    label: 'Backend certificate name',
    help: 'The name in the backend certificate.',
    why: 'NGINX sends it as SNI and checks the certificate against it. Without a name, a certificate for any host would pass.',
    docs: `${DOCS.proxy}#proxy_ssl_name`,
    placeholder: 'app.internal',
    advanced: true,
    appliesTo: (o) => isProxy(o) && o.upstreamTls === true,
    validate: (value) => (value === '' || isValidHostname(value) ? null : 'Use a domain name.')
  },
  {
    key: 'httpPort',
    group: 'advanced',
    kind: 'number',
    label: 'HTTP listen port',
    help: 'The port NGINX binds for plain HTTP.',
    why: 'Ports below 1024 need root. A non-root container must use a high port and publish it as 80.',
    docs: `${DOCS.core}#listen`,
    min: 1,
    max: 65535,
    advanced: true,
    appliesTo: always,
    validate: isPort
  },
  {
    key: 'httpsPort',
    group: 'advanced',
    kind: 'number',
    label: 'HTTPS listen port',
    help: 'The port NGINX binds for HTTPS.',
    why: 'Used for TLS and for HTTP/3 over UDP. Must differ from the HTTP port.',
    docs: `${DOCS.core}#listen`,
    min: 1,
    max: 65535,
    advanced: true,
    appliesTo: httpsEnabled,
    validate: isPort
  },
  {
    key: 'publicHttpPort',
    group: 'advanced',
    kind: 'number',
    label: 'Public HTTP port',
    help: 'The port visitors use for HTTP.',
    why: 'In a container, 8080 is published as 80. NGINX needs the public number to build correct redirects and forwarded headers.',
    docs: `${DOCS.core}#listen`,
    min: 1,
    max: 65535,
    advanced: true,
    appliesTo: always,
    validate: isPort
  },
  {
    key: 'publicHttpsPort',
    group: 'advanced',
    kind: 'number',
    label: 'Public HTTPS port',
    help: 'The port visitors use for HTTPS.',
    why: 'Used in redirects, X-Forwarded-Port, and the HTTP/3 Alt-Svc header. A wrong value sends visitors to a closed port.',
    docs: `${DOCS.core}#absolute_redirect`,
    min: 1,
    max: 65535,
    advanced: true,
    appliesTo: (o) => httpsEnabled(o) || o.realIp !== 'off',
    validate: isPort
  },
  {
    key: 'ipv6',
    group: 'advanced',
    kind: 'toggle',
    label: 'Listen on IPv6',
    help: 'Add a [::] listener next to every IPv4 listener.',
    why: 'NGINX fails to start if the host has IPv6 turned off. Containers usually have no IPv6, so this is off for containers.',
    docs: `${DOCS.core}#listen`,
    advanced: true,
    appliesTo: always,
    validate: isBoolean
  },
  {
    key: 'workerConnections',
    group: 'advanced',
    kind: 'number',
    label: 'Connections per worker',
    help: 'Open connections one worker process can hold.',
    why: 'Every connection uses a file descriptor. The file limit must be at least this high, and the proxy uses two descriptors per request.',
    docs: `${DOCS.coreMain}#worker_connections`,
    min: 512,
    max: 65535,
    advanced: true,
    appliesTo: always,
    validate: integerBetween(512, 65535)
  },
  {
    key: 'workerUser',
    group: 'advanced',
    kind: 'text',
    label: 'Worker user',
    help: 'The user that runs NGINX worker processes.',
    why: 'Workers should not run as root. Debian and Ubuntu packages use www-data, the nginx.org packages use nginx.',
    docs: `${DOCS.coreMain}#user`,
    placeholder: 'nginx',
    advanced: true,
    appliesTo: (o) => o.target === 'host',
    validate: (value) => (typeof value === 'string' && USER_PATTERN.test(value) ? null : 'Use a lowercase user name such as nginx or www-data.')
  },
  {
    key: 'resolver',
    group: 'advanced',
    kind: 'text',
    label: 'DNS resolver',
    help: 'IP address of a DNS server. Separate several with spaces.',
    why: 'NGINX needs a resolver to look up backend host names while it runs, and for the ACME module. 127.0.0.11 is the Docker DNS, 127.0.0.53 is systemd-resolved.',
    docs: `${DOCS.core}#resolver`,
    placeholder: '127.0.0.53',
    advanced: true,
    appliesTo: (o) => o.https === 'acme' || (hasBackend(o) && Array.isArray(o.upstreams) && usesHostnameUpstream(o.upstreams as Upstream[])),
    validate: (value) => {
      if (typeof value !== 'string' || value.length === 0) {
        return 'Use one or more IP addresses separated by spaces.';
      }

      const addresses = value.split(' ');
      const valid = addresses.length <= 4 && addresses.every((address) => isStrictIPv4(address) || isValidIPv6(address));

      return valid ? null : 'Use up to 4 IP addresses separated by single spaces.';
    }
  },
  {
    key: 'statusEndpoint',
    group: 'advanced',
    kind: 'toggle',
    label: 'Status page on localhost',
    help: 'Serve /nginx_status on 127.0.0.1 only (port 8081, or the next free one).',
    why: 'Shows connection counts for monitoring tools. It listens on loopback only, so it is not reachable from outside.',
    docs: DOCS.stubStatus,
    advanced: true,
    appliesTo: always,
    validate: isBoolean
  }
];

export const OPTIONS: OptionDef[] = SPECS;

const OPTION_KEYS = new Set<string>(['profile', 'target', ...SPECS.map((spec) => spec.key)]);

function setError(errors: Record<string, string>, key: string, message: string): void {
  // defineProperty avoids the __proto__ setter when hostile JSON reaches this code.
  Object.defineProperty(errors, key, { configurable: true, enumerable: true, value: message, writable: true });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function validateUpstreams(value: unknown, errors: Record<string, string>): Upstream[] | null {
  if (!Array.isArray(value)) {
    setError(errors, 'upstreams', 'Use a list of backend servers.');

    return null;
  }
  if (value.length > 20) {
    setError(errors, 'upstreams', 'Use at most 20 backend servers.');

    return null;
  }

  const upstreams: Upstream[] = [];
  const seen = new Set<string>();
  value.forEach((item: unknown, index) => {
    if (!isPlainObject(item)) {
      setError(errors, `upstreams.${index}`, 'Each backend server needs an address.');

      return;
    }
    for (const key of Object.keys(item)) {
      if (key !== 'address' && key !== 'backup') {
        setError(errors, `upstreams.${index}.${key}`, 'Unknown field.');
      }
    }

    const address = item.address;
    if (typeof address !== 'string' || !parseUpstreamAddress(address)) {
      setError(errors, `upstreams.${index}.address`, 'Use host:port, [ipv6]:port, or unix:/absolute/path.');

      return;
    }
    if (item.backup !== undefined && typeof item.backup !== 'boolean') {
      setError(errors, `upstreams.${index}.backup`, 'Use true or false.');

      return;
    }
    if (seen.has(address)) {
      setError(errors, `upstreams.${index}.address`, 'This server is listed twice.');

      return;
    }

    seen.add(address);
    upstreams.push({ address, backup: item.backup === true });
  });

  return upstreams;
}

function validateImmutablePaths(value: unknown, errors: Record<string, string>): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  (value as string[]).forEach((path, index) => {
    const key = `immutablePaths.${index}`;
    const problem = validateUriPrefix(path, 'The path');
    if (!path.endsWith('/') || !path.startsWith('/') || problem) {
      setError(errors, key, problem?.includes('reserved') ? problem : 'Start and end with /, use only letters, digits, dots, dashes, and slashes, and do not use / alone.');
    } else if (seen.has(path)) {
      setError(errors, key, 'This path is listed twice.');
    } else {
      seen.add(path);
      paths.push(path);
    }
  });

  return paths;
}

function validateTrustedProxies(value: unknown, errors: Record<string, string>): string[] {
  const proxies: string[] = [];
  const seen = new Set<string>();
  (value as string[]).forEach((entry, index) => {
    const key = `trustedProxies.${index}`;
    if (!parseCidr(entry)) {
      setError(errors, key, 'Use an IP or CIDR range such as 203.0.113.0/24. A /0 range is not allowed.');
    } else if (seen.has(entry)) {
      setError(errors, key, 'This range is listed twice.');
    } else {
      seen.add(entry);
      proxies.push(entry);
    }
  });

  return proxies;
}

function mergeInput(input: Record<string, unknown>, profile: Profile, target: Target): Record<string, unknown> {
  const defaults = defaultsFor(profile, target);
  const merged: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(input)) {
    if (OPTION_KEYS.has(key) && hasOwn(input, key)) {
      merged[key] = input[key];
    }
  }

  merged.profile = profile;
  merged.target = target;

  // Paths that follow the server name or the target keep following it unless the caller set them.
  const serverName = typeof merged.serverName === 'string' ? merged.serverName.toLowerCase() : defaults.serverName;
  if (typeof merged.serverName === 'string') {
    merged.serverName = serverName;
  }
  if (!hasOwn(input, 'documentRoot')) {
    merged.documentRoot = defaultDocumentRoot(target, serverName);
  }

  const wwwRedirect = WWW_REDIRECTS.includes(merged.wwwRedirect as string) ? (merged.wwwRedirect as ResolvedOptions['wwwRedirect']) : 'off';
  const certificates = defaultCertificatePaths(target, certificateName({ serverName, wwwRedirect }));
  if (!hasOwn(input, 'certificatePath')) {
    merged.certificatePath = certificates.certificatePath;
  }
  if (!hasOwn(input, 'certificateKeyPath')) {
    merged.certificateKeyPath = certificates.certificateKeyPath;
  }

  return merged;
}

function validateRelationships(o: ResolvedOptions, errors: Record<string, string>, failed: (key: string) => boolean): void {
  const applies = (key: string) => !failed(key) && SPECS.find((spec) => spec.key === key)!.appliesTo(o);

  if (o.target === 'container' && o.https === 'manual') {
    for (const key of ['certificatePath', 'certificateKeyPath'] as const) {
      if (!failed(key) && !o[key].startsWith(`${CONTAINER_CERTIFICATE_ROOT}/`)) {
        setError(errors, key, `In a container, certificate files must be under ${CONTAINER_CERTIFICATE_ROOT}/, the folder you mount.`);
      }
    }
  }

  if (applies('httpsPort') && o.httpsPort === o.httpPort) {
    setError(errors, 'httpsPort', 'The HTTPS port must differ from the HTTP port.');
  }

  const firstLabelOnly = !o.serverName.includes('.');
  const isIpAddress = /^[0-9.]+$/.test(o.serverName);
  if (o.https === 'acme' && (firstLabelOnly || isIpAddress)) {
    setError(errors, 'https', 'Automatic certificates need a public domain name, not localhost or an IP address.');
  }
  if (o.wwwRedirect !== 'off' && (firstLabelOnly || isIpAddress)) {
    setError(errors, 'wwwRedirect', 'The www redirect needs a domain name such as example.com.');
  }

  if (hasBackend(o)) {
    validateBackendRelationships(o, errors);
  }

  if (applies('http3') && o.http3 && o.realIp === 'custom' && o.realIpHeader === 'proxy_protocol') {
    setError(errors, 'http3', 'HTTP/3 cannot be used with the PROXY protocol, because QUIC runs over UDP.');
  }
  if (o.realIp === 'custom' && o.trustedProxies.length === 0 && !failed('trustedProxies')) {
    setError(errors, 'trustedProxies', 'Add at least one proxy address, or choose No.');
  }
  if (o.https === 'acme' && o.acmeEmail === '') {
    setError(errors, 'acmeEmail', 'Enter a contact email for Let’s Encrypt.');
  }
  if (applies('upstreamTlsName') && o.upstreamTlsName === '' && !failed('upstreamTlsName')) {
    setError(errors, 'upstreamTlsName', 'Enter the name in the backend certificate.');
  }
  if (applies('cspReportOnly') && o.cspReportOnly && o.contentSecurityPolicy === '') {
    setError(errors, 'cspReportOnly', 'Report-only needs a policy.');
  }

  if (isProxy(o) && o.websocketPath !== '' && o.websocketPath === o.streamingPath) {
    setError(errors, 'streamingPath', 'The streaming path must differ from the WebSocket path.');
  }
  for (const key of ['websocketPath', 'streamingPath'] as const) {
    if (isProxy(o) && o[key] === '/healthz') {
      setError(errors, key, '/healthz is reserved for the health check.');
    }
  }
}

function validateBackendRelationships(o: ResolvedOptions, errors: Record<string, string>): void {
  if (o.upstreams.length === 0) {
    setError(errors, 'upstreams', 'Add at least one backend server.');

    return;
  }

  const listenPorts = new Set<number>([o.httpPort]);
  if (o.https !== 'off') {
    listenPorts.add(o.httpsPort);
  }
  o.upstreams.forEach((upstream, index) => {
    const parsed = parseUpstreamAddress(upstream.address);
    if (parsed?.kind !== 'address') {
      return;
    }
    if (isUnspecifiedHost(parsed.host)) {
      setError(errors, `upstreams.${index}.address`, 'An unspecified address (0.0.0.0 or ::) cannot be used as a backend destination.');
    } else if (isLoopbackHost(parsed.host) && listenPorts.has(parsed.port)) {
      setError(errors, `upstreams.${index}.address`, 'A loopback backend must use a port different from the NGINX HTTP and HTTPS listeners.');
    }
  });

  if (o.upstreams.every((upstream) => upstream.backup)) {
    setError(errors, 'upstreams', 'At least one backend server must not be a backup.');
  }
  if (isProxy(o) && o.upstreams.length < 2 && o.loadBalancing !== 'round-robin') {
    setError(errors, 'loadBalancing', 'Choose round robin, or add a second backend server.');
  }
  if (isProxy(o) && o.loadBalancing === 'hash-ip' && o.upstreams.some((upstream) => upstream.backup)) {
    setError(errors, 'loadBalancing', 'The client IP hash method cannot be used with backup servers.');
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  options: Options | null;
}

export function validateOptions(input: unknown): ValidationResult {
  const errors: Record<string, string> = {};
  if (!isPlainObject(input)) {
    setError(errors, '_', 'Options must be a plain object.');

    return { valid: false, errors, options: null };
  }

  for (const key of Object.keys(input)) {
    if (!OPTION_KEYS.has(key)) {
      setError(errors, key, 'Unknown option.');
    }
  }

  const profile = PROFILES.some((candidate) => candidate.id === input.profile) ? (input.profile as Profile) : 'static';
  const target = TARGETS.some((candidate) => candidate.id === input.target) ? (input.target as Target) : 'host';
  if (hasOwn(input, 'profile') && input.profile !== profile) {
    setError(errors, 'profile', `Choose one of: ${PROFILES.map((candidate) => candidate.id).join(', ')}.`);
  }
  if (hasOwn(input, 'target') && input.target !== target) {
    setError(errors, 'target', `Choose one of: ${TARGETS.map((candidate) => candidate.id).join(', ')}.`);
  }

  const merged = mergeInput(input, profile, target);
  for (const spec of SPECS) {
    const value = merged[spec.key];
    if (spec.key === 'upstreams') {
      merged.upstreams = validateUpstreams(value, errors) ?? [];
      continue;
    }

    const message = spec.validate(value, merged as unknown as ResolvedOptions);
    if (message) {
      setError(errors, spec.key, message);
    }
  }

  const resolved = merged as unknown as ResolvedOptions;
  const failed = (key: string) => Object.keys(errors).some((errorKey) => errorKey === key || errorKey.startsWith(`${key}.`));
  if (!failed('immutablePaths')) {
    resolved.immutablePaths = validateImmutablePaths(resolved.immutablePaths, errors);
  }
  if (!failed('trustedProxies')) {
    resolved.trustedProxies = validateTrustedProxies(resolved.trustedProxies, errors);
  }
  for (const pathKey of ['documentRoot', 'certificatePath', 'certificateKeyPath'] as const) {
    if (!failed(pathKey)) {
      resolved[pathKey] = stripTrailingSlash(resolved[pathKey]);
    }
  }

  if (Object.keys(errors).length === 0) {
    validateRelationships(resolved, errors, failed);
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors, options: null };
  }

  return { valid: true, errors, options: neutralizeInapplicable(resolved) };
}

// Options that do not apply to this profile or target go back to their defaults,
// so the renderer never has to guess whether a stale value should count.
function neutralizeInapplicable(resolved: ResolvedOptions): Options {
  const defaults = defaultsFor(resolved.profile, resolved.target);
  const result: Record<string, unknown> = { ...resolved };
  for (const spec of SPECS) {
    if (!spec.appliesTo(resolved as unknown as Options)) {
      result[spec.key] = (defaults as Record<string, unknown>)[spec.key];
    }
  }

  return Object.freeze(result) as unknown as Options;
}
