#!/usr/bin/env node

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { DEFAULT_OPTIONS, generateConfig } from '../lib/config.js';

const image = process.argv[2]
  ?? process.env.NGINX_IMAGE
  ?? 'nginx:1.30.5-alpine@sha256:a5f2157a0302eb0c5e300415effb63a9e70ed1eb9c107283819bf6d149ab607c';
const phpImage = process.env.PHP_IMAGE
  ?? 'php:8.4-fpm-alpine@sha256:c68b19eac3042f36ed7dc7b1240712ad83d421f59e79c73357a645b520f7f68d';
const workdir = mkdtempSync(join(tmpdir(), 'nginx-config-php-'));
const network = `nginx-config-php-${randomUUID().slice(0, 12)}`;
const phpName = `${network}-php`;
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
  spawnSync('docker', ['rm', '-f', edgeName, phpName], { stdio: 'ignore' });
  spawnSync('docker', ['network', 'rm', network], { stdio: 'ignore' });
  rmSync(workdir, { recursive: true, force: true });
}

try {
  const documentRoot = join(workdir, 'public');
  const phpFile = join(documentRoot, 'index.php');
  const edgeConfig = join(workdir, 'edge.conf');
  mkdirSync(documentRoot, { recursive: true });
  writeFileSync(phpFile, '<?php echo "php-smoke-ok";\n', 'utf8');
  writeFileSync(edgeConfig, generateConfig({
    ...DEFAULT_OPTIONS,
    profile: 'php',
    serverName: 'localhost',
    listenPort: 8080,
    documentRoot: '/var/www/html',
    upstream: 'php:9000',
    tls: false
  }), 'utf8');

  run('docker', ['network', 'create', network]);
  run('docker', [
    'run', '-d', '--name', phpName,
    '--network', network, '--network-alias', 'php',
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev',
    '--mount', `type=bind,src=${documentRoot},dst=/var/www/html,readonly`,
    phpImage
  ]);
  run('docker', [
    'run', '-d', '--name', edgeName,
    '--network', network,
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,uid=101,gid=101,mode=1777',
    '--user', '101:101',
    '-p', '127.0.0.1::8080',
    '--mount', `type=bind,src=${documentRoot},dst=/var/www/html,readonly`,
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
  if (!port) throw new Error('could not discover PHP smoke port');

  let body = '';
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = spawnSync('curl', [
      '--silent', '--show-error', '--header', 'Host: localhost',
      `http://127.0.0.1:${port}/index.php`
    ], { encoding: 'utf8' });
    if (response.status === 0) {
      body = response.stdout;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (body !== 'php-smoke-ok') throw new Error(`PHP response was not executed: ${body}`);

  const missing = spawnSync('curl', [
    '--silent', '--show-error', '--output', '/dev/null', '--write-out', '%{http_code}',
    '--header', 'Host: localhost', `http://127.0.0.1:${port}/missing.php`
  ], { encoding: 'utf8' });
  if (missing.status !== 0 || missing.stdout.trim() !== '404') {
    throw new Error(`missing PHP script returned ${missing.stdout.trim()}`);
  }
  process.stdout.write('PASS PHP-FPM execution and missing-script denial\n');
} finally {
  cleanup();
}
