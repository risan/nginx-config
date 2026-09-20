#!/usr/bin/env node

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { DEFAULT_OPTIONS, generateConfig, PRESETS } from '../lib/config.js';

const image = process.argv[2]
  ?? process.env.NGINX_IMAGE
  ?? 'nginx:1.30.5-alpine@sha256:a5f2157a0302eb0c5e300415effb63a9e70ed1eb9c107283819bf6d149ab607c';
const workdir = mkdtempSync(join(tmpdir(), 'nginx-config-proxy-'));
const network = `nginx-config-proxy-${randomUUID().slice(0, 12)}`;
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
  spawnSync('docker', ['rm', '-f', backendName, edgeName], { stdio: 'ignore' });
  spawnSync('docker', ['network', 'rm', network], { stdio: 'ignore' });
  rmSync(workdir, { recursive: true, force: true });
}

try {
  const backendConfig = join(workdir, 'backend.conf');
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
        default_type text/plain;
        location / {
            return 200 "response=go-default-upstream\\nhost=$http_host\\nxff=$http_x_forwarded_for\\nreal=$http_x_real_ip\\nproto=$http_x_forwarded_proto\\nforwarded=$http_forwarded\\n";
        }
    }
}
`, 'utf8');

  const edgeConfig = join(workdir, 'edge.conf');
  const goDefaults = PRESETS.find((preset) => preset.id === 'go')?.defaults;
  writeFileSync(edgeConfig, generateConfig({
    ...DEFAULT_OPTIONS,
    ...goDefaults,
    serverName: 'example.com',
    tls: false,
    websocket: false,
    streaming: false,
    proxyCache: false
  }), 'utf8');

  run('docker', ['network', 'create', network]);
  run('docker', [
    'run', '-d', '--name', edgeName,
    '--network', network,
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,uid=101,gid=101,mode=1777',
    '--user', '101:101',
    '-p', '127.0.0.1::8080',
    '--mount', `type=bind,src=${edgeConfig},dst=/etc/nginx/nginx.conf,readonly`,
    '--entrypoint', 'nginx', image, '-g', 'daemon off;'
  ]);
  // Keep both NGINX processes in one network namespace so the smoke catches
  // a backend binding to the edge listener's port instead of its own port.
  run('docker', [
    'run', '-d', '--name', backendName,
    '--network', `container:${edgeName}`,
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,uid=101,gid=101,mode=1777',
    '--user', '101:101',
    '--mount', `type=bind,src=${backendConfig},dst=/etc/nginx/nginx.conf,readonly`,
    '--entrypoint', 'nginx', image, '-g', 'daemon off;'
  ]);

  let port;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const mapping = spawnSync('docker', ['port', edgeName, '8080/tcp'], { encoding: 'utf8' });
    port = mapping.stdout.trim().match(/:(\d+)$/)?.[1];
    if (port) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!port) throw new Error('could not discover proxy smoke port');

  let body = '';
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = spawnSync('curl', [
      '--silent', '--show-error', '--fail',
      '--header', 'Host: example.com',
      '--header', 'X-Forwarded-For: attacker.example',
      '--header', 'X-Real-IP: attacker.example',
      '--header', 'X-Forwarded-Proto: https',
      '--header', 'Forwarded: for=attacker.example;proto=https',
      `http://127.0.0.1:${port}/echo`
    ], { encoding: 'utf8' });
    if (response.status === 0) {
      body = response.stdout;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!body) {
    const backendLogs = spawnSync('docker', ['logs', backendName], { encoding: 'utf8' });
    const edgeLogs = spawnSync('docker', ['logs', edgeName], { encoding: 'utf8' });
    process.stderr.write(`backend logs:\n${backendLogs.stdout ?? ''}${backendLogs.stderr ?? ''}`);
    process.stderr.write(`edge logs:\n${edgeLogs.stdout ?? ''}${edgeLogs.stderr ?? ''}`);
    throw new Error('proxy smoke endpoint did not become ready');
  }
  if (!/^response=go-default-upstream$/m.test(body)) throw new Error(`Go default upstream did not answer:\n${body}`);
  if (!/^host=example.com$/m.test(body)) throw new Error(`Host was not normalized:\n${body}`);
  if (/attacker\.example/.test(body)) throw new Error(`spoofed forwarding identity reached backend:\n${body}`);
  if (!/^proto=http$/m.test(body)) throw new Error(`scheme was not normalized:\n${body}`);

  process.stdout.write('PASS Go default upstream and proxy forwarding identity normalization\n');
} finally {
  cleanup();
}
