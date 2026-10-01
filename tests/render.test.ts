import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultsFor, validateOptions, type Options, type Profile, type Target } from '../lib/options.ts';
import { ConfigValidationError, deploySteps, generateConfig, generateDefaultServer, warnings } from '../lib/render.ts';
import { CLOUDFLARE_RANGES } from '../lib/cloudflare-ips.ts';
import { NGINX_IMAGE } from '../lib/version.ts';
import { ACME, MANUAL_TLS, aliasServer, appServer, configFor, directive, find, http, location, parseConfig, redirectServer, servers, type Block } from './support.ts';

const profiles: Profile[] = ['static', 'spa', 'php', 'proxy'];
const targets: Target[] = ['host', 'container'];
const SECURITY_HEADERS = ['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Content-Security-Policy'];

function everyConfig(overrides: Record<string, unknown> = {}): { name: string; config: string }[] {
  return profiles.flatMap((profile) =>
    targets.flatMap((target) =>
      [{}, MANUAL_TLS, ACME].map((tls) => {
        const merged = { ...tls, ...overrides };
        const label = `${profile}/${target}/${(tls as { https?: string }).https ?? 'off'}`;

        return { name: label, config: configFor(profile, target, merged) };
      })
    )
  );
}

function headerNames(block: Block): string[] {
  return directive(block, 'add_header').map((args) => args.split(/\s+/)[0]!);
}

function allBlocks(block: Block): Block[] {
  return [block, ...block.blocks.flatMap(allBlocks)];
}

test('A10: every line is indented 4 spaces per brace level', () => {
  const samples = [
    ...everyConfig(),
    { name: 'full', config: configFor('proxy', 'container', { ...ACME, http3: true, realIp: 'cloudflare', wwwRedirect: 'to-apex', websocketPath: '/ws/', streamingPath: '/sse/', proxyCache: true, rateLimit: 'on', statusEndpoint: true }) },
    { name: 'php', config: configFor('php', 'host', { ...MANUAL_TLS, fastcgiCache: true, openFileCache: true }) }
  ];
  for (const { name, config } of samples) {
    let depth = 0;
    let continuing: boolean = false;
    for (const line of config.split('\n')) {
      if (line === '') {
        continue;
      }

      const content = line.trim();
      const closes = content.startsWith('}');
      const level = depth - (closes ? 1 : 0);
      const expected: number = (level + (continuing ? 1 : 0)) * 4;
      const indent = line.length - line.trimStart().length;
      assert.equal(indent, expected, `${name}: "${line}"`);
      if (!content.startsWith('#')) {
        depth += (content.endsWith('{') ? 1 : 0) - (closes ? 1 : 0);
        continuing = !content.endsWith(';') && !content.endsWith('{') && !content.endsWith('}');
      }
    }

    assert.equal(depth, 0, `${name}: braces balance`);
    assert.ok(config.endsWith('}\n') && !config.endsWith('\n\n'), `${name}: ends with a single newline`);
    assert.ok(!/\n\n\n/.test(config), `${name}: no double blank lines`);
  }
});

test('every directive line is terminated, and every file parses', () => {
  for (const { name, config } of everyConfig()) {
    for (const line of config.split('\n')) {
      const content = line.trim();
      if (content === '' || content.startsWith('#') || content.endsWith('{') || content === '}' || content.endsWith(';')) {
        continue;
      }

      assert.ok(/^['"]/.test(content) || /^[A-Za-z0-9_$/.~-]/.test(content), `${name}: continuation line "${line}"`);
    }

    assert.equal(find(parseConfig(config), 'http').length, 1, name);
  }
});

test('A1: the WebSocket maps clear Connection for normal requests', () => {
  const config = configFor('proxy', 'host', { websocketPath: '/ws/' });
  const maps = find(http(config), 'map');
  const connection = maps.find((block) => block.args === '$http_upgrade $connection_upgrade')!;
  assert.deepEqual(connection.directives, [
    { name: 'default', args: '""' },
    { name: '~*^websocket$', args: 'upgrade' }
  ]);
  const upgrade = maps.find((block) => block.args === '$http_upgrade $websocket_upgrade')!;
  assert.deepEqual(upgrade.directives, [
    { name: 'default', args: '""' },
    { name: '~*^websocket$', args: 'websocket' }
  ]);
  assert.doesNotMatch(config, /default close;/);
  assert.doesNotMatch(config, /"" close;/);
});

test('A1/C12: only the WebSocket path gets upgrade headers and long timeouts', () => {
  const server = appServer(configFor('proxy', 'host', { websocketPath: '/ws/' }), 'example.com');
  const websocket = location(server, '/ws/');
  assert.ok(directive(websocket, 'proxy_set_header').includes('Upgrade $websocket_upgrade'));
  assert.ok(directive(websocket, 'proxy_set_header').includes('Connection $connection_upgrade'));
  assert.deepEqual(directive(websocket, 'proxy_read_timeout'), ['1h']);
  assert.deepEqual(directive(websocket, 'proxy_send_timeout'), ['1h']);

  const root = location(server, '/');
  assert.ok(!directive(root, 'proxy_set_header').some((value) => value.startsWith('Connection') || value.startsWith('Upgrade')));
  assert.deepEqual(directive(root, 'proxy_read_timeout'), []);
  assert.deepEqual(directive(root, 'proxy_buffering'), []);
});

test('C12: the streaming path turns buffering off for that path only', () => {
  const server = appServer(configFor('proxy', 'host', { streamingPath: '/events/' }), 'example.com');
  assert.deepEqual(directive(location(server, '/events/'), 'proxy_buffering'), ['off']);
  assert.deepEqual(directive(location(server, '/events/'), 'proxy_read_timeout'), ['1h']);
  assert.deepEqual(directive(location(server, '/'), 'proxy_buffering'), []);
});

test('proxy locations repeat the full header set and clear spoofable headers', () => {
  const server = appServer(configFor('proxy', 'host', { websocketPath: '/ws/', streamingPath: '/events/' }), 'example.com');
  for (const path of ['/', '/ws/', '/events/']) {
    const headers = directive(location(server, path), 'proxy_set_header');
    for (const expected of ['Host $host', 'X-Real-IP $remote_addr', 'X-Forwarded-For $remote_addr', 'X-Forwarded-Host $host', 'X-Request-ID $request_id', 'Forwarded ""', 'Proxy ""', 'X-Client-IP ""']) {
      assert.ok(headers.includes(expected), `${path} lacks ${expected}`);
    }

    assert.deepEqual(directive(location(server, path), 'proxy_hide_header'), ['X-Powered-By']);
  }
});

test('A11: restated defaults are gone', () => {
  for (const { name, config } of everyConfig()) {
    for (const stale of [
      /tcp_nodelay/, /sendfile_max_chunk/, /keepalive_requests/, /ignore_invalid_headers/, /underscores_in_headers/, /merge_slashes/,
      /proxy_http_version/, /proxy_set_header Connection ""/, /^\s*keepalive \d+;/m, /fastcgi_index/, /keepalive_timeout/,
      /client_body_timeout/, /send_timeout/, /ssl_early_data/, /ssl_session_tickets/, /ssl_prefer_server_ciphers/, /ssl_ecdh_curve/,
      /ssl_stapling/, /ssl_dhparam/, /proxy_buffering on/, /proxy_request_buffering/, /proxy_send_timeout 60s/, /proxy_cache_methods/,
      /\bgzip on;[\s\S]*\bgzip on;/
    ]) {
      assert.doesNotMatch(config, stale, `${name} contains ${stale}`);
    }
  }
});

test('A5/B7: /healthz returns 204 without a Content-Length header and inherits the security headers', () => {
  for (const { name, config } of everyConfig()) {
    const health = location(appServer(config, 'example.com'), '= /healthz');
    assert.deepEqual(health.directives, [
      { name: 'access_log', args: 'off' },
      { name: 'return', args: '204' }
    ], name);
    assert.doesNotMatch(config, /Content-Length/i, name);
  }
});

test('A6/R1: immutable assets use plain prefixes, never ^~ or a hash regex', () => {
  const config = configFor('spa', 'host', { immutablePaths: ['/assets/', '/build/assets/'] });
  const server = appServer(config, 'example.com');
  for (const path of ['/assets/', '/build/assets/']) {
    const block = location(server, path);
    assert.deepEqual(directive(block, 'try_files'), ['$uri =404']);
    assert.deepEqual(directive(block, 'add_header'), ['Cache-Control "public, max-age=31536000, immutable"']);
  }

  assert.ok(!find(server, 'location').some((block) => block.args.startsWith('^~') && !block.args.includes('acme-challenge')));
  assert.doesNotMatch(config, /\{8,\}/);
  assert.doesNotMatch(config, /immutable[\s\S]*location ~/);
  assert.deepEqual(find(appServer(configFor('static', 'host'), 'example.com'), 'location').filter((block) => block.args.startsWith('/') && block.args !== '/' ).length, 0);
});

test('R1: regex protections come before every immutable prefix, so dotfiles and sources stay private', () => {
  for (const profile of ['spa', 'php', 'static'] as const) {
    const server = appServer(configFor(profile, 'host', { immutablePaths: ['/assets/', '/build/'] }), 'example.com');
    const locations = find(server, 'location');
    const dotfiles = locations.findIndex((block) => block.args === '~ /\\.(?!well-known/)');
    const extensions = locations.findIndex((block) => block.args.startsWith('~* \\.(?:bak|conf'));
    const firstPrefix = locations.findIndex((block) => block.args === '/assets/');
    assert.ok(dotfiles >= 0 && extensions >= 0 && firstPrefix > extensions, profile);
    assert.deepEqual(locations[dotfiles]!.directives, [{ name: 'deny', args: 'all' }]);
  }

  const php = appServer(configFor('php', 'host', { immutablePaths: ['/build/'] }), 'example.com');
  const locations = find(php, 'location').map((block) => block.args);
  assert.ok(locations.indexOf('~* \\.php$') >= 0);
  assert.ok(!locations.includes('^~ /build/'));
});

test('A7/B10: dotfiles are denied except .well-known; extension rules only for file profiles', () => {
  for (const { name, config } of everyConfig()) {
    const server = appServer(config, 'example.com');
    const dot = location(server, '~ /\\.(?!well-known/)');
    assert.deepEqual(dot.directives, [{ name: 'deny', args: 'all' }], name);
    const hasExtensionRule = find(server, 'location').some((block) => block.args.startsWith('~* \\.(?:bak'));
    assert.equal(hasExtensionRule, !name.startsWith('proxy'), name);
  }

  assert.doesNotMatch(configFor('static', 'host'), /well-known\(\?:\/\|\$\)/);
});

test('B1: relative redirects, so published ports never leak', () => {
  for (const { name, config } of everyConfig()) {
    assert.deepEqual(directive(http(config), 'absolute_redirect'), ['off'], name);
  }
});

test('B2: security headers are set once per server, children add only their own', () => {
  for (const { name, config } of everyConfig({ permissionsPolicy: true, crossOriginOpenerPolicy: 'same-origin', contentSecurityPolicy: "default-src 'self'" })) {
    assert.deepEqual(directive(http(config), 'add_header_inherit'), ['merge'], name);
    assert.deepEqual(directive(http(config), 'add_header'), [], name);
    const app = appServer(config, 'example.com');
    const names = headerNames(app);
    assert.equal(new Set(names).size, names.length, `${name}: duplicate header at server level`);
    for (const header of SECURITY_HEADERS) {
      assert.equal(names.filter((candidate) => candidate === header).length, 1, `${name}: ${header}`);
    }

    for (const child of allBlocks(app).filter((block) => block.name === 'location')) {
      for (const childHeader of headerNames(child)) {
        assert.equal(childHeader, 'Cache-Control', `${name}: ${child.args} sets ${childHeader}`);
        assert.ok(!names.includes(childHeader), `${name}: ${child.args} repeats ${childHeader}`);
      }
    }
  }
});

test('B2/C7: X-Frame-Options and CSP frame-ancestors follow the option, merged into one CSP header', () => {
  const header = (config: string, name: string) => directive(appServer(config, 'example.com'), 'add_header').filter((args) => args.startsWith(`${name} `));
  assert.deepEqual(header(configFor('static', 'host'), 'X-Frame-Options'), ['X-Frame-Options "SAMEORIGIN" always']);
  assert.deepEqual(header(configFor('static', 'host'), 'Content-Security-Policy'), ["Content-Security-Policy \"frame-ancestors 'self'\" always"]);
  assert.deepEqual(header(configFor('static', 'host', { frameOptions: 'deny' }), 'X-Frame-Options'), ['X-Frame-Options "DENY" always']);
  assert.deepEqual(header(configFor('static', 'host', { frameOptions: 'deny' }), 'Content-Security-Policy'), ["Content-Security-Policy \"frame-ancestors 'none'\" always"]);
  assert.deepEqual(header(configFor('static', 'host', { frameOptions: 'off' }), 'X-Frame-Options'), []);
  assert.deepEqual(header(configFor('static', 'host', { frameOptions: 'off' }), 'Content-Security-Policy'), []);
  assert.deepEqual(header(configFor('static', 'host', { contentSecurityPolicy: "default-src 'self'" }), 'Content-Security-Policy'), [
    "Content-Security-Policy \"default-src 'self'; frame-ancestors 'self'\" always"
  ]);
  assert.deepEqual(header(configFor('static', 'host', { contentSecurityPolicy: "default-src 'self'; frame-ancestors 'none'" }), 'Content-Security-Policy'), [
    "Content-Security-Policy \"default-src 'self'; frame-ancestors 'none'\" always"
  ]);
  const reportOnly = configFor('static', 'host', { contentSecurityPolicy: "default-src 'self'", cspReportOnly: true });
  assert.deepEqual(header(reportOnly, 'Content-Security-Policy'), ["Content-Security-Policy \"frame-ancestors 'self'\" always"]);
  assert.deepEqual(header(reportOnly, 'Content-Security-Policy-Report-Only'), ["Content-Security-Policy-Report-Only \"default-src 'self'\" always"]);
});

test('C9/C10: optional headers', () => {
  const server = appServer(configFor('static', 'host', { permissionsPolicy: true, crossOriginOpenerPolicy: 'same-origin-allow-popups' }), 'example.com');
  assert.ok(directive(server, 'add_header').includes('Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always'));
  assert.ok(directive(server, 'add_header').includes('Cross-Origin-Opener-Policy "same-origin-allow-popups" always'));
  assert.ok(!directive(appServer(configFor('static', 'host'), 'example.com'), 'add_header').some((value) => value.startsWith('Permissions-Policy')));
  assert.doesNotMatch(configFor('static', 'host'), /X-XSS-Protection|Expect-CT|Public-Key-Pins/);
});

test('B3: backend implementation headers are hidden', () => {
  assert.deepEqual(directive(location(appServer(configFor('php', 'host'), 'example.com'), '~* \\.php$'), 'fastcgi_hide_header'), ['X-Powered-By']);
  assert.deepEqual(directive(location(appServer(configFor('proxy', 'host'), 'example.com'), '/'), 'proxy_hide_header'), ['X-Powered-By']);
});

test('B4/R17: complete gzip types, compression for CDNs, and no compressed formats', () => {
  const config = configFor('static', 'host');
  const gzipTypes = directive(http(config), 'gzip_types')[0]!.split(' ');
  for (const type of ['text/javascript', 'application/javascript', 'application/json', 'application/manifest+json', 'application/wasm', 'image/svg+xml', 'image/x-icon', 'font/ttf', 'font/otf', 'text/markdown', 'application/xhtml+xml', 'application/rss+xml']) {
    assert.ok(gzipTypes.includes(type), type);
  }

  for (const type of gzipTypes) {
    assert.doesNotMatch(type, /woff|image\/(?:png|jpeg|webp|avif|gif)|zip|video|audio/);
  }

  assert.equal(new Set(gzipTypes).size, gzipTypes.length);
  assert.deepEqual(directive(http(config), 'gzip_proxied'), ['any']);
  assert.deepEqual(directive(http(config), 'gzip_vary'), ['on']);
  assert.deepEqual(directive(http(config), 'gzip_static'), ['on']);
  assert.deepEqual(directive(http(config), 'gzip_comp_level'), []);
  assert.deepEqual(directive(http(configFor('static', 'host', { gzipLevel: 5 })), 'gzip_comp_level'), ['5']);
});

test('gzip is opt-in for dynamic profiles and gzip_static works without it', () => {
  assert.deepEqual(directive(http(configFor('proxy', 'host')), 'gzip'), []);
  assert.deepEqual(directive(http(configFor('proxy', 'host', { gzip: true })), 'gzip'), ['on']);
  const staticOnly = http(configFor('php', 'host', { gzip: false, gzipStatic: true }));
  assert.deepEqual(directive(staticOnly, 'gzip'), []);
  assert.deepEqual(directive(staticOnly, 'gzip_static'), ['on']);
  assert.deepEqual(directive(staticOnly, 'gzip_proxied'), ['any']);
  const none = http(configFor('php', 'host', { gzip: false, gzipStatic: false }));
  assert.deepEqual(directive(none, 'gzip_proxied'), []);
});

test('B5: the request ID is logged, sent to backends, and passed to PHP', () => {
  assert.match(configFor('static', 'host'), /rid=\$request_id/);
  assert.match(configFor('static', 'host'), /\$uri \$server_protocol/);
  assert.doesNotMatch(configFor('static', 'host'), /\$request"|\$request_uri.*log_format|\$http_referer/);
  assert.ok(directive(location(appServer(configFor('proxy', 'host'), 'example.com'), '/'), 'proxy_set_header').includes('X-Request-ID $request_id'));
  assert.ok(directive(location(appServer(configFor('php', 'host'), 'example.com'), '~* \\.php$'), 'fastcgi_param').includes('HTTP_X_REQUEST_ID $request_id'));
});

test('B8/R20: manual HTTPS answers the ACME challenge on the HTTP listener before redirecting', () => {
  for (const target of targets) {
    const config = configFor('proxy', target, MANUAL_TLS);
    const redirect = redirectServer(config);
    const locations = find(redirect, 'location');
    assert.deepEqual(
      locations.map((block) => block.args),
      ['^~ /.well-known/acme-challenge/', '/']
    );
    assert.deepEqual(locations[0]!.directives, [
      { name: 'root', args: target === 'host' ? '/var/www/_letsencrypt' : '/var/cache/nginx/acme-challenge' },
      { name: 'try_files', args: '$uri =404' }
    ]);
    assert.deepEqual(locations[1]!.directives, [{ name: 'return', args: `308 https://example.com$request_uri` }]);
  }
});

test('R20: the challenge location is served on HTTP in every profile, also with HTTPS off, for every listed name', () => {
  for (const profile of profiles) {
    const config = configFor(profile, 'host');
    const server = appServer(config);
    const challenge = location(server, '^~ /.well-known/acme-challenge/');
    assert.deepEqual(challenge.directives, [
      { name: 'root', args: '/var/www/_letsencrypt' },
      { name: 'try_files', args: '$uri =404' }
    ]);
    const locations = find(server, 'location').map((block) => block.args);
    assert.ok(locations.indexOf('^~ /.well-known/acme-challenge/') < locations.indexOf('/'), `${profile}: challenge before the catch-all`);
  }

  const alias = aliasServer(configFor('proxy', 'container', { wwwRedirect: 'to-apex' }), 'www.example.com', false);
  assert.deepEqual(find(alias, 'location').map((block) => block.args), ['^~ /.well-known/acme-challenge/', '/']);
  assert.deepEqual(directive(location(alias, '^~ /.well-known/acme-challenge/'), 'root'), ['/var/cache/nginx/acme-challenge']);

  const manual = redirectServer(configFor('static', 'host', { ...MANUAL_TLS, wwwRedirect: 'to-apex' }));
  assert.deepEqual(directive(manual, 'server_name'), ['example.com www.example.com']);
  assert.ok(find(manual, 'location').some((block) => block.args === '^~ /.well-known/acme-challenge/'));

  const acme = redirectServer(configFor('static', 'host', ACME));
  assert.ok(!find(acme, 'location').some((block) => block.args.includes('acme-challenge')), 'the ACME module answers its own challenge');
});

test('R21: every redirect has an exact Location', () => {
  const returns = (server: Block) => find(server, 'location').flatMap((block) => directive(block, 'return')).concat(directive(server, 'return'));
  const plain = configFor('static', 'host', { wwwRedirect: 'to-apex', publicHttpPort: 8000, publicHttpsPort: 9443, realIp: 'custom', trustedProxies: ['10.0.0.0/8'] });
  assert.ok(find(http(plain), 'map').some((block) => block.args === '$forwarded_proto $forwarded_port_suffix'));
  const suffix = find(http(plain), 'map').find((block) => block.args === '$forwarded_proto $forwarded_port_suffix')!;
  assert.deepEqual(suffix.directives, [
    { name: 'default', args: '":8000"' },
    { name: 'https', args: '":9443"' }
  ]);
  assert.deepEqual(returns(aliasServer(plain, 'www.example.com', false)), ['301 $forwarded_proto://example.com$forwarded_port_suffix$request_uri']);
  const standard = find(http(configFor('static', 'host', { wwwRedirect: 'to-apex' })), 'map').find((block) => block.args === '$scheme $forwarded_port_suffix')!;
  assert.deepEqual(standard.directives, [
    { name: 'default', args: '""' },
    { name: 'https', args: '""' }
  ]);

  for (const publicHttpsPort of [443, 9443]) {
    const secure = configFor('static', 'host', { ...MANUAL_TLS, wwwRedirect: 'to-www', publicHttpsPort });
    const target = `https://www.example.com${publicHttpsPort === 443 ? '' : ':9443'}$request_uri`;
    assert.deepEqual(returns(redirectServer(secure)), [`308 ${target}`]);
    assert.deepEqual(returns(aliasServer(secure, 'example.com', true)), [`301 ${target}`]);
  }

  assert.deepEqual(find(http(configFor('static', 'host')), 'map').filter((block) => block.args.includes('forwarded_port_suffix')), []);
  assert.deepEqual(find(http(configFor('static', 'host', { ...MANUAL_TLS, wwwRedirect: 'to-apex' })), 'map').filter((block) => block.args.includes('forwarded_port_suffix')), []);
});

test('R19: the PROXY protocol config keeps a plain loopback listener for health probes', () => {
  const plain = configFor('static', 'container', { realIp: 'custom', trustedProxies: ['10.0.0.0/8'], realIpHeader: 'proxy_protocol' });
  assert.deepEqual(directive(appServer(plain), 'listen'), ['8080 proxy_protocol', '127.0.0.1:8080']);
  const secure = configFor('static', 'container', { ...MANUAL_TLS, realIp: 'custom', trustedProxies: ['10.0.0.0/8'], realIpHeader: 'proxy_protocol' });
  const redirect = redirectServer(secure);
  assert.deepEqual(directive(redirect, 'listen'), ['8080 proxy_protocol', '127.0.0.1:8080']);
  assert.deepEqual(location(redirect, '= /healthz').directives, [
    { name: 'access_log', args: 'off' },
    { name: 'return', args: '204' }
  ]);
  assert.doesNotMatch(configFor('static', 'container'), /127\.0\.0\.1:8080/);
  assert.doesNotMatch(configFor('static', 'container', { realIp: 'custom', trustedProxies: ['10.0.0.0/8'] }), /127\.0\.0\.1:8080/);
});

test('R23: gzipStatic alone still sets gzip_vary and gzip_proxied any', () => {
  const globals = http(configFor('static', 'host', { gzip: false, gzipStatic: true }));
  assert.deepEqual(directive(globals, 'gzip'), []);
  assert.deepEqual(directive(globals, 'gzip_static'), ['on']);
  assert.deepEqual(directive(globals, 'gzip_vary'), ['on']);
  assert.deepEqual(directive(globals, 'gzip_proxied'), ['any']);
});

test('B8/A3: redirects use the explicit name and the public HTTPS port', () => {
  const defaultPort = redirectServer(configFor('static', 'container', MANUAL_TLS));
  assert.deepEqual(directive(location(defaultPort, '/'), 'return'), ['308 https://example.com$request_uri']);
  const custom = redirectServer(configFor('static', 'container', { ...MANUAL_TLS, publicHttpsPort: 8443 }));
  assert.deepEqual(directive(location(custom, '/'), 'return'), ['308 https://example.com:8443$request_uri']);
  assert.doesNotMatch(configFor('static', 'container', MANUAL_TLS), /return 308 https:\/\/\$host/);
});

test('ACME: the module block, certificate variables, and the HTTP listener', () => {
  const config = configFor('static', 'container', { ...ACME, acmeStaging: true });
  assert.match(config, /^load_module modules\/ngx_http_acme_module\.so;$/m);
  const globals = http(config);
  const issuer = find(globals, 'acme_issuer')[0]!;
  assert.equal(issuer.args, 'letsencrypt');
  assert.deepEqual(issuer.directives, [
    { name: 'uri', args: 'https://acme-staging-v02.api.letsencrypt.org/directory' },
    { name: 'contact', args: 'admin@example.com' },
    { name: 'state_path', args: '/var/cache/nginx/acme-letsencrypt' },
    { name: 'accept_terms_of_service', args: '' }
  ]);
  assert.deepEqual(directive(globals, 'acme_shared_zone'), ['zone=ngx_acme_shared:1M']);
  assert.deepEqual(directive(globals, 'resolver'), ['127.0.0.11 valid=30s ipv6=off']);
  const tls = servers(config).find((server) => directive(server, 'acme_certificate').length > 0)!;
  assert.deepEqual(directive(tls, 'ssl_certificate'), ['$acme_certificate']);
  assert.deepEqual(directive(tls, 'ssl_certificate_key'), ['$acme_certificate_key']);
  assert.deepEqual(directive(tls, 'ssl_certificate_cache'), ['max=2']);
  assert.match(configFor('static', 'container', { ...ACME }), /uri https:\/\/acme-v02\.api\.letsencrypt\.org\/directory;/);
  assert.doesNotMatch(configFor('static', 'container', MANUAL_TLS), /load_module|acme_/);
  assert.doesNotMatch(configFor('static', 'container', MANUAL_TLS), /root \/var\/www\/_letsencrypt;[\s\S]*acme/);
});

test('TLS policy: intermediate, modern, session settings, and no stapling', () => {
  const intermediate = http(configFor('static', 'host', MANUAL_TLS));
  assert.deepEqual(directive(intermediate, 'ssl_protocols'), ['TLSv1.2 TLSv1.3']);
  assert.match(directive(intermediate, 'ssl_ciphers')[0]!, /^ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:.*ECDHE-RSA-CHACHA20-POLY1305$/);
  assert.deepEqual(directive(intermediate, 'ssl_session_cache'), ['shared:SSL:10m']);
  assert.deepEqual(directive(intermediate, 'ssl_session_timeout'), ['1d']);
  const modern = http(configFor('static', 'host', { ...MANUAL_TLS, tlsProfile: 'modern' }));
  assert.deepEqual(directive(modern, 'ssl_protocols'), ['TLSv1.3']);
  assert.deepEqual(directive(modern, 'ssl_ciphers'), []);
  assert.deepEqual(directive(http(configFor('static', 'host')), 'ssl_protocols'), []);
});

test('HTTPS app server listens with http2 and the TLS reject server rejects unknown names', () => {
  const config = configFor('static', 'container', MANUAL_TLS);
  const tls = appServer(config);
  assert.deepEqual(directive(tls, 'listen'), ['8443 ssl']);
  assert.deepEqual(directive(tls, 'http2'), ['on']);
  assert.deepEqual(directive(tls, 'ssl_certificate'), ['/etc/nginx/tls/fullchain.pem']);
  const reject = servers(config).find((server) => directive(server, 'ssl_reject_handshake').length > 0)!;
  assert.deepEqual(directive(reject, 'listen'), ['8443 ssl default_server']);
  assert.deepEqual(directive(reject, 'server_name'), ['_']);
  assert.deepEqual(directive(reject, 'http2'), []);
});

test('C4: IPv6 listeners sit next to every IPv4 listener, including the reject servers', () => {
  const config = configFor('static', 'container', { ...MANUAL_TLS, ipv6: true, http3: true, wwwRedirect: 'to-apex' });
  for (const server of servers(config)) {
    const listens = directive(server, 'listen');
    const v4 = listens.filter((value) => !value.startsWith('['));
    const v6 = listens.filter((value) => value.startsWith('['));
    assert.equal(v6.length, v4.length, listens.join(' | '));
    assert.deepEqual(v6.map((value) => value.replace('[::]:', '')), v4);
  }

  assert.deepEqual(directive(appServer(configFor('static', 'host'), 'example.com'), 'listen'), ['80', '[::]:80']);
  assert.deepEqual(directive(appServer(configFor('static', 'container'), 'example.com'), 'listen'), ['8080']);
});

test('C5: HTTP/3 uses reuseport once per address and port, Alt-Svc once, and quic_retry', () => {
  for (const ipv6 of [true, false]) {
    const config = configFor('static', 'host', { ...MANUAL_TLS, http3: true, ipv6, wwwRedirect: 'to-apex', publicHttpsPort: 8443 });
    const listens = servers(config).flatMap((server) => directive(server, 'listen'));
    const reuse = listens.filter((value) => value.includes('reuseport'));
    assert.equal(reuse.length, ipv6 ? 2 : 1);
    assert.equal(new Set(reuse).size, reuse.length);
    const quicListens = listens.filter((value) => value.includes('quic'));
    assert.equal(quicListens.length, (ipv6 ? 2 : 1) * 3, 'reject, app, and alias servers');
    const app = appServer(config, 'example.com');
    assert.deepEqual(
      directive(app, 'add_header').filter((value) => value.startsWith('Alt-Svc')),
      [`Alt-Svc 'h3=":8443"; ma=86400' always`]
    );
    assert.deepEqual(directive(http(config), 'quic_retry'), ['on']);
  }

  assert.doesNotMatch(configFor('static', 'host', MANUAL_TLS), /quic|Alt-Svc/);
});

test('C6: HSTS values', () => {
  const value = (hsts: string) =>
    directive(appServer(configFor('static', 'host', { ...MANUAL_TLS, hsts }), 'example.com'), 'add_header').find((entry) => entry.startsWith('Strict-Transport-Security'));
  assert.equal(value('off'), undefined);
  assert.equal(value('host'), 'Strict-Transport-Security "max-age=63072000" always');
  assert.equal(value('subdomains'), 'Strict-Transport-Security "max-age=63072000; includeSubDomains" always');
  assert.equal(value('preload'), 'Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always');
  const redirect = servers(configFor('static', 'host', { ...MANUAL_TLS, hsts: 'host' })).find((server) => directive(server, 'listen')[0] === '80')!;
  assert.deepEqual(directive(redirect, 'add_header'), []);
});

test('B9/C3: client_max_body_size is always visible', () => {
  assert.deepEqual(directive(appServer(configFor('static', 'host'), 'example.com'), 'client_max_body_size'), ['1m']);
  assert.deepEqual(directive(appServer(configFor('php', 'host'), 'example.com'), 'client_max_body_size'), ['16m']);
  assert.deepEqual(directive(appServer(configFor('php', 'host', { clientMaxBodySize: '100m' }), 'example.com'), 'client_max_body_size'), ['100m']);
});

test('R4: rate limits cover every dynamic location and never static files', () => {
  const config = configFor('proxy', 'host', { rateLimit: 'on', websocketPath: '/ws/', streamingPath: '/events/' });
  const server = appServer(config, 'example.com');
  for (const path of ['/', '/ws/', '/events/']) {
    assert.deepEqual(directive(location(server, path), 'limit_req'), ['zone=per_ip burst=20 nodelay'], path);
  }

  assert.deepEqual(directive(server, 'limit_req'), []);
  assert.deepEqual(directive(server, 'limit_req_status'), ['429']);
  assert.deepEqual(directive(location(server, '= /healthz'), 'limit_req'), []);
  assert.deepEqual(directive(http(config), 'limit_req_zone'), ['$binary_remote_addr zone=per_ip:10m rate=10r/s']);

  const php = appServer(configFor('php', 'host', { rateLimit: 'on', rateLimitRate: 5, rateLimitBurst: 3 }), 'example.com');
  assert.deepEqual(directive(location(php, '~* \\.php$'), 'limit_req'), ['zone=per_ip burst=3 nodelay']);
  assert.deepEqual(directive(location(php, '/'), 'limit_req'), []);
  assert.deepEqual(directive(http(configFor('php', 'host', { rateLimit: 'on', rateLimitRate: 5 })), 'limit_req_zone'), ['$binary_remote_addr zone=per_ip:10m rate=5r/s']);

  const noBurst = appServer(configFor('proxy', 'host', { rateLimit: 'on', rateLimitBurst: 0 }), 'example.com');
  assert.deepEqual(directive(location(noBurst, '/'), 'limit_req'), ['zone=per_ip']);

  const single = appServer(configFor('proxy', 'host', { rateLimit: 'on' }), 'example.com');
  assert.equal(directive(location(single, '/'), 'limit_req').length, 1, 'one upstream still limits');

  const dryRun = appServer(configFor('proxy', 'host', { rateLimit: 'dry-run' }), 'example.com');
  assert.deepEqual(directive(dryRun, 'limit_req_dry_run'), ['on']);
  assert.deepEqual(directive(appServer(configFor('proxy', 'host', { rateLimit: 'on' }), 'example.com'), 'limit_req_dry_run'), []);
});

test('C14: connection limit', () => {
  const config = configFor('static', 'host', { connLimit: 20 });
  assert.deepEqual(directive(http(config), 'limit_conn_zone'), ['$binary_remote_addr zone=per_ip_conn:10m']);
  const server = appServer(config, 'example.com');
  assert.deepEqual(directive(server, 'limit_conn'), ['per_ip_conn 20']);
  assert.deepEqual(directive(server, 'limit_conn_status'), ['429']);
  assert.doesNotMatch(configFor('static', 'host'), /limit_conn/);
});

test('R6: wwwRedirect creates an alias server that redirects to the canonical name', () => {
  const toApex = configFor('static', 'host', { wwwRedirect: 'to-apex' });
  const alias = aliasServer(toApex, 'www.example.com', false);
  assert.deepEqual(directive(alias, 'server_name'), ['www.example.com']);
  assert.deepEqual(directive(location(alias, '/'), 'return'), ['301 $scheme://example.com$forwarded_port_suffix$request_uri']);
  assert.deepEqual(directive(appServer(toApex, 'example.com'), 'server_name'), ['example.com']);

  const toWww = configFor('static', 'host', { wwwRedirect: 'to-www' });
  assert.deepEqual(directive(appServer(toWww, 'www.example.com'), 'server_name'), ['www.example.com']);
  assert.deepEqual(directive(appServer(toWww, 'www.example.com'), 'root'), ['/var/www/example.com/public']);
  const apexAlias = aliasServer(toWww, 'example.com', false);
  assert.deepEqual(directive(location(apexAlias, '/'), 'return'), ['301 $scheme://www.example.com$forwarded_port_suffix$request_uri']);

  const manual = configFor('static', 'host', { ...MANUAL_TLS, wwwRedirect: 'to-apex', hsts: 'host' });
  const tlsAlias = aliasServer(manual, 'www.example.com', true);
  assert.deepEqual(directive(tlsAlias, 'ssl_certificate'), ['/etc/nginx/tls/fullchain.pem']);
  assert.deepEqual(directive(tlsAlias, 'return'), ['301 https://example.com$request_uri']);
  assert.deepEqual(directive(tlsAlias, 'http2'), ['on']);
  const redirect = redirectServer(manual);
  assert.deepEqual(directive(redirect, 'server_name'), ['example.com www.example.com']);
  assert.deepEqual(directive(location(redirect, '/'), 'return'), ['308 https://example.com$request_uri']);

  const acme = configFor('static', 'host', { ...ACME, wwwRedirect: 'to-apex' });
  const acmeServers = servers(acme).filter((server) => directive(server, 'acme_certificate').length > 0);
  assert.equal(acmeServers.length, 2, 'the alias gets its own certificate');
  assert.deepEqual(directive(acmeServers[1]!, 'ssl_certificate'), ['$acme_certificate']);
  assert.deepEqual(directive(appServer(configFor('static', 'host', { wwwRedirect: 'to-apex', serverName: 'www.example.com' }), 'example.com'), 'server_name'), ['example.com']);
});

test('R8: one scheme and port policy for forwarded headers, PHP variables, and cache keys', () => {
  const direct = configFor('proxy', 'container', { proxyCache: true });
  const directHttp = http(direct);
  assert.ok(find(directHttp, 'map').some((block) => block.args === '$scheme $forwarded_port'));
  assert.deepEqual(find(directHttp, 'geo'), []);
  assert.ok(directive(location(appServer(direct, 'example.com'), '/'), 'proxy_set_header').includes('X-Forwarded-Proto $scheme'));
  assert.ok(directive(location(appServer(direct, 'example.com'), '/'), 'proxy_set_header').includes('X-Forwarded-Port $forwarded_port'));
  assert.deepEqual(directive(location(appServer(direct, 'example.com'), '/'), 'proxy_cache_key'), ['"$scheme|$host|$request_uri"']);

  const behind = configFor('proxy', 'container', { realIp: 'custom', trustedProxies: ['10.0.0.0/8'], publicHttpPort: 8000, publicHttpsPort: 8001, proxyCache: true });
  const behindHttp = http(behind);
  const geo = find(behindHttp, 'geo')[0]!;
  assert.equal(geo.args, '$realip_remote_addr $from_trusted_proxy');
  assert.deepEqual(geo.directives, [
    { name: 'default', args: '0' },
    { name: '10.0.0.0/8', args: '1' }
  ]);
  const proto = find(behindHttp, 'map').find((block) => block.args === '"$from_trusted_proxy:$http_x_forwarded_proto" $forwarded_proto')!;
  assert.deepEqual(proto.directives, [
    { name: 'default', args: '$scheme' },
    { name: '"1:https"', args: 'https' },
    { name: '"1:http"', args: 'http' }
  ]);
  const port = find(behindHttp, 'map').find((block) => block.args === '$forwarded_proto $forwarded_port')!;
  assert.deepEqual(port.directives, [
    { name: 'default', args: '8000' },
    { name: 'https', args: '8001' }
  ]);
  const headers = directive(location(appServer(behind, 'example.com'), '/'), 'proxy_set_header');
  assert.ok(headers.includes('X-Forwarded-Proto $forwarded_proto'));
  assert.deepEqual(directive(location(appServer(behind, 'example.com'), '/'), 'proxy_cache_key'), ['"$forwarded_proto|$host|$request_uri"']);

  const php = location(appServer(configFor('php', 'host', { realIp: 'cloudflare' }), 'example.com'), '~* \\.php$');
  const params = directive(php, 'fastcgi_param');
  assert.ok(params.includes('REQUEST_SCHEME $forwarded_proto'));
  assert.ok(params.includes('HTTPS $forwarded_https if_not_empty'));
  assert.ok(params.includes('SERVER_PORT $forwarded_port'));
});

test('C1: real client IP from Cloudflare, a custom proxy, or the PROXY protocol', () => {
  const cloudflare = http(configFor('proxy', 'host', { realIp: 'cloudflare' }));
  assert.deepEqual(directive(cloudflare, 'set_real_ip_from'), CLOUDFLARE_RANGES);
  assert.deepEqual(directive(cloudflare, 'real_ip_header'), ['CF-Connecting-IP']);
  const custom = http(configFor('proxy', 'host', { realIp: 'custom', trustedProxies: ['203.0.113.0/24', '2001:db8::/32'], realIpHeader: 'X-Forwarded-For' }));
  assert.deepEqual(directive(custom, 'set_real_ip_from'), ['203.0.113.0/24', '2001:db8::/32']);
  assert.deepEqual(directive(custom, 'real_ip_header'), ['X-Forwarded-For']);
  assert.deepEqual(directive(custom, 'real_ip_recursive'), ['on']);
  assert.deepEqual(directive(http(configFor('proxy', 'host', { realIp: 'custom', trustedProxies: ['10.0.0.1'], realIpHeader: 'X-Real-IP' })), 'real_ip_recursive'), []);
  assert.deepEqual(directive(http(configFor('proxy', 'host')), 'set_real_ip_from'), []);

  const protocol = configFor('proxy', 'host', { ...MANUAL_TLS, realIp: 'custom', trustedProxies: ['10.0.0.0/8'], realIpHeader: 'proxy_protocol', wwwRedirect: 'to-apex' });
  assert.deepEqual(directive(http(protocol), 'real_ip_header'), ['proxy_protocol']);
  for (const server of servers(protocol)) {
    for (const listen of directive(server, 'listen').filter((value) => !value.startsWith('127.0.0.1'))) {
      assert.match(listen, /proxy_protocol/, listen);
    }
  }
});

test('C11/C13: upstream groups with failover, backups, balancing, and name resolution', () => {
  const multi = configFor('proxy', 'host', {
    upstreams: [{ address: '10.0.0.1:3000', backup: false }, { address: '10.0.0.2:3000', backup: false }, { address: '10.0.0.3:3000', backup: true }],
    loadBalancing: 'least-conn'
  });
  const upstream = find(http(multi), 'upstream')[0]!;
  assert.equal(upstream.args, 'backend');
  assert.deepEqual(upstream.directives, [
    { name: 'least_conn', args: '' },
    { name: 'server', args: '10.0.0.1:3000 max_fails=3 fail_timeout=10s' },
    { name: 'server', args: '10.0.0.2:3000 max_fails=3 fail_timeout=10s' },
    { name: 'server', args: '10.0.0.3:3000 max_fails=3 fail_timeout=10s backup' }
  ]);
  const root = location(appServer(multi, 'example.com'), '/');
  assert.deepEqual(directive(root, 'proxy_next_upstream'), ['error timeout http_502 http_503 http_504']);
  assert.deepEqual(directive(root, 'proxy_next_upstream_tries'), ['2']);
  assert.doesNotMatch(multi, /non_idempotent/);

  const hash = find(http(configFor('proxy', 'host', { upstreams: [{ address: '10.0.0.1:3000', backup: false }, { address: '10.0.0.2:3000', backup: false }], loadBalancing: 'hash-ip' })), 'upstream')[0]!;
  assert.ok(hash.directives.some((item) => item.name === 'hash' && item.args === '$binary_remote_addr consistent'));

  const single = configFor('proxy', 'host');
  assert.deepEqual(find(http(single), 'upstream')[0]!.directives, [{ name: 'server', args: '127.0.0.1:3000' }]);
  assert.deepEqual(directive(location(appServer(single, 'example.com'), '/'), 'proxy_next_upstream'), []);

  const named = configFor('proxy', 'container', { upstreams: [{ address: 'app:3000', backup: false }] });
  assert.deepEqual(find(http(named), 'upstream')[0]!.directives, [
    { name: 'zone', args: 'backend 64k' },
    { name: 'resolver', args: '127.0.0.11 valid=30s ipv6=off' },
    { name: 'resolver_timeout', args: '5s' },
    { name: 'server', args: 'app:3000 resolve' }
  ]);
  assert.deepEqual(directive(http(named), 'resolver'), [], 'the group has its own resolver');
  const hosted = find(http(configFor('proxy', 'host', { upstreams: [{ address: 'app:3000', backup: false }], resolver: '10.0.0.2 2001:db8::53' })), 'upstream')[0]!;
  assert.deepEqual(directive(hosted, 'resolver'), ['10.0.0.2 [2001:db8::53] valid=30s ipv6=on']);
  assert.deepEqual(directive(hosted, 'resolver_timeout'), ['5s']);
  assert.deepEqual(directive(http(single), 'resolver'), []);
});

test('R9: backend TLS verifies the certificate against an explicit name', () => {
  const config = configFor('proxy', 'host', { upstreamTls: true, upstreamTlsName: 'app.internal' });
  const root = location(appServer(config, 'example.com'), '/');
  assert.deepEqual(directive(root, 'proxy_pass'), ['https://backend']);
  assert.deepEqual(directive(root, 'proxy_ssl_name'), ['app.internal']);
  assert.deepEqual(directive(root, 'proxy_ssl_server_name'), ['on']);
  assert.deepEqual(directive(root, 'proxy_ssl_verify'), ['on']);
  assert.deepEqual(directive(root, 'proxy_ssl_verify_depth'), ['2']);
  assert.deepEqual(directive(root, 'proxy_ssl_trusted_certificate'), ['/etc/ssl/certs/ca-certificates.crt']);
  assert.deepEqual(directive(location(appServer(configFor('proxy', 'host'), 'example.com'), '/'), 'proxy_pass'), ['http://backend']);
});

test('A9: the proxy cache skips only private and cookie-varying responses', () => {
  const config = configFor('proxy', 'host', { proxyCache: true });
  const maps = find(http(config), 'map');
  const vary = maps.find((block) => block.args === '$upstream_http_vary $skip_cache_vary')!;
  assert.deepEqual(vary.directives, [
    { name: 'default', args: '0' },
    { name: '~*cookie', args: '1' },
    { name: '~*authorization', args: '1' }
  ]);
  assert.doesNotMatch(config, /~\*\.\+/);
  const root = location(appServer(config, 'example.com'), '/');
  assert.deepEqual(directive(root, 'proxy_cache'), ['edge_cache']);
  assert.deepEqual(directive(root, 'proxy_cache_background_update'), ['on']);
  assert.match(directive(root, 'proxy_no_cache')[0]!, /\$skip_cache_set_cookie \$skip_cache_control \$skip_cache_vary$/);
  assert.match(directive(root, 'proxy_cache_bypass')[0]!, /^\$skip_cache_method \$skip_cache_auth \$skip_cache_cookie/);
  assert.doesNotMatch(config, /X-Cache-Status/);
  assert.match(directive(http(config), 'proxy_cache_path')[0]!, /^\/var\/cache\/nginx\/proxy /);
  assert.match(directive(http(configFor('proxy', 'container', { proxyCache: true })), 'proxy_cache_path')[0]!, /^\/tmp\/nginx-cache /);
  assert.deepEqual(find(http(configFor('proxy', 'host')), 'map').filter((block) => block.args.includes('skip_cache')), []);
});

test('C13: PHP FastCGI cache mirrors the proxy cache guards', () => {
  const config = configFor('php', 'host', { fastcgiCache: true });
  const php = location(appServer(config, 'example.com'), '~* \\.php$');
  assert.deepEqual(directive(php, 'fastcgi_cache'), ['php_cache']);
  assert.match(directive(php, 'fastcgi_no_cache')[0]!, /\$skip_cache_set_cookie/);
  assert.match(directive(php, 'fastcgi_cache_bypass')[0]!, /\$skip_cache_cookie/);
  assert.deepEqual(directive(php, 'fastcgi_cache_key'), ['"$scheme|$host|$request_uri"']);
  assert.match(directive(http(config), 'fastcgi_cache_path')[0]!, /keys_zone=php_cache:10m/);
});

test('R2/R10: PHP location is case-insensitive and lists each FastCGI parameter once', () => {
  for (const target of targets) {
    const config = configFor('php', target);
    const server = appServer(config, 'example.com');
    const php = location(server, '~* \\.php$');
    assert.deepEqual(directive(php, 'try_files'), ['$uri =404']);
    const params = directive(php, 'fastcgi_param');
    const names = params.map((value) => value.split(' ')[0]!);
    assert.equal(new Set(names).size, names.length, 'no duplicate parameter');
    assert.ok(params.includes('SCRIPT_FILENAME $realpath_root$fastcgi_script_name'));
    assert.ok(params.includes('DOCUMENT_ROOT $realpath_root'));
    assert.ok(params.includes('HTTP_PROXY ""'));
    for (const required of ['QUERY_STRING', 'REQUEST_METHOD', 'CONTENT_TYPE', 'CONTENT_LENGTH', 'SCRIPT_NAME', 'REQUEST_URI', 'DOCUMENT_URI', 'SERVER_PROTOCOL', 'GATEWAY_INTERFACE', 'REMOTE_ADDR', 'REMOTE_PORT', 'SERVER_ADDR', 'SERVER_NAME', 'REDIRECT_STATUS']) {
      assert.ok(names.includes(required), required);
    }

    assert.deepEqual(directive(php, 'include'), []);
    assert.deepEqual(directive(server, 'index'), ['index.php index.html']);
    assert.deepEqual(directive(location(server, '/'), 'try_files'), ['$uri $uri/ /index.php$is_args$args']);
  }

  assert.deepEqual(directive(location(appServer(configFor('php', 'host'), 'example.com'), '~* \\.php$'), 'fastcgi_pass'), ['unix:/run/php/php-fpm.sock']);
  assert.deepEqual(directive(location(appServer(configFor('php', 'container'), 'example.com'), '~* \\.php$'), 'fastcgi_pass'), ['127.0.0.1:9000']);
});

test('PHP failover uses an upstream group', () => {
  const config = configFor('php', 'host', { upstreams: [{ address: '127.0.0.1:9000', backup: false }, { address: '127.0.0.1:9001', backup: true }] });
  assert.deepEqual(directive(location(appServer(config, 'example.com'), '~* \\.php$'), 'fastcgi_pass'), ['php_fpm']);
  assert.equal(find(http(config), 'upstream')[0]!.args, 'php_fpm');
});

test('static, SPA, and HTML cache behavior', () => {
  const staticServer = appServer(configFor('static', 'host'), 'example.com');
  assert.deepEqual(directive(location(staticServer, '/'), 'try_files'), ['$uri $uri/ =404']);
  assert.deepEqual(directive(location(staticServer, '~* \\.html$'), 'add_header'), ['Cache-Control "no-cache" always']);
  const spa = appServer(configFor('spa', 'host'), 'example.com');
  assert.deepEqual(directive(location(spa, '/'), 'try_files'), ['$uri $uri/ /index.html']);
  assert.deepEqual(directive(location(spa, '/assets/'), 'try_files'), ['$uri =404']);
  assert.deepEqual(directive(spa, 'root'), ['/var/www/example.com/public']);
  assert.deepEqual(directive(spa, 'charset'), ['utf-8']);
  assert.deepEqual(directive(appServer(configFor('static', 'container'), 'example.com'), 'root'), ['/usr/share/nginx/html']);
  assert.deepEqual(directive(appServer(configFor('proxy', 'host'), 'example.com'), 'root'), []);
});

test('C16/C17/C21: open file cache, buffered log, and status page', () => {
  assert.deepEqual(directive(http(configFor('static', 'host', { openFileCache: true })), 'open_file_cache'), ['max=1000 inactive=20s']);
  assert.deepEqual(directive(http(configFor('static', 'host', { openFileCache: true })), 'open_file_cache_valid'), ['30s']);
  assert.deepEqual(directive(http(configFor('static', 'host', { openFileCache: true })), 'open_file_cache_errors'), []);
  assert.deepEqual(directive(http(configFor('static', 'host')), 'open_file_cache'), []);
  assert.deepEqual(directive(http(configFor('static', 'host')), 'access_log'), ['/var/log/nginx/access.log main']);
  assert.deepEqual(directive(http(configFor('static', 'host', { accessLogBuffer: true })), 'access_log'), ['/var/log/nginx/access.log main buffer=32k flush=5s']);
  assert.deepEqual(directive(http(configFor('static', 'container', { accessLogBuffer: true })), 'access_log'), ['/dev/stdout main buffer=32k flush=5s']);

  const status = servers(configFor('proxy', 'host', { statusEndpoint: true })).find((server) => directive(server, 'listen')[0]!.startsWith('127.0.0.1'))!;
  assert.deepEqual(directive(status, 'listen'), ['127.0.0.1:8081']);
  assert.deepEqual(location(status, '= /nginx_status').directives.map((item) => item.name), ['stub_status', 'allow', 'deny', 'access_log']);
  const moved = servers(configFor('proxy', 'host', { statusEndpoint: true, upstreams: [{ address: '127.0.0.1:8081', backup: false }] })).find((server) => directive(server, 'listen')[0]!.startsWith('127.0.0.1:'))!;
  assert.deepEqual(directive(moved, 'listen'), ['127.0.0.1:8082']);
});

test('main context differs by target', () => {
  const host = parseConfig(configFor('static', 'host', { workerConnections: 2048, workerUser: 'www-data' }));
  assert.deepEqual(directive(host, 'user'), ['www-data']);
  assert.deepEqual(directive(host, 'pid'), ['/run/nginx.pid']);
  assert.deepEqual(directive(host, 'worker_rlimit_nofile'), ['4096']);
  assert.deepEqual(directive(host, 'error_log'), ['/var/log/nginx/error.log warn']);
  assert.deepEqual(directive(host, 'worker_processes'), ['auto']);
  assert.deepEqual(directive(find(host, 'events')[0]!, 'worker_connections'), ['2048']);
  const container = parseConfig(configFor('static', 'container'));
  assert.deepEqual(directive(container, 'user'), []);
  assert.deepEqual(directive(container, 'pid'), ['/tmp/nginx.pid']);
  assert.deepEqual(directive(container, 'worker_rlimit_nofile'), []);
  assert.deepEqual(directive(container, 'error_log'), ['/dev/stderr warn']);
  const containerHttp = find(container, 'http')[0]!;
  assert.deepEqual(directive(containerHttp, 'client_body_temp_path'), ['/tmp/nginx-client-body']);
  assert.deepEqual(directive(containerHttp, 'access_log'), ['/dev/stdout main']);
  assert.deepEqual(directive(http(configFor('static', 'host')), 'client_body_temp_path'), []);
});

test('timeouts keep only what differs from the NGINX defaults', () => {
  const globals = http(configFor('static', 'host'));
  assert.deepEqual(directive(globals, 'client_header_timeout'), ['15s']);
  assert.deepEqual(directive(globals, 'reset_timedout_connection'), ['on']);
  assert.deepEqual(directive(globals, 'client_body_timeout'), []);
  assert.deepEqual(directive(globals, 'send_timeout'), []);
  assert.deepEqual(directive(globals, 'sendfile'), ['on']);
  assert.deepEqual(directive(globals, 'tcp_nopush'), ['on']);
  assert.deepEqual(directive(globals, 'server_tokens'), ['off']);
  assert.deepEqual(directive(globals, 'default_type'), ['application/octet-stream']);
  assert.deepEqual(directive(globals, 'include'), ['/etc/nginx/mime.types']);
});

test('the catch-all servers close unknown hosts', () => {
  const config = configFor('static', 'host');
  const reject = servers(config)[0]!;
  assert.deepEqual(directive(reject, 'listen'), ['80 default_server', '[::]:80 default_server']);
  assert.deepEqual(directive(reject, 'return'), ['444']);
});

test('comments explain non-default settings and never call a default tuning', () => {
  for (const { name, config } of everyConfig()) {
    assert.doesNotMatch(config, /tuning|optimi[sz]/i, name);
  }
});

test('generateConfig and friends throw on invalid input', () => {
  assert.throws(() => generateConfig({ profile: 'static', target: 'host', serverName: 'a b' } as Options), ConfigValidationError);
  assert.throws(() => generateConfig({ profile: 'go' } as unknown as Options), /Invalid NGINX options/);
  assert.throws(() => deploySteps({ profile: 'static', target: 'host', httpPort: 0 } as Options), /Invalid/);
  assert.throws(() => warnings({ unknown: 1 } as unknown as Options), /Unknown option/);
  const error = (() => {
    try {
      generateConfig({ profile: 'static', target: 'host', documentRoot: 'relative' } as Options);
    } catch (caught) {
      return caught as ConfigValidationError;
    }

    return null;
  })();
  assert.ok(error?.errors.documentRoot);
});

test('partial input is completed from the defaults', () => {
  assert.equal(generateConfig({ profile: 'spa', target: 'container' } as Options), configFor('spa', 'container'));
  assert.equal(generateConfig({} as Options), configFor('static', 'host'));
});

test('the generated text is standalone and valid for every profile and target', () => {
  for (const { name, config } of everyConfig()) {
    assert.doesNotMatch(config, /include snippets\//, name);
    assert.match(config, /^# Generated for NGINX Open Source 1\.30\.5\. Profile: \w+\. Target: \w+\./, name);
    assert.ok(validateOptions({ ...defaultsFor('static', 'host') }).valid);
  }
});

test('generateDefaultServer', () => {
  const config = generateDefaultServer(80);
  assert.match(config, /listen 80 default_server;/);
  assert.match(config, /server_name _;/);
  assert.match(config, /return 444;/);
  assert.throws(() => generateDefaultServer(0), /Invalid default server port/);
});

test('R7/R20: deploy steps define the certificate bootstrap and the container volume', () => {
  const titles = (steps: { title: string }[]) => steps.map((step) => step.title);
  const manualHost = deploySteps({ ...defaultsFor('static', 'host'), ...MANUAL_TLS, wwwRedirect: 'to-apex' } as Options);
  const names = titles(manualHost);
  assert.match(manualHost[0]!.note!, /set HTTPS to Off/);
  assert.equal(manualHost.find((step) => step.title === 'Create the challenge folder')!.command, 'sudo mkdir -p /var/www/_letsencrypt');
  const first = manualHost.find((step) => step.title === 'Get the first certificate')!;
  assert.equal(first.command, 'sudo certbot certonly --webroot -w /var/www/_letsencrypt --cert-name example.com -d example.com -d www.example.com');
  assert.ok(names.indexOf('Reload NGINX') < names.indexOf('Get the first certificate'), 'certbot runs after the HTTPS-off config is live');
  assert.ok(names.indexOf('Get the first certificate') < names.findIndex((title) => title.startsWith('Switch HTTPS')));
  assert.ok(names.findIndex((title) => title.startsWith('Switch HTTPS')) < names.indexOf('Renew certificates and reload NGINX'));
  assert.ok(manualHost.some((step) => step.command === 'sudo nginx -t'));
  assert.match(manualHost.find((step) => step.title.startsWith('Switch HTTPS'))!.note!, /\/etc\/nginx\/tls\/fullchain\.pem/);

  const proxyHost = deploySteps({ ...defaultsFor('proxy', 'host'), ...MANUAL_TLS } as Options);
  assert.doesNotMatch(JSON.stringify(proxyHost), /--standalone/);
  assert.match(proxyHost.find((step) => step.title === 'Get the first certificate')!.command!, /--webroot -w \/var\/www\/_letsencrypt/);

  const manualContainer = deploySteps({ ...defaultsFor('spa', 'container'), ...MANUAL_TLS } as Options);
  const containerNames = titles(manualContainer);
  assert.match(manualContainer[0]!.note!, /set HTTPS to Off/);
  assert.ok(containerNames.indexOf('Start the container') < containerNames.indexOf('Get the first certificate'));
  const start = manualContainer.find((step) => step.title === 'Start the container')!.command!;
  assert.match(start, /-v "\$PWD\/tls:\/etc\/nginx\/tls:ro"/);
  assert.match(start, /-v "\$PWD\/acme-challenge:\/var\/cache\/nginx\/acme-challenge:ro"/);
  assert.match(manualContainer.find((step) => step.title === 'Get the first certificate')!.command!, /certbot\/certbot certonly --webroot -w \/acme --cert-name example\.com -d example\.com/);

  const acmeContainer = deploySteps({ ...defaultsFor('proxy', 'container'), ...ACME, http3: true } as Options);
  const volume = acmeContainer.find((step) => step.title.startsWith('Create a volume'))!;
  assert.match(volume.command!, /docker volume create nginx-acme/);
  assert.match(volume.command!, /chown -R 101:101 \/var\/cache\/nginx/);
  assert.ok(acmeContainer.some((step) => step.title.includes('port 80')));
  const run = acmeContainer.find((step) => step.title === 'Start the container')!;
  assert.match(run.command!, /-p 80:8080 -p 443:8443 -p 443:8443\/udp/);
  assert.match(run.command!, /-v nginx-acme:\/var\/cache\/nginx/);
  assert.ok(run.command!.includes(NGINX_IMAGE));
  assert.match(run.note!, /UDP/);

  const acmeHost = deploySteps({ ...defaultsFor('static', 'host'), ...ACME } as Options);
  assert.ok(acmeHost.some((step) => /nginx-module-acme/.test(step.command ?? '')));
  assert.ok(acmeHost.some((step) => /acme-letsencrypt/.test(step.command ?? '')));

  const cloudflare = deploySteps({ ...defaultsFor('proxy', 'host'), ...MANUAL_TLS, realIp: 'cloudflare' } as Options);
  assert.match(cloudflare.find((step) => step.title.includes('Cloudflare'))!.note!, /Full \(strict\)/);
  for (const step of [...manualHost, ...acmeContainer, ...manualContainer]) {
    assert.ok(step.title.length > 0);
    assert.ok(step.command || step.note, step.title);
  }
});

test('review 3: the certbot lineage name matches the default certificate paths in both www directions', () => {
  for (const [wwwRedirect, name, names] of [
    ['off', 'example.com', '-d example.com'],
    ['to-apex', 'example.com', '-d example.com -d www.example.com'],
    ['to-www', 'www.example.com', '-d www.example.com -d example.com']
  ] as const) {
    for (const target of targets) {
      const options = validateOptions({ profile: 'static', target, serverName: 'example.com', wwwRedirect, https: 'manual' }).options!;
      const steps = deploySteps(options);
      const first = steps.find((step) => step.title === 'Get the first certificate')!;
      assert.match(first.command!, new RegExp(`--cert-name ${name.replaceAll('.', '\\.')} ${names.replaceAll('.', '\\.')}`));
      const directory = target === 'host' ? `/etc/letsencrypt/live/${name}` : `/etc/nginx/tls/${name}`;
      assert.equal(options.certificatePath, `${directory}/fullchain.pem`);
      if (target === 'host') {
        assert.ok(!steps.some((step) => step.title.startsWith('Install the certificate')), 'default certbot paths need no copy');
        assert.equal(steps.find((step) => step.title.startsWith('Renew'))!.command, 'sudo certbot renew --deploy-hook "systemctl reload nginx"');
      } else {
        assert.match(steps.find((step) => step.title.startsWith('Install the certificate'))!.command!, new RegExp(`/le/live/${name.replaceAll('.', '\\.')}/fullchain\\.pem /tls/${name.replaceAll('.', '\\.')}/fullchain\\.pem`));
      }
    }
  }
});

test('review 4: host and container deploy steps follow the configured certificate paths', () => {
  const custom = { https: 'manual', certificatePath: '/srv/tls/site.crt', certificateKeyPath: '/srv/tls/site.key' };
  const host = deploySteps({ ...defaultsFor('static', 'host'), ...custom } as Options);
  const install = host.find((step) => step.title.startsWith('Install the certificate'))!;
  assert.equal(install.command, 'sudo install -D -m 644 /etc/letsencrypt/live/example.com/fullchain.pem /srv/tls/site.crt && sudo install -D -m 600 /etc/letsencrypt/live/example.com/privkey.pem /srv/tls/site.key');
  assert.equal(
    host.find((step) => step.title.startsWith('Renew'))!.command,
    'sudo certbot renew --deploy-hook "install -D -m 644 /etc/letsencrypt/live/example.com/fullchain.pem /srv/tls/site.crt && install -D -m 600 /etc/letsencrypt/live/example.com/privkey.pem /srv/tls/site.key && systemctl reload nginx"'
  );
  const order = host.map((step) => step.title);
  assert.ok(order.findIndex((title) => title.startsWith('Get the first')) < order.findIndex((title) => title.startsWith('Install the certificate')));
  assert.ok(order.findIndex((title) => title.startsWith('Install the certificate')) < order.findIndex((title) => title.startsWith('Switch HTTPS')));

  const container = deploySteps({ ...defaultsFor('static', 'container'), https: 'manual', certificatePath: '/etc/nginx/tls/a/site.crt', certificateKeyPath: '/etc/nginx/tls/b/site.key' } as Options);
  const containerInstall = container.find((step) => step.title.startsWith('Install the certificate'))!.command!;
  assert.match(containerInstall, /mkdir -p \/tls\/a \/tls\/b/);
  assert.match(containerInstall, /cp -L \/le\/live\/example\.com\/fullchain\.pem \/tls\/a\/site\.crt/);
  assert.match(containerInstall, /cp -L \/le\/live\/example\.com\/privkey\.pem \/tls\/b\/site\.key/);
  assert.match(containerInstall, /chown 0:101 \/tls\/b\/site\.key; chmod 640 \/tls\/b\/site\.key/);
  assert.doesNotMatch(containerInstall, /chmod 64[4-7] \/tls\/b\/site\.key|chmod 666/);
  assert.match(container.find((step) => step.title.startsWith('Renew'))!.command!, /renew && docker run .* -c 'set -e; mkdir -p \/tls\/a \/tls\/b/);
});

test('review round 2: the host installs each certificate file on its own and never onto its own source', () => {
  const live = '/etc/letsencrypt/live/example.com';
  const steps = (overrides: Record<string, unknown>) => deploySteps({ ...defaultsFor('static', 'host'), https: 'manual', ...overrides } as Options);
  const installOf = (list: ReturnType<typeof steps>) => list.find((step) => step.title.startsWith('Install the certificate'))?.command;
  const hookOf = (list: ReturnType<typeof steps>) => list.find((step) => step.title.startsWith('Renew'))!.command!;

  const certificateOnly = steps({ certificatePath: '/srv/site.crt' });
  assert.equal(installOf(certificateOnly), `sudo install -D -m 644 ${live}/fullchain.pem /srv/site.crt`);
  assert.equal(hookOf(certificateOnly), `sudo certbot renew --deploy-hook "install -D -m 644 ${live}/fullchain.pem /srv/site.crt && systemctl reload nginx"`);

  const keyOnly = steps({ certificateKeyPath: '/srv/site.key' });
  assert.equal(installOf(keyOnly), `sudo install -D -m 600 ${live}/privkey.pem /srv/site.key`);
  assert.equal(hookOf(keyOnly), `sudo certbot renew --deploy-hook "install -D -m 600 ${live}/privkey.pem /srv/site.key && systemctl reload nginx"`);

  assert.equal(installOf(steps({})), undefined);
  assert.equal(hookOf(steps({})), 'sudo certbot renew --deploy-hook "systemctl reload nginx"');

  for (const overrides of [{}, { certificatePath: '/srv/site.crt' }, { certificateKeyPath: '/srv/site.key' }, { certificatePath: '/srv/a.crt', certificateKeyPath: '/srv/a.key' }]) {
    for (const step of steps(overrides)) {
      for (const match of (step.command ?? '').matchAll(/install -D -m \d+ (\S+) ([^\s"&]+)/g)) {
        assert.notEqual(match[1], match[2], `${step.title}: ${match[0]} installs a file onto itself`);
      }
    }
  }
});

test('review 5: the container bootstrap is interactive and installs the key for group 101 only', () => {
  const steps = deploySteps({ ...defaultsFor('static', 'container'), https: 'manual' } as Options);
  const first = steps.find((step) => step.title === 'Get the first certificate')!;
  assert.match(first.command!, /^docker run --rm -it /);
  assert.match(first.note!, /--non-interactive --agree-tos -m you@example\.com --no-eff-email/);
  const install = steps.find((step) => step.title.startsWith('Install the certificate'))!.command!;
  assert.match(install, /--user 0 /);
  assert.match(install, /chown 0:101 \/tls\/example\.com\/privkey\.pem; chmod 640 \/tls\/example\.com\/privkey\.pem/);
  assert.doesNotMatch(install, /chmod 644 \/tls\/example\.com\/privkey/);
});

test('review 6: the container test uses the run command settings and runs before the container is replaced', () => {
  const runtimeArguments = (command: string) => /(--user 101:101 .*?) (?:--entrypoint nginx )?nginx:/.exec(command)?.[1] ?? '';
  for (const https of ['off', 'manual', 'acme'] as const) {
    const options = { ...defaultsFor('spa', 'container'), ...(https === 'manual' ? { https } : https === 'acme' ? ACME : {}) } as Options;
    const steps = deploySteps(options);
    const testCommand = steps.find((step) => step.title === 'Test the config')!.command!;
    const run = steps.find((step) => step.title === 'Start the container')!.command!;
    assert.ok(runtimeArguments(testCommand).length > 40, testCommand);
    assert.equal(runtimeArguments(testCommand), runtimeArguments(run), `${https}: same user, mounts, and writable paths`);
    assert.ok(steps.findIndex((step) => step.title === 'Test the config') < steps.findIndex((step) => step.title === 'Start the container'));
  }

  const manual = deploySteps({ ...defaultsFor('static', 'container'), https: 'manual' } as Options);
  const switchStep = manual.find((step) => step.title.startsWith('Switch HTTPS'))!.command!;
  assert.ok(switchStep.indexOf('--entrypoint nginx') >= 0 && switchStep.indexOf('--entrypoint nginx') < switchStep.indexOf('docker rm -f nginx'), 'test before removal');
  assert.match(switchStep, / -t && docker rm -f nginx && docker run -d --name nginx /);
  assert.match(manual.find((step) => step.title === 'Test the config')!.command!, /-v "\$PWD\/tls:\/etc\/nginx\/tls:ro"/);
});

test('warnings explain the risky choices and carry the option key', () => {
  const warningFor = (list: ReturnType<typeof warnings>, key: string) => list.find((warning) => warning.key === key);
  const risky = warnings({
    ...defaultsFor('proxy', 'host'),
    ...MANUAL_TLS,
    http3: true,
    hsts: 'preload',
    contentSecurityPolicy: "default-src 'self'",
    gzip: true,
    rateLimit: 'on',
    wwwRedirect: 'to-apex'
  } as Options);
  assert.equal(warningFor(risky, 'http3')?.level, 'warn');
  assert.match(warningFor(risky, 'http3')!.message, /experimental/i);
  assert.match(warningFor(risky, 'hsts')!.message, /hard to undo/);
  assert.match(warningFor(risky, 'contentSecurityPolicy')!.message, /break/);
  assert.match(warningFor(risky, 'gzip')!.message, /BREACH/);
  assert.match(warningFor(risky, 'rateLimit')!.message, /real client IP/);
  assert.match(warningFor(risky, 'wwwRedirect')!.message, /both/);
  const behindProtocol = warnings({ ...defaultsFor('proxy', 'host'), realIp: 'custom', trustedProxies: ['10.0.0.1'], realIpHeader: 'proxy_protocol' } as Options);
  assert.match(warningFor(behindProtocol, 'realIpHeader')!.message, /127\.0\.0\.1:80/);
  assert.equal(warningFor(risky, 'ipv6')?.level, 'info');
  assert.equal(warningFor(warnings({ ...defaultsFor('static', 'host'), ...ACME } as Options), 'https')?.level, 'warn');
  assert.deepEqual(warnings(defaultsFor('static', 'container') as Options).filter((warning) => warning.level === 'warn'), []);
  assert.match(warnings(defaultsFor('static', 'container') as Options)[0]!.message, /8080/);
  assert.equal(warningFor(warnings({ ...defaultsFor('proxy', 'host'), rateLimit: 'on', realIp: 'cloudflare' } as Options), 'rateLimit'), undefined);
});
