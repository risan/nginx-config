#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { DEFAULT_OPTIONS, generateConfig, generateDefaultServer } from '../lib/config.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const tlsDefaults = {
  tls: true,
  hsts: false,
  certificatePath: '/etc/nginx/tls/example.com/fullchain.pem',
  certificateKeyPath: '/etc/nginx/tls/example.com/privkey.pem'
};

const examples = [
  ['nginx.conf', { ...DEFAULT_OPTIONS }],
  ['docker/nginx.conf', {
    ...DEFAULT_OPTIONS,
    profile: 'static',
    serverName: 'localhost',
    listenPort: 8080,
    documentRoot: '/usr/share/nginx/html',
    tls: false,
    assetCache: false
  }],
  ['sites-example/no-default.conf', () => generateDefaultServer(80)],
  ['sites-example/site.conf', { ...DEFAULT_OPTIONS }],
  ['sites-example/site-ssl.conf', { ...DEFAULT_OPTIONS, ...tlsDefaults }],
  ['sites-example/spa.conf', { ...DEFAULT_OPTIONS, profile: 'spa', assetCache: true }],
  ['sites-example/spa-ssl.conf', { ...DEFAULT_OPTIONS, profile: 'spa', assetCache: true, ...tlsDefaults }],
  ['sites-example/php.conf', { ...DEFAULT_OPTIONS, profile: 'php', upstream: '127.0.0.1:9000', gzip: false }],
  ['sites-example/php-ssl.conf', { ...DEFAULT_OPTIONS, profile: 'php', upstream: '127.0.0.1:9000', gzip: false, ...tlsDefaults }],
  ['sites-example/go.conf', { ...DEFAULT_OPTIONS, profile: 'go', upstream: '127.0.0.1:8081', gzip: false }],
  ['sites-example/go-ssl.conf', { ...DEFAULT_OPTIONS, profile: 'go', upstream: '127.0.0.1:8081', gzip: false, ...tlsDefaults }],
  ['sites-example/proxy.conf', { ...DEFAULT_OPTIONS, profile: 'proxy', upstream: '127.0.0.1:3000', gzip: false, websocket: true }],
  ['sites-example/proxy-ssl.conf', { ...DEFAULT_OPTIONS, profile: 'proxy', upstream: '127.0.0.1:3000', gzip: false, websocket: true, ...tlsDefaults }]
];

let drift = false;
for (const [relativePath, options] of examples) {
  const target = path.join(repositoryRoot, relativePath);
  const expected = typeof options === 'function' ? options() : generateConfig(options);
  let actual = null;
  try {
    actual = await readFile(target, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  if (actual !== expected) {
    drift = true;
    if (checkOnly) {
      console.error(`generated example is out of date: ${relativePath}`);
    } else {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, expected, 'utf8');
      console.log(`generated ${relativePath}`);
    }
  }
}

if (checkOnly && drift) {
  process.exitCode = 1;
} else if (checkOnly) {
  console.log(`generated examples are up to date (${examples.length} files)`);
}
