#!/usr/bin/env node

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { DEFAULT_OPTIONS, generateConfig } from '../lib/config.js';

const image = process.argv[2]
  ?? process.env.NGINX_IMAGE
  ?? 'nginx:1.30.5-alpine@sha256:a5f2157a0302eb0c5e300415effb63a9e70ed1eb9c107283819bf6d149ab607c';
const workdir = mkdtempSync(join(tmpdir(), 'nginx-config-cache-'));
const network = `nginx-config-cache-${randomUUID().slice(0, 12)}`;
const backendName = `${network}-backend`;
const edgeName = `${network}-edge`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`${command} failed with exit ${result.status ?? 'signal'}`);
  }
  return result.stdout.trim();
}

function cleanup() {
  spawnSync('docker', ['rm', '-f', edgeName, backendName], { stdio: 'ignore' });
  spawnSync('docker', ['network', 'rm', network], { stdio: 'ignore' });
  rmSync(workdir, { recursive: true, force: true });
}

function printLogs() {
  for (const [name, label] of [[backendName, 'backend'], [edgeName, 'edge']]) {
    const logs = spawnSync('docker', ['logs', name], { encoding: 'utf8' });
    process.stderr.write(`${label} logs:\n${logs.stdout ?? ''}${logs.stderr ?? ''}`);
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForHttp(url, expectedStatus, label) {
  let lastResponse = 'no response';
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = spawnSync('curl', [
      '--silent', '--show-error', '--connect-timeout', '1', '--max-time', '2',
      '--output', '/dev/null', '--write-out', '%{http_code}',
      '--header', 'Host: localhost', url
    ], { encoding: 'utf8' });
    lastResponse = `exit=${response.status ?? 'signal'} status=${response.stdout.trim()}${response.stderr.trim() ? ` error=${response.stderr.trim()}` : ''}`;
    if (response.status === 0 && response.stdout.trim() === expectedStatus) return;
    await sleep(100);
  }
  throw new Error(`${label} did not become ready (${lastResponse})`);
}

function get(path, port, extra = []) {
  return run('curl', [
    '--silent', '--show-error', '--fail',
    '--header', 'Host: localhost',
    ...extra,
    `http://127.0.0.1:${port}${path}`
  ]);
}

try {
  const backendConfig = join(workdir, 'backend.conf');
  const edgeConfig = join(workdir, 'edge.conf');
  writeFileSync(backendConfig, `pid /tmp/backend.pid;
events { worker_connections 16; }
http {
    client_body_temp_path /tmp/nginx-client-body;
    proxy_temp_path /tmp/nginx-proxy;
    fastcgi_temp_path /tmp/nginx-fastcgi;
    uwsgi_temp_path /tmp/nginx-uwsgi;
    scgi_temp_path /tmp/nginx-scgi;
    access_log off;
    server {
        listen 8081;
        location = /private {
            add_header Cache-Control "private" always;
            return 200 "private:$msec\\n";
        }
        location = /no-store {
            add_header Cache-Control "no-store" always;
            return 200 "no-store:$msec\\n";
        }
        location = /cookie {
            add_header Set-Cookie "sid=$msec" always;
            return 200 "cookie:$msec\\n";
        }
        location / {
            return 200 "public:$msec\\n";
        }
    }
}
`, 'utf8');
  writeFileSync(edgeConfig, generateConfig({
    ...DEFAULT_OPTIONS,
    profile: 'proxy',
    serverName: 'localhost',
    listenPort: 8080,
    upstream: 'backend:8081',
    proxyCache: true,
    tls: false
  }), 'utf8');

  run('docker', ['network', 'create', network]);
  run('docker', [
    'run', '-d', '--name', backendName,
    '--network', network, '--network-alias', 'backend',
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,uid=101,gid=101,mode=1777',
    '--user', '101:101',
    '--mount', `type=bind,src=${backendConfig},dst=/etc/nginx/nginx.conf,readonly`,
    '--entrypoint', 'nginx', image, '-g', 'daemon off;'
  ]);
  run('docker', [
    'run', '-d', '--name', edgeName,
    '--network', network,
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,uid=101,gid=101,mode=1777',
    '--user', '101:101',
    '-p', '127.0.0.1::8080',
    '--mount', `type=bind,src=${edgeConfig},dst=/etc/nginx/nginx.conf,readonly`,
    '--entrypoint', 'nginx', image, '-g', 'daemon off;'
  ]);

  let port;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const mapping = spawnSync('docker', ['port', edgeName, '8080/tcp'], { encoding: 'utf8' });
    port = mapping.stdout.trim().match(/:(\d+)$/)?.[1];
    if (port) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!port) throw new Error('could not discover cache smoke port');
  await waitForHttp(`http://127.0.0.1:${port}/healthz`, '204', 'cache smoke endpoint');

  // A public GET is cached. Waiting crosses the backend's millisecond clock so
  // an uncached response cannot accidentally compare equal.
  const publicFirst = get('/public', port);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const publicSecond = get('/public', port);
  if (publicFirst !== publicSecond) throw new Error('public GET was not cached');

  for (const path of ['/private', '/no-store', '/cookie']) {
    const first = get(path, port);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const second = get(path, port);
    if (first === second) throw new Error(`${path} response was cached despite privacy controls`);
  }

  const authFirst = get('/public', port, ['--header', 'Authorization: Bearer secret']);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const authSecond = get('/public', port, ['--header', 'Authorization: Bearer secret']);
  if (authFirst === authSecond) throw new Error('authorized response was cached');

  const postFirst = run('curl', ['--silent', '--show-error', '--fail', '--request', 'POST', '--header', 'Host: localhost', `http://127.0.0.1:${port}/public`]);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const postSecond = run('curl', ['--silent', '--show-error', '--fail', '--request', 'POST', '--header', 'Host: localhost', `http://127.0.0.1:${port}/public`]);
  if (postFirst === postSecond) throw new Error('POST response was cached');

  process.stdout.write('PASS proxy cache privacy and method guards\n');
} catch (error) {
  printLogs();
  throw error;
} finally {
  cleanup();
}
