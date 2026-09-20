import { NGINX_VERSION } from './version.js';

export const SCHEMA_VERSION = 1;

const PROFILES = Object.freeze(['static', 'spa', 'php', 'go', 'proxy']);
const PROXY_PROFILES = Object.freeze(['go', 'proxy']);
const UPSTREAM_PROFILES = Object.freeze(['php', 'go', 'proxy']);
const OPTION_KEYS = Object.freeze([
  'profile',
  'serverName',
  'listenPort',
  'httpsPort',
  'documentRoot',
  'upstream',
  'tls',
  'certificatePath',
  'certificateKeyPath',
  'gzip',
  'assetCache',
  'websocket',
  'streaming',
  'proxyCache',
  'rateLimit',
  'hsts'
]);

export const DEFAULT_OPTIONS = Object.freeze({
  profile: 'static',
  serverName: 'example.com',
  listenPort: 8080,
  httpsPort: 8443,
  documentRoot: '/usr/share/nginx/html',
  upstream: '127.0.0.1:8081',
  tls: false,
  certificatePath: '/etc/nginx/tls/fullchain.pem',
  certificateKeyPath: '/etc/nginx/tls/privkey.pem',
  gzip: true,
  assetCache: false,
  websocket: false,
  streaming: false,
  proxyCache: false,
  rateLimit: false,
  hsts: false
});

const PRESET_DEFINITIONS = [
  {
    id: 'static',
    label: 'Static site',
    description: 'Serve files with a 404 for missing paths.',
    defaults: { profile: 'static' }
  },
  {
    id: 'spa',
    label: 'Single-page app',
    description: 'Serve files and fall back to index.html for client-side routes.',
    defaults: { profile: 'spa' }
  },
  {
    id: 'php',
    label: 'PHP-FPM',
    description: 'Serve a PHP application through a PHP-FPM TCP listener.',
    defaults: { profile: 'php', upstream: '127.0.0.1:9000', gzip: false }
  },
  {
    id: 'go',
    label: 'Go service',
    description: 'Reverse proxy to a Go HTTP service.',
    defaults: { profile: 'go', upstream: '127.0.0.1:8081', gzip: false }
  },
  {
    id: 'proxy',
    label: 'Reverse proxy',
    description: 'Reverse proxy to an HTTP service with optional cache and WebSocket support.',
    defaults: { profile: 'proxy', upstream: '127.0.0.1:3000', gzip: false }
  }
];

export const PRESETS = Object.freeze(PRESET_DEFINITIONS.map((preset) => Object.freeze({
  ...preset,
  defaults: Object.freeze({ ...preset.defaults })
})));

const HOSTNAME_RE = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$/;
const PATH_RE = /^\/(?:[A-Za-z0-9._~+@%=-]+\/)*[A-Za-z0-9._~+@%=-]+\/?$/;
const CONTROL_OR_DIRECTIVE_RE = /[\u0000-\u001f\u007f\s;{}"'`$]/;

function addError(errors, key, message) {
  // Defining the property avoids the special __proto__ setter if hostile JSON
  // is passed to the browser form.
  Object.defineProperty(errors, key, {
    configurable: true,
    enumerable: true,
    value: message,
    writable: true
  });
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isValidPort(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535;
}

function isValidBoolean(value) {
  return typeof value === 'boolean';
}

function isValidHostname(value) {
  return typeof value === 'string' && !CONTROL_OR_DIRECTIVE_RE.test(value) && HOSTNAME_RE.test(value);
}

function isValidPath(value, allowRoot = false) {
  if (typeof value !== 'string' || value.length === 0 || CONTROL_OR_DIRECTIVE_RE.test(value)) {
    return false;
  }
  if (!PATH_RE.test(value)) {
    return false;
  }
  if (!allowRoot && value === '/') {
    return false;
  }
  return value.split('/').every((part) => part !== '.' && part !== '..');
}

function normalizePath(value) {
  return value.length > 1 ? value.replace(/\/+$/, '') : value;
}

function isValidIPv6(value) {
  if (!value.includes(':') || value.includes(':::')) {
    return false;
  }
  let candidate = value;
  if (value.includes('.')) {
    const ipv4Tail = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
    if (!ipv4Tail) {
      return false;
    }
    const octets = ipv4Tail.slice(2).map(Number);
    if (octets.some((octet) => octet > 255)) {
      return false;
    }
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    candidate = `${ipv4Tail[1]}${high}:${low}`;
  }
  const halves = candidate.split('::');
  if (halves.length > 2) {
    return false;
  }
  const validSide = (side) => side === '' || side.split(':').every((part) => /^[0-9A-Fa-f]{1,4}$/.test(part));
  if (!halves.every(validSide)) {
    return false;
  }
  const groups = halves.reduce((count, side) => count + (side === '' ? 0 : side.split(':').length), 0);
  return halves.length === 2 ? groups < 8 : groups === 8;
}

function parseUpstream(value) {
  if (value === '') {
    return null;
  }

  let host;
  let port;
  const ipv6 = /^\[([0-9A-Fa-f:.]+)\]:(\d+)$/.exec(value);
  if (ipv6) {
    host = ipv6[1];
    port = Number(ipv6[2]);
    if (!isValidIPv6(host)) {
      return null;
    }
  } else {
    const regular = /^([^:]+):(\d+)$/.exec(value);
    if (!regular) {
      return null;
    }
    host = regular[1];
    port = Number(regular[2]);
    if (!isValidHostname(host)) {
      return null;
    }
  }

  return isValidPort(port) ? { host, port } : null;
}

function parseIPv4Literal(value) {
  const parts = value.split('.');
  if (parts.length < 1 || parts.length > 4 || parts.some((part) => part === '')) {
    return null;
  }

  const widths = parts.length === 1
    ? [32]
    : parts.length === 2
      ? [8, 24]
      : parts.length === 3
        ? [8, 8, 16]
        : [8, 8, 8, 8];
  let address = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    let radix = 10;
    if (/^0x[0-9A-Fa-f]+$/i.test(part)) {
      radix = 16;
    } else if (/^0[0-7]+$/.test(part)) {
      radix = 8;
    } else if (!/^\d+$/.test(part)) {
      return null;
    }
    const number = Number.parseInt(part, radix);
    if (!Number.isSafeInteger(number) || number < 0 || number >= 2 ** widths[index]) {
      return null;
    }
    address = address * (2 ** widths[index]) + number;
  }
  return address;
}

function expandIPv6Host(host) {
  let candidate = host.toLowerCase();
  const ipv4Tail = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(candidate);
  if (ipv4Tail) {
    const octets = ipv4Tail.slice(2).map(Number);
    if (octets.some((octet) => octet > 255)) {
      return null;
    }
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    candidate = `${ipv4Tail[1]}${high}:${low}`;
  }

  const halves = candidate.split('::');
  if (halves.length > 2) {
    return null;
  }
  const validSide = (side) => side === '' || side.split(':').every((part) => /^[0-9A-Fa-f]{1,4}$/.test(part));
  if (!halves.every(validSide)) {
    return null;
  }
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const groups = [...left, ...right].map((part) => Number.parseInt(part, 16));
  if (halves.length === 2) {
    const missing = 8 - groups.length;
    return missing > 0
      ? [...left.map((part) => Number.parseInt(part, 16)), ...Array(missing).fill(0), ...right.map((part) => Number.parseInt(part, 16))]
      : null;
  }
  return groups.length === 8 ? groups : null;
}

function isLoopbackHost(host) {
  const normalized = host.toLowerCase();
  if (normalized === 'localhost' || normalized === '::1') {
    return true;
  }

  const ipv4 = parseIPv4Literal(normalized);
  if (ipv4 !== null) {
    return Math.floor(ipv4 / (2 ** 24)) === 127;
  }

  const expanded = expandIPv6Host(normalized);
  if (!expanded) {
    return false;
  }
  if (expanded.slice(0, 7).every((group) => group === 0) && expanded[7] === 1) {
    return true;
  }
  // IPv4-mapped loopback addresses are loopback too, even though their
  // IPv6 prefix is ::ffff rather than ::.
  return expanded.slice(0, 5).every((group) => group === 0)
    && expanded[5] === 0xffff
    && (expanded[6] >> 8) === 127;
}

function isUnspecifiedHost(host) {
  const normalized = host.toLowerCase();
  const ipv4 = parseIPv4Literal(normalized);
  if (ipv4 !== null) {
    return ipv4 === 0;
  }

  const expanded = expandIPv6Host(normalized);
  if (!expanded) {
    return false;
  }
  if (expanded.every((group) => group === 0)) {
    return true;
  }
  // IPv4-mapped 0.0.0.0 is also an unspecified destination.
  return expanded.slice(0, 5).every((group) => group === 0)
    && expanded[5] === 0xffff
    && expanded[6] === 0
    && expanded[7] === 0;
}

function normalizeInput(input) {
  const normalized = { ...DEFAULT_OPTIONS };
  for (const key of OPTION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      normalized[key] = input[key];
    }
  }
  if (!Object.prototype.hasOwnProperty.call(input, 'gzip') && !['static', 'spa'].includes(normalized.profile)) {
    // Dynamic responses are opt-in because compression can expose reflected
    // secrets. A visible gzip:true choice still enables it below.
    normalized.gzip = false;
  }
  if (typeof normalized.documentRoot === 'string') {
    normalized.documentRoot = normalizePath(normalized.documentRoot);
  }
  if (typeof normalized.certificatePath === 'string' && normalized.certificatePath) {
    normalized.certificatePath = normalizePath(normalized.certificatePath);
  }
  if (typeof normalized.certificateKeyPath === 'string' && normalized.certificateKeyPath) {
    normalized.certificateKeyPath = normalizePath(normalized.certificateKeyPath);
  }
  return normalized;
}

/**
 * Validate and normalize the flat options used by the browser generator.
 * Unknown keys and values that could break out of a directive are rejected.
 */
export function validateOptions(input = {}) {
  const errors = {};
  if (!isPlainObject(input)) {
    addError(errors, '_', 'Options must be a plain object.');
    return { valid: false, errors, options: null };
  }

  for (const key of Object.keys(input)) {
    if (!OPTION_KEYS.includes(key)) {
      addError(errors, key, 'Unknown option.');
    }
  }

  const options = normalizeInput(input);

  if (!PROFILES.includes(options.profile)) {
    addError(errors, 'profile', 'Choose one of: static, spa, php, go, proxy.');
  }
  if (!isValidHostname(options.serverName)) {
    addError(errors, 'serverName', 'Use one DNS hostname or IPv4 address without spaces or punctuation.');
  }
  if (!isValidPort(options.listenPort)) {
    addError(errors, 'listenPort', 'Use an integer port from 1 to 65535.');
  }
  if (!isValidPort(options.httpsPort)) {
    addError(errors, 'httpsPort', 'Use an integer port from 1 to 65535.');
  }
  if (!isValidPath(options.documentRoot)) {
    addError(errors, 'documentRoot', 'Use an absolute path without quotes, whitespace, or dot segments.');
  }
  if (typeof options.upstream !== 'string' || (options.upstream !== '' && !parseUpstream(options.upstream))) {
    addError(errors, 'upstream', 'Use host:port only; schemes, paths, and invalid ports are rejected.');
  }

  const parsedUpstream = typeof options.upstream === 'string' ? parseUpstream(options.upstream) : null;
  if (
    parsedUpstream
    && isUnspecifiedHost(parsedUpstream.host)
  ) {
    addError(errors, 'upstream', 'An unspecified upstream address cannot be used as a remote destination.');
  } else if (
    UPSTREAM_PROFILES.includes(options.profile)
    && parsedUpstream
    && isLoopbackHost(parsedUpstream.host)
    && (parsedUpstream.port === options.listenPort || (options.tls && parsedUpstream.port === options.httpsPort))
  ) {
    addError(errors, 'upstream', 'A loopback upstream must use a port different from the NGINX HTTP and enabled HTTPS listeners.');
  }

  for (const key of ['tls', 'gzip', 'assetCache', 'websocket', 'streaming', 'proxyCache', 'rateLimit', 'hsts']) {
    if (!isValidBoolean(options[key])) {
      addError(errors, key, 'Use true or false.');
    }
  }

  for (const key of ['certificatePath', 'certificateKeyPath']) {
    if (typeof options[key] !== 'string' || (options[key] !== '' && !isValidPath(options[key]))) {
      addError(errors, key, 'Use an absolute certificate path without quotes or dot segments.');
    }
  }

  if (options.tls && options.listenPort === options.httpsPort) {
    addError(errors, 'tls', 'listenPort and httpsPort must differ when TLS is enabled.');
  }
  if (options.tls && (!options.certificatePath || !options.certificateKeyPath)) {
    addError(errors, 'tls', 'TLS requires both certificatePath and certificateKeyPath.');
  }
  if (options.hsts && !options.tls) {
    addError(errors, 'hsts', 'HSTS can only be enabled with TLS.');
  }
  if (options.assetCache && PROXY_PROFILES.includes(options.profile)) {
    addError(errors, 'assetCache', 'Asset cache is for static, SPA, or PHP files; use proxyCache for an upstream.');
  }
  if (PROXY_PROFILES.includes(options.profile) === false && (options.websocket || options.streaming || options.proxyCache)) {
    addError(errors, 'profile', 'WebSockets, streaming, and proxy cache require the go or proxy profile.');
  }
  if (['php'].includes(options.profile) && (options.websocket || options.streaming || options.proxyCache)) {
    addError(errors, 'profile', 'The PHP profile uses FastCGI; choose go or proxy for proxy-only options.');
  }
  if (['php', 'go', 'proxy'].includes(options.profile) && !options.upstream) {
    addError(errors, 'upstream', 'This profile requires an upstream host:port.');
  }

  const valid = Object.keys(errors).length === 0;
  return { valid, errors, options: valid ? Object.freeze(options) : null };
}

function formatError(errors) {
  return Object.entries(errors).map(([key, message]) => `${key}: ${message}`).join(' ');
}

function securityHeaders() {
  return [
    '    # Safe defaults that do not require an application-specific policy.',
    '    add_header X-Content-Type-Options "nosniff" always;',
    '    add_header Referrer-Policy "strict-origin-when-cross-origin" always;'
  ];
}

function repeatedSecurityHeaders() {
  const lines = [
    '        add_header X-Content-Type-Options "nosniff" always;',
    '        add_header Referrer-Policy "strict-origin-when-cross-origin" always;'
  ];
  return lines;
}

function repeatedSecurityHeadersWithTls(options) {
  const lines = repeatedSecurityHeaders();
  if (options.tls && options.hsts) {
    lines.push('        add_header Strict-Transport-Security "max-age=31536000" always;');
  }
  return lines;
}

function renderCacheMaps(options) {
  if (!options.proxyCache) {
    return [];
  }
  const lines = [
    '    # Cache is deliberately opt-in. These maps keep private and varying responses out.',
    '    map $request_method $skip_cache_method {',
    '        default 1;',
    '        GET 0;',
    '        HEAD 0;',
    '    }',
    '    map $http_authorization $skip_cache_auth {',
    '        default 1;',
    '        "" 0;',
    '    }',
    '    map $http_cookie $skip_cache_cookie {',
    '        default 1;',
    '        "" 0;',
    '    }',
    '    map $http_cache_control $skip_cache_request_control {',
    '        default 0;',
    '        ~*no-cache 1;',
    '        ~*no-store 1;',
    '        ~*max-age=0 1;',
    '    }',
    '    map $http_pragma $skip_cache_request_pragma {',
    '        default 0;',
    '        ~*no-cache 1;',
    '    }',
    '    map $upstream_http_set_cookie $skip_cache_set_cookie {',
    '        default 1;',
    '        "" 0;',
    '    }',
    '    map $upstream_http_cache_control $skip_cache_control {',
    '        default 0;',
    '        ~*no-cache 1;',
    '        ~*no-store 1;',
    '        ~*private 1;',
    '    }',
    '    map $upstream_http_vary $skip_cache_vary {',
    '        default 0;',
    '        ~*.+ 1;',
    '    }'
  ];
  if (options.websocket) {
    lines.push(
      '    map $http_upgrade $skip_cache_upgrade {',
      '        default 1;',
      '        "" 0;',
      '    }'
    );
  }
  return lines;
}

function renderHttpOptions(options) {
  const lines = [
    '    # Static file delivery defaults for Linux. tcp_nopush needs sendfile.',
    '    sendfile on;',
    '    sendfile_max_chunk 2m;',
    '    tcp_nopush on;',
    '    tcp_nodelay on;',
    '    keepalive_timeout 65s;',
    '    keepalive_requests 1000;',
    '',
    '    # Bound slow headers and bodies without choosing an application upload size.',
    '    client_header_timeout 15s;',
    '    client_body_timeout 60s;',
    '    send_timeout 60s;',
    '    reset_timedout_connection on;',
    '    # Keep temporary request and upstream files writable for non-root services.',
    '    client_body_temp_path /tmp/nginx-client-body;',
    '    proxy_temp_path /tmp/nginx-proxy;',
    '    fastcgi_temp_path /tmp/nginx-fastcgi;',
    '    uwsgi_temp_path /tmp/nginx-uwsgi;',
    '    scgi_temp_path /tmp/nginx-scgi;',
    '',
    '    # Do not leak the exact NGINX build and reject ambiguous request headers.',
    '    server_tokens off;',
    '    ignore_invalid_headers on;',
    '    underscores_in_headers off;',
    '    merge_slashes on;',
    '',
    '    include /etc/nginx/mime.types;',
    '    default_type application/octet-stream;',
    '',
    '    # Avoid query strings and Referer values, which can contain secrets.',
    '    log_format main "$remote_addr - $remote_user [$time_local] \\"$request_method $uri $server_protocol\\" "',
    '                    "$status $body_bytes_sent \\"$http_user_agent\\" "',
    '                    "rt=$request_time urt=$upstream_response_time us=$upstream_status";'
  ];

  if (options.tls) {
    lines.push(
      '',
      '    # Keep the shared TLS policy in http. NGINX resumes sessions from the default server context.',
      '    ssl_protocols TLSv1.2 TLSv1.3;',
      '    # TLS 1.3 chooses its own ciphers; this list covers TLS 1.2.',
      '    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;',
      '    ssl_session_cache shared:SSL:10m;',
      '    ssl_session_timeout 10m;',
      '    # NGINX 1.23.2+ rotates ticket keys automatically in a shared cache.',
      '    # For several NGINX hosts, use a deliberate shared key policy instead.',
      '    ssl_session_tickets on;',
      '    # 0-RTT requests can be replayed, so keep early data disabled.',
      '    ssl_early_data off;'
    );
  }

  if (options.gzip) {
    const dynamicCompression = !['static', 'spa'].includes(options.profile);
    lines.push(
      '',
      '    # Compress text that benefits from it. Keep pre-compressed media out.',
      '    gzip on;',
      '    gzip_vary on;',
      '    # Level 1 saves CPU; benchmark higher values for a bandwidth-heavy site.',
      '    gzip_comp_level 1;',
      '    gzip_min_length 1024;',
      ...(dynamicCompression ? [
        '    # Dynamic compression was explicitly enabled. Review reflected or secret data for BREACH risk.',
        '    gzip_proxied any;'
      ] : [
        '    # Proxied responses stay off by default to reduce BREACH risk.',
        '    gzip_proxied off;'
      ]),
      '    gzip_types text/plain text/css text/xml application/xml application/json',
      '        application/javascript application/wasm image/svg+xml;'
    );
  } else {
    lines.push(
      '',
      '    # Dynamic responses are uncompressed by default; review secrets before opting in.',
      '    gzip off;'
    );
  }

  if (options.rateLimit) {
    lines.push(
      '',
      '    # Conservative per-IP request limit. Tune for the application and load test.',
      '    limit_req_zone $binary_remote_addr zone=per_ip:10m rate=10r/s;'
    );
  }

  if (options.proxyCache) {
    lines.push(
      '',
      '    # The cache lives under /tmp so the generated baseline also works as a non-root container.',
      '    # Move it to persistent storage for a host deployment.',
      '    proxy_cache_path /tmp/nginx-cache levels=1:2 keys_zone=edge_cache:10m max_size=256m inactive=10m use_temp_path=off;'
    );
  }

  lines.push(...renderCacheMaps(options));

  if (options.websocket) {
    lines.push(
      '',
      '    # Only a WebSocket upgrade gets upgrade semantics or an Upgrade header.',
      '    map $http_upgrade $connection_upgrade {',
      '        default close;',
      '        ~*^websocket$ upgrade;',
      '        "" close;',
      '    }',
      '    map $http_upgrade $websocket_upgrade {',
      '        default "";',
      '        ~*^websocket$ websocket;',
      '    }'
    );
  }

  return lines;
}

function renderUpstream(options) {
  if (!PROXY_PROFILES.includes(options.profile)) {
    return [];
  }
  return [
    '',
    '    upstream backend {',
    `        server ${options.upstream};`,
    '        # Keep idle upstream connections ready for the next request.',
    '        keepalive 32;',
    '    }'
  ];
}

function renderTls(options) {
  return [
    `        ssl_certificate ${options.certificatePath};`,
    `        ssl_certificate_key ${options.certificateKeyPath};`
  ];
}

function renderSensitiveLocations() {
  return [
    '    # Serve only ACME challenge files under .well-known.',
    '    location ^~ /.well-known/acme-challenge/ {',
    '        try_files $uri =404;',
    '    }',
    '',
    '    # Other .well-known files and dotfiles are not public by default.',
    '    location ~* /\\.well-known(?:/|$) {',
    '        deny all;',
    '    }',
    '',
    '    location ~* /\\.(?!well-known(?:/|$)) {',
    '        deny all;',
    '    }',
    '',
    '    # Extensions commonly containing credentials, source, or deployment files.',
    '    location ~* \\.(?:bak|conf|dist|env|fla|inc|ini|log|psd|sh|sql|sw[op]|ya?ml)(?:~)?$ {',
    '        deny all;',
    '    }'
  ];
}

function renderAssetLocations(options) {
  const lines = [
    '    location ~* \\.html$ {',
    '        # HTML usually contains deployment references; do not keep it stale.',
    '        add_header Cache-Control "no-cache" always;',
    ...repeatedSecurityHeadersWithTls(options),
    '    }'
  ];

  if (options.profile === 'spa') {
    lines.push(
      '',
      '    # A missing built asset must be a 404, never the SPA HTML fallback.',
      '    location /assets/ {',
      '        try_files $uri =404;',
      ...(options.assetCache ? [
        '        # This assumes the build puts content-hashed files under /assets/.',
        '        add_header Cache-Control "public, max-age=31536000, immutable";',
        ...(options.gzip ? ['        gzip on;'] : []),
        ...repeatedSecurityHeadersWithTls(options)
      ] : []),
      '        access_log off;',
      '    }'
    );
  }

  if (options.assetCache) {
    lines.push(
      '',
      '    # Enable this only when these filenames contain a content hash.',
      '    location ~* "\\.[A-Za-z0-9_-]{8,}\\.(?:avif|css|eot|gif|ico|jpe?g|js|mjs|png|svg|ttf|woff2?|webp|webm)$" {',
      '        try_files $uri =404;',
      '        add_header Cache-Control "public, max-age=31536000, immutable";',
      ...(options.gzip ? ['        gzip on;'] : []),
      ...repeatedSecurityHeadersWithTls(options),
      '        access_log off;',
      '    }'
    );
  }
  return lines;
}

function renderFastCgi(options) {
  return [
    '    # Check the script before passing it to PHP-FPM; PATH_INFO is not enabled.',
    '    location ~* \\.php$ {',
    '        try_files $uri =404;',
    `        fastcgi_pass ${options.upstream};`,
    '        include /etc/nginx/fastcgi_params;',
    '        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;',
    '        # Do not pass the client-controlled Proxy header to CGI.',
    '        fastcgi_param HTTP_PROXY "";',
    '        fastcgi_index index.php;',
    '    }'
  ];
}

function renderProxyCache(options) {
  if (!options.proxyCache || options.streaming) {
    return [];
  }
  const upgrade = options.websocket ? ' $skip_cache_upgrade' : '';
  return [
    '        # Public GET/HEAD cache only; NGINX also honors response Cache-Control, Set-Cookie, and Vary.',
    '        proxy_cache edge_cache;',
    '        proxy_cache_key "$scheme|$host|$request_uri";',
    '        proxy_cache_methods GET HEAD;',
    '        proxy_cache_lock on;',
    '        proxy_cache_revalidate on;',
    '        proxy_cache_valid 200 301 302 10m;',
    '        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;',
    `        proxy_cache_bypass $skip_cache_method $skip_cache_auth $skip_cache_cookie $skip_cache_request_control $skip_cache_request_pragma${upgrade};`,
    '        proxy_no_cache $skip_cache_method $skip_cache_auth $skip_cache_cookie $skip_cache_request_control $skip_cache_request_pragma $skip_cache_set_cookie $skip_cache_control $skip_cache_vary;'
  ];
}

function renderProxy(options) {
  const lines = [
    '    location / {',
    `        proxy_pass http://backend;`,
    '        # Explicit settings keep behavior clear on older packaged NGINX builds.',
    '        proxy_http_version 1.1;',
    options.websocket ? '        proxy_set_header Connection $connection_upgrade;' : '        proxy_set_header Connection "";',
    '        proxy_set_header Host $host;',
    '        proxy_set_header X-Real-IP $remote_addr;',
    '        # This NGINX is the trust boundary; do not append a client X-Forwarded-For.',
    '        proxy_set_header X-Forwarded-For $remote_addr;',
    '        proxy_set_header X-Forwarded-Proto $scheme;',
    '        proxy_set_header X-Forwarded-Host $host;',
    '        proxy_set_header X-Forwarded-Port $server_port;',
    '        # Clear alternate identity headers so clients cannot spoof proxy metadata.',
    '        proxy_set_header Forwarded "";',
    '        proxy_set_header X-Forwarded-Ssl "";',
    '        proxy_set_header X-Url-Scheme "";',
    '        proxy_set_header Front-End-Https "";',
    '        proxy_set_header X-Client-IP "";',
    '        proxy_set_header Client-IP "";',
    '        proxy_set_header Proxy "";',
    options.websocket ? '        proxy_set_header Upgrade $websocket_upgrade;' : '        proxy_set_header Upgrade "";',
    '        proxy_connect_timeout 5s;',
    '        proxy_send_timeout 60s;',
    `        proxy_read_timeout ${options.websocket || options.streaming ? '1h' : '60s'};`,
    '        # Streaming mode changes response buffering only; keep request buffering on',
    '        # so normal uploads stay isolated from slow clients and remain retryable.',
    `        proxy_buffering ${options.streaming ? 'off' : 'on'};`,
    '        proxy_request_buffering on;'
  ];

  if (options.websocket) {
    lines.push(
      '        proxy_cache_bypass $http_upgrade;'
    );
  }
  if (options.streaming) {
    lines.push(
      '        # Response streaming is not upload streaming. Disable request buffering',
      '        # separately only for an endpoint designed to accept streaming uploads.',
      '        proxy_cache off;'
    );
  } else {
    lines.push(...renderProxyCache(options));
  }
  lines.push('    }');
  return lines;
}

function renderAppLocations(options) {
  const lines = [...renderSensitiveLocations(), ''];
  if (!PROXY_PROFILES.includes(options.profile)) {
    lines.push(...renderAssetLocations(options), '');
  }

  if (options.profile === 'php') {
    lines.push(
      '    location / {',
      '        try_files $uri $uri/ /index.php?$query_string;',
      '    }',
      '',
      ...renderFastCgi(options)
    );
  } else if (PROXY_PROFILES.includes(options.profile)) {
    lines.push(...renderProxy(options));
  } else {
    const fallback = options.profile === 'spa' ? '/index.html' : '=404';
    lines.push(
      '    location / {',
      `        try_files $uri $uri/ ${fallback};`,
      '    }'
    );
  }
  return lines;
}

function renderRejectServer(options, tls = false) {
  const lines = [
    'server {',
    `    listen ${tls ? options.httpsPort : options.listenPort}${tls ? ' ssl' : ''} default_server;`,
    '    server_name _;'
  ];
  if (tls) {
    lines.push('    # Reject unknown TLS names before a certificate is selected.', '    ssl_reject_handshake on;');
  } else {
    lines.push('    return 444;');
  }
  lines.push('}');
  return lines;
}

function renderApplicationServer(options, tls = false) {
  const listen = tls ? options.httpsPort : options.listenPort;
  const lines = [
    'server {',
    `    listen ${listen}${tls ? ' ssl' : ''};`,
    ...(tls ? ['    # HTTP/2 uses the current standalone directive.', '    http2 on;'] : []),
    `    server_name ${options.serverName};`,
    ''
  ];
  if (tls) {
    lines.push(...renderTls(options), '');
  }
  if (!PROXY_PROFILES.includes(options.profile)) {
    lines.push(
      `    root ${options.documentRoot};`,
      `    index ${options.profile === 'php' ? 'index.php index.html index.htm' : 'index.html index.htm'};`,
      '    charset utf-8;',
      ''
    );
  }
  lines.push(...securityHeaders());
  if (options.hsts && tls) {
    lines.push('    # Enable only when every subdomain is HTTPS; subdomains are not included here.', '    add_header Strict-Transport-Security "max-age=31536000" always;');
  }
  if (options.rateLimit) {
    lines.push('    limit_req zone=per_ip burst=20 nodelay;', '    limit_req_status 429;');
  }
  lines.push(
    '',
    '    # A local process check for container and load-balancer health probes.',
    '    location = /healthz {',
    '        access_log off;',
    ...repeatedSecurityHeadersWithTls(options),
    '        add_header Content-Length 0 always;',
    '        return 204;',
    '    }',
    '',
    ...renderAppLocations(options),
    '',
    '    error_log /dev/stderr warn;',
    '    access_log /dev/stdout main;',
    '}'
  );
  return lines;
}

function renderRedirectServer(options) {
  const port = options.httpsPort === 443 ? '' : `:${options.httpsPort}`;
  return [
    'server {',
    `    listen ${options.listenPort};`,
    `    server_name ${options.serverName};`,
    `    return 308 https://${options.serverName}${port}$request_uri;`,
    '}'
  ];
}

/**
 * Generate one complete, standalone NGINX configuration.
 * The returned text has no dependency on repository snippets.
 */
export function generateConfig(input = {}) {
  const result = validateOptions(input);
  if (!result.valid) {
    const error = new Error(`Invalid NGINX options: ${formatError(result.errors)}`);
    error.name = 'ConfigValidationError';
    error.errors = result.errors;
    throw error;
  }
  const options = result.options;
  const lines = [
    `# Generated for NGINX Open Source ${NGINX_VERSION}.`,
    '# Review application-specific limits and run: nginx -t -c /etc/nginx/nginx.conf',
    '# This file is standalone; it does not require the repository snippets.',
    '',
    'pid /tmp/nginx.pid;',
    '# Keep worker count tied to available CPU. Measure before changing it.',
    'worker_processes auto;',
    'error_log /dev/stderr warn;',
    '',
    'events {',
    '    # Increase only after raising the service file-descriptor limit too.',
    '    worker_connections 1024;',
    '}',
    '',
    'http {',
    ...renderHttpOptions(options),
    ...renderUpstream(options),
    ''
  ];

  if (options.tls) {
    lines.push(...renderRejectServer(options, false), '', ...renderRedirectServer(options), '', ...renderRejectServer(options, true), '', ...renderApplicationServer(options, true));
  } else {
    lines.push(...renderRejectServer(options, false), '', ...renderApplicationServer(options, false));
  }
  lines.push('}', '');
  return lines.join('\n');
}

/**
 * Generate the optional catch-all server for an existing, multi-site config.
 * Standalone generated configs already include this server automatically.
 */
export function generateDefaultServer(port = 80) {
  if (!isValidPort(port)) {
    throw new Error('Invalid default server port.');
  }
  return [
    `# Generated for NGINX Open Source ${NGINX_VERSION}.`,
    '# Keep this server before application servers to reject unknown Host values.',
    'server {',
    `    listen ${port} default_server;`,
    '    server_name _;',
    '    return 444;',
    '}',
    '',
    '# Add the matching [::]:port listener when IPv6 is enabled on this host.',
    ''
  ].join('\n');
}
