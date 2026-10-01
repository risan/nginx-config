#!/usr/bin/env node

// Runs generated proxy configs in front of a small echo backend and checks forwarding identity,
// connection reuse, WebSocket scoping, failover, and real-IP spoofing protection.
import http from 'node:http';

import { generateConfig } from '../lib/render.ts';
import { defaultsFor } from '../lib/options.ts';
import { assert, countHeader, createSmoke, echoBackendConfig, parseEcho, request, runSmoke } from './smoke-kit.mjs';

const smoke = createSmoke('proxy');

function proxyConfig(overrides) {
  return generateConfig({ ...defaultsFor('proxy', 'container'), serverName: 'example.com', ...overrides });
}

async function echo(port, options = {}) {
  const response = await request({ port, host: 'example.com', ...options });
  assert(response.status === 200, `echo returned ${response.status}`);

  return { response, fields: parseEcho(response.body) };
}

// One client connection for a series of requests. NGINX runs several workers and each keeps its own
// upstream connections, so a series must stay on one client connection to show upstream reuse.
const clientConnection = () => new http.Agent({ keepAlive: true, maxSockets: 1 });

await runSmoke(smoke, async () => {
  smoke.createNetwork();
  smoke.startNginx({ containerName: 'backend', config: echoBackendConfig(), alias: 'backend' });

  const single = smoke.startNginx({
    containerName: 'single',
    config: proxyConfig({ upstreams: [{ address: 'backend:8081', backup: false }], websocketPath: '/ws/' }),
    publish: [8080]
  });
  const failover = smoke.startNginx({
    containerName: 'failover',
    config: proxyConfig({ upstreams: [{ address: '127.0.0.1:9', backup: false }, { address: 'backend:8081', backup: false }] }),
    publish: [8080]
  });
  const singlePort = await smoke.port(single, 8080);
  const failoverPort = await smoke.port(failover, 8080);
  await smoke.waitFor({ port: singlePort, path: '/healthz', host: 'example.com' }, 204, 'single edge');
  await smoke.waitFor({ port: failoverPort, path: '/healthz', host: 'example.com' }, 204, 'failover edge');

  // Identity headers: spoofed values never reach the backend, and the request ID is generated here.
  const spoofed = {
    'X-Forwarded-For': 'attacker.example',
    'X-Real-IP': 'attacker.example',
    'X-Forwarded-Proto': 'https',
    Forwarded: 'for=attacker.example;proto=https',
    'X-Request-ID': 'attacker-chosen'
  };
  const { fields: identity } = await echo(singlePort, { headers: spoofed });
  assert(identity.host === 'example.com', `Host was not normalized: ${identity.host}`);
  assert(!JSON.stringify(identity).includes('attacker'), `spoofed identity reached the backend: ${JSON.stringify(identity)}`);
  assert(identity.proto === 'http' && identity.port === '80', `scheme and port were not normalized: ${identity.proto} ${identity.port}`);
  assert(/^[0-9a-f]{32}$/.test(identity.rid), `request ID was not generated: ${identity.rid}`);

  // A1: normal requests send no Connection header, and NGINX reuses upstream connections.
  const series = clientConnection();
  const first = (await echo(singlePort, { agent: series })).fields;
  const second = (await echo(singlePort, { agent: series })).fields;
  const third = (await echo(singlePort, { agent: series })).fields;
  series.destroy();
  assert(first.connection === '', `Connection reached the backend: "${first.connection}"`);
  assert(first.conn === second.conn && second.conn === third.conn, `upstream connection was not reused: ${first.conn} ${second.conn} ${third.conn}`);
  assert(Number(third.conn_requests) === Number(first.conn_requests) + 2, 'upstream request counter did not advance on one connection');

  // The WebSocket path keeps normal-request keepalive and upgrades only real WebSocket requests.
  const wsSeries = clientConnection();
  const plainWs = (await echo(singlePort, { path: '/ws/plain', agent: wsSeries })).fields;
  const plainWs2 = (await echo(singlePort, { path: '/ws/plain', agent: wsSeries })).fields;
  wsSeries.destroy();
  assert(plainWs.connection === '' && plainWs.upgrade === '', 'a normal request to the WebSocket path got upgrade headers');
  assert(plainWs.conn === plainWs2.conn, 'a normal request to the WebSocket path lost upstream keepalive');
  const upgraded = (await echo(singlePort, { path: '/ws/chat', headers: { Connection: 'Upgrade', Upgrade: 'websocket' }, agent: false })).fields;
  assert(upgraded.upgrade === 'websocket' && upgraded.connection === 'upgrade', `WebSocket upgrade was not forwarded: ${upgraded.upgrade}/${upgraded.connection}`);
  const hijack = (await echo(singlePort, { path: '/ws/chat', headers: { Connection: 'Upgrade', Upgrade: 'h2c' }, agent: false })).fields;
  assert(hijack.upgrade === '' && hijack.connection === '', 'a non-WebSocket Upgrade value was forwarded');
  const elsewhere = (await echo(singlePort, { path: '/api', headers: { Connection: 'Upgrade', Upgrade: 'websocket' }, agent: false })).fields;
  assert(elsewhere.upgrade === '' && elsewhere.connection === '', 'an Upgrade header reached the backend outside the WebSocket path');

  // A5/B2: the health check has no Content-Length and one copy of each security header.
  const health = await request({ port: singlePort, path: '/healthz', host: 'example.com' });
  assert(health.status === 204 && !('content-length' in health.headers), 'healthz sent Content-Length');
  for (const header of ['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Content-Security-Policy']) {
    assert(countHeader(health, header) === 1, `${header} appears ${countHeader(health, header)} times on /healthz`);
  }

  // Failover: one dead server and one healthy server, so every request still succeeds.
  for (let index = 0; index < 8; index += 1) {
    const result = await request({ port: failoverPort, path: `/failover/${index}`, host: 'example.com' });
    assert(result.status === 200, `request ${index} failed with ${result.status} although one backend is healthy`);
  }

  // Real IP: only a trusted proxy may set the client address and scheme.
  const cdn = smoke.startNginx({
    containerName: 'cdn',
    config: `pid /tmp/cdn.pid;
events { worker_connections 64; }
http {
    client_body_temp_path /tmp/c;
    proxy_temp_path /tmp/p;
    fastcgi_temp_path /tmp/f;
    uwsgi_temp_path /tmp/u;
    scgi_temp_path /tmp/s;
    access_log off;
    resolver 127.0.0.11;
    server {
        listen 8090;
        location / {
            set $edge edge-trusted;
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-For 203.0.113.9;
            proxy_set_header X-Forwarded-Proto $http_x_test_proto;
            proxy_pass http://$edge:8080;
        }
    }
}
`,
    publish: [8090]
  });
  const cdnAddress = smoke.docker(['inspect', '--format', `{{(index .NetworkSettings.Networks "${smoke.network}").IPAddress}}`, cdn]);
  assert(/^\d+\.\d+\.\d+\.\d+$/.test(cdnAddress), `could not find the proxy address: ${cdnAddress}`);

  const trusted = smoke.startNginx({
    containerName: 'edge-trusted',
    alias: 'edge-trusted',
    config: proxyConfig({
      upstreams: [{ address: 'backend:8081', backup: false }],
      realIp: 'custom',
      trustedProxies: [`${cdnAddress}/32`],
      realIpHeader: 'X-Forwarded-For',
      publicHttpPort: 8000,
      publicHttpsPort: 8001
    }),
    publish: [8080]
  });
  const trustedPort = await smoke.port(trusted, 8080);
  const cdnPort = await smoke.port(cdn, 8090);
  await smoke.waitFor({ port: trustedPort, path: '/healthz', host: 'example.com' }, 204, 'trusted edge');
  await smoke.waitFor({ port: cdnPort, path: '/healthz', host: 'example.com' }, 204, 'proxy in front');

  const viaProxy = (await echo(cdnPort, { headers: { 'X-Test-Proto': 'https' } })).fields;
  assert(viaProxy.xff === '203.0.113.9', `a trusted proxy could not set the client IP: ${viaProxy.xff}`);
  assert(viaProxy.proto === 'https' && viaProxy.port === '8001', `trusted scheme was not used: ${viaProxy.proto} ${viaProxy.port}`);
  const viaProxyHttp = (await echo(cdnPort, { headers: { 'X-Test-Proto': 'http' } })).fields;
  assert(viaProxyHttp.proto === 'http' && viaProxyHttp.port === '8000', `trusted http scheme was not used: ${viaProxyHttp.proto} ${viaProxyHttp.port}`);
  const malformed = (await echo(cdnPort, { headers: { 'X-Test-Proto': 'ftp, https' } })).fields;
  assert(malformed.proto === 'http' && malformed.port === '8000', `malformed scheme was not ignored: ${malformed.proto} ${malformed.port}`);

  const direct = (await echo(trustedPort, { headers: { 'X-Forwarded-For': '203.0.113.9', 'X-Forwarded-Proto': 'https' } })).fields;
  assert(direct.xff !== '203.0.113.9' && direct.xff !== '', `an untrusted sender set the client IP: ${direct.xff}`);
  assert(direct.proto === 'http' && direct.port === '8000', `an untrusted sender set the scheme: ${direct.proto} ${direct.port}`);

  process.stdout.write('PASS proxy identity, upstream keepalive, WebSocket scope, healthz headers, failover, and real-IP trust\n');
});

