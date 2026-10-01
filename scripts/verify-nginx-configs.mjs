#!/usr/bin/env node

// Runs `nginx -t` in the pinned image for a matrix of generated configs.
// All configs run in one container, so the whole matrix takes seconds.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { generateConfig } from '../lib/render.ts';
import { NGINX_IMAGE } from '../lib/version.ts';
import { buildMatrix, TEST_CERTIFICATE_DIRECTORY } from './matrix.ts';

const image = process.argv[2] ?? process.env.NGINX_IMAGE ?? NGINX_IMAGE;
const workdir = mkdtempSync(join(tmpdir(), 'nginx-config-syntax-'));
const certificateDirectory = join(workdir, 'tls');
const configDirectory = join(workdir, 'confs');
mkdirSync(certificateDirectory);
mkdirSync(configDirectory);

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
  run(
    'openssl',
    [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-subj', '/CN=localhost',
      '-keyout', join(certificateDirectory, 'privkey.pem'),
      '-out', join(certificateDirectory, 'fullchain.pem')
    ],
    'temporary TLS certificate generation'
  );

  const entries = buildMatrix();
  for (const entry of entries) {
    writeFileSync(join(configDirectory, `${entry.name}.conf`), generateConfig(entry.options), 'utf8');
  }

  // Root is needed so nginx can create cache folders and read the test key.
  const script = [
    'failed=0',
    'for file in /confs/*.conf; do',
    '  if output=$(nginx -t -c "$file" -p /etc/nginx 2>&1); then echo "PASS $(basename "$file" .conf)"; else echo "FAIL $(basename "$file" .conf)"; echo "$output"; failed=$((failed + 1)); fi',
    'done',
    'echo "FAILED=$failed"',
    '[ "$failed" -eq 0 ]'
  ].join('\n');
  const result = spawnSync(
    'docker',
    [
      'run', '--rm', '--user', '0:0', '--entrypoint', 'sh',
      '--mount', `type=bind,src=${configDirectory},dst=/confs,readonly`,
      '--mount', `type=bind,src=${certificateDirectory},dst=${TEST_CERTIFICATE_DIRECTORY},readonly`,
      image, '-c', script
    ],
    { encoding: 'utf8' }
  );
  const lines = (result.stdout ?? '').split('\n');
  const failures = lines.filter((line) => line.startsWith('FAIL ')).length;
  for (const line of lines) {
    if (!line.startsWith('PASS ') || process.env.VERBOSE) {
      if (line !== '') {
        process.stdout.write(`${line}\n`);
      }
    }
  }

  process.stderr.write(result.stderr ?? '');
  if (result.status !== 0 || failures > 0) {
    throw new Error(`nginx -t failed for ${failures} of ${entries.length} configs`);
  }

  process.stdout.write(`PASS nginx -t accepted all ${entries.length} generated configs\n`);
} finally {
  rmSync(workdir, { recursive: true, force: true });
}
