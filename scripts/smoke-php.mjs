#!/usr/bin/env node

// Runs the generated PHP config with a real PHP-FPM: script execution, source protection,
// atomic symlink releases, forwarded scheme variables, and FastCGI cache privacy.
import { mkdirSync, rmSync, symlinkSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

import { generateConfig } from '../lib/render.ts';
import { defaultsFor } from '../lib/options.ts';
import { assert, createSmoke, request, runSmoke, sleep } from './smoke-kit.mjs';

const PHP_IMAGE = process.env.PHP_IMAGE ?? 'php:8.4-fpm-alpine@sha256:c68b19eac3042f36ed7dc7b1240712ad83d421f59e79c73357a645b520f7f68d';
const smoke = createSmoke('php');

function phpConfig(overrides = {}) {
  return generateConfig({
    ...defaultsFor('php', 'container'),
    serverName: 'localhost',
    documentRoot: '/var/www/html/current',
    upstreams: [{ address: 'php:9000', backup: false }],
    immutablePaths: ['/build/'],
    ...overrides
  });
}

function writeRelease(root, name, files) {
  for (const [relative, content] of Object.entries(files)) {
    const path = join(root, 'releases', name, relative);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content, 'utf8');
  }
}

async function text(port, path, options = {}) {
  const response = await request({ port, path, host: 'localhost', ...options });

  return { status: response.status, body: response.body.toString('utf8'), response };
}

await runSmoke(smoke, async () => {
  const site = join(smoke.workdir, 'site');
  const release = (name) => ({
    'index.php': `<?php echo "release=${name};https=" . ($_SERVER['HTTPS'] ?? '') . ";scheme=" . $_SERVER['REQUEST_SCHEME'] . ";port=" . $_SERVER['SERVER_PORT'] . ";rid=" . ($_SERVER['HTTP_X_REQUEST_ID'] ?? '') . ";proxy=" . ($_SERVER['HTTP_PROXY'] ?? '');`,
    'time.php': '<?php echo microtime(true);',
    'cookie.php': '<?php setcookie("sid", (string) microtime(true)); echo microtime(true);',
    'upper.PHP': '<?php echo "upper-executed";',
    '.env': 'SECRET=1',
    'build/app-3f9a1c.js': 'console.log(1)',
    'build/config.sql': 'DROP TABLE users;',
    'build/.env': 'SECRET=2',
    'build/x.php': '<?php echo "build-x-executed";'
  });
  writeRelease(site, '1', release('1'));
  writeRelease(site, '2', release('2'));
  symlinkSync('releases/1', join(site, 'current'));

  smoke.createNetwork();
  smoke.startContainer('php', ['--network-alias', 'php', '--tmpfs', '/tmp:rw,noexec,nosuid,nodev', '--mount', `type=bind,src=${site},dst=/var/www/html,readonly`, PHP_IMAGE]);
  const mounts = [[site, '/var/www/html']];
  const edge = smoke.startNginx({ containerName: 'edge', config: phpConfig(), mounts, publish: [8080] });
  const cached = smoke.startNginx({ containerName: 'cached', config: phpConfig({ fastcgiCache: true }), mounts, publish: [8080] });
  const port = await smoke.port(edge, 8080);
  const cachedPort = await smoke.port(cached, 8080);
  await smoke.waitFor({ port, path: '/healthz', host: 'localhost' }, 204, 'PHP edge');
  await smoke.waitFor({ port: cachedPort, path: '/healthz', host: 'localhost' }, 204, 'PHP cache edge');

  let index = { status: 0, body: '' };
  for (let attempt = 0; attempt < 60 && !index.body.startsWith('release='); attempt += 1) {
    index = await text(port, '/index.php');
    await sleep(100);
  }

  assert(index.body.startsWith('release=1;'), `PHP did not run: ${index.status} ${index.body}`);
  assert(/;https=;scheme=http;port=80;rid=[0-9a-f]{32};proxy=$/.test(index.body), `FastCGI variables are wrong: ${index.body}`);
  const front = await text(port, '/some/route');
  assert(front.body.startsWith('release=1;'), 'the front controller fallback did not run index.php');
  const httpoxy = await text(port, '/index.php', { headers: { Proxy: 'http://evil.example' } });
  assert(/;proxy=$/.test(httpoxy.body), `a Proxy request header reached PHP (httpoxy): ${httpoxy.body}`);

  // R2: no spelling of .php returns source. A missing script is a 404 and PHP never sees it.
  const missing = await text(port, '/missing.php');
  assert(missing.status === 404, `a missing PHP script returned ${missing.status}`);
  for (const path of ['/INDEX.PHP', '/index.Php', '/index.php/extra', '/upper.PHP', '/build/x.php', '/index.php%00.txt']) {
    const result = await text(port, path);
    assert(!result.body.includes('<?php') && !result.body.includes('setcookie'), `${path} returned PHP source`);
  }

  assert((await text(port, '/build/x.php')).body === 'build-x-executed', 'a PHP file under an immutable prefix was not executed');
  assert((await text(port, '/build/app-3f9a1c.js')).response.headers['cache-control'] === 'public, max-age=31536000, immutable', 'hashed asset lacks immutable caching');
  // R1: the dotfile and extension rules beat the immutable prefix.
  for (const path of ['/.env', '/build/.env', '/build/config.sql', '/current/.env']) {
    const result = await text(port, path);
    assert(result.status === 403 || result.status === 404, `${path} returned ${result.status}`);
    assert(!result.body.includes('SECRET') && !result.body.includes('DROP TABLE'), `${path} leaked its content`);
  }

  // R10: switching the symlink switches the code at once, because paths are resolved by NGINX.
  symlinkSync('releases/2', join(site, 'next'));
  renameSync(join(site, 'next'), join(site, 'current'));
  const switched = await text(port, '/index.php');
  assert(switched.body.startsWith('release=2;'), `symlink release switch did not take effect: ${switched.body}`);

  // FastCGI cache: public pages are cached, private traffic is not.
  const cacheable = async (path, options) => {
    const first = (await text(cachedPort, path, options)).body;
    await sleep(1100);

    return first === (await text(cachedPort, path, options)).body;
  };
  assert(await cacheable('/time.php'), 'a public PHP response was not cached');
  assert(!(await cacheable('/cookie.php')), 'a response with Set-Cookie was cached');
  assert(!(await cacheable('/time.php', { headers: { Cookie: 'session=abc' } })), 'a response to a cookie request was cached');
  assert(!(await cacheable('/time.php', { headers: { Authorization: 'Bearer secret' } })), 'an authorized response was cached');
  assert(!(await cacheable('/time.php', { method: 'POST' })), 'a POST response was cached');

  rmSync(site, { recursive: true, force: true });
  process.stdout.write('PASS PHP-FPM execution, source protection, symlink releases, forwarded variables, and FastCGI cache privacy\n');
});
