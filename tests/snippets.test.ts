import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

test('the legacy snippets protect files before they add cache rules', () => {
  const basic = read('snippets/basic.conf');
  const protection = basic.indexOf('snippets/location/protect-sensitive-files.conf');
  const caching = basic.indexOf('snippets/location/cache-control.conf');
  assert.ok(protection >= 0 && caching >= 0 && protection < caching);
  assert.equal((read('snippets/location/cache-control.conf').match(/add_header_inherit merge;/g) ?? []).length, 2);
});

test('A6/R1: the cache snippet uses a plain prefix, not a hash regex', () => {
  const snippet = read('snippets/location/cache-control.conf');
  assert.match(snippet, /^location \/assets\/ \{/m);
  assert.doesNotMatch(snippet, /\{8,\}/);
  assert.doesNotMatch(snippet, /location \^~/);
});

test('A7/B10: dotfile rule exempts .well-known', () => {
  const snippet = read('snippets/location/protect-sensitive-files.conf');
  assert.match(snippet, /location ~ \/\\\.\(\?!well-known\/\) \{/);
  assert.doesNotMatch(snippet, /acme-challenge/);
});

test('A1: the WebSocket map clears Connection for normal requests', () => {
  const snippet = read('snippets/directive/websocket-proxy.conf');
  assert.match(snippet, /# {5}default "";\n# {5}~\*\^websocket\$ upgrade;/);
  assert.doesNotMatch(snippet, /default close|"" close/);
});

test('A11: the proxy and FastCGI snippets no longer restate defaults', () => {
  const proxy = read('snippets/directive/proxy.conf');
  assert.doesNotMatch(proxy, /^proxy_http_version|^proxy_set_header Connection|^proxy_buffering|^proxy_request_buffering|^proxy_send_timeout/m);
  assert.match(proxy, /X-Request-ID \$request_id/);
  assert.doesNotMatch(read('snippets/directive/fastcgi-php.conf'), /fastcgi_index/);
  assert.match(read('snippets/directive/fastcgi.conf'), /\$realpath_root/);
  const ssl = read('snippets/directive/ssl.conf');
  assert.doesNotMatch(ssl, /^ssl_session_tickets|^ssl_early_data/m);
  assert.match(ssl, /ssl_session_timeout 1d;/);
});
