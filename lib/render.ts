import { CLOUDFLARE_RANGES } from './cloudflare-ips.ts';
import {
  aliasServerName,
  canonicalServerName,
  parseUpstreamAddress,
  usesHostnameUpstream,
  validateOptions,
  type Options,
  type ResolvedOptions,
  type Upstream
} from './options.ts';
import { isValidPort } from './addresses.ts';
import { NGINX_IMAGE, NGINX_VERSION } from './version.ts';

const INDENT = '    ';
const INTERMEDIATE_CIPHERS =
  'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305';
const GZIP_TYPES = [
  'text/plain',
  'text/css',
  'text/xml',
  'text/javascript',
  'text/markdown',
  'text/csv',
  'text/vtt',
  'application/javascript',
  'application/json',
  'application/ld+json',
  'application/manifest+json',
  'application/vnd.geo+json',
  'application/xml',
  'application/xhtml+xml',
  'application/rss+xml',
  'application/atom+xml',
  'application/wasm',
  'image/svg+xml',
  'image/x-icon',
  'image/bmp',
  'font/ttf',
  'font/otf'
];
const CLEARED_IDENTITY_HEADERS = ['Forwarded', 'X-Forwarded-Ssl', 'X-Url-Scheme', 'Front-End-Https', 'X-Client-IP', 'Client-IP', 'Proxy'];
const SENSITIVE_EXTENSIONS = 'bak|conf|dist|env|fla|inc|ini|log|psd|sh|sql|sw[op]|ya?ml';
const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(), usb=()';

class ConfigWriter {
  #lines: string[] = [];
  #depth = 0;

  line(text: string): void {
    this.#lines.push(`${INDENT.repeat(this.#depth)}${text}`);
  }

  comment(text: string): void {
    this.line(`# ${text}`);
  }

  // A directive written over several lines. The extra lines are indented one level deeper.
  continued(first: string, rest: string[]): void {
    this.line(first);
    for (const text of rest) {
      this.#lines.push(`${INDENT.repeat(this.#depth + 1)}${text}`);
    }
  }

  blank(): void {
    const last = this.#lines[this.#lines.length - 1];
    if (last === undefined || last === '' || last.endsWith('{')) {
      return;
    }

    this.#lines.push('');
  }

  block(header: string, body: () => void): void {
    this.line(`${header} {`);
    this.#depth += 1;
    body();
    this.#depth -= 1;
    if (this.#lines[this.#lines.length - 1] === '') {
      this.#lines.pop();
    }

    this.line('}');
  }

  toString(): string {
    return `${this.#lines.join('\n')}\n`;
  }
}

export class ConfigValidationError extends Error {
  errors: Record<string, string>;

  constructor(errors: Record<string, string>) {
    super(`Invalid NGINX options: ${Object.entries(errors).map(([key, message]) => `${key}: ${message}`).join(' ')}`);
    this.name = 'ConfigValidationError';
    this.errors = errors;
  }
}

function resolveOptions(input: Options): ResolvedOptions {
  const result = validateOptions(input);
  if (!result.valid || result.options === null) {
    throw new ConfigValidationError(result.errors);
  }

  return result.options as unknown as ResolvedOptions;
}

const isContainer = (o: ResolvedOptions) => o.target === 'container';
const serversFiles = (o: ResolvedOptions) => o.profile !== 'proxy';
const hasBackend = (o: ResolvedOptions) => o.profile === 'php' || o.profile === 'proxy';
const httpsOn = (o: ResolvedOptions) => o.https !== 'off';
const proxyProtocolOn = (o: ResolvedOptions) => o.realIp === 'custom' && o.realIpHeader === 'proxy_protocol';
const trustsProxy = (o: ResolvedOptions) => o.realIp !== 'off';

// The scheme the visitor used, which differs from $scheme behind a TLS-terminating proxy.
const protoVariable = (o: ResolvedOptions) => (trustsProxy(o) ? '$forwarded_proto' : '$scheme');

// Where certbot writes HTTP-01 tokens. A container mounts it, because its root is read-only.
function acmeWebroot(o: ResolvedOptions): string {
  return isContainer(o) ? '/var/cache/nginx/acme-challenge' : '/var/www/_letsencrypt';
}

function trustedRanges(o: ResolvedOptions): string[] {
  return o.realIp === 'cloudflare' ? CLOUDFLARE_RANGES : o.trustedProxies;
}

function publicOrigin(scheme: 'http' | 'https', name: string, port: number): string {
  const standardPort = scheme === 'http' ? 80 : 443;

  return `${scheme}://${name}${port === standardPort ? '' : `:${port}`}`;
}

function listenLines(w: ConfigWriter, o: ResolvedOptions, port: number, flags: string): void {
  const suffix = flags === '' ? '' : ` ${flags}`;
  w.line(`listen ${port}${suffix};`);
  if (o.ipv6) {
    w.line(`listen [::]:${port}${suffix};`);
  }
}

function tcpFlags(o: ResolvedOptions, flags: string[]): string {
  return [...flags, ...(proxyProtocolOn(o) ? ['proxy_protocol'] : [])].join(' ');
}

function usesHostnameBackend(o: ResolvedOptions): boolean {
  return hasBackend(o) && usesHostnameUpstream(o.upstreams);
}

function needsResolver(o: ResolvedOptions): boolean {
  return o.https === 'acme' || usesHostnameBackend(o);
}

// A single address needs no group. Several servers, backups, or host names do.
function needsUpstreamGroup(o: ResolvedOptions): boolean {
  return o.profile === 'proxy' || o.upstreams.length > 1 || o.upstreams.some((upstream) => upstream.backup) || usesHostnameBackend(o);
}

function upstreamGroupName(o: ResolvedOptions): string {
  return o.profile === 'php' ? 'php_fpm' : 'backend';
}

function statusPort(o: ResolvedOptions): number {
  const taken = new Set<number>([o.httpPort, o.httpsPort]);
  for (const upstream of o.upstreams) {
    const parsed = parseUpstreamAddress(upstream.address);
    if (parsed?.kind === 'address') {
      taken.add(parsed.port);
    }
  }

  let port = 8081;
  while (taken.has(port)) {
    port += 1;
  }

  return port;
}

function writeMainContext(w: ConfigWriter, o: ResolvedOptions): void {
  w.comment(`Generated for NGINX Open Source ${NGINX_VERSION}. Profile: ${o.profile}. Target: ${o.target}.`);
  w.comment('Test it before you reload: nginx -t -c /etc/nginx/nginx.conf');
  w.comment('This file is standalone. It does not include the repository snippets.');
  w.blank();

  if (o.https === 'acme') {
    w.comment('The ACME module is a separate package. The official Docker image already has it.');
    w.line('load_module modules/ngx_http_acme_module.so;');
    w.blank();
  }

  if (!isContainer(o)) {
    w.comment('Workers run as an unprivileged user.');
    w.line(`user ${o.workerUser};`);
  }

  w.comment('One worker per CPU core. The NGINX default is a single worker.');
  w.line('worker_processes auto;');
  w.line(isContainer(o) ? 'pid /tmp/nginx.pid;' : 'pid /run/nginx.pid;');

  if (!isContainer(o)) {
    w.comment('Every connection needs a file descriptor, and a proxied request needs two.');
    w.line(`worker_rlimit_nofile ${o.workerConnections * 2};`);
  }

  w.comment('Log warnings and worse. The NGINX default is error.');
  w.line(isContainer(o) ? 'error_log /dev/stderr warn;' : 'error_log /var/log/nginx/error.log warn;');
  w.blank();

  w.block('events', () => {
    w.comment('The NGINX default is 512. Raise the open-files limit together with this value.');
    w.line(`worker_connections ${o.workerConnections};`);
  });
}

function writeBasics(w: ConfigWriter, o: ResolvedOptions): void {
  w.line('include /etc/nginx/mime.types;');
  w.comment('Unknown file types download instead of showing as text.');
  w.line('default_type application/octet-stream;');
  w.blank();

  w.comment('Do not reveal the NGINX version.');
  w.line('server_tokens off;');
  w.comment('Redirects without a host name, so published ports and proxies cannot leak an internal port.');
  w.line('absolute_redirect off;');
  w.comment('Keep the security headers from the server block when a location adds its own header.');
  w.line('add_header_inherit merge;');
  w.blank();

  w.comment('Send files from the kernel. tcp_nopush fills packets and needs sendfile.');
  w.line('sendfile on;');
  w.line('tcp_nopush on;');
  w.comment('Drop slow header senders after 15 seconds (the default is 60) and free their sockets at once.');
  w.line('client_header_timeout 15s;');
  w.line('reset_timedout_connection on;');
  w.blank();

  if (isContainer(o)) {
    w.comment('A non-root user can write only under /tmp.');
    w.line('client_body_temp_path /tmp/nginx-client-body;');
    w.line('proxy_temp_path /tmp/nginx-proxy;');
    w.line('fastcgi_temp_path /tmp/nginx-fastcgi;');
    w.line('uwsgi_temp_path /tmp/nginx-uwsgi;');
    w.line('scgi_temp_path /tmp/nginx-scgi;');
    w.blank();
  }

  w.comment('The log has no query string or Referer, because they can contain secrets. rid is the request ID.');
  w.continued("log_format main '$remote_addr - $remote_user [$time_local] \"$request_method $uri $server_protocol\" '", [
    "'$status $body_bytes_sent \"$http_user_agent\" '",
    "'rt=$request_time urt=$upstream_response_time us=$upstream_status rid=$request_id';"
  ]);
  const destination = isContainer(o) ? '/dev/stdout' : '/var/log/nginx/access.log';
  w.line(`access_log ${destination} main${o.accessLogBuffer ? ' buffer=32k flush=5s' : ''};`);
}

function writeRealIp(w: ConfigWriter, o: ResolvedOptions): void {
  if (!trustsProxy(o)) {
    return;
  }

  const header = o.realIp === 'cloudflare' ? 'CF-Connecting-IP' : o.realIpHeader;
  w.blank();
  w.comment(
    o.realIp === 'cloudflare'
      ? 'Cloudflare ranges, copied on 2026-10-01. Re-check them at https://www.cloudflare.com/ips/'
      : 'Only these proxies may set the client IP.'
  );
  for (const range of trustedRanges(o)) {
    w.line(`set_real_ip_from ${range};`);
  }

  w.line(`real_ip_header ${header};`);
  if (header === 'X-Forwarded-For') {
    w.comment('Skip trusted proxies in the chain, so the first untrusted address is the client.');
    w.line('real_ip_recursive on;');
  }
}

// An alias that redirects over plain HTTP must build its Location from the visitor's scheme.
const redirectsAliasOverHttp = (o: ResolvedOptions) => !httpsOn(o) && aliasServerName(o) !== null;

function writeForwardedVariables(w: ConfigWriter, o: ResolvedOptions): void {
  const needsPort = hasBackend(o);
  const needsSuffix = redirectsAliasOverHttp(o);
  if (!needsPort && !needsSuffix) {
    return;
  }

  w.blank();
  if (trustsProxy(o)) {
    w.comment('Believe X-Forwarded-Proto only from a trusted proxy. Anything else falls back to the real scheme.');
    w.block('geo $realip_remote_addr $from_trusted_proxy', () => {
      w.line('default 0;');
      for (const range of trustedRanges(o)) {
        w.line(`${range} 1;`);
      }
    });
    w.block('map "$from_trusted_proxy:$http_x_forwarded_proto" $forwarded_proto', () => {
      w.line('default $scheme;');
      w.line('"1:https" https;');
      w.line('"1:http" http;');
    });
  }

  if (needsPort) {
    w.comment('The public port that visitors use, which can differ from the listen port.');
    w.block(`map ${protoVariable(o)} $forwarded_port`, () => {
      w.line(`default ${o.publicHttpPort};`);
      w.line(`https ${o.publicHttpsPort};`);
    });
  }

  if (needsSuffix) {
    w.comment('The port part of a redirect: empty for the default port of the scheme.');
    w.block(`map ${protoVariable(o)} $forwarded_port_suffix`, () => {
      w.line(`default "${o.publicHttpPort === 80 ? '' : `:${o.publicHttpPort}`}";`);
      w.line(`https "${o.publicHttpsPort === 443 ? '' : `:${o.publicHttpsPort}`}";`);
    });
  }

  if (o.profile === 'php') {
    w.block(`map ${protoVariable(o)} $forwarded_https`, () => {
      w.line('default "";');
      w.line('https on;');
    });
  }
}

function writeTlsPolicy(w: ConfigWriter, o: ResolvedOptions): void {
  if (!httpsOn(o)) {
    return;
  }

  w.blank();
  if (o.tlsProfile === 'modern') {
    w.comment('Modern: TLS 1.3 only (Mozilla guideline v6.0). TLS 1.3 needs no cipher list.');
    w.line('ssl_protocols TLSv1.3;');
  } else {
    w.comment('Intermediate (Mozilla guideline v6.0). The protocols match the NGINX default; they are listed so the policy is visible.');
    w.line('ssl_protocols TLSv1.2 TLSv1.3;');
    w.line(`ssl_ciphers ${INTERMEDIATE_CIPHERS};`);
  }

  w.comment('Reuse TLS sessions across workers and keep them for a day. Ticket keys rotate on their own.');
  w.line('ssl_session_cache shared:SSL:10m;');
  w.line('ssl_session_timeout 1d;');

  if (o.http3) {
    w.comment('Ask clients to prove their address before QUIC starts. This blunts spoofed-address floods.');
    w.line('quic_retry on;');
  }

  if (o.https === 'acme') {
    const uri = o.acmeStaging ? 'https://acme-staging-v02.api.letsencrypt.org/directory' : 'https://acme-v02.api.letsencrypt.org/directory';
    w.blank();
    w.comment('Automatic certificates. state_path must be writable and survive restarts. Port 80 must be reachable for HTTP-01.');
    w.block('acme_issuer letsencrypt', () => {
      w.line(`uri ${uri};`);
      w.line(`contact ${o.acmeEmail};`);
      w.line('state_path /var/cache/nginx/acme-letsencrypt;');
      w.line('accept_terms_of_service;');
    });
    w.line('acme_shared_zone zone=ngx_acme_shared:1M;');
  }
}

function writeResolver(w: ConfigWriter, o: ResolvedOptions): void {
  if (!needsResolver(o)) {
    return;
  }

  const addresses = o.resolver.split(' ').map((address) => (address.includes(':') ? `[${address}]` : address));
  w.blank();
  w.comment('Name servers for ACME and for backend host names. valid=30s re-checks names often.');
  w.line(`resolver ${addresses.join(' ')} valid=30s ipv6=${o.ipv6 ? 'on' : 'off'};`);
}

function writeCompression(w: ConfigWriter, o: ResolvedOptions): void {
  if (!o.gzip && !o.gzipStatic) {
    return;
  }

  w.blank();
  if (o.gzip) {
    w.comment('Compress text. Images and fonts such as woff2 are already compressed and are left out.');
    w.line('gzip on;');
    w.line('gzip_min_length 1024;');
    if (o.gzipLevel !== 1) {
      w.comment('Higher levels cost more CPU. The default is 1.');
      w.line(`gzip_comp_level ${o.gzipLevel};`);
    }

    const typeRows = [0, 1, 2, 3, 4, 5].map((row) => GZIP_TYPES.slice(row * 4, row * 4 + 4).join(' '));
    w.continued(`gzip_types ${typeRows[0]}`, [...typeRows.slice(1, -1), `${typeRows.at(-1)};`]);
    if (o.profile === 'php' || o.profile === 'proxy') {
      w.comment('You turned on compression for dynamic pages. Do not put secrets next to user input (BREACH).');
    }
  }

  if (o.gzipStatic) {
    w.comment('Serve file.ext.gz when it exists next to file.ext.');
    w.line('gzip_static on;');
  }

  w.comment('Vary tells caches that the body depends on Accept-Encoding. "any" also compresses for CDNs, which send Via.');
  w.line('gzip_vary on;');
  w.line('gzip_proxied any;');
}

function writeLimitZones(w: ConfigWriter, o: ResolvedOptions): void {
  if (o.rateLimit !== 'off') {
    w.blank();
    w.comment('One counter per client IP for the rate limit.');
    w.line(`limit_req_zone $binary_remote_addr zone=per_ip:10m rate=${o.rateLimitRate}r/s;`);
  }

  if (o.connLimit > 0) {
    w.blank();
    w.comment('One counter per client IP for open connections.');
    w.line('limit_conn_zone $binary_remote_addr zone=per_ip_conn:10m;');
  }
}

function writeFileCache(w: ConfigWriter, o: ResolvedOptions): void {
  if (!o.openFileCache) {
    return;
  }

  w.blank();
  w.comment('Remember open files for 20 idle seconds and re-check them every 30 seconds.');
  w.line('open_file_cache max=1000 inactive=20s;');
  w.line('open_file_cache_valid 30s;');
  w.line('open_file_cache_min_uses 2;');
}

function writeCacheMaps(w: ConfigWriter): void {
  w.comment('These maps keep private and varying responses out of the cache. 1 means skip.');
  const maps: [string, string, string[]][] = [
    ['$request_method', '$skip_cache_method', ['default 1;', 'GET 0;', 'HEAD 0;']],
    ['$http_authorization', '$skip_cache_auth', ['default 1;', '"" 0;']],
    ['$http_cookie', '$skip_cache_cookie', ['default 1;', '"" 0;']],
    ['$http_cache_control', '$skip_cache_request_control', ['default 0;', '~*no-cache 1;', '~*no-store 1;', '~*max-age=0 1;']],
    ['$http_pragma', '$skip_cache_request_pragma', ['default 0;', '~*no-cache 1;']],
    ['$upstream_http_set_cookie', '$skip_cache_set_cookie', ['default 1;', '"" 0;']],
    ['$upstream_http_cache_control', '$skip_cache_control', ['default 0;', '~*no-cache 1;', '~*no-store 1;', '~*private 1;']],
    ['$upstream_http_vary', '$skip_cache_vary', ['default 0;', '~*cookie 1;', '~*authorization 1;']]
  ];
  for (const [source, variable, entries] of maps) {
    w.block(`map ${source} ${variable}`, () => {
      for (const entry of entries) {
        w.line(entry);
      }
    });
  }
}

function writeCachePaths(w: ConfigWriter, o: ResolvedOptions): void {
  if (!o.proxyCache && !o.fastcgiCache) {
    return;
  }

  w.blank();
  const directory = isContainer(o) ? '/tmp' : '/var/cache/nginx';
  if (o.proxyCache) {
    if (isContainer(o)) {
      w.comment('The cache lives in /tmp because a non-root container can write nothing else. It is lost on restart.');
    }

    w.line(`proxy_cache_path ${directory}/${isContainer(o) ? 'nginx-cache' : 'proxy'} levels=1:2 keys_zone=edge_cache:10m max_size=256m inactive=10m use_temp_path=off;`);
  }

  if (o.fastcgiCache) {
    if (isContainer(o)) {
      w.comment('The cache lives in /tmp because a non-root container can write nothing else. It is lost on restart.');
    }

    w.line(`fastcgi_cache_path ${directory}/${isContainer(o) ? 'nginx-fcgi-cache' : 'fastcgi'} levels=1:2 keys_zone=php_cache:10m max_size=256m inactive=10m use_temp_path=off;`);
  }

  w.blank();
  writeCacheMaps(w);
}

function writeWebSocketMaps(w: ConfigWriter, o: ResolvedOptions): void {
  if (o.profile !== 'proxy' || o.websocketPath === '') {
    return;
  }

  w.blank();
  w.comment('Send Upgrade and Connection only for a real WebSocket request. All other requests keep their connection reuse.');
  w.block('map $http_upgrade $connection_upgrade', () => {
    w.line('default "";');
    w.line('~*^websocket$ upgrade;');
  });
  w.block('map $http_upgrade $websocket_upgrade', () => {
    w.line('default "";');
    w.line('~*^websocket$ websocket;');
  });
}

function upstreamServerLine(o: ResolvedOptions, upstream: Upstream): string {
  const parsed = parseUpstreamAddress(upstream.address)!;
  const parameters: string[] = [];
  if (o.upstreams.length > 1) {
    parameters.push('max_fails=3', 'fail_timeout=10s');
  }
  if (upstream.backup) {
    parameters.push('backup');
  }
  if (parsed.kind === 'address' && parsed.hostname) {
    parameters.push('resolve');
  }

  return `server ${upstream.address}${parameters.length > 0 ? ` ${parameters.join(' ')}` : ''};`;
}

function writeUpstream(w: ConfigWriter, o: ResolvedOptions): void {
  if (!hasBackend(o) || !needsUpstreamGroup(o)) {
    return;
  }

  w.blank();
  if (o.upstreams.length > 1) {
    w.comment('Take a server out for 10 seconds after 3 failed attempts. A backup server only gets traffic when the others are down.');
  }

  w.block(`upstream ${upstreamGroupName(o)}`, () => {
    if (usesHostnameBackend(o)) {
      w.comment('Re-resolve host names while NGINX runs. A resolved name needs a shared memory zone.');
      w.line(`zone ${upstreamGroupName(o)} 64k;`);
    }

    if (o.loadBalancing === 'least-conn') {
      w.line('least_conn;');
    } else if (o.loadBalancing === 'hash-ip') {
      w.line('hash $binary_remote_addr consistent;');
    }

    for (const upstream of o.upstreams) {
      w.line(upstreamServerLine(o, upstream));
    }
  });
}

function writeAcmeChallengeLocation(w: ConfigWriter, o: ResolvedOptions): void {
  w.comment('Answer certbot HTTP-01 challenges here, before any redirect or backend. Let’s Encrypt only follows redirects to ports 80 and 443.');
  w.block('location ^~ /.well-known/acme-challenge/', () => {
    w.line(`root ${acmeWebroot(o)};`);
    w.line('try_files $uri =404;');
  });
}

function writeRejectServers(w: ConfigWriter, o: ResolvedOptions): void {
  w.comment('Catch-all. Requests for an unknown Host get no answer.');
  w.block('server', () => {
    listenLines(w, o, o.httpPort, tcpFlags(o, ['default_server']));
    w.line('server_name _;');
    w.line('return 444;');
  });

  if (!httpsOn(o)) {
    return;
  }

  w.blank();
  w.comment('Reject TLS handshakes for unknown names before any certificate is chosen.');
  w.block('server', () => {
    listenLines(w, o, o.httpsPort, tcpFlags(o, ['ssl', 'default_server']));
    if (o.http3) {
      w.comment('reuseport may appear once per address and port. This is the first QUIC listener.');
      listenLines(w, o, o.httpsPort, 'quic reuseport default_server');
    }

    w.line('server_name _;');
    w.line('ssl_reject_handshake on;');
  });
}

// With the PROXY protocol every connection on the public port must send the PROXY header, so
// health probes would fail. A separate loopback address keeps plain probes working.
function writeLoopbackHealthListener(w: ConfigWriter, o: ResolvedOptions): void {
  if (!proxyProtocolOn(o)) {
    return;
  }

  w.comment('Plain listener for health probes on this machine. The public listener needs the PROXY header.');
  w.line(`listen 127.0.0.1:${o.httpPort};`);
}

function writeHttpRedirectServer(w: ConfigWriter, o: ResolvedOptions): void {
  const names = [canonicalServerName(o), aliasServerName(o)].filter((name): name is string => name !== null);
  w.blank();
  w.block('server', () => {
    listenLines(w, o, o.httpPort, tcpFlags(o, []));
    writeLoopbackHealthListener(w, o);
    w.line(`server_name ${names.join(' ')};`);
    w.blank();
    if (o.https === 'manual') {
      writeAcmeChallengeLocation(w, o);
      w.blank();
    }

    if (proxyProtocolOn(o)) {
      w.block('location = /healthz', () => {
        w.line('access_log off;');
        w.line('return 204;');
      });
      w.blank();
    }

    w.block('location /', () => {
      w.line(`return 308 ${publicOrigin('https', canonicalServerName(o), o.publicHttpsPort)}$request_uri;`);
    });
  });
}

function writeTlsListeners(w: ConfigWriter, o: ResolvedOptions): void {
  listenLines(w, o, o.httpsPort, tcpFlags(o, ['ssl']));
  if (o.http3) {
    listenLines(w, o, o.httpsPort, 'quic');
  }

  w.line('http2 on;');
}

function writeCertificate(w: ConfigWriter, o: ResolvedOptions): void {
  if (o.https === 'manual') {
    w.line(`ssl_certificate ${o.certificatePath};`);
    w.line(`ssl_certificate_key ${o.certificateKeyPath};`);

    return;
  }

  w.line('acme_certificate letsencrypt;');
  w.line('ssl_certificate $acme_certificate;');
  w.line('ssl_certificate_key $acme_certificate_key;');
  w.comment('Do not parse the certificate on every request.');
  w.line('ssl_certificate_cache max=2;');
}

function hstsValue(o: ResolvedOptions): string | null {
  if (o.hsts === 'off') {
    return null;
  }

  const suffix = o.hsts === 'host' ? '' : o.hsts === 'subdomains' ? '; includeSubDomains' : '; includeSubDomains; preload';

  return `max-age=63072000${suffix}`;
}

function writeSecurityHeaders(w: ConfigWriter, o: ResolvedOptions): void {
  w.comment('Security headers are set once here. add_header_inherit merge lets locations add theirs.');
  w.line('add_header X-Content-Type-Options "nosniff" always;');
  w.line('add_header Referrer-Policy "strict-origin-when-cross-origin" always;');

  const frameAncestors = o.frameOptions === 'deny' ? "frame-ancestors 'none'" : "frame-ancestors 'self'";
  if (o.frameOptions !== 'off') {
    w.line(`add_header X-Frame-Options "${o.frameOptions === 'deny' ? 'DENY' : 'SAMEORIGIN'}" always;`);
  }

  if (o.contentSecurityPolicy !== '' && !o.cspReportOnly) {
    const hasFrameAncestors = /(?:^|;)\s*frame-ancestors\b/.test(o.contentSecurityPolicy);
    const policy = o.frameOptions === 'off' || hasFrameAncestors ? o.contentSecurityPolicy : `${o.contentSecurityPolicy}; ${frameAncestors}`;
    w.line(`add_header Content-Security-Policy "${policy}" always;`);
  } else {
    if (o.frameOptions !== 'off') {
      w.line(`add_header Content-Security-Policy "${frameAncestors}" always;`);
    }

    if (o.contentSecurityPolicy !== '') {
      w.comment('Report-only never blocks. frame-ancestors is ignored in report-only mode, so it is enforced above.');
      w.line(`add_header Content-Security-Policy-Report-Only "${o.contentSecurityPolicy}" always;`);
    }
  }

  if (o.permissionsPolicy) {
    w.line(`add_header Permissions-Policy "${PERMISSIONS_POLICY}" always;`);
  }

  if (o.crossOriginOpenerPolicy !== 'off') {
    w.line(`add_header Cross-Origin-Opener-Policy "${o.crossOriginOpenerPolicy}" always;`);
  }

  const hsts = hstsValue(o);
  if (hsts !== null) {
    w.line(`add_header Strict-Transport-Security "${hsts}" always;`);
  }

  if (o.http3) {
    w.comment('Tell browsers that HTTP/3 is available on the public HTTPS port.');
    w.line(`add_header Alt-Svc 'h3=":${o.publicHttpsPort}"; ma=86400' always;`);
  }
}

function writeRequestLimits(w: ConfigWriter, o: ResolvedOptions): void {
  if (o.connLimit > 0) {
    w.comment('With HTTP/2 and HTTP/3 every running request counts as a connection.');
    w.line(`limit_conn per_ip_conn ${o.connLimit};`);
    w.line('limit_conn_status 429;');
  }

  if (o.rateLimit !== 'off') {
    w.comment('Requests over the limit get status 429.');
    w.line('limit_req_status 429;');
    if (o.rateLimit === 'dry-run') {
      w.comment('Dry run: count and log, but never reject.');
      w.line('limit_req_dry_run on;');
    }
  }
}

function rateLimitLine(o: ResolvedOptions): string[] {
  if (o.rateLimit === 'off') {
    return [];
  }

  const burst = o.rateLimitBurst > 0 ? ` burst=${o.rateLimitBurst} nodelay` : '';

  return [`limit_req zone=per_ip${burst};`];
}

function writeSharedLocations(w: ConfigWriter, o: ResolvedOptions): void {
  w.comment('Health check for containers and load balancers. It is not logged and not rate limited.');
  w.block('location = /healthz', () => {
    w.line('access_log off;');
    w.line('return 204;');
  });
  w.blank();

  w.comment('Dotfiles are private, except .well-known (security.txt, ACME, and similar).');
  w.block('location ~ /\\.(?!well-known/)', () => {
    w.line('deny all;');
  });

  if (serversFiles(o)) {
    w.blank();
    w.comment('Backups and config files that deployments often leave behind.');
    w.block(`location ~* \\.(?:${SENSITIVE_EXTENSIONS})(?:~)?$`, () => {
      w.line('deny all;');
    });
  }
}

function writeHtmlLocation(w: ConfigWriter): void {
  w.blank();
  w.comment('HTML points at hashed files, so browsers must re-check it.');
  w.block('location ~* \\.html$', () => {
    w.line('add_header Cache-Control "no-cache" always;');
  });
}

function writeImmutableLocations(w: ConfigWriter, o: ResolvedOptions): void {
  for (const path of o.immutablePaths) {
    w.blank();
    w.comment('Plain prefix, so the dotfile and extension rules above still win. A missing file is a 404, never the app fallback.');
    w.block(`location ${path}`, () => {
      w.line('try_files $uri =404;');
      w.line('add_header Cache-Control "public, max-age=31536000, immutable";');
      w.line('access_log off;');
    });
  }
}

function writeStaticLocations(w: ConfigWriter, o: ResolvedOptions): void {
  writeHtmlLocation(w);
  writeImmutableLocations(w, o);
  w.blank();
  w.block('location /', () => {
    w.line(`try_files $uri $uri/ ${o.profile === 'spa' ? '/index.html' : '=404'};`);
  });
}

const FASTCGI_PARAMETERS: [string, string][] = [
  ['QUERY_STRING', '$query_string'],
  ['REQUEST_METHOD', '$request_method'],
  ['CONTENT_TYPE', '$content_type'],
  ['CONTENT_LENGTH', '$content_length'],
  ['SCRIPT_NAME', '$fastcgi_script_name'],
  ['SCRIPT_FILENAME', '$realpath_root$fastcgi_script_name'],
  ['REQUEST_URI', '$request_uri'],
  ['DOCUMENT_URI', '$document_uri'],
  ['DOCUMENT_ROOT', '$realpath_root'],
  ['SERVER_PROTOCOL', '$server_protocol'],
  ['REQUEST_SCHEME', '__PROTO__'],
  ['HTTPS', '$forwarded_https if_not_empty'],
  ['GATEWAY_INTERFACE', 'CGI/1.1'],
  ['SERVER_SOFTWARE', 'nginx'],
  ['REMOTE_ADDR', '$remote_addr'],
  ['REMOTE_PORT', '$remote_port'],
  ['SERVER_ADDR', '$server_addr'],
  ['SERVER_PORT', '$forwarded_port'],
  ['SERVER_NAME', '$server_name'],
  ['REDIRECT_STATUS', '200'],
  ['HTTP_PROXY', '""'],
  ['HTTP_X_REQUEST_ID', '$request_id']
];

function writeCacheDirectives(w: ConfigWriter, o: ResolvedOptions, kind: 'proxy' | 'fastcgi'): void {
  const zone = kind === 'proxy' ? 'edge_cache' : 'php_cache';
  const staleCodes = kind === 'proxy' ? 'http_500 http_502 http_503 http_504' : 'http_500 http_503';
  const requestSkips = '$skip_cache_method $skip_cache_auth $skip_cache_cookie $skip_cache_request_control $skip_cache_request_pragma';
  const responseSkips = '$skip_cache_set_cookie $skip_cache_control $skip_cache_vary';
  w.comment('Public GET and HEAD responses only. The maps above skip anything private.');
  w.line(`${kind}_cache ${zone};`);
  w.line(`${kind}_cache_key "${protoVariable(o)}|$host|$request_uri";`);
  w.line(`${kind}_cache_lock on;`);
  w.line(`${kind}_cache_revalidate on;`);
  w.line(`${kind}_cache_valid 200 301 302 10m;`);
  w.line(`${kind}_cache_use_stale error timeout updating ${staleCodes};`);
  w.line(`${kind}_cache_background_update on;`);
  w.line(`${kind}_cache_bypass ${requestSkips};`);
  w.line(`${kind}_no_cache ${requestSkips} ${responseSkips};`);
}

function writePhpLocations(w: ConfigWriter, o: ResolvedOptions): void {
  const target = needsUpstreamGroup(o) ? upstreamGroupName(o) : o.upstreams[0]!.address;
  writeImmutableLocations(w, o);
  w.blank();
  w.block('location /', () => {
    w.line('try_files $uri $uri/ /index.php$is_args$args;');
  });
  w.blank();
  w.comment('Run a script only if the file exists. PATH_INFO is not enabled. $realpath_root keeps symlink deploys atomic.');
  w.block('location ~* \\.php$', () => {
    w.line('try_files $uri =404;');
    w.line(`fastcgi_pass ${target};`);
    w.comment('The official fastcgi_params list, written out once per name. HTTP_PROXY blocks the httpoxy attack.');
    for (const [name, value] of FASTCGI_PARAMETERS) {
      w.line(`fastcgi_param ${name} ${value === '__PROTO__' ? protoVariable(o) : value};`);
    }

    w.line('fastcgi_hide_header X-Powered-By;');
    for (const line of rateLimitLine(o)) {
      w.line(line);
    }

    if (o.fastcgiCache) {
      writeCacheDirectives(w, o, 'fastcgi');
    }
  });
}

// proxy_set_header is all or nothing per location, so every proxy location lists the full set.
// Only the first location carries the explanations.
function writeProxyDirectives(w: ConfigWriter, o: ResolvedOptions, explain: boolean): void {
  const note = (text: string) => {
    if (explain) {
      w.comment(text);
    }
  };
  const scheme = o.upstreamTls ? 'https' : 'http';
  w.line(`proxy_pass ${scheme}://backend;`);
  note('proxy_set_header is all or nothing per location, so each proxy location lists the full set.');
  w.line('proxy_set_header Host $host;');
  w.line('proxy_set_header X-Real-IP $remote_addr;');
  note('This NGINX is the trust boundary, so a client X-Forwarded-For is replaced, not extended.');
  w.line('proxy_set_header X-Forwarded-For $remote_addr;');
  w.line(`proxy_set_header X-Forwarded-Proto ${protoVariable(o)};`);
  w.line('proxy_set_header X-Forwarded-Host $host;');
  w.line('proxy_set_header X-Forwarded-Port $forwarded_port;');
  w.line('proxy_set_header X-Request-ID $request_id;');
  note('Empty values are not sent. This stops clients from faking proxy metadata.');
  for (const header of CLEARED_IDENTITY_HEADERS) {
    w.line(`proxy_set_header ${header} "";`);
  }

  note('Do not pass on what the backend says about its own stack.');
  w.line('proxy_hide_header X-Powered-By;');
  note('Give up on an unreachable backend after 5 seconds (the default is 60).');
  w.line('proxy_connect_timeout 5s;');

  if (o.upstreams.length > 1) {
    note('Try the next server on gateway errors too. NGINX never retries POST requests unless told to.');
    w.line('proxy_next_upstream error timeout http_502 http_503 http_504;');
    w.line('proxy_next_upstream_tries 2;');
  }

  if (o.upstreamTls) {
    note('Check the backend certificate. This path is for Debian, Ubuntu, and Alpine; RHEL uses /etc/pki/tls/certs/ca-bundle.crt.');
    w.line(`proxy_ssl_name ${o.upstreamTlsName};`);
    w.line('proxy_ssl_server_name on;');
    w.line('proxy_ssl_verify on;');
    w.line('proxy_ssl_verify_depth 2;');
    w.line('proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;');
  }
}

function writeProxyLocations(w: ConfigWriter, o: ResolvedOptions): void {
  w.block('location /', () => {
    writeProxyDirectives(w, o, true);
    if (o.proxyReadTimeout !== 60) {
      w.comment('The NGINX default is 60 seconds.');
      w.line(`proxy_read_timeout ${o.proxyReadTimeout}s;`);
    }

    for (const line of rateLimitLine(o)) {
      w.line(line);
    }

    if (o.proxyCache) {
      writeCacheDirectives(w, o, 'proxy');
    }
  });

  if (o.websocketPath !== '') {
    w.blank();
    w.comment('Only this path is upgraded to WebSocket.');
    w.block(`location ^~ ${o.websocketPath}`, () => {
      writeProxyDirectives(w, o, false);
      w.line('proxy_set_header Upgrade $websocket_upgrade;');
      w.line('proxy_set_header Connection $connection_upgrade;');
      w.comment('WebSocket connections stay open for a long time.');
      w.line('proxy_read_timeout 1h;');
      w.line('proxy_send_timeout 1h;');
      for (const line of rateLimitLine(o)) {
        w.line(line);
      }
    });
  }

  if (o.streamingPath !== '') {
    w.blank();
    w.comment('Server-sent events: send each event to the client at once. Only this path gives up buffering.');
    w.block(`location ^~ ${o.streamingPath}`, () => {
      writeProxyDirectives(w, o, false);
      w.line('proxy_buffering off;');
      w.line('proxy_read_timeout 1h;');
      for (const line of rateLimitLine(o)) {
        w.line(line);
      }
    });
  }
}

function writeAppServer(w: ConfigWriter, o: ResolvedOptions): void {
  w.blank();
  w.block('server', () => {
    if (httpsOn(o)) {
      writeTlsListeners(w, o);
    } else {
      listenLines(w, o, o.httpPort, tcpFlags(o, []));
      writeLoopbackHealthListener(w, o);
    }

    w.line(`server_name ${canonicalServerName(o)};`);

    if (httpsOn(o)) {
      w.blank();
      writeCertificate(w, o);
    }

    w.blank();
    if (serversFiles(o)) {
      w.line(`root ${o.documentRoot};`);
      if (o.profile === 'php') {
        w.line('index index.php index.html;');
      }

      w.comment('Declare UTF-8 for text responses.');
      w.line('charset utf-8;');
      w.blank();
    }

    w.comment('The NGINX default is 1m. Larger uploads get status 413.');
    w.line(`client_max_body_size ${o.clientMaxBodySize};`);
    w.blank();
    writeSecurityHeaders(w, o);
    const hasLimits = o.connLimit > 0 || o.rateLimit !== 'off';
    if (hasLimits) {
      w.blank();
      writeRequestLimits(w, o);
    }

    w.blank();
    writeSharedLocations(w, o);
    if (!httpsOn(o)) {
      w.blank();
      writeAcmeChallengeLocation(w, o);
    }

    w.blank();
    if (o.profile === 'proxy') {
      writeProxyLocations(w, o);
    } else if (o.profile === 'php') {
      writePhpLocations(w, o);
    } else {
      writeStaticLocations(w, o);
    }
  });
}

function writeAliasServer(w: ConfigWriter, o: ResolvedOptions): void {
  const alias = aliasServerName(o);
  if (alias === null) {
    return;
  }

  w.blank();
  w.comment(`${alias} sends visitors to ${canonicalServerName(o)} with a permanent redirect.`);
  w.block('server', () => {
    if (httpsOn(o)) {
      writeTlsListeners(w, o);
    } else {
      listenLines(w, o, o.httpPort, tcpFlags(o, []));
    }

    w.line(`server_name ${alias};`);
    if (httpsOn(o)) {
      w.blank();
      if (o.https === 'manual') {
        w.comment('The certificate must list both names.');
      }

      writeCertificate(w, o);
      const hsts = hstsValue(o);
      if (hsts !== null) {
        w.blank();
        w.line(`add_header Strict-Transport-Security "${hsts}" always;`);
      }
    }

    w.blank();
    if (httpsOn(o)) {
      w.line(`return 301 ${publicOrigin('https', canonicalServerName(o), o.publicHttpsPort)}$request_uri;`);

      return;
    }

    writeAcmeChallengeLocation(w, o);
    w.blank();
    w.comment('Keep the scheme and port the visitor used; a TLS-terminating proxy in front sets them.');
    w.block('location /', () => {
      w.line(`return 301 ${protoVariable(o)}://${canonicalServerName(o)}$forwarded_port_suffix$request_uri;`);
    });
  });
}

function writeStatusServer(w: ConfigWriter, o: ResolvedOptions): void {
  if (!o.statusEndpoint) {
    return;
  }

  w.blank();
  w.comment('Connection counters for monitoring. Loopback only.');
  w.block('server', () => {
    w.line(`listen 127.0.0.1:${statusPort(o)};`);
    w.block('location = /nginx_status', () => {
      w.line('stub_status;');
      w.line('allow 127.0.0.1;');
      w.line('deny all;');
      w.line('access_log off;');
    });
  });
}

function writeTrailingServers(w: ConfigWriter, o: ResolvedOptions): void {
  writeRejectServers(w, o);
  if (httpsOn(o)) {
    writeHttpRedirectServer(w, o);
  }

  writeAppServer(w, o);
  writeAliasServer(w, o);
  writeStatusServer(w, o);
}

export function generateConfig(input: Options): string {
  const o = resolveOptions(input);
  const w = new ConfigWriter();
  writeMainContext(w, o);
  w.blank();
  w.block('http', () => {
    writeBasics(w, o);
    writeRealIp(w, o);
    writeForwardedVariables(w, o);
    writeTlsPolicy(w, o);
    writeResolver(w, o);
    writeCompression(w, o);
    writeFileCache(w, o);
    writeLimitZones(w, o);
    writeCachePaths(w, o);
    writeWebSocketMaps(w, o);
    writeUpstream(w, o);
    w.blank();
    writeTrailingServers(w, o);
  });

  return w.toString();
}

// The optional catch-all server for an existing multi-site config.
export function generateDefaultServer(port = 80): string {
  if (!isValidPort(port)) {
    throw new Error('Invalid default server port.');
  }

  const w = new ConfigWriter();
  w.comment(`Generated for NGINX Open Source ${NGINX_VERSION}.`);
  w.comment('Keep this server before application servers to reject unknown Host values.');
  w.block('server', () => {
    w.line(`listen ${port} default_server;`);
    w.line('server_name _;');
    w.line('return 444;');
  });
  w.blank();
  w.comment('Add the matching [::]:port listener when IPv6 is enabled on this host.');

  return w.toString();
}

export interface DeployStep {
  title: string;
  command?: string;
  note?: string;
}

function certbotNames(o: ResolvedOptions): string {
  const names = [canonicalServerName(o), aliasServerName(o)].filter((name): name is string => name !== null);

  return names.map((name) => `-d ${name}`).join(' ');
}

function containerRunCommand(o: ResolvedOptions): string {
  const publishedHttp = `-p ${o.publicHttpPort}:${o.httpPort}`;
  const publishedHttps = httpsOn(o) ? ` -p ${o.publicHttpsPort}:${o.httpsPort}${o.http3 ? ` -p ${o.publicHttpsPort}:${o.httpsPort}/udp` : ''}` : '';
  const mounts = [`-v "$PWD/nginx.conf:/etc/nginx/nginx.conf:ro"`];
  if (serversFiles(o)) {
    mounts.push(`-v "$PWD/public:${o.documentRoot}:ro"`);
  }

  if (o.https === 'manual') {
    mounts.push('-v "$PWD/tls:/etc/nginx/tls:ro"', `-v "$PWD/acme-challenge:${acmeWebroot(o)}:ro"`);
  }

  if (o.https === 'acme') {
    mounts.push('-v nginx-acme:/var/cache/nginx');
  }

  return [
    'docker run -d --name nginx --restart unless-stopped',
    `${publishedHttp}${publishedHttps}`,
    '--user 101:101 --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,uid=101,gid=101,mode=1777',
    '--cap-drop ALL --security-opt no-new-privileges:true',
    mounts.join(' '),
    NGINX_IMAGE
  ].join(' ');
}

const FIRST_RUN_NOTE =
  'For the first start, set HTTPS to Off in the builder and use that config for the steps up to the certificate. The certificate must exist before the TLS server can start.';

function hostCertificateSteps(o: ResolvedOptions): DeployStep[] {
  const names = certbotNames(o);

  return [
    {
      title: 'Get the first certificate',
      command: `sudo certbot certonly --webroot -w ${acmeWebroot(o)} ${names}`,
      note: 'The HTTP server answers the challenge for every name it lists, in every profile, and never forwards it to your backend.'
    },
    {
      title: 'Switch HTTPS to My own certificate files, then deploy again',
      command: 'sudo nginx -t && sudo systemctl reload nginx',
      note: `Use ${o.certificatePath} and ${o.certificateKeyPath}. Save the new config over /etc/nginx/nginx.conf first.`
    },
    {
      title: 'Renew certificates and reload NGINX',
      command: 'sudo certbot renew --deploy-hook "systemctl reload nginx"',
      note: 'Renewal uses the same challenge location, which stays on the HTTP port.'
    }
  ];
}

function containerCertificateSteps(o: ResolvedOptions): DeployStep[] {
  const names = certbotNames(o);
  const certbot = `docker run --rm -v "$PWD/letsencrypt:/etc/letsencrypt" -v "$PWD/acme-challenge:/acme" certbot/certbot`;
  const directory = `./tls/${o.serverName}`;

  return [
    {
      title: 'Get the first certificate',
      command: `${certbot} certonly --webroot -w /acme ${names}`,
      note: 'The running container (HTTPS off) answers the challenge from the mounted acme-challenge folder, for every name it lists.'
    },
    {
      title: 'Copy the certificate where the config expects it',
      command: `mkdir -p ${directory} && cp -L letsencrypt/live/${canonicalServerName(o)}/fullchain.pem letsencrypt/live/${canonicalServerName(o)}/privkey.pem ${directory}/ && chmod 644 ${directory}/privkey.pem`,
      note: 'The key must be readable by user 101. Keep the folder private on the host.'
    },
    {
      title: 'Switch HTTPS to My own certificate files, then start the container again',
      command: `docker rm -f nginx && ${containerRunCommand(o)}`,
      note: 'Save the new config as nginx.conf first.'
    },
    {
      title: 'Renew certificates',
      command: `${certbot} renew && cp -L letsencrypt/live/${canonicalServerName(o)}/*.pem ${directory}/ && docker kill --signal HUP nginx`,
      note: 'Run it from a timer. The HUP signal makes NGINX reload the new files.'
    }
  ];
}

export function deploySteps(input: Options): DeployStep[] {
  const o = resolveOptions(input);
  const steps: DeployStep[] = [];

  if (isContainer(o)) {
    steps.push({
      title: 'Save the config as nginx.conf next to your content',
      note: `The config is complete. The container mounts it as /etc/nginx/nginx.conf.${o.https === 'manual' ? ` ${FIRST_RUN_NOTE}` : ''}`
    });
    if (o.https === 'manual') {
      steps.push({
        title: 'Create the folders for certificates and challenges',
        command: 'mkdir -p tls acme-challenge letsencrypt',
        note: `The challenge folder is mounted read-only at ${acmeWebroot(o)}.`
      });
    }

    if (o.https === 'acme') {
      steps.push(
        {
          title: 'Create a volume for the ACME account and certificates',
          command: `docker volume create nginx-acme && docker run --rm --user 0 --entrypoint sh -v nginx-acme:/var/cache/nginx ${NGINX_IMAGE} -c 'mkdir -p /var/cache/nginx/acme-letsencrypt && chown -R 101:101 /var/cache/nginx'`,
          note: 'The volume must survive restarts, or NGINX asks for a new certificate each time. User 101 must own it. Run this once, before the first start.'
        },
        { title: 'Make port 80 reachable from the internet', note: 'Let’s Encrypt checks the domain over HTTP on port 80 (HTTP-01).' }
      );
    }

    steps.push({ title: 'Test the config', command: `docker run --rm --entrypoint nginx -v "$PWD/nginx.conf:/etc/nginx/nginx.conf:ro" ${NGINX_IMAGE} -t` });
    steps.push({
      title: 'Start the container',
      command: containerRunCommand(o),
      note: o.http3 ? 'HTTP/3 uses UDP. Open the HTTPS port for UDP in your firewall too.' : undefined
    });
    if (o.https === 'manual') {
      steps.push(...containerCertificateSteps(o));
    }
  } else {
    steps.push({
      title: 'Save the config',
      command: 'sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak && sudo cp nginx.conf /etc/nginx/nginx.conf',
      note: `The config is complete. It replaces /etc/nginx/nginx.conf, so keep the backup.${o.https === 'manual' ? ` ${FIRST_RUN_NOTE}` : ''}`
    });
    if (serversFiles(o)) {
      steps.push({ title: 'Create the files folder', command: `sudo mkdir -p ${o.documentRoot}`, note: `Put your site in it. The ${o.workerUser} user needs read access.` });
    }

    if (o.https === 'manual') {
      steps.push({
        title: 'Create the challenge folder',
        command: `sudo mkdir -p ${acmeWebroot(o)}`,
        note: 'The HTTP server serves /.well-known/acme-challenge/ from here.'
      });
    }

    if (o.https === 'acme') {
      steps.push(
        {
          title: 'Install the ACME module',
          command: 'sudo apt install nginx-module-acme',
          note: 'Packages from nginx.org include it since 1.29.1. Use your package manager if you do not use apt.'
        },
        {
          title: 'Create the folder for ACME state',
          command: `sudo mkdir -p /var/cache/nginx/acme-letsencrypt && sudo chown ${o.workerUser}: /var/cache/nginx/acme-letsencrypt`,
          note: 'Make port 80 reachable from the internet. Let’s Encrypt checks the domain over HTTP (HTTP-01).'
        }
      );
    }

    steps.push({ title: 'Test the config', command: 'sudo nginx -t' }, { title: 'Reload NGINX', command: 'sudo systemctl reload nginx' });
    if (o.https === 'manual') {
      steps.push(...hostCertificateSteps(o));
    }
  }

  if (o.realIp === 'cloudflare') {
    steps.push({
      title: 'Set Cloudflare SSL/TLS mode',
      note: httpsOn(o)
        ? 'Use Full (strict), so Cloudflare checks your origin certificate.'
        : 'With HTTPS off, Cloudflare must use Flexible mode, and its connection to your server is not encrypted.'
    });
  }

  if (o.statusEndpoint) {
    steps.push({ title: 'Check the status page', command: `${isContainer(o) ? 'docker exec nginx ' : ''}curl -s http://127.0.0.1:${statusPort(o)}/nginx_status` });
  }

  return steps;
}

export interface ConfigWarning {
  level: 'info' | 'warn';
  message: string;
  key?: string;
}

export function warnings(input: Options): ConfigWarning[] {
  const o = resolveOptions(input);
  const result: ConfigWarning[] = [];
  const warn = (message: string, key?: string) => result.push({ level: 'warn', message, ...(key ? { key } : {}) });
  const info = (message: string, key?: string) => result.push({ level: 'info', message, ...(key ? { key } : {}) });

  if (o.http3) {
    warn(`HTTP/3 is experimental in NGINX. Open UDP port ${o.publicHttpsPort} as well as TCP, or browsers fall back to HTTP/2.`, 'http3');
  }

  if (o.hsts === 'preload') {
    warn('HSTS preload is very hard to undo. Submit the domain to the preload list only when every subdomain works over HTTPS.', 'hsts');
  } else if (o.hsts === 'subdomains') {
    warn('HSTS with subdomains makes every subdomain HTTPS only for 2 years.', 'hsts');
  }

  if (o.contentSecurityPolicy !== '' && !o.cspReportOnly) {
    warn('An enforced Content-Security-Policy can break your site. Try Report only first.', 'contentSecurityPolicy');
  }

  if (o.gzip && hasBackend(o)) {
    warn('Compressing dynamic pages can leak secrets through the BREACH attack. Keep secrets away from pages that echo user input.', 'gzip');
  }

  if (o.rateLimit !== 'off' && o.realIp === 'off') {
    warn('Behind a CDN or load balancer, every visitor shares the proxy address, so the rate limit counts them all together. Set the real client IP.', 'rateLimit');
  }

  if (o.ipv6 && !isContainer(o)) {
    info('NGINX does not start if this host has IPv6 turned off. Turn off Listen on IPv6 in that case.', 'ipv6');
  }

  if (o.https === 'acme') {
    warn('Automatic certificates need port 80 reachable from the internet, a working DNS resolver, and a writable state folder.', 'https');
  }

  if (o.https === 'manual') {
    info('The certificate and key files must exist before NGINX starts, or the test and the start fail.', 'https');
  }

  if (o.wwwRedirect !== 'off' && o.https === 'manual') {
    warn('The certificate must list both the bare domain and the www name.', 'wwwRedirect');
  }

  if (o.realIp === 'cloudflare') {
    info('The Cloudflare address ranges in this config were copied on 2026-10-01. Update them when Cloudflare changes its list.', 'realIp');
  }

  if (proxyProtocolOn(o)) {
    warn(`With PROXY protocol, plain requests to the public port are rejected. Health probes use 127.0.0.1:${o.httpPort}. ACME challenges only work through your proxy.`, 'realIpHeader');
  }

  if (o.statusEndpoint) {
    info(`The status page listens on 127.0.0.1:${statusPort(o)}.`, 'statusEndpoint');
  }

  if (isContainer(o)) {
    info(`Publish the container ports: ${o.publicHttpPort}:${o.httpPort}${httpsOn(o) ? ` and ${o.publicHttpsPort}:${o.httpsPort}` : ''}.`);
  }

  if (isContainer(o) && o.profile === 'php') {
    info('The PHP-FPM address is relative to the container. Use a service name such as php:9000 if PHP-FPM runs in another container.', 'upstreams');
  }

  if (o.tlsProfile === 'modern' && httpsOn(o)) {
    info('Modern allows only TLS 1.3. Older clients cannot connect.', 'tlsProfile');
  }

  return result;
}
