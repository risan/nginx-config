#!/usr/bin/env node

// Proves DNS re-resolution: the upstream is a Docker network alias. The backend container is replaced,
// so the alias gets a new IP, and NGINX must reach the new backend without a reload.
import { spawnSync } from 'node:child_process';

import { generateConfig } from '../lib/render.ts';
import { defaultsFor } from '../lib/options.ts';
import { assert, createSmoke, request, runSmoke, sleep } from './smoke-kit.mjs';

const smoke = createSmoke('resolve');

const backendConfig = (name) => `pid /tmp/backend.pid;
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
        default_type text/plain;
        location / { return 200 "backend-${name}"; }
    }
}
`;

function containerAddress(container) {
  return smoke.docker(['inspect', '--format', `{{(index .NetworkSettings.Networks "${smoke.network}").IPAddress}}`, container]);
}

await runSmoke(smoke, async () => {
  smoke.createNetwork();
  const first = smoke.startNginx({ containerName: 'backend-a', config: backendConfig('a'), alias: 'backend' });
  // The generated resolver uses valid=30s. The test shortens it to 1s so the switch is visible within seconds.
  const generated = generateConfig({
    ...defaultsFor('proxy', 'container'),
    serverName: 'localhost',
    upstreams: [{ address: 'backend:8081', backup: false }]
  });
  assert(generated.includes('server backend:8081 resolve;') && generated.includes('zone backend 64k;') && generated.includes('resolver 127.0.0.11 valid=30s') && generated.includes('resolver_timeout 5s;'), 'the config does not re-resolve the backend name');
  const config = generated.replace('valid=30s', 'valid=1s');
  const edge = smoke.startNginx({ containerName: 'edge', config, publish: [8080] });
  const port = await smoke.port(edge, 8080);
  const firstAddress = containerAddress(first);

  const body = async () => {
    try {
      const response = await request({ port, path: '/', host: 'localhost' });

      return `${response.status}:${response.body.toString('utf8')}`;
    } catch (error) {
      return `error:${error.message}`;
    }
  };

  for (let attempt = 0; attempt < 100 && (await body()) !== '200:backend-a'; attempt += 1) {
    await sleep(100);
  }

  assert((await body()) === '200:backend-a', 'the first backend did not answer');

  // Replace the backend. Both share the alias for a moment, then the old one is removed.
  const second = smoke.startNginx({ containerName: 'backend-b', config: backendConfig('b'), alias: 'backend' });
  spawnSync('docker', ['rm', '-f', first], { stdio: 'ignore' });
  const secondAddress = containerAddress(second);
  assert(firstAddress !== secondAddress, `the replacement backend kept the address ${firstAddress}`);

  const started = Date.now();
  let result = '';
  while (Date.now() - started < 20000) {
    result = await body();
    if (result === '200:backend-b') {
      break;
    }

    await sleep(250);
  }

  assert(result === '200:backend-b', `NGINX did not switch to the new backend (${secondAddress}) within 20s without a reload; last answer: ${result}`);
  const reloads = smoke.docker(['logs', edge]);
  assert(!/signal process started|reconfiguring/.test(reloads), 'NGINX was reloaded during the test');

  process.stdout.write(`PASS NGINX re-resolved the backend name ${firstAddress} -> ${secondAddress} after ${((Date.now() - started) / 1000).toFixed(1)}s (resolver valid=1s), with no reload\n`);
});
