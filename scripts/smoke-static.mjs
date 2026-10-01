#!/usr/bin/env node

// Checks the generated SPA config against real files: one copy of each security header on every
// kind of response, immutable caching, protected files, and gzip negotiation (with and without Via).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

import { generateConfig } from '../lib/render.ts';
import { defaultsFor } from '../lib/options.ts';
import { assert, countHeader, createSmoke, request, runSmoke } from './smoke-kit.mjs';

const smoke = createSmoke('static');
const SECURITY_HEADERS = ['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Content-Security-Policy'];

await runSmoke(smoke, async () => {
  const site = join(smoke.workdir, 'site');
  mkdirSync(join(site, 'assets'), { recursive: true });
  mkdirSync(join(site, '.well-known'));
  const large = 'compressible static fixture\n'.repeat(4096);
  writeFileSync(join(site, 'index.html'), '<!doctype html><title>spa</title>', 'utf8');
  writeFileSync(join(site, 'assets', 'app-BdK3x9aF.js'), 'console.log("app");\n'.repeat(200), 'utf8');
  writeFileSync(join(site, 'assets', '.env'), 'SECRET=1', 'utf8');
  writeFileSync(join(site, 'assets', 'config.sql'), 'DROP TABLE users;', 'utf8');
  writeFileSync(join(site, '.well-known', 'security.txt'), 'Contact: mailto:security@example.com\n', 'utf8');
  writeFileSync(join(site, 'large.txt'), large, 'utf8');
  writeFileSync(join(site, 'pre.txt'), 'plain version of the precompressed file\n', 'utf8');
  writeFileSync(join(site, 'pre.txt.gz'), gzipSync('precompressed version served by gzip_static\n'));
  writeFileSync(join(site, 'font.woff2'), Buffer.alloc(4096, 1));

  const config = generateConfig({ ...defaultsFor('spa', 'container'), serverName: 'localhost', permissionsPolicy: true, crossOriginOpenerPolicy: 'same-origin-allow-popups' });
  smoke.createNetwork();
  const edge = smoke.startNginx({ containerName: 'edge', config, mounts: [[site, '/usr/share/nginx/html']], publish: [8080] });
  const port = await smoke.port(edge, 8080);
  await smoke.waitFor({ port, path: '/healthz' }, 204, 'static edge');
  const get = (path, options = {}) => request({ port, path, ...options });

  // B2/R12: exactly one copy of each security header, whichever location answers.
  const expectedOnce = [...SECURITY_HEADERS, 'Permissions-Policy', 'Cross-Origin-Opener-Policy'];
  for (const [path, status] of [['/', 200], ['/index.html', 200], ['/deep/client/route', 200], ['/assets/app-BdK3x9aF.js', 200], ['/assets/missing.js', 404], ['/large.txt', 200], ['/healthz', 204], ['/.env', 403]]) {
    const response = await get(path);
    assert(response.status === status, `${path} returned ${response.status}, expected ${status}`);
    for (const header of expectedOnce) {
      assert(countHeader(response, header) === 1, `${header} appears ${countHeader(response, header)} times on ${path}`);
    }

    assert(countHeader(response, 'Server') === 1 && !/\d/.test(response.headers.server), `Server header leaks the version on ${path}: ${response.headers.server}`);
  }

  const html = await get('/');
  assert(html.headers['cache-control'] === 'no-cache' && countHeader(html, 'Cache-Control') === 1, `HTML cache header: ${html.headers['cache-control']}`);
  const asset = await get('/assets/app-BdK3x9aF.js');
  assert(asset.headers['cache-control'] === 'public, max-age=31536000, immutable' && countHeader(asset, 'Cache-Control') === 1, `asset cache header: ${asset.headers['cache-control']}`);
  assert((await get('/assets/missing.js')).body.toString('utf8') !== '<!doctype html><title>spa</title>', 'a missing asset fell back to index.html');
  assert((await get('/client-route')).body.toString('utf8').includes('<title>spa</title>'), 'a client route did not fall back to index.html');

  // R1/B10: private files stay private even under the immutable prefix, and .well-known stays public.
  for (const path of ['/assets/.env', '/assets/config.sql']) {
    const response = await get(path);
    assert(response.status === 403 && !response.body.toString('utf8').includes('SECRET'), `${path} returned ${response.status}`);
  }

  const security = await get('/.well-known/security.txt');
  assert(security.status === 200 && security.body.toString('utf8').startsWith('Contact:'), 'security.txt is not served');

  // A5: no Content-Length on the 204 response.
  const health = await get('/healthz');
  assert(!('content-length' in health.headers), 'healthz sent Content-Length');

  // B4/R17: gzip works for plain clients and for CDN traffic (Via), and identity stays identity.
  const compressed = await get('/large.txt', { headers: { 'Accept-Encoding': 'gzip' } });
  assert(compressed.headers['content-encoding'] === 'gzip' && gunzipSync(compressed.body).toString('utf8') === large, 'large.txt was not gzip-compressed');
  assert(/Accept-Encoding/i.test(compressed.headers.vary ?? ''), 'compressed response lacks Vary: Accept-Encoding');
  const viaCdn = await get('/large.txt', { headers: { 'Accept-Encoding': 'gzip', Via: '1.1 cdn.example' } });
  assert(viaCdn.headers['content-encoding'] === 'gzip', 'gzip stopped when the request had a Via header');
  const identity = await get('/large.txt', { headers: { 'Accept-Encoding': 'identity' } });
  assert(!('content-encoding' in identity.headers) && identity.body.toString('utf8') === large, 'identity request was compressed');
  const font = await get('/font.woff2', { headers: { 'Accept-Encoding': 'gzip' } });
  assert(!('content-encoding' in font.headers), 'woff2 was compressed again');

  // C18: a prebuilt .gz file is served as is, also behind a CDN.
  for (const headers of [{ 'Accept-Encoding': 'gzip' }, { 'Accept-Encoding': 'gzip', Via: '1.1 cdn.example' }]) {
    const pre = await get('/pre.txt', { headers });
    assert(pre.headers['content-encoding'] === 'gzip' && gunzipSync(pre.body).toString('utf8') === 'precompressed version served by gzip_static\n', `gzip_static did not serve the .gz file for ${JSON.stringify(headers)}`);
  }

  const plain = await get('/pre.txt', { headers: { 'Accept-Encoding': 'identity' } });
  assert(plain.body.toString('utf8').startsWith('plain version'), 'identity request did not get the plain file');

  // B1: a directory redirect has no host or port.
  mkdirSync(join(site, 'docs'));
  writeFileSync(join(site, 'docs', 'index.html'), 'docs', 'utf8');
  const directory = await get('/docs');
  assert(directory.status === 301 && directory.headers.location === '/docs/', `directory redirect is not relative: ${directory.headers.location}`);

  // R23: with dynamic gzip off and gzip_static on, prebuilt files are still served, also behind a CDN.
  const staticOnly = smoke.startNginx({
    containerName: 'static-only',
    config: generateConfig({ ...defaultsFor('static', 'container'), serverName: 'localhost', gzip: false, gzipStatic: true }),
    mounts: [[site, '/usr/share/nginx/html']],
    publish: [8080]
  });
  const staticOnlyPort = await smoke.port(staticOnly, 8080);
  await smoke.waitFor({ port: staticOnlyPort, path: '/healthz' }, 204, 'gzip_static-only edge');
  for (const headers of [{ 'Accept-Encoding': 'gzip' }, { 'Accept-Encoding': 'gzip', Via: '1.1 cdn.example' }]) {
    const pre = await request({ port: staticOnlyPort, path: '/pre.txt', host: 'localhost', headers });
    assert(pre.headers['content-encoding'] === 'gzip' && /Accept-Encoding/i.test(pre.headers.vary ?? ''), `gzip_static alone did not serve the .gz file for ${JSON.stringify(headers)}`);
    const dynamic = await request({ port: staticOnlyPort, path: '/large.txt', host: 'localhost', headers });
    assert(!('content-encoding' in dynamic.headers), 'a file without a .gz sibling was compressed although gzip is off');
  }

  process.stdout.write('PASS security headers once per response, immutable caching, protected files, gzip with and without Via, gzip_static\n');
});
