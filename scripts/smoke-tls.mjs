#!/usr/bin/env node

// Checks the generated HTTPS config: redirect to the public port, certificate use, HTTP/2,
// HSTS, TLS 1.2 and 1.3 resumption, early data, and rejection of unknown names.
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { connect as connectHttp2 } from 'node:http2';

import { generateConfig } from '../lib/render.ts';
import { defaultsFor } from '../lib/options.ts';
import { assert, countHeader, createSmoke, request, run, runSmoke } from './smoke-kit.mjs';

const smoke = createSmoke('tls');

function openssl(args, input = '') {
  const result = spawnSync('openssl', args, { encoding: 'utf8', input });

  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function http2Status(port) {
  return new Promise((resolve, reject) => {
    const client = connectHttp2(`https://127.0.0.1:${port}`, { rejectUnauthorized: false, servername: 'localhost' });
    const fail = (error) => {
      client.destroy();
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error('HTTP/2 request timed out')), 5000);
    client.once('error', fail);
    client.once('connect', () => {
      if (client.alpnProtocol !== 'h2') {
        fail(new Error(`expected ALPN h2, got ${client.alpnProtocol || 'none'}`));

        return;
      }

      const stream = client.request({ ':authority': 'localhost', ':path': '/healthz' });
      let status;
      stream.once('response', (headers) => {
        status = headers[':status'];
      });
      stream.once('error', fail);
      stream.once('end', () => {
        clearTimeout(timer);
        client.close();
        resolve(status);
      });
      stream.resume();
      stream.end();
    });
  });
}

await runSmoke(smoke, async () => {
  const certificates = join(smoke.workdir, 'tls');
  mkdirSync(certificates);
  run('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost',
    '-keyout', join(certificates, 'privkey.pem'), '-out', join(certificates, 'fullchain.pem')
  ]);
  // The fixture is disposable. Make the key readable by the image user (UID 101), as a real deployment must.
  chmodSync(join(certificates, 'privkey.pem'), 0o644);

  const config = generateConfig({
    ...defaultsFor('spa', 'container'),
    serverName: 'localhost',
    https: 'manual',
    certificatePath: '/tmp/nginx-config-tls/fullchain.pem',
    certificateKeyPath: '/tmp/nginx-config-tls/privkey.pem',
    hsts: 'host'
  });
  assert(!config.includes('ssl_early_data') && !config.includes('ssl_session_tickets'), 'defaults must not be restated');

  smoke.createNetwork();
  const edge = smoke.startNginx({ containerName: 'edge', config, mounts: [[certificates, '/tmp/nginx-config-tls']], publish: [8080, 8443] });
  const httpPort = await smoke.port(edge, 8080);
  const httpsPort = await smoke.port(edge, 8443);
  await smoke.waitFor({ port: httpsPort, path: '/healthz', tls: true }, 204, 'TLS edge');

  // A3: the redirect uses the public port (443), not the container's 8443.
  const redirect = await request({ port: httpPort, path: '/settings?tab=1' });
  assert(redirect.status === 308, `HTTP did not redirect: ${redirect.status}`);
  assert(redirect.headers.location === 'https://localhost/settings?tab=1', `redirect target is wrong: ${redirect.headers.location}`);
  assert(!('strict-transport-security' in redirect.headers), 'HSTS must not be sent over plain HTTP');

  const health = await request({ port: httpsPort, path: '/healthz', tls: true });
  assert(health.status === 204, 'HTTPS health endpoint failed');
  assert(countHeader(health, 'Strict-Transport-Security') === 1, 'HTTPS response must carry HSTS once');
  assert(health.headers['strict-transport-security'] === 'max-age=63072000', `unexpected HSTS: ${health.headers['strict-transport-security']}`);
  assert(!('alt-svc' in health.headers), 'Alt-Svc must be absent without HTTP/3');
  assert((await http2Status(httpsPort)) === 204, 'HTTP/2 health request failed');

  // Directory redirects stay relative, so a published port never leaks (B1).
  const slash = await request({ port: httpsPort, path: '/', tls: true });
  assert(slash.status === 200, `SPA index returned ${slash.status}`);

  function assertResumption(protocol, sessionPath) {
    const args = ['s_client', '-connect', `127.0.0.1:${httpsPort}`, '-servername', 'localhost', protocol, ...(sessionPath ? ['-sess_in', sessionPath] : ['-reconnect'])];
    const { status, output } = openssl(args);
    const label = protocol === '-tls1_2' ? 'TLSv1.2' : 'TLSv1.3';
    assert(status === 0 && new RegExp(`Reused, ${label.replace('.', '\\.')}`).test(output), `${label} session resumption failed:\n${output}`);
  }

  assertResumption('-tls1_2');
  const session = join(smoke.workdir, 'tls13-session.pem');
  const initial = openssl(['s_client', '-connect', `127.0.0.1:${httpsPort}`, '-servername', 'localhost', '-tls1_3', '-sess_out', session, '-quiet']);
  assert(initial.status === 0, `TLSv1.3 initial session failed:\n${initial.output}`);
  assertResumption('-tls1_3', session);

  // Early data is off by default in NGINX, so a ticket must not allow 0-RTT.
  const earlyPath = join(smoke.workdir, 'early-data.txt');
  writeFileSync(earlyPath, 'GET /healthz HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n', 'utf8');
  const early = openssl(['s_client', '-connect', `127.0.0.1:${httpsPort}`, '-servername', 'localhost', '-tls1_3', '-sess_in', session, '-early_data', earlyPath]);
  assert(early.status === 0 && !/Early data was accepted/i.test(early.output), `TLS early data was accepted or the probe failed:\n${early.output}`);

  for (const protocol of ['-tls1_2', '-tls1_3']) {
    const unknown = openssl(['s_client', '-connect', `127.0.0.1:${httpsPort}`, '-servername', 'unknown.example', protocol, '-brief']);
    assert(unknown.status !== 0, `unknown SNI was accepted for ${protocol}:\n${unknown.output}`);
  }

  // R21: exact Location values, from the canonical name and the alias, over HTTP and HTTPS.
  for (const publicHttpsPort of [443, 9443]) {
    const aliasConfig = generateConfig({
      ...defaultsFor('static', 'container'),
      serverName: 'example.com',
      wwwRedirect: 'to-apex',
      https: 'manual',
      certificatePath: '/tmp/nginx-config-tls/fullchain.pem',
      certificateKeyPath: '/tmp/nginx-config-tls/privkey.pem',
      publicHttpsPort
    });
    const aliasEdge = smoke.startNginx({ containerName: `alias-${publicHttpsPort}`, config: aliasConfig, mounts: [[certificates, '/tmp/nginx-config-tls']], publish: [8080, 8443] });
    const aliasHttp = await smoke.port(aliasEdge, 8080);
    const aliasHttps = await smoke.port(aliasEdge, 8443);
    await smoke.waitFor({ port: aliasHttps, path: '/healthz', host: 'example.com', tls: true }, 204, 'alias TLS edge');
    const target = `https://example.com${publicHttpsPort === 443 ? '' : `:${publicHttpsPort}`}/p?q=1`;
    for (const host of ['example.com', 'www.example.com']) {
      const overHttp = await request({ port: aliasHttp, host, path: '/p?q=1' });
      assert(overHttp.status === 308 && overHttp.headers.location === target, `HTTP ${host}: ${overHttp.status} ${overHttp.headers.location}, expected ${target}`);
    }

    const overHttps = await request({ port: aliasHttps, host: 'www.example.com', path: '/p?q=1', tls: true });
    assert(overHttps.status === 301 && overHttps.headers.location === target, `HTTPS alias: ${overHttps.status} ${overHttps.headers.location}, expected ${target}`);
  }

  process.stdout.write('PASS TLS redirect to the public port, certificate, HTTP/2, HSTS, TLS 1.2/1.3 resumption, early data, unknown-SNI, and alias redirect Location checks\n');
});
