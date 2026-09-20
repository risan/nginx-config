#!/usr/bin/env node

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEFAULT_OPTIONS, generateConfig } from '../lib/config.js';

const image = process.argv[2]
  ?? process.env.NGINX_IMAGE
  ?? 'nginx:1.30.5-alpine@sha256:a5f2157a0302eb0c5e300415effb63a9e70ed1eb9c107283819bf6d149ab607c';
const workdir = mkdtempSync(join(tmpdir(), 'nginx-config-syntax-'));
const tlsDir = join(workdir, 'tls');
mkdirSync(tlsDir);

function run(command, args, label) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`${label} failed with exit ${result.status ?? 'signal'}`);
  }
  return result.stdout;
}

try {
  run('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=localhost',
    '-keyout', join(tlsDir, 'privkey.pem'),
    '-out', join(tlsDir, 'fullchain.pem')
  ], 'temporary TLS certificate generation');

  const profiles = ['static', 'spa', 'php', 'go', 'proxy'];
  for (const profile of profiles) {
    // Syntax checks run without a service DNS network. Loopback is a valid
    // endpoint for parsing; the proxy smoke test below supplies a real backend
    // and exercises DNS, forwarding headers, and runtime behavior.
    const upstream = profile === 'php' ? '127.0.0.1:9000' : '127.0.0.1:8081';
    const options = {
      ...DEFAULT_OPTIONS,
      profile,
      serverName: 'localhost',
      listenPort: 8080,
      httpsPort: 8443,
      documentRoot: '/usr/share/nginx/html',
      upstream,
      tls: false
    };
    const file = join(workdir, `${profile}.conf`);
    writeFileSync(file, generateConfig(options), 'utf8');
    run('docker', [
      'run', '--rm', '--user', '0:0', '--entrypoint', 'nginx',
      '--mount', `type=bind,src=${file},dst=/etc/nginx/nginx.conf,readonly`,
      image, '-t', '-c', '/etc/nginx/nginx.conf', '-p', '/etc/nginx'
    ], `${profile} syntax check`);
    process.stdout.write(`PASS ${profile}\n`);

    const tlsFile = join(workdir, `${profile}-tls.conf`);
    writeFileSync(tlsFile, generateConfig({
      ...options,
      tls: true,
      certificatePath: '/tmp/nginx-config-tls/fullchain.pem',
      certificateKeyPath: '/tmp/nginx-config-tls/privkey.pem'
    }), 'utf8');
    run('docker', [
      'run', '--rm', '--user', '0:0', '--entrypoint', 'nginx',
      '--mount', `type=bind,src=${tlsFile},dst=/etc/nginx/nginx.conf,readonly`,
      '--mount', `type=bind,src=${tlsDir},dst=/tmp/nginx-config-tls,readonly`,
      image, '-t', '-c', '/etc/nginx/nginx.conf', '-p', '/etc/nginx'
    ], `${profile} TLS syntax check`);
    process.stdout.write(`PASS ${profile} TLS\n`);
  }
} finally {
  rmSync(workdir, { recursive: true, force: true });
}
