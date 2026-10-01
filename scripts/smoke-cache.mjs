#!/usr/bin/env node

// Checks that the proxy cache stores public responses and never stores private ones.
import { generateConfig } from '../lib/render.ts';
import { defaultsFor } from '../lib/options.ts';
import { assert, createSmoke, runSmoke, request, sleep } from './smoke-kit.mjs';

const smoke = createSmoke('cache');

const backendConfig = `pid /tmp/backend.pid;
events { worker_connections 64; }
http {
    client_body_temp_path /tmp/c;
    proxy_temp_path /tmp/p;
    fastcgi_temp_path /tmp/f;
    uwsgi_temp_path /tmp/u;
    scgi_temp_path /tmp/s;
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
        location = /vary-encoding {
            add_header Vary "Accept-Encoding" always;
            return 200 "vary-encoding:$msec\\n";
        }
        location = /vary-cookie {
            add_header Vary "Cookie" always;
            return 200 "vary-cookie:$msec\\n";
        }
        location / {
            return 200 "public:$msec\\n";
        }
    }
}
`;

// The backend answers with its clock, so two equal bodies mean the second one came from the cache.
async function body(port, path, options = {}) {
  const response = await request({ port, path, ...options });
  assert(response.status === 200, `${path} returned ${response.status}`);

  return response.body.toString('utf8');
}

async function isCached(port, path, options = {}) {
  const first = await body(port, path, options);
  await sleep(1100);
  const second = await body(port, path, options);

  return first === second;
}

await runSmoke(smoke, async () => {
  smoke.createNetwork();
  smoke.startNginx({ containerName: 'backend', config: backendConfig, alias: 'backend' });
  const edge = smoke.startNginx({
    containerName: 'edge',
    config: generateConfig({
      ...defaultsFor('proxy', 'container'),
      serverName: 'localhost',
      upstreams: [{ address: 'backend:8081', backup: false }],
      proxyCache: true
    }),
    publish: [8080]
  });
  const port = await smoke.port(edge, 8080);
  await smoke.waitFor({ port, path: '/healthz' }, 204, 'cache edge');

  assert(await isCached(port, '/public'), 'a public GET was not cached');
  assert(await isCached(port, '/vary-encoding', { headers: { 'Accept-Encoding': 'gzip' } }), 'Vary: Accept-Encoding stopped the cache');
  for (const path of ['/private', '/no-store', '/cookie', '/vary-cookie']) {
    assert(!(await isCached(port, path)), `${path} was cached despite the privacy rules`);
  }

  assert(!(await isCached(port, '/public', { headers: { Authorization: 'Bearer secret' } })), 'an authorized response was cached');
  assert(!(await isCached(port, '/public', { headers: { Cookie: 'session=abc' } })), 'a response to a cookie request was cached');
  assert(!(await isCached(port, '/public', { method: 'POST' })), 'a POST response was cached');

  process.stdout.write('PASS proxy cache stores public responses and skips private, cookie, authorization, and POST traffic\n');
});
