#!/usr/bin/env node

// Runs generated proxy configs in front of a small echo backend and checks forwarding identity,
// connection reuse, WebSocket scoping, failover, and real-IP spoofing protection.
import http from 'node:http';
import net from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { generateConfig } from '../lib/render.ts';
import { defaultsFor } from '../lib/options.ts';
import { assert, countHeader, createSmoke, echoBackendConfig, parseEcho, request, runSmoke, sleep, webSocketEcho } from './smoke-kit.mjs';

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

  // The webroot that certbot would write to. A token file there must stay reachable next to /ws/ and /events/.
  const webroot = join(smoke.workdir, 'acme-challenge');
  mkdirSync(join(webroot, '.well-known', 'acme-challenge'), { recursive: true });
  writeFileSync(join(webroot, '.well-known', 'acme-challenge', 'token-1'), 'challenge-ok', 'utf8');
  const single = smoke.startNginx({
    containerName: 'single',
    config: proxyConfig({ upstreams: [{ address: 'backend:8081', backup: false }], websocketPath: '/ws/', streamingPath: '/events/' }),
    mounts: [[webroot, '/var/cache/nginx/acme-challenge']],
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

  // Review 1: the challenge folder is served from the webroot, not proxied, even with WebSocket and streaming paths set.
  const challenge = await request({ port: singlePort, host: 'example.com', path: '/.well-known/acme-challenge/token-1' });
  assert(challenge.status === 200 && challenge.body.toString('utf8') === 'challenge-ok', `the ACME challenge was not served from the webroot: ${challenge.status} ${challenge.body.toString('utf8').slice(0, 60)}`);
  assert((await request({ port: singlePort, host: 'example.com', path: '/.well-known/acme-challenge/missing' })).status === 404, 'a missing token must be a 404 from NGINX, not a backend answer');

  // Review 2: dotfiles under the WebSocket and streaming paths are denied at the edge and never reach the backend.
  for (const path of ['/ws/.git/config', '/events/.env', '/ws/a/.hidden']) {
    const denied = await request({ port: singlePort, host: 'example.com', path });
    assert(denied.status === 403, `${path} returned ${denied.status} instead of 403`);
    assert(!denied.body.toString('utf8').includes('host='), `${path} reached the backend`);
  }

  // A5/B2: the health check has no Content-Length and one copy of each security header.
  const health = await request({ port: singlePort, path: '/healthz', host: 'example.com' });
  assert(health.status === 204 && !('content-length' in health.headers), 'healthz sent Content-Length');
  for (const header of ['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Content-Security-Policy']) {
    assert(countHeader(health, header) === 1, `${header} appears ${countHeader(health, header)} times on /healthz`);
  }

  // Review 8: a real WebSocket through the WebSocket path: handshake (101) and an echoed frame.
  const script = new URL('./ws-echo-server.mjs', import.meta.url).pathname;
  smoke.startContainer('wsbackend', [
    '--network-alias', 'wsbackend', '--mount', `type=bind,src=${script},dst=/app/server.mjs,readonly`,
    'node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1', 'node', '/app/server.mjs'
  ]);
  const websocketEdge = smoke.startNginx({
    containerName: 'edge-websocket',
    config: proxyConfig({ upstreams: [{ address: 'wsbackend:8082', backup: false }], websocketPath: '/ws/' }),
    publish: [8080]
  });
  const websocketPort = await smoke.port(websocketEdge, 8080);
  await smoke.waitFor({ port: websocketPort, path: '/healthz', host: 'example.com' }, 204, 'WebSocket edge');
  let handshake = { statusLine: '', echoed: '' };
  for (let attempt = 0; attempt < 50 && handshake.echoed === ''; attempt += 1) {
    handshake = await webSocketEcho({ port: websocketPort, path: '/ws/chat', host: 'example.com', text: 'hello through nginx' }).catch(() => handshake);
    if (handshake.echoed === '') {
      await sleep(200);
    }
  }

  assert(handshake.statusLine.includes(' 101 '), `no 101 handshake through the WebSocket path: ${handshake.statusLine}`);
  assert(handshake.echoed === 'echo:hello through nginx', `the WebSocket frame was not echoed through NGINX: ${handshake.echoed}`);
  const normal = await request({ port: websocketPort, host: 'example.com', path: '/ws/plain' });
  assert(normal.status === 200 && normal.body.toString('utf8') === 'plain:/ws/plain', 'a normal request to the WebSocket path no longer reaches the backend');
  const outside = await webSocketEcho({ port: websocketPort, path: '/chat', host: 'example.com' });
  assert(!outside.statusLine.includes(' 101 '), 'a WebSocket handshake outside the WebSocket path was upgraded');

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
            set $edge $http_x_test_edge;
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
      publicHttpsPort: 8001,
      wwwRedirect: 'to-apex'
    }),
    publish: [8080]
  });
  const standardPorts = smoke.startNginx({
    containerName: 'edge-standard',
    alias: 'edge-standard',
    config: proxyConfig({
      upstreams: [{ address: 'backend:8081', backup: false }],
      realIp: 'custom',
      trustedProxies: [`${cdnAddress}/32`],
      wwwRedirect: 'to-apex'
    }),
    publish: [8080]
  });
  const standardPort = await smoke.port(standardPorts, 8080);
  await smoke.waitFor({ port: standardPort, path: '/healthz', host: 'example.com' }, 204, 'standard-ports edge');
  const trustedPort = await smoke.port(trusted, 8080);
  const cdnPort = await smoke.port(cdn, 8090);
  await smoke.waitFor({ port: trustedPort, path: '/healthz', host: 'example.com' }, 204, 'trusted edge');
  await smoke.waitFor({ port: cdnPort, path: '/healthz', host: 'example.com', headers: { 'X-Test-Edge': 'edge-trusted' } }, 204, 'proxy in front');

  const viaProxy = (await echo(cdnPort, { headers: { 'X-Test-Proto': 'https', 'X-Test-Edge': 'edge-trusted' } })).fields;
  assert(viaProxy.xff === '203.0.113.9', `a trusted proxy could not set the client IP: ${viaProxy.xff}`);
  assert(viaProxy.proto === 'https' && viaProxy.port === '8001', `trusted scheme was not used: ${viaProxy.proto} ${viaProxy.port}`);
  const viaProxyHttp = (await echo(cdnPort, { headers: { 'X-Test-Proto': 'http', 'X-Test-Edge': 'edge-trusted' } })).fields;
  assert(viaProxyHttp.proto === 'http' && viaProxyHttp.port === '8000', `trusted http scheme was not used: ${viaProxyHttp.proto} ${viaProxyHttp.port}`);
  const malformed = (await echo(cdnPort, { headers: { 'X-Test-Proto': 'ftp, https', 'X-Test-Edge': 'edge-trusted' } })).fields;
  assert(malformed.proto === 'http' && malformed.port === '8000', `malformed scheme was not ignored: ${malformed.proto} ${malformed.port}`);

  const direct = (await echo(trustedPort, { headers: { 'X-Forwarded-For': '203.0.113.9', 'X-Forwarded-Proto': 'https' } })).fields;
  assert(direct.xff !== '203.0.113.9' && direct.xff !== '', `an untrusted sender set the client IP: ${direct.xff}`);
  assert(direct.proto === 'http' && direct.port === '8000', `an untrusted sender set the scheme: ${direct.proto} ${direct.port}`);

  // R21: exact redirect Locations from the alias name (www.example.com) in every scheme and port case.
  async function aliasLocation(port, headers) {
    const response = await request({ port, host: 'www.example.com', path: '/x?y=1', headers });
    assert(response.status === 301, `alias redirect returned ${response.status}`);

    return response.headers.location;
  }

  const via = (proto, edge) => ({ 'X-Test-Proto': proto, 'X-Test-Edge': edge });
  const expectations = [
    ['trusted TLS proxy, public ports 8000/8001', cdnPort, via('https', 'edge-trusted'), 'https://example.com:8001/x?y=1'],
    ['trusted plain proxy, public ports 8000/8001', cdnPort, via('http', 'edge-trusted'), 'http://example.com:8000/x?y=1'],
    ['trusted proxy with a malformed scheme', cdnPort, via('ftp, https', 'edge-trusted'), 'http://example.com:8000/x?y=1'],
    ['untrusted sender claiming https', trustedPort, { 'X-Forwarded-Proto': 'https' }, 'http://example.com:8000/x?y=1'],
    ['direct HTTP, public ports 8000/8001', trustedPort, {}, 'http://example.com:8000/x?y=1'],
    ['trusted TLS proxy, default public ports', cdnPort, via('https', 'edge-standard'), 'https://example.com/x?y=1'],
    ['trusted plain proxy, default public ports', cdnPort, via('http', 'edge-standard'), 'http://example.com/x?y=1'],
    ['direct HTTP, default public ports', standardPort, {}, 'http://example.com/x?y=1']
  ];
  for (const [label, port, headers, expected] of expectations) {
    const actual = await aliasLocation(port, headers);
    assert(actual === expected, `${label}: Location is ${actual}, expected ${expected}`);
  }

  // R19: with the PROXY protocol the public port needs the PROXY header, but the loopback probe stays plain.
  const behindProtocol = smoke.startNginx({
    containerName: 'edge-protocol',
    config: generateConfig({
      ...defaultsFor('static', 'container'),
      serverName: 'localhost',
      realIp: 'custom',
      realIpHeader: 'proxy_protocol',
      trustedProxies: [`${cdnAddress}/32`]
    }),
    publish: [8080]
  });
  const protocolPort = await smoke.port(behindProtocol, 8080);
  let probe = '';
  for (let attempt = 0; attempt < 60 && !probe; attempt += 1) {
    const result = spawnSync('docker', ['exec', behindProtocol, 'wget', '--quiet', '--header=Host:localhost', '--output-document=/dev/null', 'http://127.0.0.1:8080/healthz'], { encoding: 'utf8' });
    probe = result.status === 0 ? 'ok' : '';
    if (!probe) {
      await sleep(200);
    }
  }

  assert(probe === 'ok', 'the Dockerfile health probe on 127.0.0.1 failed with the PROXY protocol on');
  let plainStatus = 0;
  try {
    plainStatus = (await request({ port: protocolPort, path: '/healthz', host: 'localhost' })).status;
  } catch {
    plainStatus = 0;
  }

  assert(plainStatus !== 204, 'a request without the PROXY header was accepted on the public listener');
  const proxied = await new Promise((resolve, reject) => {
    const socket = net.connect(protocolPort, '127.0.0.1');
    let data = '';
    socket.on('data', (chunk) => {
      data += chunk;
    });
    socket.on('error', reject);
    socket.on('close', () => resolve(data));
    socket.write('PROXY TCP4 203.0.113.5 10.0.0.1 1234 8080\r\nGET /healthz HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
  });
  assert(/^HTTP\/1\.1 204/.test(proxied), `a request with the PROXY header failed: ${proxied.slice(0, 80)}`);

  process.stdout.write('PASS proxy identity, upstream keepalive, WebSocket scope, healthz headers, failover, real-IP trust, alias redirect Locations, PROXY-protocol health probe, challenge folder, dotfiles under proxied paths, and a real WebSocket\n');
});

