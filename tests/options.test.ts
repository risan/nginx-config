import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GROUPS,
  OPTIONS,
  PROFILES,
  SCHEMA_VERSION,
  TARGETS,
  defaultsFor,
  validateOptions,
  type Options,
  type Profile,
  type Target
} from '../lib/options.ts';
import { generateConfig } from '../lib/render.ts';
import { NGINX_IMAGE, NGINX_VERSION } from '../lib/version.ts';

const profiles = PROFILES.map((profile) => profile.id);
const targets = TARGETS.map((target) => target.id);
const combinations = profiles.flatMap((profile) => targets.map((target) => [profile, target] as [Profile, Target]));

function check(profile: Profile, target: Target, overrides: Record<string, unknown>) {
  return validateOptions({ ...defaultsFor(profile, target), ...overrides });
}

const proxy = (overrides: Record<string, unknown>) => check('proxy', 'host', overrides);

test('exports the version, schema version, and image reference', () => {
  assert.equal(SCHEMA_VERSION, 2);
  assert.equal(NGINX_VERSION, '1.30.5');
  assert.equal(NGINX_IMAGE, 'nginx:1.30.5-alpine@sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94');
  assert.deepEqual(profiles, ['static', 'spa', 'php', 'proxy']);
  assert.deepEqual(targets, ['host', 'container']);
  assert.deepEqual(
    GROUPS.map((group) => group.id),
    ['site', 'https', 'performance', 'security', 'backend', 'advanced']
  );
});

test('every option has plain, short text and a documentation link from the evidence', () => {
  const keys = new Set<string>();
  const allowedHosts = ['nginx.org', 'developer.mozilla.org', 'docs.tlsref.org', 'letsencrypt.org'];
  const groups = new Set<string>(GROUPS.map((group) => group.id));
  for (const option of OPTIONS) {
    assert.ok(!keys.has(option.key), `duplicate key ${option.key}`);
    keys.add(option.key);
    assert.ok(groups.has(option.group), `${option.key} group`);
    assert.ok(option.label.length > 0 && option.label.length <= 48, `${option.key} label`);
    assert.ok(option.help.length > 0 && option.help.length <= 100 && !option.help.includes('\n'), `${option.key} help is one short line`);
    const sentences = option.why.split(/(?<=[.!?])\s+/).filter(Boolean);
    assert.ok(sentences.length >= 1 && sentences.length <= 3, `${option.key} why has ${sentences.length} sentences`);
    if (option.docs) {
      assert.ok(allowedHosts.includes(new URL(option.docs).hostname), `${option.key} docs host`);
    }

    if (option.kind === 'select') {
      assert.ok(option.choices && option.choices.length >= 2, `${option.key} choices`);
      assert.ok(option.choices.every((choice) => choice.value && choice.label), `${option.key} choice labels`);
    }

    if (option.kind === 'number') {
      assert.ok(typeof option.min === 'number' && typeof option.max === 'number', `${option.key} range`);
    }
  }
});

test('every option appears in the defaults, and every default key is an option', () => {
  const defaults = defaultsFor('static', 'host');
  const optionKeys = OPTIONS.map((option) => option.key);
  assert.deepEqual(
    Object.keys(defaults).filter((key) => key !== 'profile' && key !== 'target').sort(),
    [...optionKeys].sort()
  );
});

test('every default validates and renders for every profile and target', () => {
  for (const [profile, target] of combinations) {
    const defaults = defaultsFor(profile, target);
    const result = validateOptions(defaults);
    assert.equal(result.valid, true, `${profile}/${target}: ${JSON.stringify(result.errors)}`);
    assert.doesNotThrow(() => generateConfig(defaults), `${profile}/${target}`);
  }
});

test('defaults follow the plan for each target and profile', () => {
  const host = defaultsFor('static', 'host');
  const container = defaultsFor('static', 'container');
  assert.equal(host.httpPort, 80);
  assert.equal(host.httpsPort, 443);
  assert.equal(host.ipv6, true);
  assert.equal(host.workerConnections, 4096);
  assert.equal(host.documentRoot, '/var/www/example.com/public');
  assert.equal(host.resolver, '127.0.0.53');
  assert.equal(container.httpPort, 8080);
  assert.equal(container.httpsPort, 8443);
  assert.equal(container.ipv6, false);
  assert.equal(container.workerConnections, 1024);
  assert.equal(container.documentRoot, '/usr/share/nginx/html');
  assert.equal(container.resolver, '127.0.0.11');

  assert.equal(defaultsFor('static', 'host').gzip, true);
  assert.equal(defaultsFor('spa', 'host').gzip, true);
  assert.equal(defaultsFor('php', 'host').gzip, false);
  assert.equal(defaultsFor('proxy', 'host').gzip, false);
  assert.deepEqual(defaultsFor('spa', 'host').immutablePaths, ['/assets/']);
  assert.deepEqual(defaultsFor('php', 'host').immutablePaths, ['/build/']);
  assert.deepEqual(defaultsFor('static', 'host').immutablePaths, []);
  assert.equal(defaultsFor('php', 'host').clientMaxBodySize, '16m');
  assert.equal(defaultsFor('proxy', 'host').clientMaxBodySize, '1m');
  assert.deepEqual(defaultsFor('proxy', 'host').upstreams, [{ address: '127.0.0.1:3000', backup: false }]);
  assert.deepEqual(defaultsFor('php', 'host').upstreams, [{ address: 'unix:/run/php/php-fpm.sock', backup: false }]);
  assert.deepEqual(defaultsFor('php', 'container').upstreams, [{ address: '127.0.0.1:9000', backup: false }]);
});

test('normalizes valid input without changing the caller object', () => {
  const input = { profile: 'static', target: 'host', documentRoot: '/srv/site/', serverName: 'Example.COM' };
  const result = validateOptions(input);
  assert.equal(result.valid, true);
  assert.equal(result.options?.documentRoot, '/srv/site');
  assert.equal(result.options?.serverName, 'example.com');
  assert.deepEqual(input, { profile: 'static', target: 'host', documentRoot: '/srv/site/', serverName: 'Example.COM' });
});

test('derives paths from the server name when they are not given', () => {
  const host = validateOptions({ profile: 'static', target: 'host', serverName: 'shop.example.org', https: 'manual' });
  assert.equal(host.options?.documentRoot, '/var/www/shop.example.org/public');
  assert.equal(host.options?.certificatePath, '/etc/letsencrypt/live/shop.example.org/fullchain.pem');
  const container = validateOptions({ profile: 'static', target: 'container', serverName: 'shop.example.org', https: 'manual' });
  assert.equal(container.options?.certificatePath, '/etc/nginx/tls/shop.example.org/fullchain.pem');
});

test('rejects unknown keys and directive injection in every text field', () => {
  const cases: [string, unknown][] = [
    ['serverName', 'example.com; return 444'],
    ['documentRoot', '/srv/site; deny all'],
    ['certificatePath', '/etc/nginx/cert.pem; include /tmp/x'],
    ['certificateKeyPath', '/etc/nginx/key.pem\nssl_protocols TLSv1'],
    ['acmeEmail', 'a@example.com; include /tmp/x'],
    ['clientMaxBodySize', '1m; deny all'],
    ['contentSecurityPolicy', 'default-src "self"'],
    ['contentSecurityPolicy', 'default-src $host'],
    ['contentSecurityPolicy', "default-src 'self'\nadd_header X 1"],
    ['contentSecurityPolicy', "default-src 'self'; }"],
    ['contentSecurityPolicy', 'a\\b'],
    ['websocketPath', '/ws/; deny all'],
    ['streamingPath', '/events/ {'],
    ['upstreamTlsName', 'app; x'],
    ['workerUser', 'nginx; daemon off'],
    ['resolver', '127.0.0.1; return 200'],
    ['resolver', 'ns.example.com'],
    ['immutablePaths', ['/assets/; deny all']],
    ['trustedProxies', ['203.0.113.0/24; x']],
    ['unknown', true]
  ];
  for (const [key, value] of cases) {
    const result = validateOptions({ ...defaultsFor('proxy', 'host'), https: 'manual', [key]: value });
    assert.equal(result.valid, false, `${key}=${JSON.stringify(value)}`);
    assert.ok(Object.keys(result.errors).some((errorKey) => errorKey === key || errorKey.startsWith(`${key}.`)), key);
    assert.equal(result.options, null);
  }
});

test('rejects hostile input shapes without throwing', () => {
  for (const input of [null, undefined, 'text', 5, [], [1], () => 1]) {
    const result = validateOptions(input);
    assert.equal(result.valid, false);
    assert.equal(result.options, null);
  }

  const hostile = JSON.parse('{"__proto__": {"polluted": true}, "constructor": 1}');
  const result = validateOptions(hostile);
  assert.equal(result.valid, false);
  assert.ok('__proto__' in result.errors || Object.prototype.hasOwnProperty.call(result.errors, '__proto__'));
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(validateOptions({ profile: 'go' }).valid, false);
  assert.equal(validateOptions({ target: 'vm' }).valid, false);
});

test('requires strict JSON types', () => {
  assert.equal(check('static', 'host', { httpPort: '8080' }).valid, false);
  assert.equal(check('static', 'host', { gzip: 'true' }).valid, false);
  assert.equal(check('static', 'host', { httpPort: 0 }).valid, false);
  assert.equal(check('static', 'host', { httpPort: 65536 }).valid, false);
  assert.equal(check('static', 'host', { httpPort: 80.5 }).valid, false);
  assert.equal(check('static', 'host', { serverName: '-bad.example' }).valid, false);
  assert.equal(check('static', 'host', { documentRoot: null }).valid, false);
  assert.equal(check('static', 'host', { certificatePath: { length: 2 } }).valid, false);
  assert.equal(check('static', 'host', { immutablePaths: 'not-a-list' }).valid, false);
  assert.equal(check('static', 'host', { gzipLevel: 10 }).valid, false);
  assert.equal(check('static', 'host', { workerConnections: 100 }).valid, false);
  assert.equal(check('static', 'host', { hsts: true }).valid, false);
  assert.equal(check('static', 'host', { frameOptions: 'allow-from' }).valid, false);
});

test('validates backend addresses, including IPv6, unix sockets, and hostile forms', () => {
  const ok = (address: string) => proxy({ upstreams: [{ address, backup: false }] }).valid;
  assert.equal(ok('127.0.0.1:3000'), true);
  assert.equal(ok('app.internal:3000'), true);
  assert.equal(ok('[::1]:3000'), true);
  assert.equal(ok('[::ffff:192.0.2.1]:3000'), true);
  assert.equal(ok('[2001:db8::1]:3000'), true);
  assert.equal(ok('unix:/run/app/app.sock'), true);
  assert.equal(ok('http://backend:8080'), false);
  assert.equal(ok('backend:8080/path'), false);
  assert.equal(ok('backend'), false);
  assert.equal(ok('[::::]:3000'), false);
  assert.equal(ok('[1:2:3:4:5:6:7:8:9]:3000'), false);
  assert.equal(ok('unix:relative.sock'), false);
  assert.equal(ok('unix:/run/a b.sock'), false);
  assert.equal(ok('backend:70000'), false);
  assert.equal(ok('a;b:3000'), false);
});

test('reports list item errors under indexed keys and rejects unknown item keys', () => {
  const result = proxy({
    upstreams: [{ address: '127.0.0.1:3000', backup: false }, { address: 'bad address', backup: false }, { address: '10.0.0.1:3000', backup: 'yes', extra: 1 }]
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors['upstreams.1.address']);
  assert.ok(result.errors['upstreams.2.extra']);
  assert.ok(!('upstreams.0.address' in result.errors));

  const proxies = proxy({ realIp: 'custom', trustedProxies: ['203.0.113.0/24', 'nope', '0.0.0.0/0'] });
  assert.ok(proxies.errors['trustedProxies.1']);
  assert.ok(proxies.errors['trustedProxies.2']);

  const paths = check('spa', 'host', { immutablePaths: ['/assets/', 'assets/', '/x'] });
  assert.ok(paths.errors['immutablePaths.1']);
  assert.ok(paths.errors['immutablePaths.2']);
});

test('rejects loopback backends on the NGINX listen ports, including numeric aliases', () => {
  for (const profile of ['php', 'proxy'] as const) {
    for (const host of ['127.0.0.1', '127.0.0.9', '127.1', '2130706433', '0x7f000001', '017700000001', 'localhost', '[::1]', '[0:0:0:0:0:0:0:1]', '[::ffff:127.0.0.1]']) {
      const result = check(profile, 'host', { httpPort: 8080, upstreams: [{ address: `${host}:8080`, backup: false }] });
      assert.equal(result.valid, false, `${profile} ${host}`);
      assert.match(result.errors['upstreams.0.address'] ?? '', /loopback/);
    }

    const tls = check(profile, 'host', { httpPort: 8080, httpsPort: 8443, ...{ https: 'manual' }, upstreams: [{ address: 'localhost:8443', backup: false }] });
    assert.equal(tls.valid, false, `${profile} HTTPS listener`);
  }

  assert.equal(check('proxy', 'host', { httpPort: 8080, upstreams: [{ address: 'backend:8080', backup: false }] }).valid, true);
  assert.equal(check('proxy', 'host', { httpPort: 8080, upstreams: [{ address: '10.0.0.10:8080', backup: false }] }).valid, true);
  assert.equal(check('proxy', 'host', { httpPort: 8080, upstreams: [{ address: '[2001:db8::1]:8080', backup: false }] }).valid, true);
  assert.equal(check('proxy', 'host', { httpPort: 8080, https: 'off', upstreams: [{ address: 'localhost:8443', backup: false }] }).valid, true);
});

test('rejects unspecified backend addresses and their numeric or mapped aliases', () => {
  for (const host of ['0.0.0.0', '0', '0.0', '0.0.0', '0x0', '00', '[::]', '[0:0:0:0:0:0:0:0]', '[::0.0.0.0]', '[::ffff:0.0.0.0]', '[::ffff:0:0]']) {
    const result = proxy({ upstreams: [{ address: `${host}:8081`, backup: false }] });
    assert.equal(result.valid, false, host);
    assert.match(result.errors['upstreams.0.address'] ?? '', /unspecified/);
  }
});

test('R5: load balancing and backup rules', () => {
  const two = [{ address: '10.0.0.1:3000', backup: false }, { address: '10.0.0.2:3000', backup: false }];
  assert.equal(proxy({ upstreams: two, loadBalancing: 'least-conn' }).valid, true);
  assert.equal(proxy({ upstreams: two, loadBalancing: 'hash-ip' }).valid, true);
  assert.equal(proxy({ upstreams: [two[0], { address: '10.0.0.2:3000', backup: true }], loadBalancing: 'hash-ip' }).valid, false);
  assert.equal(proxy({ upstreams: [two[0]], loadBalancing: 'least-conn' }).valid, false);
  assert.equal(proxy({ upstreams: [{ address: '10.0.0.1:3000', backup: true }] }).valid, false);
  assert.equal(proxy({ upstreams: [] }).valid, false);
  assert.equal(proxy({ upstreams: [two[0], two[0]] }).valid, false);
  assert.equal(check('php', 'host', { upstreams: [{ address: '127.0.0.1:9000', backup: true }] }).valid, false);
});

test('R5: immutable, websocket, and streaming paths', () => {
  const spa = (immutablePaths: string[]) => check('spa', 'host', { immutablePaths }).valid;
  assert.equal(spa(['/assets/']), true);
  assert.equal(spa(['/build/assets/', '/_next/static/']), true);
  assert.equal(spa(['/']), false);
  assert.equal(spa(['/assets']), false);
  assert.equal(spa(['assets/']), false);
  assert.equal(spa(['/a/../b/']), false);
  assert.equal(spa(['/a/./b/']), false);
  assert.equal(spa(['/assets/', '/assets/']), false);

  assert.equal(proxy({ websocketPath: '/ws/' }).valid, true);
  assert.equal(proxy({ websocketPath: '/socket.io' }).valid, true);
  assert.equal(proxy({ websocketPath: '/' }).valid, false);
  assert.equal(proxy({ websocketPath: 'ws' }).valid, false);
  assert.equal(proxy({ websocketPath: '/a/../b/' }).valid, false);
  assert.equal(proxy({ websocketPath: '/healthz' }).valid, false);
  assert.equal(proxy({ streamingPath: '/healthz' }).valid, false);
  assert.equal(proxy({ websocketPath: '/ws/', streamingPath: '/ws/' }).valid, false);
  assert.equal(proxy({ websocketPath: '/ws/', streamingPath: '/events/' }).valid, true);
});

test('R3: HTTP/3 cannot be combined with the PROXY protocol', () => {
  const base = { ...{ https: 'manual' }, http3: true, realIp: 'custom', trustedProxies: ['10.0.0.0/8'] };
  assert.equal(check('static', 'host', { ...base, realIpHeader: 'X-Forwarded-For' }).valid, true);
  const result = check('static', 'host', { ...base, realIpHeader: 'proxy_protocol' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.http3);
});

test('enforces relationships between options', () => {
  assert.equal(check('static', 'host', { https: 'manual', httpsPort: 80 }).valid, false);
  assert.equal(check('static', 'host', { https: 'acme', acmeEmail: '' }).valid, false);
  assert.equal(check('static', 'host', { https: 'acme', acmeEmail: 'admin@example.com', serverName: 'localhost' }).valid, false);
  assert.equal(check('static', 'host', { https: 'acme', acmeEmail: 'admin@example.com', serverName: '192.0.2.1' }).valid, false);
  assert.equal(check('static', 'host', { wwwRedirect: 'to-www', serverName: 'localhost' }).valid, false);
  assert.equal(check('static', 'host', { wwwRedirect: 'to-www' }).valid, true);
  assert.equal(proxy({ upstreamTls: true }).valid, false);
  assert.equal(proxy({ upstreamTls: true, upstreamTlsName: 'app.internal' }).valid, true);
  assert.equal(proxy({ realIp: 'custom', trustedProxies: [] }).valid, false);
  assert.equal(proxy({ realIp: 'cloudflare' }).valid, true);
  assert.equal(check('static', 'host', { contentSecurityPolicy: '', cspReportOnly: true }).valid, true);
  assert.equal(check('static', 'host', { contentSecurityPolicy: "default-src 'self'", cspReportOnly: true }).valid, true);
});

test('ignores options that do not apply, but still checks their syntax', () => {
  const ignored = check('static', 'host', { websocketPath: '/ws/', proxyCache: true, rateLimit: 'on', hsts: 'preload', http3: true });
  assert.equal(ignored.valid, true);
  assert.equal(ignored.options?.websocketPath, '');
  assert.equal(ignored.options?.proxyCache, false);
  assert.equal(ignored.options?.rateLimit, 'off');
  assert.equal(ignored.options?.hsts, 'off');
  assert.equal(ignored.options?.http3, false);
  assert.equal(check('static', 'host', { websocketPath: '/ws/; deny all' }).valid, false);
});

test('appliesTo follows profile, target, and dependent options', () => {
  const byKey = new Map(OPTIONS.map((option) => [option.key, option]));
  const applies = (key: string, options: Record<string, unknown>) => byKey.get(key)!.appliesTo(options as Options);
  const proxyOptions = defaultsFor('proxy', 'host') as Options;
  const staticOptions = defaultsFor('static', 'host') as Options;
  const containerOptions = defaultsFor('static', 'container') as Options;

  assert.equal(applies('upstreams', proxyOptions), true);
  assert.equal(applies('upstreams', staticOptions), false);
  assert.equal(applies('documentRoot', proxyOptions), false);
  assert.equal(applies('documentRoot', staticOptions), true);
  assert.equal(applies('workerUser', staticOptions), true);
  assert.equal(applies('workerUser', containerOptions), false);
  assert.equal(applies('certificatePath', staticOptions), false);
  assert.equal(applies('certificatePath', { ...staticOptions, https: 'manual' }), true);
  assert.equal(applies('acmeEmail', { ...staticOptions, https: 'acme' }), true);
  assert.equal(applies('hsts', staticOptions), false);
  assert.equal(applies('hsts', { ...staticOptions, https: 'acme' }), true);
  assert.equal(applies('rateLimit', staticOptions), false);
  assert.equal(applies('rateLimitRate', proxyOptions), false);
  assert.equal(applies('rateLimitRate', { ...proxyOptions, rateLimit: 'dry-run' }), true);
  assert.equal(applies('loadBalancing', proxyOptions), false);
  assert.equal(
    applies('loadBalancing', { ...proxyOptions, upstreams: [{ address: 'a:1', backup: false }, { address: 'b:1', backup: false }] }),
    true
  );
  assert.equal(applies('gzipLevel', staticOptions), true);
  assert.equal(applies('gzipLevel', proxyOptions), false);
  assert.equal(applies('trustedProxies', { ...staticOptions, realIp: 'custom' }), true);
  assert.equal(applies('publicHttpsPort', staticOptions), false);
  assert.equal(applies('publicHttpsPort', { ...staticOptions, realIp: 'cloudflare' }), true);
  assert.equal(applies('resolver', proxyOptions), false);
  assert.equal(applies('resolver', { ...proxyOptions, upstreams: [{ address: 'app:3000', backup: false }] }), true);
  assert.equal(applies('proxyCache', proxyOptions), true);
  assert.equal(applies('fastcgiCache', proxyOptions), false);
  assert.equal(applies('fastcgiCache', defaultsFor('php', 'host') as Options), true);
});
