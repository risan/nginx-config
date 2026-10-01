import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// @ts-expect-error The helper is plain JavaScript shared with the smoke scripts.
import { httpExamples, tlsExamples } from '../scripts/compose-examples.mjs';

interface Example {
  source: string;
  config: string;
  serverName: string;
}

const root = join(import.meta.dirname, '..');
const appServerName = (config: string) => /^\s*server_name ((?!_;)[^;]+);/m.exec(config)?.[1]?.split(' ')[0];

test('every printed HTTP Compose example mounts an HTTP-only config whose server name matches NGINX_SERVER_NAME', () => {
  const examples: Example[] = httpExamples().filter((example: Example) => example.config.includes('sites-example'));
  assert.ok(examples.length >= 3, 'README, operations guide, and compose.yaml each print the example');
  for (const example of examples) {
    const path = join(root, example.config);
    assert.ok(existsSync(path), `${example.source}: ${example.config} exists`);
    const config = readFileSync(path, 'utf8');
    assert.doesNotMatch(config, /ssl_certificate/, `${example.source}: ${example.config} must be HTTP only`);
    assert.equal(appServerName(config), example.serverName, `${example.source}: server_name of ${example.config}`);
  }
});

test('every printed TLS Compose example mounts a TLS config whose server name matches NGINX_TLS_SERVER_NAME', () => {
  const examples: Example[] = tlsExamples().filter((example: Example) => example.config.includes('sites-example'));
  assert.ok(examples.length >= 1);
  for (const example of examples) {
    const config = readFileSync(join(root, example.config), 'utf8');
    assert.match(config, /ssl_certificate /, `${example.source}: ${example.config} must use TLS`);
    assert.match(config, /listen 8443 ssl/);
    assert.equal(appServerName(config), example.serverName, `${example.source}: server_name of ${example.config}`);
  }
});
