#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { defaultsFor } from '../lib/options.ts';
import { generateConfig, generateDefaultServer } from '../lib/render.ts';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const manualTls = { https: 'manual' };

function config(profile, target, overrides = {}) {
  return { ...defaultsFor(profile, target), ...overrides };
}

const examples = [
  ['nginx.conf', config('static', 'host')],
  // The image default: static files, plain HTTP on 8080, served for localhost.
  ['docker/nginx.conf', config('static', 'container', { serverName: 'localhost', documentRoot: '/usr/share/nginx/html' })],
  ['sites-example/no-default.conf', () => generateDefaultServer(80)],
  ['sites-example/static.conf', config('static', 'host')],
  ['sites-example/static-ssl.conf', config('static', 'host', manualTls)],
  ['sites-example/spa.conf', config('spa', 'host')],
  ['sites-example/spa-ssl.conf', config('spa', 'host', manualTls)],
  ['sites-example/php.conf', config('php', 'host')],
  ['sites-example/php-ssl.conf', config('php', 'host', manualTls)],
  ['sites-example/proxy.conf', config('proxy', 'host', { websocketPath: '/ws/' })],
  ['sites-example/proxy-ssl.conf', config('proxy', 'host', { ...manualTls, websocketPath: '/ws/' })],
  [
    'sites-example/proxy-full.conf',
    config('proxy', 'host', {
      https: 'acme',
      acmeEmail: 'admin@example.com',
      http3: true,
      hsts: 'host',
      wwwRedirect: 'to-apex',
      realIp: 'cloudflare',
      upstreams: [
        { address: '10.0.0.11:3000', backup: false },
        { address: '10.0.0.12:3000', backup: false },
        { address: '10.0.0.13:3000', backup: true }
      ],
      loadBalancing: 'least-conn',
      websocketPath: '/ws/',
      streamingPath: '/events/',
      proxyCache: true,
      rateLimit: 'on',
      permissionsPolicy: true,
      statusEndpoint: true
    })
  ],
  // The HTTP-only container example for the Compose quick start (server name localhost).
  ['sites-example/container.conf', config('spa', 'container', { serverName: 'localhost' })],
  // The HTTPS container example for the Compose TLS service: certificates under /etc/nginx/tls/example.com/.
  [
    'sites-example/container-ssl.conf',
    config('proxy', 'container', {
      ...manualTls,
      serverName: 'example.com',
      upstreams: [{ address: 'app:3000', backup: false }]
    })
  ]
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
