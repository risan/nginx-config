import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEFAULT_OPTIONS,
  PRESETS,
  SCHEMA_VERSION,
  generateConfig,
  generateDefaultServer,
  validateOptions
} from '../lib/config.js';

const repositoryRoot = join(import.meta.dirname, '..');

test('exports a stable schema and safe defaults', () => {
  assert.equal(SCHEMA_VERSION, 1);
  assert.deepEqual(DEFAULT_OPTIONS, {
    profile: 'static',
    serverName: 'example.com',
    listenPort: 8080,
    httpsPort: 8443,
    documentRoot: '/usr/share/nginx/html',
    upstream: '127.0.0.1:8080',
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
  assert.deepEqual(PRESETS.map(({ id }) => id), ['static', 'spa', 'php', 'go', 'proxy']);
  assert.ok(PRESETS.every((preset) => preset.description && preset.defaults));
});

test('generates the standalone unknown-host guard used by legacy examples', () => {
  const config = generateDefaultServer(80);
  assert.match(config, /listen 80 default_server;/);
  assert.match(config, /server_name _;/);
  assert.match(config, /return 444;/);
  assert.throws(() => generateDefaultServer(0), /Invalid default server port/);
});

test('orders legacy sensitive-file protection before cache regexes and preserves headers', () => {
  const basic = readFileSync(join(repositoryRoot, 'snippets/basic.conf'), 'utf8');
  const protection = basic.indexOf('snippets/location/protect-sensitive-files.conf');
  const caching = basic.indexOf('snippets/location/cache-control.conf');
  assert.ok(protection >= 0 && caching >= 0 && protection < caching);

  const cacheSnippet = readFileSync(join(repositoryRoot, 'snippets/location/cache-control.conf'), 'utf8');
  assert.equal((cacheSnippet.match(/add_header_inherit merge;/g) ?? []).length, 2);
});

test('normalizes valid options without mutating the input', () => {
  const input = { profile: 'static', documentRoot: '/srv/site/', assetCache: true };
  const result = validateOptions(input);
  assert.equal(result.valid, true);
  assert.equal(result.options.documentRoot, '/srv/site');
  assert.equal(result.options.assetCache, true);
  assert.deepEqual(input, { profile: 'static', documentRoot: '/srv/site/', assetCache: true });
});

test('rejects unknown keys and directive injection in every string field', () => {
  const cases = [
    ['serverName', 'example.com; return 444'],
    ['documentRoot', '/srv/site; deny all'],
    ['upstream', 'http://backend:8080'],
    ['certificatePath', '/etc/nginx/cert.pem; include /tmp/x'],
    ['certificateKeyPath', '/etc/nginx/key.pem\nssl_protocols TLSv1'],
    ['unknown', true]
  ];
  for (const [key, value] of cases) {
    const result = validateOptions({ [key]: value });
    assert.equal(result.valid, false, key);
    assert.ok(result.errors[key], key);
    assert.equal(result.options, null);
  }
});

test('requires strict JSON booleans and numeric ports', () => {
  assert.equal(validateOptions({ listenPort: '8080' }).valid, false);
  assert.equal(validateOptions({ tls: 'true' }).valid, false);
  assert.equal(validateOptions({ listenPort: 0 }).valid, false);
  assert.equal(validateOptions({ httpsPort: 65536 }).valid, false);
  assert.equal(validateOptions({ serverName: '-bad.example' }).valid, false);
  assert.equal(validateOptions({ upstream: 'backend:8080/path' }).valid, false);
  assert.equal(validateOptions({ upstream: '[::1]:8080' }).valid, true);
  assert.equal(validateOptions({ upstream: '[::ffff:192.0.2.1]:8080' }).valid, true);
  assert.equal(validateOptions({ upstream: '[::::]:8080' }).valid, false);
  assert.equal(validateOptions({ upstream: '[1:2:3:4:5:6:7:8:9]:8080' }).valid, false);
  assert.equal(validateOptions({ documentRoot: null }).valid, false);
  assert.equal(validateOptions({ certificatePath: { length: 2 } }).valid, false);
});

test('enforces relationships between profile and optional features', () => {
  assert.equal(validateOptions({ hsts: true }).valid, false);
  assert.equal(validateOptions({ websocket: true }).valid, false);
  assert.equal(validateOptions({ profile: 'proxy', websocket: true }).valid, true);
  assert.equal(validateOptions({ profile: 'proxy', streaming: true, proxyCache: true }).valid, true);
  assert.equal(validateOptions({ profile: 'proxy', upstream: '127.0.0.1:3000' }).options.gzip, false);
  assert.equal(validateOptions({ profile: 'proxy', upstream: '127.0.0.1:3000', gzip: true }).options.gzip, true);
  assert.equal(validateOptions({ profile: 'php', proxyCache: true }).valid, false);
  assert.equal(validateOptions({ profile: 'proxy', assetCache: true }).valid, false);
  assert.equal(validateOptions({ profile: 'proxy', upstream: '' }).valid, false);
  assert.equal(validateOptions({ tls: true, listenPort: 8443, httpsPort: 8443 }).valid, false);
});

test('generates a standalone static configuration with secure baseline behavior', () => {
  const config = generateConfig();
  assert.match(config, /^# Generated for NGINX Open Source 1\.30\.5\./);
  assert.match(config, /worker_processes auto;/);
  assert.match(config, /events \{/);
  assert.match(config, /http \{/);
  assert.match(config, /include \/etc\/nginx\/mime\.types;/);
  assert.match(config, /try_files \$uri \$uri\/ =404;/);
  assert.match(config, /gzip on;/);
  assert.match(config, /gzip_proxied off;/);
  assert.match(config, /server_tokens off;/);
  assert.doesNotMatch(config, /include snippets\//);
  assert.doesNotMatch(config, /Strict-Transport-Security/);
});

test('keeps missing SPA assets as 404s and supports Vite-style hashed names', () => {
  const config = generateConfig({ profile: 'spa', assetCache: true });
  assert.match(config, /location \/assets\/ \{/);
  assert.match(config, /location \/assets\/ \{[\s\S]*try_files \$uri =404;/);
  assert.ok(config.includes('"\\.[A-Za-z0-9_-]{8,}\\.(?:avif|css|eot|gif|ico|jpe?g|js|mjs|png|svg|ttf|woff2?|webp|webm)$"'));
  assert.match(config, /max-age=31536000, immutable/);
});

test('generates TLS redirects with custom ports and scoped HSTS', () => {
  const config = generateConfig({
    tls: true,
    hsts: true,
    listenPort: 8080,
    httpsPort: 8443,
    certificatePath: '/run/tls/fullchain.pem',
    certificateKeyPath: '/run/tls/privkey.pem'
  });
  assert.match(config, /return 308 https:\/\/example\.com:8443\$request_uri;/);
  assert.match(config, /listen 8443 ssl;/);
  assert.match(config, /http2 on;/);
  assert.match(config, /ssl_protocols TLSv1\.2 TLSv1\.3;/);
  assert.match(config, /http \{[\s\S]*    ssl_protocols TLSv1\.2 TLSv1\.3;/);
  assert.equal((config.match(/ssl_protocols TLSv1\.2 TLSv1\.3;/g) ?? []).length, 1);
  assert.equal((config.match(/ssl_session_cache shared:SSL:10m;/g) ?? []).length, 1);
  assert.match(config, /ssl_session_tickets on;/);
  assert.doesNotMatch(config, /ssl_session_tickets off;/);
  assert.match(config, /ssl_early_data off;/);
  assert.match(config, /ssl_certificate \/run\/tls\/fullchain\.pem;/);
  assert.match(config, /Strict-Transport-Security "max-age=31536000" always;/);
  assert.match(config, /location ~\* \\.html\$ \{[\s\S]*Strict-Transport-Security/);
  assert.match(config, /ssl_reject_handshake on;/);
});

test('generates reverse proxy cache, WebSocket, rate, and streaming controls', () => {
  const config = generateConfig({
    profile: 'proxy',
    upstream: 'api.internal:8080',
    websocket: true,
    proxyCache: true,
    rateLimit: true,
    streaming: true
  });
  assert.match(config, /upstream backend \{/);
  assert.match(config, /server api\.internal:8080;/);
  assert.match(config, /map \$http_upgrade \$connection_upgrade/);
  assert.match(config, /~\*\^websocket\$ upgrade;/);
  assert.match(config, /proxy_set_header Connection \$connection_upgrade;/);
  assert.match(config, /proxy_set_header Upgrade \$websocket_upgrade;/);
  assert.match(config, /proxy_set_header X-Forwarded-For \$remote_addr;/);
  assert.match(config, /proxy_set_header Forwarded "";/);
  assert.match(config, /limit_req_zone \$binary_remote_addr/);
  assert.match(config, /proxy_buffering off;/);
  assert.match(config, /proxy_request_buffering on;/);
  assert.match(config, /Response streaming is not upload streaming/);
  assert.match(config, /proxy_cache off;/);
  assert.doesNotMatch(config, /proxy_cache edge_cache;/);
  assert.doesNotMatch(config, /location ~\* \\.html\$ \{/);
});

test('makes dynamic gzip an explicit opt-in', () => {
  const safe = generateConfig({ profile: 'proxy', upstream: '127.0.0.1:3000' });
  const optedIn = generateConfig({ profile: 'proxy', upstream: '127.0.0.1:3000', gzip: true });
  assert.match(safe, /gzip off;/);
  assert.match(optedIn, /gzip on;/);
  assert.match(optedIn, /gzip_proxied any;/);
  assert.match(optedIn, /Dynamic compression was explicitly enabled/);
});

test('adds public cache bypass guards only when proxy cache is enabled', () => {
  const config = generateConfig({ profile: 'proxy', upstream: '127.0.0.1:3000', proxyCache: true });
  assert.match(config, /proxy_cache_key "\$scheme\|\$host\|\$request_uri";/);
  assert.match(config, /proxy_cache_bypass \$skip_cache_method \$skip_cache_auth \$skip_cache_cookie \$skip_cache_request_control \$skip_cache_request_pragma;/);
  assert.match(config, /proxy_no_cache \$skip_cache_method \$skip_cache_auth \$skip_cache_cookie \$skip_cache_request_control \$skip_cache_request_pragma \$skip_cache_set_cookie \$skip_cache_control \$skip_cache_vary;/);
  assert.match(config, /map \$upstream_http_set_cookie \$skip_cache_set_cookie/);
  assert.match(config, /map \$upstream_http_vary \$skip_cache_vary/);
  assert.match(config, /map \$http_cache_control \$skip_cache_request_control/);
  assert.doesNotMatch(generateConfig({ profile: 'proxy', upstream: '127.0.0.1:3000' }), /proxy_cache edge_cache;/);
});

test('generates PHP with script existence checks and HTTPoxy protection', () => {
  const config = generateConfig({ profile: 'php', upstream: '127.0.0.1:9000' });
  assert.match(config, /try_files \$uri \$uri\/ \/index\.php\?\$query_string;/);
  assert.match(config, /try_files \$uri =404;/);
  assert.match(config, /fastcgi_pass 127\.0\.0\.1:9000;/);
  assert.match(config, /include \/etc\/nginx\/fastcgi_params;/);
  assert.match(config, /fastcgi_param HTTP_PROXY "";/);
});
